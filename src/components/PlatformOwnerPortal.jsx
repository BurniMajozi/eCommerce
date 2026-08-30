import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { MOCK_AUDIT_LOG, ROLE_HOME_CARDS } from '../data/mockData';
import { uploadTenantLogo, recordAudit } from '../tenant/adminReads';
import { fetchPlatformOverview, provisionPlatformTenant, updatePlatformTenant, fetchMembers, inviteMember, updateMemberRole, isMedusaCatalogueEnabled } from '../catalogue/catalogueClient';
import { Building2, Plus, Palette, Smartphone, Wallet, ScrollText, LayoutGrid, AlertTriangle, Users, ShieldCheck, HardHat } from 'lucide-react';
import { BugTriageCard } from './BugTriageCard';
import { BillingCard } from './BillingCard';

const ACCENT_SWATCHES = ['#EC3013', '#2563EB', '#0891B2', '#7C3AED', '#059669', '#D97706'];
const ROLE_LABELS = { worker: 'Worker', storekeeper: 'Storekeeper', supervisor: 'Supervisor', manager: 'Manager', executive: 'Executive', merchant: 'Merchant', tenant_admin: 'Tenant Admin' };
const roleLabel = (k) => ROLE_LABELS[k] || k;

const SourceBadge = ({ live }) => (
  <span className={`badge ${live ? 'badge-success' : 'badge-neutral'}`}>{live ? 'Live · RLS' : 'Demo data'}</span>
);

const InviteMember = ({ roles, onInvite }) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState(roles[0] || 'worker');
  const [busy, setBusy] = useState(false);
  return (
    <div className="card" style={{ boxShadow: 'none', background: 'var(--surface-2)', marginBottom: 14 }}>
      <div className="card-bd" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: '2 1 180px', margin: 0 }}>
          <label className="field-label">Invite email</label>
          <input className="input" type="email" placeholder="name@mine.co.za" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field" style={{ flex: '1 1 140px', margin: 0 }}>
          <label className="field-label">Full name</label>
          <input className="input" placeholder="Thabo Mokoena" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field" style={{ flex: '1 1 130px', margin: 0 }}>
          <label className="field-label">Role</label>
          <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
            {roles.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" disabled={!email.trim() || busy} onClick={async () => { setBusy(true); await onInvite(email.trim(), name.trim(), role); setEmail(''); setName(''); setBusy(false); }}>{busy ? 'Inviting…' : 'Invite'}</button>
      </div>
    </div>
  );
};

// Estimated MRR per tenant from the plan (matches the public pricing model):
// Merchant R990, Plant R5,900 + R250/user over 200,
// Group R24,900 + R150/user over 200, trial R0.
const PLAN_PRICE = { trial: 0, merchant: 990, plant: 5900, group: 24900 };
const estimateMrr = (t) => {
  const base = PLAN_PRICE[(t.plan || 'trial').toLowerCase()] ?? 0;
  const plan = (t.plan || '').toLowerCase();
  const perSeat = plan === 'plant' ? 250 : plan === 'group' ? 150 : 0;
  const seats = Math.max(0, (t.users || 0) - 200) * perSeat;
  return base + seats;
};

