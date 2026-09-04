import React from 'react';
import { useApp } from '../context/AppContext';
import {
  HardHat, ClipboardCheck, PackageOpen, LineChart, Receipt,
  Building2, ShieldEllipsis, Tag, Boxes, ShoppingCart, BadgePercent,
  Percent, Truck, Upload, Wallet, Workflow, Radio, X, Factory, ClipboardList,
  PanelLeftClose, PanelLeftOpen, Store, Bug, ArrowUpCircle
} from 'lucide-react';
import { BugReportModal } from './BugReportModal';

// Each item declares the capability required to see it. In demo mode and for
// platform owners (platform.manage), everything is shown; otherwise the nav is
// filtered to the signed-in user's resolved capabilities so different provisioned
// users see different views.
export const NAV_GROUPS = [
  {
    label: 'Operations',
    items: [
      // Contractor Store is visible to store operators (issue stock) as well as
      // requesters, so a merchant with counter access sees what's being sold.
      { id: 'STORE', label: 'Contractor Store', icon: Store, capAny: ['ppe.request.create', 'ppe.stock.issue'] },
      { id: 'EMPLOYEE', label: 'Request PPE', icon: HardHat, cap: 'ppe.request.create' },
      { id: 'MANAGER', label: 'Approvals', icon: ClipboardCheck, cap: 'ppe.approve.tier1' },
      // Merchant escalation view — see & escalate stuck approvals (no approve/sign).
      { id: 'MERCHANT_APPROVALS', label: 'Escalations', icon: ArrowUpCircle, cap: 'ppe.approve.escalate' },
      { id: 'STOREKEEPER', label: 'Store Counter', icon: PackageOpen, cap: 'ppe.stock.issue' },
      { id: 'EXECUTIVE', label: 'Dashboard', icon: LineChart, cap: 'reports.read' }
    ]
  },
  {
    label: 'Commerce',
    items: [
      { id: 'MED_PRODUCTS', label: 'Products & Pricing', icon: Tag, cap: 'commerce.read' },
      { id: 'MED_INVENTORY', label: 'Inventory & Stock', icon: Boxes, cap: 'commerce.read' },
      { id: 'MED_PO', label: 'Purchase Orders', icon: ClipboardList, cap: 'commerce.manage' },
      { id: 'MERCHANT', label: 'Invoice', icon: Receipt, cap: 'commerce.read' },
      { id: 'MED_SUPPLIERS', label: 'Suppliers', icon: Factory, cap: 'commerce.manage' },
      { id: 'MED_CUSTOMERS', label: 'Customers & Limits', icon: Wallet, cap: 'commerce.manage' },
      { id: 'MED_ORDERS', label: 'Orders', icon: ShoppingCart, cap: 'commerce.read' },
      { id: 'MED_FULFIL', label: 'Fulfilment', icon: Truck, cap: 'commerce.manage' },
      { id: 'MED_PROMOS', label: 'Promotions', icon: BadgePercent, cap: 'commerce.manage' },
      { id: 'MED_TAX', label: 'Tax & VAT', icon: Percent, cap: 'commerce.manage' },
      { id: 'MED_IMPORT', label: 'CSV Import', icon: Upload, cap: 'commerce.manage' }
    ]
  },
  {
    label: 'Engine',
    items: [
      { id: 'MED_WORKFLOWS', label: 'Workflows', icon: Workflow, cap: 'commerce.manage' },
      { id: 'MED_EVENTS', label: 'Event Bus', icon: Radio, cap: 'commerce.manage' }
    ]
  },
  {
    label: 'Platform',
    items: [
      { id: 'TENANT_ADMIN', label: 'Tenant Admin', icon: Building2, cap: 'tenant.config.manage' },
      { id: 'OWNER', label: 'Platform Owner', icon: ShieldEllipsis, cap: 'platform.manage' }
    ]
  }
];

// Returns the nav groups visible to the current capability set (empty groups removed).
export function visibleNavGroups(tenantAccess) {
  const showAll = !tenantAccess || tenantAccess.mode === 'demo' || tenantAccess.hasCapability?.('platform.manage');
  const canSee = (item) => {
    if (showAll) return true;
    if (item.capAny) return item.capAny.some((c) => tenantAccess.hasCapability?.(c));
    return !item.cap || tenantAccess.hasCapability?.(item.cap);
  };
  return NAV_GROUPS
    .map((group) => ({ ...group, items: group.items.filter(canSee) }))
    .filter((group) => group.items.length > 0);
}

export const Sidebar = ({ open, onClose, activeRoleOverride = null }) => {
  const { activeRole, setActiveRole, tenantAccess, brand } = useApp();
  const [bugOpen, setBugOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(() => {
    try { return localStorage.getItem('sl_sidebar_collapsed') === '1'; } catch { return false; }
  });
  const toggleCollapsed = () => setCollapsed((c) => {
    const next = !c;
    try { localStorage.setItem('sl_sidebar_collapsed', next ? '1' : '0'); } catch { /* ignore */ }
    return next;
  });

  const groups = React.useMemo(() => visibleNavGroups(tenantAccess), [tenantAccess]);
  const visibleIds = React.useMemo(() => groups.flatMap((g) => g.items.map((i) => i.id)), [groups]);
  const selectedRole = activeRoleOverride ?? activeRole;

  // Land the user on a view they can actually access (e.g. a worker on Request
  // PPE, a merchant on B2B Sales) instead of a hidden default.
  React.useEffect(() => {
    if (visibleIds.length && !visibleIds.includes(activeRole)) setActiveRole(visibleIds[0]);
  }, [visibleIds, activeRole, setActiveRole]);

  const pick = (id) => { setActiveRole(id); if (onClose) onClose(); };

  return (
    <>
      <div className={`scrim ${open ? 'show' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${open ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-brand" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
          <div className="brand-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {brand?.logoUrl
              ? <img src={brand.logoUrl} alt={brand.tenantName || 'Tenant'} style={{ height: 28, maxWidth: 150, objectFit: 'contain', flex: 'none' }} />
              : <img src="/sightlive-logo.svg" alt="SightLive" style={{ height: 26, flex: 'none' }} />}
            <button className="collapse-btn" onClick={toggleCollapsed} title={collapsed ? 'Expand menu' : 'Collapse menu'} aria-label={collapsed ? 'Expand menu' : 'Collapse menu'} style={{ marginLeft: 'auto' }}>
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
            <button className="icon-btn sidebar-close" onClick={onClose} aria-label="Close menu" style={{ marginLeft: 'auto' }}><X size={18} /></button>
          </div>
          <div className="eyebrow sidebar-sub" style={{ fontSize: 9.5 }}>{brand?.tenantName || 'PPE Stock Platform'}</div>
        </div>

        <nav className="sidebar-nav">
          {groups.map(group => (
            <div key={group.label}>
              <div className="nav-group-label"><span>{group.label}</span></div>
              {group.items.map(item => {
                const Icon = item.icon;
                return (
                  <button key={item.id} className={`nav-item ${selectedRole === item.id ? 'active' : ''}`} onClick={() => pick(item.id)} title={collapsed ? item.label : undefined}>
                    <Icon size={17} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <button className="nav-item" onClick={() => setBugOpen(true)} title={collapsed ? 'Report a bug' : undefined} style={{ marginTop: 4 }}>
          <Bug size={17} />
          <span>Report a bug</span>
        </button>
        <div className="sidebar-foot eyebrow">Multi-currency · cross-border ready</div>
      </aside>
      {bugOpen && <BugReportModal onClose={() => setBugOpen(false)} />}
    </>
  );
};
