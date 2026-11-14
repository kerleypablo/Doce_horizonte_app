import test from 'node:test';
import assert from 'node:assert/strict';
import type { CompanySettings, Input, Recipe } from '../../db/types.js';
process.env.SUPABASE_URL = 'http://127.0.0.1:54321'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'; process.env.SUPABASE_ANON_KEY = 'test-key';
const { simulateRecipe } = await import('./simulation.js');
const { registrationSchema } = await import('./registration.js');
const { simulateProduct } = await import('./product-simulation.js');
const input: Input = { id: 'i', companyId: 'a', name: 'Farinha', unit: 'g', category: 'producao', packageSize: 1000, packagePrice: 10, tags: [] };
const recipe: Recipe = { id: 'r', companyId: 'a', name: 'Bolo', yield: 1, yieldUnit: 'un', prepTimeMinutes: 0, ingredients: [{ inputId: 'i', unit: 'g', quantity: 500 }], subRecipes: [], tags: [] };
const settings: CompanySettings = { overheadMethod: 'PERCENT_DIRECT', overheadPercent: 0, overheadPerUnit: 0, laborCostPerHour: 0, fixedCostPerHour: 0, taxesPercent: 0, defaultProfitPercent: 0, salesChannels: [] };
const channel = { id: 'c', name: 'Loja', active: true, feePercent: 0, paymentFeePercent: 0, feeFixed: 0 };
const args = { recipeId: 'r', targetProfitPercent: 100 };
test('simulacao usa calculo oficial sem alterar os dados', () => {
  const before = JSON.stringify({ recipe, input, settings });
  const result = simulateRecipe(args, recipe, [input], [recipe], settings, [channel]);
  assert.equal(result.calculado, true);
  assert.equal(result.simulacao?.directCost, 5);
  assert.equal(result.simulacao?.suggestedPrice, 10);
  assert.equal(JSON.stringify({ recipe, input, settings }), before);
});
test('simulacao nao omite insumos ausentes, unidades invalidas, ciclos ou canais ambiguos', () => {
  assert.equal(simulateRecipe(args, recipe, [], [recipe], settings, [channel]).calculado, false);
  assert.equal(simulateRecipe(args, recipe, [{ ...input, unit: 'ml' }], [recipe], settings, [channel]).calculado, false);
  assert.equal(simulateRecipe(args, { ...recipe, subRecipes: [{ recipeId: 'r', quantity: 1 }] }, [input], [recipe], settings, [channel]).calculado, false);
  assert.equal(simulateRecipe(args, recipe, [input], [recipe], settings, [channel, { ...channel, id: 'd' }]).calculado, false);
});
test('cadastro informativo usa validacoes oficiais', () => {
  assert.equal(registrationSchema.safeParse({ kind: 'insumo', data: { name: 'Acucar', category: 'producao', unit: 'g', packageSize: 1000, packagePrice: 5 } }).success, true);
  assert.equal(registrationSchema.safeParse({ kind: 'insumo', data: { name: 'A', category: 'producao', unit: 'kg', packageSize: 0, packagePrice: 5 } }).success, false);
  assert.equal(registrationSchema.safeParse({ kind: 'produto', data: { name: 'Bolo', unitsCount: 0, targetProfitPercent: 10 } }).success, false);
});
test('simulacao de produto separa sugestao de preco vigente e detecta composicao incompleta', () => {
  const product = { id: 'p', companyId: 'a', name: 'Bolo', prepTimeMinutes: 0, unitsCount: 1, targetProfitPercent: 100, extraPercent: 0, unitPrice: 18, salePrice: 18, extraRecipes: [], extraProducts: [], directInputs: [{ inputId: 'i', quantity: 500, unit: 'g' as const }], packagingInputs: [] };
  const result = simulateProduct(product, [input], [recipe], [product], settings, channel, 100);
  assert.equal(result.calculado, true);
  assert.equal(result.simulacao?.unitPrice, 10);
  assert.equal(result.precoVigente?.unitario, 18);
  assert.equal(simulateProduct(product, [], [recipe], [product], settings, channel, 100).calculado, false);
  const cyclic = { ...product, extraProducts: [{ productId: 'p', quantity: 1 }] };
  assert.equal(simulateProduct(cyclic, [input], [recipe], [cyclic], settings, channel, 100).calculado, false);
});

test('simulacao carrega dados somente da empresa autenticada', async () => {
  const { simulateRecipeForCompany } = await import('./simulation.js');
  const { supabaseAdmin } = await import('../../db/supabase.js');
  const original = supabaseAdmin.from;
  const calls: unknown[][] = [];
  const rid = '123e4567-e89b-12d3-a456-426614174000';
  (supabaseAdmin as any).from = (table: string) => {
    const values: Record<string, unknown> = {
      company_subscriptions: { plan_id: 'p', status: 'active' }, plan_modules: [{ module_key: 'cadastros' }, { module_key: 'mcp' }], user_module_overrides: [],
      company_settings: { overhead_method: 'PERCENT_DIRECT', overhead_percent: 0, overhead_per_unit: 0, labor_cost_per_hour: 0, fixed_cost_per_hour: 0, taxes_percent: 0, default_profit_percent: 0 },
      recipes: [{ id: rid, name: 'Bolo', prep_time_minutes: 0, yield: 1, yield_unit: 'un', ingredients: [{ inputId: 'i', unit: 'g', quantity: 500 }], sub_recipes: [] }],
      inputs: [{ id: 'i', name: 'Farinha', unit: 'g', package_size: 1000, package_price: 10 }],
      sales_channels: [{ id: 'c', name: 'Loja', active: true, fee_percent: 0, payment_fee_percent: 0, fee_fixed: 0 }]
    };
    const result = { data: values[table], error: null };
    const chain: any = { select: () => chain, eq: (...args: unknown[]) => { calls.push([table, ...args]); return chain; }, limit: () => chain, maybeSingle: async () => result, then: (resolve: any) => resolve(result) };
    return chain;
  };
  try {
    const result = await simulateRecipeForCompany({ companyId: 'empresa-a', userId: 'usuario-a' }, { recipeId: rid, targetProfitPercent: 100 });
    assert.equal(result.simulacao?.suggestedPrice, 10);
    for (const table of ['company_settings', 'recipes', 'inputs', 'sales_channels']) assert.ok(calls.some(c => c[0] === table && c[1] === 'company_id' && c[2] === 'empresa-a'));
  } finally { (supabaseAdmin as any).from = original; }
});
