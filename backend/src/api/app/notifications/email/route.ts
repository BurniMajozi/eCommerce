import type { MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { assertCapability, ScopeError } from '../../../../security/tenant-scope';
import type { TenantScopedRequest } from '../../../middlewares/tenant-scope';
import { sendEmail, isEmailEnabled } from '../../../../lib/agentmail';
import { saleConfirmationEmail, purchaseOrderEmail, invoiceEmail, type EmailContent } from '../../../../lib/email-templates';
import { readCatalogueData } from '../../../../catalogue/read';

type ClientTemplate = 'sale_confirmation' | 'purchase_order' | 'invoice';
type ResolvedEmail = { to: string; content: EmailContent };

const CLIENT_TEMPLATES = new Set<ClientTemplate>(['sale_confirmation', 'purchase_order', 'invoice']);
const isEmail = (value: unknown): value is string => typeof value === 'string' && /.+@.+\..+/.test(value.trim());

const recentSends = new Map<string, number[]>();
const SEND_WINDOW_MS = 60_000;
const SEND_LIMIT = 5;
function assertSendRate(userId: string): void {
  const key = userId;
  const cutoff = Date.now() - SEND_WINDOW_MS;
  const active = (recentSends.get(key) ?? []).filter((at) => at >= cutoff);
  if (active.length >= SEND_LIMIT) {
    throw new ScopeError(429, 'email_rate_limited', 'Please wait before sending this notification again.');
  }
  active.push(Date.now());
  recentSends.set(key, active);
}

const parseLines = (value: unknown): Array<Record<string, any>> => {
  if (Array.isArray(value)) return value as Array<Record<string, any>>;
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  return [];
};

async function resolvePurchaseOrder(req: TenantScopedRequest, recordId: string): Promise<ResolvedEmail> {
  const scope = req.tenantScope!;
  const db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any;
  const po = await db('purchase_orders').where({ id: recordId, tenant_id: scope.tenantId }).first();
  if (!po) throw new ScopeError(404, 'notification_record_not_found', 'Purchase order not found in this tenant.');
  if (!po.supplier_id) throw new ScopeError(409, 'notification_recipient_missing', 'The purchase order has no linked supplier recipient.');

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: 'customer', fields: ['id', 'email', 'company_name', 'metadata'], filters: { id: po.supplier_id },
  } as Parameters<typeof query.graph>[0]);
  const supplier = (data ?? [])[0] as Record<string, any> | undefined;
  if (!supplier || supplier.metadata?.tenant_id !== scope.tenantId) {
    throw new ScopeError(404, 'notification_record_not_found', 'Linked supplier not found in this tenant.');
  }
  if (!isEmail(supplier.email) || String(supplier.email).endsWith('parties.sightlive.local')) {
    throw new ScopeError(409, 'notification_recipient_missing', 'The linked supplier has no deliverable email address.');
  }
  return {
    to: supplier.email.trim(),
    content: purchaseOrderEmail({
      reference: po.reference || po.id,
      supplier: po.supplier_name || supplier.company_name || supplier.email,
      lines: parseLines(po.lines), total: Number(po.total ?? 0),
      currency: po.currency || 'ZAR', expectedDate: po.expected_date,
      approvedBy: po.approved_by, createdAt: po.created_at,
    }),
  };
}

async function resolveOrder(req: TenantScopedRequest, recordId: string, template: 'sale_confirmation' | 'invoice'): Promise<ResolvedEmail> {
  const scope = req.tenantScope!;
  const { context } = await readCatalogueData(req, scope, false);
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: 'order',
    fields: ['id', 'display_id', 'email', 'currency_code', 'total', 'subtotal', 'created_at', 'metadata', 'items.title', 'items.quantity', 'items.unit_price', 'items.variant_sku'],
    filters: { id: recordId, sales_channel_id: context.salesChannelId },
  } as Parameters<typeof query.graph>[0]);
  const order = (data ?? [])[0] as Record<string, any> | undefined;
  if (!order) throw new ScopeError(404, 'notification_record_not_found', 'Order not found in this tenant.');
  if (!isEmail(order.email)) throw new ScopeError(409, 'notification_recipient_missing', 'The order has no deliverable customer email address.');

  const metadata = (order.metadata ?? {}) as Record<string, any>;
  const metadataLines = parseLines(metadata.items);
  const sourceLines = metadataLines.length ? metadataLines : parseLines(order.items);
  const lines = sourceLines.map((line) => ({
    name: line.name ?? line.title ?? 'Item', sku: line.sku ?? line.variant_sku ?? '',
    qty: Number(line.qty ?? line.quantity ?? 0), unitPrice: Number(line.unitPrice ?? line.unit_price ?? 0),
  }));
  const subtotal = Number(metadata.subtotal ?? order.subtotal ?? lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0));
  const total = Number(metadata.total ?? order.total ?? subtotal);
  const currency = String(order.currency_code ?? 'zar').toUpperCase();
  const reference = order.display_id ? `#${order.display_id}` : order.id;
  const clientName = metadata.client_name || order.email;

  const content = template === 'sale_confirmation'
    ? saleConfirmationEmail({ reference, buyerName: clientName, kind: 'b2b', lines, subtotal, total, currency })
    : invoiceEmail({
        number: order.display_id ? `INV-${order.display_id}` : `INV-${String(order.id).slice(0, 8)}`,
        clientName, lines, subtotal, vat: Math.max(0, total - subtotal), total, currency,
        dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), poNumber: metadata.po_number,
      });
  return { to: order.email.trim(), content };
}

// POST /app/notifications/email — { template, recordId }
// Recipient and trusted content are resolved from the tenant-owned record.
export async function POST(req: TenantScopedRequest, res: MedusaResponse): Promise<void> {
  const scope = req.tenantScope;
  try {
    if (!scope) throw new ScopeError(401, 'scope_missing', 'Tenant scope was not resolved.');
    assertCapability(scope, 'commerce.manage', true);

    const body = (req.body ?? {}) as { template?: string; recordId?: string };
    if (!body.template || !CLIENT_TEMPLATES.has(body.template as ClientTemplate)) {
      throw new ScopeError(400, 'unknown_template', `Unknown client email template '${body.template ?? ''}'.`);
    }
    const recordId = String(body.recordId ?? '').trim();
    if (!recordId || recordId.length > 200) {
      throw new ScopeError(400, 'notification_record_required', 'A valid tenant-owned recordId is required.');
    }
    if (!isEmailEnabled()) {
      res.json({ sent: false, skipped: true, reason: 'email_not_configured' });
      return;
    }

    assertSendRate(scope.userId);
    const resolved = body.template === 'purchase_order'
      ? await resolvePurchaseOrder(req, recordId)
      : await resolveOrder(req, recordId, body.template as 'sale_confirmation' | 'invoice');
    const result = await sendEmail({
      to: resolved.to, subject: resolved.content.subject, html: resolved.content.html,
      text: resolved.content.text, labels: [body.template],
    });
    console.info('[notification-email]', JSON.stringify({
      tenantId: scope.tenantId, userId: scope.userId, template: body.template,
      recordId, sent: result.sent, messageId: result.id ?? null,
    }));
    res.status(result.sent ? 200 : 502).json(result);
  } catch (error) {
    if (error instanceof ScopeError) {
      res.status(error.status).json({ code: error.code, message: error.message });
      return;
    }
    res.status(500).json({ code: 'email_failed', message: (error as Error).message });
  }
}
