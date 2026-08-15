import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { createOrderWorkflow } from '@medusajs/medusa/core-flows';
import { assertCapability, ScopeError } from '../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../middlewares/tenant-scope';
import { CatalogueConfigurationError, readCatalogueData } from '../../../catalogue/read';
import { selectSellingPrice, type MedusaVariantRecord } from '../../../catalogue/contract';

type LineInput = { sku?: string; qty?: number | string; quantity?: number | string };
type Body = {
  clientName?: string;
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
  const items = (order.items as Array<Record<string, unknown>> | undefined) ?? [];
  return {
    id: order.id,
    displayId: order.display_id ?? null,
    status: order.status ?? null,
    isDraft: order.is_draft_order ?? true,
    currencyCode: order.currency_code ?? null,
    email: order.email ?? null,
    clientName: meta.client_name ?? order.email ?? null,
    vatNumber: meta.vat_number ?? null,
    poNumber: meta.po_number ?? null,
    taxEnabled: meta.tax_enabled !== false,
    total: order.total ?? null,
    subtotal: order.subtotal ?? order.item_subtotal ?? null,
    createdAt: order.created_at ?? null,
    items: items.map((i) => ({
      sku: i.variant_sku ?? null,
      name: i.title ?? '',
      qty: i.quantity ?? 0,
      unitPrice: i.unit_price ?? 0,
    })),
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
    throw error;
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

    const body = (req.body ?? {}) as Body;
    const lines = (body.items ?? []).map((l) => ({ sku: (l.sku ?? '').toString().trim(), qty: qtyOf(l) }))
      .filter((l) => l.sku && l.qty > 0);
    if (!lines.length) throw new ScopeError(400, 'no_items', 'At least one line item with a quantity is required.');

    const { context } = await readCatalogueData(req, scope, false);
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

    // Resolve each SKU to a variant id + server-authoritative price.
    const skus = [...new Set(lines.map((l) => l.sku))];
    const { data: products } = await query.graph({
      entity: 'product',
      fields: ['title', 'thumbnail', 'variants.id', 'variants.sku', 'variants.title', '*variants.prices'],
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

    const items = lines.map((l) => {
      const p = bySku.get(l.sku)!;
      return {
        variant_id: p.variantId,
        quantity: l.qty,
        title: p.title,
        ...(p.thumbnail ? { thumbnail: p.thumbnail } : {}),
        ...(p.price != null ? { unit_price: p.price } : {}),
      };
    });

    const orderInput = {
      is_draft_order: true,
      region_id: context.regionId ?? undefined,
      sales_channel_id: context.salesChannelId,
      currency_code: (process.env.CURRENCY ?? 'zar').toLowerCase(),
      email: body.email?.trim() || undefined,
      items,
      metadata: {
        client_name: body.clientName?.trim() || null,
        vat_number: body.vatNumber?.trim() || null,
        po_number: body.poNumber?.trim() || null,
        tax_enabled: body.taxEnabled !== false,
      },
    };
    // Boundary cast: framework/types' CreateOrderDTO alias omits is_draft_order,
    // but the installed workflow accepts it (verified in @medusajs/types order
    // mutations). All fields are constructed and validated above.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { result } = await createOrderWorkflow(req.scope).run({ input: orderInput as any });

    res.status(201).json({ order: toOrderSummary(result as unknown as Record<string, unknown>) });
  } catch (error) {
    if (error instanceof ScopeError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
    if (error instanceof CatalogueConfigurationError) { res.status(409).json({ code: error.code, message: error.message }); return; }
    throw error;
  }
}
