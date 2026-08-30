// AgentMail email service (https://docs.agentmail.to).
//
// Sends transactional email for the platform's six flows (auth, approvals,
// sales, promos, purchase orders, invoices). The API key and sender inbox are
// read from the environment — never hard-coded. If either is unset the service
// is a graceful no-op (returns { skipped: true }) so the app runs fine before
// email is provisioned, exactly like the Paystack integration.
//
// Required env:
//   AGENTMAIL_API_KEY   — Bearer token from the AgentMail dashboard
//   AGENTMAIL_INBOX_ID  — the inbox to send from (its id / address)
// Optional env:
//   AGENTMAIL_FROM      — display name or address override for the sender
//   AGENTMAIL_REPLY_TO  — default Reply-To for outbound mail
//   APP_PUBLIC_URL      — base URL used to build links inside emails

const API_BASE = 'https://api.agentmail.to/v0';

export type EmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string | string[];
  labels?: string[];
};

export type EmailResult = { sent: boolean; skipped?: boolean; id?: string; error?: string };

const apiKey = () => (process.env.AGENTMAIL_API_KEY ?? '').trim();
const inboxId = () => (process.env.AGENTMAIL_INBOX_ID ?? '').trim();

export function isEmailEnabled(): boolean {
  return !!apiKey() && !!inboxId();
}

// Strip tags for a plain-text fallback when a caller only supplies html.
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>(?=)/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Send an email. NEVER throws — email must not break the core action that
// triggered it; failures are returned for logging instead.
export async function sendEmail(input: EmailInput): Promise<EmailResult> {
  if (!isEmailEnabled()) return { sent: false, skipped: true };
  try {
    const body: Record<string, unknown> = {
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? htmlToText(input.html),
    };
    if (input.cc) body.cc = input.cc;
    if (input.bcc) body.bcc = input.bcc;
    const replyTo = input.replyTo ?? ((process.env.AGENTMAIL_REPLY_TO ?? '').trim() || undefined);
    if (replyTo) body.reply_to = replyTo;
    const from = (process.env.AGENTMAIL_FROM ?? '').trim();
    if (from) body.from = from;
    if (input.labels?.length) body.labels = input.labels;

    const res = await fetch(`${API_BASE}/inboxes/${encodeURIComponent(inboxId())}/messages/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { sent: false, error: `AgentMail ${res.status}: ${detail.slice(0, 300)}` };
    }
    const json = (await res.json().catch(() => ({}))) as { message_id?: string };
    return { sent: true, id: json.message_id };
  } catch (err) {
    return { sent: false, error: (err as Error).message };
  }
}

// Fire-and-forget helper for use inside request handlers: sends in the
// background and logs the outcome without blocking or throwing.
export function sendEmailAsync(input: EmailInput, context = 'email'): void {
  if (!isEmailEnabled()) return;
  void sendEmail(input).then((r) => {
    if (!r.sent && !r.skipped) console.warn(`[agentmail] ${context} failed: ${r.error}`);
  });
}
