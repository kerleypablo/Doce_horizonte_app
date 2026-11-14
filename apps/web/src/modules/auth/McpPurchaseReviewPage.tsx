import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch } from '../shared/api.ts';
import { useAuth } from './AuthContext.tsx';

type Item = { inputId: string; name: string; brand: string | null; current: { unit: string; packageSize: number; packagePrice: number }; proposed: { unit: string; packageSize: number; packagePrice: number } };
type Preview = { id: string; operation: 'purchase_prices' | 'create_input' | 'create_product' | 'sale_price' | 'create_order' | 'manual_sale'; items?: Item[]; input?: { name: string; brand?: string; category: string; unit: string; packageSize: number; packagePrice: number; tags: string[]; notes?: string }; productDraft?: { name: string; notes?: string; unitsCount: number; prepTimeMinutes: number; targetProfitPercent: number; extraPercent: number; channelName: string; unitPrice: number; salePrice: number }; product?: { name: string; unitsCount: number; currentUnitPrice: number; currentSalePrice: number; newUnitPrice: number }; order?: { type: string; orderDateTime: string; deliveryType: string; deliveryDate?: string; deliveryAddress?: string; customer: { name: string; phone: string }; products: { productId: string; name: string; quantity: number; unitPrice: number }[]; discountMode: string; discountValue: number; shippingValue: number; total: number }; manualSale?: { accountId: string; accountName: string; accountType: string; accountInstitution?: string; occurredAt: string; description: string; paymentMethod: string; amount: number; notes?: string }; state: string; expiresAt: string; digest: string; result?: { status: string; number?: string } };
export function McpPurchaseReviewPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const canReview = preview?.operation === 'create_input'
    ? !!preview.input && Array.isArray(preview.input.tags)
    : preview?.operation === 'create_product' ? !!preview.productDraft && [preview.productDraft.unitsCount, preview.productDraft.prepTimeMinutes, preview.productDraft.targetProfitPercent, preview.productDraft.extraPercent, preview.productDraft.unitPrice, preview.productDraft.salePrice].every(Number.isFinite)
    : preview?.operation === 'manual_sale' ? !!preview.manualSale && !!preview.manualSale.accountName && !!preview.manualSale.occurredAt && !!preview.manualSale.description && !!preview.manualSale.paymentMethod && Number.isFinite(preview.manualSale.amount) && preview.manualSale.amount > 0
    : preview?.operation === 'sale_price' ? !!preview.product && [preview.product.unitsCount, preview.product.currentUnitPrice, preview.product.currentSalePrice, preview.product.newUnitPrice].every(Number.isFinite)
    : preview?.operation === 'create_order' ? !!preview.order && !!preview.order.customer?.name && !!preview.order.customer.phone && !!preview.order.orderDateTime && ['PEDIDO', 'ORCAMENTO'].includes(preview.order.type) && ['ENTREGA', 'RETIRADA'].includes(preview.order.deliveryType) && (preview.order.deliveryType !== 'ENTREGA' || !!preview.order.deliveryAddress) && Array.isArray(preview.order.products) && preview.order.products.length > 0 && preview.order.products.every(item => !!item.name && Number.isFinite(item.quantity) && Number.isFinite(item.unitPrice)) && [preview.order.total, preview.order.discountValue, preview.order.shippingValue].every(Number.isFinite)
    : preview?.operation === 'purchase_prices' && Array.isArray(preview.items) && preview.items.length > 0 && preview.items.every(item => !!item.current && !!item.proposed);
  useEffect(() => {
    if (!id || !user?.token) return;
    apiFetch<Preview>(`/mcp-review/${encodeURIComponent(id)}`, { token: user.token }).then(setPreview).catch(() => setError('Nao foi possivel carregar a previa.'));
  }, [id, user?.token]);
  const confirm = async () => {
    if (!preview || !canReview || !user?.token) return;
    setBusy(true); setError('');
    try {
      const result = await apiFetch<{ status: string }>(`/mcp-review/${encodeURIComponent(preview.id)}/confirm`, { token: user.token, method: 'POST', body: JSON.stringify({ digest: preview.digest, confirm: true }) });
      setPreview({ ...preview, state: result.status, result });
    } catch { setError('Nao foi possivel confirmar. Atualize e revise antes de tentar novamente.'); }
    finally { setBusy(false); }
  };
  return <section><h1>{preview?.operation === 'create_input' ? 'Revisar cadastro de insumo' : preview?.operation === 'create_product' ? 'Revisar cadastro de produto' : preview?.operation === 'sale_price' ? 'Revisar preco de venda' : preview?.operation === 'create_order' ? 'Revisar pedido ou orcamento' : preview?.operation === 'manual_sale' ? 'Revisar lancamento financeiro de venda' : 'Revisar precos de compra'}</h1>
    {preview?.operation === 'purchase_prices' && <p>Confira cada embalagem e preco. Esta operacao nao altera precos de venda.</p>}
    {error && <p role="alert">{error}</p>}
    {preview && <><p>Situacao: {preview.state}. Valida ate {new Date(preview.expiresAt).toLocaleString('pt-BR')}.</p>
      {preview.operation === 'purchase_prices' && <table><thead><tr><th>Insumo</th><th>Embalagem</th><th>Preco atual</th><th>Novo preco</th></tr></thead><tbody>
        {(preview.items ?? []).map(item => <tr key={item.inputId}><td>{item.name} {item.brand || ''}</td><td>{item.current.packageSize} {item.current.unit}</td><td>R$ {String(item.current.packagePrice)}</td><td>R$ {String(item.proposed.packagePrice)}</td></tr>)}
      </tbody></table>}
      {preview.operation === 'create_input' && preview.input && <dl><dt>Nome</dt><dd>{preview.input.name}</dd><dt>Marca</dt><dd>{preview.input.brand || 'Nao informada'}</dd><dt>Categoria</dt><dd>{preview.input.category}</dd><dt>Embalagem</dt><dd>{preview.input.packageSize} {preview.input.unit}</dd><dt>Preco</dt><dd>{Number(preview.input.packagePrice).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</dd><dt>Marcadores</dt><dd>{preview.input.tags.join(', ') || 'Nenhum'}</dd><dt>Observacoes</dt><dd>{preview.input.notes || 'Nenhuma'}</dd></dl>}
      {preview.operation === 'create_product' && preview.productDraft && <><dl><dt>Nome</dt><dd>{preview.productDraft.name}</dd><dt>Canal</dt><dd>{preview.productDraft.channelName}</dd><dt>Unidades</dt><dd>{preview.productDraft.unitsCount}</dd><dt>Tempo de preparo</dt><dd>{preview.productDraft.prepTimeMinutes} minutos</dd><dt>Lucro alvo</dt><dd>{preview.productDraft.targetProfitPercent}%</dd><dt>Adicional</dt><dd>{preview.productDraft.extraPercent}%</dd><dt>Preco unitario</dt><dd>R$ {String(preview.productDraft.unitPrice)}</dd><dt>Preco do lote</dt><dd>R$ {String(preview.productDraft.salePrice)}</dd><dt>Observacoes</dt><dd>{preview.productDraft.notes || 'Nenhuma'}</dd></dl><p>Produto simples sem componentes cadastrados.</p></>}
      {preview.operation === 'manual_sale' && preview.manualSale && <><dl><dt>Conta financeira</dt><dd>{preview.manualSale.accountName} — {preview.manualSale.accountType} — {preview.manualSale.accountInstitution || 'sem instituicao'} ({preview.manualSale.accountId})</dd><dt>Data</dt><dd>{preview.manualSale.occurredAt}</dd><dt>Descricao</dt><dd>{preview.manualSale.description}</dd><dt>Pagamento</dt><dd>{preview.manualSale.paymentMethod}</dd><dt>Valor</dt><dd>R$ {String(preview.manualSale.amount)}</dd><dt>Observacoes</dt><dd>{preview.manualSale.notes || 'Nenhuma'}</dd></dl><p>Esta acao registra uma venda financeira com a forma de pagamento informada. Nao altera estoque nem um pedido.</p></>}
      {preview.operation === 'sale_price' && preview.product && <dl><dt>Produto</dt><dd>{preview.product.name}</dd><dt>Unidades no lote</dt><dd>{preview.product.unitsCount}</dd><dt>Preco unitario atual</dt><dd>R$ {String(preview.product.currentUnitPrice)}</dd><dt>Preco atual do lote</dt><dd>R$ {String(preview.product.currentSalePrice)}</dd><dt>Novo preco unitario</dt><dd>R$ {String(preview.product.newUnitPrice)}</dd><dt>Novo preco do lote</dt><dd>R$ {String(Math.round(preview.product.newUnitPrice * 100) * preview.product.unitsCount / 100)}</dd></dl>}
      {preview.operation === 'create_order' && preview.order && <><dl><dt>Tipo</dt><dd>{preview.order.type}</dd><dt>Cliente</dt><dd>{preview.order.customer.name} — {preview.order.customer.phone}</dd><dt>Data do pedido</dt><dd>{preview.order.orderDateTime}</dd><dt>Entrega</dt><dd>{preview.order.deliveryType} {preview.order.deliveryDate || 'sem data'} {preview.order.deliveryAddress || ''}</dd><dt>Desconto</dt><dd>{preview.order.discountMode}: {preview.order.discountValue}</dd><dt>Frete</dt><dd>R$ {preview.order.shippingValue}</dd><dt>Total</dt><dd>R$ {preview.order.total}</dd></dl><ul>{preview.order.products.map(p => <li key={p.productId}>{p.name} ({p.productId}): {p.quantity} × R$ {p.unitPrice}</li>)}</ul><p>Situacao inicial: aguardando retorno. Nenhum pagamento sera registrado.</p></>}
      {preview.state === 'prepared' && canReview && <button type="button" disabled={busy} onClick={() => void confirm()}>{preview.operation === 'create_input' ? 'Confirmar cadastro deste insumo' : preview.operation === 'create_product' ? 'Confirmar cadastro deste produto' : preview.operation === 'sale_price' ? 'Confirmar este preco de venda' : preview.operation === 'create_order' ? 'Confirmar este pedido ou orcamento' : preview.operation === 'manual_sale' ? 'Confirmar lancamento financeiro da venda' : 'Confirmar estes precos de compra'}</button>}
      {preview.state === 'prepared' && !canReview && <p role="alert">A previa esta incompleta e nao pode ser confirmada.</p>}
      {preview.state === 'applied' && <p>{preview.operation === 'create_input' ? 'Insumo cadastrado.' : preview.operation === 'create_product' ? 'Produto cadastrado.' : preview.operation === 'sale_price' ? 'Preco de venda atualizado.' : preview.operation === 'create_order' ? `Pedido registrado: ${preview.result?.number ?? ''}` : preview.operation === 'manual_sale' ? 'Venda financeira registrada.' : 'Precos de compra atualizados.'}</p>}
      {preview.state === 'conflict' && <p>Os dados mudaram. Prepare uma nova previa.</p>}
    </>}
  </section>;
}
