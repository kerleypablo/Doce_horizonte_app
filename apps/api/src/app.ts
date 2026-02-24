import Fastify from 'fastify';
import cors from '@fastify/cors';
import { registerAuth } from './modules/common/auth.js';
import { authRoutes } from './modules/auth/routes.js';
import { inputRoutes } from './modules/inputs/routes.js';
import { recipeRoutes } from './modules/recipes/routes.js';
import { productRoutes } from './modules/products/routes.js';
import { pricingRoutes } from './modules/pricing/routes.js';
import { companyRoutes } from './modules/company/routes.js';
import { onboardingRoutes } from './modules/onboarding/routes.js';
import { customerRoutes } from './modules/customers/routes.js';
import { orderRoutes } from './modules/orders/routes.js';

export const buildApp = () => {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: true });

  registerAuth(app);

  app.get('/health', async () => ({ ok: true }));

  app.register(authRoutes);
  app.register(companyRoutes);
  app.register(inputRoutes);
  app.register(recipeRoutes);
  app.register(productRoutes);
  app.register(customerRoutes);
  app.register(orderRoutes);
  app.register(pricingRoutes);
  app.register(onboardingRoutes);

  return app;
};
