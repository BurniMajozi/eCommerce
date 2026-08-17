import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { createOrderWorkflow } from '@medusajs/medusa/core-flows';
import { randomUUID } from 'crypto';
import { assertCapability, ScopeError } from '../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../middlewares/tenant-scope';
import { CatalogueConfigurationError, readCatalogueData } from '../../../catalogue/read';
import { selectSellingPrice, type MedusaVariantRecord } from '../../../catalogue/contract';

type LineInput = { sku?: string; qty?: number | string; quantity?: number | string };
type Body = {
  clientName?: string;
  customerId?: string;
  email?: string;
  vatNumber?: string;
  poNumber?: string;
  taxEnabled?: boolean;
  items?: LineInput[];
};

function qtyOf(line: LineInput): number {
  const raw = line.qty ?? line.quantity ?? 0;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

// Serialises a Medusa order into the shape the B2B portal renders.
function toOrderSummary(order: Record<string, unknown>) {
  const meta = (order.metadata ?? {}) as Record<string, unknown>;
  const metaItems = (meta.items as Array<Record<string, unknown>> | undefined) ?? [];
  const rawItems = (order.items as Array<Record<string, unknown>> | undefined) ?? [];
  const sourceItems = metaItems.length > 0 ? metaItems : rawItems;

  const items = sourceItems.map((i) => {
    const rawQty = i.qty ?? i.quantity ?? 1;
    const rawPrice = i.unitPrice ?? i.unit_price ?? 0;
    return {
      sku: (i.sku ?? i.variant_sku ?? (i.variant as Record<string, unknown>)?.sku ?? '').toString(),
      name: (i.name ?? i.title ?? '').toString(),
      qty: typeof rawQty === 'number' && rawQty > 0 ? rawQty : (parseInt(String(rawQty), 10) || 1),
      unitPrice: typeof rawPrice === 'number' ? rawPrice : (parseFloat(String(rawPrice)) || 0),
    };
  });

  const calcSubtotal = items.reduce((a, b) => a + b.unitPrice * b.qty, 0);
  const taxEnabled = meta.tax_enabled !== false;
  const calcTotal = taxEnabled ? calcSubtotal * 1.15 : calcSubtotal;

  return {
    id: order.id,
    displayId: order.display_id ?? null,
    status: (meta.status as string) || (order.status as string) || 'pending',
    isDraft: order.is_draft_order ?? true,
    currencyCode: order.currency_code ?? 'zar',
    email: order.email ?? null,
    clientName: meta.client_name ?? order.email ?? null,
    supplier: meta.supplier ?? null,
    vatNumber: meta.vat_number ?? null,
    poNumber: meta.po_number ?? null,
    taxEnabled,
    total: typeof meta.total === 'number' && meta.total > 0 ? meta.total : (typeof order.total === 'number' && order.total > 0 ? order.total : calcTotal),
    subtotal: typeof meta.subtotal === 'number' && meta.subtotal > 0 ? meta.subtotal : (typeof order.subtotal === 'number' && order.subtotal > 0 ? order.subtotal : calcSubtotal),
    createdAt: order.created_at ?? null,
    items,
  };
}

// GET /app/orders — lists the tenant's B2B draft orders (quotes) newest first.
export async function GET(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'commerce.manage', true);

    const { context } = await readCatalogueData(req, scope, false);
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const { data } = await query.graph({
      entity: 'order',
      fields: [
        'id', 'display_id', 'status', 'is_draft_order', 'currency_code', 'email',
        'total', 'subtotal', 'item_subtotal', 'created_at', 'metadata',
        'items.title', 'items.quantity', 'items.unit_price', 'items.variant_sku',
      ],
      filters: { sales_channel_id: context.salesChannelId, is_draft_order: true },
      pagination: { skip: 0, take: 100, order: { created_at: 'DESC' } },
    } as Parameters<typeof query.graph>[0]);

    res.json({ orders: ((data ?? []) as Array<Record<string, unknown>>).map(toOrderSummary) });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    if (error instanceof CatalogueConfigurationError) { res.status(409).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'order_failed', message: (error as Error).message || 'The order could not be created.' });
  }
}

