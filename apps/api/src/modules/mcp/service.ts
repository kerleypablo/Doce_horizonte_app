import { z } from 'zod';
import { supabaseAdmin } from '../../db/supabase.js';
import { getMcpModules } from './authorization.js';
import { purchasePreviewSchema, buildPurchasePreview } from './purchase.js';
export const querySchema = z.object({
  kind: z.enum(['inputs', 'products', 'customers', 'recipes', 'orders']),
  search: z.string().trim().max(100).regex(/^[^%_*,()\\]*$/).optional(),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(20)
}).strict();
const definitions = {
  inputs: { fields: 'id,name,brand,category,unit,package_size,package_price', search: 'name', module: 'cadastros' },
  products: { fields: 'id,name,unit_price,sale_price,units_count', search: 'name', module: 'cadastros' },
  customers: { fields: 'id,name,phone', search: 'name', module: 'cadastros' },
  recipes: { fields: 'id,name,yield,yield_unit', search: 'name', module: 'cadastros' },
  orders: { fields: 'id,number,type,order_datetime,delivery_date,status', search: 'number', module: 'pedidos' }
} as const;
export type McpIdentity = { userId: string; companyId: string };
const denied = () => Object.assign(new Error('Modulo nao habilitado'), { statusCode: 403 });
export async function searchRecords(auth: McpIdentity, input: unknown) {
  const q = querySchema.parse(input);
  const def = definitions[q.kind];
  if (!(await getMcpModules(auth.companyId, auth.userId)).includes(def.module)) throw denied();
  let query = supabaseAdmin.from(q.kind).select(def.fields).eq('company_id', auth.companyId)
    .order('id', { ascending: true }).range(q.offset, q.offset + q.limit);
  if (q.search) query = query.ilike(def.search, `%${q.search}%`);
  const { data, error } = await query;
  if (error) throw new Error('Falha ao consultar dados');
  const rows = data ?? [];
  return { items: rows.slice(0, q.limit), hasMore: rows.length > q.limit, offset: q.offset };
}
export async function previewPurchase(auth: McpIdentity, input: unknown) {
  if (!(await getMcpModules(auth.companyId, auth.userId)).includes('cadastros')) throw denied();
  const { items } = purchasePreviewSchema.parse(input);
  const { data, error } = await supabaseAdmin.from('inputs').select('id,name,brand,unit,package_size,package_price')
    .eq('company_id', auth.companyId).in('id', items.map(item => item.inputId));
  if (error) throw new Error('Falha ao consultar dados');
  return buildPurchasePreview(items, data ?? []);
}
