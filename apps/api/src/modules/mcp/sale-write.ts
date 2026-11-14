import { createHash } from 'node:crypto';
import { z } from 'zod';
import { supabaseAdmin } from '../../db/supabase.js';
import { getMcpModules } from './authorization.js';
import { writeEnabled, reviewOrigin } from './write.js';
import type { McpIdentity } from './service.js';

export const saleWriteEnabled = () => writeEnabled() && process.env.DOCE_MCP_SALE_WRITE_ENABLED === 'true';
export const salePriceSchema = z.object({ idempotencyKey: z.string().uuid(), productId: z.string().uuid(), unitPrice: z.number().finite().positive().max(100000000).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Use ate duas casas decimais') }).strict();
const canonical = (value: unknown): string => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
export async function prepareSalePrice(auth: McpIdentity, input: unknown) {
  if (!saleWriteEnabled() || !(await getMcpModules(auth.companyId, auth.userId)).includes('cadastros')) throw Object.assign(new Error('Operacao nao permitida'), { statusCode: 403 });
  const request = salePriceSchema.parse(input);
  const origin = reviewOrigin();
  const payload = { productId: request.productId, unitPrice: request.unitPrice };
  const find = async () => {
    const { data, error } = await supabaseAdmin.from('mcp_write_previews').select('id,operation,payload,state,expires_at').eq('company_id', auth.companyId).eq('auth_user_id', auth.userId).eq('idempotency_key', request.idempotencyKey).maybeSingle();
    if (error) throw new Error('Falha ao consultar previa');
    if (!data) return null;
    if (data.operation !== 'sale_price' || canonical(data.payload) !== canonical(payload)) throw Object.assign(new Error('Chave de idempotencia ja utilizada'), { statusCode: 409 });
    return { previewId: data.id, state: data.state, expiresAt: data.expires_at, reviewUrl: `${origin}/app/mcp/revisar/${data.id}` };
  };
  const existing = await find(); if (existing) return existing;
  const { data: product, error: lookupError } = await supabaseAdmin.from('products').select('id,name,units_count,unit_price,sale_price').eq('company_id', auth.companyId).eq('id', request.productId).maybeSingle();
  if (lookupError || !product) throw new Error('Produto nao encontrado');
  const values = [product.units_count, product.unit_price, product.sale_price];
  if (values.some(v => v === null || v === undefined || !Number.isFinite(Number(v)) || Number(v) < 0) || !Number.isSafeInteger(Number(product.units_count)) || Number(product.units_count) <= 0 || Number(product.units_count) > 1000000 || !Number.isSafeInteger(Math.round(request.unitPrice * 100) * Number(product.units_count))) throw new Error('Preco ou quantidade do produto indisponivel');
  const snapshot = { product: { id: product.id, name: product.name, unitsCount: Number(product.units_count), currentUnitPrice: Number(product.unit_price), currentSalePrice: Number(product.sale_price), newUnitPrice: request.unitPrice } };
  const digest = createHash('sha256').update(canonical({ payload, snapshot })).digest('hex');
  const { data, error } = await supabaseAdmin.from('mcp_write_previews').insert({ company_id: auth.companyId, auth_user_id: auth.userId, operation: 'sale_price', idempotency_key: request.idempotencyKey, payload, snapshot, payload_digest: `\\x${digest}`, expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() }).select('id,state,expires_at').single();
  if (error) { if (error.code === '23505') { const other = await find(); if (other) return other; } throw new Error('Falha ao preparar preco'); }
  return { previewId: data.id, state: data.state, expiresAt: data.expires_at, reviewUrl: `${origin}/app/mcp/revisar/${data.id}` };
}
