import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.SUPABASE_ANON_KEY = 'test-key';
const { registerRemoteMcp, remoteConfig, verifyRemoteToken } = await import('./remote.js');
const config = { resource: 'https://mcp.example.com/mcp', issuer: 'https://project.supabase.co/auth/v1', origins: ['https://client.example.com'] };
const jwt = (claims: object) => `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
const valid = { iss: config.issuer, aud: config.resource, sub: 'user-a', client_id: 'client', exp: 2000000000 };
test('token exige emissor, audiencia, cliente, validade e identidade verificada', async () => {
  const getUser = async () => 'user-a';
  assert.equal(await verifyRemoteToken(jwt(valid), config, getUser, 1700000000000), 'user-a');
  for (const changed of [{ aud: 'authenticated' }, { iss: 'https://wrong' }, { exp: 1 }, { client_id: '' }, { sub: 'another' }]) {
    assert.equal(await verifyRemoteToken(jwt({ ...valid, ...changed }), config, getUser, 1700000000000), null);
  }
  assert.equal(await verifyRemoteToken(jwt(valid), config, async () => null, 1700000000000), null);
  assert.equal(await verifyRemoteToken(jwt(valid), config, async () => { throw new Error('failed'); }, 1700000000000), null);
});
test('diagnostico identifica audiencia incorreta sem revelar o token', async () => {
  const reasons: string[] = [];
  const token = jwt({ ...valid, aud: 'authenticated' });
  assert.equal(await verifyRemoteToken(token, config, async () => 'user-a', 1700000000000, reason => reasons.push(reason)), null);
  assert.deepEqual(reasons, ['audience_mismatch']);
  assert.equal(JSON.stringify(reasons).includes(token), false);
});
test('configuracao remota exige HTTPS e origem de recurso exata', () => {
  assert.throws(() => remoteConfig({ SUPABASE_URL: 'https://project.supabase.co', DOCE_MCP_RESOURCE_URL: 'http://example.com/mcp' }));
  assert.throws(() => remoteConfig({ SUPABASE_URL: 'https://project.supabase.co', DOCE_MCP_RESOURCE_URL: 'https://example.com/mcp?x=1' }));
  assert.equal(remoteConfig({ SUPABASE_URL: 'https://project.supabase.co', DOCE_MCP_RESOURCE_URL: config.resource }).issuer, config.issuer);
});
test('HTTP publica descoberta e nega origens ou credenciais invalidas', async () => {
  const app = Fastify();
  let invoked = 0;
  registerRemoteMcp(app, config, {
    authenticate: async token => token === 'good' ? { userId: 'user-a', companyId: 'company-a' } : null,
    search: async identity => { invoked++; assert.equal(identity.companyId, 'company-a'); return { items: [], hasMore: false, offset: 0 }; },
    preview: async () => ({ applicable: false, message: '', items: [] })
  });
  const headers = { host: 'mcp.example.com' };
  try {
    const metadata = await app.inject({ method: 'GET', url: '/.well-known/oauth-protected-resource/mcp', headers });
    assert.equal(metadata.json().resource, config.resource);
    assert.deepEqual(metadata.json().authorization_servers, [config.issuer]);
    const denied = await app.inject({ method: 'POST', url: '/mcp', headers, payload: {} });
    assert.equal(denied.statusCode, 401);
    assert.match(String(denied.headers['www-authenticate']), /oauth-protected-resource\/mcp/);
    const binaryDenied = await app.inject({ method: 'POST', url: '/mcp', headers: { ...headers, 'content-type': 'application/octet-stream' }, payload: Buffer.from('') });
    assert.equal(binaryDenied.statusCode, 401);
    assert.match(String(binaryDenied.headers['www-authenticate']), /oauth-protected-resource\/mcp/);
    const binaryAuthenticated = await app.inject({ method: 'POST', url: '/mcp', headers: { ...headers, authorization: 'Bearer good', 'content-type': 'application/octet-stream' }, payload: Buffer.from('') });
    assert.equal(binaryAuthenticated.statusCode, 415);
    assert.equal((await app.inject({ method: 'POST', url: '/mcp', headers: { ...headers, origin: 'https://evil.example', authorization: 'Bearer good' }, payload: {} })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/mcp', headers: { ...headers, host: 'evil.example', authorization: 'Bearer good' }, payload: {} })).statusCode, 403);
    const listed = await app.inject({ method: 'POST', url: '/mcp', headers: { ...headers, authorization: 'Bearer good', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' }, payload: { jsonrpc: '2.0', id: 8, method: 'tools/list' } });
    assert.equal(listed.statusCode, 200);
    assert.ok(listed.json().result.tools.some((tool: any) => tool.name === 'simular_receita'));
    assert.ok(listed.json().result.tools.some((tool: any) => tool.name === 'prever_cadastro'));
    assert.ok(listed.json().result.tools.some((tool: any) => tool.name === 'prever_pedido'));
    for (const name of ['prever_cadastro', 'prever_pedido', 'prever_precos_compra']) {
      const tool = listed.json().result.tools.find((t: any) => t.name === name);
      assert.ok(Object.keys(tool.inputSchema.properties ?? {}).length > 0, "schema vazio: ${name}");
    }
    const response = await app.inject({ method: 'POST', url: '/mcp', headers: { ...headers, authorization: 'Bearer good', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' }, payload: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'consultar', arguments: { kind: 'inputs' } } } });
    assert.equal(response.statusCode, 200);
    assert.equal(invoked, 1);
    assert.deepEqual(JSON.parse(response.json().result.content[0].text).items, []);
  } finally { await app.close(); }
});