export const PlatformOwnerPortal = () => {
  const { tenants, selectedTenantId, setSelectedTenantId, modules, toggleTenantModule, integrationMode, auth, tenantAccess, triggerNotification } = useApp();
  const scope = { accessToken: auth?.session?.access_token, tenantId: tenantAccess?.activeTenantId, siteId: tenantAccess?.activeSiteId };
  const backend = isMedusaCatalogueEnabled && !!scope.accessToken && !!scope.tenantId;
  const [newTenantName, setNewTenantName] = useState('');
  const [overview, setOverview] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [liveMembers, setLiveMembers] = useState(null);
  // Per-tenant local overlays: module enablement + an instant logo preview
  // (works regardless of the private-bucket signed-URL round-trip).
  const [moduleOverrides, setModuleOverrides] = useState({});
  const [logoPreview, setLogoPreview] = useState({});
  const [statusBusyId, setStatusBusyId] = useState(null);

  // Suspend / reactivate a tenant. Suspension is enforced server-side by
  // resolve_access_scope (202608300001 migration): a non-active tenant grants
  // its members no scope, so they can't sign in until reactivated.
  const changeTenantStatus = async (t, status) => {
    setStatusBusyId(t.id);
    try {
      await updatePlatformTenant(t.id, { status }, scope);
      triggerNotification(
        status === 'suspended' ? 'Tenant suspended' : 'Tenant reactivated',
        status === 'suspended' ? `${t.name}'s users can no longer sign in.` : `${t.name} is active again.`,
        status === 'suspended' ? 'warning' : 'success',
      );
      reloadOverview();
    } catch (e) {
      triggerNotification('Update failed', e?.message || 'Could not change tenant status.', 'danger');
    } finally { setStatusBusyId(null); }
  };
  const [assignableRoles, setAssignableRoles] = useState([]);
  const [tempPw, setTempPw] = useState(null);

  // Everything the panel reads comes from one service-role call (no browser RLS).
  useEffect(() => {
    if (!backend) { setOverview(null); return; }
    let active = true;
    fetchPlatformOverview(scope).then(r => { if (active) setOverview(r); }).catch(() => { if (active) setOverview(null); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, scope.accessToken, scope.tenantId, reloadKey]);
  const reloadOverview = () => setReloadKey(k => k + 1);

  const liveTenants = overview?.tenants ?? null;
  const tenantRows = liveTenants ?? tenants;
  const tenantsLive = liveTenants !== null;
  const liveRbac = overview?.roles ?? null;
  const rbacLive = liveRbac !== null;
  const auditRows = overview?.audit ?? MOCK_AUDIT_LOG;
  const auditLive = !!overview?.audit;

  // Selected tenant — live-aware and normalised so branding/modules always exist.
  const rawSel = tenantRows.find(t => t.id === selectedTenantId) || tenantRows[0] || {};
  const tenant = {
    ...rawSel,
    id: rawSel.id,
    name: rawSel.name || 'Tenant',
    branding: {
      accent: rawSel.branding?.accent || '#F5721A',
      logo: rawSel.branding?.logo || (rawSel.name ? rawSel.name.charAt(0).toUpperCase() : '?'),
      logoPath: rawSel.branding?.logoPath || null,
    },
    modules: rawSel.modules || [],
  };

  // Module enablement (local overlay so toggles are visible for live tenants
  // too, with no browser RLS write).
  const activeModules = moduleOverrides[tenant.id] ?? tenant.modules;
  const toggleModule = (m) => {
    if (m.core) { triggerNotification('Core module', `“${m.label}” is core and can’t be switched off per tenant.`, 'warning'); return; }
    const cur = moduleOverrides[tenant.id] ?? tenant.modules;
    const has = cur.includes(m.id);
    const next = has ? cur.filter((x) => x !== m.id) : [...cur, m.id];
    setModuleOverrides((prev) => ({ ...prev, [tenant.id]: next }));
    triggerNotification('Module updated', `“${m.label}” ${has ? 'disabled' : 'enabled'} for ${tenant.name}.`, has ? 'info' : 'success');
    recordAudit(tenant.id, has ? 'module.disable' : 'module.enable', 'tenant', 'platform_owner', { module: m.id });
  };
  // Logo source: instant client preview if just uploaded, else the letter mark.
  const logoSrc = logoPreview[tenant.id] || null;

  // Members via the service-role backend (no browser RLS writes/reads).
  useEffect(() => {
    if (!backend) { setLiveMembers(null); return; }
    let active = true;
    fetchMembers(scope)
      .then(r => { if (active) { setLiveMembers(r.members ?? []); setAssignableRoles(r.assignableRoles ?? []); } })
      .catch(() => { if (active) setLiveMembers([]); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, scope.accessToken, scope.tenantId, reloadKey]);
  const reloadMembers = () => fetchMembers(scope).then(r => { setLiveMembers(r.members ?? []); if (r.assignableRoles) setAssignableRoles(r.assignableRoles); }).catch(() => {});

  const totalUsers = tenantRows.reduce((a, t) => a + (t.users || 0), 0);
  const liveCount = tenantRows.filter(t => t.state === 'live' || t.state === 'active' || t.status === 'active' || t.status === 'live').length;
  const trialCount = tenantRows.filter(t => t.trial || t.plan === 'trial' || t.state === 'setup' || t.status === 'setup').length;

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
            <button className="btn btn-primary" disabled={!newTenantName.trim() || !backend} onClick={async () => {
              try {
                const t = await provisionPlatformTenant({ name: newTenantName.trim() }, scope);
                setNewTenantName('');
                reloadOverview();
                triggerNotification('Tenant provisioned', `“${t.name}” created (setup · trial).`, 'success');
              } catch (err) {
                triggerNotification('Provision failed', err.message || 'Could not create tenant.', 'danger');
              }
            }}><Plus size={16} /> Provision</button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Tenant</th><th>Domain</th><th className="num">Users</th><th className="center">Plan</th><th className="num">MRR</th><th className="center">State</th><th className="center">Access</th></tr></thead>
            <tbody>
              {tenantRows.length === 0 && (
                <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 24 }}>No tenants visible for your access.</td></tr>
              )}
              {tenantRows.map(t => {
                const sel = t.id === selectedTenantId;
                const accent = t.branding?.accent || 'var(--primary)';
                const logo = t.branding?.logo || (t.name ? t.name.charAt(0).toUpperCase() : '?');
                const st = t.state || t.status || 'setup';
                const liveState = st === 'live' || st === 'active';
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
                    <td className="num">{estimateMrr(t) ? `R ${estimateMrr(t).toLocaleString('en-ZA')}` : '—'}</td>
                    <td className="center"><span className={`badge ${st === 'suspended' || st === 'closed' ? 'badge-danger' : liveState ? 'badge-success' : 'badge-warning'}`}>{st}</span></td>
                    <td className="center" onClick={(e) => e.stopPropagation()}>
                      {st === 'suspended' || st === 'closed'
                        ? <button className="btn btn-primary btn-sm" disabled={statusBusyId === t.id} onClick={() => changeTenantStatus(t, 'active')}>{statusBusyId === t.id ? '…' : 'Reactivate'}</button>
                        : <button className="btn btn-secondary btn-sm" disabled={statusBusyId === t.id} onClick={() => changeTenantStatus(t, 'suspended')}>{statusBusyId === t.id ? '…' : 'Suspend'}</button>}
                    </td>
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
                <span className="avatar" style={{ width: 52, height: 52, fontSize: 20, background: tenant.branding.accent, overflow: 'hidden', padding: 0 }}>
                  {logoSrc ? <img src={logoSrc} alt={tenant.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : tenant.branding.logo}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                    Upload logo
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      // Show the picked image immediately (instant preview).
                      const reader = new FileReader();
                      reader.onload = () => setLogoPreview((prev) => ({ ...prev, [tenant.id]: reader.result }));
                      reader.readAsDataURL(file);
                      // Best-effort persist to the private bucket.
                      try {
                        const path = await uploadTenantLogo(tenant.id, file);
                        await updatePlatformTenant(tenant.id, { logoPath: path }, scope);
                        triggerNotification('Logo uploaded', `Stored for ${tenant.name}.`, 'success');
                      } catch (err) {
                        triggerNotification('Logo previewed', `Shown for ${tenant.name}. Cloud store pending: ${err.message || 'storage unavailable'}.`, 'info');
                      }
                    }} />
                  </label>
                  <span className="muted" style={{ fontSize: 12 }}>PNG / SVG · private bucket</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                {ACCENT_SWATCHES.map(c => {
                  const on = tenant.branding.accent.toUpperCase() === c;
                  return (
                    <button key={c} onClick={async () => {
                      try {
                        await updatePlatformTenant(tenant.id, { accent: c }, scope);
                        reloadOverview();
                        triggerNotification('Accent updated', `${tenant.name} brand colour saved.`, 'success');
                      } catch (err) {
                        triggerNotification('Branding failed', err.message || 'Could not save accent.', 'danger');
                      }
                    }}
                      style={{ width: 34, height: 34, borderRadius: 8, background: c, cursor: 'pointer', border: on ? '2px solid var(--text)' : '2px solid var(--border)', outline: on ? '2px solid var(--text)' : 'none', outlineOffset: 2 }}
                      aria-label={`accent ${c}`} />
                  );
                })}
              </div>
              <div className="eyebrow" style={{ marginTop: 8 }}>accent colour</div>

              <div className="eyebrow" style={{ marginTop: 16, marginBottom: 8 }}>Modules</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {modules.map(m => {
                  const on = activeModules.includes(m.id);
                  return (
                    <button key={m.id} onClick={() => toggleModule(m)}
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
                      <span style={{ width: 16, height: 16, borderRadius: 4, background: 'rgba(255,255,255,.25)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, overflow: 'hidden' }}>
                        {logoSrc ? <img src={logoSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : tenant.branding.logo}
                      </span>
                      {tenant.name.split('—')[0].trim()}
                    </span>
                    <span>≡</span>
                  </div>
                  <div style={{ padding: 11, background: 'var(--surface)' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><HardHat size={13} style={{ color: tenant.branding.accent }} /> Request PPE</div>
                    {[['Safety boots', 'Footwear'], ['Hard hat', 'Head'], ['Nitrile gloves ×4', 'Hand']].map(([n, c], i) => (
                      <div key={n} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderTop: i ? '1px solid var(--border)' : '1px solid transparent' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n}</div>
                          <div style={{ fontSize: 9.5, color: 'var(--text-subtle)' }}>{c}</div>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: tenant.branding.accent, border: `1px solid ${tenant.branding.accent}`, borderRadius: 6, padding: '2px 7px', flex: 'none' }}>Request</span>
                      </div>
                    ))}
                    <div style={{ background: tenant.branding.accent, color: '#fff', padding: '7px 9px', borderRadius: 7, marginTop: 9, fontSize: 12, textAlign: 'center', fontWeight: 600 }}>Submit request</div>
                  </div>
                </div>
                <p className="muted" style={{ fontSize: 12, marginTop: 9 }}>Same build, different skin — the logo, accent, PWA install icon and name all follow the tenant.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Users & roles (real, RLS-scoped) */}
      <div className="card">
        <div className="card-hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Users size={17} style={{ color: 'var(--primary)' }} /><h3>Users &amp; roles — {tenant.name}</h3><SourceBadge live={liveMembers !== null} /></div>
          <span className="badge badge-neutral">{liveMembers ? liveMembers.length : (tenant.users ?? 0)} members</span>
        </div>
        <div className="card-bd">
          {/* Invite a member — via the service-role backend (no browser RLS). */}
          {backend && (
            <InviteMember
              roles={assignableRoles.length ? assignableRoles : ['worker', 'storekeeper', 'supervisor', 'manager', 'executive', 'merchant', 'tenant_admin']}
              onInvite={async (email, name, role) => {
                try {
                  const res = await inviteMember({ email, name, role }, scope);
                  triggerNotification('Member invited', `${email} added as ${roleLabel(role)}.`, 'success');
                  if (res.tempPassword) setTempPw({ email: res.email, pw: res.tempPassword });
                  reloadMembers();
                } catch (err) {
                  triggerNotification('Invite failed', err.message || 'Could not invite member.', 'danger');
                }
              }}
            />
          )}
          {tempPw && (
            <div className="card" style={{ boxShadow: 'none', background: 'var(--primary-weak)', marginBottom: 14 }}>
              <div className="card-bd" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220, fontSize: 13 }}><strong>Temporary password for {tempPw.email}</strong> — share securely; they change it on first sign-in. <code style={{ background: 'var(--surface)', padding: '2px 8px', borderRadius: 6 }}>{tempPw.pw}</code></div>
                <button className="btn btn-ghost btn-sm" onClick={() => setTempPw(null)}>Dismiss</button>
              </div>
            </div>
          )}
          {liveMembers === null ? (
            <div className="muted" style={{ fontSize: 13 }}>Connect the backend to list and manage this tenant's members.</div>
          ) : liveMembers.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>No members yet — invite the first user above.</div>
          ) : (
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table className="table">
                <thead><tr><th>Member</th><th>Email</th><th>Role</th><th className="center">Status</th></tr></thead>
                <tbody>
                  {liveMembers.map((m, i) => (
                    <tr key={m.membershipId || m.userId || i}>
                      <td style={{ fontWeight: 500 }}>{m.name}</td>
                      <td className="muted" style={{ fontSize: 12.5 }}>{m.email || '—'}</td>
                      <td>
                        <select className="select" style={{ padding: '4px 8px', fontSize: 12.5, width: 'auto' }} value={m.role || ''} disabled={m.status === 'suspended'}
                          onChange={async (e) => {
                            try {
                              await updateMemberRole(m.membershipId, e.target.value, scope);
                              triggerNotification('Role updated', `${m.name} is now ${roleLabel(e.target.value)}.`, 'success');
                              reloadMembers();
                            } catch (err) { triggerNotification('Role update failed', err.message || 'Could not change role.', 'danger'); }
                          }}>
                          {!m.role && <option value="">—</option>}
                          {(assignableRoles.length ? assignableRoles : ['worker', 'storekeeper', 'supervisor', 'manager', 'executive', 'merchant', 'tenant_admin']).map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                        </select>
                      </td>
                      <td className="center"><span className={`badge ${m.status === 'active' ? 'badge-success' : 'badge-warning'}`}>{m.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>Invites and role changes go through the service-role backend (<code>/app/members</code>), so they aren’t blocked by row-level security. Members are scoped to your signed-in tenant.</p>
        </div>
              </div>

              {/* Access control — real RBAC map (read-only) */}
      <div className="card">
        <div className="card-hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ShieldCheck size={17} style={{ color: 'var(--primary)' }} /><h3>Access control — roles &amp; capabilities</h3><SourceBadge live={rbacLive} /></div>
        </div>
        <div className="card-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {(liveRbac ?? []).map((r) => (
            <div key={r.id || r.key} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{ fontSize: 14 }}>{r.name}</strong>
                <span className="badge badge-neutral" style={{ fontSize: 10 }}>{r.key}</span>
                {r.privileged && <span className="badge badge-warning" style={{ fontSize: 10 }}>privileged</span>}
              </div>
              {r.description && <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{r.description}</div>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
                {r.capabilities.length === 0 && <span className="muted" style={{ fontSize: 12 }}>no capabilities</span>}
                {r.capabilities.map((c) => (
                  <span key={c.key} className={`badge ${c.requires_mfa ? 'badge-warning' : 'badge-neutral'}`} style={{ fontSize: 10.5 }}>{c.key}{c.requires_mfa ? ' · MFA' : ''}</span>
                ))}
              </div>
            </div>
          ))}
          {rbacLive && (liveRbac ?? []).length === 0 && <div className="muted" style={{ fontSize: 13 }}>No roles defined.</div>}
        </div>
      </div>

      {/* Billing, bug triage and audit — full width */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <BillingCard />

        <BugTriageCard />

        <div className="card">
          <div className="card-hd"><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ScrollText size={17} style={{ color: 'var(--primary)' }} /><h3>Platform audit log</h3><SourceBadge live={auditLive} /></div></div>
          <div className="card-bd" style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>
            {auditRows.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No audit events yet — owner actions will be recorded here once write auditing is enabled.</div>}
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
