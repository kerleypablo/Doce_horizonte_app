import type { OrderTotals } from './order-totals.ts';

const formatCurrency = (value: number) => `R$ ${value.toFixed(2)}`;

export const OrderTotalsSummary = ({
  totals,
  additionsCount,
  discountValue,
  shippingValue
}: {
  totals: OrderTotals;
  additionsCount: number;
  discountValue: number;
  shippingValue: number;
}) => (
  <div className="panel form-box">
    <h4>Resumo geral</h4>
    <div className="summary">
      <div><span>Produtos</span><strong>{formatCurrency(totals.productsTotal)}</strong></div>
      {additionsCount > 0 ? <div><span>Adicionais</span><strong>{formatCurrency(totals.additionsTotal)}</strong></div> : null}
      {discountValue > 0 ? <div><span>Desconto</span><strong>{formatCurrency(totals.discountTotal)}</strong></div> : null}
      {shippingValue > 0 ? <div><span>Frete</span><strong>{formatCurrency(shippingValue)}</strong></div> : null}
      <div className="summary-total"><span>Total pedido</span><strong>{formatCurrency(totals.total)}</strong></div>
    </div>
  </div>
);
