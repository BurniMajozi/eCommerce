import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthSessionProvider } from './auth/AuthSessionContext.jsx'
import { TenantAccessProvider } from './tenant/TenantAccessContext.jsx'
import { applyBrand, applyBrandChrome, readBrandCache } from './theme/applyBrand'

// Pre-auth white-label: skin the login screen + PWA manifest/theme-color from
// the last signed-in tenant's brand remembered on this device (before React
// mounts, so there's no unbranded flash).
const cachedBrand = readBrandCache();
if (cachedBrand?.accent) {
  const theme = document.documentElement.getAttribute('data-theme')
    || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyBrand(cachedBrand.accent, theme);
  applyBrandChrome(cachedBrand);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthSessionProvider>
      <TenantAccessProvider>
        <App />
      </TenantAccessProvider>
    </AuthSessionProvider>
  </StrictMode>,
)

// Register the PWA service worker (production build only; dev serves modules unbundled).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* offline support unavailable */ });
  });
}
