import { defineMiddlewares } from '@medusajs/framework/http';
import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { tenantScopeMiddleware } from './middlewares/tenant-scope';

// Browser CORS for the custom /app/* routes. Medusa's storeCors/adminCors only
// cover /store and /admin, so custom routes need their own handling — including
// answering the preflight OPTIONS (which carries no auth) BEFORE the tenant
// scope middleware rejects it. Allowed origins come from the same CORS env vars.
function allowedOrigins(): string[] {
  return [process.env.STORE_CORS, process.env.AUTH_CORS, process.env.ADMIN_CORS]
    .filter(Boolean)
    .join(',')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function appCors(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction): void {
  const origin = req.headers.origin;
  const allowed = allowedOrigins();
  if (origin && (allowed.includes('*') || allowed.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,X-Tenant-ID,X-Site-ID');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
}

export default defineMiddlewares({
  routes: [
    {
      // Supabase Send-Email hook: keep the raw body so the Standard-Webhooks
      // HMAC signature can be verified. Not tenant-scoped (Supabase → us).
      matcher: '/hooks/send-email',
      methods: ['POST'],
      bodyParser: { preserveRawBody: true },
    },
    {
      matcher: '/app/catalogue/import/validate',
      methods: ['POST'],
      bodyParser: { sizeLimit: '8mb' },
    },
    {
      // Product photo uploads arrive as base64 JSON, so raise the body limit.
      matcher: '/app/products/image',
      methods: ['POST'],
      bodyParser: { sizeLimit: '10mb' },
    },
    {
      // PO approval carries a captured signature (data URL), so raise the limit.
      matcher: '/app/commerce/purchase-orders/*',
      methods: ['PATCH'],
      bodyParser: { sizeLimit: '2mb' },
    },
    {
      matcher: '/app/*',
      // appCors must run before the auth middleware so preflight OPTIONS
      // (no bearer token) gets a 204 with CORS headers instead of a 401.
      middlewares: [appCors, tenantScopeMiddleware],
    },
  ],
});
