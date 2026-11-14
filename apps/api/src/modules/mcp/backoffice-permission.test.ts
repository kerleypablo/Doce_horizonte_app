import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';

process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.SUPABASE_ANON_KEY = 'test-key';
const { backofficeRoutes } = await import('../backoffice/routes.js');
const { supabaseAdmin } = await import('../../db/supabase.js');

test('desmarcar MCP remove a concessao individual mesmo quando o plano nao inclui MCP', async () => {
  const original = supabaseAdmin.from;
  let deleted: string[] = [];
  (supabaseAdmin as any).from = (table: string) => {
    const chain: any = {
      select: () => chain, eq: () => chain,
      maybeSingle: async () => ({ data: { plan_id: 'plan', status: 'active' }, error: null }),
      delete: () => chain,
      in: async (_key: string, keys: string[]) => { deleted = keys; return { error: null }; },
      upsert: async () => ({ error: null }),
      then: (resolve: (value: unknown) => void) => resolve({ data: table === 'plan_modules' ? [{ module_key: 'cadastros' }] : [], error: null })
    };
    return chain;
  };
  const app = Fastify();
  app.decorate('authenticate', async () => {});
  app.decorate('authorize', () => async () => {});
  await app.register(backofficeRoutes);
  try {
    const response = await app.inject({ method: 'PUT', url: '/backoffice/users/123e4567-e89b-12d3-a456-426614174000/modules', payload: { companyId: '123e4567-e89b-12d3-a456-426614174001', enabledModules: ['cadastros'] } });
    assert.equal(response.statusCode, 200);
    assert.ok(deleted.includes('mcp'));
  } finally { (supabaseAdmin as any).from = original; await app.close(); }
});
