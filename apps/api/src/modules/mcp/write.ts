import { createHash } from 'node:crypto';
import { z } from 'zod';
import { supabaseAdmin } from '../../db/supabase.js';
import { getMcpModules } from './authorization.js';
import { purchasePreviewSchema } from './purchase.js';
import { previewPurchase, type McpIdentity } from './service.js';

export const prepareSchema = purchasePreviewSchema.innerType().extend({ idempotencyKey: z.string().uuid() }).strict().superRefine(({ items }, ctx) => {
  if (new Set(items.map(item => item.inputId)).size !== items.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Insumo duplicado' });
});
const denied = () => Object.assign(new Error('Operacao nao permitida'), { statusCode: 403 });
export const writeEnabled = () => process.env.NODE_ENV === 'development' && process.env.DOCE_MCP_PURCHASE_WRITE_ENABLED === 'true';
export const reviewOrigin = () => {
  const url = new URL(process.env.DOCE_MCP_REVIEW_ORIGIN ?? '');
  if (url.protocol !== 'https:' || url.origin !== url.href.slice(0, -1) || url.username || url.password) throw new Error('Origem de revisao invalida');
  return url.origin;
};
export async function preparePurchase(auth: McpIdentity, input: unknown) {
  if (!writeEnabled()) throw denied();
  const { idempotencyKey, items } = prepareSchema.parse(input);
  const origin = reviewOrigin();
  if (!(await getMcpModules(auth.companyId, auth.userId)).includes('cadastros')) throw denied();
  const payload = { items };
  const canonical = (value: unknown): string => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
  const find = async () => {
    const { data, error } = await supabaseAdmin.from('mcp_write_previews').select('id,payload,state,expires_at')
      .eq('company_id', auth.companyId).eq('auth_user_id', auth.userId).eq('idempotency_key', idempotencyKey).maybeSingle();
    if (error) throw new Error('Falha ao consultar previa');
    if (!data) return null;
    if (canonical(data.payload) !== canonical(payload)) throw Object.assign(new Error('Chave de idempotencia ja utilizada para outros dados'), { statusCode: 409 });
    return { previewId: data.id, state: data.state, expiresAt: data.expires_at, reviewUrl: `${origin}/app/mcp/revisar/${data.id}` };
  };
  const previous = await find();
  if (previous) return previous;
  const preview = await previewPurchase(auth, payload);
  if (preview.items.some(item => item.status !== 'identificado')) throw Object.assign(new Error('Resolva itens ausentes ou divergentes antes de preparar'), { statusCode: 409 });
  const digest = createHash('sha256').update(canonical({ payload, snapshot: { items: preview.items } })).digest('hex');
  const { data, error } = await supabaseAdmin.from('mcp_write_previews').insert({ company_id: auth.companyId, auth_user_id: auth.userId, operation: 'purchase_prices', idempotency_key: idempotencyKey, payload, snapshot: { items: preview.items }, payload_digest: `\\x${digest}`, expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() }).select('id,state,expires_at').single();
  if (error) {
    if (error.code === '23505') { const concurrent = await find(); if (concurrent) return concurrent; }
    throw new Error('Falha ao preparar previa');
  }
  return { previewId: data.id, state: data.state, expiresAt: data.expires_at, reviewUrl: `${origin}/app/mcp/revisar/${data.id}` };
}
