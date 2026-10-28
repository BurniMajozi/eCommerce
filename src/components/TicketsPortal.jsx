import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import {
  fetchTickets, fetchTicket, createTicket, updateTicket,
  createTicketNote, updateTicketNote, deleteTicketNote, isMedusaCatalogueEnabled,
} from '../catalogue/catalogueClient';
import { SearchExportBar, matchQuery } from './TableToolbar';
import { downloadCsv, dateStamp } from '../utils/exportCsv';
import {
  Ticket, ShieldAlert, HardHat, Factory, Store, Receipt, ArrowUpCircle, Clock, Loader2,
  X, Check, Plus, MessageSquare, Pencil, Trash2, RefreshCcw, AlertTriangle, Megaphone,
} from 'lucide-react';

const rands = (n, cur = 'ZAR') => `${cur === 'ZAR' ? 'R' : cur + ' '}${Number(n || 0).toLocaleString('en-ZA')}`;
const since = (d) => { if (!d) return null; const t = Date.parse(d); if (Number.isNaN(t)) return null; const days = Math.floor((Date.now() - t) / 86400000); return days <= 0 ? 'today' : `${days}d ago`; };

// Category → label, icon, common-key readout.
export const CAT = {
  ppe_request: { label: 'PPE Request', icon: HardHat },
  purchase_order: { label: 'Purchase Order', icon: Factory },
  invoice: { label: 'Invoice', icon: Receipt },
  store_sale: { label: 'Store Sale', icon: Store },
  escalation: { label: 'Escalation', icon: ArrowUpCircle },
  safety_incident: { label: 'Safety Report', icon: ShieldAlert },
  safety_alert: { label: 'Safety Alert', icon: Megaphone },
};
const STATUS_BADGE = {
  open: 'badge-neutral', pending_approval: 'badge-warning', in_progress: 'badge-info', acknowledged: 'badge-info',
  approved: 'badge-success', sent: 'badge-info', received: 'badge-success',
  resolved: 'badge-success', rejected: 'badge-danger', cancelled: 'badge-neutral', closed: 'badge-neutral',
};
const PRIORITY_BADGE = { critical: 'badge-danger', high: 'badge-warning', normal: 'badge-neutral', low: 'badge-neutral' };
const prettyStatus = (s) => String(s || '').replace(/_/g, ' ');

// A member can decide (approve/reject/resolve) a ticket with an approver
// capability, a commerce manager cap, or the platform owner cap. Demo shows all.
const useCanDecide = () => {
  const { tenantAccess } = useApp();
  const demo = !tenantAccess || tenantAccess.mode === 'demo';
  if (demo) return true;
  return ['ppe.approve.tier1', 'ppe.approve.tier2', 'platform.manage', 'commerce.manage']
    .some((c) => tenantAccess.hasCapability?.(c));
};

