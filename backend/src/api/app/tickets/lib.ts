import { randomUUID } from 'crypto';
import { getServiceClient } from '../../../security/supabase-scope-resolver';
import type { TenantScope } from '../../../security/tenant-scope';

// The ticket layer that makes this a Safety App: every event (PPE request,
// purchase order, store sale / invoice, escalation, safety incident) is a
// ticket with a human common key, a category + trigger, a flow status, an
// escalation line and a notes thread. Tickets in the medusa Postgres schema
// wrap the source record via a unique (tenant, source_type, source_id) key so
// materialisation from existing records is idempotent.

export const CATEGORIES = ['ppe_request', 'purchase_order', 'invoice', 'store_sale', 'escalation', 'safety_incident', 'safety_alert'] as const;
export type Category = (typeof CATEGORIES)[number];

// Common-key prefix per category → SL-PO-00042, SL-SAF-00007…
const PREFIX: Record<string, string> = {
  ppe_request: 'REQ',
  purchase_order: 'PO',
  invoice: 'INV',
  store_sale: 'SALE',
  escalation: 'ESC',
  safety_incident: 'SAF',
  safety_alert: 'ALERT',
  manual: 'TKT',
};

export const keyFor = (category: string, seq: number): string =>
  `SL-${PREFIX[category] ?? 'TKT'}-${String(seq).padStart(5, '0')}`;

// A PO status maps straight onto the ticket flow; a raw 'draft' reads better as
// 'open' on a ticket board.
const poStatus = (s: string): string => (s === 'draft' ? 'open' : s || 'open');
const storeStatus = (s: string): string =>
  ({ pending: 'open', paid: 'in_progress', collected: 'resolved', failed: 'cancelled' } as Record<string, string>)[s] || 'open';

type Db = any;

async function nextSeq(db: Db, tenantId: string): Promise<number> {
  const row = await db('tickets').where({ tenant_id: tenantId }).max('seq as m').first();
  return Number(row?.m ?? 0) + 1;
}

// Insert a ticket for a source record if one does not already exist (idempotent
// on the unique (tenant, source_type, source_id) index). Returns nothing — the
// caller re-reads. Best-effort: a race that violates the unique index is fine.
async function ensureTicket(db: Db, tenantId: string, fields: Record<string, any>): Promise<void> {
  const seq = await nextSeq(db, tenantId);
  const now = new Date().toISOString();
  try {
    await db('tickets').insert({
      id: randomUUID(),
      tenant_id: tenantId,
      seq,
      common_key: keyFor(fields.category, seq),
      created_at: now,
      updated_at: now,
      ...fields,
    });
  } catch { /* unique (tenant, source) — already materialised by a concurrent read */ }
}

