import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { fetchBugs, updateBug, isMedusaCatalogueEnabled } from '../catalogue/catalogueClient';
import { Bug, RefreshCw, Loader2 } from 'lucide-react';

const STATUSES = ['open', 'triaged', 'in_progress', 'closed'];
const sevColor = (s) => (s === 'critical' ? 'badge-danger' : s === 'high' ? 'badge-warning' : 'badge-neutral');

// Platform-owner bug triage: reports across all tenants, with a status control.
export const BugTriageCard = () => {
  const { auth, tenantAccess, triggerNotification } = useApp();
  const scope = { accessToken: auth?.session?.access_token, tenantId: tenantAccess?.activeTenantId, siteId: tenantAccess?.activeSiteId };
  const live = isMedusaCatalogueEnabled && !!scope.accessToken && !!scope.tenantId;
  const [bugs, setBugs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [showClosed, setShowClosed] = useState(false);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!live) { setBugs([]); return; }
    let active = true;
    setLoading(true);
    fetchBugs(scope).then((r) => { if (active) setBugs(r.bugs ?? []); }).catch(() => { if (active) setBugs([]); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, scope.accessToken, scope.tenantId, reloadKey]);

  const setStatus = async (b, status) => {
    setBusyId(b.id);
    try {
      await updateBug(b.id, { status }, scope);
      setBugs((prev) => prev.map((x) => (x.id === b.id ? { ...x, status } : x)));
    } catch (e) {
      triggerNotification('Update failed', e?.message || 'Could not update the report.', 'danger');
    } finally { setBusyId(null); }
  };

  const rows = bugs.filter((b) => showClosed || b.status !== 'closed');
  const openCount = bugs.filter((b) => b.status !== 'closed').length;

  return (
    <div className="card">
      <div className="card-hd" style={{ gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Bug size={17} style={{ color: 'var(--primary)' }} /><h3>Bug reports</h3><span className={`badge ${openCount ? 'badge-warning' : 'badge-neutral'}`}>{openCount} open</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label className="muted" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> show closed</label>
          {live && <button className="btn btn-ghost btn-sm" onClick={() => setReloadKey((k) => k + 1)} disabled={loading} aria-label="Refresh">{loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}</button>}
        </div>
      </div>
      {!live ? (
        <div className="card-bd muted" style={{ padding: 20, fontSize: 13.5 }}>Connect the live backend to see reported bugs.</div>
      ) : rows.length === 0 ? (
        <div className="card-bd muted" style={{ padding: 20, fontSize: 13.5 }}>{loading ? 'Loading…' : 'No open bug reports. 🎉'}</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Report</th><th>Reporter</th><th className="center">Severity</th><th>Where</th><th className="center">Status</th></tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} style={{ opacity: b.status === 'closed' ? 0.55 : 1 }}>
                  <td><div style={{ fontWeight: 600 }}>{b.title}</div>{b.description && <div className="muted" style={{ fontSize: 12, whiteSpace: 'pre-wrap', maxWidth: 340 }}>{b.description.slice(0, 180)}</div>}<div className="eyebrow">{(b.createdAt || '').slice(0, 16).replace('T', ' ')}</div></td>
                  <td style={{ fontSize: 12.5 }}>{b.reporterName || b.reporterEmail || '—'}<div className="eyebrow">{b.reporterEmail && b.reporterName ? b.reporterEmail : ''}</div></td>
                  <td className="center"><span className={`badge ${sevColor(b.severity)}`} style={{ textTransform: 'capitalize' }}>{b.severity}</span></td>
                  <td className="muted" style={{ fontSize: 12 }}>{b.route || '—'}</td>
                  <td className="center">
                    <select className="select" style={{ width: 'auto', fontSize: 12.5, padding: '4px 8px' }} value={b.status} disabled={busyId === b.id} onChange={(e) => setStatus(b, e.target.value)}>
                      {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
