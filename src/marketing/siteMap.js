export const SITE_URL = 'https://ecommerce-production-5631.up.railway.app';

export const MARKETING_ROUTES = [
  {
    path: '/',
    label: 'Home',
    title: 'PPE Stock Management from Purchase to Allocation | SightLive',
    description: 'Manage PPE purchasing, receiving, employee and contractor requests, approvals, store handover, dispatch, returns and allocation audit in SightLive.',
  },
  {
    path: '/operations',
    label: 'Operations',
    title: 'PPE Operations & Inventory Management | SightLive',
    description: 'Connect digital and physical PPE stores with employee and contractor requests, approvals, OTP handover, returns, SKU lifetime and allocation audit.',
  },
  {
    path: '/commerce',
    label: 'Commerce',
    title: 'PPE Commerce, Procurement & Fulfilment | SightLive',
    description: 'See the PPE purchasing pipeline, supplier performance, stock receipts, quality exceptions, customer orders, payments and dispatch in SightLive.',
  },
  {
    path: '/tenant-administration',
    label: 'Tenant administration',
    title: 'PPE Eligibility, Roles and Allocation Governance | SightLive',
    description: 'Manage companies, sites, employee and contractor access, department PPE eligibility, approvals, branding and POPIA-aligned audit controls.',
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
