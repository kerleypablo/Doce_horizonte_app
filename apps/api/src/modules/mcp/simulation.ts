import { z } from 'zod';
import { supabaseAdmin } from '../../db/supabase.js';
import { calcPricePreview } from '../pricing/calc.js';
import { getMcpModules } from './authorization.js';
import type { McpIdentity } from './service.js';
import type { CompanySettings, Input, Recipe } from '../../db/types.js';

export const simulationSchema = z.object({ recipeId: z.string().uuid(), targetProfitPercent: z.number().finite().min(0).max(10000), channelId: z.string().uuid().optional() }).strict();
type SimArgs = z.infer<typeof simulationSchema>;
export function simulateRecipe(args: SimArgs, recipe: Recipe, inputs: Input[], recipes: Recipe[], settings: CompanySettings, channels: { id: string; name: string; active: boolean; feePercent: number; paymentFeePercent: number; feeFixed: number }[]) {
  const issues: string[] = [];
  const inputsById = new Map(inputs.map(i => [i.id, i]));
  const recipesById = new Map(recipes.map(r => [r.id, r]));
  const numeric = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  for (const n of [settings.overheadPercent, settings.overheadPerUnit, settings.laborCostPerHour, settings.fixedCostPerHour, settings.taxesPercent, settings.defaultProfitPercent]) if (!numeric(n)) issues.push('Configuracao de custo ou imposto invalida');
  if (!['PERCENT_DIRECT', 'PER_UNIT'].includes(settings.overheadMethod)) issues.push('Metodo de custo indireto invalido');
  const inspect = (r: Recipe, visiting: Set<string>) => {
    if (visiting.has(r.id)) { issues.push(`Ciclo de receitas: ${r.id}`); return; }
    if (!Number.isFinite(r.yield) || r.yield <= 0 || !numeric(r.prepTimeMinutes) || !Array.isArray(r.ingredients) || !Array.isArray(r.subRecipes)) { issues.push(`Receita invalida: ${r.id}`); return; }
    visiting.add(r.id);
    for (const item of r.ingredients) {
      const ingredient = inputsById.get(item.inputId);
      if (!ingredient) { issues.push(`Insumo ausente: ${item.inputId}`); continue; }
      if (!numeric(ingredient.packagePrice) || !Number.isFinite(ingredient.packageSize) || ingredient.packageSize <= 0 || !numeric(item.quantity) || item.quantity <= 0 || item.unit !== ingredient.unit) issues.push(`Insumo ou unidade invalida: ${item.inputId}`);
    }
    for (const item of r.subRecipes) {
      const sub = recipesById.get(item.recipeId);
      if (!sub || !numeric(item.quantity) || item.quantity <= 0) issues.push(`Sub-receita ausente ou invalida: ${item.recipeId}`);
      else inspect(sub, visiting);
    }
    visiting.delete(r.id);
  };
  inspect(recipe, new Set());
  const active = channels.filter(c => c.active);
  const channel = args.channelId ? active.find(c => c.id === args.channelId) : active.length === 1 ? active[0] : undefined;
  if (!channel) issues.push(args.channelId ? 'Canal nao encontrado ou inativo' : 'Informe um canal ativo sem ambiguidade');
  if (channel && ![channel.feePercent, channel.paymentFeePercent, channel.feeFixed].every(numeric)) issues.push('Taxas do canal invalidas');
  if (issues.length || !channel) return { calculado: false, problemas: [...new Set(issues)] };
  const result = calcPricePreview({ recipe, inputs, recipes, settings, profitPercent: args.targetProfitPercent, feePercent: channel.feePercent, paymentFeePercent: channel.paymentFeePercent, feeFixed: channel.feeFixed });
  return { calculado: !result.pricingError, receita: { id: recipe.id, name: recipe.name, yield: recipe.yield, yieldUnit: recipe.yieldUnit }, canal: channel, taxas: { impostosPercent: settings.taxesPercent, canalPercent: channel.feePercent, pagamentoPercent: channel.paymentFeePercent, fixa: channel.feeFixed }, simulacao: result, aviso: 'Simulacao para a receita inteira; nao altera precos e nao representa o preco vigente de produto.' };
}
const n = (value: unknown) => value === null || value === undefined ? NaN : Number(value);
export async function simulateRecipeForCompany(auth: McpIdentity, input: unknown) {
  if (!(await getMcpModules(auth.companyId, auth.userId)).includes('cadastros')) throw Object.assign(new Error('Modulo nao habilitado'), { statusCode: 403 });
  const args = simulationSchema.parse(input);
  const [settings, recipes, inputs, channels] = await Promise.all([
    supabaseAdmin.from('company_settings').select('overhead_method,overhead_percent,overhead_per_unit,labor_cost_per_hour,fixed_cost_per_hour,taxes_percent,default_profit_percent').eq('company_id', auth.companyId).maybeSingle(),
    supabaseAdmin.from('recipes').select('id,name,prep_time_minutes,yield,yield_unit,ingredients,sub_recipes').eq('company_id', auth.companyId).limit(1001),
    supabaseAdmin.from('inputs').select('id,name,unit,package_size,package_price').eq('company_id', auth.companyId).limit(1001),
    supabaseAdmin.from('sales_channels').select('id,name,active,fee_percent,payment_fee_percent,fee_fixed').eq('company_id', auth.companyId).limit(101)
  ]);
  if (settings.error || recipes.error || inputs.error || channels.error || !settings.data || !recipes.data || !inputs.data || !channels.data) throw new Error('Dados de precificacao indisponiveis');
  if (recipes.data.length > 1000 || inputs.data.length > 1000 || channels.data.length > 100) throw new Error('Volume excede limite de simulacao');
  const mappedRecipes: Recipe[] = recipes.data.map((r: any) => ({ id: r.id, companyId: auth.companyId, name: r.name, prepTimeMinutes: n(r.prep_time_minutes), yield: n(r.yield), yieldUnit: r.yield_unit, ingredients: r.ingredients, subRecipes: r.sub_recipes, tags: [] }));
  const mappedInputs: Input[] = inputs.data.map((i: any) => ({ id: i.id, companyId: auth.companyId, name: i.name, category: 'outros', unit: i.unit, packageSize: n(i.package_size), packagePrice: n(i.package_price), tags: [] }));
  const root = mappedRecipes.find(r => r.id === args.recipeId);
  if (!root) throw Object.assign(new Error('Receita nao encontrada'), { statusCode: 404 });
  const row = settings.data;
  const mappedSettings: CompanySettings = { overheadMethod: row.overhead_method, overheadPercent: n(row.overhead_percent), overheadPerUnit: n(row.overhead_per_unit), laborCostPerHour: n(row.labor_cost_per_hour), fixedCostPerHour: n(row.fixed_cost_per_hour), taxesPercent: n(row.taxes_percent), defaultProfitPercent: n(row.default_profit_percent), salesChannels: [] };
  const mappedChannels = channels.data.map((c: any) => ({ id: c.id, name: c.name, active: c.active !== false, feePercent: n(c.fee_percent), paymentFeePercent: n(c.payment_fee_percent), feeFixed: n(c.fee_fixed) }));
  return simulateRecipe(args, root, mappedInputs, mappedRecipes, mappedSettings, mappedChannels);
}
