import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.SUPABASE_ANON_KEY = 'test-key';
const { mcpRoutes } = await import('./routes.js');
const { getMcpModules } = await import('./authorization.js');
const { supabaseAdmin } = await import('../../db/supabase.js');

test('autorizacao MCP nega sem assinatura, com erros ou modulos desabilitados e isola usuario e empresa', async () => {
  const original = supabaseAdmin.from;
  const calls: unknown[][] = [];
  let subscription: any = { data: { plan_id: 'plan-a', status: 'active' }, error: null };
  let plan: any = { data: [{ module_key: 'cadastros' }, { module_key: 'pedidos' }, { module_key: 'mcp' }], error: null };
  let overrides: any = { data: [{ module_key: 'cadastros', enabled: false }, { module_key: 'pedidos', enabled: false }], error: null };
  (supabaseAdmin as any).from = (table: string) => {
    const result = table === 'company_subscriptions' ? subscription : table === 'plan_modules' ? plan : overrides;
    const chain: any = { select: () => chain, eq: (key: string, value: string) => { calls.push([table, key, value]); return chain; }, maybeSingle: async () => result, then: (resolve: any) => resolve(result) };
    return chain;
  };
  try {
    assert.deepEqual(await getMcpModules('empresa-a', 'usuario-a'), ['mcp']);
    assert.ok(calls.some(c => c[0] === 'user_module_overrides' && c[1] === 'company_id' && c[2] === 'empresa-a'));
    assert.ok(calls.some(c => c[0] === 'user_module_overrides' && c[1] === 'auth_user_id' && c[2] === 'usuario-a'));
    overrides = { data: [{ module_key: 'mcp', enabled: false }], error: null };
    assert.deepEqual(await getMcpModules('empresa-a', 'usuario-a'), []);
    plan = { data: [{ module_key: 'cadastros' }], error: null };
    overrides = { data: [], error: null };
    assert.deepEqual(await getMcpModules('empresa-a', 'usuario-a'), []);
    overrides = { data: [{ module_key: 'mcp', enabled: true }], error: null };
    assert.deepEqual(await getMcpModules('empresa-a', 'usuario-a'), ['cadastros', 'mcp']);
    plan = { data: [{ module_key: 'cadastros' }, { module_key: 'pedidos' }, { module_key: 'mcp' }], error: null };
    overrides = { data: [{ module_key: 'cadastros', enabled: true }], error: null };
    assert.deepEqual(await getMcpModules('empresa-a', 'usuario-a'), ['cadastros', 'pedidos', 'mcp']);
    for (const value of [null, { plan_id: 'plan-a', status: 'inactive' }]) {
      subscription = { data: value, error: null };
      assert.deepEqual(await getMcpModules('empresa-a', 'usuario-a'), []);
    }
    subscription = { data: null, error: { code: '42P01' } };
    await assert.rejects(getMcpModules('empresa-a', 'usuario-a'));
    subscription = { data: { plan_id: 'plan-a', status: 'active' }, error: null };
    plan = { data: null, error: { code: '42P01' } };
    await assert.rejects(getMcpModules('empresa-a', 'usuario-a'));
    plan = { data: [], error: null };
    overrides = { data: null, error: { code: '42P01' } };
    await assert.rejects(getMcpModules('empresa-a', 'usuario-a'));
    overrides = { data: [], error: null };
    assert.deepEqual(await getMcpModules('empresa-a', 'usuario-a'), []);
  } finally { (supabaseAdmin as any).from = original; }
});

test('consulta filtra empresa e nao confia nos modulos legados', async () => {
  const calls: unknown[][] = [];
  const original = supabaseAdmin.from;
  let enabled = true;
  (supabaseAdmin as any).from = (table: string) => {
    calls.push(['from', table]);
    let result: any = table === 'company_subscriptions' ? { data: { plan_id: 'p', status: 'active' }, error: null }
      : table === 'plan_modules' ? { data: [{ module_key: 'cadastros' }, { module_key: 'mcp' }], error: null }
      : table === 'user_module_overrides' ? { data: enabled ? [] : [{ module_key: 'cadastros', enabled: false }], error: null }
      : { data: [{ id: 1 }, { id: 2 }], error: null };
    const chain: any = {
      select: () => chain, eq: (...args: unknown[]) => { calls.push([table, ...args]); return chain; }, order: () => chain,
      range: (...args: unknown[]) => { calls.push(['range', ...args]); return chain; }, ilike: () => chain,
      maybeSingle: async () => result, then: (resolve: any) => resolve(result)
    };
    return chain;
  };
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => { request.auth = { userId: 'usuario-a', companyId: 'empresa-a', modules: ['cadastros', 'pedidos'] }; });
  await app.register(mcpRoutes);
  try {
    const response = await app.inject('/mcp-local/search?kind=inputs&limit=1');
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { items: [{ id: 1 }], hasMore: true, offset: 0 });
    assert.ok(calls.some(c => c[0] === 'inputs' && c[1] === 'company_id' && c[2] === 'empresa-a'));
    assert.ok(calls.some(c => c[0] === 'range' && c[1] === 0 && c[2] === 1));
    enabled = false;
    const before = calls.filter(c => c[0] === 'from' && c[1] === 'inputs').length;
    assert.equal((await app.inject('/mcp-local/search?kind=inputs')).statusCode, 403);
    assert.equal(calls.filter(c => c[0] === 'from' && c[1] === 'inputs').length, before);
    assert.equal((await app.inject('/mcp-local/search?kind=orders')).statusCode, 403);
    assert.equal((await app.inject('/mcp-local/search?kind=inputs&companyId=empresa-b')).statusCode, 500);
  } finally { (supabaseAdmin as any).from = original; await app.close(); }
});
