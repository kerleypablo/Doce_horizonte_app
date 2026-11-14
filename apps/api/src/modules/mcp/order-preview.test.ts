import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_URL = 'http://127.0.0.1:54321'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'; process.env.SUPABASE_ANON_KEY = 'test-key';
const { orderPreviewSchema, computeOrderPreview } = await import('./order-preview.js');
const id = '123e4567-e89b-12d3-a456-426614174000';
const customerId = '123e4567-e89b-12d3-a456-426614174001';
const input = { customerId, type: 'PEDIDO', deliveryType: 'ENTREGA', products: [{ productId: id, quantity: 2 }], discountMode: 'PERCENT', discountValue: 10, shippingValue: 5 };
test('previa calcula desconto e frete pela regra oficial sem registro', () => {
  const args = orderPreviewSchema.parse(input);
  const result = computeOrderPreview(args, { id: customerId, name: 'Cliente' }, [{ id, name: 'Bolo', unit_price: 20, sale_price: 30 }]);
  assert.equal(result.total, 41);
  assert.equal(result.applicable, false);
  assert.equal(result.products[0].unitPrice, 20);
});
test('previa rejeita valores invalidos, repeticao e referencias ausentes', () => {
  assert.equal(orderPreviewSchema.safeParse({ ...input, products: [...input.products, ...input.products] }).success, false);
  assert.equal(orderPreviewSchema.safeParse({ ...input, discountValue: 101 }).success, false);
  assert.throws(() => computeOrderPreview(orderPreviewSchema.parse(input), { id: customerId, name: 'Cliente' }, []));
  assert.throws(() => computeOrderPreview(orderPreviewSchema.parse({ ...input, discountMode: 'FIXED', discountValue: 50 }), { id: customerId, name: 'Cliente' }, [{ id, name: 'Bolo', unit_price: 20, sale_price: 30 }]));
});

test('usa preco de venda quando preco unitario e zero, como o seletor de pedidos', () => {
  const result = computeOrderPreview(orderPreviewSchema.parse(input), { id: customerId, name: 'Cliente' }, [{ id, name: 'Bolo', unit_price: 0, sale_price: 30 }]);
  assert.equal(result.products[0].unitPrice, 30);
  assert.equal(result.total, 59);
});

test('aceita numericos do banco representados como texto no fallback', () => {
  const p = { id, name: 'Bolo', unit_price: '0', sale_price: '30' } as unknown as { id: string; name: string; unit_price: number; sale_price: number };
  assert.equal(computeOrderPreview(orderPreviewSchema.parse(input), { id: customerId, name: 'Cliente' }, [p]).products[0].unitPrice, 30);
});

test('pedido persistido experimental exige flag e prepara custos sem pagamentos', async () => {
  const { prepareOrder, orderWriteEnabled } = await import('./order-write.js');
  const { supabaseAdmin } = await import('../../db/supabase.js');
  const old = { node: process.env.NODE_ENV, write: process.env.DOCE_MCP_PURCHASE_WRITE_ENABLED, order: process.env.DOCE_MCP_ORDER_WRITE_ENABLED, origin: process.env.DOCE_MCP_REVIEW_ORIGIN };
  const original = supabaseAdmin.from;
  let inserted: any;
  const customer = { id: customerId, name: 'Cliente', phone: '11999999999' };
  const product = { id, name: 'Bolo', unit_price: 20, sale_price: 20, units_count: 1, prep_time_minutes: 0, target_profit_percent: 0, extra_percent: 0, channel_id: 'c', recipe_id: null, extra_recipes: [], extra_products: [], direct_inputs: [], packaging_inputs: [] };
  (supabaseAdmin as any).from = (table: string) => {
    let result: any = table === 'company_subscriptions' ? { data: { plan_id: 'p', status: 'active' }, error: null }
      : table === 'plan_modules' ? { data: [{ module_key: 'pedidos' }, { module_key: 'mcp' }], error: null }
      : table === 'user_module_overrides' ? { data: [], error: null }
      : table === 'customers' ? { data: customer, error: null }
      : table === 'products' ? { data: [product], error: null }
      : table === 'company_settings' ? { data: { overhead_method: 'PER_UNIT', overhead_percent: 0, overhead_per_unit: 2, labor_cost_per_hour: 0, fixed_cost_per_hour: 0, taxes_percent: 0, default_profit_percent: 0 }, error: null }
      : table === 'sales_channels' ? { data: [{ id: 'c', active: true, fee_percent: 0, payment_fee_percent: 0, fee_fixed: 0 }], error: null }
      : { data: null, error: null };
    const chain: any = { select: () => chain, eq: () => chain, in: () => chain, maybeSingle: async () => result,
      insert: (value: any) => { inserted = value; result = { data: { id, state: 'prepared', expires_at: '2027-01-01' }, error: null }; return chain; },
      single: async () => result, then: (resolve: any) => resolve(result) };
    return chain;
  };
  try {
    process.env.NODE_ENV = 'development'; process.env.DOCE_MCP_PURCHASE_WRITE_ENABLED = 'true'; delete process.env.DOCE_MCP_ORDER_WRITE_ENABLED;
    assert.equal(orderWriteEnabled(), false);
    process.env.DOCE_MCP_ORDER_WRITE_ENABLED = 'true'; process.env.DOCE_MCP_REVIEW_ORIGIN = 'https://review.example';
    const args = { ...input, deliveryType: 'RETIRADA', idempotencyKey: id, orderDateTime: '2026-11-14T12:00:00Z' };
    await prepareOrder({ companyId: 'empresa-a', userId: 'usuario-a' }, args);
    assert.equal(inserted.operation, 'create_order');
    assert.equal(inserted.snapshot.order.total, 41);
    assert.equal(inserted.snapshot.order.products[0].estimatedUnitCost, 2);
    assert.equal(inserted.snapshot.order.payments, undefined);
    await assert.rejects(prepareOrder({ companyId: 'empresa-a', userId: 'usuario-a' }, { ...args, deliveryType: 'ENTREGA' }), /endereco/);
  } finally {
    (supabaseAdmin as any).from = original;
    for (const [key, value] of Object.entries({ NODE_ENV: old.node, DOCE_MCP_PURCHASE_WRITE_ENABLED: old.write, DOCE_MCP_ORDER_WRITE_ENABLED: old.order, DOCE_MCP_REVIEW_ORIGIN: old.origin })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
