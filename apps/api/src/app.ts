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
import { backofficeRoutes } from './modules/backoffice/routes.js';
import { financeRoutes } from './modules/finance/routes.js';
import { ZodError } from 'zod';

export const buildApp = () => {
  const app = Fastify({
    logger: true,
    bodyLimit: 8 * 1024 * 1024
  });

  const corsOrigin = process.env.CORS_ORIGIN;
  const allowedOrigins = (corsOrigin ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.register(cors, {
    origin: corsOrigin
      ? (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin))
      : true
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    if (error instanceof ZodError) {
      return reply.status(400).send({ message: 'Dados informados sao invalidos.', issues: error.issues });
    }
    const appError = error as { statusCode?: unknown; message?: unknown };
    const statusCode = typeof appError.statusCode === 'number' ? appError.statusCode : 500;
    const message = typeof appError.message === 'string' ? appError.message : 'Erro interno ao processar a solicitacao.';
    return reply.status(statusCode).send({ message });
  });

  registerAuth(app);

  app.get('/health', async () => ({
    ok: true,
    status: 'up',
    service: 'confeitaria-api',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime())
  }));

  app.register(authRoutes);
  app.register(companyRoutes);
  app.register(inputRoutes);
  app.register(recipeRoutes);
  app.register(productRoutes);
  app.register(customerRoutes);
  app.register(orderRoutes);
  app.register(financeRoutes);
  app.register(pricingRoutes);
  app.register(onboardingRoutes);
  app.register(backofficeRoutes);

  return app;
};
