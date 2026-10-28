# Reusable helpers — search/export tables & print/PDF

Prefer these over hand-rolling. They already handle the fiddly parts (filtered
export matching the view, print timing, theme-safe styling) and keep every table
in the app consistent.

## Table search + CSV export — `src/components/TableToolbar.jsx`

```jsx
import { SearchExportBar, matchQuery } from './TableToolbar';
```

- `SearchExportBar({ value, onChange, placeholder, onExport, exportDisabled, right, width })`
  renders a search box (with a clear ✕) + a "CSV" button. Drop it in the card
  head / `page-head` action slot. Omit `onExport` for search-only. `width`
  defaults to 220.
- `matchQuery(row, query, fields?)` — case-insensitive substring match across the
  named `fields` (or all of the row's values if omitted). Use it to filter.

**The rule that keeps exports honest: filter first, then export the *filtered*
rows** — so the CSV always matches what the user is looking at.

### Full worked example
```jsx
const [search, setSearch] = useState('');
const shown = rows.filter((r) => matchQuery(r, search, ['sku', 'name', 'category']));
const exportRows = () => {
  downloadCsv(`sightlive-products-${dateStamp()}`, [
    { key: 'sku', label: 'SKU' },
    { key: 'name', label: 'Product' },
    { key: 'costPrice', label: 'Cost (R)', map: (r) => (r.costPrice == null ? 'Restricted' : r.costPrice.toFixed(2)) },
    { key: 'stockOnHand', label: 'Stock' },
  ], shown);
  triggerNotification('Export ready', `${shown.length} products exported to CSV.`, 'success');
};

// in the head:
<SearchExportBar value={search} onChange={setSearch}
  placeholder="Search SKU, product, category…"
  onExport={exportRows} exportDisabled={!shown.length} />

// count + empty state:
<span className="badge badge-neutral">{search ? `${shown.length} of ${rows.length}` : rows.length}</span>
{shown.length === 0 && <tr><td colSpan={n} className="muted" style={{ textAlign:'center', padding:22 }}>
  {search ? 'No rows match your search.' : 'Nothing here yet.'}</td></tr>}
{shown.map(/* … */)}
```

When several tables live in one component keyed by a `view` prop (like
`MedusaAdminPortal`), use ONE `tableSearch` state and reset it on view change:
`useEffect(() => setTableSearch(''), [view])`.

## CSV — `src/utils/exportCsv.js`
- `downloadCsv(filename, columns, rows)` where `columns = [{ key, label, map? }]`.
  `map(row)` formats a cell; without it the raw `row[key]` is used. `.csv` is
  appended automatically.
- `dateStamp()` → `YYYY-MM-DD` for filenames.

## Print / PDF — `src/utils/printDoc.js`

**Why a helper exists:** the global `@media print` block in `theme.css` does
`body * { visibility: hidden }` and only reveals `.invoice-print`. So calling
`window.print()` on ordinary in-app content prints a **blank page**. And opening
a print window then calling `w.print()` on a fixed timer often fires before the
document has rendered → also blank.

- `printDocument(title, bodyHtml)` — opens a standalone, branded, **multi-page-safe**
  document and prints it when it's actually ready. Returns `false` if the popup
  was blocked (warn the user to allow popups). Use this for reports/tables.
- `triggerPrint(w)` — for a window you built yourself (custom HTML): call it
  instead of `setTimeout(() => w.print(), 300)`. It prints on `onload` /
  `readyState`, guarded so it fires exactly once.
- `escapeHtml(v)` — escape interpolated values when building `bodyHtml`.

### Report print example
```jsx
import { printDocument, escapeHtml } from '../utils/printDoc';

const th = cols.map((c) => `<th class="${c.n ? 'n' : ''}">${escapeHtml(c.h)}</th>`).join('');
const tb = rows.map((r) => `<tr>${cols.map((c) => `<td class="${c.n ? 'n' : ''}">${escapeHtml(c.get(r))}</td>`).join('')}</tr>`).join('');
const body = `<h1><span class="brand">SightLive</span> · ${escapeHtml(title)}</h1>
  <div class="sub">generated ${new Date().toLocaleString('en-ZA')} · ${rows.length} rows</div>
  <table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table>`;
if (!printDocument(title, body)) triggerNotification('Popup blocked', 'Allow popups to print / save as PDF.', 'warning');
```

**Exception:** a genuinely one-page receipt/invoice may instead be rendered in the
app and printed via `window.print()` *only if* its container has the
`invoice-print` class and its buttons/controls carry `no-print`. That's how
`InvoiceModal.jsx` and the Storekeeper issue-slip work. Anything multi-page or
tabular should use `printDocument` instead.
