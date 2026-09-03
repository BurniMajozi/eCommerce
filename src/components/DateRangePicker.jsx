import React, { useState } from 'react';
import { Calendar, ChevronDown, Check, X } from 'lucide-react';

const PRESETS = [
  { label: '7 days', days: 7 },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
  { label: '60 days', days: 60 },
  { label: '90 days', days: 90 },
];

export const DateRangePicker = ({ range, onChange }) => {
  const [open, setOpen] = useState(false);
  const [customStart, setCustomStart] = useState(range.startDate || '');
  const [customEnd, setCustomEnd] = useState(range.endDate || '');

  const selectPreset = (days) => {
    const end = new Date(); // anchor "last N days" to today so newly issued stock shows
    const start = new Date(end);
    start.setDate(end.getDate() - days);
    const sStr = start.toISOString().slice(0, 10);
    const eStr = end.toISOString().slice(0, 10);
    onChange({ preset: days, startDate: sStr, endDate: eStr, label: `Last ${days} days` });
    setCustomStart(sStr);
    setCustomEnd(eStr);
    setOpen(false);
  };

  const applyCustom = (e) => {
    e.preventDefault();
    if (!customStart || !customEnd) return;
    onChange({
      preset: 'custom',
      startDate: customStart,
      endDate: customEnd,
      label: `${customStart} → ${customEnd}`,
    });
    setOpen(false);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <div className="segment" style={{ display: 'inline-flex' }}>
          {PRESETS.map((p) => {
            const active = range.preset === p.days;
            return (
              <button
                key={p.days}
                type="button"
                className={active ? 'on accent' : ''}
                style={{ fontSize: 12, padding: '5px 10px' }}
                onClick={() => selectPreset(p.days)}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className={`btn btn-secondary btn-sm ${range.preset === 'custom' ? 'btn-primary' : ''}`}
          onClick={() => setOpen(!open)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '5px 10px' }}
          title="Pick custom date range"
        >
          <Calendar size={13} />
          <span>{range.preset === 'custom' ? range.label : 'Custom date'}</span>
          <ChevronDown size={13} />
        </button>
      </div>

      {open && (
        <div
          className="card shadow-lg animate-fade-in"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            zIndex: 90,
            width: 280,
            padding: 16,
            background: 'var(--surface)',
            border: '1px solid var(--border-strong)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Select date range</span>
            <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Close">
              <X size={14} />
            </button>
          </div>
          <form onSubmit={applyCustom} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label className="field-label" style={{ fontSize: 11 }}>From</label>
              <input
                type="date"
                className="input"
                style={{ fontSize: 12, padding: '6px 8px' }}
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="field-label" style={{ fontSize: 11 }}>To</label>
              <input
                type="date"
                className="input"
                style={{ fontSize: 12, padding: '6px 8px' }}
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                required
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary btn-sm"><Check size={13} /> Apply</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
