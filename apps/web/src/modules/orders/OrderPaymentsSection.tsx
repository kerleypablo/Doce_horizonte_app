import { formatDateBr } from '../shared/date.ts';
import type { OrderItem } from './order-types.ts';
import type { OrderTotals } from './order-totals.ts';

const formatCurrency = (value: number) => `R$ ${value.toFixed(2)}`;

export const OrderPaymentsSection = ({
  payments,
  totals,
  onAdd,
  onEdit,
  onRemove
}: {
  payments: OrderItem['payments'];
  totals: OrderTotals;
  onAdd: () => void;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
}) => (
  <div className="panel form-box">
    <h4>Pagamentos</h4>
    <div className="summary">
      <div><span>Total pedido</span><strong>{formatCurrency(totals.total)}</strong></div>
    </div>
    <div className="values-toolbar">
      <button type="button" className="ghost" onClick={onAdd}>+ Adicionar pagamento</button>
    </div>
    <div className="values-config-list">
      {payments.map((payment, index) => (
        <div key={`${payment.date}-${index}`} className="values-config-row">
          <div>
            <strong>Pagamento {index + 1}</strong>
            <span className="muted">
              {formatDateBr(payment.date)} • {formatCurrency(payment.amount)}
              {payment.note ? ` • ${payment.note}` : ''}
            </span>
          </div>
          <div className="values-config-actions">
            <button type="button" className="icon-button tiny" aria-label="Editar" onClick={() => onEdit(index)}><span className="material-symbols-outlined" aria-hidden="true">edit</span></button>
            <button type="button" className="icon-button tiny" aria-label="Remover" onClick={() => onRemove(index)}><span className="material-symbols-outlined" aria-hidden="true">delete_outline</span></button>
          </div>
        </div>
      ))}
      {!payments.length ? <p className="muted">Nenhum pagamento adicionado.</p> : null}
    </div>
    <div className="summary payments-summary">
      <div><span>Total pago</span><strong>{formatCurrency(totals.paid)}</strong></div>
      <div className="summary-total"><span>Falta receber</span><strong>{formatCurrency(totals.pending)}</strong></div>
    </div>
  </div>
);
