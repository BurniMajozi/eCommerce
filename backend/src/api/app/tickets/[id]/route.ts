import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { randomUUID } from 'crypto';
import { assertAnyCapability, ScopeError } from '../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../middlewares/tenant-scope';
import { ESCALATE_CAPS } from '../../approvals/caps';
import { toApiTicket, toApiNote } from '../lib';
import { notifyManagers, emitNotifications } from '../../notifications/emit';

const pg = (req: TenantScopedRequest) => req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;
const now = () => new Date().toISOString();
// Approvers (or the platform owner) decide a ticket. Buyers (commerce.manage)
// may also decide replenishment / non-PO tickets — mirrors the PO approve rule.
const APPROVE_CAPS = ['ppe.approve.tier1', 'ppe.approve.tier2', 'platform.manage'];
const DECIDE_CAPS = [...APPROVE_CAPS, 'commerce.manage'];
// A manager acknowledges safety reports (not the buyer/merchant role).
const MANAGER_CAPS = ['ppe.approve.tier1', 'ppe.approve.tier2', 'platform.manage', 'tenant.config.manage'];
const STATUSES = ['open', 'pending_approval', 'in_progress', 'acknowledged', 'approved', 'rejected', 'sent', 'received', 'resolved', 'closed', 'cancelled'];

// GET /app/tickets/:id — one ticket with its notes thread.
export async function GET(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertAnyCapability(scope, ESCALATE_CAPS);
    const db = pg(req);
    const ticket = await db('tickets').where({ id: req.params.id, tenant_id: scope.tenantId }).first();
    if (!ticket) throw new ScopeError(404, 'ticket_not_found', 'Ticket not found.');
    const notes = await db('ticket_notes').where({ ticket_id: ticket.id }).orderBy('created_at', 'asc');
    res.json({ ticket: toApiTicket(ticket), notes: notes.map(toApiNote) });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'ticket_read_failed', message: (error as Error).message });
  }
}

// PATCH /app/tickets/:id — move a ticket through its flow.
//   action: 'resolve'  decision: 'approve' | 'reject'  → decides the ticket and,
//                                for a purchase_order source, drives the real PO
//                                approval transition (the approval journey).
//   action: 'assign'   assignedTo
//   action: 'status'   status / priority
async function decidePurchaseOrder(db: any, tenantId: string, sourceId: string, decision: 'approve' | 'reject', body: Record<string, any>) {
  const po = await db('purchase_orders').where({ id: sourceId, tenant_id: tenantId }).first();
  if (!po) return; // ticket may point at a record removed since — decide the ticket only
  if (po.status !== 'pending_approval') return; // already decided elsewhere; leave the PO alone
  if (decision === 'approve') {
    await db('purchase_orders').where({ id: sourceId, tenant_id: tenantId }).update({
      status: 'approved',
      approved_by: (body.approverName ?? 'Approver').toString().slice(0, 200),
      approved_at: now(),
      approval_signature: (body.signature ?? '').toString().slice(0, 300000) || null,
      updated_at: now(),
    });
  } else {
    await db('purchase_orders').where({ id: sourceId, tenant_id: tenantId }).update({
      status: 'rejected',
      rejection_reason: (body.reason ?? '').toString().slice(0, 1000) || 'Rejected',
      updated_at: now(),
    });
  }
}

