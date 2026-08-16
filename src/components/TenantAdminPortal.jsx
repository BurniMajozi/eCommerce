import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  PERMISSION_MATRIX, MOCK_TENANT_USERS, MOCK_ENTITLEMENT_RULES
} from '../data/mockData';
import { fetchTenantMembers } from '../tenant/adminReads';
import { fetchMembers, inviteMember, updateMemberRole, removeMember, fetchReports, isMedusaCatalogueEnabled } from '../catalogue/catalogueClient';
import { ConfirmDialog } from './ConfirmDialog';
import { downloadCsv, dateStamp } from '../utils/exportCsv';
import { FileBarChart, Plus, Play, Save, ArrowRight, Users, ListChecks, ShieldCheck, Trash2, PackageCheck, ClipboardList, GitBranch, ShieldQuestion, UserPlus, Mail, KeyRound, Copy, Loader2, RefreshCw, Download, Printer } from 'lucide-react';

const rand = (n) => `R ${Number(n || 0).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;

// Real tenant reports from live commerce data, with CSV + PDF export.
const REPORT_DEFS = {
  stock: {
    name: 'Stock valuation', pick: (r) => r.stockValuation?.rows ?? [],
    cols: [
      { key: 'sku', label: 'SKU' }, { key: 'name', label: 'Product' },
      { key: 'onHand', label: 'On hand', num: true },
      { key: 'unitCost', label: 'Unit cost', num: true, money: true, restrict: true },
      { key: 'unitPrice', label: 'Unit price', num: true, money: true },
      { key: 'stockCost', label: 'Stock @ cost', num: true, money: true, restrict: true },
      { key: 'stockRetail', label: 'Stock @ retail', num: true, money: true },
      { key: 'potentialProfit', label: 'Potential profit', num: true, money: true, restrict: true },
      { key: 'margin', label: 'Margin %', num: true, pct: true },
    ],
  },
  reorder: {
    name: 'Reorder (low cover)', pick: (r) => r.reorder?.rows ?? [],
    cols: [
      { key: 'sku', label: 'SKU' }, { key: 'name', label: 'Product' }, { key: 'category', label: 'Category' },
      { key: 'onHand', label: 'On hand', num: true }, { key: 'inTransit', label: 'In transit', num: true },
      { key: 'dailyConsumption', label: 'Daily use', num: true }, { key: 'coverDays', label: 'Cover (days)', num: true, flag: (v) => v < 7 },
      { key: 'leadTimeDays', label: 'Lead (days)', num: true },
    ],
  },
  customers: {
    name: 'Customer spend', pick: (r) => r.customerSpend?.rows ?? [],
    cols: [
      { key: 'company', label: 'Customer' }, { key: 'currency', label: 'Cur' },
      { key: 'limit', label: 'Limit', num: true, money: true }, { key: 'spent', label: 'Spent', num: true, money: true },
      { key: 'pctUsed', label: '% used', num: true, pct: true, flag: (v) => v >= 80 },
    ],
  },
  orders: {
    name: 'Orders', pick: (r) => r.orders?.rows ?? [],
    cols: [
      { key: 'order', label: 'Order' }, { key: 'email', label: 'Customer' }, { key: 'currency', label: 'Cur' },
      { key: 'total', label: 'Total', num: true, money: true }, { key: 'status', label: 'Status' }, { key: 'date', label: 'Date' },
    ],
  },
};

const fmtCell = (col, v) => {
  if (v == null) return col.restrict ? 'Restricted' : '—';
  if (col.money) return rand(v);
  if (col.pct) return `${Number(v).toFixed(0)}%`;
  if (col.num) return Number(v).toLocaleString('en-ZA');
  return v;
};

const LiveReportBuilder = ({ scope, triggerNotification }) => {
  const live = isMedusaCatalogueEnabled && !!scope.accessToken && !!scope.tenantId;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [active, setActive] = useState('stock');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!live) { setData(null); return; }
    setLoading(true); setError(null);
    fetchReports(scope).then((r) => setData(r.reports ? r : { reports: r })).catch((e) => setError(e)).finally(() => setLoading(false));
  }, [live, scope.accessToken, scope.tenantId, scope.siteId, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const def = REPORT_DEFS[active];
  const rows = data?.reports ? def.pick(data.reports) : [];
  const totals = active === 'stock' ? data?.reports?.stockValuation?.totals : null;
  const generatedAt = data?.generatedAt ? new Date(data.generatedAt).toLocaleString('en-ZA') : null;

  const exportCsvNow = () => {
    downloadCsv(`sightlive-${active}-report-${dateStamp()}`, def.cols.map((c) => ({
      key: c.key, label: c.label,
      map: (row) => { const v = row[c.key]; if (v == null) return c.restrict ? 'Restricted' : ''; return c.money || c.pct || c.num ? v : v; },
    })), rows);
    triggerNotification('Report exported', `${def.name} · ${rows.length} rows to CSV.`, 'success');
  };

  const printPdf = () => {
    const w = window.open('', '_blank');
    if (!w) { triggerNotification('Popup blocked', 'Allow popups to export the PDF.', 'warning'); return; }
    const th = def.cols.map((c) => `<th style="text-align:${c.num ? 'right' : 'left'}">${c.label}</th>`).join('');
    const tb = rows.map((row) => `<tr>${def.cols.map((c) => `<td style="text-align:${c.num ? 'right' : 'left'}">${fmtCell(c, row[c.key])}</td>`).join('')}</tr>`).join('');
    w.document.write(`<html><head><title>${def.name} — SightLive</title><style>
      body{font-family:Inter,Arial,sans-serif;color:#111;padding:28px;font-size:12px}
      h1{font-size:19px;margin:0 0 2px} .sub{color:#666;font-size:11px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse} th,td{padding:6px 9px;border-bottom:1px solid #ddd}
      th{background:#f5f5f4;text-transform:uppercase;font-size:9.5px;letter-spacing:.05em}
      tfoot td{font-weight:700;border-top:2px solid #999}
    </style></head><body>
      <h1>${def.name}</h1><div class="sub">SightLive · generated ${generatedAt ?? dateStamp()} · ${rows.length} rows</div>
      <table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody>${totals ? `<tfoot><tr><td colspan="${def.cols.length - 3}">Totals</td><td style="text-align:right">${rand(totals.stockCostValue)}</td><td style="text-align:right">${rand(totals.stockRetailValue)}</td><td style="text-align:right">${rand(totals.potentialProfit)}</td></tr></tfoot>` : ''}</table>
    </body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
    triggerNotification('Print / PDF', `${def.name} opened — use “Save as PDF”.`, 'info');
  };

  return (
    <div className="card">
      <div className="card-hd">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileBarChart size={17} style={{ color: 'var(--primary)' }} /><h3>Reports</h3>
          <span className={`badge ${live ? 'badge-success' : 'badge-neutral'}`}>{live ? 'Live data' : 'Demo mode'}</span>
        </div>
        {live && <button className="btn btn-ghost btn-sm" onClick={() => setReloadKey((k) => k + 1)} disabled={loading} aria-label="Refresh">{loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}</button>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        <div style={{ width: 210, borderRight: '1px solid var(--border)', padding: 16, minWidth: 180 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Reports</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Object.entries(REPORT_DEFS).map(([k, d]) => (
              <button key={k} onClick={() => setActive(k)} className={`btn btn-sm ${k === active ? 'btn-primary' : 'btn-secondary'}`} style={{ justifyContent: 'flex-start' }}>{d.name}</button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, padding: 18, minWidth: 320 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3 style={{ fontSize: 18 }}>{def.name}</h3>
              {generatedAt && <div className="eyebrow">as at {generatedAt}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={exportCsvNow} disabled={!rows.length}><Download size={14} /> CSV</button>
              <button className="btn btn-primary btn-sm" onClick={printPdf} disabled={!rows.length}><Printer size={14} /> Print / PDF</button>
            </div>
          </div>

          {!live && <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>Sign in to the live tenant to run reports from real stock, order and customer data.</p>}
          {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 14 }}>{error.message || 'Report could not be generated.'}</p>}
          {live && !error && (
            <div className="table-wrap card" style={{ boxShadow: 'none', marginTop: 14 }}>
              <table className="table">
                <thead><tr>{def.cols.map((c) => <th key={c.key} className={c.num ? 'num' : ''}>{c.label}</th>)}</tr></thead>
                <tbody>
                  {rows.length === 0 && <tr><td colSpan={def.cols.length} className="muted" style={{ textAlign: 'center', padding: 22 }}>{loading ? 'Generating…' : 'No rows for this report yet.'}</td></tr>}
                  {rows.map((row, i) => (
                    <tr key={i}>
                      {def.cols.map((c) => {
                        const v = row[c.key];
                        const flagged = c.flag && v != null && c.flag(v);
                        return <td key={c.key} className={c.num ? 'num' : ''} style={flagged ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>{fmtCell(c, v)}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
                {totals && (
                  <tfoot>
                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border-strong)' }}>
                      <td colSpan={def.cols.length - 3}>Totals</td>
                      <td className="num">{rand(totals.stockCostValue)}</td>
                      <td className="num">{rand(totals.stockRetailValue)}</td>
                      <td className="num" style={{ color: 'var(--success)' }}>{rand(totals.potentialProfit)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

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

const ROLE_OPTS = ['Underground Driller', 'Electrical Tech', 'Storeman', 'Supervisor', 'Visitor', 'All roles'];
const ITEM_OPTS = ['Safety boots', 'Gloves (nitrile)', 'Arc flash kit', 'Dust mask FFP2', 'Hi-vis workwear', 'Ear protection'];
const CYCLE_OPTS = ['monthly', '3 months', '6 months', '12 months', 'unlimited'];

const permCell = (v, hot) => {
  if (v === 'yes') return <span className="dot" style={{ background: hot ? 'var(--primary)' : 'var(--success)', width: 9, height: 9 }} />;
  if (v === 'no') return <span style={{ color: 'var(--text-subtle)' }}>—</span>;
  return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{v}</span>;
};

export const TenantAdminPortal = () => {
  const { activePlant, triggerNotification, integrationMode, tenantAccess, auth } = useApp();
  const commerceScope = {
    accessToken: auth?.session?.access_token,
    tenantId: tenantAccess?.activeTenantId,
    siteId: tenantAccess?.activeSiteId,
  };
  const [rules, setRules] = useState(MOCK_ENTITLEMENT_RULES);
  const [nr, setNr] = useState({ role: 'Underground Driller', itemClass: 'Safety boots', qty: 1, cycle: '6 months' });
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

  const addRule = () => {
    setRules(prev => [...prev, { ...nr, threshold: 'auto' }]);
    triggerNotification('Entitlement rule added', `${nr.role} → ${nr.itemClass}: ${nr.qty || '∞'} per ${nr.cycle}. Feeds the approval engine.`, 'success');
  };
  const removeRule = (idx) => setRules(prev => prev.filter((_, i) => i !== idx));

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

      {/* Reports — live data, exportable to CSV / PDF */}
      <LiveReportBuilder scope={commerceScope} triggerNotification={triggerNotification} />

      {/* Permission matrix */}
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

        {/* Builder */}
        <div className="card-bd" style={{ borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: '1 1 160px' }}><label className="field-label">Role</label>
            <select className="select" value={nr.role} onChange={e => setNr({ ...nr, role: e.target.value })}>{ROLE_OPTS.map(o => <option key={o}>{o}</option>)}</select></div>
          <div className="field" style={{ flex: '1 1 160px' }}><label className="field-label">Item class</label>
            <select className="select" value={nr.itemClass} onChange={e => setNr({ ...nr, itemClass: e.target.value })}>{ITEM_OPTS.map(o => <option key={o}>{o}</option>)}</select></div>
          <div className="field" style={{ width: 90 }}><label className="field-label">Qty</label>
            <input type="number" min="0" className="input" value={nr.qty} onChange={e => setNr({ ...nr, qty: parseInt(e.target.value) || 0 })} /></div>
          <div className="field" style={{ flex: '1 1 140px' }}><label className="field-label">Cycle</label>
            <select className="select" value={nr.cycle} onChange={e => setNr({ ...nr, cycle: e.target.value })}>{CYCLE_OPTS.map(o => <option key={o}>{o}</option>)}</select></div>
          <button className="btn btn-primary" onClick={addRule}><Plus size={16} /> Add rule</button>
        </div>

        {/* Rules table */}
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Role</th><th>Item class</th><th className="num">Qty</th><th>Cycle</th><th>Threshold</th><th className="center"></th></tr></thead>
            <tbody>
              {rules.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{r.role}</td>
                  <td>{r.itemClass}</td>
                  <td className="num">{r.qty || '∞'}</td>
                  <td className="muted">{r.cycle}</td>
                  <td className="muted" style={{ fontSize: 12.5 }}>{r.threshold || 'auto-approve'}</td>
                  <td className="center"><button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => removeRule(i)} aria-label="Remove rule"><Trash2 size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card-bd" style={{ paddingTop: 12 }}>
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Threshold rules feed the approval engine — e.g. boots over R750 force a Section-Manager co-sign, and a 2nd issue of the same item inside 30 days escalates automatically.</p>
        </div>
      </div>
    </div>
  );
};
