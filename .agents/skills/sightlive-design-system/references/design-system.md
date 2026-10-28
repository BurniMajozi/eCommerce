# Design system — tokens, classes, patterns

All styling lives in `src/theme.css` (plain CSS, not Tailwind config). Prefer the
semantic **classes** below; use `var(--token)` in inline styles only for one-offs.

## Tokens (CSS variables on `:root`, redefined for `[data-theme="dark"]`)
Never hardcode these values — reference the variable so light/dark and per-tenant
white-label both work.

- Surfaces: `--bg`, `--surface`, `--surface-2`, `--surface-3`
- Borders: `--border`, `--border-strong`
- Text: `--text`, `--text-muted`, `--text-subtle`
- Brand: `--primary`, `--primary-hover`, `--primary-active`, `--primary-weak`,
  `--primary-weak-bd`, `--on-primary`
- Semantic: `--success` / `--success-weak`, `--warning` / `--warning-weak`,
  `--danger` / `--danger-weak`, `--info` / `--info-weak`
- Focus/shadow: `--ring`, `--shadow-sm`, `--shadow-md`, `--shadow-lg`

The tenant brand accent overrides `--primary` at runtime (white-label), which is
exactly why you must not hardcode the orange.

## Structural classes
- **Card**: `card` › `card-hd` (header row, title + actions) › `card-bd` (padded
  body). Tables usually go directly in the card (no `card-bd`) inside `table-wrap`.
- **Buttons**: `btn` + one of `btn-primary` | `btn-secondary` | `btn-ghost` |
  `btn-danger`; size with `btn-sm` / `btn-lg`; `btn-block` for full width.
  Icon-only actions: `icon-btn` (usually `style={{ width: 30, height: 30 }}`).
- **Badges/pills**: `badge` + `badge-primary` | `badge-success` | `badge-warning`
  | `badge-danger` | `badge-info` | `badge-neutral`. Use these for statuses.
- **Tables**: `<div className="table-wrap"><table className="table">…</table></div>`.
  Right-align numeric columns with `className="num"`; `tabular` for aligned digits.
- **Modals**: `overlay` (backdrop, closes on click) › `modal` (+ `modal-sm` /
  `modal-lg`) › `modal-hd` / `modal-bd` / `modal-ft`. Stop propagation on the
  modal so backdrop clicks don't close it while interacting.
- **Page head**: `page-head` (an `<h2>` + `<p>` on the left, actions on the right).
- **KPI cards**: `card` › `card-bd` › `kpi-label` / `kpi-value` / `kpi-sub`, laid
  out in `cols cols-3`.
- **Forms**: `field` › `field-label` + `input` | `select` | `textarea`.
- **Text/util**: `muted`, `eyebrow` (tiny uppercase label), `divider`, `spin`
  (loading spinner animation), `avatar`, `progress`, `segment` (segmented toggle).
- **Layout shell** (already set up in `App.jsx`): `app-layout` › `sidebar` +
  `main-col` › `topbar` + `main`. You rarely touch these — you render views inside.

## View layout helpers
`MedusaAdminPortal.jsx` defines two tiny helpers reused across its views — copy the
shape for any new full-page view:

```jsx
const Head = ({ icon: Icon, title, sub, action }) => (
  <div className="page-head">
    <div>{Icon && <Icon .../>}<h2>{title}</h2><p>{sub}</p></div>
    {action}
  </div>
);
const Wrap = ({ children }) => (
  <div className="animate-fade-in" style={{ display:'flex', flexDirection:'column', gap:22, paddingBottom:24 }}>
    {children}
  </div>
);
```

## Copy-paste patterns

### A card with a header action
```jsx
<div className="card">
  <div className="card-hd" style={{ gap: 10, flexWrap: 'wrap' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Boxes size={17} style={{ color: 'var(--primary)' }} />
      <h3>Section title</h3>
      <span className="badge badge-neutral">{rows.length}</span>
    </div>
    <button className="btn btn-primary btn-sm"><Plus size={14} /> New</button>
  </div>
  {/* body or table */}
</div>
```

### A data table with an empty state
```jsx
<div className="table-wrap">
  <table className="table">
    <thead><tr><th>SKU</th><th>Product</th><th className="num">Stock</th></tr></thead>
    <tbody>
      {rows.length === 0 && (
        <tr><td colSpan={3} className="muted" style={{ textAlign:'center', padding:22 }}>
          Nothing here yet.
        </td></tr>
      )}
      {rows.map((r) => (
        <tr key={r.sku}>
          <td className="muted">{r.sku}</td>
          <td style={{ fontWeight: 500 }}>{r.name}</td>
          <td className="num tabular">{r.stockOnHand}</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

### KPI row
```jsx
<div className="cols cols-3">
  <div className="card"><div className="card-bd">
    <div className="kpi-label">Stock at cost</div>
    <div className="kpi-value">R {(value/1e6).toFixed(2)}m</div>
    <div className="kpi-sub">requires commerce management + MFA</div>
  </div></div>
  {/* … */}
</div>
```

### Loading state
Use `SkeletonPage` (from `./SkeletonLoader`) for a whole view while data loads,
or `InlineLoading` / `InlineError` (from `./InlineState`) for a card. Protected
values that are MFA-restricted render the literal string `Restricted`.

## Conventions to match
- Titles are `<h3>` inside `card-hd`, `<h2>` inside `page-head`.
- Money: `R {n.toLocaleString('en-ZA')}` (ZAR default; other currencies carry a
  code). Dates: `.slice(0,10)` / `.slice(0,16).replace('T',' ')`.
- Keep the same inline-style density as neighbouring code (this repo styles
  heavily with inline `style={{…}}` alongside the semantic classes — that's the
  house style, not a smell).
