import { z } from 'zod';
import { supabaseAdmin } from '../../db/supabase.js';
import { inputSchema } from '../inputs/routes.js';
import { productSchema } from '../products/routes.js';
import { assertProductCompositionOwnership } from '../common/company-ownership.js';
import { getMcpModules } from './authorization.js';
import type { McpIdentity } from './service.js';

// Inputs use the existing domain schema, plus strict bounds for MCP traffic.
export const registrationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('insumo'), data: inputSchema.strict() }).strict(),
  z.object({ kind: z.literal('produto'), data: productSchema.strict() }).strict()
]);
export async function previewRegistration(auth: McpIdentity, input: unknown) {
  if (!(await getMcpModules(auth.companyId, auth.userId)).includes('cadastros')) throw Object.assign(new Error('Modulo nao habilitado'), { statusCode: 403 });
  const request = registrationSchema.parse(input);
  const name = request.data.name.trim();
  if (name.length < 2 || name.length > 120 || /[%_\\]/.test(name)) throw Object.assign(new Error('Nome invalido para consulta de duplicatas'), { statusCode: 400 });
  if (request.kind === 'produto') await assertProductCompositionOwnership(auth.companyId, request.data);
  const table = request.kind === 'insumo' ? 'inputs' : 'products';
  const { data, error } = await supabaseAdmin.from(table).select('id,name').eq('company_id', auth.companyId).ilike('name', name).limit(21);
  if (error) throw new Error('Falha ao consultar duplicatas');
  return { applicable: false, message: 'Previa informativa; cadastro e edicao nao disponiveis.', data: { ...request.data, name }, possibleDuplicates: (data ?? []).slice(0, 20), hasMore: (data ?? []).length > 20 };
}
