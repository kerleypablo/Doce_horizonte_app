import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.SUPABASE_ANON_KEY = 'test-key';
const { buildApp } = await import('../../app.js');
test('rotas experimentais exigem opt-in explicito e ambiente development', async () => {
  const oldNode = process.env.NODE_ENV;
  const oldFlag = process.env.DOCE_MCP_LOCAL_ENABLED;
  try {
    for (const [node, flag, status] of [['production', 'true', 404], ['development', '', 404], ['', 'true', 404], ['development', 'true', 401]] as const) {
      process.env.NODE_ENV = node;
      process.env.DOCE_MCP_LOCAL_ENABLED = flag;
      const app = buildApp();
      try {
        assert.equal((await app.inject('/mcp-local/search?kind=inputs')).statusCode, status);
        assert.equal((await app.inject('/mcp')).statusCode, 404);
        assert.equal((await app.inject('/.well-known/oauth-protected-resource/mcp')).statusCode, 404);
      }
      finally { await app.close(); }
    }
  } finally {
    if (oldNode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldNode;
    if (oldFlag === undefined) delete process.env.DOCE_MCP_LOCAL_ENABLED; else process.env.DOCE_MCP_LOCAL_ENABLED = oldFlag;
  }
});
