import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { fetchTickets, createTicket, updateTicket, sendSafetyAlert, isMedusaCatalogueEnabled } from '../catalogue/catalogueClient';
import { SearchExportBar, matchQuery } from './TableToolbar';
import { downloadCsv, dateStamp } from '../utils/exportCsv';
import { TicketDetailModal } from './TicketsPortal';
import {
  ShieldAlert, Megaphone, Camera, Loader2, RefreshCcw, Check, ArrowUpCircle, X, Send, Clock, Image as ImageIcon,
} from 'lucide-react';

const since = (d) => { if (!d) return null; const t = Date.parse(d); if (Number.isNaN(t)) return null; const days = Math.floor((Date.now() - t) / 86400000); return days <= 0 ? 'today' : `${days}d ago`; };
const PRIORITY_BADGE = { critical: 'badge-danger', high: 'badge-warning', normal: 'badge-neutral', low: 'badge-neutral' };
const SEV_BADGE = { critical: 'badge-danger', warning: 'badge-warning', info: 'badge-info' };
const prettyStatus = (s) => String(s || '').replace(/_/g, ' ');

// Downscale a picked image to a small JPEG data URL so a photo can ride along on
// the ticket without bloating the payload.
function downscaleImage(file, maxDim = 1280, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
        else if (height >= width && height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        try { resolve(canvas.toDataURL('image/jpeg', quality)); } catch (e) { reject(e); }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const useScope = () => {
  const { auth, tenantAccess } = useApp();
  const scope = { accessToken: auth?.session?.access_token, tenantId: tenantAccess?.activeTenantId, siteId: tenantAccess?.activeSiteId };
  const live = isMedusaCatalogueEnabled && !!scope.accessToken && !!scope.tenantId;
  const me = auth?.session?.user?.user_metadata?.display_name || auth?.session?.user?.email || 'Me';
  const demo = !tenantAccess || tenantAccess.mode === 'demo';
  const canManage = demo || ['ppe.approve.tier1', 'ppe.approve.tier2', 'platform.manage', 'tenant.config.manage'].some((c) => tenantAccess.hasCapability?.(c));
  return { scope, live, me, demo, canManage, scopeKey: live ? `${scope.tenantId}:${scope.siteId ?? '*'}` : null };
};

/* ═══════════════════════════  Report a safety issue  ═══════════════════════ */
export const ReportSafetyPortal = () => {
  const { triggerNotification } = useApp();
  const { scope, live, me, canManage, scopeKey } = useScope();
  const fileRef = useRef(null);

  const [subject, setSubject] = useState('');
  const [severity, setSeverity] = useState('high');
  const [department, setDepartment] = useState('');
  const [location, setLocation] = useState('');
  const [detail, setDetail] = useState('');
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);

  const [rows, setRows] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState('');
  const [actingId, setActingId] = useState(null);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(() => setReloadKey((k) => k + 1), []);
  useEffect(() => {
    if (!live) { setRows([]); return undefined; }
    let active = true; setRows(null);
    fetchTickets(scope, { category: 'safety_incident' })
      .then((r) => { if (active) setRows(Array.isArray(r?.tickets) ? r.tickets : []); })
      .catch(() => { if (active) setRows([]); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, scopeKey, reloadKey]);

  const pickImage = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    try { setImage(await downscaleImage(file)); } catch { triggerNotification('Photo error', 'Could not read that image. Try another.', 'warning'); }
  };
  const submit = async () => {
    if (!subject.trim()) return;
    setBusy(true);
    try {
      await createTicket({ category: 'safety_incident', subject: subject.trim(), priority: severity, department: department.trim(), location: location.trim(), note: detail.trim(), imageUrl: image, authorName: me }, scope);
      triggerNotification('Safety report sent', 'Your report was sent to the manager for acknowledgment.', 'success');
      setSubject(''); setDepartment(''); setLocation(''); setDetail(''); setImage(''); if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (e) { triggerNotification('Could not send report', e?.message || 'Please try again.', 'danger'); }
    finally { setBusy(false); }
  };

  const act = async (t, action) => {
    setActingId(t.id);
    try {
      await updateTicket(t.id, action === 'acknowledge' ? { action: 'acknowledge', approverName: me } : { action: 'escalate', escalatedBy: me }, scope);
      triggerNotification(action === 'acknowledge' ? 'Acknowledged' : 'Escalated', `${t.commonKey} · ${t.subject}`, action === 'acknowledge' ? 'success' : 'info');
      load();
    } catch (e) { triggerNotification('Action failed', e?.message || 'Please try again.', 'danger'); }
    finally { setActingId(null); }
  };

  const all = rows ?? [];
  const shown = all.filter((t) => matchQuery(t, search, ['commonKey', 'subject', 'reference', 'status']) || matchQuery(t.metadata || {}, search, ['department', 'reportedBy', 'location']));
  const exportRows = () => downloadCsv(`sightlive-safety-reports-${dateStamp()}`, [
    { key: 'commonKey', label: 'Ticket' }, { key: 'subject', label: 'Issue' },
    { key: 'reportedBy', label: 'Reported by', map: (t) => t.metadata?.reportedBy || '' },
    { key: 'department', label: 'Department', map: (t) => t.metadata?.department || '' },
    { key: 'priority', label: 'Severity' }, { key: 'status', label: 'Status', map: (t) => prettyStatus(t.status) },
    { key: 'acknowledged', label: 'Acknowledged by', map: (t) => t.metadata?.acknowledgedBy || '' },
    { key: 'createdAt', label: 'Reported', map: (t) => (t.createdAt || '').slice(0, 10) },
  ], shown);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 22, paddingBottom: 24 }}>
      <div className="page-head">
        <div>
          <h2>Report a safety issue</h2>
          <p>Anyone can report a hazard, near-miss or incident — add a photo. It becomes a safety ticket sent to the manager for acknowledgment, and can be escalated.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-hd"><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ShieldAlert size={17} style={{ color: 'var(--primary)' }} /><h3>New safety report</h3></div></div>
        <div className="card-bd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field" style={{ margin: 0 }}><label className="field-label" style={{ marginBottom: 4 }}>What did you see?</label>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Exposed cable near the Level 3 walkway" /></div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ margin: 0, flex: '1 1 150px' }}><label className="field-label" style={{ marginBottom: 4 }}>Severity</label>
              <select className="select" value={severity} onChange={(e) => setSeverity(e.target.value)}>
                <option value="critical">Critical</option><option value="high">Serious</option><option value="normal">Minor</option>
              </select></div>
            <div className="field" style={{ margin: 0, flex: '1 1 180px' }}><label className="field-label" style={{ marginBottom: 4 }}>Department</label>
              <input className="input" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Engineering & Maintenance" /></div>
            <div className="field" style={{ margin: 0, flex: '1 1 180px' }}><label className="field-label" style={{ marginBottom: 4 }}>Location</label>
              <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Site / area" /></div>
          </div>
          <div className="field" style={{ margin: 0 }}><label className="field-label" style={{ marginBottom: 4 }}>Detail (optional)</label>
            <textarea className="input" rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Describe what happened…" /></div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={pickImage} style={{ display: 'none' }} />
            <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}><Camera size={14} /> {image ? 'Change photo' : 'Add photo'}</button>
            {image && <><img src={image} alt="preview" style={{ height: 44, borderRadius: 6, border: '1px solid var(--border)' }} /><button className="btn btn-ghost btn-sm" onClick={() => { setImage(''); if (fileRef.current) fileRef.current.value = ''; }}><X size={13} /> Remove</button></>}
            <div style={{ flex: 1 }} />
            <button className="btn btn-primary" disabled={busy || !subject.trim()} onClick={submit}>{busy ? <><Loader2 size={15} className="spin" /> Sending…</> : <><Send size={15} /> Send report</>}</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-hd" style={{ gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ShieldAlert size={17} style={{ color: 'var(--primary)' }} /><h3>Safety reports</h3><span className="badge badge-neutral">{all.length}</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {all.length > 0 && <SearchExportBar value={search} onChange={setSearch} placeholder="Search issue, dept…" onExport={exportRows} exportDisabled={!shown.length} width={190} />}
            {live && <button className="btn btn-ghost btn-sm" onClick={load} disabled={rows === null} aria-label="Refresh">{rows === null ? <Loader2 size={14} className="spin" /> : <RefreshCcw size={14} />}</button>}
          </div>
        </div>
        {!live ? (
          <div className="card-bd muted" style={{ padding: 20, fontSize: 13.5 }}>Safety reports are live data — connect a tenant to see and file them.</div>
        ) : rows === null ? (
          <div className="card-bd muted" style={{ padding: 20, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8 }}><Loader2 size={15} className="spin" /> Loading reports…</div>
        ) : shown.length === 0 ? (
          <div className="card-bd muted" style={{ padding: 20, fontSize: 13.5 }}>{search ? 'No reports match your search.' : 'No safety reports yet.'}</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Ticket</th><th>Issue</th><th>Reported by</th><th className="center">Severity</th><th className="center">Status</th><th className="center">Action</th></tr></thead>
              <tbody>
                {shown.map((t) => {
                  const m = t.metadata || {};
                  const acted = actingId === t.id;
                  return (
                    <tr key={t.id} style={{ cursor: 'pointer', ...(t.escalated ? { background: 'var(--danger-weak)' } : {}) }} onClick={() => setOpenId(t.id)}>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{t.commonKey}{m.hasImage && <ImageIcon size={12} style={{ marginLeft: 5, color: 'var(--text-subtle)', verticalAlign: 'middle' }} />}</td>
                      <td style={{ fontWeight: 500 }}>{t.subject}{m.department ? <div className="eyebrow" style={{ marginTop: 2 }}>{m.department}</div> : null}</td>
                      <td className="muted">{m.reportedBy || '—'}</td>
                      <td className="center"><span className={`badge ${PRIORITY_BADGE[t.priority] || 'badge-neutral'}`}>{t.priority}</span></td>
                      <td className="center">{m.acknowledgedBy ? <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={11} /> ack</span> : <span className={`badge ${t.escalated ? 'badge-warning' : 'badge-neutral'}`}>{t.escalated ? 'escalated' : prettyStatus(t.status)}</span>}</td>
                      <td className="center" style={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                        {canManage && !m.acknowledgedBy && <button className="btn btn-secondary btn-sm" disabled={acted} onClick={() => act(t, 'acknowledge')}>{acted ? <Loader2 size={13} className="spin" /> : <Check size={13} />} Ack</button>}
                        {!t.escalated && <button className="btn btn-ghost btn-sm" style={{ marginLeft: 6 }} disabled={acted} onClick={() => act(t, 'escalate')}><ArrowUpCircle size={13} /> Escalate</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 11.5, padding: '10px 14px', margin: 0 }}>Click a report to see the photo, add notes, acknowledge or escalate. Reports go to the manager for acknowledgment.</p>
          </div>
        )}
      </div>

      {openId && <TicketDetailModal ticketId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
};

/* ══════════════════════════════  Safety alerts  ════════════════════════════ */
export const SafetyAlertsPortal = () => {
  const { triggerNotification, plants } = useApp();
  const { scope, live, me, canManage, scopeKey } = useScope();

  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState('warning');
  const [message, setMessage] = useState('');
  const [targetPlants, setTargetPlants] = useState([]);
  const [departments, setDepartments] = useState('');
  const [busy, setBusy] = useState(false);

  const [rows, setRows] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState(null);

  const load = useCallback(() => setReloadKey((k) => k + 1), []);
  useEffect(() => {
    if (!live) { setRows([]); return undefined; }
    let active = true; setRows(null);
    fetchTickets(scope, { category: 'safety_alert' })
      .then((r) => { if (active) setRows(Array.isArray(r?.tickets) ? r.tickets : []); })
      .catch(() => { if (active) setRows([]); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, scopeKey, reloadKey]);

  const togglePlant = (name) => setTargetPlants((prev) => prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]);
  const send = async () => {
    if (!title.trim() || !message.trim()) return;
    setBusy(true);
    try {
      const depts = departments.split(',').map((d) => d.trim()).filter(Boolean);
      const r = await sendSafetyAlert({ title: title.trim(), severity, message: message.trim(), plants: targetPlants, departments: depts, sentByName: me }, scope);
      triggerNotification('Safety alert sent', r?.emailed ? `Broadcast to ${r.recipients} staff by email + the alert feed.` : 'Posted to the alert feed for all staff.', 'success');
      setTitle(''); setMessage(''); setTargetPlants([]); setDepartments('');
      load();
    } catch (e) { triggerNotification('Could not send alert', e?.message || 'Please try again.', 'danger'); }
    finally { setBusy(false); }
  };

  const all = rows ?? [];
  const shown = all.filter((t) => matchQuery(t, search, ['commonKey', 'subject']) || matchQuery(t.metadata || {}, search, ['message', 'audience', 'severity']));
  const exportRows = () => downloadCsv(`sightlive-safety-alerts-${dateStamp()}`, [
    { key: 'commonKey', label: 'Alert' }, { key: 'subject', label: 'Title' },
    { key: 'severity', label: 'Severity', map: (t) => t.metadata?.severity || '' },
    { key: 'audience', label: 'Affects', map: (t) => t.metadata?.audience || '' },
    { key: 'sentBy', label: 'Sent by', map: (t) => t.metadata?.sentBy || '' },
    { key: 'createdAt', label: 'Sent', map: (t) => (t.createdAt || '').slice(0, 10) },
  ], shown);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 22, paddingBottom: 24 }}>
      <div className="page-head">
        <div>
          <h2>Safety alerts</h2>
          <p>{canManage ? 'Broadcast a safety alert to staff and the affected departments or plants. It notifies everyone and is logged as a safety ticket.' : 'Safety alerts broadcast by your managers. Everyone sees the feed below.'}</p>
        </div>
      </div>

      {canManage && (
        <div className="card">
          <div className="card-hd"><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Megaphone size={17} style={{ color: 'var(--primary)' }} /><h3>Send a safety alert</h3></div></div>
          <div className="card-bd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="field" style={{ margin: 0, flex: '2 1 260px' }}><label className="field-label" style={{ marginBottom: 4 }}>Alert title</label>
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Gas leak — evacuate Shaft 4 immediately" /></div>
              <div className="field" style={{ margin: 0, flex: '1 1 150px' }}><label className="field-label" style={{ marginBottom: 4 }}>Severity</label>
                <select className="select" value={severity} onChange={(e) => setSeverity(e.target.value)}>
                  <option value="critical">Critical</option><option value="warning">Warning</option><option value="info">Info</option>
                </select></div>
            </div>
            <div className="field" style={{ margin: 0 }}><label className="field-label" style={{ marginBottom: 4 }}>Message</label>
              <textarea className="input" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What staff need to know and do…" /></div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 240px' }}>
                <label className="field-label" style={{ marginBottom: 6, display: 'block' }}>Affected plants {targetPlants.length === 0 && <span className="muted">(none = all)</span>}</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(plants || []).map((p) => (
                    <button key={p.id || p.name} type="button" className={`btn btn-sm ${targetPlants.includes(p.name) ? 'btn-primary' : 'btn-ghost'}`} onClick={() => togglePlant(p.name)}>{p.name}</button>
                  ))}
                </div>
              </div>
              <div className="field" style={{ margin: 0, flex: '1 1 240px' }}><label className="field-label" style={{ marginBottom: 4 }}>Affected departments <span className="muted">(comma-separated, optional)</span></label>
                <input className="input" value={departments} onChange={(e) => setDepartments(e.target.value)} placeholder="e.g. Underground, Engineering" /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" disabled={busy || !title.trim() || !message.trim()} onClick={send}>{busy ? <><Loader2 size={15} className="spin" /> Sending…</> : <><Megaphone size={15} /> Broadcast alert</>}</button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-hd" style={{ gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Megaphone size={17} style={{ color: 'var(--primary)' }} /><h3>Alert feed</h3><span className="badge badge-neutral">{all.length}</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {all.length > 0 && <SearchExportBar value={search} onChange={setSearch} placeholder="Search alerts…" onExport={exportRows} exportDisabled={!shown.length} width={190} />}
            {live && <button className="btn btn-ghost btn-sm" onClick={load} disabled={rows === null} aria-label="Refresh">{rows === null ? <Loader2 size={14} className="spin" /> : <RefreshCcw size={14} />}</button>}
          </div>
        </div>
        {!live ? (
          <div className="card-bd muted" style={{ padding: 20, fontSize: 13.5 }}>Safety alerts are live data — connect a tenant to send and see them.</div>
        ) : rows === null ? (
          <div className="card-bd muted" style={{ padding: 20, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8 }}><Loader2 size={15} className="spin" /> Loading alerts…</div>
        ) : shown.length === 0 ? (
          <div className="card-bd muted" style={{ padding: 20, fontSize: 13.5 }}>{search ? 'No alerts match your search.' : 'No safety alerts have been sent.'}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {shown.map((t) => {
              const m = t.metadata || {};
              const sev = m.severity || 'warning';
              return (
                <button key={t.id} onClick={() => setOpenId(t.id)} className="card" style={{ textAlign: 'left', margin: '0 14px 10px', boxShadow: 'none', cursor: 'pointer', borderLeft: `3px solid ${sev === 'critical' ? 'var(--danger)' : sev === 'warning' ? 'var(--warning)' : 'var(--primary)'}` }}>
                  <div className="card-bd" style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span className={`badge ${SEV_BADGE[sev] || 'badge-neutral'}`}>{sev}</span>
                      <strong style={{ fontSize: 14 }}>{t.subject}</strong>
                      <span className="muted" style={{ fontSize: 11.5, marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={11} />{since(t.createdAt)}</span>
                    </div>
                    {m.message && <div className="muted" style={{ fontSize: 12.5, marginTop: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{m.message}</div>}
                    <div className="eyebrow" style={{ marginTop: 4 }}>Affects: {m.audience || 'All staff'}{m.sentBy ? ` · by ${m.sentBy}` : ''} · {t.commonKey}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {openId && <TicketDetailModal ticketId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
};
