import React from 'react';
import { Search, Download, X } from 'lucide-react';

// Reusable table toolbar: a search box + a CSV export button. Drop it into a
// view's page-head action slot. Wire `value`/`onChange` to a search state and
// filter the table's rows with `matchQuery`; wire `onExport` to a downloadCsv
// call over the SAME filtered rows so the export matches what is on screen.
export const SearchExportBar = ({ value, onChange, placeholder = 'Search…', onExport, exportDisabled, right, width = 220 }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <Search size={14} style={{ position: 'absolute', left: 9, color: 'var(--text-subtle)', pointerEvents: 'none' }} />
      <input
        className="input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ paddingLeft: 30, paddingRight: value ? 28 : 12, width, maxWidth: '52vw', height: 34 }}
        aria-label={placeholder}
      />
      {value && (
        <button type="button" className="icon-btn" onClick={() => onChange('')} aria-label="Clear search"
          style={{ position: 'absolute', right: 3, width: 26, height: 26 }}><X size={13} /></button>
      )}
    </div>
    {onExport && <button className="btn btn-secondary btn-sm" onClick={onExport} disabled={exportDisabled} title="Export the rows shown to CSV"><Download size={14} /> CSV</button>}
    {right}
  </div>
);

// Case-insensitive substring match. Searches the given `fields` of a row, or all
// of the row's own values when no fields are supplied.
export const matchQuery = (row, query, fields) => {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const vals = fields && fields.length ? fields.map((f) => row?.[f]) : Object.values(row || {});
  return vals.some((v) => v != null && String(v).toLowerCase().includes(q));
};
