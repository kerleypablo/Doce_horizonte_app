import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../db/mock.js';
import { calcPricePreview, calcProfitFromPrice } from './calc.js';

const previewSchema = z.object({
  recipeId: z.string().min(1),
  targetProfitPercent: z.number().min(0),
  channelId: z.string().optional()
});

const profitSchema = z.object({
  recipeId: z.string().min(1),
  salePrice: z.number().min(0),
  channelId: z.string().optional()
});

export const pricingRoutes = async (app: FastifyInstance) => {
  app.post('/pricing/preview', { preHandler: app.authenticate }, async (request, reply) => {
    const user = request.user as { companyId: string };
    const data = previewSchema.parse(request.body);

    const recipe = db.recipes.find((r) => r.id === data.recipeId && r.companyId === user.companyId);
    if (!recipe) return reply.status(404).send({ message: 'Receita nao encontrada' });

    const company = db.companies.find((c) => c.id === user.companyId);
    if (!company) return reply.status(404).send({ message: 'Empresa nao encontrada' });

    const channel = company.settings.salesChannels.find((c) => c.id === data.channelId) ?? company.settings.salesChannels[0];

    const preview = calcPricePreview({
      recipe,
      inputs: db.inputs.filter((i) => i.companyId === user.companyId),
      recipes: db.recipes.filter((r) => r.companyId === user.companyId),
      settings: company.settings,
      profitPercent: data.targetProfitPercent,
      feePercent: channel?.feePercent ?? 0,
      paymentFeePercent: channel?.paymentFeePercent ?? 0,
      feeFixed: channel?.feeFixed ?? 0
    });

    return reply.send(preview);
  });

  app.post('/pricing/profit', { preHandler: app.authenticate }, async (request, reply) => {
    const user = request.user as { companyId: string };
    const data = profitSchema.parse(request.body);

    const recipe = db.recipes.find((r) => r.id === data.recipeId && r.companyId === user.companyId);
    if (!recipe) return reply.status(404).send({ message: 'Receita nao encontrada' });

    const company = db.companies.find((c) => c.id === user.companyId);
    if (!company) return reply.status(404).send({ message: 'Empresa nao encontrada' });

    const channel = company.settings.salesChannels.find((c) => c.id === data.channelId) ?? company.settings.salesChannels[0];

    const result = calcProfitFromPrice({
      recipe,
      inputs: db.inputs.filter((i) => i.companyId === user.companyId),
      recipes: db.recipes.filter((r) => r.companyId === user.companyId),
      settings: company.settings,
      salePrice: data.salePrice,
      feePercent: channel?.feePercent ?? 0,
      paymentFeePercent: channel?.paymentFeePercent ?? 0,
      feeFixed: channel?.feeFixed ?? 0
    });

    return reply.send(result);
  });
};
