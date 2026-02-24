import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { z } from 'zod';
import { supabaseAdmin } from '../../db/supabase.js';
import { calcProductPreview } from '../pricing/product-calc.js';

const productSchema = z.object({
  name: z.string().min(2),
  recipeId: z.string().min(1).optional(),
  prepTimeMinutes: z.number().min(0).default(0),
  notes: z.string().optional(),
  unitsCount: z.number().positive(),
  targetProfitPercent: z.number().min(0),
  extraPercent: z.number().min(0).default(0),
  channelId: z.string().optional(),
  extraRecipes: z.array(z.object({ recipeId: z.string().min(1), quantity: z.number().positive() })).default([]),
  extraProducts: z.array(z.object({ productId: z.string().min(1), quantity: z.number().positive() })).default([]),
  packagingInputs: z.array(z.object({ inputId: z.string().min(1), quantity: z.number().positive(), unit: z.enum(['kg', 'g', 'l', 'ml', 'un']) })).default([])
});

export const productRoutes = async (app: FastifyInstance) => {
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

  const mapProduct = (row: any) => ({
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
    extraRecipes: row.extra_recipes ?? [],
    extraProducts: row.extra_products ?? [],
    packagingInputs: row.packaging_inputs ?? []
  });

  app.get('/products', { preHandler: app.authenticate }, async (request) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const { data } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('company_id', auth.companyId)
      .order('created_at', { ascending: false });
    return (data ?? []).map(mapProduct);
  });

  app.post('/products', { preHandler: app.authenticate }, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const data = productSchema.parse(request.body);

    let recipe: any = null;
    if (data.recipeId) {
      const result = await supabaseAdmin
        .from('recipes')
        .select('*')
        .eq('id', data.recipeId)
        .eq('company_id', auth.companyId)
        .single();
      recipe = result.data;
      if (!recipe) return reply.status(404).send({ message: 'Receita nao encontrada' });
    }

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

    const channel = (channels ?? []).find((c) => c.id === data.channelId) ?? (channels ?? [])[0];
    const preview = calcProductPreview({
      baseRecipe: recipe ? mapRecipe(recipe) : undefined,
      unitsCount: data.unitsCount,
      prepTimeMinutes: data.prepTimeMinutes,
      targetProfitPercent: data.targetProfitPercent,
      extraPercent: data.extraPercent,
      extraRecipes: data.extraRecipes,
      extraProducts: data.extraProducts,
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
      products: (products ?? []).map(mapProduct),
      feePercent: channel?.fee_percent ?? 0,
      paymentFeePercent: channel?.payment_fee_percent ?? 0,
      feeFixed: channel?.fee_fixed ?? 0
    });

    const { data: created, error } = await supabaseAdmin
      .from('products')
      .insert({
        id: crypto.randomUUID(),
        company_id: auth.companyId,
        name: data.name,
        recipe_id: data.recipeId ?? null,
        prep_time_minutes: data.prepTimeMinutes,
        notes: data.notes,
        units_count: data.unitsCount,
        target_profit_percent: data.targetProfitPercent,
        extra_percent: data.extraPercent,
        unit_price: preview.unitPrice,
        sale_price: preview.totalPrice,
        channel_id: channel?.id,
        extra_recipes: data.extraRecipes,
        extra_products: data.extraProducts,
        packaging_inputs: data.packagingInputs
      })
      .select('*')
      .single();

    if (error) return reply.status(400).send({ message: 'Erro ao criar produto' });
    return reply.status(201).send({ product: mapProduct(created), preview });
  });

  app.put('/products/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const auth = (request as typeof request & { auth: { companyId: string } }).auth;
    const data = productSchema.parse(request.body);
    const id = request.params as { id: string };

    let recipe: any = null;
    if (data.recipeId) {
      const result = await supabaseAdmin
        .from('recipes')
        .select('*')
        .eq('id', data.recipeId)
        .eq('company_id', auth.companyId)
        .single();
      recipe = result.data;
      if (!recipe) return reply.status(404).send({ message: 'Receita nao encontrada' });
    }

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

    const channel = (channels ?? []).find((c) => c.id === data.channelId) ?? (channels ?? [])[0];
    const preview = calcProductPreview({
      baseRecipe: recipe ? mapRecipe(recipe) : undefined,
      unitsCount: data.unitsCount,
      prepTimeMinutes: data.prepTimeMinutes,
      targetProfitPercent: data.targetProfitPercent,
      extraPercent: data.extraPercent,
      extraRecipes: data.extraRecipes,
      extraProducts: data.extraProducts,
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
      products: (products ?? []).map(mapProduct),
      feePercent: channel?.fee_percent ?? 0,
      paymentFeePercent: channel?.payment_fee_percent ?? 0,
      feeFixed: channel?.fee_fixed ?? 0
    });

    const { data: updated, error } = await supabaseAdmin
      .from('products')
      .update({
        name: data.name,
        recipe_id: data.recipeId ?? null,
        prep_time_minutes: data.prepTimeMinutes,
        notes: data.notes,
        units_count: data.unitsCount,
        target_profit_percent: data.targetProfitPercent,
        extra_percent: data.extraPercent,
        unit_price: preview.unitPrice,
        sale_price: preview.totalPrice,
        channel_id: channel?.id,
        extra_recipes: data.extraRecipes,
        extra_products: data.extraProducts,
        packaging_inputs: data.packagingInputs
      })
      .eq('id', id.id)
      .eq('company_id', auth.companyId)
      .select('*')
      .single();

    if (error) return reply.status(404).send({ message: 'Produto nao encontrado' });
    return reply.send({ product: mapProduct(updated), preview });
  });
};
