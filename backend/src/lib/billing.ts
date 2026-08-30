// Platform subscription pricing — the single source of truth for what a tenant
// is charged, matching the published pricing page. Metered on seats (members).
//
//   Merchant  R990/mo
//   Plant     R5,900/mo + R250/seat over 200
//   Group     R24,900/mo + R150/seat over 200
//   Trial     free

export type PlanKey = 'trial' | 'merchant' | 'plant' | 'group';

const PLANS: Record<PlanKey, { base: number; seatIncluded: number; perSeat: number }> = {
  trial: { base: 0, seatIncluded: 0, perSeat: 0 },
  merchant: { base: 990, seatIncluded: 9999, perSeat: 0 },
  plant: { base: 5900, seatIncluded: 200, perSeat: 250 },
  group: { base: 24900, seatIncluded: 200, perSeat: 150 },
};

export type Charge = { plan: PlanKey; seats: number; seatOverage: number; base: number; seatAmount: number; total: number; currency: string };

export function computeCharge(planRaw: string | null | undefined, seats: number, currency = 'ZAR'): Charge {
  const plan = (String(planRaw || 'trial').toLowerCase() as PlanKey);
  const cfg = PLANS[plan] ?? PLANS.trial;
  const n = Math.max(0, Math.floor(Number(seats) || 0));
  const seatOverage = Math.max(0, n - cfg.seatIncluded);
  const seatAmount = seatOverage * cfg.perSeat;
  return { plan, seats: n, seatOverage, base: cfg.base, seatAmount, total: cfg.base + seatAmount, currency };
}

// Current billing period as YYYY-MM.
export const currentPeriod = (): string => new Date().toISOString().slice(0, 7);

// Serialise a platform_invoices row for the API.
export const invoiceToApi = (r: any) => ({
  id: r.id, tenantId: r.tenant_id, tenantName: r.tenant_name, period: r.period, plan: r.plan,
  seats: Number(r.seats), baseAmount: Number(r.base_amount), seatAmount: Number(r.seat_amount),
  total: Number(r.total), currency: r.currency, status: r.status, paystackRef: r.paystack_ref,
  payerEmail: r.payer_email, issuedAt: r.issued_at, paidAt: r.paid_at,
});
