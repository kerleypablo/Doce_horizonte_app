import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.SUPABASE_ANON_KEY = 'test-key';
const { orderRoutes } = await import('./routes.js');
const { supabaseAdmin } = await import('../../db/supabase.js');
test('pedido registra custo de insumos diretos no retrato financeiro', async () => {
  const original = supabaseAdmin.from;
  let inserted: any;
  const product = { id: 'p', name: 'Bolo', units_count: 1, prep_time_minutes: 0, target_profit_percent: 0, extra_percent: 0, unit_price: 20, sale_price: 20, extra_recipes: [], extra_products: [], direct_inputs: [{ inputId: 'i', quantity: 500, unit: 'g' }], packaging_inputs: [] };
  (supabaseAdmin as any).from = (table: string) => {
    let value: any = table === 'company_settings' ? { overhead_method: 'PERCENT_DIRECT', overhead_percent: 0, overhead_per_unit: 0, labor_cost_per_hour: 0, fixed_cost_per_hour: 0, taxes_percent: 0, default_profit_percent: 0 }
      : table === 'products' ? [product] : table === 'inputs' ? [{ id: 'i', name: 'Farinha', category: 'producao', unit: 'g', package_size: 1000, package_price: 10, tags: [] }] : [];
    const chain: any = { select: () => chain, eq: () => chain, gte: () => chain, lte: () => chain, order: () => chain, limit: () => chain,
      in: () => { if (table === 'products') value = [{ id: 'p' }]; return chain; },
      insert: (v: any) => { inserted = v; value = { ...v, id: 'order' }; return chain; },
      single: async () => ({ data: value, error: null }), then: (resolve: any) => resolve({ data: value, error: null }) };
    return chain;
  };
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => { request.auth = { companyId: 'company-a' }; });
  app.decorate('requireModule', () => async () => {});
  await app.register(orderRoutes);
  try {
    const response = await app.inject({ method: 'POST', url: '/orders', payload: { type: 'PEDIDO', orderDateTime: '2026-11-14T12:00:00Z', deliveryType: 'RETIRADA', status: 'AGUARDANDO_RETORNO', products: [{ productId: 'p', name: 'Bolo', unitPrice: 20, quantity: 2 }] } });
    assert.equal(response.statusCode, 201);
    assert.equal(inserted.company_id, 'company-a');
    assert.equal(inserted.products[0].estimatedUnitCost, 5);
    assert.equal(inserted.products[0].estimatedTotalCost, 10);
  } finally { (supabaseAdmin as any).from = original; await app.close(); }
});
