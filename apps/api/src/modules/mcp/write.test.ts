import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.SUPABASE_ANON_KEY = 'test-key';
const { prepareSchema, writeEnabled, reviewOrigin } = await import('./write.js');
const { reviewRoutes } = await import('./review.js');
const { inputWriteEnabled, prepareInput } = await import('./input-write.js');
const { saleWriteEnabled, salePriceSchema, prepareSalePrice } = await import('./sale-write.js');
const { productWriteEnabled, prepareProduct } = await import('./product-write.js');
const { manualSaleEnabled, manualSaleSchema, prepareManualSale } = await import('./manual-sale.js');
const { supabaseAdmin } = await import('../../db/supabase.js');
const uuid = '123e4567-e89b-12d3-a456-426614174000';
const jwt = (claims: object) => `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
test('escrita exige opt-in de desenvolvimento e entradas validas', () => {
  const node = process.env.NODE_ENV, flag = process.env.DOCE_MCP_PURCHASE_WRITE_ENABLED, origin = process.env.DOCE_MCP_REVIEW_ORIGIN;
  try {
    process.env.DOCE_MCP_PURCHASE_WRITE_ENABLED = 'true'; process.env.NODE_ENV = 'production'; assert.equal(writeEnabled(), false);
    process.env.NODE_ENV = 'development'; assert.equal(writeEnabled(), true);
    process.env.DOCE_MCP_REVIEW_ORIGIN = 'http://unsafe.example'; assert.throws(reviewOrigin);
    process.env.DOCE_MCP_REVIEW_ORIGIN = 'https://review.example'; assert.equal(reviewOrigin(), 'https://review.example');
    const item = { inputId: uuid, packagePrice: 1.01, packageSize: 1000, unit: 'g' };
    assert.equal(prepareSchema.safeParse({ idempotencyKey: uuid, items: [item, item] }).success, false);
    assert.equal(prepareSchema.safeParse({ idempotencyKey: uuid, items: [{ ...item, packagePrice: 1.001 }] }).success, false);
  } finally {
    if (node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = node;
    if (flag === undefined) delete process.env.DOCE_MCP_PURCHASE_WRITE_ENABLED; else process.env.DOCE_MCP_PURCHASE_WRITE_ENABLED = flag;
    if (origin === undefined) delete process.env.DOCE_MCP_REVIEW_ORIGIN; else process.env.DOCE_MCP_REVIEW_ORIGIN = origin;
  }
});

test('cadastro exige flag propria e respeita idempotencia por identidade', async () => {
  const old = { node: process.env.NODE_ENV, write: process.env.DOCE_MCP_PURCHASE_WRITE_ENABLED, input: process.env.DOCE_MCP_INPUT_WRITE_ENABLED, origin: process.env.DOCE_MCP_REVIEW_ORIGIN };
  const original = supabaseAdmin.from;
  const payload = { data: { name: 'Acucar', category: 'producao', unit: 'g', packageSize: 1000, packagePrice: 10, tags: [] } };
  let existing: any = { id: uuid, operation: 'create_input', payload, state: 'prepared', expires_at: '2027-01-01' };
  const calls: unknown[][] = [];
  (supabaseAdmin as any).from = (table: string) => {
    const result = table === 'company_subscriptions' ? { data: { plan_id: 'p', status: 'active' }, error: null }
      : table === 'plan_modules' ? { data: [{ module_key: 'cadastros' }, { module_key: 'mcp' }], error: null }
      : table === 'user_module_overrides' ? { data: [], error: null } : { data: existing, error: null };
    const chain: any = { select: () => chain, eq: (...args: unknown[]) => { calls.push([table, ...args]); return chain; }, maybeSingle: async () => result, then: (resolve: any) => resolve(result) };
    return chain;
  };
  try {
    process.env.NODE_ENV = 'development'; process.env.DOCE_MCP_PURCHASE_WRITE_ENABLED = 'true'; delete process.env.DOCE_MCP_INPUT_WRITE_ENABLED;
    assert.equal(inputWriteEnabled(), false);
    process.env.DOCE_MCP_INPUT_WRITE_ENABLED = 'true'; process.env.DOCE_MCP_REVIEW_ORIGIN = 'https://review.example';
    const auth = { companyId: 'empresa-a', userId: 'usuario-a' };
    assert.equal((await prepareInput(auth, { idempotencyKey: uuid, ...payload })).previewId, uuid);
    assert.ok(calls.some(c => c[0] === 'mcp_write_previews' && c[1] === 'company_id' && c[2] === 'empresa-a'));
    assert.ok(calls.some(c => c[0] === 'mcp_write_previews' && c[1] === 'auth_user_id' && c[2] === 'usuario-a'));
    existing = { ...existing, operation: 'purchase_prices' };
    await assert.rejects(prepareInput(auth, { idempotencyKey: uuid, ...payload }), /idempotencia/);
  } finally {
    (supabaseAdmin as any).from = original;
    for (const [key, value] of Object.entries({ NODE_ENV: old.node, DOCE_MCP_PURCHASE_WRITE_ENABLED: old.write, DOCE_MCP_INPUT_WRITE_ENABLED: old.input, DOCE_MCP_REVIEW_ORIGIN: old.origin })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('preco de venda exige flag separada, centavos validos e chave nao reutilizada', async () => {
  const old = { node: process.env.NODE_ENV, write: process.env.DOCE_MCP_PURCHASE_WRITE_ENABLED, sale: process.env.DOCE_MCP_SALE_WRITE_ENABLED, origin: process.env.DOCE_MCP_REVIEW_ORIGIN };
  const original = supabaseAdmin.from;
  const payload = { productId: uuid, unitPrice: 10.5 };
  let existing: any = { id: uuid, operation: 'sale_price', payload, state: 'prepared', expires_at: '2027-01-01' };
  (supabaseAdmin as any).from = (table: string) => {
    const result = table === 'company_subscriptions' ? { data: { plan_id: 'p', status: 'active' }, error: null }
      : table === 'plan_modules' ? { data: [{ module_key: 'cadastros' }, { module_key: 'mcp' }], error: null }
      : table === 'user_module_overrides' ? { data: [], error: null } : { data: existing, error: null };
    const chain: any = { select: () => chain, eq: () => chain, maybeSingle: async () => result, then: (resolve: any) => resolve(result) };
    return chain;
  };
  try {
    process.env.NODE_ENV = 'development'; process.env.DOCE_MCP_PURCHASE_WRITE_ENABLED = 'true'; delete process.env.DOCE_MCP_SALE_WRITE_ENABLED;
    assert.equal(saleWriteEnabled(), false);
    assert.equal(salePriceSchema.safeParse({ idempotencyKey: uuid, ...payload, unitPrice: 1.001 }).success, false);
    process.env.DOCE_MCP_SALE_WRITE_ENABLED = 'true'; process.env.DOCE_MCP_REVIEW_ORIGIN = 'https://review.example';
    const auth = { companyId: 'empresa-a', userId: 'usuario-a' };
    assert.equal((await prepareSalePrice(auth, { idempotencyKey: uuid, ...payload })).previewId, uuid);
    existing = { ...existing, payload: { ...payload, unitPrice: 99 } };
    await assert.rejects(prepareSalePrice(auth, { idempotencyKey: uuid, ...payload }), /idempotencia/);
  } finally {
    (supabaseAdmin as any).from = original;
    for (const [key, value] of Object.entries({ NODE_ENV: old.node, DOCE_MCP_PURCHASE_WRITE_ENABLED: old.write, DOCE_MCP_SALE_WRITE_ENABLED: old.sale, DOCE_MCP_REVIEW_ORIGIN: old.origin })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('preparacao de produto simples calcula preco oficial e nao cria produto', async () => {
  const old = { node: process.env.NODE_ENV, write: process.env.DOCE_MCP_PURCHASE_WRITE_ENABLED, product: process.env.DOCE_MCP_PRODUCT_WRITE_ENABLED, origin: process.env.DOCE_MCP_REVIEW_ORIGIN };
  const original = supabaseAdmin.from; let inserted: any;
  (supabaseAdmin as any).from = (table: string) => {
    let value: any = table === 'company_subscriptions' ? { plan_id: 'p', status: 'active' }
      : table === 'plan_modules' ? [{ module_key: 'cadastros' }, { module_key: 'mcp' }] : table === 'user_module_overrides' ? []
      : table === 'company_settings' ? { overhead_method: 'PER_UNIT', overhead_percent: 0, overhead_per_unit: 2, labor_cost_per_hour: 0, fixed_cost_per_hour: 0, taxes_percent: 0, default_profit_percent: 0 }
      : table === 'sales_channels' ? { id: uuid, name: 'Loja', active: true, fee_percent: 0, payment_fee_percent: 0, fee_fixed: 0 } : table === 'products' ? [] : null;
    const chain: any = { select: () => chain, eq: () => chain, ilike: () => chain, limit: () => chain,
      in: () => { if (table === 'sales_channels') value = [{ id: uuid }]; return chain; },
      maybeSingle: async () => ({ data: value, error: null }),
      insert: (v: any) => { inserted = v; value = { id: uuid, state: 'prepared', expires_at: '2027-01-01' }; return chain; },
      single: async () => ({ data: value, error: null }), then: (resolve: any) => resolve({ data: value, error: null }) };
    return chain;
  };
  try {
    process.env.NODE_ENV = 'development'; process.env.DOCE_MCP_PURCHASE_WRITE_ENABLED = 'true'; delete process.env.DOCE_MCP_PRODUCT_WRITE_ENABLED;
    assert.equal(productWriteEnabled(), false);
    process.env.DOCE_MCP_PRODUCT_WRITE_ENABLED = 'true'; process.env.DOCE_MCP_REVIEW_ORIGIN = 'https://review.example';
    const auth = { companyId: 'empresa-a', userId: 'usuario-a' };
    await prepareProduct(auth, { idempotencyKey: uuid, data: { name: 'Bolo', unitsCount: 2, targetProfitPercent: 100, channelId: uuid } });
    assert.equal(inserted.operation, 'create_product');
    assert.equal(inserted.snapshot.productDraft.unitPrice, 4);
    assert.equal(inserted.snapshot.productDraft.salePrice, 8);
    await assert.rejects(prepareProduct(auth, { idempotencyKey: uuid, data: { name: 'Bolo', unitsCount: 2, targetProfitPercent: 100, channelId: uuid, directInputs: [{ inputId: uuid, quantity: 1, unit: 'un' }] } }), /produto simples/);
  } finally {
    (supabaseAdmin as any).from = original;
    for (const [key, value] of Object.entries({ NODE_ENV: old.node, DOCE_MCP_PURCHASE_WRITE_ENABLED: old.write, DOCE_MCP_PRODUCT_WRITE_ENABLED: old.product, DOCE_MCP_REVIEW_ORIGIN: old.origin })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('venda financeira requer modulo, flag, conta e pagamento explicito', async () => {
  const old = { node: process.env.NODE_ENV, write: process.env.DOCE_MCP_PURCHASE_WRITE_ENABLED, sale: process.env.DOCE_MCP_FINANCIAL_SALE_ENABLED, origin: process.env.DOCE_MCP_REVIEW_ORIGIN };
  const original = supabaseAdmin.from; let inserted: any;
  (supabaseAdmin as any).from = (table: string) => {
    let value: any = table === 'company_subscriptions' ? { plan_id: 'p', status: 'active' }
      : table === 'plan_modules' ? [{ module_key: 'financeiro' }, { module_key: 'mcp' }] : table === 'user_module_overrides' ? []
      : table === 'financial_accounts' ? { id: uuid, name: 'Caixa', account_type: 'CASH', institution: '' } : null;
    const chain: any = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: value, error: null }),
      insert: (v: any) => { inserted = v; value = { id: uuid, state: 'prepared', expires_at: '2027-01-01' }; return chain; },
      single: async () => ({ data: value, error: null }), then: (resolve: any) => resolve({ data: value, error: null }) };
    return chain;
  };
  try {
    process.env.NODE_ENV = 'development'; process.env.DOCE_MCP_PURCHASE_WRITE_ENABLED = 'true'; delete process.env.DOCE_MCP_FINANCIAL_SALE_ENABLED;
    assert.equal(manualSaleEnabled(), false);
    const payload = { idempotencyKey: uuid, accountId: uuid, occurredAt: '2026-11-14T12:00:00Z', description: 'Venda', paymentMethod: 'PIX', amount: 10 };
    assert.equal(manualSaleSchema.safeParse({ ...payload, amount: 1.001 }).success, false);
    assert.equal(manualSaleSchema.safeParse({ ...payload, paymentMethod: undefined }).success, false);
    process.env.DOCE_MCP_FINANCIAL_SALE_ENABLED = 'true'; process.env.DOCE_MCP_REVIEW_ORIGIN = 'https://review.example';
    await prepareManualSale({ companyId: 'empresa-a', userId: 'usuario-a' }, payload);
    assert.equal(inserted.operation, 'manual_sale');
    assert.equal(inserted.snapshot.manualSale.accountName, 'Caixa');
    assert.equal(inserted.snapshot.manualSale.paymentMethod, 'PIX');
    assert.equal(inserted.snapshot.manualSale.amount, 10);
  } finally {
    (supabaseAdmin as any).from = original;
    for (const [key, value] of Object.entries({ NODE_ENV: old.node, DOCE_MCP_PURCHASE_WRITE_ENABLED: old.write, DOCE_MCP_FINANCIAL_SALE_ENABLED: old.sale, DOCE_MCP_REVIEW_ORIGIN: old.origin })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
test('revisao recusa token OAuth e origem estranha, mantendo filtros de empresa e usuario', async () => {
  const original = supabaseAdmin.from, oldOrigin = process.env.DOCE_MCP_REVIEW_ORIGIN;
  process.env.DOCE_MCP_REVIEW_ORIGIN = 'https://review.example';
  const calls: unknown[][] = [];
  (supabaseAdmin as any).from = (table: string) => {
    const result = table === 'company_subscriptions' ? { data: { plan_id: 'p', status: 'active' }, error: null }
      : table === 'plan_modules' ? { data: [{ module_key: 'cadastros' }, { module_key: 'mcp' }], error: null }
      : table === 'user_module_overrides' ? { data: [], error: null }
      : { data: null, error: null };
    const chain: any = { select: () => chain, eq: (...args: unknown[]) => { calls.push([table, ...args]); return chain; }, maybeSingle: async () => result, then: (resolve: any) => resolve(result) };
    return chain;
  };
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => { request.auth = { companyId: 'empresa-a', userId: 'usuario-a' }; });
  await app.register(reviewRoutes);
  try {
    const path = `/mcp-review/${uuid}`;
    const oauth = { authorization: `Bearer ${jwt({ aud: 'authenticated', client_id: 'client' })}` };
    assert.equal((await app.inject({ method: 'GET', url: path, headers: oauth })).statusCode, 403);
    const browser = { authorization: `Bearer ${jwt({ aud: 'authenticated' })}` };
    assert.equal((await app.inject({ method: 'POST', url: `${path}/confirm`, headers: { ...browser, origin: 'https://evil.example' }, payload: { digest: 'a'.repeat(64), confirm: true } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'GET', url: path, headers: browser })).statusCode, 404);
    assert.ok(calls.some(c => c[0] === 'mcp_write_previews' && c[1] === 'company_id' && c[2] === 'empresa-a'));
    assert.ok(calls.some(c => c[0] === 'mcp_write_previews' && c[1] === 'auth_user_id' && c[2] === 'usuario-a'));
  } finally { (supabaseAdmin as any).from = original; await app.close(); if (oldOrigin === undefined) delete process.env.DOCE_MCP_REVIEW_ORIGIN; else process.env.DOCE_MCP_REVIEW_ORIGIN = oldOrigin; }
});

test('revisao de pedido usa permissao pedidos e nao exige cadastros', async () => {
  const original = supabaseAdmin.from;
  const old = { node: process.env.NODE_ENV, write: process.env.DOCE_MCP_PURCHASE_WRITE_ENABLED, order: process.env.DOCE_MCP_ORDER_WRITE_ENABLED };
  process.env.NODE_ENV = 'development'; process.env.DOCE_MCP_PURCHASE_WRITE_ENABLED = 'true'; process.env.DOCE_MCP_ORDER_WRITE_ENABLED = 'true';
  (supabaseAdmin as any).from = (table: string) => {
    const result = table === 'company_subscriptions' ? { data: { plan_id: 'p', status: 'active' }, error: null }
      : table === 'plan_modules' ? { data: [{ module_key: 'pedidos' }, { module_key: 'mcp' }], error: null }
      : table === 'user_module_overrides' ? { data: [], error: null }
      : { data: { id: uuid, operation: 'create_order', snapshot: { order: {} }, state: 'prepared', expires_at: '2027-01-01', payload_digest: '\\x' + 'a'.repeat(64) }, error: null };
    const chain: any = { select: () => chain, eq: () => chain, maybeSingle: async () => result, then: (resolve: any) => resolve(result) };
    return chain;
  };
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => { request.auth = { companyId: 'empresa-a', userId: 'usuario-a' }; });
  await app.register(reviewRoutes);
  try {
    const response = await app.inject({ method: 'GET', url: `/mcp-review/${uuid}`, headers: { authorization: `Bearer ${jwt({ aud: 'authenticated' })}` } });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().operation, 'create_order');
  } finally {
    (supabaseAdmin as any).from = original; await app.close();
    for (const [key, value] of Object.entries({ NODE_ENV: old.node, DOCE_MCP_PURCHASE_WRITE_ENABLED: old.write, DOCE_MCP_ORDER_WRITE_ENABLED: old.order })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('preparacao reutiliza chave somente para os mesmos dados e mesma identidade', async () => {
  const { preparePurchase } = await import('./write.js');
  const original = supabaseAdmin.from;
  const old = { node: process.env.NODE_ENV, flag: process.env.DOCE_MCP_PURCHASE_WRITE_ENABLED, origin: process.env.DOCE_MCP_REVIEW_ORIGIN };
  process.env.NODE_ENV = 'development'; process.env.DOCE_MCP_PURCHASE_WRITE_ENABLED = 'true'; process.env.DOCE_MCP_REVIEW_ORIGIN = 'https://review.example';
  const item = { inputId: uuid, packagePrice: 1.01, packageSize: 1000, unit: 'g' };
  const calls: unknown[][] = [];
  let existing: any = { id: uuid, state: 'prepared', expires_at: '2027-01-01', payload: { items: [item] } };
  (supabaseAdmin as any).from = (table: string) => {
    const result = table === 'company_subscriptions' ? { data: { plan_id: 'p', status: 'active' }, error: null }
      : table === 'plan_modules' ? { data: [{ module_key: 'cadastros' }, { module_key: 'mcp' }], error: null }
      : table === 'user_module_overrides' ? { data: [], error: null }
      : { data: existing, error: null };
    const chain: any = { select: () => chain, eq: (...args: unknown[]) => { calls.push([table, ...args]); return chain; }, maybeSingle: async () => result, then: (resolve: any) => resolve(result) };
    return chain;
  };
  try {
    const auth = { companyId: 'empresa-a', userId: 'usuario-a' };
    const result = await preparePurchase(auth, { idempotencyKey: uuid, items: [item] });
    assert.equal(result.previewId, uuid);
    assert.ok(calls.some(c => c[0] === 'mcp_write_previews' && c[1] === 'company_id' && c[2] === 'empresa-a'));
    assert.ok(calls.some(c => c[0] === 'mcp_write_previews' && c[1] === 'auth_user_id' && c[2] === 'usuario-a'));
    existing = { ...existing, payload: { items: [{ ...item, packagePrice: 9 }] } };
    await assert.rejects(preparePurchase(auth, { idempotencyKey: uuid, items: [item] }), /idempotencia/);
  } finally {
    (supabaseAdmin as any).from = original;
    if (old.node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old.node;
    if (old.flag === undefined) delete process.env.DOCE_MCP_PURCHASE_WRITE_ENABLED; else process.env.DOCE_MCP_PURCHASE_WRITE_ENABLED = old.flag;
    if (old.origin === undefined) delete process.env.DOCE_MCP_REVIEW_ORIGIN; else process.env.DOCE_MCP_REVIEW_ORIGIN = old.origin;
  }
});
