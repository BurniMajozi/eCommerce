import React from 'react';
import { useApp } from '../context/AppContext';
import {
  HardHat, ClipboardCheck, PackageOpen, LineChart, Receipt,
  Building2, ShieldEllipsis, Tag, Boxes, ShoppingCart, BadgePercent,
  Percent, Truck, Upload, Wallet, Workflow, Radio, X
} from 'lucide-react';

// Each item declares the capability required to see it. In demo mode and for
// platform owners (platform.manage), everything is shown; otherwise the nav is
// filtered to the signed-in user's resolved capabilities so different provisioned
// users see different views.
export const NAV_GROUPS = [
  {
    label: 'Operations',
    items: [
      { id: 'EMPLOYEE', label: 'Request PPE', icon: HardHat, cap: 'ppe.request.create' },
      { id: 'MANAGER', label: 'Approvals', icon: ClipboardCheck, cap: 'ppe.approve.tier1' },
      { id: 'STOREKEEPER', label: 'Store Counter', icon: PackageOpen, cap: 'ppe.stock.issue' },
      { id: 'EXECUTIVE', label: 'Dashboard', icon: LineChart, cap: 'reports.read' }
    ]
  },
  {
    label: 'Commerce',
    items: [
      { id: 'MERCHANT', label: 'B2B Sales', icon: Receipt, cap: 'commerce.read' },
      { id: 'MED_PRODUCTS', label: 'Products & Pricing', icon: Tag, cap: 'commerce.read' },
      { id: 'MED_INVENTORY', label: 'Inventory & Stock', icon: Boxes, cap: 'commerce.read' },
      { id: 'MED_ORDERS', label: 'Orders', icon: ShoppingCart, cap: 'commerce.read' },
      { id: 'MED_PROMOS', label: 'Promotions', icon: BadgePercent, cap: 'commerce.manage' },
      { id: 'MED_TAX', label: 'Tax & VAT', icon: Percent, cap: 'commerce.manage' },
      { id: 'MED_FULFIL', label: 'Fulfilment', icon: Truck, cap: 'commerce.manage' },
      { id: 'MED_IMPORT', label: 'CSV Import', icon: Upload, cap: 'commerce.manage' },
      { id: 'MED_CUSTOMERS', label: 'Customers & Limits', icon: Wallet, cap: 'commerce.manage' }
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
  return NAV_GROUPS
    .map((group) => ({ ...group, items: showAll ? group.items : group.items.filter((i) => !i.cap || tenantAccess.hasCapability?.(i.cap)) }))
    .filter((group) => group.items.length > 0);
}

export const Sidebar = ({ open, onClose }) => {
  const { activeRole, setActiveRole, tenantAccess } = useApp();

  const groups = React.useMemo(() => visibleNavGroups(tenantAccess), [tenantAccess]);
  const visibleIds = React.useMemo(() => groups.flatMap((g) => g.items.map((i) => i.id)), [groups]);

  // Land the user on a view they can actually access (e.g. a worker on Request
  // PPE, a merchant on B2B Sales) instead of a hidden default.
  React.useEffect(() => {
    if (visibleIds.length && !visibleIds.includes(activeRole)) setActiveRole(visibleIds[0]);
  }, [visibleIds, activeRole, setActiveRole]);

  const pick = (id) => { setActiveRole(id); if (onClose) onClose(); };

  return (
    <>
      <div className={`scrim ${open ? 'show' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-brand" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/sightlive-logo.svg" alt="SightLive" style={{ height: 26 }} />
            <button className="icon-btn sidebar-close" onClick={onClose} aria-label="Close menu" style={{ marginLeft: 'auto' }}><X size={18} /></button>
          </div>
          <div className="eyebrow" style={{ fontSize: 9.5 }}>PPE Stock Platform</div>
        </div>

        <nav className="sidebar-nav">
          {groups.map(group => (
            <div key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              {group.items.map(item => {
                const Icon = item.icon;
                return (
                  <button key={item.id} className={`nav-item ${activeRole === item.id ? 'active' : ''}`} onClick={() => pick(item.id)}>
                    <Icon size={17} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot eyebrow">Multi-currency · cross-border ready</div>
      </aside>
    </>
  );
};
