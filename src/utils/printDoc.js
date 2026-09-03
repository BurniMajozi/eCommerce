// Robust print-to-PDF helpers.
//
// The blank-PDF bug came from two things:
//  1) window.print() on in-app content that the global `@media print` CSS hides
//     (only .invoice-print is shown) → the page prints blank.
//  2) Opening a print window and calling w.print() on a fixed short timer, before
//     the written document had actually rendered → a blank first page.
//
// These helpers open a standalone print window and fire the dialog only once the
// document is ready (onload), with a timed fallback for browsers where onload
// doesn't fire for document.write pages — guarded so it prints exactly once.

export const escapeHtml = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Trigger the print dialog for an already-written window, when it's ready.
export function triggerPrint(w) {
  if (!w) return;
  let done = false;
  const go = () => {
    if (done || w.closed) return;
    done = true;
    try { w.focus(); w.print(); } catch { /* ignore */ }
  };
  try {
    if (w.document && w.document.readyState === 'complete') { setTimeout(go, 120); return; }
  } catch { /* cross-origin/none — fall through to timers */ }
  w.onload = go;
  setTimeout(go, 700); // fallback if onload never fires
}

// Branded standalone document shell for tabular reports/slips.
const shell = (title, bodyHtml) => `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  *{box-sizing:border-box} body{font-family:Inter,Segoe UI,Arial,sans-serif;color:#111827;margin:0;padding:28px;font-size:12px}
  h1{font-size:19px;margin:0 0 2px} .sub{color:#6b7280;font-size:11px;margin-bottom:16px}
  .brand{color:#ea580c;font-weight:800}
  table{width:100%;border-collapse:collapse;margin-top:8px} th,td{padding:6px 9px;border-bottom:1px solid #e5e7eb;text-align:left;vertical-align:top}
  th{background:#f5f5f4;text-transform:uppercase;font-size:9.5px;letter-spacing:.05em;color:#6b7280}
  td.n,th.n{text-align:right} tfoot td{font-weight:700;border-top:2px solid #999}
  thead{display:table-header-group} tr{page-break-inside:avoid}
  @media print{ body{padding:0 6px} }
</style></head><body>${bodyHtml}</body></html>`;

// Open a print window with the branded shell + body, and print when ready.
// Returns false if the popup was blocked (caller should warn the user).
export function printDocument(title, bodyHtml) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(shell(title, bodyHtml));
  w.document.close();
  triggerPrint(w);
  return true;
}
