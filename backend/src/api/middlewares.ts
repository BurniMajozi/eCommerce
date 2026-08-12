import { defineMiddlewares } from '@medusajs/framework/http';
import { tenantScopeMiddleware } from './middlewares/tenant-scope';

export default defineMiddlewares({
  routes: [
    {
      matcher: '/app/catalogue/import/validate',
      methods: ['POST'],
      bodyParser: { sizeLimit: '8mb' },
    },
    {
      matcher: '/app/*',
      middlewares: [tenantScopeMiddleware],
    },
  ],
});
