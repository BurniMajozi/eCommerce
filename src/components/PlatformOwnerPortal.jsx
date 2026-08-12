import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { MOCK_AUDIT_LOG, ROLE_HOME_CARDS } from '../data/mockData';
import { fetchPlatformTenants, fetchAuditEvents } from '../tenant/adminReads';
import { Building2, Plus, Palette, Smartphone, Wallet, ScrollText, LayoutGrid, AlertTriangle } from 'lucide-react';

const ACCENT_SWATCHES = ['#EC3013', '#2563EB', '#0891B2', '#7C3AED', '#059669', '#D97706'];

const SourceBadge = ({ live }) => (
  <span className={`badge ${live ? 'badge-success' : 'badge-neutral'}`}>{live ? 'Live · RLS' : 'Demo data'}</span>
);

export const PlatformOwnerPortal = () => {
  const { tenants, selectedTenantId, setSelectedTenantId, modules, toggleTenantModule, updateTenantBranding, provisionTenant, integrationMode } = useApp();
  const [newTenantName, setNewTenantName] = useState('');
  const [liveTenants, setLiveTenants] = useState(null);
  const [liveAudit, setLiveAudit] = useState(null);
  const tenant = tenants.find(t => t.id === selectedTenantId) || tenants[0];

  // Read-only live wiring. In demo mode the effect no-ops and the mock data
  // below is used unchanged; writes (provision, branding, flags) stay local
  // until their Medusa/Supabase workflows exist.
  useEffect(() => {
    if (integrationMode !== 'supabase') { setLiveTenants(null); setLiveAudit(null); return; }
    let active = true;
    fetchPlatformTenants().then(rows => { if (active) setLiveTenants(rows ?? []); }).catch(() => { if (active) setLiveTenants([]); });
    fetchAuditEvents(null, 20).then(rows => { if (active) setLiveAudit(rows ?? []); }).catch(() => { if (active) setLiveAudit([]); });
    return () => { active = false; };
  }, [integrationMode]);

  const tenantRows = liveTenants ?? tenants;
  const auditRows = liveAudit ?? MOCK_AUDIT_LOG;
  const tenantsLive = liveTenants !== null;
  const auditLive = liveAudit !== null;

  const totalUsers = tenantRows.reduce((a, t) => a + (t.users || 0), 0);
  const liveCount = tenantRows.filter(t => t.state === 'live' || t.state === 'active').length;
  const trialCount = tenantRows.filter(t => t.trial || t.plan === 'trial' || t.state === 'setup').length;
  const totalMrr = tenants.reduce((a, t) => a + (t.mrr || 0), 0);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 22, paddingBottom: 24 }}>
      <div className="page-head">
        <div>
          <h2>Platform owner</h2>
          <p>Level 1 — across every tenant. Provision plants, set white-label branding, toggle modules, and watch platform usage &amp; audit.</p>
        </div>
        <span className="badge badge-neutral">{tenants.length} tenants · {liveCount} live · {trialCount} trial · {totalUsers} users</span>
      </div>

      {/* Two levels explainer */}
      <div className="cols cols-2">
        <div className="card" style={{ borderColor: 'var(--primary-weak-bd)', background: 'var(--primary-weak)' }}>
          <div className="card-bd">
            <div className="eyebrow" style={{ color: 'var(--primary)' }}>Level 1 · Platform owner (you)</div>
            <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.55 }}>Sees across tenants. Creates a plant, sets its logo, colours, domain, price list and modules. Never touches a tenant's day-to-day stock.</p>
          </div>
        </div>
        <div className="card">
          <div className="card-bd">
            <div className="eyebrow">Level 2 · Tenant admin (plant / mine)</div>
            <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.55 }}>Sees only their plant. Users &amp; roles, stores &amp; bins, entitlement rules, approval thresholds, catalogue and reports.</p>
          </div>
        </div>
      </div>

      {/* Tenants + branding */}
      <div className="card">
        <div className="card-hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Building2 size={17} style={{ color: 'var(--primary)' }} /><h3>Tenants</h3><SourceBadge live={tenantsLive} /></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="input" value={newTenantName} onChange={e => setNewTenantName(e.target.value)} placeholder="New tenant name" style={{ width: 180 }} />
            <button className="btn btn-primary" onClick={() => { provisionTenant(newTenantName.trim()); setNewTenantName(''); }}><Plus size={16} /> Provision</button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Tenant</th><th>Domain</th><th className="num">Users</th><th className="center">Plan</th><th className="num">MRR</th><th className="center">State</th></tr></thead>
            <tbody>
              {tenantRows.length === 0 && (
                <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 24 }}>No tenants visible for your access.</td></tr>
              )}
              {tenantRows.map(t => {
                const sel = t.id === selectedTenantId;
                const accent = t.branding?.accent || 'var(--primary)';
                const logo = t.branding?.logo || (t.name ? t.name.charAt(0).toUpperCase() : '?');
                const liveState = t.state === 'live' || t.state === 'active';
                return (
                  <tr key={t.id} onClick={() => setSelectedTenantId(t.id)} style={{ cursor: 'pointer' }} className={sel ? 'row-flag' : ''}>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                        <span className="avatar" style={{ width: 26, height: 26, fontSize: 11, background: accent }}>{logo}</span>
                        <strong style={{ fontWeight: 600 }}>{t.name}</strong>
                      </span>
                    </td>
                    <td className="muted">{t.domain}</td>
                    <td className="num">{t.users}</td>
                    <td className="center"><span className="badge badge-neutral">{t.plan}</span></td>
                    <td className="num">{t.mrr ? `R ${t.mrr.toLocaleString('en-ZA')}` : '—'}</td>
                    <td className="center"><span className={`badge ${liveState ? 'badge-success' : 'badge-warning'}`}>{t.state}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <hr className="divider" />

        {/* Branding editor + live preview */}
        <div className="card-bd">
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Palette size={13} /> Branding — {tenant.name}</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}>
                <span className="avatar" style={{ width: 52, height: 52, fontSize: 20, background: tenant.branding.accent }}>{tenant.branding.logo}</span>
                <div className="muted" style={{ fontSize: 12.5 }}>SVG or PNG<br />light + dark mark</div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                {ACCENT_SWATCHES.map(c => {
                  const on = tenant.branding.accent.toUpperCase() === c;
                  return (
                    <button key={c} onClick={() => updateTenantBranding(tenant.id, { accent: c })}
                      style={{ width: 34, height: 34, borderRadius: 8, background: c, cursor: 'pointer', border: on ? '2px solid var(--text)' : '2px solid var(--border)', outline: on ? '2px solid var(--text)' : 'none', outlineOffset: 2 }}
                      aria-label={`accent ${c}`} />
                  );
                })}
              </div>
              <div className="eyebrow" style={{ marginTop: 8 }}>accent colour</div>

              <div className="eyebrow" style={{ marginTop: 16, marginBottom: 8 }}>Modules</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {modules.map(m => {
                  const on = tenant.modules.includes(m.id);
                  return (
                    <button key={m.id} onClick={() => toggleTenantModule(tenant.id, m.id)}
                      className={`btn btn-sm ${on ? 'btn-secondary' : 'btn-ghost'}`} style={{ justifyContent: 'space-between', borderColor: on ? 'var(--border-strong)' : 'var(--border)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="dot" style={{ background: on ? 'var(--success)' : 'var(--text-subtle)', width: 9, height: 9 }} /> {m.label}
                      </span>
                      {m.core && <span className="badge badge-neutral" style={{ fontSize: 10 }}>core</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* live preview */}
            <div className="card" style={{ width: 240, boxShadow: 'none', alignSelf: 'flex-start' }}>
              <div className="card-bd" style={{ padding: 12 }}>
                <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Smartphone size={13} /> Live preview</div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginTop: 10 }}>
                  <div style={{ background: tenant.branding.accent, color: '#fff', padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                      <span style={{ width: 16, height: 16, borderRadius: 4, background: 'rgba(255,255,255,.25)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>{tenant.branding.logo}</span>
                      {tenant.name.split('—')[0].trim()}
                    </span>
                    <span>≡</span>
                  </div>
                  <div style={{ padding: 11, background: 'var(--surface)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Request PPE</div>
                    <div style={{ height: 8, background: 'var(--surface-3)', borderRadius: 4, marginTop: 8 }} />
                    <div style={{ height: 8, background: 'var(--surface-3)', borderRadius: 4, marginTop: 5, width: '70%' }} />
                    <div style={{ background: tenant.branding.accent, color: '#fff', padding: '7px 9px', borderRadius: 7, marginTop: 10, fontSize: 12.5, textAlign: 'center', fontWeight: 600 }}>Primary action</div>
                  </div>
                </div>
                <p className="muted" style={{ fontSize: 12, marginTop: 9 }}>Same build, different skin — PWA install icon and name follow the tenant.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Billing + audit */}
      <div className="cols cols-2">
        <div className="card">
          <div className="card-hd"><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Wallet size={17} style={{ color: 'var(--primary)' }} /><h3>Plans &amp; billing</h3></div></div>
          <div className="card-bd">
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div className="kpi-value" style={{ color: 'var(--primary)' }}>R {totalMrr.toLocaleString('en-ZA')}</div>
                <div className="kpi-label">Platform MRR</div>
              </div>
              <div className="muted" style={{ fontSize: 13 }}>{liveCount} paying · {trialCount} trial</div>
            </div>
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {tenants.map(t => (
                    <tr key={t.id}><td style={{ fontWeight: 500 }}>{t.name}</td><td className="num muted">{t.plan}</td><td className="num" style={{ color: t.mrr ? 'var(--text)' : 'var(--warning)' }}>{t.mrr ? `R ${t.mrr.toLocaleString('en-ZA')}/mo` : 'trial'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-hd"><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ScrollText size={17} style={{ color: 'var(--primary)' }} /><h3>Platform audit log</h3><SourceBadge live={auditLive} /></div></div>
          <div className="card-bd" style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>
            {auditRows.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No audit events yet.</div>}
            {auditRows.map((e, i) => {
              const warn = e.level === 'warn';
              const meta = auditLive
                ? `${(e.created_at || '').replace('T', ' ').slice(0, 16)} · ${e.target_type || ''} · ${e.source || ''}`
                : `${e.ts} · ${e.tenant} · ${e.actor}`;
              return (
              <div key={e.id || i} style={{ padding: '10px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 500, color: warn ? 'var(--danger)' : 'var(--text)' }}>
                  {warn && <AlertTriangle size={14} />}{e.action}
                </div>
                <div className="eyebrow" style={{ marginTop: 3 }}>{meta}</div>
              </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Role-based home */}
      <div className="card">
        <div className="card-hd"><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><LayoutGrid size={17} style={{ color: 'var(--primary)' }} /><h3>One app, role-based home</h3></div></div>
        <div className="card-bd">
          <div className="cols" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            {ROLE_HOME_CARDS.map(c => (
              <div key={c.role} className="card" style={{ boxShadow: 'none', background: c.accent ? 'var(--primary-weak)' : 'var(--surface-2)', borderColor: c.accent ? 'var(--primary-weak-bd)' : 'var(--border)' }}>
                <div className="card-bd" style={{ padding: 13 }}>
                  <div className="eyebrow" style={{ color: c.accent ? 'var(--primary)' : 'var(--text-subtle)' }}>{c.role}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 5 }}>{c.home}</div>
                  <div className="progress" style={{ marginTop: 10 }}><span style={{ width: `${c.fill}%`, background: c.accent ? 'var(--primary)' : 'var(--text-subtle)' }} /></div>
                </div>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 14, marginBottom: 0 }}>Same install, same URL. Role decides the home screen and the nav — so the executive demo is one app, not six.</p>
        </div>
      </div>
    </div>
  );
};
