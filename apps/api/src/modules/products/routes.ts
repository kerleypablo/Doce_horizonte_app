import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { z } from 'zod';
import { supabaseAdmin } from '../../db/supabase.js';
import { calcProductPreview } from '../pricing/product-calc.js';
import { assertProductCompositionOwnership } from '../common/company-ownership.js';

const productSchema = z.object({
  name: z.string().min(2),
  prepTimeMinutes: z.number().min(0).default(0),
  notes: z.string().optional(),
  unitsCount: z.number().positive(),
  targetProfitPercent: z.number().min(0),
  extraPercent: z.number().min(0).default(0),
  manualUnitPrice: z.number().min(0).optional(),
  channelId: z.string().optional(),
  extraRecipes: z.array(z.object({ recipeId: z.string().min(1), quantity: z.number().positive() })).default([]),
  extraProducts: z.array(z.object({ productId: z.string().min(1), quantity: z.number().positive() })).default([]),
  directInputs: z.array(z.object({ inputId: z.string().min(1), quantity: z.number().positive(), unit: z.enum(['kg', 'g', 'l', 'ml', 'un']) })).default([]),
  packagingInputs: z.array(z.object({ inputId: z.string().min(1), quantity: z.number().positive(), unit: z.enum(['kg', 'g', 'l', 'ml', 'un']) })).default([])
});

