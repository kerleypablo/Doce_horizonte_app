import { z } from 'zod';
import { supabaseAdmin } from '../../db/supabase.js';
import { getMcpModules } from './authorization.js';
import { calcOrderTotal } from '../orders/total.js';
import type { McpIdentity } from './service.js';
const money = z.number().finite().min(0).max(100000000).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Use ate duas casas decimais');
export const orderPreviewSchema = z.object({
  customerId: z.string().uuid(), type: z.enum(['PEDIDO', 'ORCAMENTO']), deliveryType: z.enum(['ENTREGA', 'RETIRADA']),
  products: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().finite().positive().max(1000000) }).strict()).min(1).max(30),
  discountMode: z.enum(['PERCENT', 'FIXED']).default('FIXED'), discountValue: money.default(0), shippingValue: money.default(0)
}).strict().superRefine((data, ctx) => {
  if (new Set(data.products.map(p => p.productId)).size !== data.products.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Produto duplicado' });
  if (data.discountMode === 'PERCENT' && data.discountValue > 100) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Desconto percentual maior que 100' });
});
export function computeOrderPreview(data: z.infer<typeof orderPreviewSchema>, customer: { id: string; name: string }, products: { id: string; name: string; unit_price: number; sale_price: number }[]) {
  const byId = new Map(products.map(p => [p.id, p]));
  const resolved = data.products.map(item => {
    const p = byId.get(item.productId);
    if (!p) throw new Error('Produto ou preco indisponivel');
    const unitPrice = Number(p.unit_price) || Number(p.sale_price) || 0;
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error('Produto ou preco indisponivel');
    return { productId: p.id, name: p.name, quantity: item.quantity, unitPrice };
  });
  const subtotal = resolved.reduce((sum, p) => sum + p.quantity * p.unitPrice, 0);
  const discount = data.discountMode === 'PERCENT' ? subtotal * data.discountValue / 100 : data.discountValue;
  if (discount > subtotal) throw new Error('Desconto maior que subtotal');
  const row = { products: resolved, additions: [], discount_mode: data.discountMode, discount_value: data.discountValue, shipping_value: data.shippingValue };
  return { applicable: false, aviso: 'Previa informativa; nenhum pedido, pagamento ou estoque foi alterado. Confirme data e demais dados antes de registrar.', type: data.type, deliveryType: data.deliveryType, customer, products: resolved, discountMode: data.discountMode, discountValue: data.discountValue, shippingValue: data.shippingValue, total: calcOrderTotal(row) };
}
export async function previewOrder(auth: McpIdentity, input: unknown) {
  if (!(await getMcpModules(auth.companyId, auth.userId)).includes('pedidos')) throw Object.assign(new Error('Modulo nao habilitado'), { statusCode: 403 });
  const data = orderPreviewSchema.parse(input);
  const [customer, products] = await Promise.all([
    supabaseAdmin.from('customers').select('id,name').eq('company_id', auth.companyId).eq('id', data.customerId).maybeSingle(),
    supabaseAdmin.from('products').select('id,name,unit_price,sale_price').eq('company_id', auth.companyId).in('id', data.products.map(p => p.productId))
  ]);
  if (customer.error || products.error) throw new Error('Dados de pedido indisponiveis');
  if (!customer.data || !products.data || products.data.length !== data.products.length) throw new Error('Cliente ou produto nao encontrado');
  return computeOrderPreview(data, customer.data, products.data);
}
