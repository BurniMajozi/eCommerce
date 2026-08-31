import { createHmac, timingSafeEqual } from 'crypto';

// Verifies a Standard Webhooks signature (the scheme Supabase Auth "Send Email"
// hooks use). Headers: webhook-id, webhook-timestamp, webhook-signature. The
// secret is base64, usually delivered as "v1,whsec_<base64>". The signature is
// base64(HMAC_SHA256(secret, "<id>.<timestamp>.<rawBody>")).
export function verifyStandardWebhook(
  rawBody: string,
  headers: Record<string, string | string[] | undefined>,
  secret: string,
  toleranceSeconds = 300,
): boolean {
  const h = (k: string) => { const v = headers[k] ?? headers[k.toLowerCase()]; return Array.isArray(v) ? v[0] : v; };
  const id = h('webhook-id');
  const ts = h('webhook-timestamp');
  const sigHeader = h('webhook-signature');
  if (!id || !ts || !sigHeader || !secret) return false;

  // Replay guard: reject stale timestamps.
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > toleranceSeconds) return false;

  const base64Secret = secret.includes(',') ? secret.split(',').pop()! : secret;
  const key = Buffer.from(base64Secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${ts}.${rawBody}`).digest('base64');

  // webhook-signature is a space-separated list of "v1,<sig>".
  const passed = String(sigHeader).split(' ').map((p) => (p.includes(',') ? p.split(',')[1] : p));
  const exp = Buffer.from(expected);
  return passed.some((s) => {
    try { const a = Buffer.from(s); return a.length === exp.length && timingSafeEqual(a, exp); } catch { return false; }
  });
}
