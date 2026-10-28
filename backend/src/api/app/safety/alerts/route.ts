import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { randomUUID } from 'crypto';
import { assertAnyCapability, ScopeError } from '../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../middlewares/tenant-scope';
import { getServiceClient } from '../../../../security/supabase-scope-resolver';
import { sendEmail, isEmailEnabled } from '../../../../lib/agentmail';
import { keyFor } from '../../tickets/lib';
import { notifyAllStaff } from '../../notifications/emit';

const pg = (req: TenantScopedRequest) => req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;
const now = () => new Date().toISOString();
// A safety alert is broadcast BY a manager (or platform / tenant admin).
const SEND_CAPS = ['ppe.approve.tier1', 'ppe.approve.tier2', 'platform.manage', 'tenant.config.manage'];
const SEVERITY = ['info', 'warning', 'critical'];
const priorityFor = (s: string) => (s === 'critical' ? 'critical' : s === 'warning' ? 'high' : 'normal');
const isEmail = (v: unknown): v is string => typeof v === 'string' && /.+@.+\..+/.test(v.trim());

// Resolve every active member's email (service-role) so the alert reaches staff.
async function resolveStaffEmails(db: any, tenantId: string): Promise<string[]> {
  const { data, error } = await db.from('memberships').select('user_id, status').eq('tenant_id', tenantId).eq('status', 'active');
  if (error) return [];
  const emails = new Set<string>();
  for (const m of data ?? []) {
    if (!m.user_id) continue;
    try { const { data: u } = await db.auth.admin.getUserById(m.user_id); if (isEmail(u?.user?.email)) emails.add(String(u.user.email).trim()); } catch { /* skip */ }
  }
  return [...emails];
}

// POST /app/safety/alerts — a manager broadcasts a safety alert to staff and the
// affected departments/plants. Records the alert as a safety_alert ticket (so the
// ticket system manages it and every role sees the feed) and, when email is
// configured, notifies staff. The alert is a notification — no approval flow.
export async function POST(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertAnyCapability(scope, SEND_CAPS);
    const b = (req.body ?? {}) as Record<string, any>;

    const title = (b.title ?? '').toString().trim().slice(0, 200);
    const message = (b.message ?? '').toString().trim().slice(0, 4000);
    if (!title) throw new ScopeError(400, 'title_required', 'An alert title is required.');
    if (!message) throw new ScopeError(400, 'message_required', 'An alert message is required.');
    const severity = SEVERITY.includes(b.severity) ? b.severity : 'warning';
    const plants = Array.isArray(b.plants) ? b.plants.map((p: any) => String(p).slice(0, 120)).slice(0, 50) : [];
    const departments = Array.isArray(b.departments) ? b.departments.map((d: any) => String(d).slice(0, 120)).slice(0, 50) : [];
    const audience = plants.length || departments.length
      ? [...plants, ...departments].join(', ')
      : 'All staff';

    const db = pg(req);
    const row = await db('tickets').where({ tenant_id: scope.tenantId }).max('seq as m').first();
    const seq = Number(row?.m ?? 0) + 1;
    const id = randomUUID();
    const sentByName = (b.sentByName ?? '').toString().slice(0, 200) || null;
    await db('tickets').insert({
      id, tenant_id: scope.tenantId, site_id: scope.siteId ?? null,
      seq, common_key: keyFor('safety_alert', seq),
      category: 'safety_alert', trigger: 'manager_alert',
      source_type: 'safety_alert', source_id: null, reference: null,
      subject: title, status: 'open', priority: priorityFor(severity),
      currency: 'ZAR',
      created_by: scope.userId ?? null,
      metadata: JSON.stringify({ message, severity, plants, departments, audience, sentBy: sentByName }),
      created_at: now(), updated_at: now(),
    });

    // In-app fan-out: one notification per active staff member (the bell).
    const notified = await notifyAllStaff(db, {
      tenantId: scope.tenantId, siteId: scope.siteId ?? null,
      type: 'safety_alert', title: `Safety alert: ${title}`, body: message,
      severity: severity === 'critical' ? 'critical' : severity === 'warning' ? 'warning' : 'info',
      linkRole: 'SAFETY_ALERTS', linkId: id, createdBy: scope.userId ?? null, excludeUserId: scope.userId ?? null,
      metadata: { audience, commonKey: keyFor('safety_alert', seq) },
    });
    void notified;

    // Best-effort broadcast email to active staff (env-gated).
    let emailed = false; let recipients = 0;
    if (isEmailEnabled()) {
      try {
        const service = getServiceClient();
        const to = await resolveStaffEmails(service, scope.tenantId);
        recipients = to.length;
        if (to.length) {
          const colour = severity === 'critical' ? '#c0392b' : severity === 'warning' ? '#e67e22' : '#2d7ff9';
          const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px">
            <div style="background:${colour};color:#fff;padding:14px 18px;border-radius:8px 8px 0 0;font-weight:700">⚠ Safety Alert · ${severity.toUpperCase()}</div>
            <div style="border:1px solid #e5e7eb;border-top:0;padding:18px;border-radius:0 0 8px 8px">
              <h2 style="margin:0 0 8px;font-size:18px">${title.replace(/</g, '&lt;')}</h2>
              <p style="white-space:pre-wrap;margin:0 0 12px;color:#111">${message.replace(/</g, '&lt;')}</p>
              <p style="margin:0;color:#555;font-size:13px"><strong>Affects:</strong> ${audience.replace(/</g, '&lt;')}</p>
            </div></div>`;
          const text = `SAFETY ALERT (${severity.toUpperCase()})\n\n${title}\n\n${message}\n\nAffects: ${audience}`;
          const result = await sendEmail({ to, subject: `⚠ Safety Alert: ${title}`, html, text, labels: ['safety_alert'] });
          emailed = !!result.sent;
        }
      } catch { /* email is best-effort — the in-app alert feed still stands */ }
    }

    const created = await db('tickets').where({ id }).first();
    res.status(201).json({ alert: { id, commonKey: created.common_key, title, severity, audience }, emailed, recipients });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'safety_alert_failed', message: (error as Error).message });
  }
}
