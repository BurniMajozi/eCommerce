export function resolveOrderTotal(orderTotal: unknown, metadata: Record<string, unknown> = {}): number | null {
  const raw = Number(orderTotal ?? 0);
  if (Number.isFinite(raw) && raw > 0) return raw;
  const metadataTotal = Number(metadata.total ?? metadata.subtotal ?? 0);
  return Number.isFinite(metadataTotal) && metadataTotal > 0 ? metadataTotal : null;
}
