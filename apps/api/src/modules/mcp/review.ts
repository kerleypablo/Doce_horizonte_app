import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../../db/supabase.js';
import type { AuthContext } from '../common/auth.js';
import { getMcpModules } from './authorization.js';
import { reviewOrigin } from './write.js';
import { inputWriteEnabled } from './input-write.js';
import { saleWriteEnabled } from './sale-write.js';
import { orderWriteEnabled } from './order-write.js';
import { productWriteEnabled } from './product-write.js';
import { manualSaleEnabled } from './manual-sale.js';
const idSchema = z.object({ id: z.string().uuid() }).strict();
const bodySchema = z.object({ digest: z.string().regex(/^[0-9a-f]{64}$/), confirm: z.literal(true) }).strict();
const deny = () => Object.assign(new Error('Operacao nao permitida'), { statusCode: 403 });
function interactiveSession(request: FastifyRequest) {
  const match = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization ?? '');
  try {
    if (!match) throw deny();
    const parts = match[1].split('.');
    if (parts.length !== 3) throw deny();
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    // Token signature and identity were verified by authenticate; OAuth client tokens cannot approve.
    if (claims.client_id != null || claims.aud !== 'authenticated') throw deny();
  } catch { throw deny(); }
}
export async function reviewRoutes(app: FastifyInstance) {
  const guard = async (request: FastifyRequest) => {
    await app.authenticate(request);
    interactiveSession(request);
  };
  const authorizeOperation = async (auth: AuthContext, operation: string) => {
    const allowed = ['purchase_prices', ...(inputWriteEnabled() ? ['create_input'] : []), ...(saleWriteEnabled() ? ['sale_price'] : []), ...(orderWriteEnabled() ? ['create_order'] : []), ...(productWriteEnabled() ? ['create_product'] : []), ...(manualSaleEnabled() ? ['manual_sale'] : [])];
    if (!allowed.includes(operation)) throw Object.assign(new Error('Previa nao encontrada'), { statusCode: 404 });
    const moduleKey = operation === 'create_order' ? 'pedidos' : operation === 'manual_sale' ? 'financeiro' : 'cadastros';
    if (!(await getMcpModules(auth.companyId, auth.userId)).includes(moduleKey)) throw deny();
  };
  app.get('/mcp-review/:id', { preHandler: [guard] }, async request => {
    const { id } = idSchema.parse(request.params);
    const auth = (request as typeof request & { auth: AuthContext }).auth;
    const { data, error } = await supabaseAdmin.from('mcp_write_previews').select('id,operation,snapshot,state,expires_at,payload_digest,result')
      .eq('id', id).eq('company_id', auth.companyId).eq('auth_user_id', auth.userId).maybeSingle();
    if (error) throw new Error('Falha ao consultar previa');
    if (!data) throw Object.assign(new Error('Previa nao encontrada'), { statusCode: 404 });
    await authorizeOperation(auth, data.operation);
    return { id: data.id, operation: data.operation, items: data.snapshot.items, input: data.snapshot.input, product: data.snapshot.product, productDraft: data.snapshot.productDraft, order: data.snapshot.order, manualSale: data.snapshot.manualSale, state: data.state, expiresAt: data.expires_at, digest: String(data.payload_digest).replace(/^\\x/, ''), result: data.result };
  });
  app.post('/mcp-review/:id/confirm', { preHandler: [guard] }, async request => {
    if (request.headers.origin !== reviewOrigin()) throw deny();
    const { id } = idSchema.parse(request.params);
    const { digest } = bodySchema.parse(request.body);
    const auth = (request as typeof request & { auth: AuthContext }).auth;
    const { data: preview, error: previewError } = await supabaseAdmin.from('mcp_write_previews').select('operation')
      .eq('id', id).eq('company_id', auth.companyId).eq('auth_user_id', auth.userId).maybeSingle();
    if (previewError) throw new Error('Falha ao consultar previa');
    if (!preview) throw Object.assign(new Error('Previa nao encontrada'), { statusCode: 404 });
    await authorizeOperation(auth, preview.operation);
    const rpcName = preview.operation === 'manual_sale' ? 'mcp_create_manual_sale' : preview.operation === 'create_product' ? 'mcp_create_product' : preview.operation === 'create_order' ? 'mcp_create_order' : preview.operation === 'create_input' ? 'mcp_create_input' : preview.operation === 'sale_price' ? 'mcp_apply_sale_price' : 'mcp_apply_purchase_prices';
    const { data, error } = await supabaseAdmin.rpc(rpcName, { p_preview_id: id, p_company_id: auth.companyId, p_auth_user_id: auth.userId, p_digest: `\\x${digest}` });
    if (error) throw new Error('Falha ao aplicar previa');
    return data;
  });
}
