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