// Materialise/refresh tickets for the tenant's server-side records, then overlay
// the escalation line from the audit trail. Cheap enough to run on list reads;
// never throws (a Safety board must still render if one source is unavailable).
export async function syncTickets(db: Db, scope: TenantScope): Promise<void> {
  const tenantId = scope.tenantId;

  // Existing tickets → maps by source and by reference, plus current max seq.
  const existing = await db('tickets').where({ tenant_id: tenantId })
    .select('id', 'source_type', 'source_id', 'reference', 'status', 'value', 'escalated');
  const bySource = new Map<string, any>();
  const byReference = new Map<string, any>();
  for (const t of existing) {
    if (t.source_id) bySource.set(`${t.source_type}:${t.source_id}`, t);
    if (t.reference) byReference.set(String(t.reference), t);
  }

  // 1) Purchase orders → purchase_order tickets.
  try {
    const pos = await db('purchase_orders').where({ tenant_id: tenantId });
    for (const po of pos) {
      const key = `purchase_order:${po.id}`;
      const status = poStatus(po.status);
      const found = bySource.get(key);
      if (!found) {
        await ensureTicket(db, tenantId, {
          category: 'purchase_order',
          trigger: po.origin === 'replenishment' ? 'replenishment' : 'procurement',
          source_type: 'purchase_order', source_id: po.id,
          reference: po.reference || po.id,
          subject: po.supplier_name || 'Purchase order',
          status, priority: po.origin === 'replenishment' ? 'high' : 'normal',
          value: Number(po.total ?? 0), currency: po.currency || 'ZAR',
          created_by: po.created_by || null,
          metadata: JSON.stringify({ supplier: po.supplier_name, origin: po.origin ?? null }),
        });
      } else if (found.status !== status) {
        await db('tickets').where({ id: found.id }).update({ status, value: Number(po.total ?? 0), updated_at: new Date().toISOString() });
      }
    }
  } catch { /* purchase_orders unavailable */ }

  // 2) Contractor store sales → store_sale (invoice-like) tickets.
  try {
    const sales = await db('store_orders').where({ tenant_id: tenantId });
    for (const so of sales) {
      const key = `store_sale:${so.id}`;
      const status = storeStatus(so.status);
      const found = bySource.get(key);
      if (!found) {
        await ensureTicket(db, tenantId, {
          category: 'store_sale', trigger: 'store_sale',
          source_type: 'store_sale', source_id: so.id,
          reference: so.reference || so.id,
          subject: so.company || so.buyer_name || 'Store sale',
          status, priority: 'normal',
          value: Number(so.total ?? 0), currency: so.currency || 'ZAR',
          created_by: so.created_by || null,
          metadata: JSON.stringify({ buyer: so.buyer_name, pickupCode: so.pickup_code }),
        });
      } else if (found.status !== status) {
        await db('tickets').where({ id: found.id }).update({ status, updated_at: new Date().toISOString() });
      }
    }
  } catch { /* store_orders unavailable */ }

  // 3) Escalation line from the audit trail → mark the matching ticket escalated
  //    (matched by reference), else raise a standalone escalation ticket so an
  //    escalation of a client-side / native record is never lost.
  try {
    const service = getServiceClient();
    const { data } = await service
      .from('audit_events')
      .select('id, target_id, target_type, metadata, created_at, actor_user_id')
      .eq('tenant_id', tenantId)
      .eq('action', 'approval.escalated')
      .order('created_at', { ascending: false })
      .limit(300);
    // Refresh the ticket maps after any inserts above.
    const after = await db('tickets').where({ tenant_id: tenantId }).select('id', 'reference', 'source_id', 'source_type', 'escalated');
    const refMap = new Map<string, any>();
    for (const t of after) { if (t.reference) refMap.set(String(t.reference), t); if (t.source_id) refMap.set(String(t.source_id), t); }
    const escalatedRefs = new Set<string>();
    for (const ev of data ?? []) {
      const ref = String(ev.target_id ?? '').trim();
      if (!ref || escalatedRefs.has(ref)) continue; // latest escalation per ref (rows are newest-first)
      escalatedRefs.add(ref);
      const meta = (ev.metadata ?? {}) as Record<string, any>;
      const match = refMap.get(ref);
      if (match) {
        if (!match.escalated) {
          await db('tickets').where({ id: match.id }).update({
            escalated: true, escalated_at: ev.created_at, escalated_by: meta.escalatedBy || null, updated_at: new Date().toISOString(),
          });
        }
      } else {
        const kind = meta.kind === 'request' ? 'ppe_request' : 'purchase_order';
        const found = byReference.get(ref);
        if (!found) {
          await ensureTicket(db, tenantId, {
            category: 'escalation', trigger: 'escalation',
            source_type: 'escalation', source_id: ev.id,
            reference: ref, subject: meta.subject || ref,
            status: 'open', priority: 'high',
            escalated: true, escalated_at: ev.created_at, escalated_by: meta.escalatedBy || null,
            created_by: ev.actor_user_id || null,
            metadata: JSON.stringify({ kind, note: meta.note || '' }),
          });
        }
      }
    }
  } catch { /* audit trail unavailable */ }
}

export const toApiTicket = (t: any) => ({
  id: t.id,
  commonKey: t.common_key,
  seq: Number(t.seq),
  category: t.category,
  trigger: t.trigger,
  sourceType: t.source_type,
  sourceId: t.source_id,
  reference: t.reference,
  subject: t.subject,
  status: t.status,
  priority: t.priority,
  value: t.value == null ? null : Number(t.value),
  currency: t.currency || 'ZAR',
  escalated: !!t.escalated,
  escalatedAt: t.escalated_at,
  escalatedBy: t.escalated_by,
  resolvedAt: t.resolved_at,
  resolvedBy: t.resolved_by,
  createdBy: t.created_by,
  assignedTo: t.assigned_to,
  metadata: typeof t.metadata === 'string' ? safeJson(t.metadata) : (t.metadata ?? {}),
  createdAt: t.created_at,
  updatedAt: t.updated_at,
});

export const toApiNote = (n: any) => ({
  id: n.id,
  ticketId: n.ticket_id,
  body: n.body,
  authorName: n.author_name,
  authorUserId: n.author_user_id,
  createdAt: n.created_at,
  updatedAt: n.updated_at,
});

function safeJson(s: string): any { try { return JSON.parse(s); } catch { return {}; } }
