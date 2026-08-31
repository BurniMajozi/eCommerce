// Branded, inline-styled email templates for the platform's six flows. HTML is
// email-safe (all styles inline, no external CSS/JS). Each builder returns a
// { subject, html } the AgentMail service sends. Ported from the app's existing
// PO print + invoice document markup so emails match the in-app documents.

export type EmailContent = { subject: string; html: string; text?: string };

const BRAND = '#ea580c';
const INK = '#111827';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';
const BG = '#f4f4f5';

const esc = (v: unknown): string => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function money(amount: unknown, currency = 'ZAR'): string {
  const n = Number(amount || 0);
  const sym = currency === 'ZAR' ? 'R' : currency === 'BWP' ? 'P' : currency === 'NAD' ? 'N$' : `${currency} `;
  return `${sym} ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Shared shell: header band, white card, footer. `accent` colours the header/CTA.
function layout(opts: { title: string; preheader?: string; bodyHtml: string; accent?: string }): string {
  const accent = opts.accent || BRAND;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BG};font-family:Inter,Segoe UI,Arial,sans-serif;color:${INK};">
${opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opts.preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:12px;overflow:hidden">
<tr><td style="background:${accent};padding:18px 24px">
  <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:-.01em">SightLive</span>
  <span style="color:rgba(255,255,255,.85);font-size:13px;font-weight:500"> · CageLi PPE</span>
</td></tr>
<tr><td style="padding:26px 24px 8px">
  <h1 style="margin:0 0 4px;font-size:19px;font-weight:700;color:${INK}">${esc(opts.title)}</h1>
</td></tr>
<tr><td style="padding:8px 24px 26px;font-size:14px;line-height:1.55;color:${INK}">${opts.bodyHtml}</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid ${LINE};font-size:11.5px;color:${MUTED}">
  Sent by the SightLive PPE stock platform · multi-currency, cross-border ready.<br/>
  This is an automated message. Reply to reach the sending team.
</td></tr>
</table>
</td></tr></table></body></html>`;
}

const btn = (label: string, url: string, accent = BRAND): string =>
  `<a href="${esc(url)}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:8px">${esc(label)}</a>`;

const p = (html: string): string => `<p style="margin:0 0 14px">${html}</p>`;

