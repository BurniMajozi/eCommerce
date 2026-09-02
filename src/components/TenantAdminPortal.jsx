import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  PERMISSION_MATRIX, MOCK_TENANT_USERS
} from '../data/mockData';
import { fetchTenantMembers } from '../tenant/adminReads';
import { fetchMembers, inviteMember, updateMemberRole, removeMember, isMedusaCatalogueEnabled } from '../catalogue/catalogueClient';
import { ConfirmDialog } from './ConfirmDialog';
import { LiveReportBuilder } from './LiveReportBuilder';
import { DEPARTMENTS, PPE_CATEGORIES } from '../entitlement/entitlement';
import { Plus, Play, Save, ArrowRight, Users, ListChecks, ShieldCheck, Trash2, PackageCheck, ClipboardList, GitBranch, ShieldQuestion, UserPlus, Mail, KeyRound, Copy, Loader2, RefreshCw, Pencil } from 'lucide-react';

const SourceBadge = ({ live }) => (
  <span className={`badge ${live ? 'badge-success' : 'badge-neutral'}`}>{live ? 'Live · RLS' : 'Demo data'}</span>
);

// Friendly labels for the tenant-assignable role keys the backend accepts.
const ROLE_LABELS = {
  worker: 'Worker', storekeeper: 'Storekeeper', supervisor: 'Supervisor',
  manager: 'Manager', executive: 'Executive', merchant: 'Merchant', tenant_admin: 'Tenant Admin',
};
const roleLabel = (key) => ROLE_LABELS[key] || key || '—';

