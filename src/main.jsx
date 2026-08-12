import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthSessionProvider } from './auth/AuthSessionContext.jsx'
import { TenantAccessProvider } from './tenant/TenantAccessContext.jsx'

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
