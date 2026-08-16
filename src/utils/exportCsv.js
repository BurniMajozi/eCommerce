// Client-side CSV export. `columns` is [{ key, label, map? }]; `rows` is the
// data. Produces an Excel-friendly UTF-8 file (BOM) and triggers a download in
// the user's browser — no server round-trip.
const escapeCell = (value) => {
  if (value == null) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function buildCsv(columns, rows) {
  const header = columns.map((c) => escapeCell(c.label ?? c.key)).join(',');
  const body = rows.map((row) =>
    columns.map((c) => escapeCell(c.map ? c.map(row) : row[c.key])).join(',')
  );
  return [header, ...body].join('\r\n');
}

export function downloadCsv(filename, columns, rows) {
  const csv = buildCsv(columns, rows);
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Timestamp suffix for export filenames, e.g. 2026-08-16. Uses the given Date
// (defaults to now) so callers can keep it deterministic in tests.
export const dateStamp = (d = new Date()) => d.toISOString().slice(0, 10);
