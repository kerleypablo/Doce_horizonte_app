import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from '../../db/mock.js';

const ingredientSchema = z.object({
  inputId: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.enum(['kg', 'g', 'l', 'ml', 'un'])
});

const recipeSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  prepTimeMinutes: z.number().min(0),
  yield: z.number().positive(),
  yieldUnit: z.enum(['kg', 'g', 'l', 'ml', 'un']),
  ingredients: z.array(ingredientSchema),
  subRecipes: z.array(z.object({ recipeId: z.string().min(1), quantity: z.number().positive() })).default([]),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional()
});

export const recipeRoutes = async (app: FastifyInstance) => {
  app.get('/recipes', { preHandler: app.authenticate }, async (request) => {
    const user = request.user as { companyId: string };
    return db.recipes.filter((recipe) => recipe.companyId === user.companyId);
  });

  app.post('/recipes', { preHandler: app.authenticate }, async (request, reply) => {
    const user = request.user as { companyId: string };
    const data = recipeSchema.parse(request.body);

    const recipe = {
      id: crypto.randomUUID(),
      companyId: user.companyId,
      ...data
    };

    db.recipes.push(recipe);
    return reply.status(201).send(recipe);
  });

  app.get('/recipes/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const user = request.user as { companyId: string };
    const id = request.params as { id: string };
    const recipe = db.recipes.find((r) => r.id === id.id && r.companyId === user.companyId);
    if (!recipe) return reply.status(404).send({ message: 'Nao encontrado' });
    return recipe;
  });

  app.put('/recipes/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const user = request.user as { companyId: string };
    const data = recipeSchema.parse(request.body);
    const id = request.params as { id: string };
    const idx = db.recipes.findIndex((r) => r.id === id.id && r.companyId === user.companyId);
    if (idx === -1) return reply.status(404).send({ message: 'Nao encontrado' });
    db.recipes[idx] = { ...db.recipes[idx], ...data };
    return reply.send(db.recipes[idx]);
  });
};
