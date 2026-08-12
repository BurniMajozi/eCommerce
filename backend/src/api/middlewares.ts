import { defineMiddlewares } from '@medusajs/framework/http';
import { tenantScopeMiddleware } from './middlewares/tenant-scope';

export default defineMiddlewares({
  routes: [
    {
      matcher: '/app/*',
      middlewares: [tenantScopeMiddleware],
    },
  ],
});
