import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from '../../db/mock.js';
import { calcProductPreview } from '../pricing/product-calc.js';

const productSchema = z.object({
  name: z.string().min(2),
  recipeId: z.string().min(1),
  prepTimeMinutes: z.number().min(0).default(0),
  notes: z.string().optional(),
  unitsCount: z.number().positive(),
  targetProfitPercent: z.number().min(0),
  extraPercent: z.number().min(0).default(0),
  channelId: z.string().optional()
  ,
  extraRecipes: z.array(z.object({ recipeId: z.string().min(1), quantity: z.number().positive() })).default([]),
  extraProducts: z.array(z.object({ productId: z.string().min(1), quantity: z.number().positive() })).default([]),
  packagingInputs: z.array(z.object({ inputId: z.string().min(1), quantity: z.number().positive(), unit: z.enum(['kg', 'g', 'l', 'ml', 'un']) })).default([])
});

export const productRoutes = async (app: FastifyInstance) => {
  app.get('/products', { preHandler: app.authenticate }, async (request) => {
    const user = request.user as { companyId: string };
    return db.products.filter((product) => product.companyId === user.companyId);
  });

  app.post('/products', { preHandler: app.authenticate }, async (request, reply) => {
    const user = request.user as { companyId: string };
    const data = productSchema.parse(request.body);

    const recipe = db.recipes.find((r) => r.id === data.recipeId && r.companyId === user.companyId);
    if (!recipe) return reply.status(404).send({ message: 'Receita nao encontrada' });

    const company = db.companies.find((c) => c.id === user.companyId);
    if (!company) return reply.status(404).send({ message: 'Empresa nao encontrada' });

    const channel = company.settings.salesChannels.find((c) => c.id === data.channelId) ?? company.settings.salesChannels[0];
    const preview = calcProductPreview({
      baseRecipe: recipe,
      unitsCount: data.unitsCount,
      prepTimeMinutes: data.prepTimeMinutes,
      targetProfitPercent: data.targetProfitPercent,
      extraPercent: data.extraPercent,
      extraRecipes: data.extraRecipes,
      extraProducts: data.extraProducts,
      packagingInputs: data.packagingInputs,
      settings: company.settings,
      inputs: db.inputs.filter((i) => i.companyId === user.companyId),
      recipes: db.recipes.filter((r) => r.companyId === user.companyId),
      products: db.products.filter((p) => p.companyId === user.companyId),
      feePercent: channel?.feePercent ?? 0,
      paymentFeePercent: channel?.paymentFeePercent ?? 0,
      feeFixed: channel?.feeFixed ?? 0
    });

    const product = {
      id: crypto.randomUUID(),
      companyId: user.companyId,
      name: data.name,
      recipeId: data.recipeId,
      prepTimeMinutes: data.prepTimeMinutes,
      notes: data.notes,
      unitsCount: data.unitsCount,
      targetProfitPercent: data.targetProfitPercent,
      extraPercent: data.extraPercent,
      unitPrice: preview.unitPrice,
      salePrice: preview.totalPrice,
      channelId: channel?.id,
      extraRecipes: data.extraRecipes,
      extraProducts: data.extraProducts,
      packagingInputs: data.packagingInputs
    };

    db.products.push(product);
    return reply.status(201).send({ product, preview });
  });

  app.put('/products/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const user = request.user as { companyId: string };
    const data = productSchema.parse(request.body);
    const id = request.params as { id: string };
    const idx = db.products.findIndex((p) => p.id === id.id && p.companyId === user.companyId);

    if (idx === -1) return reply.status(404).send({ message: 'Produto nao encontrado' });

    const recipe = db.recipes.find((r) => r.id === data.recipeId && r.companyId === user.companyId);
    if (!recipe) return reply.status(404).send({ message: 'Receita nao encontrada' });

    const company = db.companies.find((c) => c.id === user.companyId);
    if (!company) return reply.status(404).send({ message: 'Empresa nao encontrada' });

    const channel = company.settings.salesChannels.find((c) => c.id === data.channelId) ?? company.settings.salesChannels[0];
    const preview = calcProductPreview({
      baseRecipe: recipe,
      unitsCount: data.unitsCount,
      prepTimeMinutes: data.prepTimeMinutes,
      targetProfitPercent: data.targetProfitPercent,
      extraPercent: data.extraPercent,
      extraRecipes: data.extraRecipes,
      extraProducts: data.extraProducts,
      packagingInputs: data.packagingInputs,
      settings: company.settings,
      inputs: db.inputs.filter((i) => i.companyId === user.companyId),
      recipes: db.recipes.filter((r) => r.companyId === user.companyId),
      products: db.products.filter((p) => p.companyId === user.companyId),
      feePercent: channel?.feePercent ?? 0,
      paymentFeePercent: channel?.paymentFeePercent ?? 0,
      feeFixed: channel?.feeFixed ?? 0
    });

    const updated = {
      ...db.products[idx],
      name: data.name,
      recipeId: data.recipeId,
      prepTimeMinutes: data.prepTimeMinutes,
      notes: data.notes,
      unitsCount: data.unitsCount,
      targetProfitPercent: data.targetProfitPercent,
      extraPercent: data.extraPercent,
      unitPrice: preview.unitPrice,
      salePrice: preview.totalPrice,
      channelId: channel?.id,
      extraRecipes: data.extraRecipes,
      extraProducts: data.extraProducts,
      packagingInputs: data.packagingInputs
    };

    db.products[idx] = updated;
    return reply.send({ product: updated, preview });
  });
};