// POST /app/orders — creates a real Medusa draft order from a B2B quote. The
// order is priced server-side from the tenant's catalogue (contract pricing),
// so the client cannot tamper with unit prices.
export async function POST(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'commerce.manage', true);

    const body = (req.body ?? {}) as Body & { supplier?: string };
    const lines = (body.items ?? []).map((l) => ({ sku: (l.sku ?? '').toString().trim(), qty: qtyOf(l) }))
      .filter((l) => l.sku && l.qty > 0);
    if (!lines.length) throw new ScopeError(400, 'no_items', 'At least one line item with a quantity is required.');

    const { context } = await readCatalogueData(req, scope, false);
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

    // Resolve each SKU to a variant id + server-authoritative price.
    const skus = [...new Set(lines.map((l) => l.sku))];
    const { data: products } = await query.graph({
      entity: 'product',
      fields: ['title', 'thumbnail', 'variants.id', 'variants.sku', 'variants.title', 'variants.prices.*'],
      filters: { variants: { sku: skus }, sales_channels: { id: context.salesChannelId } },
    } as Parameters<typeof query.graph>[0]);

    type ProdRow = { title?: string; thumbnail?: string; variants?: MedusaVariantRecord[] | null };
    const bySku = new Map<string, { variantId: string; title: string; thumbnail?: string; price: number | null }>();
    for (const p of (products ?? []) as ProdRow[]) {
      for (const v of p.variants ?? []) {
        if (!v.sku || !v.id) continue;
        bySku.set(v.sku, {
          variantId: v.id,
          title: v.title && v.title !== 'Standard' ? `${p.title ?? ''} ${v.title}`.trim() : (p.title ?? v.sku),
          thumbnail: p.thumbnail ?? undefined,
          price: selectSellingPrice(v, context.regionId),
        });
      }
    }

    const missing = skus.filter((s) => !bySku.has(s));
    if (missing.length) throw new ScopeError(400, 'unknown_skus', `These products are not in the catalogue: ${missing.join(', ')}.`);
    const unpriced = skus.filter((s) => bySku.get(s)?.price == null);
    if (unpriced.length) throw new ScopeError(400, 'missing_price', `No selling price is set for: ${unpriced.join(', ')}. Add a price on the product first.`);

    const enrichedLines = lines.map((l) => {
      const p = bySku.get(l.sku)!;
      const unitPrice = p.price ?? 0;
      return {
        variant_id: p.variantId,
        sku: l.sku,
        name: p.title,
        title: p.title,
        qty: l.qty,
        quantity: l.qty,
        unitPrice,
        unit_price: unitPrice,
        line_total: unitPrice * l.qty,
        ...(p.thumbnail ? { thumbnail: p.thumbnail } : {}),
      };
    });

    const subtotal = enrichedLines.reduce((a, b) => a + b.unit_price * b.quantity, 0);
    const taxRate = body.taxEnabled !== false ? 0.15 : 0;
    const vat = subtotal * taxRate;
    const total = subtotal + vat;

    // Link the order to a customer so spend-vs-limit reporting works. Prefer the
    // explicit customerId; else match an existing customer by email.
    let customerId = body.customerId?.trim() || undefined;
    if (!customerId && body.email?.trim()) {
      try {
        const { data: matches } = await query.graph({ entity: 'customer', fields: ['id'], filters: { email: body.email.trim().toLowerCase() } } as Parameters<typeof query.graph>[0]);
        customerId = (matches ?? [])[0]?.id;
      } catch { /* no match */ }
    }

    const orderInput = {
      is_draft_order: true,
      region_id: context.regionId ?? undefined,
      sales_channel_id: context.salesChannelId,
      currency_code: (process.env.CURRENCY ?? 'zar').toLowerCase(),
      email: body.email?.trim() || undefined,
      customer_id: customerId,
      items: enrichedLines.map((l) => ({
        variant_id: l.variant_id,
        quantity: l.quantity,
        title: l.title,
        unit_price: l.unit_price,
        ...(l.thumbnail ? { thumbnail: l.thumbnail } : {}),
      })),
      metadata: {
        client_name: body.clientName?.trim() || null,
        supplier: body.supplier?.trim() || null,
        vat_number: body.vatNumber?.trim() || null,
        po_number: body.poNumber?.trim() || null,
        tax_enabled: body.taxEnabled !== false,
        subtotal,
        vat,
        total,
        items: enrichedLines,
      },
    };

    const { result } = await createOrderWorkflow(req.scope).run({ input: orderInput as any });

    // Sync B2B Order to Purchase Orders table
    try {
      const pg = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;
      const supplierName = (body.supplier || '').trim() || 'Dromex Safety (Pty) Ltd';
      
      // Determine if supplier is from the mine or external
      const isMinePlant = /mine|plant|shaft|kumba|kolomela|tenke|sishen|amandelbult|thabazimbi/i.test(supplierName);
      // If mine plant -> requires approval logic ('pending_approval')
      // If external -> receipt trigger only ('sent', ready for receipting)
      const poStatus = isMinePlant ? 'pending_approval' : 'sent';

      const poLines = enrichedLines.map((l) => ({
        product_id: l.variant_id,
        sku: l.sku,
        name: l.title || l.name,
        qty: l.quantity,
        unit_cost: l.unit_price,
      }));

      const poId = randomUUID();
      const displayRef = (result as any)?.display_id ? `#${(result as any)?.display_id}` : (body.poNumber?.trim() || 'B2B');
      await pg(req)('purchase_orders').insert({
        id: poId,
        tenant_id: scope.tenantId,
        supplier_id: null,
        supplier_name: supplierName,
        status: poStatus,
        currency: (process.env.CURRENCY ?? 'zar').toUpperCase(),
        reference: `B2B Order ${displayRef} (${body.clientName || 'Storefront'})`,
        expected_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
        lines: JSON.stringify(poLines),
        total: subtotal,
        created_by: scope.userId,
        created_at: new Date(),
        updated_at: new Date(),
        ...(isMinePlant
          ? { submitted_at: new Date() }
          : { sent_at: new Date(), approved_by: 'B2B Auto-Dispatch (External Vendor)', approved_at: new Date() }),
      });
    } catch {
      // ignore PO sync failure if table is being created
    }

    res.status(201).json({ order: toOrderSummary(result as unknown as Record<string, unknown>) });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    if (error instanceof CatalogueConfigurationError) { res.status(409).json({ code: error.code, message: error.message }); return; }
    res.status(500).json({ code: 'order_failed', message: (error as Error).message || 'The order could not be created.' });
  }
}
