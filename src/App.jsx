import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar, NAV_GROUPS } from './components/Sidebar';
import { EmployeePortal } from './components/EmployeePortal';
import { ManagerApprovalPortal } from './components/ManagerApprovalPortal';
import { StorekeeperPortal } from './components/StorekeeperPortal';
import { QuotationInvoicingPortal } from './components/QuotationInvoicingPortal';
import { InventoryAnalyticsPortal } from './components/InventoryAnalyticsPortal';
import { TenantAdminPortal } from './components/TenantAdminPortal';
import { PlatformOwnerPortal } from './components/PlatformOwnerPortal';
import { MedusaAdminPortal } from './components/MedusaAdminPortal';
import { LoginGate } from './auth/LoginGate';
import { Menu, ChevronDown, Sun, Moon, CheckCircle2, AlertTriangle, Info, XCircle, LogOut } from 'lucide-react';

const MED_VIEW = {
  MED_PRODUCTS: 'products', MED_INVENTORY: 'inventory', MED_ORDERS: 'orders', MED_PROMOS: 'promos',
  MED_TAX: 'tax', MED_FULFIL: 'fulfil', MED_IMPORT: 'import', MED_CUSTOMERS: 'customers',
  MED_SUPPLIERS: 'suppliers', MED_WORKFLOWS: 'workflows', MED_EVENTS: 'events'
};
const TOAST_ICON = { success: CheckCircle2, warning: AlertTriangle, error: XCircle, info: Info };
const TOAST_CLASS = { success: 'badge-success', warning: 'badge-warning', error: 'badge-danger', info: 'badge-info' };

const navTitle = (id) => {
  for (const g of NAV_GROUPS) { const hit = g.items.find(i => i.id === id); if (hit) return hit.label; }
  return '';
};

const AppContent = () => {
  const { activeRole, activePlant, setActivePlant, plants, theme, toggleTheme, pushNotification, auth } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);

  const render = () => {
    if (MED_VIEW[activeRole]) return <MedusaAdminPortal view={MED_VIEW[activeRole]} />;
    switch (activeRole) {
      case 'EMPLOYEE': return <EmployeePortal />;
      case 'MANAGER': return <ManagerApprovalPortal />;
      case 'STOREKEEPER': return <StorekeeperPortal />;
      case 'MERCHANT': return <QuotationInvoicingPortal />;
      case 'EXECUTIVE': return <InventoryAnalyticsPortal />;
      case 'TENANT_ADMIN': return <TenantAdminPortal />;
      case 'OWNER': return <PlatformOwnerPortal />;
      default: return <EmployeePortal />;
    }
  };

  const ToastIcon = pushNotification ? (TOAST_ICON[pushNotification.type] || Info) : Info;

  return (
    <div className="app-layout">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="main-col">
        <div className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <button className="icon-btn hamburger" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu size={18} /></button>
            <span style={{ fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{navTitle(activeRole)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <select className="select" value={activePlant.id} onChange={(e) => setActivePlant(plants.find(p => p.id === e.target.value))} style={{ paddingRight: 32, fontWeight: 500, fontSize: 13, maxWidth: 220 }} aria-label="Active site">
                {plants.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
              </select>
              <ChevronDown size={16} style={{ position: 'absolute', right: 9, pointerEvents: 'none', color: 'var(--text-muted)' }} />
            </div>
            <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme" title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {auth?.user && (
              <button className="icon-btn" onClick={() => auth.signOut()} aria-label="Sign out" title={`Sign out (${auth.user.email})`}>
                <LogOut size={18} />
              </button>
            )}
          </div>
        </div>

        <main style={{ flex: 1, width: '100%', maxWidth: 1240, margin: '0 auto', padding: '22px 20px 40px' }}>
          {render()}
        </main>
      </div>

      {pushNotification && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 90, maxWidth: 380 }} className="animate-fade-in">
          <div className="card" style={{ boxShadow: 'var(--shadow-lg)', padding: '13px 15px', display: 'flex', gap: 11, alignItems: 'flex-start' }}>
            <span className={`badge ${TOAST_CLASS[pushNotification.type] || 'badge-info'}`} style={{ padding: 6, borderRadius: 8 }}><ToastIcon size={16} /></span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{pushNotification.title}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>{pushNotification.message}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <LoginGate>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </LoginGate>
  );
}
