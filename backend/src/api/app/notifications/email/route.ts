import type { MedusaResponse } from '@medusajs/framework/http';
import { assertAnyCapability, ScopeError } from '../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../middlewares/tenant-scope';
import { sendEmail, isEmailEnabled } from '../../../../lib/agentmail';
import {
  poDecisionEmail, requestDecisionEmail, saleConfirmationEmail,
  promoEmail, purchaseOrderEmail, invoiceEmail, type EmailContent,
} from '../../../../lib/email-templates';

// Any authenticated staff member can trigger a transactional email — the exact
// content is built server-side from a fixed template registry (the client never
// supplies HTML), and the AgentMail key stays on the server.
const CAPS = [
  'commerce.read', 'commerce.manage', 'ppe.approve.tier1', 'ppe.approve.tier2',
  'reports.read', 'platform.manage', 'ppe.request.create', 'tenant.members.manage',
];

// Whitelisted templates: name → builder. Covers approvals, sales, promos,
// purchase orders and invoices. (Auth invites + store pickups are sent
// server-side at their own routes.)
const REGISTRY: Record<string, (data: any) => EmailContent> = {
  po_decision: poDecisionEmail,
  request_decision: requestDecisionEmail,
  sale_confirmation: saleConfirmationEmail,
  promo: promoEmail,
  purchase_order: purchaseOrderEmail,
  invoice: invoiceEmail,
};

const isEmail = (v: unknown): v is string => typeof v === 'string' && /.+@.+\..+/.test(v.trim());

// POST /app/notifications/email — { template, to, cc?, data }
export async function POST(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertAnyCapability(scope, CAPS);

    const b = (req.body ?? {}) as { template?: string; to?: string | string[]; cc?: string | string[]; data?: Record<string, unknown> };
    const build = b.template ? REGISTRY[b.template] : undefined;
    if (!build) throw new ScopeError(400, 'unknown_template', `Unknown email template '${b.template ?? ''}'.`);

    // Validate recipients (at most a small set — this is transactional, not bulk).
    const rawTo = Array.isArray(b.to) ? b.to : [b.to];
    const to = rawTo.filter(isEmail).map((e) => e.trim());
    if (!to.length) throw new ScopeError(400, 'invalid_recipient', 'A valid recipient email is required.');
    if (to.length > 25) throw new ScopeError(400, 'too_many_recipients', 'Too many recipients for one send.');
    const cc = (Array.isArray(b.cc) ? b.cc : b.cc ? [b.cc] : []).filter(isEmail);

    if (!isEmailEnabled()) { res.json({ sent: false, skipped: true, reason: 'email_not_configured' }); return; }

    const content = build(b.data ?? {});
    const result = await sendEmail({ to, cc: cc.length ? cc : undefined, subject: content.subject, html: content.html, text: content.text, labels: [b.template!] });
    res.status(result.sent ? 200 : 502).json(result);
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'email_failed', message: (error as Error).message });
  }
}
