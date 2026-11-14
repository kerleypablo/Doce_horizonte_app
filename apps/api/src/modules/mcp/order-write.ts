import { createHash } from 'node:crypto';
import { z } from 'zod';
import { calcProductPreview } from '../pricing/product-calc.js';
import { supabaseAdmin } from '../../db/supabase.js';
import { getMcpModules } from './authorization.js';
import { orderPreviewSchema, computeOrderPreview } from './order-preview.js';
import { reviewOrigin, writeEnabled } from './write.js';
import type { McpIdentity } from './service.js';
export const orderWriteEnabled = () => writeEnabled() && process.env.DOCE_MCP_ORDER_WRITE_ENABLED === 'true';
export const orderWriteSchema = orderPreviewSchema.innerType().extend({ idempotencyKey: z.string().uuid(), orderDateTime: z.string().datetime({ offset: true }), deliveryDate: z.string().date().optional(), deliveryAddress: z.string().trim().min(5).max(300).optional() }).strict();
const canonical = (v: unknown) => JSON.stringify(v, (_k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x);
export async function prepareOrder(auth: McpIdentity, input: unknown) {
  if (!orderWriteEnabled() || !(await getMcpModules(auth.companyId, auth.userId)).includes('pedidos')) throw new Error('Operacao nao permitida');
  const request = orderWriteSchema.parse(input);
  const { idempotencyKey: _key, orderDateTime: _date, deliveryDate: _delivery, deliveryAddress: _address, ...orderFields } = request;
  const args = orderPreviewSchema.parse(orderFields);
  if (args.deliveryType === 'ENTREGA' && !request.deliveryAddress) throw new Error('Informe o endereco de entrega');
  const origin = reviewOrigin();
  const payload = { ...args, orderDateTime: request.orderDateTime, ...(request.deliveryDate ? { deliveryDate: request.deliveryDate } : {}), ...(request.deliveryAddress ? { deliveryAddress: request.deliveryAddress } : {}) };
  const find = async () => {
    const { data, error } = await supabaseAdmin.from('mcp_write_previews').select('id,operation,payload,state,expires_at').eq('company_id', auth.companyId).eq('auth_user_id', auth.userId).eq('idempotency_key', request.idempotencyKey).maybeSingle();
    if (error) throw new Error('Falha ao consultar previa');
    if (!data) return null;
    if (data.operation !== 'create_order' || canonical(data.payload) !== canonical(payload)) throw new Error('Chave de idempotencia ja utilizada');
    return { previewId: data.id, state: data.state, expiresAt: data.expires_at, reviewUrl: `${origin}/app/mcp/revisar/${data.id}` };
  };
  const existing = await find(); if (existing) return existing;
  const [customer, products, settings] = await Promise.all([
    supabaseAdmin.from('customers').select('id,name,phone').eq('company_id', auth.companyId).eq('id', args.customerId).maybeSingle(),
    supabaseAdmin.from('products').select('id,name,unit_price,sale_price,units_count,prep_time_minutes,target_profit_percent,extra_percent,channel_id,recipe_id,extra_recipes,extra_products,direct_inputs,packaging_inputs').eq('company_id', auth.companyId).in('id', args.products.map(p => p.productId)),
    supabaseAdmin.from('company_settings').select('overhead_method,overhead_percent,overhead_per_unit,labor_cost_per_hour,fixed_cost_per_hour,taxes_percent,default_profit_percent').eq('company_id', auth.companyId).maybeSingle()
  ]);
  if (customer.error || products.error || settings.error || !customer.data || !products.data || !settings.data || products.data.length !== args.products.length) throw new Error('Dados de pedido indisponiveis');
  if (!customer.data.phone || String(customer.data.phone).length < 8) throw new Error('Telefone de cliente ausente');
  const rows = products.data;
  if (rows.some((p: any) => p.recipe_id || [p.extra_recipes, p.extra_products, p.direct_inputs, p.packaging_inputs].some(x => !Array.isArray(x) || x.length) || !p.channel_id)) throw new Error('Apenas produtos simples com canal definido sao suportados neste experimento');
  const channelIds = [...new Set(rows.map((p: any) => p.channel_id))];
  const channels = await supabaseAdmin.from('sales_channels').select('id,active,fee_percent,payment_fee_percent,fee_fixed').eq('company_id', auth.companyId).in('id', channelIds);
  if (channels.error || !channels.data || channels.data.length !== channelIds.length || channels.data.some((c: any) => c.active === false)) throw new Error('Canal invalido');
  const s = settings.data;
  const settingsValues = [s.overhead_percent, s.overhead_per_unit, s.labor_cost_per_hour, s.fixed_cost_per_hour, s.taxes_percent, s.default_profit_percent];
  if (!['PERCENT_DIRECT', 'PER_UNIT'].includes(s.overhead_method) || settingsValues.some(v => v == null || !Number.isFinite(Number(v)) || Number(v) < 0)) throw new Error('Configuracao de precificacao invalida');
  const mappedSettings = { overheadMethod: s.overhead_method, overheadPercent: Number(s.overhead_percent), overheadPerUnit: Number(s.overhead_per_unit), laborCostPerHour: Number(s.labor_cost_per_hour), fixedCostPerHour: Number(s.fixed_cost_per_hour), taxesPercent: Number(s.taxes_percent), defaultProfitPercent: Number(s.default_profit_percent), salesChannels: [] };
  const preview = computeOrderPreview(args, customer.data, rows);
  const enriched = preview.products.map(item => {
    const p: any = rows.find((r: any) => r.id === item.productId);
    const c: any = channels.data!.find((v: any) => v.id === p.channel_id);
    const vals = [p.units_count, p.prep_time_minutes, p.target_profit_percent, p.extra_percent, c.fee_percent, c.payment_fee_percent, c.fee_fixed];
    if (vals.some(v => v == null || !Number.isFinite(Number(v)) || Number(v) < 0) || Number(p.units_count) <= 0 || item.unitPrice <= 0) throw new Error('Produto, taxa ou preco invalido');
    const calc = calcProductPreview({ unitsCount: Number(p.units_count), prepTimeMinutes: Number(p.prep_time_minutes), targetProfitPercent: Number(p.target_profit_percent), extraPercent: Number(p.extra_percent), extraRecipes: [], extraProducts: [], directInputs: [], packagingInputs: [], settings: mappedSettings, inputs: [], recipes: [], products: [], feePercent: Number(c.fee_percent), paymentFeePercent: Number(c.payment_fee_percent), feeFixed: Number(c.fee_fixed) });
    if (calc.pricingError) throw new Error(calc.pricingError);
    const estimatedTotalCost = calc.unitCost * item.quantity;
    const estimatedVariableCost = item.unitPrice * item.quantity * calc.variablePercent / 100;
    return { ...item, estimatedUnitCost: calc.unitCost, estimatedTotalCost, estimatedVariableCost, estimatedProfitValue: item.unitPrice * item.quantity - estimatedTotalCost - estimatedVariableCost };
  });
  const snapshot = { order: { ...preview, ...payload, products: enriched, customer: customer.data }, dependencies: { customer: customer.data, products: rows, settings: s, channels: channels.data } };
  const digest = createHash('sha256').update(canonical({ payload, snapshot })).digest('hex');
  const { data, error } = await supabaseAdmin.from('mcp_write_previews').insert({ company_id: auth.companyId, auth_user_id: auth.userId, operation: 'create_order', idempotency_key: request.idempotencyKey, payload, snapshot, payload_digest: `\\x${digest}`, expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() }).select('id,state,expires_at').single();
  if (error) { if (error.code === '23505') { const other = await find(); if (other) return other; } throw new Error('Falha ao preparar pedido'); }
  return { previewId: data.id, state: data.state, expiresAt: data.expires_at, reviewUrl: `${origin}/app/mcp/revisar/${data.id}` };
}
