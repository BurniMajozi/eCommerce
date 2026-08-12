import React from 'react';
import { useApp } from '../context/AppContext';
import {
  HardHat, ClipboardCheck, PackageOpen, LineChart, Receipt,
  Building2, ShieldEllipsis, Tag, Boxes, ShoppingCart, BadgePercent,
  Percent, Truck, Upload, Wallet, Workflow, Radio, X
} from 'lucide-react';

export const NAV_GROUPS = [
  {
    label: 'Operations',
    items: [
      { id: 'EMPLOYEE', label: 'Request PPE', icon: HardHat },
      { id: 'MANAGER', label: 'Approvals', icon: ClipboardCheck },
      { id: 'STOREKEEPER', label: 'Store Counter', icon: PackageOpen },
      { id: 'EXECUTIVE', label: 'Dashboard', icon: LineChart }
    ]
  },
  {
    label: 'Commerce',
    items: [
      { id: 'MERCHANT', label: 'B2B Sales', icon: Receipt },
      { id: 'MED_PRODUCTS', label: 'Products & Pricing', icon: Tag },
      { id: 'MED_INVENTORY', label: 'Inventory & Stock', icon: Boxes },
      { id: 'MED_ORDERS', label: 'Orders', icon: ShoppingCart },
      { id: 'MED_PROMOS', label: 'Promotions', icon: BadgePercent },
      { id: 'MED_TAX', label: 'Tax & VAT', icon: Percent },
      { id: 'MED_FULFIL', label: 'Fulfilment', icon: Truck },
      { id: 'MED_IMPORT', label: 'CSV Import', icon: Upload },
      { id: 'MED_CUSTOMERS', label: 'Customers & Limits', icon: Wallet }
    ]
  },
  {
    label: 'Engine',
    items: [
      { id: 'MED_WORKFLOWS', label: 'Workflows', icon: Workflow },
      { id: 'MED_EVENTS', label: 'Event Bus', icon: Radio }
    ]
  },
  {
    label: 'Platform',
    items: [
      { id: 'TENANT_ADMIN', label: 'Tenant Admin', icon: Building2 },
      { id: 'OWNER', label: 'Platform Owner', icon: ShieldEllipsis }
    ]
  }
];

export const Sidebar = ({ open, onClose }) => {
  const { activeRole, setActiveRole } = useApp();

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
          {NAV_GROUPS.map(group => (
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
