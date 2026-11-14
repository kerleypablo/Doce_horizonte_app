import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

test('stdio consulta API com token e rejeita argumentos extras', async () => {
  const mock = `globalThis.fetch = async (url, options) => new Response(JSON.stringify({items:[{name:'Acucar'}], authorization:options.headers.authorization, path:url.pathname}), {headers:{'content-type':'application/json'}})`;
  const preload = 'data:text/javascript,' + encodeURIComponent(mock);
  const child = spawn(process.execPath, ['--import', preload, fileURLToPath(new URL('./local.mjs', import.meta.url))], {
    env: { ...process.env, DOCE_ACCESS_TOKEN: 'token-ficticio', DOCE_API_URL: 'http://127.0.0.1:3333' }, stdio: ['pipe', 'pipe', 'pipe']
  });
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  const send = async (message: unknown) => { child.stdin.write(JSON.stringify(message) + '\n'); const line = await lines.next(); if (!line.value) throw new Error('Servidor MCP terminou inesperadamente'); return JSON.parse(line.value); };
  try {
    assert.equal((await send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } })).result.protocolVersion, '2025-06-18');
    assert.equal((await send({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).result.tools[0].name, 'consultar');
    const result = await send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'consultar', arguments: { kind: 'inputs' } } });
    const payload = JSON.parse(result.result.content[0].text);
    assert.equal(payload.items[0].name, 'Acucar');
    assert.equal(payload.authorization, 'Bearer token-ficticio');
    assert.equal(payload.path, '/mcp-local/search');
    assert.equal((await send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'consultar', arguments: { kind: 'inputs', companyId: 'outra' } } })).result.isError, true);
  } finally { child.kill(); }
});