// Reusable line-items table (product, sku, qty, unit, line).
function linesTable(lines: Array<{ name?: string; sku?: string; qty?: number; unit_cost?: number; unitPrice?: number }>, currency: string): string {
  const rows = (lines ?? []).map((l) => {
    const unit = Number(l.unit_cost ?? l.unitPrice ?? 0);
    const qty = Number(l.qty ?? 0);
    return `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid ${LINE}">${esc(l.name)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid ${LINE};color:${MUTED}">${esc(l.sku)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid ${LINE};text-align:right">${qty}</td>
      <td style="padding:8px 10px;border-bottom:1px solid ${LINE};text-align:right">${money(unit, currency)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid ${LINE};text-align:right;font-weight:600">${money(unit * qty, currency)}</td>
    </tr>`;
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:6px 0 14px;font-size:13px">
    <thead><tr>
      ${['Product', 'SKU', 'Qty', 'Unit', 'Line'].map((h, i) => `<th style="padding:7px 10px;background:#f5f5f4;border-bottom:1px solid ${LINE};text-transform:uppercase;font-size:9.5px;letter-spacing:.05em;text-align:${i >= 2 ? 'right' : 'left'};color:${MUTED}">${h}</th>`).join('')}
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

const codeBox = (code: string, label = 'Pickup code'): string =>
  `<div style="margin:6px 0 16px;padding:14px 18px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;text-align:center">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:${MUTED}">${esc(label)}</div>
    <div style="font-size:26px;font-weight:800;letter-spacing:.12em;color:${BRAND};margin-top:4px">${esc(code)}</div>
    <div style="font-size:11.5px;color:${MUTED};margin-top:4px">Present this code at the store counter to collect.</div>
  </div>`;

/* ─────────────── 0. AUTH — Supabase send-email hook (OTP / links) ────────── */
// Renders the email for any Supabase auth action. For OTP sign-in the 6-digit
// `token` is shown prominently; link-based actions (signup/recovery/etc.) also
// carry a confirmation button.
export function authEmail(o: { actionType?: string; token?: string; confirmationUrl?: string | null }): EmailContent {
  const type = (o.actionType || 'magiclink').toLowerCase();
  const TITLES: Record<string, { subject: string; title: string; lead: string }> = {
    magiclink: { subject: 'Your SightLive sign-in code', title: 'Sign in to SightLive', lead: 'Use this code to finish signing in. It expires shortly and is for you only — no one from SightLive will ever ask for it.' },
    login: { subject: 'Your SightLive sign-in code', title: 'Sign in to SightLive', lead: 'Use this code to finish signing in. It expires shortly and is for you only.' },
    email: { subject: 'Your SightLive sign-in code', title: 'Sign in to SightLive', lead: 'Use this code to finish signing in. It expires shortly and is for you only.' },
    otp: { subject: 'Your SightLive verification code', title: 'Verify it’s you', lead: 'Enter this code to continue.' },
    signup: { subject: 'Confirm your SightLive email', title: 'Confirm your email', lead: 'Enter this code (or use the button) to confirm your email and activate your account.' },
    recovery: { subject: 'Reset your SightLive password', title: 'Reset your password', lead: 'Use this code (or the button) to reset your password. If you didn’t request this, ignore this email.' },
    email_change: { subject: 'Confirm your new email', title: 'Confirm your new email', lead: 'Enter this code (or use the button) to confirm your new email address.' },
    invite: { subject: 'You’ve been invited to SightLive', title: 'You’ve been invited', lead: 'Use the button below to accept your invitation and set up your account.' },
    reauthentication: { subject: 'Confirm it’s you — SightLive', title: 'Confirm it’s you', lead: 'Enter this code to confirm this sensitive action.' },
  };
  const t = TITLES[type] || TITLES.magiclink;
  const showCode = !!o.token && type !== 'invite';
  const showButton = !!o.confirmationUrl && ['signup', 'recovery', 'email_change', 'invite', 'magiclink'].includes(type);
  return {
    subject: t.subject,
    html: layout({
      title: t.title,
      preheader: showCode ? `Your code: ${o.token}` : t.subject,
      bodyHtml: `${p(esc(t.lead))}
        ${showCode ? codeBox(o.token!, 'Your code') : ''}
        ${showButton ? p(btn(type === 'recovery' ? 'Reset password' : type === 'invite' ? 'Accept invitation' : 'Confirm', o.confirmationUrl!)) : ''}
        ${p('<span style="color:#6b7280;font-size:12.5px">If you didn’t request this, you can safely ignore this email.</span>')}`,
    }),
  };
}

/* ───────────────────────── 1. AUTH — invite / welcome ───────────────────── */
export function inviteEmail(o: { name?: string; email: string; role?: string; tempPassword?: string; loginUrl?: string }): EmailContent {
  const login = o.loginUrl || (process.env.APP_PUBLIC_URL ?? '').trim() || 'the SightLive app';
  const creds = o.tempPassword
    ? `${p('Your temporary sign-in details:')}
       <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:13px;margin:0 0 14px">
         <tr><td style="padding:3px 12px 3px 0;color:${MUTED}">Email</td><td style="font-weight:600">${esc(o.email)}</td></tr>
         <tr><td style="padding:3px 12px 3px 0;color:${MUTED}">Temporary password</td><td style="font-weight:700;font-family:monospace">${esc(o.tempPassword)}</td></tr>
       </table>
       ${p(`<strong>Please change this password after your first sign-in.</strong> You'll also be asked to set up two-factor authentication to manage products, pricing and orders.`)}`
    : p('Your account is ready. Sign in with the email address this was sent to.');
  return {
    subject: 'Your SightLive account is ready',
    html: layout({
      title: `Welcome${o.name ? `, ${o.name}` : ''}`,
      preheader: 'Your SightLive PPE platform account has been created.',
      bodyHtml: `${p(`You've been added to the SightLive PPE stock platform${o.role ? ` as <strong>${esc(o.role)}</strong>` : ''}.`)}
        ${creds}
        ${login.startsWith('http') ? p(btn('Sign in', login)) : p(`Sign in at ${esc(login)}.`)}`,
    }),
  };
}

/* ───────────────────── 2. APPROVALS — PO decision ───────────────────────── */
export function poDecisionEmail(o: { reference?: string; decision: 'approved' | 'rejected'; supplier?: string; approver?: string; reason?: string; total?: number; currency?: string }): EmailContent {
  const ok = o.decision === 'approved';
  const accent = ok ? '#16a34a' : '#dc2626';
  return {
    subject: `Purchase order ${o.reference ?? ''} ${ok ? 'approved' : 'rejected'}`.replace(/\s+/g, ' ').trim(),
    html: layout({
      accent,
      title: `Purchase order ${ok ? 'approved' : 'rejected'}`,
      preheader: `${o.reference ?? 'Your PO'} was ${o.decision} by ${o.approver ?? 'a manager'}.`,
      bodyHtml: `${p(`Purchase order <strong>${esc(o.reference ?? '')}</strong>${o.supplier ? ` to ${esc(o.supplier)}` : ''}${o.total != null ? ` (${money(o.total, o.currency)})` : ''} has been <strong style="color:${accent}">${esc(o.decision)}</strong>${o.approver ? ` by ${esc(o.approver)}` : ''}.`)}
        ${o.reason ? p(`<span style="color:${MUTED}">Note:</span> ${esc(o.reason)}`) : ''}
        ${ok ? p('It is now ready to send to the supplier and receive against.') : p('Please review and re-submit if required.')}`,
    }),
  };
}

/* ─────────────────── 2b. APPROVALS — PPE request decision ───────────────── */
export function requestDecisionEmail(o: { employeeName?: string; itemName?: string; decision: 'approved' | 'declined'; reason?: string; approver?: string; pickupCode?: string }): EmailContent {
  const ok = o.decision === 'approved';
  const accent = ok ? '#16a34a' : '#dc2626';
  return {
    subject: `PPE request ${ok ? 'approved' : 'declined'}${o.itemName ? ` — ${o.itemName}` : ''}`,
    html: layout({
      accent,
      title: `PPE request ${ok ? 'approved' : 'declined'}`,
      preheader: `${o.itemName ?? 'Your PPE request'} was ${o.decision}.`,
      bodyHtml: `${p(`Hi${o.employeeName ? ` ${esc(o.employeeName)}` : ''}, your request for <strong>${esc(o.itemName ?? 'PPE')}</strong> has been <strong style="color:${accent}">${esc(o.decision)}</strong>${o.approver ? ` by ${esc(o.approver)}` : ''}.`)}
        ${o.reason ? p(`<span style="color:${MUTED}">Note:</span> ${esc(o.reason)}`) : ''}
        ${ok && o.pickupCode ? codeBox(o.pickupCode) : ''}
        ${ok && !o.pickupCode ? p('Collect it at the store counter — the storekeeper will verify your pickup code.') : ''}`,
    }),
  };
}

/* ─────────────────────────── 3. SALES — order confirmation ──────────────── */
export function saleConfirmationEmail(o: { reference?: string; buyerName?: string; kind?: 'store' | 'b2b'; lines?: any[]; subtotal?: number; discount?: number; total?: number; currency?: string; pickupCode?: string }): EmailContent {
  const cur = o.currency || 'ZAR';
  const isStore = o.kind === 'store';
  return {
    subject: `${isStore ? 'Order confirmed' : 'Order received'} — ${o.reference ?? 'SightLive'}`,
    html: layout({
      title: isStore ? 'Thanks for your order' : 'We received your order',
      preheader: `${o.reference ?? 'Your order'} — ${money(o.total, cur)}`,
      bodyHtml: `${p(`Hi${o.buyerName ? ` ${esc(o.buyerName)}` : ''}, ${isStore ? 'your payment was received and your order is being prepared for collection' : 'your order has been logged and is being processed'}.`)}
        ${p(`<strong>Reference:</strong> ${esc(o.reference ?? '')}`)}
        ${o.lines?.length ? linesTable(o.lines, cur) : ''}
        <table role="presentation" width="100%" style="font-size:13px;margin:0 0 8px">
          ${o.subtotal != null ? `<tr><td style="color:${MUTED};padding:2px 0">Subtotal</td><td style="text-align:right">${money(o.subtotal, cur)}</td></tr>` : ''}
          ${o.discount ? `<tr><td style="color:${MUTED};padding:2px 0">Promotion discount</td><td style="text-align:right;color:#16a34a">− ${money(o.discount, cur)}</td></tr>` : ''}
          <tr><td style="font-weight:700;padding:6px 0;border-top:2px solid #999">Total (${esc(cur)})</td><td style="text-align:right;font-weight:700;border-top:2px solid #999">${money(o.total, cur)}</td></tr>
        </table>
        ${isStore && o.pickupCode ? codeBox(o.pickupCode) : ''}`,
    }),
  };
}

/* ─────────────────────────────── 4. PROMOS ──────────────────────────────── */
export function promoEmail(o: { sku?: string; name?: string; promoType?: string; discountPct?: number; endDate?: string; costWas?: number; costNow?: number; currency?: string; createdBy?: string }): EmailContent {
  const cur = o.currency || 'ZAR';
  return {
    subject: `New promotion — ${o.name || o.sku || 'product'} (−${o.discountPct ?? 0}%)`,
    html: layout({
      title: 'A promotion is now live',
      preheader: `${o.name || o.sku} · ${o.promoType ?? 'markdown'} · −${o.discountPct ?? 0}%`,
      bodyHtml: `${p(`A new <strong>${esc(o.promoType ?? 'markdown')}</strong> promotion has been created and is live${o.createdBy ? ` (by ${esc(o.createdBy)})` : ''}. This is for your visibility as a manager.`)}
        <table role="presentation" width="100%" style="font-size:13px;margin:0 0 12px">
          <tr><td style="color:${MUTED};padding:3px 0">Product</td><td style="text-align:right;font-weight:600">${esc(o.name || o.sku)}</td></tr>
          ${o.sku ? `<tr><td style="color:${MUTED};padding:3px 0">SKU</td><td style="text-align:right">${esc(o.sku)}</td></tr>` : ''}
          <tr><td style="color:${MUTED};padding:3px 0">Discount</td><td style="text-align:right;font-weight:700;color:${BRAND}">−${o.discountPct ?? 0}%</td></tr>
          ${o.costWas != null ? `<tr><td style="color:${MUTED};padding:3px 0">Cost basis</td><td style="text-align:right">${money(o.costWas, cur)} → <strong>${money(o.costNow, cur)}</strong></td></tr>` : ''}
          ${o.endDate ? `<tr><td style="color:${MUTED};padding:3px 0">Ends</td><td style="text-align:right">${esc(o.endDate)}</td></tr>` : ''}
        </table>
        ${p('<span style="color:#6b7280;font-size:12.5px">The discount lowers the cost basis, so the margin on this product narrows while the promotion runs.</span>')}`,
    }),
  };
}

/* ──────────────────────── 5. PURCHASE ORDER → supplier ──────────────────── */
export function purchaseOrderEmail(o: { reference?: string; supplier?: string; lines?: any[]; total?: number; currency?: string; expectedDate?: string; approvedBy?: string; createdAt?: string }): EmailContent {
  const cur = o.currency || 'ZAR';
  return {
    subject: `Purchase Order ${o.reference ?? ''} — SightLive`.replace(/\s+/g, ' ').trim(),
    html: layout({
      title: 'Purchase Order',
      preheader: `${o.reference ?? 'PO'} · ${money(o.total, cur)}`,
      bodyHtml: `${p(`Dear ${esc(o.supplier ?? 'Supplier')},`)}
        ${p('Please find our purchase order below.')}
        <table role="presentation" width="100%" style="font-size:13px;margin:0 0 6px">
          <tr><td style="color:${MUTED};padding:2px 0">Reference</td><td style="text-align:right;font-weight:600">${esc(o.reference ?? '')}</td></tr>
          ${o.createdAt ? `<tr><td style="color:${MUTED};padding:2px 0">Issued</td><td style="text-align:right">${esc(String(o.createdAt).slice(0, 10))}</td></tr>` : ''}
          ${o.expectedDate ? `<tr><td style="color:${MUTED};padding:2px 0">Expected delivery</td><td style="text-align:right">${esc(o.expectedDate)}</td></tr>` : ''}
        </table>
        ${linesTable(o.lines ?? [], cur)}
        <table role="presentation" width="100%" style="font-size:13px">
          <tr><td style="font-weight:700;padding:6px 0;border-top:2px solid #999">Total (${esc(cur)})</td><td style="text-align:right;font-weight:700;border-top:2px solid #999">${money(o.total, cur)}</td></tr>
        </table>
        ${p(`<span style="color:${MUTED}">Approved by ${esc(o.approvedBy || 'management')}.</span>`)}
        ${p('Regards,<br/>SightLive Procurement')}`,
    }),
  };
}

/* ─────────────────────────── 6. INVOICE → customer ──────────────────────── */
export function invoiceEmail(o: { number?: string; clientName?: string; lines?: any[]; subtotal?: number; vat?: number; total?: number; currency?: string; dueDate?: string; poNumber?: string }): EmailContent {
  const cur = o.currency || 'ZAR';
  return {
    subject: `Invoice ${o.number ?? ''} — SightLive`.replace(/\s+/g, ' ').trim(),
    html: layout({
      title: `Invoice ${esc(o.number ?? '')}`,
      preheader: `${money(o.total, cur)}${o.dueDate ? ` due ${o.dueDate}` : ''}`,
      bodyHtml: `${p(`Dear ${esc(o.clientName ?? 'Customer')},`)}
        ${p('Please find your invoice below.')}
        <table role="presentation" width="100%" style="font-size:13px;margin:0 0 6px">
          ${o.poNumber ? `<tr><td style="color:${MUTED};padding:2px 0">PO number</td><td style="text-align:right">${esc(o.poNumber)}</td></tr>` : ''}
          ${o.dueDate ? `<tr><td style="color:${MUTED};padding:2px 0">Due date</td><td style="text-align:right;font-weight:600">${esc(o.dueDate)}</td></tr>` : ''}
        </table>
        ${linesTable(o.lines ?? [], cur)}
        <table role="presentation" width="100%" style="font-size:13px">
          ${o.subtotal != null ? `<tr><td style="color:${MUTED};padding:2px 0">Subtotal</td><td style="text-align:right">${money(o.subtotal, cur)}</td></tr>` : ''}
          ${o.vat != null ? `<tr><td style="color:${MUTED};padding:2px 0">VAT (15%)</td><td style="text-align:right">${money(o.vat, cur)}</td></tr>` : ''}
          <tr><td style="font-weight:700;padding:6px 0;border-top:2px solid #999">Total due (${esc(cur)})</td><td style="text-align:right;font-weight:700;border-top:2px solid #999">${money(o.total, cur)}</td></tr>
        </table>
        ${p('Regards,<br/>SightLive Billing')}`,
    }),
  };
}
