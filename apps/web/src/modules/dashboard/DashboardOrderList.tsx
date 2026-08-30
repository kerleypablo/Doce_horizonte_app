import { useNavigate } from 'react-router-dom';
import type { DashboardOrder } from './dashboard-types.ts';
import { formatCurrency, formatOrderTime, getStatusDetails } from './dashboard-utils.ts';

type DashboardOrderListProps = {
  dateKey: string;
  orders: DashboardOrder[];
  onCreate: () => void;
};

export const DashboardOrderList = ({ dateKey, orders, onCreate }: DashboardOrderListProps) => {
  const navigate = useNavigate();
  const formattedDate = new Date(`${dateKey}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });

  return (
    <section className="dashboard-orders-section">
      <div className="dashboard-section-heading">
        <div>
          <span>Agenda</span>
          <h3>Pedidos de {formattedDate}</h3>
        </div>
        <button type="button" className="dashboard-text-action" onClick={onCreate}>
          <span className="material-symbols-outlined" aria-hidden="true">add_circle</span>
          Novo pedido
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="dashboard-empty-orders">
          <span className="material-symbols-outlined" aria-hidden="true">event_available</span>
          <div><strong>Nenhum pedido neste dia</strong><small>Crie um pedido para preencher sua agenda.</small></div>
        </div>
      ) : (
        <div className="dashboard-order-list">
          {orders.map((order) => {
            const status = getStatusDetails(order.status);
            const productLabel = (order.products ?? []).length
              ? (order.products ?? []).map((product) => `${product.quantity > 1 ? `${product.quantity}× ` : ''}${product.name}`).join(' • ')
              : 'Sem produtos cadastrados';
            return (
              <button key={order.id} type="button" className="dashboard-order-card" onClick={() => navigate(`/app/pedidos/${order.id}`)}>
                <div className="dashboard-order-time">{formatOrderTime(order.orderDateTime)}</div>
                <div className="dashboard-order-main">
                  <div className="dashboard-order-title"><strong>{order.customerSnapshot?.name ?? 'Sem cliente'}</strong><span>{order.number}</span></div>
                  <small>{productLabel}</small>
                  <div className="dashboard-order-meta">
                    <span className="material-symbols-outlined" aria-hidden="true">{order.deliveryType === 'RETIRADA' ? 'storefront' : 'local_shipping'}</span>
                    {order.deliveryType === 'RETIRADA' ? 'Retirada' : 'Entrega'}
                  </div>
                </div>
                <div className="dashboard-order-value">
                  <strong>{formatCurrency(order.total ?? 0)}</strong>
                  <span className={`dashboard-status ${status.tone}`}>{status.label}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};
