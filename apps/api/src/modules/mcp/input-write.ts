import { createHash } from 'node:crypto';
import { z } from 'zod';
import { supabaseAdmin } from '../../db/supabase.js';
import { inputSchema } from '../inputs/routes.js';
import { getMcpModules } from './authorization.js';
import { previewRegistration } from './registration.js';
import { writeEnabled, reviewOrigin } from './write.js';
import type { McpIdentity } from './service.js';
export const inputCreateSchema = z.object({ idempotencyKey: z.string().uuid(), data: inputSchema.strict() }).strict();
export const inputWriteEnabled = () => writeEnabled() && process.env.DOCE_MCP_INPUT_WRITE_ENABLED === 'true';
const canonical = (value: unknown): string => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
export async function prepareInput(auth: McpIdentity, input: unknown) {
  if (!inputWriteEnabled() || !(await getMcpModules(auth.companyId, auth.userId)).includes('cadastros')) throw Object.assign(new Error('Operacao nao permitida'), { statusCode: 403 });
  const request = inputCreateSchema.parse(input);
  const origin = reviewOrigin();
  const payload = { data: { ...request.data, name: request.data.name.trim() } };
  const find = async () => {
    const { data, error } = await supabaseAdmin.from('mcp_write_previews').select('id,operation,payload,state,expires_at')
      .eq('company_id', auth.companyId).eq('auth_user_id', auth.userId).eq('idempotency_key', request.idempotencyKey).maybeSingle();
    if (error) throw new Error('Falha ao consultar previa');
    if (!data) return null;
    if (data.operation !== 'create_input' || canonical(data.payload) !== canonical(payload)) throw Object.assign(new Error('Chave de idempotencia ja utilizada'), { statusCode: 409 });
    return { previewId: data.id, state: data.state, expiresAt: data.expires_at, reviewUrl: `${origin}/app/mcp/revisar/${data.id}` };
  };
  const existing = await find(); if (existing) return existing;
  const preview = await previewRegistration(auth, { kind: 'insumo', data: payload.data });
  if (preview.possibleDuplicates.length || preview.hasMore) throw Object.assign(new Error('Possivel cadastro duplicado'), { statusCode: 409 });
  const snapshot = { input: payload.data };
  const digest = createHash('sha256').update(canonical({ payload, snapshot })).digest('hex');
  const { data, error } = await supabaseAdmin.from('mcp_write_previews').insert({ company_id: auth.companyId, auth_user_id: auth.userId, operation: 'create_input', idempotency_key: request.idempotencyKey, payload, snapshot, payload_digest: `\\x${digest}`, expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() }).select('id,state,expires_at').single();
  if (error) { if (error.code === '23505') { const other = await find(); if (other) return other; } throw new Error('Falha ao preparar cadastro'); }
  return { previewId: data.id, state: data.state, expiresAt: data.expires_at, reviewUrl: `${origin}/app/mcp/revisar/${data.id}` };
}