// In-app member management wired to the Medusa /app/members routes (service-role
// backed). Tenant admins invite users, change roles, and suspend access here —
// no Supabase dashboard or SQL. Falls back to the read-only RLS/mock roster when
// the platform is in demo mode.
const MembersManager = ({ scope, triggerNotification, fallbackRows }) => {
  const live = isMedusaCatalogueEnabled && !!scope.accessToken && !!scope.tenantId;
  const [members, setMembers] = useState(null);
  const [assignable, setAssignable] = useState(['worker', 'storekeeper', 'supervisor', 'manager', 'executive', 'merchant', 'tenant_admin']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [invite, setInvite] = useState({ email: '', name: '', role: 'worker' });
  const [inviting, setInviting] = useState(false);
  const [lastInvite, setLastInvite] = useState(null); // { email, tempPassword }
  const [removeTarget, setRemoveTarget] = useState(null);

  const load = () => {
    if (!live) { setMembers(null); return; }
    setLoading(true); setError(null);
    fetchMembers(scope)
      .then((r) => { setMembers(r.members ?? []); if (Array.isArray(r.assignableRoles) && r.assignableRoles.length) setAssignable(r.assignableRoles); })
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  };
  useEffect(load, [live, scope.accessToken, scope.tenantId, scope.siteId]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitInvite = async (e) => {
    e.preventDefault();
    if (!invite.email.trim()) return;
    setInviting(true); setError(null); setLastInvite(null);
    try {
      const res = await inviteMember({ email: invite.email.trim(), name: invite.name.trim(), role: invite.role }, scope);
      triggerNotification('Member invited', `${invite.email} added as ${roleLabel(invite.role)}.`, 'success');
      if (res.tempPassword) setLastInvite({ email: res.email, tempPassword: res.tempPassword });
      setInvite({ email: '', name: '', role: invite.role });
      load();
    } catch (err) {
      setError(err);
      triggerNotification('Invite failed', err.message || 'Could not invite the member.', 'danger');
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (m, role) => {
    if (role === m.role) return;
    setBusyId(m.membershipId);
    try {
      await updateMemberRole(m.membershipId, role, scope);
      triggerNotification('Role updated', `${m.name} is now ${roleLabel(role)}.`, 'success');
      setMembers((prev) => prev.map((x) => (x.membershipId === m.membershipId ? { ...x, role } : x)));
    } catch (err) {
      triggerNotification('Update failed', err.message || 'Could not change the role.', 'danger');
    } finally {
      setBusyId(null);
    }
  };

  const doRemove = async (m) => {
    await removeMember(m.membershipId, scope);
    triggerNotification('Access suspended', `${m.name} can no longer sign in to this tenant.`, 'success');
    setMembers((prev) => prev.map((x) => (x.membershipId === m.membershipId ? { ...x, status: 'suspended' } : x)));
  };

  const copyPassword = () => {
    if (lastInvite?.tempPassword && navigator.clipboard) {
      navigator.clipboard.writeText(lastInvite.tempPassword).then(() => triggerNotification('Copied', 'Temporary password copied to clipboard.', 'info')).catch(() => {});
    }
  };

  const rows = live ? (members ?? []) : (fallbackRows ?? []);

  return (
    <div className="card">
      <div className="card-hd">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={17} style={{ color: 'var(--primary)' }} /><h3>Users &amp; roles</h3><SourceBadge live={live} />
        </div>
        {live && (
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading} aria-label="Refresh members">
            {loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
          </button>
        )}
      </div>

      {/* Invite form — only in live mode (needs the service-role backend). */}
      {live && (
        <form onSubmit={submitInvite} className="card-bd" style={{ borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: '2 1 220px' }}>
            <label className="field-label">Email</label>
            <input type="email" required className="input" placeholder="new.user@mine.co.za" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
          </div>
          <div className="field" style={{ flex: '2 1 180px' }}>
            <label className="field-label">Full name</label>
            <input type="text" className="input" placeholder="Thabo Mokoena" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
          </div>
          <div className="field" style={{ flex: '1 1 150px' }}>
            <label className="field-label">Role</label>
            <select className="select" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
              {assignable.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-primary" disabled={inviting}>
            {inviting ? <Loader2 size={16} className="spin" /> : <UserPlus size={16} />} Invite user
          </button>
        </form>
      )}

      {/* Temp-password hand-off banner (shown once after a new user is created). */}
      {lastInvite && (
        <div className="card-bd" style={{ borderBottom: '1px solid var(--border)', background: 'var(--primary-weak)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
            <KeyRound size={18} style={{ color: 'var(--primary)', marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Temporary password for {lastInvite.email}</div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>Share this securely. They sign in, then change it and enrol 2FA. It won’t be shown again.</div>
              <code style={{ display: 'inline-block', marginTop: 8, padding: '5px 10px', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, fontSize: 13, letterSpacing: '.02em' }}>{lastInvite.tempPassword}</code>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-secondary btn-sm" onClick={copyPassword}><Copy size={14} /> Copy</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setLastInvite(null)}>Dismiss</button>
            </div>
          </div>
        </div>
      )}

      {error && !inviting && (
        <div className="card-bd" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="muted" style={{ fontSize: 12.5, margin: 0, color: 'var(--danger)' }}>{error.message || 'Could not load members.'}</p>
        </div>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Name</th>{live && <th>Email</th>}<th>Role</th><th className="center">State</th>{live && <th className="center"></th>}</tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={live ? 5 : 4} className="muted" style={{ textAlign: 'center', padding: 24 }}>{loading ? 'Loading members…' : 'No members yet — invite your first user above.'}</td></tr>
            )}
            {live ? rows.map((m) => (
              <tr key={m.membershipId} style={{ opacity: m.status === 'suspended' ? 0.55 : 1 }}>
                <td><div style={{ fontWeight: 500 }}>{m.name}</div></td>
                <td className="muted" style={{ fontSize: 12.5 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Mail size={12} />{m.email || '—'}</span></td>
                <td>
                  <select className="select" style={{ padding: '4px 8px', fontSize: 12.5, width: 'auto' }} value={m.role || ''} disabled={busyId === m.membershipId || m.status === 'suspended'} onChange={(e) => changeRole(m, e.target.value)}>
                    {!m.role && <option value="">—</option>}
                    {assignable.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                  </select>
                </td>
                <td className="center"><span className={`badge ${m.status === 'active' ? 'badge-success' : 'badge-warning'}`}>{m.status}</span></td>
                <td className="center">
                  {m.status !== 'suspended' && (
                    <button className="icon-btn" style={{ width: 30, height: 30 }} disabled={busyId === m.membershipId} onClick={() => setRemoveTarget(m)} aria-label={`Suspend ${m.name}`}>
                      {busyId === m.membershipId ? <Loader2 size={14} className="spin" /> : <Trash2 size={15} />}
                    </button>
                  )}
                </td>
              </tr>
            )) : rows.map((u) => (
              <tr key={u.id}>
                <td><div style={{ fontWeight: 500 }}>{u.name}</div><div className="eyebrow">{u.id}</div></td>
                <td>{u.role}</td>
                <td className="muted">{u.dept}</td>
                <td className="center"><span className={`badge ${u.status === 'active' ? 'badge-success' : 'badge-warning'}`}>{u.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!live && (
        <div className="card-bd" style={{ paddingTop: 0 }}>
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Connect the live backend to invite and manage users in-app. In demo mode this roster is read-only.</p>
        </div>
      )}

      {removeTarget && (
        <ConfirmDialog
          title="Suspend member access"
          message={`Suspend ${removeTarget.name}? They keep their history but can no longer sign in to this tenant. You can re-invite them later to restore access.`}
          confirmLabel="Suspend access"
          danger
          onConfirm={() => doRemove(removeTarget)}
          onClose={() => setRemoveTarget(null)}
        />
      )}
    </div>
  );
};

const ROLE_OPTS = ['Underground Driller', 'Electrical Maintenance Tech', 'Storeman', 'Supervisor', 'Visitor'];
const CYCLE_OPTS = ['monthly', '3 months', '6 months', '12 months', '24 months', 'unlimited'];
const SCOPE_OPTS = [
  { v: 'department', label: 'Department' },
  { v: 'role', label: 'Role' },
  { v: 'individual', label: 'Individual' },
  { v: 'all', label: 'Everyone' },
];
const scopeLabel = { department: 'Dept', role: 'Role', individual: 'Person', all: 'All' };

const permCell = (v, hot) => {
  if (v === 'yes') return <span className="dot" style={{ background: hot ? 'var(--primary)' : 'var(--success)', width: 9, height: 9 }} />;
  if (v === 'no') return <span style={{ color: 'var(--text-subtle)' }}>—</span>;
  return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{v}</span>;
};

export const TenantAdminPortal = () => {
  const { activePlant, triggerNotification, integrationMode, tenantAccess, auth, entitlementRules, addEntitlementRule, updateEntitlementRule, removeEntitlementRule, employees } = useApp();
  const [editingRuleId, setEditingRuleId] = useState(null);
  const commerceScope = {
    accessToken: auth?.session?.access_token,
    tenantId: tenantAccess?.activeTenantId,
    siteId: tenantAccess?.activeSiteId,
  };
  const [nr, setNr] = useState({ scope: 'department', target: DEPARTMENTS[0], category: PPE_CATEGORIES[0], qty: 1, cycle: '6 months' });
  // Targets depend on scope: department list / role list / employee list.
  const targetOptions = nr.scope === 'department' ? DEPARTMENTS
    : nr.scope === 'role' ? ROLE_OPTS
    : nr.scope === 'individual' ? (employees || []).map((e) => ({ v: e.id, label: `${e.name} (${e.id})` }))
    : [];
  const [liveMembers, setLiveMembers] = useState(null);

  // Read-only live wiring for Users & roles. Demo mode keeps the mock roster.
  const activeTenantId = tenantAccess?.activeTenantId;
  useEffect(() => {
    if (integrationMode !== 'supabase' || !activeTenantId) { setLiveMembers(null); return; }
    let active = true;
    fetchTenantMembers(activeTenantId).then(rows => { if (active) setLiveMembers(rows ?? []); }).catch(() => { if (active) setLiveMembers([]); });
    return () => { active = false; };
  }, [integrationMode, activeTenantId]);

  const memberRows = liveMembers ?? MOCK_TENANT_USERS;

  const targetName = (r) => {
    if (r.scope === 'all') return 'Everyone';
    if (r.scope === 'individual') { const e = (employees || []).find((x) => x.id === r.target); return e ? e.name : r.target; }
    return r.target;
  };
  const startEdit = (r) => {
    setEditingRuleId(r.id);
    setNr({ scope: r.scope, target: r.scope === 'all' ? '*' : r.target, category: r.category, qty: r.qty, cycle: r.cycle });
  };
  const cancelEdit = () => { setEditingRuleId(null); setNr({ scope: 'department', target: DEPARTMENTS[0], category: PPE_CATEGORIES[0], qty: 1, cycle: '6 months' }); };
  const saveRule = () => {
    const target = nr.scope === 'all' ? '*' : (nr.scope === 'individual' ? (nr.target || (employees || [])[0]?.id) : nr.target);
    const threshold = nr.category === 'Arc Flash Protection' ? 'always 2nd approval' : 'auto-approve';
    if (editingRuleId) {
      updateEntitlementRule(editingRuleId, { scope: nr.scope, target, category: nr.category, qty: nr.qty, cycle: nr.cycle, threshold });
      triggerNotification('Rule updated', `${scopeLabel[nr.scope]} ${nr.scope === 'all' ? '' : targetName({ scope: nr.scope, target })} → ${nr.category}: ${nr.qty || '∞'} per ${nr.cycle}.`, 'success');
      cancelEdit();
    } else {
      addEntitlementRule({ scope: nr.scope, target, category: nr.category, qty: nr.qty, cycle: nr.cycle, threshold });
      triggerNotification('Entitlement rule added', `${scopeLabel[nr.scope]} ${nr.scope === 'all' ? '' : targetName({ scope: nr.scope, target })} → ${nr.category}: ${nr.qty || '∞'} per ${nr.cycle}.`, 'success');
    }
  };
  const removeRule = (id) => { if (editingRuleId === id) cancelEdit(); removeEntitlementRule(id); };

  const JOURNEY = [
    { icon: ListChecks, t: 'Entitlement rule', d: 'role gets X per cycle' },
    { icon: ClipboardList, t: 'Worker requests', d: 'picks item + size' },
    { icon: GitBranch, t: 'Quota check', d: 'within allowance?' },
    { icon: ShieldQuestion, t: 'Auto or escalate', d: 'over quota → co-sign' },
    { icon: PackageCheck, t: 'Issue at store', d: 'stock deducted' }
  ];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 22, paddingBottom: 24 }}>
      <div className="page-head">
        <div>
          <h2>Tenant admin · {activePlant.name}</h2>
          <p>Level 2 — this plant only. Build reports, manage users and roles, and set entitlement &amp; separation-of-duties rules.</p>
        </div>
        <span className="badge badge-neutral">M. van Wyk · Tenant Admin</span>
      </div>

      {/* Users & roles — in-app member management (invite / role / suspend) */}
      <MembersManager scope={commerceScope} triggerNotification={triggerNotification} fallbackRows={memberRows} />

      {/* Entitlement rules — journey + builder */}
      <div className="card">
        <div className="card-hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ListChecks size={17} style={{ color: 'var(--primary)' }} /><h3>Entitlement rules</h3></div>
          <span className="eyebrow">how a rule drives a request end-to-end</span>
        </div>

        {/* Journey */}
        <div className="card-bd" style={{ borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, flexWrap: 'wrap' }}>
            {JOURNEY.map((s, i) => {
              const Ico = s.icon;
              return (
                <React.Fragment key={s.t}>
                  <div className="card" style={{ boxShadow: 'none', background: 'var(--surface-2)', flex: '1 1 150px', minWidth: 140 }}>
                    <div className="card-bd" style={{ padding: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="avatar" style={{ width: 26, height: 26, fontSize: 12, background: 'var(--primary)' }}>{i + 1}</span>
                        <Ico size={16} style={{ color: 'var(--primary)' }} />
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 13, marginTop: 8 }}>{s.t}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{s.d}</div>
                    </div>
                  </div>
                  {i < JOURNEY.length - 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px', color: 'var(--primary)' }}><ArrowRight size={18} /></div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Builder — allocate a category to a department, role, individual or everyone */}
        <div className="card-bd" style={{ borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: '1 1 130px' }}><label className="field-label">Allocate to</label>
            <select className="select" value={nr.scope} onChange={e => {
              const scope = e.target.value;
              const target = scope === 'department' ? DEPARTMENTS[0] : scope === 'role' ? ROLE_OPTS[0] : scope === 'individual' ? (employees || [])[0]?.id : '*';
              setNr({ ...nr, scope, target });
            }}>{SCOPE_OPTS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}</select></div>
          {nr.scope !== 'all' && (
            <div className="field" style={{ flex: '1 1 200px' }}><label className="field-label">{nr.scope === 'department' ? 'Department' : nr.scope === 'role' ? 'Role' : 'Employee'}</label>
              <select className="select" value={nr.target} onChange={e => setNr({ ...nr, target: e.target.value })}>
                {targetOptions.map(o => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.v} value={o.v}>{o.label}</option>)}
              </select></div>
          )}
          <div className="field" style={{ flex: '1 1 170px' }}><label className="field-label">PPE category</label>
            <select className="select" value={nr.category} onChange={e => setNr({ ...nr, category: e.target.value })}>{PPE_CATEGORIES.map(o => <option key={o}>{o}</option>)}</select></div>
          <div className="field" style={{ width: 84 }}><label className="field-label">Qty</label>
            <input type="number" min="0" className="input" value={nr.qty} onChange={e => setNr({ ...nr, qty: parseInt(e.target.value) || 0 })} /></div>
          <div className="field" style={{ flex: '1 1 130px' }}><label className="field-label">Cycle</label>
            <select className="select" value={nr.cycle} onChange={e => setNr({ ...nr, cycle: e.target.value })}>{CYCLE_OPTS.map(o => <option key={o}>{o}</option>)}</select></div>
          <button className="btn btn-primary" onClick={saveRule}>{editingRuleId ? <><Save size={16} /> Save changes</> : <><Plus size={16} /> Add rule</>}</button>
          {editingRuleId && <button className="btn btn-secondary" onClick={cancelEdit}>Cancel</button>}
        </div>

        {/* Rules table */}
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Scope</th><th>Target</th><th>PPE category</th><th className="num">Qty</th><th>Cycle</th><th>Approval</th><th className="center"></th></tr></thead>
            <tbody>
              {(entitlementRules || []).length === 0 && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 20 }}>No entitlement rules yet.</td></tr>}
              {(entitlementRules || []).map((r) => (
                <tr key={r.id} className={editingRuleId === r.id ? 'row-flag' : ''}>
                  <td><span className="badge badge-neutral" style={{ fontSize: 10.5 }}>{scopeLabel[r.scope] || r.scope}</span></td>
                  <td style={{ fontWeight: 500 }}>{targetName(r)}</td>
                  <td>{r.category}</td>
                  <td className="num">{r.qty || '∞'}</td>
                  <td className="muted">{r.cycle}</td>
                  <td className="muted" style={{ fontSize: 12.5 }}>{r.threshold || 'auto-approve'}</td>
                  <td className="center" style={{ whiteSpace: 'nowrap' }}>
                    <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => startEdit(r)} aria-label="Edit rule" title="Edit"><Pencil size={14} /></button>
                    <button className="icon-btn" style={{ width: 30, height: 30, marginLeft: 4 }} onClick={() => removeRule(r.id)} aria-label="Remove rule" title="Remove"><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card-bd" style={{ paddingTop: 12 }}>
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Rules scope PPE to a <strong>department</strong>, <strong>role</strong> or <strong>individual</strong> — so an Underground Driller can’t draw Electrical (Arc Flash) PPE. Workers only see what they’re entitled to; over-quota or restricted items escalate for a co-sign.</p>
        </div>
      </div>

      {/* Reports — live data, exportable to CSV / PDF & Employee Allocation */}
      <LiveReportBuilder scope={commerceScope} triggerNotification={triggerNotification} />

      {/* Permission matrix — separation of duties */}
      <div className="card">
        <div className="card-hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ShieldCheck size={17} style={{ color: 'var(--primary)' }} /><h3>Permission matrix — separation of duties</h3></div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ minWidth: 190 }}>Capability</th>
                {PERMISSION_MATRIX.roles.map(r => <th key={r} className="center" style={{ color: r === 'Owner' ? 'var(--primary)' : 'var(--text-subtle)' }}>{r}</th>)}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_MATRIX.rows.map(row => (
                <tr key={row.cap}>
                  <td style={{ fontWeight: 500, color: row.critical ? 'var(--danger)' : 'var(--text)' }}>{row.cap}</td>
                  {row.vals.map((v, i) => {
                    const isOwner = PERMISSION_MATRIX.roles[i] === 'Owner';
                    const hot = (row.critical && v === 'yes') || (isOwner && v === 'yes');
                    return <td key={i} className="center">{permCell(v, hot)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card-bd" style={{ paddingTop: 0 }}>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Whoever <strong style={{ color: 'var(--text)' }}>issues</strong> can never <strong style={{ color: 'var(--text)' }}>approve</strong>, and neither can <strong style={{ color: 'var(--text)' }}>adjust</strong> stock without a manager co-sign. Every role change is itself logged.</p>
        </div>
      </div>
    </div>
  );
};
