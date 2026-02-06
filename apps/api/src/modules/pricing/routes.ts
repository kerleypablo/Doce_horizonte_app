import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../../db/supabase.js';
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
  const mapInput = (row: any) => ({
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    brand: row.brand ?? undefined,
    category: row.category,
    unit: row.unit,
    packageSize: Number(row.package_size),
    packagePrice: Number(row.package_price),
    tags: row.tags ?? [],
    notes: row.notes ?? undefined
  });

  const mapRecipe = (row: any) => ({
    id: row.id,
    companyId: row.company_id,
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

  app.post('/pricing/preview', { preHandler: app.authenticate }, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const data = previewSchema.parse(request.body);

    const { data: recipe } = await supabaseAdmin
      .from('recipes')
      .select('*')
      .eq('id', data.recipeId)
      .eq('company_id', auth.companyId)
      .single();

    if (!recipe) return reply.status(404).send({ message: 'Receita nao encontrada' });

    const { data: companySettings } = await supabaseAdmin
      .from('company_settings')
      .select('*')
      .eq('company_id', auth.companyId)
      .single();

    if (!companySettings) return reply.status(404).send({ message: 'Empresa nao encontrada' });

    const { data: channels } = await supabaseAdmin
      .from('sales_channels')
      .select('*')
      .eq('company_id', auth.companyId);

    const channel = (channels ?? []).find((c) => c.id === data.channelId) ?? (channels ?? [])[0];

    const { data: inputs } = await supabaseAdmin
      .from('inputs')
      .select('*')
      .eq('company_id', auth.companyId);

    const { data: recipes } = await supabaseAdmin
      .from('recipes')
      .select('*')
      .eq('company_id', auth.companyId);

    const preview = calcPricePreview({
      recipe: mapRecipe(recipe),
      inputs: (inputs ?? []).map(mapInput),
      recipes: (recipes ?? []).map(mapRecipe),
      settings: {
        overheadMethod: companySettings.overhead_method,
        overheadPercent: companySettings.overhead_percent,
        overheadPerUnit: companySettings.overhead_per_unit,
        laborCostPerHour: companySettings.labor_cost_per_hour,
        fixedCostPerHour: companySettings.fixed_cost_per_hour,
        taxesPercent: companySettings.taxes_percent,
        defaultProfitPercent: companySettings.default_profit_percent,
        salesChannels: []
      },
      profitPercent: data.targetProfitPercent,
      feePercent: channel?.fee_percent ?? 0,
      paymentFeePercent: channel?.payment_fee_percent ?? 0,
      feeFixed: channel?.fee_fixed ?? 0
    });

    return reply.send(preview);
  });

  app.post('/pricing/profit', { preHandler: app.authenticate }, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const data = profitSchema.parse(request.body);

    const { data: recipe } = await supabaseAdmin
      .from('recipes')
      .select('*')
      .eq('id', data.recipeId)
      .eq('company_id', auth.companyId)
      .single();

    if (!recipe) return reply.status(404).send({ message: 'Receita nao encontrada' });

    const { data: companySettings } = await supabaseAdmin
      .from('company_settings')
      .select('*')
      .eq('company_id', auth.companyId)
      .single();

    if (!companySettings) return reply.status(404).send({ message: 'Empresa nao encontrada' });

    const { data: channels } = await supabaseAdmin
      .from('sales_channels')
      .select('*')
      .eq('company_id', auth.companyId);

    const channel = (channels ?? []).find((c) => c.id === data.channelId) ?? (channels ?? [])[0];

    const { data: inputs } = await supabaseAdmin
      .from('inputs')
      .select('*')
      .eq('company_id', auth.companyId);

    const { data: recipes } = await supabaseAdmin
      .from('recipes')
      .select('*')
      .eq('company_id', auth.companyId);

    const result = calcProfitFromPrice({
      recipe: mapRecipe(recipe),
      inputs: (inputs ?? []).map(mapInput),
      recipes: (recipes ?? []).map(mapRecipe),
      settings: {
        overheadMethod: companySettings.overhead_method,
        overheadPercent: companySettings.overhead_percent,
        overheadPerUnit: companySettings.overhead_per_unit,
        laborCostPerHour: companySettings.labor_cost_per_hour,
        fixedCostPerHour: companySettings.fixed_cost_per_hour,
        taxesPercent: companySettings.taxes_percent,
        defaultProfitPercent: companySettings.default_profit_percent,
        salesChannels: []
      },
      salePrice: data.salePrice,
      feePercent: channel?.fee_percent ?? 0,
      paymentFeePercent: channel?.payment_fee_percent ?? 0,
      feeFixed: channel?.fee_fixed ?? 0
    });

    return reply.send(result);
  });
};
