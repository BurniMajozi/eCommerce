import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { assertAnyCapability, ScopeError } from '../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../middlewares/tenant-scope';
import { sendEmailAsync } from '../../../../lib/agentmail';
import { saleConfirmationEmail } from '../../../../lib/email-templates';

const BUY_CAPS = ['ppe.request.create', 'commerce.read', 'commerce.manage', 'platform.manage'];
const pg = (req: TenantScopedRequest) => req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;

const toApi = (o: any) => ({
  reference: o.reference, status: o.status, pickupCode: o.pickup_code,
  buyerName: o.buyer_name, buyerEmail: o.buyer_email, company: o.company,
  currency: o.currency, subtotal: Number(o.subtotal), discount: Number(o.discount), total: Number(o.total),
  lines: o.lines ?? [], paidAt: o.paid_at, createdAt: o.created_at,
});

// GET /app/store/verify?reference=STORE-... — confirm the Paystack payment and
// release the pickup code. Idempotent: a paid order just returns its ticket.
export async function GET(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertAnyCapability(scope, BUY_CAPS);
    const reference = (req.query.reference ?? '').toString();
    if (!reference) throw new ScopeError(400, 'missing_reference', 'A payment reference is required.');

    const db = pg(req);
    const order = await db('store_orders').where({ reference, tenant_id: scope.tenantId }).first();
    if (!order) throw new ScopeError(404, 'order_not_found', 'Order not found.');
    if (order.status === 'paid' || order.status === 'collected') { res.json({ paid: true, order: toApi(order) }); return; }

    const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
    if (!secret) { res.json({ paid: false, order: toApi(order), needsPaymentSetup: true }); return; }

    const psRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(order.paystack_ref || reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const psJson: any = await psRes.json().catch(() => ({}));
    const data = psJson?.data;
    const paid = psRes.ok && psJson?.status && data?.status === 'success';
    if (paid) {
      // Guard against amount tampering.
      const expected = Math.round(Number(order.total) * 100);
      if (Number(data.amount) < expected) throw new ScopeError(400, 'amount_mismatch', 'Paid amount does not match the order.');
      await db('store_orders').where({ id: order.id }).update({ status: 'paid', paid_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      const fresh = await db('store_orders').where({ id: order.id }).first();
      // Sale confirmation + pickup code to the contractor (only on the paid
      // transition, so it isn't re-sent on idempotent re-checks). No-ops if
      // email isn't configured; never blocks the response.
      if (fresh.buyer_email) {
        const { subject, html, text } = saleConfirmationEmail({
          reference: fresh.reference, buyerName: fresh.buyer_name, kind: 'store', lines: fresh.lines ?? [],
          subtotal: Number(fresh.subtotal), discount: Number(fresh.discount), total: Number(fresh.total),
          currency: fresh.currency, pickupCode: fresh.pickup_code,
        });
        sendEmailAsync({ to: fresh.buyer_email, subject, html, text, labels: ['sale_confirmation'] }, `store sale ${fresh.reference}`);
      }
      res.json({ paid: true, order: toApi(fresh) });
      return;
    }
    res.json({ paid: false, order: toApi(order), paystackStatus: data?.status || 'pending' });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'verify_failed', message: (error as Error).message });
  }
}
