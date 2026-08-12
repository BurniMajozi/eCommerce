import { defineConfig, loadEnv } from '@medusajs/framework/utils';

loadEnv(process.env.NODE_ENV ?? 'development', process.cwd());

const redisUrl = process.env.REDIS_URL?.trim();
const redisModules = redisUrl
  ? [
      { resolve: '@medusajs/medusa/event-bus-redis', options: { redisUrl } },
      { resolve: '@medusajs/medusa/workflow-engine-redis', options: { redis: { redisUrl } } },
      {
        resolve: '@medusajs/medusa/locking',
        options: {
          providers: [{
            resolve: '@medusajs/medusa/locking-redis',
            id: 'locking-redis',
            is_default: true,
            options: { redisUrl },
          }],
        },
      },
    ]
  : [];

export default defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    databaseSchema: process.env.DATABASE_SCHEMA ?? 'medusa',
    redisUrl,
    redisPrefix: process.env.REDIS_PREFIX ?? 'sightlive:',
    workerMode: process.env.MEDUSA_WORKER_MODE as 'shared' | 'server' | 'worker' | undefined,
    http: {
      storeCors: process.env.STORE_CORS ?? 'http://localhost:5173',
      adminCors: process.env.ADMIN_CORS ?? 'http://localhost:7001',
      authCors: process.env.AUTH_CORS ?? 'http://localhost:5173,http://localhost:7001',
      jwtSecret: process.env.JWT_SECRET ?? 'development-only-change-me',
      cookieSecret: process.env.COOKIE_SECRET ?? 'development-only-change-me',
    },
  },
  modules: [
    ...redisModules,
    {
      resolve: './src/modules/tenant-link',
    },
  ],
});
