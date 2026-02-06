import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { seed } from './db/mock.js';
import { registerAuth } from './modules/common/auth.js';
import { authRoutes } from './modules/auth/routes.js';
import { inputRoutes } from './modules/inputs/routes.js';
import { recipeRoutes } from './modules/recipes/routes.js';
import { productRoutes } from './modules/products/routes.js';
import { pricingRoutes } from './modules/pricing/routes.js';
import { companyRoutes } from './modules/company/routes.js';

export const buildApp = () => {
  seed();

  const app = Fastify({ logger: true });

  app.register(cors, { origin: true });
  app.register(jwt, { secret: process.env.JWT_SECRET ?? 'super-secret' });

  registerAuth(app);

  app.get('/health', async () => ({ ok: true }));

  app.register(authRoutes);
  app.register(companyRoutes);
  app.register(inputRoutes);
  app.register(recipeRoutes);
  app.register(productRoutes);
  app.register(pricingRoutes);

  return app;
};
