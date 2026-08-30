import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { fetchTenantSites, createTenantSite, updateTenantSite, isMedusaCatalogueEnabled } from '../catalogue/catalogueClient';
import { MapPin, Plus, Loader2, RefreshCw } from 'lucide-react';

// Owner-managed sites/locations for the selected tenant. Every tenant needs at
// least one active site — members are scoped to sites, and site-scoped data
// (stock, stores) only resolves for a site in the member's scope.
export const SitesCard = ({ tenantId, tenantName }) => {
  const { auth, tenantAccess, triggerNotification } = useApp();
  const scope = { accessToken: auth?.session?.access_token, tenantId: tenantAccess?.activeTenantId, siteId: tenantAccess?.activeSiteId };
  const live = isMedusaCatalogueEnabled && !!scope.accessToken && !!scope.tenantId && !!tenantId;

  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!live) { setSites([]); return; }
    let active = true;
    setLoading(true);
    fetchTenantSites(tenantId, scope).then((r) => { if (active) setSites(r.sites ?? []); }).catch(() => { if (active) setSites([]); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, tenantId, scope.accessToken, reloadKey]);

  const add = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await createTenantSite(tenantId, { name: newName.trim() }, scope);
      triggerNotification('Site added', `“${newName.trim()}” added to ${tenantName}.`, 'success');
      setNewName(''); setReloadKey((k) => k + 1);
    } catch (e) { triggerNotification('Could not add site', e?.message || 'Failed.', 'danger'); }
    finally { setBusy(false); }
  };

  const setStatus = async (s, status) => {
    setBusyId(s.id);
    try {
      await updateTenantSite(tenantId, s.id, { status }, scope);
      setSites((prev) => prev.map((x) => (x.id === s.id ? { ...x, status } : x)));
    } catch (e) { triggerNotification('Update failed', e?.message || 'Failed.', 'danger'); }
    finally { setBusyId(null); }
  };

  return (
    <div className="card">
      <div className="card-hd" style={{ gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><MapPin size={17} style={{ color: 'var(--primary)' }} /><h3>Sites &amp; locations — {tenantName}</h3><span className="badge badge-neutral">{sites.length}</span></div>
        {live && <button className="btn btn-ghost btn-sm" onClick={() => setReloadKey((k) => k + 1)} disabled={loading} aria-label="Refresh">{loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}</button>}
      </div>
      <div className="card-bd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!live ? (
          <div className="muted" style={{ fontSize: 13.5 }}>Connect the live backend to manage sites.</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input className="input" placeholder="New location name (e.g. Shaft 4)" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} style={{ width: 240 }} />
              <button className="btn btn-primary btn-sm" onClick={add} disabled={busy || !newName.trim()}>{busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Add site</button>
            </div>
            {sites.length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>{loading ? 'Loading…' : 'No sites yet — add the tenant’s first location.'}</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Location</th><th>Code</th><th className="center">Status</th><th className="center">Action</th></tr></thead>
                  <tbody>
                    {sites.map((s) => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 500 }}>{s.name}</td>
                        <td className="muted">{s.code}</td>
                        <td className="center"><span className={`badge ${s.status === 'active' ? 'badge-success' : 'badge-danger'}`}>{s.status}</span></td>
                        <td className="center">
                          {s.status === 'active'
                            ? <button className="btn btn-secondary btn-sm" disabled={busyId === s.id} onClick={() => setStatus(s, 'suspended')}>{busyId === s.id ? '…' : 'Suspend'}</button>
                            : <button className="btn btn-primary btn-sm" disabled={busyId === s.id} onClick={() => setStatus(s, 'active')}>{busyId === s.id ? '…' : 'Reactivate'}</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
