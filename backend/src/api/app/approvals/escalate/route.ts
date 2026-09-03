import type { MedusaResponse } from '@medusajs/framework/http';
import { assertCapability, ScopeError } from '../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../middlewares/tenant-scope';
import { getServiceClient } from '../../../../security/supabase-scope-resolver';
import { sendEmail, isEmailEnabled } from '../../../../lib/agentmail';
import { approvalEscalationEmail } from '../../../../lib/email-templates';

// Roles that can actually decide an approval — the escalation recipients.
const APPROVER_ROLES = new Set(['supervisor', 'manager', 'tenant_admin', 'executive']);
const isEmail = (v: unknown): v is string => typeof v === 'string' && /.+@.+\..+/.test(v.trim());

// Resolve deliverable email addresses of the tenant's approvers (service-role).
async function resolveApproverEmails(db: any, tenantId: string): Promise<string[]> {
  const { data, error } = await db
    .from('memberships')
    .select('user_id, status, membership_roles(role:roles(key))')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');
  if (error) throw new Error(error.message);
  const userIds = new Set<string>();
  for (const m of data ?? []) {
    const roles = (m.membership_roles ?? []).map((r: any) => r.role?.key).filter(Boolean);
    if (roles.some((k: string) => APPROVER_ROLES.has(k)) && m.user_id) userIds.add(m.user_id);
  }
  const emails = new Set<string>();
  for (const id of userIds) {
    try {
      const { data: u } = await db.auth.admin.getUserById(id);
      const email = u?.user?.email;
      if (isEmail(email)) emails.add(String(email).trim());
    } catch { /* skip unresolved user */ }
  }
  return [...emails];
}

// POST /app/approvals/escalate — a merchant flags a stuck approval (always) and
// optionally emails the responsible approver(s). Gated on ppe.approve.escalate;
// a merchant can escalate but NEVER approve or sign (that stays with ppe.approve.*).
// Body: { kind: 'po'|'request', reference, subject?, note?, ageDays?, email?: bool }
export async function POST(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'ppe.approve.escalate');

    const b = (req.body ?? {}) as { kind?: string; reference?: string; subject?: string; note?: string; ageDays?: number; email?: boolean };
    const kind = b.kind === 'request' ? 'request' : 'po';
    const reference = String(b.reference ?? '').trim().slice(0, 200);
    if (!reference) throw new ScopeError(400, 'reference_required', 'A reference for the item being escalated is required.');
    const subject = String(b.subject ?? '').trim().slice(0, 300);
    const note = String(b.note ?? '').trim().slice(0, 1000);
    const ageDays = Number.isFinite(b.ageDays) ? Math.max(0, Math.round(Number(b.ageDays))) : null;

    const db = getServiceClient();

    // 1) Durable record of the escalation (visible in the tenant audit trail).
    const audit = await db.from('audit_events').insert({
      tenant_id: scope.tenantId,
      site_id: scope.siteId ?? null,
      actor_user_id: scope.userId ?? null,
      actor_type: 'user',
      action: 'approval.escalated',
      target_type: kind === 'request' ? 'ppe_request' : 'purchase_order',
      target_id: reference,
      source: 'merchant',
      metadata: { subject: subject || reference, note, ageDays },
    });
    if (audit.error) throw new Error(audit.error.message);

    // 2) Optional email to the approver(s).
    let emailed = false;
    let recipients = 0;
    if (b.email === true) {
      if (!isEmailEnabled()) {
        res.json({ flagged: true, emailed: false, reason: 'email_not_configured' });
        return;
      }
      const to = await resolveApproverEmails(db, scope.tenantId);
      recipients = to.length;
      if (to.length) {
        const escalatedBy = (scope as any).userEmail || (scope as any).email || 'A merchant';
        const content = approvalEscalationEmail({
          kind, reference, subject: subject || reference, note, ageDays,
          escalatedBy, loginUrl: process.env.APP_PUBLIC_URL || null,
        });
        const result = await sendEmail({ to, subject: content.subject, html: content.html, text: content.text, labels: ['approval_escalation'] });
        emailed = !!result.sent;
      }
    }

    console.info('[approval-escalate]', JSON.stringify({
      tenantId: scope.tenantId, userId: scope.userId, kind, reference, emailed, recipients,
    }));
    res.json({ flagged: true, emailed, recipients });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'escalate_failed', message: (error as Error).message });
  }
}