export async function PATCH(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    const b = (req.body ?? {}) as Record<string, any>;
    const action = (b.action ?? 'status').toString();
    const db = pg(req);
    const ticket = await db('tickets').where({ id: req.params.id, tenant_id: scope.tenantId }).first();
    if (!ticket) throw new ScopeError(404, 'ticket_not_found', 'Ticket not found.');

    const patch: Record<string, any> = { updated_at: now() };
    let systemNote: string | null = null;

    if (action === 'resolve') {
      // Regular PO tickets need an approver; replenishment / non-PO tickets may
      // also be decided by a buyer (commerce.manage).
      const isReplen = ticket.source_type === 'purchase_order' && (ticket.metadata?.origin === 'replenishment' || String(ticket.metadata).includes('replenishment'));
      assertAnyCapability(scope, ticket.source_type === 'purchase_order' && !isReplen ? APPROVE_CAPS : DECIDE_CAPS);
      const decision = b.decision === 'reject' ? 'reject' : 'approve';
      if (ticket.source_type === 'purchase_order' && ticket.source_id) {
        await decidePurchaseOrder(db, scope.tenantId, ticket.source_id, decision, b);
      }
      patch.status = decision === 'approve' ? 'approved' : 'rejected';
      patch.escalated = false;
      patch.resolved_at = now();
      patch.resolved_by = (b.approverName ?? scope.userId ?? 'Approver').toString().slice(0, 200);
      systemNote = `${decision === 'approve' ? 'Approved' : 'Rejected'} by ${patch.resolved_by}${b.reason ? ` — ${String(b.reason).slice(0, 400)}` : ''}.`;
    } else if (action === 'escalate') {
      // Any member can escalate a ticket (e.g. a safety report) to the approver.
      assertAnyCapability(scope, ESCALATE_CAPS);
      patch.escalated = true;
      patch.escalated_at = now();
      patch.escalated_by = (b.escalatedBy ?? scope.userId ?? '').toString().slice(0, 200) || null;
      systemNote = `Escalated to the approver${b.note ? ` — ${String(b.note).slice(0, 400)}` : ''}.`;
    } else if (action === 'acknowledge') {
      // A manager acknowledges a safety report (sent to them for acknowledgment).
      assertAnyCapability(scope, MANAGER_CAPS);
      const by = (b.approverName ?? scope.userId ?? 'Manager').toString().slice(0, 200);
      const meta = (typeof ticket.metadata === 'object' && ticket.metadata) ? ticket.metadata : {};
      patch.metadata = JSON.stringify({ ...meta, acknowledgedBy: by, acknowledgedAt: now() });
      patch.status = ticket.status === 'open' ? 'acknowledged' : ticket.status;
      systemNote = `Acknowledged by ${by}.`;
    } else if (action === 'assign') {
      assertAnyCapability(scope, DECIDE_CAPS);
      patch.assigned_to = (b.assignedTo ?? '').toString().slice(0, 200) || null;
    } else if (action === 'status') {
      assertAnyCapability(scope, DECIDE_CAPS);
      if (b.status !== undefined) {
        if (!STATUSES.includes(b.status)) throw new ScopeError(400, 'invalid_status', `Status must be one of: ${STATUSES.join(', ')}.`);
        patch.status = b.status;
        if (b.status === 'resolved' || b.status === 'closed') { patch.resolved_at = now(); patch.resolved_by = (b.approverName ?? scope.userId ?? '').toString().slice(0, 200) || null; }
      }
      if (b.priority !== undefined && ['low', 'normal', 'high', 'critical'].includes(b.priority)) patch.priority = b.priority;
    } else {
      throw new ScopeError(400, 'invalid_action', `Unknown action '${action}'.`);
    }

    await db('tickets').where({ id: ticket.id, tenant_id: scope.tenantId }).update(patch);
    if (systemNote) {
      await db('ticket_notes').insert({
        id: randomUUID(), ticket_id: ticket.id, tenant_id: scope.tenantId, body: systemNote,
        author_user_id: scope.userId ?? null, author_name: 'System', created_at: now(), updated_at: now(),
      });
    }

    // Fan-out notifications for the people who need to know (best-effort).
    const notifyBase = { tenantId: scope.tenantId, siteId: scope.siteId ?? null, linkId: ticket.id, createdBy: scope.userId ?? null, excludeUserId: scope.userId ?? null, metadata: { commonKey: ticket.common_key } };
    try {
      if (action === 'escalate') {
        await notifyManagers(db, { ...notifyBase, type: 'escalation', title: `Escalated: ${ticket.subject}`, body: `${ticket.common_key} was escalated to the approver.`, severity: 'warning', linkRole: 'MERCHANT_APPROVALS' });
      } else if (action === 'acknowledge' && ticket.created_by) {
        await emitNotifications(db, { ...notifyBase, recipientUserIds: [ticket.created_by], type: 'ack', title: 'Report acknowledged', body: `Your report “${ticket.subject}” was acknowledged.`, severity: 'success', linkRole: 'REPORT_SAFETY' });
      } else if (action === 'resolve' && ticket.created_by) {
        const dec = patch.status === 'approved' ? 'approved' : 'rejected';
        await emitNotifications(db, { ...notifyBase, recipientUserIds: [ticket.created_by], type: 'decision', title: `Ticket ${dec}`, body: `${ticket.common_key} “${ticket.subject}” was ${dec}.`, severity: dec === 'approved' ? 'success' : 'warning', linkRole: ticket.source_type === 'purchase_order' ? 'MED_PO' : 'REPORT_SAFETY' });
      }
    } catch { /* notifications never block the action */ }

    const updated = await db('tickets').where({ id: ticket.id }).first();
    res.json({ ticket: toApiTicket(updated) });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'ticket_update_failed', message: (error as Error).message });
  }
}
