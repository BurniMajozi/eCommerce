import React, { useEffect, useState, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { fetchAudit, isMedusaCatalogueEnabled } from '../catalogue/catalogueClient';
import { SearchExportBar, matchQuery } from './TableToolbar';
import { downloadCsv, dateStamp } from '../utils/exportCsv';
import { ScrollText, ShieldCheck, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';

// Tenant audit trail on the Dashboard — lets a merchant report PPE stock activity
// back to the mine. audit.read is MFA-gated, so if the session is only aal1 we
// offer an authenticator step-up rather than a dead error.
export const AuditLogCard = () => {
  const { auth, tenantAccess, triggerNotification } = useApp();
  const scope = { accessToken: auth?.session?.access_token, tenantId: tenantAccess?.activeTenantId, siteId: tenantAccess?.activeSiteId };
  const live = isMedusaCatalogueEnabled && !!scope.accessToken && !!scope.tenantId;
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [err, setErr] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!live) return;
    setLoading(true); setErr(null); setNeedsMfa(false);
    try {
      const r = await fetchAudit(scope);
      setEvents(r.events ?? []);
    } catch (e) {
      if (e?.code === 'mfa_required') setNeedsMfa(true);
      else setErr(e?.message || 'Could not load the audit trail.');
    } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, scope.accessToken, scope.tenantId]);

  useEffect(() => { load(); }, [load, reloadKey]);
  // Refetch once the session is elevated via the authenticator step-up.
  useEffect(() => {
    const h = () => setReloadKey((k) => k + 1);
    window.addEventListener('sightlive:mfa-elevated', h);
    return () => window.removeEventListener('sightlive:mfa-elevated', h);
  }, []);

  const stepUp = () => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('sightlive:mfa-required')); };
  const fmt = (t) => (t || '').replace('T', ' ').slice(0, 16);
  const shown = events.filter((e) => matchQuery(e, search, ['action', 'targetType', 'targetId', 'source', 'actor']));
  const exportCsvNow = () => { downloadCsv(`sightlive-audit-${dateStamp()}`, [
    { key: 'at', label: 'When', map: (e) => fmt(e.at) },
    { key: 'action', label: 'Action' }, { key: 'targetType', label: 'Target type' },
    { key: 'targetId', label: 'Target id' }, { key: 'source', label: 'Source' }, { key: 'actor', label: 'Actor' },
  ], shown); triggerNotification('Export ready', `${shown.length} audit events exported to CSV.`, 'success'); };

  return (
    <div className="card">
      <div className="card-hd" style={{ gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ScrollText size={17} style={{ color: 'var(--primary)' }} /><h3>Audit trail</h3>{!needsMfa && <span className="badge badge-neutral">{search ? `${shown.length} of ${events.length}` : events.length} events</span>}</div>
        {live && !needsMfa && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {events.length > 0 && <SearchExportBar value={search} onChange={setSearch} placeholder="Search action, target…" onExport={exportCsvNow} exportDisabled={!shown.length} width={180} />}
            <button className="btn btn-ghost btn-sm" onClick={() => setReloadKey((k) => k + 1)} disabled={loading} aria-label="Refresh">{loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}</button>
          </div>
        )}
      </div>
      {!live ? (
        <div className="card-bd muted" style={{ padding: 20, fontSize: 13.5 }}>Connect the live backend to view the audit trail.</div>
      ) : needsMfa ? (
        <div className="card-bd" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
          <div className="muted" style={{ fontSize: 13.5 }}>The audit trail is protected. Verify with your authenticator to view it.</div>
          <button className="btn btn-primary btn-sm" onClick={stepUp}><ShieldCheck size={15} /> Verify with authenticator</button>
        </div>
      ) : err ? (
        <div className="card-bd" style={{ padding: 20, fontSize: 13.5, color: 'var(--danger)', display: 'flex', gap: 8, alignItems: 'center' }}><AlertTriangle size={15} /> {err}</div>
      ) : events.length === 0 ? (
        <div className="card-bd muted" style={{ padding: 20, fontSize: 13.5 }}>{loading ? 'Loading…' : 'No audit events yet.'}</div>
      ) : shown.length === 0 ? (
        <div className="card-bd muted" style={{ padding: 20, fontSize: 13.5 }}>No audit events match your search.</div>
      ) : (
        <div className="card-bd" style={{ maxHeight: 320, overflowY: 'auto', padding: 0 }}>
          <table className="table">
            <thead><tr><th>When</th><th>Action</th><th>Target</th><th>Source</th></tr></thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id}>
                  <td className="muted" style={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>{fmt(e.at)}</td>
                  <td style={{ fontWeight: 500 }}>{e.action}</td>
                  <td className="muted" style={{ fontSize: 12.5 }}>{e.targetType}{e.targetId ? ` · ${String(e.targetId).slice(0, 12)}` : ''}</td>
                  <td className="muted" style={{ fontSize: 12.5 }}>{e.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
