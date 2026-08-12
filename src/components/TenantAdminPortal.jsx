import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  MOCK_SAVED_REPORTS, MOCK_CREW_CONSUMPTION, PERMISSION_MATRIX,
  MOCK_TENANT_USERS, MOCK_ENTITLEMENT_RULES
} from '../data/mockData';
import { fetchTenantMembers } from '../tenant/adminReads';
import { FileBarChart, Plus, Play, Save, ArrowRight, Users, ListChecks, ShieldCheck, Trash2, PackageCheck, ClipboardList, GitBranch, ShieldQuestion } from 'lucide-react';

const SourceBadge = ({ live }) => (
  <span className={`badge ${live ? 'badge-success' : 'badge-neutral'}`}>{live ? 'Live · RLS' : 'Demo data'}</span>
);

const ROLE_OPTS = ['Underground Driller', 'Electrical Tech', 'Storeman', 'Supervisor', 'Visitor', 'All roles'];
const ITEM_OPTS = ['Safety boots', 'Gloves (nitrile)', 'Arc flash kit', 'Dust mask FFP2', 'Hi-vis workwear', 'Ear protection'];
const CYCLE_OPTS = ['monthly', '3 months', '6 months', '12 months', 'unlimited'];

const permCell = (v, hot) => {
  if (v === 'yes') return <span className="dot" style={{ background: hot ? 'var(--primary)' : 'var(--success)', width: 9, height: 9 }} />;
  if (v === 'no') return <span style={{ color: 'var(--text-subtle)' }}>—</span>;
  return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{v}</span>;
};

export const TenantAdminPortal = () => {
  const { activePlant, runScheduledReport, triggerNotification, integrationMode, tenantAccess } = useApp();
  const [activeReport, setActiveReport] = useState('consumption');
  const [groupBy, setGroupBy] = useState('crew');
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
  const membersLive = liveMembers !== null;

  const addRule = () => {
    setRules(prev => [...prev, { ...nr, threshold: 'auto' }]);
    triggerNotification('Entitlement rule added', `${nr.role} → ${nr.itemClass}: ${nr.qty || '∞'} per ${nr.cycle}. Feeds the approval engine.`, 'success');
  };
  const removeRule = (idx) => setRules(prev => prev.filter((_, i) => i !== idx));

  const report = MOCK_SAVED_REPORTS.find(r => r.id === activeReport) || MOCK_SAVED_REPORTS[0];
  const maxCons = Math.max(...MOCK_CREW_CONSUMPTION.map(c => c.value));

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

      {/* Report builder */}
      <div className="card">
        <div className="card-hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><FileBarChart size={17} style={{ color: 'var(--primary)' }} /><h3>Report builder</h3></div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {/* saved rail */}
          <div style={{ width: 220, borderRight: '1px solid var(--border)', padding: 16, minWidth: 190 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Saved</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {MOCK_SAVED_REPORTS.map(r => (
                <button key={r.id} onClick={() => setActiveReport(r.id)}
                  className={`btn btn-sm ${r.id === activeReport ? 'btn-primary' : 'btn-secondary'}`} style={{ justifyContent: 'flex-start' }}>
                  {r.name}
                </button>
              ))}
              <button className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start', borderStyle: 'dashed', borderWidth: 1, borderColor: 'var(--border-strong)' }} onClick={() => triggerNotification('New report', 'Blank report opened in the builder.', 'info')}>
                <Plus size={14} /> New report
              </button>
            </div>
          </div>

          {/* canvas */}
          <div style={{ flex: 1, padding: 18, minWidth: 320 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <h3 style={{ fontSize: 18 }}>{report.name}</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className="badge badge-neutral">Aug 2026</span>
                <select className="select" value={groupBy} onChange={e => setGroupBy(e.target.value)} style={{ width: 'auto', padding: '5px 10px', fontSize: 12.5 }}>
                  <option value="crew">by crew</option>
                  <option value="cost centre">by cost centre</option>
                  <option value="item class">by item class</option>
                </select>
                <span className="badge badge-primary" style={{ cursor: 'pointer' }}>+ filter</span>
              </div>
            </div>

            <div className="table-wrap card" style={{ boxShadow: 'none', marginTop: 14 }}>
              <table className="table">
                <thead>
                  <tr><th style={{ textTransform: 'capitalize' }}>{groupBy}</th><th className="num">Issues</th><th className="num">Heads</th><th className="num">R value</th><th className="num">vs Entitle</th><th>Distribution</th></tr>
                </thead>
                <tbody>
                  {MOCK_CREW_CONSUMPTION.map(c => (
                    <tr key={c.crew} className={c.flag ? 'row-flag' : ''}>
                      <td style={{ fontWeight: 500 }}>{c.crew}</td>
                      <td className="num">{c.issues}</td>
                      <td className="num">{c.heads}</td>
                      <td className="num">R {c.value.toLocaleString('en-ZA')}</td>
                      <td className="num" style={{ color: c.flag ? 'var(--danger)' : 'var(--text)', fontWeight: c.flag ? 600 : 400 }}>{c.vsEntitle}%</td>
                      <td style={{ width: 150 }}>
                        <div className="progress"><span style={{ width: `${(c.value / maxCons) * 100}%`, background: c.flag ? 'var(--primary)' : 'var(--text-subtle)' }} /></div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
              <div className="card" style={{ boxShadow: 'none', background: 'var(--surface-2)', flex: 1, minWidth: 240 }}>
                <div className="card-bd" style={{ padding: 14 }}>
                  <div className="eyebrow">Schedule</div>
                  <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>
                    Every 1st of the month, 06:00 · to mine manager, finance, SHEQ<br />PDF + XLS · also posts to Teams
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 220 }}>
                <button className="btn btn-primary btn-block" onClick={() => runScheduledReport(report.name)}><Play size={15} /> Run &amp; export</button>
                <button className="btn btn-secondary btn-block" onClick={() => triggerNotification('Template saved', `“${report.name}” saved as a reusable template.`, 'success')}><Save size={15} /> Save as template</button>
                <button className="btn btn-danger btn-block" onClick={() => triggerNotification('Drill-down', 'Opening Crew C issue-level detail…', 'info')}>Drill into Crew C <ArrowRight size={14} /></button>
              </div>
            </div>
          </div>
        </div>
      </div>

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

      {/* Users & roles */}
      <div>
        <div className="card">
          <div className="card-hd"><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Users size={17} style={{ color: 'var(--primary)' }} /><h3>Users &amp; roles</h3><SourceBadge live={membersLive} /></div></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Name</th><th>Role</th><th>Dept</th><th className="center">State</th></tr></thead>
              <tbody>
                {memberRows.length === 0 && (
                  <tr><td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 24 }}>No members visible for this tenant.</td></tr>
                )}
                {memberRows.map(u => (
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
        </div>

      </div>

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
