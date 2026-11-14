import { z } from 'zod';
import { supabaseAdmin } from '../../db/supabase.js';
import { calcProductPreview } from '../pricing/product-calc.js';
import type { CompanySettings, Input, Product, Recipe } from '../../db/types.js';
import { getMcpModules } from './authorization.js';
import { simulateRecipe } from './simulation.js';
import type { McpIdentity } from './service.js';

export const productSimulationSchema = z.object({ productId: z.string().uuid(), targetProfitPercent: z.number().finite().min(0).max(10000), channelId: z.string().uuid().optional() }).strict();
type Channel = { id: string; name: string; active: boolean; feePercent: number; paymentFeePercent: number; feeFixed: number };
export function simulateProduct(product: Product, inputs: Input[], recipes: Recipe[], products: Product[], settings: CompanySettings, channel: Channel, profit: number) {
  const issues: string[] = [];
  const inputMap = new Map(inputs.map(x => [x.id, x]));
  const recipeMap = new Map(recipes.map(x => [x.id, x]));
  const productMap = new Map(products.map(x => [x.id, x]));
  const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  const checkProduct = (p: Product, visited: Set<string>) => {
    if (visited.has(p.id)) { issues.push(`Ciclo de produtos: ${p.id}`); return; }
    if (!number(p.unitsCount) || p.unitsCount <= 0 || !number(p.prepTimeMinutes) || !number(p.extraPercent) || !number(p.unitPrice) || !number(p.salePrice) || !Array.isArray(p.extraRecipes) || !Array.isArray(p.extraProducts) || !Array.isArray(p.directInputs) || !Array.isArray(p.packagingInputs)) { issues.push(`Produto invalido: ${p.id}`); return; }
    visited.add(p.id);
    for (const item of [...(p.directInputs ?? []), ...p.packagingInputs]) {
      const i = inputMap.get(item.inputId);
      if (!i || !number(i.packagePrice) || !number(i.packageSize) || i.packageSize <= 0 || !number(item.quantity) || item.quantity <= 0 || i.unit !== item.unit) issues.push(`Insumo ou unidade invalida: ${item.inputId}`);
    }
    for (const item of p.extraRecipes) {
      const r = recipeMap.get(item.recipeId);
      if (!r || !number(item.quantity) || item.quantity <= 0) { issues.push(`Receita ausente ou invalida: ${item.recipeId}`); continue; }
      const checked = simulateRecipe({ recipeId: r.id, targetProfitPercent: profit, channelId: channel.id }, r, inputs, recipes, settings, [channel]);
      if (!checked.calculado) issues.push(...(checked.problemas ?? ['Configuracao de receita invalida']));
    }
    for (const item of p.extraProducts) {
      const child = productMap.get(item.productId);
      if (!child || !number(item.quantity) || item.quantity <= 0) issues.push(`Produto componente ausente ou invalido: ${item.productId}`);
      else checkProduct(child, visited);
    }
    visited.delete(p.id);
  };
  checkProduct(product, new Set());
  const fields = [settings.overheadPercent, settings.overheadPerUnit, settings.laborCostPerHour, settings.fixedCostPerHour, settings.taxesPercent, channel.feePercent, channel.paymentFeePercent, channel.feeFixed];
  if (!channel.active || !fields.every(number) || !['PERCENT_DIRECT', 'PER_UNIT'].includes(settings.overheadMethod)) issues.push('Configuracao de custo ou canal invalida');
  if (issues.length) return { calculado: false, problemas: [...new Set(issues)] };
  const result = calcProductPreview({ unitsCount: product.unitsCount, prepTimeMinutes: product.prepTimeMinutes, targetProfitPercent: profit, extraPercent: product.extraPercent, extraRecipes: product.extraRecipes, extraProducts: product.extraProducts, directInputs: product.directInputs, packagingInputs: product.packagingInputs, settings, inputs, recipes, products, feePercent: channel.feePercent, paymentFeePercent: channel.paymentFeePercent, feeFixed: channel.feeFixed });
  return { calculado: !result.pricingError, produto: { id: product.id, name: product.name }, precoVigente: { unitario: product.unitPrice, lote: product.salePrice }, canal: channel, simulacao: result, aviso: 'Simulacao nao grava e nao altera o preco vigente.' };
}
const n = (v: unknown) => v === null || v === undefined ? NaN : Number(v);
export async function simulateProductForCompany(auth: McpIdentity, input: unknown) {
  if (!(await getMcpModules(auth.companyId, auth.userId)).includes('cadastros')) throw Object.assign(new Error('Modulo nao habilitado'), { statusCode: 403 });
  const args = productSimulationSchema.parse(input);
  const [settings, inputs, recipes, products, channels] = await Promise.all([
    supabaseAdmin.from('company_settings').select('overhead_method,overhead_percent,overhead_per_unit,labor_cost_per_hour,fixed_cost_per_hour,taxes_percent,default_profit_percent').eq('company_id', auth.companyId).maybeSingle(),
    supabaseAdmin.from('inputs').select('id,name,unit,package_size,package_price').eq('company_id', auth.companyId).limit(1001),
    supabaseAdmin.from('recipes').select('id,name,prep_time_minutes,yield,yield_unit,ingredients,sub_recipes').eq('company_id', auth.companyId).limit(1001),
    supabaseAdmin.from('products').select('id,name,recipe_id,prep_time_minutes,units_count,target_profit_percent,extra_percent,unit_price,sale_price,channel_id,extra_recipes,extra_products,direct_inputs,packaging_inputs').eq('company_id', auth.companyId).limit(1001),
    supabaseAdmin.from('sales_channels').select('id,name,active,fee_percent,payment_fee_percent,fee_fixed').eq('company_id', auth.companyId).limit(101)
  ]);
  if ([settings, inputs, recipes, products, channels].some(r => r.error || !r.data) || !settings.data || !inputs.data || !recipes.data || !products.data || !channels.data) throw new Error('Dados de precificacao indisponiveis');
  if (inputs.data.length > 1000 || recipes.data.length > 1000 || products.data.length > 1000 || channels.data.length > 100) throw new Error('Volume excede limite de simulacao');
  const mappedInputs: Input[] = inputs.data.map((i: any) => ({ id: i.id, companyId: auth.companyId, name: i.name, category: 'outros', unit: i.unit, packageSize: n(i.package_size), packagePrice: n(i.package_price), tags: [] }));
  const mappedRecipes: Recipe[] = recipes.data.map((r: any) => ({ id: r.id, companyId: auth.companyId, name: r.name, prepTimeMinutes: n(r.prep_time_minutes), yield: n(r.yield), yieldUnit: r.yield_unit, ingredients: r.ingredients, subRecipes: r.sub_recipes, tags: [] }));
  const mappedProducts: Product[] = products.data.map((p: any) => {
    const extra = Array.isArray(p.extra_recipes) ? [...p.extra_recipes] : p.extra_recipes;
    if (p.recipe_id && Array.isArray(extra) && !extra.some((r: any) => r.recipeId === p.recipe_id)) {
      const recipe = mappedRecipes.find(r => r.id === p.recipe_id);
      if (!recipe) throw new Error('Receita legada ausente');
      extra.unshift({ recipeId: p.recipe_id, quantity: recipe.yield });
    }
    return { id: p.id, companyId: auth.companyId, name: p.name, prepTimeMinutes: n(p.prep_time_minutes), unitsCount: n(p.units_count), targetProfitPercent: n(p.target_profit_percent), extraPercent: n(p.extra_percent), unitPrice: n(p.unit_price), salePrice: n(p.sale_price), channelId: p.channel_id, extraRecipes: extra, extraProducts: p.extra_products, directInputs: p.direct_inputs, packagingInputs: p.packaging_inputs };
  });
  const product = mappedProducts.find(p => p.id === args.productId);
  if (!product) throw new Error('Produto nao encontrado');
  const row = settings.data;
  const mappedSettings: CompanySettings = { overheadMethod: row.overhead_method, overheadPercent: n(row.overhead_percent), overheadPerUnit: n(row.overhead_per_unit), laborCostPerHour: n(row.labor_cost_per_hour), fixedCostPerHour: n(row.fixed_cost_per_hour), taxesPercent: n(row.taxes_percent), defaultProfitPercent: n(row.default_profit_percent), salesChannels: [] };
  const active: Channel[] = channels.data.map((c: any) => ({ id: c.id, name: c.name, active: c.active !== false, feePercent: n(c.fee_percent), paymentFeePercent: n(c.payment_fee_percent), feeFixed: n(c.fee_fixed) })).filter(c => c.active);
  const desired = args.channelId ?? product.channelId;
  const channel = desired ? active.find(c => c.id === desired) : active.length === 1 ? active[0] : undefined;
  if (!channel) return { calculado: false, problemas: ['Informe um canal ativo sem ambiguidade'] };
  return simulateProduct(product, mappedInputs, mappedRecipes, mappedProducts, mappedSettings, channel, args.targetProfitPercent);
}
