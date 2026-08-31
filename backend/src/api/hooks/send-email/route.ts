import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { sendEmail, isEmailEnabled } from '../../../lib/agentmail';
import { authEmail } from '../../../lib/email-templates';
import { verifyStandardWebhook } from '../../../lib/standard-webhooks';

// POST /hooks/send-email — Supabase Auth "Send Email" hook. Supabase calls this
// whenever it needs to send an auth email (OTP sign-in, signup, recovery, email
// change, invite, reauthentication). We render it and send via AgentMail, so all
// auth mail is branded and reliable. Secured with the hook's Standard-Webhooks
// signature (SUPABASE_SEND_EMAIL_HOOK_SECRET). Public route (Supabase → us).
export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    const secret = (process.env.SUPABASE_SEND_EMAIL_HOOK_SECRET ?? '').trim();
    const raw = (req as any).rawBody
      ? (Buffer.isBuffer((req as any).rawBody) ? (req as any).rawBody.toString('utf8') : String((req as any).rawBody))
      : JSON.stringify(req.body ?? {});

    // Verify the signature. If no secret is configured, refuse (fail closed) so
    // this endpoint can't be used to send arbitrary mail.
    if (!secret) { res.status(500).json({ error: 'hook_secret_not_configured' }); return; }
    if (!verifyStandardWebhook(raw, req.headers as any, secret)) { res.status(401).json({ error: 'invalid_signature' }); return; }

    const payload = (typeof req.body === 'object' && req.body) ? (req.body as any) : JSON.parse(raw || '{}');
    const user = payload.user ?? {};
    const ed = payload.email_data ?? {};
    const to = (user.email ?? '').toString().trim();
    if (!to) { res.status(400).json({ error: 'no_recipient' }); return; }

    if (!isEmailEnabled()) { res.status(500).json({ error: 'email_not_configured' }); return; }

    const actionType = (ed.email_action_type ?? 'magiclink').toString();
    const token = (ed.token ?? '').toString();
    let confirmationUrl: string | null = null;
    if (ed.token_hash && ed.site_url) {
      const redirect = ed.redirect_to ? `&redirect_to=${encodeURIComponent(ed.redirect_to)}` : '';
      confirmationUrl = `${String(ed.site_url).replace(/\/$/, '')}/auth/v1/verify?token=${encodeURIComponent(ed.token_hash)}&type=${encodeURIComponent(actionType)}${redirect}`;
    }

    const { subject, html, text } = authEmail({ actionType, token, confirmationUrl });
    const result = await sendEmail({ to, subject, html, text, labels: ['auth', actionType] });
    if (!result.sent) { res.status(502).json({ error: result.error || 'send_failed' }); return; }

    // Supabase treats a 2xx with no error as "email sent".
    res.status(200).json({});
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}
