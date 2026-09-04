export const SITE_URL = 'https://ecommerce-production-5631.up.railway.app';

export const MARKETING_ROUTES = [
  {
    path: '/',
    label: 'Home',
    title: 'SightLive | PPE Operations, Commerce & Tenant Management',
    description: 'Run PPE requests, approvals, stock, procurement, B2B commerce and tenant administration in one secure, multi-site platform.',
  },
  {
    path: '/operations',
    label: 'Operations',
    title: 'PPE Operations & Inventory Management | SightLive',
    description: 'Control PPE requests, entitlements, approvals, issuing, custody, replenishment and multi-site inventory with SightLive.',
  },
  {
    path: '/commerce',
    label: 'Commerce',
    title: 'PPE Commerce, Procurement & Fulfilment | SightLive',
    description: 'Manage PPE catalogues, contract pricing, quotes, orders, payments, suppliers, purchase orders and fulfilment in SightLive.',
  },
  {
    path: '/tenant-administration',
    label: 'Tenant administration',
    title: 'Multi-Tenant PPE Administration & Governance | SightLive',
    description: 'Give every company and site secure roles, branding, policies, audit trails and scoped access with SightLive tenant administration.',
  },
  {
    path: '/pricing',
    label: 'Pricing',
    title: 'SightLive Pricing | From R250 to R150 per Active Seat',
    description: 'Compare SightLive Merchant, Plant and Enterprise plans. Active seats start at R250 and reduce to R150 at enterprise volume.',
  },
];

export const resolveMarketingRoute = (pathname = '/') => {
  const normalized = pathname === '/' ? '/' : `/${pathname.split('/').filter(Boolean).join('/')}`;
  return MARKETING_ROUTES.find((route) => route.path === normalized) || MARKETING_ROUTES[0];
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
