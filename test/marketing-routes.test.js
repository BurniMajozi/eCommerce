import test from 'node:test';
import assert from 'node:assert/strict';
import { MARKETING_ROUTES, marketingCanonical, marketingStructuredData, resolveMarketingRoute } from '../src/marketing/siteMap.js';

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
  assert.equal(resolveMarketingRoute('/operations/').path, '/operations');
  assert.equal(resolveMarketingRoute('/not-a-page').path, '/');
});

test('pricing structured data reflects the published seat range', () => {
  const pricing = marketingStructuredData(resolveMarketingRoute('/pricing'));
  assert.equal(pricing.offers.lowPrice, '150');
  assert.equal(pricing.offers.highPrice, '250');
  assert.equal(pricing.offers.priceCurrency, 'ZAR');
});
