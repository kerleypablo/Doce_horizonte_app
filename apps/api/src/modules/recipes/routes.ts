import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../../db/supabase.js';

const ingredientSchema = z.object({
  inputId: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.enum(['kg', 'g', 'l', 'ml', 'un'])
});

const subRecipeSchema = z.object({
  recipeId: z.string().min(1),
  quantity: z.number().positive()
});

const recipeSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  prepTimeMinutes: z.number().min(0),
  yield: z.number().positive(),
  yieldUnit: z.enum(['kg', 'g', 'l', 'ml', 'un']),
  ingredients: z.array(ingredientSchema),
  subRecipes: z.array(subRecipeSchema).default([]),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional()
});

export const recipeRoutes = async (app: FastifyInstance) => {
  const mapRecipe = (row: any) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    prepTimeMinutes: Number(row.prep_time_minutes ?? 0),
    yield: Number(row.yield),
    yieldUnit: row.yield_unit,
    ingredients: row.ingredients ?? [],
    subRecipes: row.sub_recipes ?? [],
    tags: row.tags ?? [],
    notes: row.notes ?? undefined
  });

  app.get('/recipes', { preHandler: app.authenticate }, async (request) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const { data } = await supabaseAdmin
      .from('recipes')
      .select('*')
      .eq('company_id', auth.companyId)
      .order('created_at', { ascending: false });
    return (data ?? []).map(mapRecipe);
  });

  app.post('/recipes', { preHandler: app.authenticate }, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const data = recipeSchema.parse(request.body);

    const { data: created, error } = await supabaseAdmin
      .from('recipes')
      .insert({
        company_id: auth.companyId,
        name: data.name,
        description: data.description,
        prep_time_minutes: data.prepTimeMinutes,
        yield: data.yield,
        yield_unit: data.yieldUnit,
        ingredients: data.ingredients,
        sub_recipes: data.subRecipes,
        tags: data.tags,
        notes: data.notes
      })
      .select('*')
      .single();

    if (error) return reply.status(400).send({ message: 'Erro ao criar receita' });
    return reply.status(201).send(mapRecipe(created));
  });

  app.get('/recipes/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const id = request.params as { id: string };
    const { data, error } = await supabaseAdmin
      .from('recipes')
      .select('*')
      .eq('id', id.id)
      .eq('company_id', auth.companyId)
      .single();
    if (error || !data) return reply.status(404).send({ message: 'Nao encontrado' });
    return mapRecipe(data);
  });

  app.put('/recipes/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const data = recipeSchema.parse(request.body);
    const id = request.params as { id: string };

    const { data: updated, error } = await supabaseAdmin
      .from('recipes')
      .update({
        name: data.name,
        description: data.description,
        prep_time_minutes: data.prepTimeMinutes,
        yield: data.yield,
        yield_unit: data.yieldUnit,
        ingredients: data.ingredients,
        sub_recipes: data.subRecipes,
        tags: data.tags,
        notes: data.notes
      })
      .eq('id', id.id)
      .eq('company_id', auth.companyId)
      .select('*')
      .single();

    if (error) return reply.status(404).send({ message: 'Nao encontrado' });
    return reply.send(mapRecipe(updated));
  });
};
