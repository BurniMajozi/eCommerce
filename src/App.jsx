import React, { useState, lazy, Suspense } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar, NAV_GROUPS, visibleNavGroups } from './components/Sidebar';
import { LoginGate } from './auth/LoginGate';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SkeletonPage } from './components/SkeletonLoader';
import { MfaStepUp } from './components/MfaStepUp';
import { resolveAccessState } from './tenant/accessState';
import { resolveActiveRole } from './navigation/activeRole';
import { Menu, ChevronDown, Sun, Moon, CheckCircle2, AlertTriangle, Info, XCircle, LogOut } from 'lucide-react';

const EmployeePortal = lazy(() => import('./components/EmployeePortal').then(m => ({ default: m.EmployeePortal })));
const ContractorStorePortal = lazy(() => import('./components/ContractorStorePortal').then(m => ({ default: m.ContractorStorePortal })));
const ManagerApprovalPortal = lazy(() => import('./components/ManagerApprovalPortal').then(m => ({ default: m.ManagerApprovalPortal })));
const StorekeeperPortal = lazy(() => import('./components/StorekeeperPortal').then(m => ({ default: m.StorekeeperPortal })));
const QuotationInvoicingPortal = lazy(() => import('./components/QuotationInvoicingPortal').then(m => ({ default: m.QuotationInvoicingPortal })));
const InventoryAnalyticsPortal = lazy(() => import('./components/InventoryAnalyticsPortal').then(m => ({ default: m.InventoryAnalyticsPortal })));
const TenantAdminPortal = lazy(() => import('./components/TenantAdminPortal').then(m => ({ default: m.TenantAdminPortal })));
const PlatformOwnerPortal = lazy(() => import('./components/PlatformOwnerPortal').then(m => ({ default: m.PlatformOwnerPortal })));
const MedusaAdminPortal = lazy(() => import('./components/MedusaAdminPortal').then(m => ({ default: m.MedusaAdminPortal })));
const MerchantApprovalsPortal = lazy(() => import('./components/MerchantApprovalsPortal').then(m => ({ default: m.MerchantApprovalsPortal })));

const MED_VIEW = {
  MED_PRODUCTS: 'products', MED_INVENTORY: 'inventory', MED_ORDERS: 'orders', MED_PROMOS: 'promos',
  MED_TAX: 'tax', MED_FULFIL: 'fulfil', MED_IMPORT: 'import', MED_CUSTOMERS: 'customers',
  MED_SUPPLIERS: 'suppliers', MED_PO: 'purchaseorders', MED_WORKFLOWS: 'workflows', MED_EVENTS: 'events'
};
const TOAST_ICON = { success: CheckCircle2, warning: AlertTriangle, error: XCircle, info: Info };
const TOAST_CLASS = { success: 'badge-success', warning: 'badge-warning', error: 'badge-danger', info: 'badge-info' };

const navTitle = (id) => {
  for (const g of NAV_GROUPS) { const hit = g.items.find(i => i.id === id); if (hit) return hit.label; }
  return '';
};

const AccessStartup = ({ state, tenantAccess, auth }) => {
  const loading = state === 'loading';
  const failed = state === 'error';
  const title = loading ? 'Preparing your workspace…' : failed ? 'We could not load your access' : 'Access has not been assigned';
  const message = loading
    ? 'Loading your role, company and site permissions.'
    : failed
      ? 'The permissions service did not complete. Check your connection and try again.'
      : 'Your account is signed in, but it does not currently have a platform or company role.';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--bg)' }}>
      <div className="card" style={{ width: '100%', maxWidth: 440, boxShadow: 'var(--shadow-lg)' }}>
        <div className="card-bd" style={{ padding: 28 }}>
          <img src="/sightlive-logo.svg" alt="SightLive" style={{ height: 30 }} />
          <h2 style={{ fontSize: 19, marginTop: 18 }}>{title}</h2>
          <p className="muted" style={{ fontSize: 13, marginTop: 5 }}>{message}</p>
          {loading ? (
            <div className="muted" style={{ marginTop: 18, fontSize: 13 }}>One moment…</div>
          ) : (
            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {failed && <button className="btn btn-primary btn-block" type="button" onClick={() => tenantAccess.refresh()}>Try again</button>}
              <button className="btn btn-secondary btn-block" type="button" onClick={() => auth.signOut()}>Sign out</button>
            </div>
          )}
          <div className="eyebrow" style={{ marginTop: 16 }}>Secure tenant access</div>
        </div>
      </div>
    </div>
  );
};

const AppContent = () => {
  const { activeRole, activePlant, setActivePlant, plants, theme, toggleTheme, pushNotification, auth, tenantAccess } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const accessState = resolveAccessState(tenantAccess);
  const scopeKey = `${tenantAccess.activeTenantId ?? 'none'}:${tenantAccess.activeSiteId ?? '*'}`;

  // Resolve the first permitted view during render. Sidebar still persists the
  // selection, but the user never sees the default employee screen for a frame.
  const visibleRoleIds = visibleNavGroups(tenantAccess).flatMap((group) => group.items.map((item) => item.id));
  const displayedRole = resolveActiveRole(activeRole, visibleRoleIds);

  if (accessState !== 'ready') return <AccessStartup state={accessState} tenantAccess={tenantAccess} auth={auth} />;

  const render = () => {
    if (MED_VIEW[displayedRole]) return <MedusaAdminPortal view={MED_VIEW[displayedRole]} />;
    switch (displayedRole) {
      case 'STORE': return <ContractorStorePortal />;
      case 'EMPLOYEE': return <EmployeePortal />;
      case 'MANAGER': return <ManagerApprovalPortal />;
      case 'MERCHANT_APPROVALS': return <MerchantApprovalsPortal />;
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
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} activeRoleOverride={displayedRole} />

      <div className="main-col">
        <div className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <button className="icon-btn hamburger" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu size={18} /></button>
            <span style={{ fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{navTitle(displayedRole)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* The site picker only makes sense for site-scoped operations. On
                commerce / platform (global) views it's confusing, so hide it. */}
            {['EMPLOYEE', 'STOREKEEPER', 'MANAGER', 'EXECUTIVE', 'STORE'].includes(displayedRole) && (
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <select className="select" value={activePlant.id} onChange={(e) => setActivePlant(plants.find(p => p.id === e.target.value))} style={{ paddingRight: 32, fontWeight: 500, fontSize: 13, maxWidth: 220 }} aria-label="Active site">
                  {plants.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
                </select>
                <ChevronDown size={16} style={{ position: 'absolute', right: 9, pointerEvents: 'none', color: 'var(--text-muted)' }} />
              </div>
            )}
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
          {/* All commerce sub-views (Products, Orders, Inventory, POs…) render the
              SAME MedusaAdminPortal — only its `view` prop changes. Keying the
              boundary by a stable 'commerce' token (instead of activeRole) keeps
              that portal MOUNTED across sidebar clicks, so its live data is not
              torn down and re-fetched on every navigation (no lag, no flash of a
              loading/old view). Distinct portals still get their own key. */}
          <ErrorBoundary key={`${MED_VIEW[displayedRole] ? 'commerce' : displayedRole}:${scopeKey}`}>
            <Suspense fallback={<SkeletonPage />}>
              {render()}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      <MfaStepUp />

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
