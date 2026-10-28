import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { randomUUID } from 'crypto';
import { assertAnyCapability, ScopeError } from '../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../middlewares/tenant-scope';
import { ESCALATE_CAPS } from '../approvals/caps';
import { syncTickets, toApiTicket, keyFor, CATEGORIES } from './lib';
import { notifyManagers } from '../notifications/emit';

const pg = (req: TenantScopedRequest) => req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;
// Any provisioned tenant member can see and raise tickets — a Safety App must
// let anyone report. Deciding a ticket (approve/reject) is gated separately.
const VIEW_CAPS = ESCALATE_CAPS;
const PRIORITIES = ['low', 'normal', 'high', 'critical'];

// GET /app/tickets — the unified Safety ticket board. Materialises tickets from
// the tenant's records (POs, store sales, escalations), then lists them newest
// first. Optional ?category= / ?escalated=true filters.
export async function GET(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertAnyCapability(scope, VIEW_CAPS);
    const db = pg(req);
    await syncTickets(db, scope);

    let q = db('tickets').where({ tenant_id: scope.tenantId });
    const category = (req.query?.category as string) || '';
    if (category && CATEGORIES.includes(category as any)) q = q.andWhere({ category });
    if (String(req.query?.escalated) === 'true') q = q.andWhere({ escalated: true });
    const rows = await q.orderBy('created_at', 'desc');
    // Strip heavy photo data URLs from the list; keep a hasImage flag. The full
    // image is returned by the single-ticket read (GET /app/tickets/:id).
    const tickets = rows.map((t: any) => {
      const api = toApiTicket(t);
      if (api.metadata && api.metadata.imageUrl) api.metadata = { ...api.metadata, imageUrl: null, hasImage: true };
      return api;
    });
    res.json({ tickets });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'tickets_read_failed', message: (error as Error).message });
  }
}

// POST /app/tickets — raise a ticket that has no source record: a safety
// incident, a hazard report or any manual ticket. Anyone in the tenant may file.
export async function POST(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertAnyCapability(scope, VIEW_CAPS);
    const b = (req.body ?? {}) as Record<string, any>;

    const category = CATEGORIES.includes(b.category) ? b.category : 'safety_incident';
    const subject = (b.subject ?? '').toString().trim().slice(0, 300);
    if (!subject) throw new ScopeError(400, 'subject_required', 'A short summary of the ticket is required.');
    const priority = PRIORITIES.includes(b.priority) ? b.priority : 'normal';

    const db = pg(req);
    const row = await db('tickets').where({ tenant_id: scope.tenantId }).max('seq as m').first();
    const seq = Number(row?.m ?? 0) + 1;
    const id = randomUUID();
    const now = new Date().toISOString();
    await db('tickets').insert({
      id, tenant_id: scope.tenantId, site_id: scope.siteId ?? null,
      seq, common_key: keyFor(category, seq),
      category, trigger: (b.trigger ?? 'manual').toString().slice(0, 40),
      source_type: category === 'safety_incident' ? 'safety_incident' : 'manual',
      source_id: null, reference: null, subject,
      status: 'open', priority,
      value: b.value != null && !isNaN(Number(b.value)) ? Number(b.value) : null,
      currency: (b.currency ?? 'ZAR').toString().slice(0, 8),
      created_by: scope.userId ?? null,
      metadata: JSON.stringify({
        location: (b.location ?? '').toString().slice(0, 200) || null,
        department: (b.department ?? '').toString().slice(0, 200) || null,
        // A safety report may carry a photo (downscaled data URL) as evidence.
        imageUrl: typeof b.imageUrl === 'string' && b.imageUrl.startsWith('data:image/') ? b.imageUrl.slice(0, 4_000_000) : null,
        reportedBy: (b.authorName ?? '').toString().slice(0, 200) || null,
      }),
      created_at: now, updated_at: now,
    });

    // An opening note carries the reporter's description.
    const note = (b.note ?? '').toString().trim().slice(0, 4000);
    if (note) {
      await db('ticket_notes').insert({
        id: randomUUID(), ticket_id: id, tenant_id: scope.tenantId, body: note,
        author_user_id: scope.userId ?? null, author_name: (b.authorName ?? '').toString().slice(0, 200) || null,
        created_at: now, updated_at: now,
      });
    }

    // A safety report is sent to the managers for acknowledgment (fan-out bell).
    if (category === 'safety_incident') {
      await notifyManagers(db, {
        tenantId: scope.tenantId, siteId: scope.siteId ?? null,
        type: 'safety_report', title: `Safety report: ${subject}`, body: note || subject,
        severity: priority === 'critical' ? 'critical' : priority === 'high' ? 'warning' : 'info',
        linkRole: 'REPORT_SAFETY', linkId: id, createdBy: scope.userId ?? null, excludeUserId: scope.userId ?? null,
        metadata: { commonKey: keyFor(category, seq) },
      });
    }

    const created = await db('tickets').where({ id }).first();
    res.status(201).json({ ticket: toApiTicket(created) });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'ticket_create_failed', message: (error as Error).message });
  }
}
