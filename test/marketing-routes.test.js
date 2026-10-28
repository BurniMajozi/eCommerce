import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MARKETING_ROUTES, marketingCanonical, marketingStructuredData, resolveMarketingRoute } from '../src/marketing/siteMap.js';

const landingPageSource = readFileSync(new URL('../src/components/LandingPage.jsx', import.meta.url), 'utf8');

test('every marketing page has unique SEO metadata and a canonical URL', () => {
  assert.equal(new Set(MARKETING_ROUTES.map((route) => route.path)).size, MARKETING_ROUTES.length);
  assert.equal(new Set(MARKETING_ROUTES.map((route) => route.title)).size, MARKETING_ROUTES.length);
  for (const route of MARKETING_ROUTES) {
    assert.ok(route.description.length >= 100);
    const expectedPath = route.path === '/' ? '/' : `${route.path}/`;
    assert.equal(marketingCanonical(route.path), `https://ecommerce-production-5631.up.railway.app${expectedPath}`);
  }
});

test('unknown and trailing-slash paths resolve safely', () => {
  assert.equal(resolveMarketingRoute('/product/').path, '/product');
  assert.equal(resolveMarketingRoute('/not-a-page').path, '/');
  // Retired capability URLs fold into the Product page.
  for (const old of ['/operations', '/commerce', '/tenant-administration']) assert.equal(resolveMarketingRoute(old).path, '/product');
});

test('pricing structured data reflects the published seat range', () => {
  const pricing = marketingStructuredData(resolveMarketingRoute('/pricing'));
  assert.equal(pricing.offers.lowPrice, '150');
  assert.equal(pricing.offers.highPrice, '250');
  assert.equal(pricing.offers.priceCurrency, 'ZAR');
});

test('marketing pages use distinct hero visuals and a bento layout', () => {
  for (const type of ['home', 'product', 'usecases']) {
    assert.match(landingPageSource, new RegExp(`type === '${type}'`));
  }
  assert.match(landingPageSource, /<BentoGrid items=\{FEATURES\.product\}/);
  assert.match(landingPageSource, /<PricingVisual \/>/);
});

test('marketing pages expose a configurable demo booking CTA', () => {
  assert.match(landingPageSource, /VITE_DEMO_BOOKING_URL/);
  assert.match(landingPageSource, />Book a demo<\/a>/);
});

test('marketing copy leads with the full PPE stock problem and solution', () => {
  assert.doesNotMatch(landingPageSource, /One tenant-safe operating picture/);
  for (const capability of [
    'Physical store',
    'Safety reports',
    'Safety alerts',
    'Auto-replenishment',
    'Escalations',
    'Returns and reverse logistics',
    'Suppliers with scorecards',
    'POPIA',
  ]) assert.match(landingPageSource, new RegExp(capability));
});

test('subscription plans explain their included operating benefits', () => {
  assert.match(landingPageSource, /Employee and contractor request stores/);
  assert.match(landingPageSource, /Safety training and competency records/);
  assert.match(landingPageSource, /Stock receipt and quality exceptions/);
});
