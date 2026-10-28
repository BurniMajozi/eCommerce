export const SITE_URL = 'https://ecommerce-production-5631.up.railway.app';

export const MARKETING_ROUTES = [
  {
    path: '/',
    label: 'Home',
    title: 'PPE & Safety Operating System — Purchase to Person | SightLive',
    description: 'SightLive runs the whole PPE loop and turns every hazard, request, order and escalation into a tracked ticket — safety reports, alerts, approvals, stores and audit in one platform.',
  },
  {
    path: '/product',
    label: 'Product',
    title: 'The PPE & Safety Platform — Tickets, Reports, Alerts | SightLive',
    description: 'Every PPE and safety event is a ticket with a common key: report hazards with a photo, broadcast safety alerts, run requests, approvals, escalations, stores, purchasing and audit.',
  },
  {
    path: '/use-cases',
    label: 'Use cases',
    title: 'For Every Role — Worker to Owner | SightLive',
    description: 'One platform for the whole operation: workers report and request, safety managers acknowledge and alert, storekeepers issue, buyers purchase, admins govern multi-site access.',
  },
  {
    path: '/pricing',
    label: 'Pricing',
    title: 'SightLive Pricing | From R250 to R150 per Active Seat',
    description: 'Compare SightLive Merchant, Plant and Enterprise plans. Active seats start at R250 and reduce to R150 at enterprise volume.',
  },
];

// Old capability paths now fold into the Product page (keeps inbound links alive).
const ALIASES = { '/operations': '/product', '/commerce': '/product', '/tenant-administration': '/product' };

export const resolveMarketingRoute = (pathname = '/') => {
  const normalized = pathname === '/' ? '/' : `/${pathname.split('/').filter(Boolean).join('/')}`;
  const target = ALIASES[normalized] || normalized;
  return MARKETING_ROUTES.find((route) => route.path === target) || MARKETING_ROUTES[0];
};

export const marketingCanonical = (path) => `${SITE_URL}${path === '/' ? '/' : `${path}/`}`;

export const marketingStructuredData = (route) => ({
  '@context': 'https://schema.org',
  '@type': route.path === '/pricing' ? 'Product' : 'SoftwareApplication',
  name: 'SightLive',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web, cloud or customer-managed infrastructure',
  url: marketingCanonical(route.path),
  description: route.description,
  ...(route.path === '/pricing' ? {
    brand: { '@type': 'Brand', name: 'SightLive' },
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'ZAR',
      lowPrice: '150',
      highPrice: '250',
      offerCount: '2',
      description: 'Per active seat pricing; platform base fees and separate service fees may apply.',
    },
  } : {}),
});
