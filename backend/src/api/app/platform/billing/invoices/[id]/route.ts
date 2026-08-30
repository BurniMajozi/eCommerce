import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { assertCapability, ScopeError } from '../../../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../../../middlewares/tenant-scope';
import { invoiceToApi } from '../../../../../../lib/billing';

const pg = (req: TenantScopedRequest) => req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;

// POST /app/platform/billing/invoices/:id — { action: 'charge' | 'verify' }.
// 'charge' starts a Paystack transaction for the invoice total and returns the
// authorization_url for the tenant to pay; 'verify' confirms payment and marks
// the invoice paid. Mirrors the Contractor Store payment flow.
export async function POST(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'platform.manage');
    const inv = await pg(req)('platform_invoices').where({ id: req.params.id }).first();
    if (!inv) throw new ScopeError(404, 'invoice_not_found', 'Invoice not found.');

    const b = (req.body ?? {}) as { action?: string; payerEmail?: string; reference?: string };
    const action = (b.action ?? 'charge').toString();
    const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
    const expected = Math.round(Number(inv.total) * 100);

    if (action === 'charge') {
      if (inv.status === 'paid') { res.json({ already: true, invoice: invoiceToApi(inv) }); return; }
      if (Number(inv.total) <= 0) { // free plan / trial — nothing to charge
        await pg(req)('platform_invoices').where({ id: inv.id }).update({ status: 'paid', paid_at: new Date(), updated_at: new Date() });
        const fresh = await pg(req)('platform_invoices').where({ id: inv.id }).first();
        res.json({ paid: true, invoice: invoiceToApi(fresh) });
        return;
      }
      const email = (b.payerEmail ?? inv.payer_email ?? '').toString().trim().toLowerCase();
      if (!email || !/.+@.+\..+/.test(email)) throw new ScopeError(400, 'payer_email_required', 'A payer email is required to start the charge.');
      if (!secret) { res.json({ needsPaymentSetup: true, invoice: invoiceToApi(inv) }); return; }

      const reference = `SUB-${String(inv.id).slice(0, 8).toUpperCase()}-${String(inv.period).replace('-', '')}`;
      const origin = (req.headers.origin as string) || process.env.STORE_URL || '';
      const callbackUrl = origin ? `${origin.replace(/\/$/, '')}/?sub_ref=${reference}` : undefined;
      const psRes = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, amount: expected, currency: inv.currency, reference, callback_url: callbackUrl, metadata: { tenant_id: inv.tenant_id, kind: 'platform_subscription', invoice_id: inv.id, period: inv.period } }),
      });
      const psJson: any = await psRes.json().catch(() => ({}));
      if (!psRes.ok || !psJson?.status || !psJson?.data?.authorization_url) {
        throw new ScopeError(502, 'paystack_init_failed', psJson?.message || 'The charge could not be started.');
      }
      await pg(req)('platform_invoices').where({ id: inv.id }).update({ paystack_ref: psJson.data.reference || reference, payer_email: email, updated_at: new Date() });
      res.json({ authorizationUrl: psJson.data.authorization_url, reference, accessCode: psJson.data.access_code });
      return;
    }

    if (action === 'verify') {
      if (inv.status === 'paid') { res.json({ paid: true, invoice: invoiceToApi(inv) }); return; }
      if (!secret) throw new ScopeError(400, 'no_paystack', 'Paystack is not configured.');
      const ref = (inv.paystack_ref || b.reference || '').toString();
      if (!ref) throw new ScopeError(400, 'no_reference', 'No payment reference to verify.');
      const psRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(ref)}`, { headers: { Authorization: `Bearer ${secret}` } });
      const psJson: any = await psRes.json().catch(() => ({}));
      const data = psJson?.data;
      const paid = psRes.ok && psJson?.status && data?.status === 'success' && Number(data.amount) >= expected;
      if (paid) {
        await pg(req)('platform_invoices').where({ id: inv.id }).update({ status: 'paid', paid_at: new Date(), updated_at: new Date() });
        const fresh = await pg(req)('platform_invoices').where({ id: inv.id }).first();
        res.json({ paid: true, invoice: invoiceToApi(fresh) });
        return;
      }
      res.json({ paid: false, paystackStatus: data?.status || 'pending' });
      return;
    }

    throw new ScopeError(400, 'invalid_action', `Unknown action '${action}'.`);
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'invoice_charge_failed', message: (error as Error).message });
  }
}