export const productRoutes = async (app: FastifyInstance) => {
  const cadastrosGuard = { preHandler: [app.authenticate, app.requireModule('cadastros')] };

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

  const withLegacyBaseRecipe = (
    extraRecipes: { recipeId: string; quantity: number }[],
    recipeId: string | undefined,
    recipes: ReturnType<typeof mapRecipe>[]
  ) => {
    if (!recipeId || extraRecipes.some((item) => item.recipeId === recipeId)) return extraRecipes;
    const recipe = recipes.find((item) => item.id === recipeId);
    if (!recipe) return extraRecipes;
    return [{ recipeId, quantity: recipe.yield }, ...extraRecipes];
  };

  const mapProduct = (row: any, recipes: ReturnType<typeof mapRecipe>[] = []) => {
    const mappedRecipes = (row.extra_recipes ?? []) as { recipeId: string; quantity: number }[];
    return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    recipeId: row.recipe_id ?? undefined,
    prepTimeMinutes: Number(row.prep_time_minutes ?? 0),
    notes: row.notes ?? undefined,
    unitsCount: Number(row.units_count ?? 1),
    targetProfitPercent: Number(row.target_profit_percent ?? 0),
    extraPercent: Number(row.extra_percent ?? 0),
    unitPrice: Number(row.unit_price ?? 0),
    salePrice: Number(row.sale_price ?? 0),
    channelId: row.channel_id ?? undefined,
    extraRecipes: withLegacyBaseRecipe(mappedRecipes, row.recipe_id ?? undefined, recipes),
    extraProducts: row.extra_products ?? [],
    directInputs: row.direct_inputs ?? [],
    packagingInputs: row.packaging_inputs ?? []
    };
  };

  app.get('/products', cadastrosGuard, async (request) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const [{ data }, { data: recipes }] = await Promise.all([
      supabaseAdmin
      .from('products')
      .select('*')
      .eq('company_id', auth.companyId)
      .order('created_at', { ascending: false }),
      supabaseAdmin.from('recipes').select('*').eq('company_id', auth.companyId)
    ]);
    const mappedRecipes = (recipes ?? []).map(mapRecipe);
    return (data ?? []).map((row) => mapProduct(row, mappedRecipes));
  });

  app.post('/products', cadastrosGuard, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const data = productSchema.parse(request.body);
    await assertProductCompositionOwnership(auth.companyId, data);

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

    const { data: inputs } = await supabaseAdmin
      .from('inputs')
      .select('*')
      .eq('company_id', auth.companyId);

    const { data: recipes } = await supabaseAdmin
      .from('recipes')
      .select('*')
      .eq('company_id', auth.companyId);

    const { data: products } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('company_id', auth.companyId);

    const activeChannels = (channels ?? []).filter((candidate) => candidate.active !== false);
    const channel = activeChannels.find((candidate) => candidate.id === data.channelId) ?? activeChannels[0];
    const preview = calcProductPreview({
      unitsCount: data.unitsCount,
      prepTimeMinutes: data.prepTimeMinutes,
      targetProfitPercent: data.targetProfitPercent,
      extraPercent: data.extraPercent,
      extraRecipes: data.extraRecipes,
      extraProducts: data.extraProducts,
      directInputs: data.directInputs,
      packagingInputs: data.packagingInputs,
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
      inputs: (inputs ?? []).map(mapInput),
      recipes: (recipes ?? []).map(mapRecipe),
      products: (products ?? []).map((row) => mapProduct(row, (recipes ?? []).map(mapRecipe))),
      feePercent: channel?.fee_percent ?? 0,
      paymentFeePercent: channel?.payment_fee_percent ?? 0,
      feeFixed: channel?.fee_fixed ?? 0
    });
    const fallbackUnitPrice = Number(data.manualUnitPrice ?? 0);
    if (preview.pricingError) {
      return reply.status(400).send({ message: preview.pricingError });
    }
    const persistedUnitPrice = fallbackUnitPrice > 0 ? fallbackUnitPrice : preview.unitPrice;
    const persistedSalePrice = persistedUnitPrice * data.unitsCount;

    const { data: created, error } = await supabaseAdmin
      .from('products')
      .insert({
        id: crypto.randomUUID(),
        company_id: auth.companyId,
        name: data.name,
        recipe_id: null,
        prep_time_minutes: data.prepTimeMinutes,
        notes: data.notes,
        units_count: data.unitsCount,
        target_profit_percent: data.targetProfitPercent,
        extra_percent: data.extraPercent,
        unit_price: persistedUnitPrice,
        sale_price: persistedSalePrice,
        channel_id: channel?.id,
        extra_recipes: data.extraRecipes,
        extra_products: data.extraProducts,
        direct_inputs: data.directInputs,
        packaging_inputs: data.packagingInputs
      })
      .select('*')
      .single();

    if (error) return reply.status(400).send({ message: 'Erro ao criar produto' });
    return reply.status(201).send({ product: mapProduct(created, (recipes ?? []).map(mapRecipe)), preview });
  });

  app.put('/products/:id', cadastrosGuard, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const data = productSchema.parse(request.body);
    const id = request.params as { id: string };
    await assertProductCompositionOwnership(auth.companyId, data);

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

    const { data: inputs } = await supabaseAdmin
      .from('inputs')
      .select('*')
      .eq('company_id', auth.companyId);

    const { data: recipes } = await supabaseAdmin
      .from('recipes')
      .select('*')
      .eq('company_id', auth.companyId);

    const { data: products } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('company_id', auth.companyId);

    const activeChannels = (channels ?? []).filter((candidate) => candidate.active !== false);
    const channel = activeChannels.find((candidate) => candidate.id === data.channelId) ?? activeChannels[0];
    const preview = calcProductPreview({
      unitsCount: data.unitsCount,
      prepTimeMinutes: data.prepTimeMinutes,
      targetProfitPercent: data.targetProfitPercent,
      extraPercent: data.extraPercent,
      extraRecipes: data.extraRecipes,
      extraProducts: data.extraProducts,
      directInputs: data.directInputs,
      packagingInputs: data.packagingInputs,
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
      inputs: (inputs ?? []).map(mapInput),
      recipes: (recipes ?? []).map(mapRecipe),
      products: (products ?? []).map((row) => mapProduct(row, (recipes ?? []).map(mapRecipe))),
      feePercent: channel?.fee_percent ?? 0,
      paymentFeePercent: channel?.payment_fee_percent ?? 0,
      feeFixed: channel?.fee_fixed ?? 0
    });
    const fallbackUnitPrice = Number(data.manualUnitPrice ?? 0);
    if (preview.pricingError) {
      return reply.status(400).send({ message: preview.pricingError });
    }
    const persistedUnitPrice = fallbackUnitPrice > 0 ? fallbackUnitPrice : preview.unitPrice;
    const persistedSalePrice = persistedUnitPrice * data.unitsCount;

    const { data: updated, error } = await supabaseAdmin
      .from('products')
      .update({
        name: data.name,
        recipe_id: null,
        prep_time_minutes: data.prepTimeMinutes,
        notes: data.notes,
        units_count: data.unitsCount,
        target_profit_percent: data.targetProfitPercent,
        extra_percent: data.extraPercent,
        unit_price: persistedUnitPrice,
        sale_price: persistedSalePrice,
        channel_id: channel?.id,
        extra_recipes: data.extraRecipes,
        extra_products: data.extraProducts,
        direct_inputs: data.directInputs,
        packaging_inputs: data.packagingInputs
      })
      .eq('id', id.id)
      .eq('company_id', auth.companyId)
      .select('*')
      .single();

    if (error) return reply.status(404).send({ message: 'Produto nao encontrado' });
    return reply.send({ product: mapProduct(updated, (recipes ?? []).map(mapRecipe)), preview });
  });

  app.delete('/products/:id', cadastrosGuard, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const id = request.params as { id: string };

    const { data: deleted, error } = await supabaseAdmin
      .from('products')
      .delete()
      .eq('id', id.id)
      .eq('company_id', auth.companyId)
      .select('id')
      .single();

    if (error) return reply.status(400).send({ message: error.message ?? 'Erro ao excluir produto' });
    if (!deleted) return reply.status(404).send({ message: 'Produto nao encontrado' });
    return reply.status(204).send();
  });
};
