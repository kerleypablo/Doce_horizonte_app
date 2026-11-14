import { createHash } from 'node:crypto';
import { z } from 'zod';
import { supabaseAdmin } from '../../db/supabase.js';
import { getMcpModules } from './authorization.js';
import { writeEnabled, reviewOrigin } from './write.js';
import type { McpIdentity } from './service.js';
export const manualSaleEnabled = () => writeEnabled() && process.env.DOCE_MCP_FINANCIAL_SALE_ENABLED === 'true';
export const manualSaleSchema = z.object({ idempotencyKey: z.string().uuid(), accountId: z.string().uuid(), occurredAt: z.string().datetime({ offset: true }), description: z.string().trim().min(2).max(200), paymentMethod: z.enum(['PIX','DINHEIRO','CARTAO','VOUCHER']), amount: z.number().finite().positive().max(100000000).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Use ate duas casas decimais'), notes: z.string().max(1000).optional() }).strict();
const canonical = (v: unknown) => JSON.stringify(v, (_k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x);
export async function prepareManualSale(auth: McpIdentity, input: unknown) {
  if (!manualSaleEnabled() || !(await getMcpModules(auth.companyId, auth.userId)).includes('financeiro')) throw new Error('Operacao nao permitida');
  const { idempotencyKey, ...payload } = manualSaleSchema.parse(input);
  const origin = reviewOrigin();
  const find = async () => {
    const { data, error } = await supabaseAdmin.from('mcp_write_previews').select('id,operation,payload,state,expires_at').eq('company_id', auth.companyId).eq('auth_user_id', auth.userId).eq('idempotency_key', idempotencyKey).maybeSingle();
    if (error) throw new Error('Falha ao consultar previa'); if (!data) return null;
    if (data.operation !== 'manual_sale' || canonical(data.payload) !== canonical(payload)) throw new Error('Chave de idempotencia ja utilizada');
    return { previewId: data.id, state: data.state, expiresAt: data.expires_at, reviewUrl: `${origin}/app/mcp/revisar/${data.id}` };
  };
  const existing = await find(); if (existing) return existing;
  const { data: account, error: accountError } = await supabaseAdmin.from('financial_accounts').select('id,name,account_type,institution').eq('company_id', auth.companyId).eq('id', payload.accountId).maybeSingle();
  if (accountError || !account) throw new Error('Conta financeira indisponivel');
  const snapshot = { manualSale: { ...payload, accountName: account.name, accountType: account.account_type, accountInstitution: account.institution }, dependencies: { account } };
  const digest = createHash('sha256').update(canonical({ payload, snapshot })).digest('hex');
  const { data, error } = await supabaseAdmin.from('mcp_write_previews').insert({ company_id: auth.companyId, auth_user_id: auth.userId, operation: 'manual_sale', idempotency_key: idempotencyKey, payload, snapshot, payload_digest: `\\x${digest}`, expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() }).select('id,state,expires_at').single();
  if (error) { if (error.code === '23505') { const other = await find(); if (other) return other; } throw new Error('Falha ao preparar venda'); }
  return { previewId: data.id, state: data.state, expiresAt: data.expires_at, reviewUrl: `${origin}/app/mcp/revisar/${data.id}` };
}
