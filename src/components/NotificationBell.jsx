import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead, isMedusaCatalogueEnabled } from '../catalogue/catalogueClient';
import { Bell, Check, CheckCheck, ShieldAlert, Megaphone, ArrowUpCircle, Info } from 'lucide-react';

const since = (d) => {
  if (!d) return '';
  const t = Date.parse(d); if (Number.isNaN(t)) return '';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};
const SEV_COLOR = { critical: 'var(--danger)', warning: 'var(--warning)', success: 'var(--success)', info: 'var(--primary)' };
const TYPE_ICON = { safety_alert: Megaphone, safety_report: ShieldAlert, escalation: ArrowUpCircle, ack: Check, decision: Check };
const POLL_MS = 45000;

// Topbar bell: the durable, per-user notification surface. Reads this user's own
// fan-out rows; polls for unread; click-through jumps to the linked view.
export const NotificationBell = () => {
  const { auth, tenantAccess, setActiveRole } = useApp();
  const scope = { accessToken: auth?.session?.access_token, tenantId: tenantAccess?.activeTenantId, siteId: tenantAccess?.activeSiteId };
  const live = isMedusaCatalogueEnabled && !!scope.accessToken && !!scope.tenantId;
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef(null);

  const load = useCallback(async () => {
    if (!live) return;
    setLoading(true);
    try {
      const r = await fetchNotifications(scope, { limit: 30 });
      setItems(Array.isArray(r?.notifications) ? r.notifications : []);
      setUnread(Number(r?.unreadCount) || 0);
    } catch { /* transient — keep last */ }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, scope.accessToken, scope.tenantId, scope.siteId]);

  // Poll while mounted; refetch when the panel opens.
  useEffect(() => {
    if (!live) return undefined;
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [live, load]);
  useEffect(() => { if (open) load(); }, [open, load]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const openItem = async (n) => {
    setOpen(false);
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      try { await markNotificationRead(n.id, scope); } catch { /* ignore */ }
    }
    if (n.linkRole) setActiveRole(n.linkRole);
  };
  const markAll = async () => {
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnread(0);
    try { await markAllNotificationsRead(scope); } catch { /* ignore */ }
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="Notifications" title="Notifications" style={{ position: 'relative' }}>
        <Bell size={18} />
        {unread > 0 && (
          <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999, background: 'var(--danger)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="card" style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 'min(360px, calc(100vw - 24px))', maxHeight: 'min(70vh, 460px)', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)', zIndex: 95, overflow: 'hidden' }}>
          <div className="card-hd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Bell size={16} style={{ color: 'var(--primary)' }} /><h3 style={{ margin: 0, fontSize: 14 }}>Notifications</h3>{unread > 0 && <span className="badge badge-danger">{unread}</span>}</div>
            {items.some((n) => !n.read) && <button className="btn btn-ghost btn-sm" onClick={markAll} title="Mark all read"><CheckCheck size={14} /> Mark all</button>}
          </div>
          <div style={{ overflowY: 'auto' }}>
            {!live ? (
              <div className="muted" style={{ padding: 18, fontSize: 13 }}>Notifications are live data — connect a tenant to receive them.</div>
            ) : items.length === 0 ? (
              <div className="muted" style={{ padding: 18, fontSize: 13, textAlign: 'center' }}>{loading ? 'Loading…' : 'You’re all caught up.'}</div>
            ) : (
              items.map((n) => {
                const Icon = TYPE_ICON[n.type] || Info;
                return (
                  <button key={n.id} onClick={() => openItem(n)} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', width: '100%', textAlign: 'left', padding: '11px 14px', border: 'none', borderBottom: '1px solid var(--border)', background: n.read ? 'transparent' : 'var(--surface-2)', cursor: 'pointer' }}>
                    <span style={{ flex: 'none', marginTop: 1, color: SEV_COLOR[n.severity] || 'var(--primary)' }}><Icon size={16} /></span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                        <span style={{ fontWeight: n.read ? 500 : 700, fontSize: 13, color: 'var(--text)' }}>{n.title}</span>
                        <span className="muted" style={{ fontSize: 11, flex: 'none' }}>{since(n.createdAt)}</span>
                      </span>
                      {n.body && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{n.body}</span>}
                    </span>
                    {!n.read && <span style={{ flex: 'none', width: 8, height: 8, borderRadius: 999, background: 'var(--primary)', marginTop: 5 }} />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
