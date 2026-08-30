// Applies a tenant's white-label accent to the app's CSS custom properties so
// the whole UI re-skins in that merchant/plant's colour. Derives the hover /
// active / weak / ring / on-primary shades from the single accent hex, matching
// the token set in theme.css — theme-aware so it reads in both light and dark.

const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
const hexToRgb = (hex) => {
  let h = String(hex).replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};
const rgbToHex = ({ r, g, b }) => '#' + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });
const luminance = ({ r, g, b }) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

const TOKENS = ['--primary', '--primary-hover', '--primary-active', '--primary-weak', '--primary-weak-bd', '--ring', '--on-primary'];
const isHex = (v) => typeof v === 'string' && /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(v.trim());

// Apply the accent (theme: 'light' | 'dark'); pass a falsy/invalid accent to
// clear the overrides and fall back to the platform default palette.
export function applyBrand(accent, theme = 'light') {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!isHex(accent)) { TOKENS.forEach((t) => root.style.removeProperty(t)); return; }

  const c = hexToRgb(accent);
  const white = { r: 255, g: 255, b: 255 };
  const ink = { r: 20, g: 20, b: 20 };
  const dark = theme === 'dark';
  // Light theme darkens on hover/active and tints weak toward white; dark theme
  // lightens on hover/active and shades weak toward near-black.
  root.style.setProperty('--primary', rgbToHex(c));
  root.style.setProperty('--primary-hover', rgbToHex(mix(c, dark ? white : ink, 0.12)));
  root.style.setProperty('--primary-active', rgbToHex(mix(c, dark ? white : ink, 0.24)));
  root.style.setProperty('--primary-weak', rgbToHex(mix(c, dark ? ink : white, dark ? 0.82 : 0.9)));
  root.style.setProperty('--primary-weak-bd', rgbToHex(mix(c, dark ? ink : white, dark ? 0.66 : 0.72)));
  root.style.setProperty('--ring', `rgba(${c.r}, ${c.g}, ${c.b}, 0.32)`);
  root.style.setProperty('--on-primary', luminance(c) > 0.62 ? '#1a1a1a' : '#ffffff');
}

// ── Device brand cache ──────────────────────────────────────────────────────
// The login screen and PWA manifest render before authentication, so they can't
// call the authed /app/branding endpoint. We remember the last signed-in
// tenant's brand on the device and apply it pre-auth (returning users see their
// merchant/plant brand on the login screen and install prompt).
const CACHE_KEY = 'sl_brand';

export function readBrandCache() {
  try { const raw = localStorage.getItem(CACHE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export function writeBrandCache(brand) {
  try {
    if (brand && isHex(brand.accent)) {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ accent: brand.accent, logoUrl: brand.logoUrl || null, tenantName: brand.tenantName || null }));
    } else {
      localStorage.removeItem(CACHE_KEY);
    }
  } catch { /* private mode / disabled storage — non-fatal */ }
}

// A stable monogram data-URI icon (tenant initial on the accent) — used for the
// PWA install icon and apple-touch-icon. Stable because the real logo lives in a
// private bucket whose signed URL expires; a data-URI never breaks post-install.
function monogramIcon(name, accent) {
  const letter = String(name || 'S').trim().charAt(0).toUpperCase() || 'S';
  const fg = luminance(hexToRgb(accent)) > 0.62 ? '#1a1a1a' : '#ffffff';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="${accent}"/><text x="50%" y="53%" dominant-baseline="central" text-anchor="middle" font-family="Inter,Segoe UI,Arial,sans-serif" font-weight="700" font-size="300" fill="${fg}">${letter}</text></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

const setMeta = (name, content) => {
  let m = document.querySelector(`meta[name="${name}"]`);
  if (!m) { m = document.createElement('meta'); m.setAttribute('name', name); document.head.appendChild(m); }
  m.setAttribute('content', content);
};
const setLink = (rel, href) => {
  let l = document.querySelector(`link[rel="${rel}"]`);
  if (!l) { l = document.createElement('link'); l.setAttribute('rel', rel); document.head.appendChild(l); }
  l.setAttribute('href', href);
};

// Apply brand to the browser chrome + PWA: theme-color, install name/icon
// (dynamic manifest), and apple-touch-icon. Pass a falsy accent to reset to the
// platform default (keeps the static /manifest.webmanifest + SightLive marks).
export function applyBrandChrome(brand) {
  if (typeof document === 'undefined') return;
  const accent = brand && isHex(brand.accent) ? brand.accent : null;
  if (!accent) {
    setMeta('theme-color', '#ef5b0a');
    setLink('manifest', '/manifest.webmanifest');
    setLink('apple-touch-icon', '/sightlive-mark.svg');
    return;
  }
  const name = brand.tenantName || null;
  const icon = monogramIcon(name, accent);
  setMeta('theme-color', accent);
  setLink('apple-touch-icon', icon);
  const manifest = {
    name: name ? `${name} — PPE` : 'SightLive PPE Stock Platform',
    short_name: name ? name.slice(0, 24) : 'SightLive',
    description: 'PPE stock, requests, approvals and B2B sales.',
    start_url: '/', scope: '/', display: 'standalone', orientation: 'portrait-primary',
    background_color: '#f4f5f7', theme_color: accent,
    icons: [{ src: icon, sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
  };
  setLink('manifest', 'data:application/manifest+json,' + encodeURIComponent(JSON.stringify(manifest)));
}