/* ─────────────────────────  Ticket detail + notes CRUD  ───────────────────── */
export const TicketDetailModal = ({ ticketId, onClose, onChanged }) => {
  const { auth, tenantAccess, triggerNotification } = useApp();
  const scope = { accessToken: auth?.session?.access_token, tenantId: tenantAccess?.activeTenantId, siteId: tenantAccess?.activeSiteId };
  const me = auth?.session?.user?.user_metadata?.display_name || auth?.session?.user?.email || 'Me';
  const myId = auth?.session?.user?.id || null;
  const canDecide = useCanDecide();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [editingNote, setEditingNote] = useState(null); // { id, body }

  const load = useCallback(async () => {
    setError(null);
    try { setData(await fetchTicket(ticketId, scope)); }
    catch (e) { setError(e); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);
  useEffect(() => { setData(null); load(); }, [load]);

  const ticket = data?.ticket;
  const notes = data?.notes ?? [];
  const cat = ticket ? (CAT[ticket.category] || { label: ticket.category, icon: Ticket }) : null;
  const Icon = cat?.icon || Ticket;
  const decidable = ticket && ['open', 'pending_approval', 'in_progress'].includes(ticket.status);

  const resolve = async (decision) => {
    setBusy(true);
    try {
      await updateTicket(ticketId, { action: 'resolve', decision, approverName: me, reason: reason.trim() || undefined }, scope);
      triggerNotification(decision === 'approve' ? 'Ticket approved' : 'Ticket rejected', `${ticket.commonKey} · ${ticket.subject}`, decision === 'approve' ? 'success' : 'info');
      setRejecting(false); setReason('');
      await load(); onChanged?.();
    } catch (e) { triggerNotification('Could not update', e?.message || 'The ticket could not be decided.', 'danger'); }
    finally { setBusy(false); }
  };
  const addNote = async () => {
    const body = noteDraft.trim(); if (!body) return;
    setBusy(true);
    try { await createTicketNote(ticketId, { body, authorName: me }, scope); setNoteDraft(''); await load(); }
    catch (e) { triggerNotification('Note failed', e?.message || 'Could not add the note.', 'danger'); }
    finally { setBusy(false); }
  };
  const saveNote = async () => {
    if (!editingNote?.body.trim()) return;
    setBusy(true);
    try { await updateTicketNote(ticketId, editingNote.id, { body: editingNote.body.trim() }, scope); setEditingNote(null); await load(); }
    catch (e) { triggerNotification('Edit failed', e?.message || 'Could not edit the note.', 'danger'); }
    finally { setBusy(false); }
  };
  const removeNote = async (noteId) => {
    setBusy(true);
    try { await deleteTicketNote(ticketId, noteId, scope); await load(); }
    catch (e) { triggerNotification('Delete failed', e?.message || 'Could not delete the note.', 'danger'); }
    finally { setBusy(false); }
  };
  const canModifyNote = (n) => (n.authorUserId && n.authorUserId === myId) || canDecide;

  const acknowledge = async () => {
    setBusy(true);
    try { await updateTicket(ticketId, { action: 'acknowledge', approverName: me }, scope); triggerNotification('Acknowledged', `${ticket.commonKey} · ${ticket.subject}`, 'success'); await load(); onChanged?.(); }
    catch (e) { triggerNotification('Could not acknowledge', e?.message || 'Please try again.', 'danger'); }
    finally { setBusy(false); }
  };
  const escalate = async () => {
    setBusy(true);
    try { await updateTicket(ticketId, { action: 'escalate', escalatedBy: me }, scope); triggerNotification('Escalated', `${ticket.commonKey} sent to the approver.`, 'info'); await load(); onChanged?.(); }
    catch (e) { triggerNotification('Could not escalate', e?.message || 'Please try again.', 'danger'); }
    finally { setBusy(false); }
  };
  const meta = ticket?.metadata || {};
  const acknowledged = !!meta.acknowledgedBy;
  const isReport = ticket?.category === 'safety_incident';

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <div className="modal modal-lg" style={{ maxHeight: 'min(88vh, 720px)', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
            <Icon size={18} style={{ color: 'var(--primary)', flex: 'none' }} />
            <h3 style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ticket ? ticket.commonKey : 'Ticket'}</h3>
            {ticket && <span className="badge badge-neutral">{cat.label}</span>}
            {ticket?.escalated && <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><ArrowUpCircle size={11} /> escalated</span>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </div>

        <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '14px 18px', overflowY: 'auto' }}>
          {!data && !error && <div className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 16 }}><Loader2 size={16} className="spin" /> Loading ticket…</div>}
          {error && <div style={{ color: 'var(--danger)', fontSize: 13.5 }}>Couldn’t load the ticket. <button className="btn btn-ghost btn-sm" onClick={load}>Retry</button></div>}

          {ticket && (
            <>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{ticket.subject}</div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className={`badge ${STATUS_BADGE[ticket.status] || 'badge-neutral'}`}>{prettyStatus(ticket.status)}</span>
                  <span className={`badge ${PRIORITY_BADGE[ticket.priority] || 'badge-neutral'}`}>{ticket.priority}</span>
                  {ticket.reference && <span>Ref: {ticket.reference}</span>}
                  {ticket.value != null && <span>· {rands(ticket.value, ticket.currency)}</span>}
                  {meta.department && <span>· {meta.department}</span>}
                  {acknowledged && <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={11} /> acknowledged</span>}
                  <span>· opened {since(ticket.createdAt)}</span>
                </div>
              </div>

              {/* Safety alert body / safety report detail from metadata */}
              {meta.message && <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap', background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px' }}>{meta.message}</div>}
              {meta.audience && <div className="muted" style={{ fontSize: 12.5 }}>Affects: {meta.audience}</div>}

              {/* Attached safety photo (full image comes from the single-ticket read) */}
              {meta.imageUrl && (
                <a href={meta.imageUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
                  <img src={meta.imageUrl} alt="Safety report photo" style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 8, border: '1px solid var(--border)', objectFit: 'cover' }} />
                </a>
              )}

              {/* Safety actions: acknowledge (manager) + escalate (any member) */}
              {(isReport || !ticket.escalated) && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {isReport && canDecide && !acknowledged && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={acknowledge}><Check size={13} /> Acknowledge</button>}
                  {!ticket.escalated && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={escalate}><ArrowUpCircle size={13} /> Escalate</button>}
                </div>
              )}

              {ticket.escalated && (
                <div className="card" style={{ boxShadow: 'none', background: 'var(--danger-weak)', borderColor: 'var(--primary-weak-bd)' }}>
                  <div className="card-bd" style={{ padding: '10px 12px', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ArrowUpCircle size={15} style={{ color: 'var(--primary)' }} />
                    <span>Escalated to the approver{ticket.escalatedBy ? ` by ${ticket.escalatedBy}` : ''}{ticket.escalatedAt ? ` · ${since(ticket.escalatedAt)}` : ''}. Resolve it below to close the escalation.</span>
                  </div>
                </div>
              )}

              {/* Decide — the escalated party resolves within the ticket */}
              {decidable && canDecide && (
                <div className="card" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
                  <div className="card-bd" style={{ padding: 12 }}>
                    <div className="field-label" style={{ marginBottom: 8 }}>Decision {ticket.sourceType === 'purchase_order' ? '(drives the purchase order)' : ''}</div>
                    {!rejecting ? (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => resolve('approve')}>{busy ? <Loader2 size={13} className="spin" /> : <Check size={13} />} Approve</button>
                        <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => setRejecting(true)}><X size={13} /> Reject</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for rejection (optional)" />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => resolve('reject')}>{busy ? <Loader2 size={13} className="spin" /> : 'Confirm rejection'}</button>
                          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { setRejecting(false); setReason(''); }}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Notes thread — full CRUD */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <MessageSquare size={15} style={{ color: 'var(--primary)' }} />
                  <strong style={{ fontSize: 13.5 }}>Notes</strong>
                  <span className="badge badge-neutral">{notes.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {notes.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No notes yet. Add the first one below.</div>}
                  {notes.map((n) => (
                    <div key={n.id} className="card" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
                      <div className="card-bd" style={{ padding: '8px 12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ fontWeight: 600, fontSize: 12.5 }}>{n.authorName || 'User'}</span>
                          <span className="muted" style={{ fontSize: 11 }}>{since(n.createdAt)}{n.updatedAt && n.updatedAt !== n.createdAt ? ' · edited' : ''}</span>
                        </div>
                        {editingNote?.id === n.id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                            <textarea className="input" rows={2} value={editingNote.body} onChange={(e) => setEditingNote({ ...editingNote, body: e.target.value })} />
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-primary btn-sm" disabled={busy} onClick={saveNote}>Save</button>
                              <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setEditingNote(null)}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
                            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1 }}>{n.body}</div>
                            {canModifyNote(n) && n.authorName !== 'System' && (
                              <div style={{ display: 'flex', gap: 4, flex: 'none' }}>
                                <button className="icon-btn" title="Edit" onClick={() => setEditingNote({ id: n.id, body: n.body })}><Pencil size={13} /></button>
                                <button className="icon-btn" title="Delete" onClick={() => removeNote(n.id)}><Trash2 size={13} /></button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'flex-end' }}>
                  <textarea className="input" rows={2} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="Add a note…" style={{ flex: 1 }} />
                  <button className="btn btn-secondary" disabled={busy || !noteDraft.trim()} onClick={addNote}><Plus size={14} /> Add</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/* ──────────────────────────────  Raise a ticket  ──────────────────────────── */
// Categories a person can raise by hand (source-backed ones like store sales are
// materialised automatically). Choosing the category allocates the ticket and
// its common key (SL-SAF / SL-REQ / SL-INV / SL-PO / SL-TKT).
const RAISE_CATEGORIES = [
  { key: 'safety_incident', label: 'Safety', subjectLabel: 'What happened?', subjectHint: 'e.g. Missing hand rail on Level 3 walkway' },
  { key: 'ppe_request', label: 'PPE Request', subjectLabel: 'What is needed?', subjectHint: 'e.g. Replacement gumboots — size 9' },
  { key: 'invoice', label: 'Invoice', subjectLabel: 'Invoice for', subjectHint: 'e.g. Rand Colliery — March PPE supply' },
  { key: 'purchase_order', label: 'Purchase Order', subjectLabel: 'Purchase order for', subjectHint: 'e.g. Restock nitrile gloves' },
  { key: 'safety_alert', label: 'General / Other', subjectLabel: 'Summary', subjectHint: 'Short summary of the ticket' },
];
const RaiseTicketModal = ({ onClose, onCreated, defaultCategory = 'safety_incident' }) => {
  const { auth, tenantAccess, triggerNotification } = useApp();
  const scope = { accessToken: auth?.session?.access_token, tenantId: tenantAccess?.activeTenantId, siteId: tenantAccess?.activeSiteId };
  const me = auth?.session?.user?.user_metadata?.display_name || auth?.session?.user?.email || 'Me';
  const [category, setCategory] = useState(defaultCategory);
  const [subject, setSubject] = useState('');
  const [priority, setPriority] = useState('high');
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const def = RAISE_CATEGORIES.find((c) => c.key === category) || RAISE_CATEGORIES[0];
  // 'General / Other' is stored as a plain manual ticket, not a broadcast alert.
  const apiCategory = category === 'safety_alert' ? 'safety_incident' : category;

  const submit = async () => {
    if (!subject.trim()) return;
    setBusy(true);
    try {
      const r = await createTicket({ category: apiCategory, subject: subject.trim(), priority, location: location.trim(), note: note.trim(), authorName: me }, scope);
      triggerNotification('Ticket raised', `${r?.ticket?.commonKey || ''} · ${subject.trim()}`, 'success');
      onCreated?.(r?.ticket);
    } catch (e) { triggerNotification('Could not raise ticket', e?.message || 'Please try again.', 'danger'); }
    finally { setBusy(false); }
  };

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Ticket size={18} style={{ color: 'var(--primary)' }} /><h3>Raise a ticket</h3></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </div>
        <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 18px' }}>
          <div className="field" style={{ margin: 0 }}><label className="field-label" style={{ marginBottom: 4 }}>Category</label>
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {RAISE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Allocates the ticket and its common key ({(CAT[apiCategory]?.label) || 'Ticket'}).</div>
          </div>
          <div className="field" style={{ margin: 0 }}><label className="field-label" style={{ marginBottom: 4 }}>{def.subjectLabel}</label>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={def.subjectHint} /></div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ margin: 0, flex: '1 1 130px' }}><label className="field-label" style={{ marginBottom: 4 }}>Priority</label>
              <select className="select" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="critical">Critical</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option>
              </select></div>
            <div className="field" style={{ margin: 0, flex: '1 1 130px' }}><label className="field-label" style={{ marginBottom: 4 }}>Location</label>
              <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Site / area" /></div>
          </div>
          <div className="field" style={{ margin: 0 }}><label className="field-label" style={{ marginBottom: 4 }}>Detail (optional)</label>
            <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add any detail…" /></div>
        </div>
        <div className="modal-ft" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '10px 18px', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !subject.trim()}>{busy ? <><Loader2 size={15} className="spin" /> Raising…</> : <><Plus size={15} /> Raise ticket</>}</button>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────  The hub view  ─────────────────────────────── */
const FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'escalated', label: 'Escalated' },
  { key: 'safety_incident', label: 'Safety Reports' },
  { key: 'safety_alert', label: 'Safety Alerts' },
  { key: 'ppe_request', label: 'PPE Requests' },
  { key: 'purchase_order', label: 'Purchase Orders' },
  { key: 'store_sale', label: 'Store Sales' },
  { key: 'invoice', label: 'Invoices' },
  { key: 'escalation', label: 'Escalations' },
];

export const TicketsPortal = ({ embedded = false }) => {
  const { auth, tenantAccess } = useApp();
  const scope = { accessToken: auth?.session?.access_token, tenantId: tenantAccess?.activeTenantId, siteId: tenantAccess?.activeSiteId };
  const live = isMedusaCatalogueEnabled && !!scope.accessToken && !!scope.tenantId;
  const scopeKey = live ? `${scope.tenantId}:${scope.siteId ?? '*'}` : null;

  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState(null);
  const [raising, setRaising] = useState(false);

  useEffect(() => {
    if (!live) { setRows([]); setError(null); return undefined; }
    let active = true;
    setRows(null); setError(null);
    fetchTickets(scope)
      .then((r) => { if (active) setRows(Array.isArray(r?.tickets) ? r.tickets : []); })
      .catch((e) => { if (active) { setRows([]); setError(e); } });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, scopeKey, reloadKey]);

  const loading = live && rows === null;
  const all = rows ?? [];
  const byFilter = all.filter((t) => filter === 'ALL' ? true : filter === 'escalated' ? t.escalated : t.category === filter);
  const shown = byFilter.filter((t) => matchQuery(t, search, ['commonKey', 'subject', 'reference', 'status', 'category', 'escalatedBy']));
  const openCount = all.filter((t) => !['approved', 'rejected', 'resolved', 'closed', 'cancelled', 'received'].includes(t.status)).length;
  const escCount = all.filter((t) => t.escalated).length;

  const exportRows = () => downloadCsv(`sightlive-tickets-${dateStamp()}`, [
    { key: 'commonKey', label: 'Ticket' }, { key: 'category', label: 'Category', map: (t) => CAT[t.category]?.label || t.category },
    { key: 'subject', label: 'Subject' }, { key: 'reference', label: 'Reference', map: (t) => t.reference || '' },
    { key: 'status', label: 'Status', map: (t) => prettyStatus(t.status) }, { key: 'priority', label: 'Priority' },
    { key: 'escalated', label: 'Escalated', map: (t) => (t.escalated ? 'yes' : '') },
    { key: 'value', label: 'Value', map: (t) => (t.value == null ? '' : Number(t.value).toFixed(2)) },
    { key: 'createdAt', label: 'Opened', map: (t) => (t.createdAt || '').slice(0, 10) },
  ], shown);

  return (
    <div className={embedded ? '' : 'animate-fade-in'} style={{ display: 'flex', flexDirection: 'column', gap: embedded ? 12 : 22, paddingBottom: embedded ? 0 : 24 }}>
      {embedded ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Ticket size={18} style={{ color: 'var(--primary)' }} />
            <h3 style={{ margin: 0, fontSize: 17 }}>Tickets</h3>
            <span className={`badge ${escCount ? 'badge-warning' : 'badge-neutral'}`}>{escCount} escalated</span>
            <span className="badge badge-primary">{openCount} open</span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setRaising(true)}><Plus size={14} /> Raise ticket</button>
        </div>
      ) : (
        <div className="page-head">
          <div>
            <h2>Tickets</h2>
            <p>Every request, purchase, invoice, escalation and safety report is a ticket with a common key and its own approval journey. Escalation is one branch of that journey — visible here at every level.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`badge ${escCount ? 'badge-warning' : 'badge-neutral'}`}>{escCount} escalated</span>
            <span className="badge badge-primary">{openCount} open</span>
            <button className="btn btn-primary btn-sm" onClick={() => setRaising(true)}><Plus size={14} /> Raise ticket</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-hd" style={{ gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {FILTERS.map((f) => (
              <button key={f.key} className={`btn btn-sm ${filter === f.key ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(f.key)}>{f.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {all.length > 0 && <SearchExportBar value={search} onChange={setSearch} placeholder="Search key, subject, ref…" onExport={exportRows} exportDisabled={!shown.length} width={200} />}
            {live && <button className="btn btn-ghost btn-sm" onClick={() => setReloadKey((k) => k + 1)} disabled={loading} aria-label="Refresh">{loading ? <Loader2 size={14} className="spin" /> : <RefreshCcw size={14} />}</button>}
          </div>
        </div>

        {!live ? (
          <div className="card-bd muted" style={{ padding: 20, fontSize: 13.5 }}>Tickets are live data — connect a tenant to see the Safety board. Raising a ticket and the full notes/approval flow work once connected.</div>
        ) : loading ? (
          <div className="card-bd muted" style={{ padding: 20, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8 }}><Loader2 size={15} className="spin" /> Loading tickets…</div>
        ) : error ? (
          <div className="card-bd" style={{ padding: 16, fontSize: 13.5 }}><span style={{ color: 'var(--danger)' }}>Couldn’t load tickets.</span> <button className="btn btn-ghost btn-sm" onClick={() => setReloadKey((k) => k + 1)}>Retry</button></div>
        ) : shown.length === 0 ? (
          <div className="card-bd muted" style={{ padding: 20, fontSize: 13.5 }}>{search || filter !== 'ALL' ? 'No tickets match this view.' : 'No tickets yet.'}</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Ticket</th><th>Category</th><th>Subject</th><th className="center">Priority</th><th className="center">Status</th><th className="num">Value</th><th className="center">Opened</th></tr></thead>
              <tbody>
                {shown.map((t) => {
                  const c = CAT[t.category] || { label: t.category, icon: Ticket };
                  const CIcon = c.icon;
                  return (
                    <tr key={t.id} style={{ cursor: 'pointer', ...(t.escalated ? { background: 'var(--danger-weak)' } : {}) }} onClick={() => setOpenId(t.id)}>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{t.commonKey}{t.escalated && <ArrowUpCircle size={12} style={{ color: 'var(--primary)', marginLeft: 5, verticalAlign: 'middle' }} />}</td>
                      <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><CIcon size={13} style={{ color: 'var(--text-subtle)' }} /><span className="badge badge-neutral" style={{ fontSize: 10.5 }}>{c.label}</span></span></td>
                      <td style={{ fontWeight: 500 }}>{t.subject}{t.reference ? <div className="eyebrow" style={{ marginTop: 2 }}>{t.reference}</div> : null}</td>
                      <td className="center"><span className={`badge ${PRIORITY_BADGE[t.priority] || 'badge-neutral'}`}>{t.priority}</span></td>
                      <td className="center"><span className={`badge ${STATUS_BADGE[t.status] || 'badge-neutral'}`}>{prettyStatus(t.status)}</span></td>
                      <td className="num tabular">{t.value == null ? '—' : rands(t.value, t.currency)}</td>
                      <td className="center muted" style={{ whiteSpace: 'nowrap' }}>{since(t.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 11.5, padding: '10px 14px', margin: 0 }}>Click a ticket to see its approval journey, resolve it, and read or add notes. Escalated tickets are highlighted.</p>
          </div>
        )}
      </div>

      {openId && <TicketDetailModal ticketId={openId} onClose={() => setOpenId(null)} onChanged={() => setReloadKey((k) => k + 1)} />}
      {raising && <RaiseTicketModal onClose={() => setRaising(false)} onCreated={() => { setRaising(false); setReloadKey((k) => k + 1); }} />}
    </div>
  );
};
