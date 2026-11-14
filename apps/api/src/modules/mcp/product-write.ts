import { createHash } from 'node:crypto';
import { z } from 'zod';
import { supabaseAdmin } from '../../db/supabase.js';
import { productSchema } from '../products/routes.js';
import { calcProductPreview } from '../pricing/product-calc.js';
import { getMcpModules } from './authorization.js';
import { previewRegistration } from './registration.js';
import { reviewOrigin, writeEnabled } from './write.js';
import type { McpIdentity } from './service.js';
export const productWriteEnabled = () => writeEnabled() && process.env.DOCE_MCP_PRODUCT_WRITE_ENABLED === 'true';
export const productWriteSchema = z.object({ idempotencyKey: z.string().uuid(), data: productSchema.strict() }).strict();
const canonical = (v: unknown) => JSON.stringify(v, (_k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x);
export async function prepareProduct(auth: McpIdentity, input: unknown) {
  if (!productWriteEnabled() || !(await getMcpModules(auth.companyId, auth.userId)).includes('cadastros')) throw new Error('Operacao nao permitida');
  const request = productWriteSchema.parse(input);
  const d = { ...request.data, name: request.data.name.trim() };
  if (d.extraRecipes.length || d.extraProducts.length || d.directInputs.length || d.packagingInputs.length || !d.channelId) throw new Error('Apenas produto simples com canal definido e suportado');
  if (!Number.isSafeInteger(d.unitsCount) || d.unitsCount <= 0 || d.unitsCount > 1000000 || d.prepTimeMinutes > 1000000 || d.targetProfitPercent > 10000 || d.extraPercent > 10000 || (d.manualUnitPrice !== undefined && (d.manualUnitPrice > 100000000 || Math.abs(d.manualUnitPrice * 100 - Math.round(d.manualUnitPrice * 100)) > 1e-6))) throw new Error('Dados numericos invalidos');
  const origin = reviewOrigin(); const payload = { data: d };
  const find = async () => {
    const { data, error } = await supabaseAdmin.from('mcp_write_previews').select('id,operation,payload,state,expires_at').eq('company_id', auth.companyId).eq('auth_user_id', auth.userId).eq('idempotency_key', request.idempotencyKey).maybeSingle();
    if (error) throw new Error('Falha ao consultar previa'); if (!data) return null;
    if (data.operation !== 'create_product' || canonical(data.payload) !== canonical(payload)) throw new Error('Chave de idempotencia ja utilizada');
    return { previewId: data.id, state: data.state, expiresAt: data.expires_at, reviewUrl: `${origin}/app/mcp/revisar/${data.id}` };
  };
  const existing = await find(); if (existing) return existing;
  const check = await previewRegistration(auth, { kind: 'produto', data: d });
  if (check.possibleDuplicates.length || check.hasMore) throw new Error('Possivel produto duplicado');
  const [settings, channel] = await Promise.all([
    supabaseAdmin.from('company_settings').select('overhead_method,overhead_percent,overhead_per_unit,labor_cost_per_hour,fixed_cost_per_hour,taxes_percent,default_profit_percent').eq('company_id', auth.companyId).maybeSingle(),
    supabaseAdmin.from('sales_channels').select('id,name,active,fee_percent,payment_fee_percent,fee_fixed').eq('company_id', auth.companyId).eq('id', d.channelId).maybeSingle()
  ]);
  if (settings.error || channel.error || !settings.data || !channel.data || channel.data.active === false) throw new Error('Configuracao ou canal indisponivel');
  const s = settings.data, c = channel.data;
  if (!['PERCENT_DIRECT', 'PER_UNIT'].includes(s.overhead_method) || [s.overhead_percent, s.overhead_per_unit, s.labor_cost_per_hour, s.fixed_cost_per_hour, s.taxes_percent, s.default_profit_percent, c.fee_percent, c.payment_fee_percent, c.fee_fixed].some(v => v == null || !Number.isFinite(Number(v)) || Number(v) < 0)) throw new Error('Taxas ou configuracoes invalidas');
  const calc = calcProductPreview({ unitsCount: d.unitsCount, prepTimeMinutes: d.prepTimeMinutes, targetProfitPercent: d.targetProfitPercent, manualUnitPrice: d.manualUnitPrice && d.manualUnitPrice > 0 ? d.manualUnitPrice : undefined, extraPercent: d.extraPercent, extraRecipes: [], extraProducts: [], directInputs: [], packagingInputs: [], settings: { overheadMethod: s.overhead_method, overheadPercent: Number(s.overhead_percent), overheadPerUnit: Number(s.overhead_per_unit), laborCostPerHour: Number(s.labor_cost_per_hour), fixedCostPerHour: Number(s.fixed_cost_per_hour), taxesPercent: Number(s.taxes_percent), defaultProfitPercent: Number(s.default_profit_percent), salesChannels: [] }, inputs: [], recipes: [], products: [], feePercent: Number(c.fee_percent), paymentFeePercent: Number(c.payment_fee_percent), feeFixed: Number(c.fee_fixed) });
  if (calc.pricingError) throw new Error(calc.pricingError);
  const unitPrice = d.manualUnitPrice && d.manualUnitPrice > 0 ? d.manualUnitPrice : calc.unitPrice;
  if (!Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isSafeInteger(Math.round(unitPrice * 100) * d.unitsCount)) throw new Error('Preco calculado invalido');
  const snapshot = { productDraft: { ...d, channelName: c.name, unitPrice, salePrice: Math.round(unitPrice * 100) * d.unitsCount / 100, cost: calc }, dependencies: { settings: s, channel: c } };
  const digest = createHash('sha256').update(canonical({ payload, snapshot })).digest('hex');
  const { data, error } = await supabaseAdmin.from('mcp_write_previews').insert({ company_id: auth.companyId, auth_user_id: auth.userId, operation: 'create_product', idempotency_key: request.idempotencyKey, payload, snapshot, payload_digest: `\\x${digest}`, expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() }).select('id,state,expires_at').single();
  if (error) { if (error.code === '23505') { const other = await find(); if (other) return other; } throw new Error('Falha ao preparar produto'); }
  return { previewId: data.id, state: data.state, expiresAt: data.expires_at, reviewUrl: `${origin}/app/mcp/revisar/${data.id}` };
}
