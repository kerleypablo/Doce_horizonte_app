import { formatDateBr } from '../shared/date.ts';
import { ListSkeleton } from '../shared/ListSkeleton.tsx';
import { ListToolbar } from '../shared/ListToolbar.tsx';
import type { OrderListItem, OrderStatus, OrderStatusFilter } from './order-types.ts';

const filters: Array<{ value: OrderStatusFilter; label: string }> = [
  { value: 'OPEN', label: 'Em aberto' },
  { value: 'AGUARDANDO_RETORNO', label: 'Aguardando' },
  { value: 'CONFIRMADO', label: 'Confirmados' },
  { value: 'CONCLUIDO', label: 'Concluidos' },
  { value: 'CANCELADO', label: 'Cancelados' }
];
const statusLabel: Record<OrderStatus, string> = { AGUARDANDO_RETORNO: 'Aguardando', CONFIRMADO: 'Confirmado', CONCLUIDO: 'Concluido', CANCELADO: 'Cancelado' };
const statusClass = (status: OrderStatus) => status === 'CONFIRMADO' ? 'is-confirmado' : status === 'CANCELADO' ? 'is-cancelado' : status === 'CONCLUIDO' ? 'is-concluido' : 'is-aguardando';

export const OrdersListPanel = ({ orders, search, statusFilter, currentWeekOnly, loading, refreshing, onSearch, onNew, onStatusFilter, onToggleWeek, onOpen, onPdf, onDelete }: {
  orders: OrderListItem[];
  search: string;
  statusFilter: OrderStatusFilter;
  currentWeekOnly: boolean;
  loading: boolean;
  refreshing: boolean;
  onSearch: (value: string) => void;
  onNew: () => void;
  onStatusFilter: (value: OrderStatusFilter) => void;
  onToggleWeek: () => void;
  onOpen: (id: string) => void;
  onPdf: (id: string) => void;
  onDelete: (order: OrderListItem) => void;
}) => (
  <div className="panel">
    <ListToolbar title="Pedidos e orcamentos" searchValue={search} onSearch={onSearch} actionLabel="+" onAction={onNew} />
    <div className="orders-filters">
      <div className="orders-status-filters" role="tablist" aria-label="Filtrar pedidos por status">
        {filters.map((option) => <button key={option.value} type="button" className={statusFilter === option.value ? 'ghost active' : 'ghost'} onClick={() => onStatusFilter(option.value)} aria-pressed={statusFilter === option.value}>{option.label}</button>)}
      </div>
      <button type="button" className={currentWeekOnly ? 'ghost active' : 'ghost'} onClick={onToggleWeek}>Desta semana</button>
    </div>
    {refreshing && !loading ? <p className="muted">Atualizando pedidos...</p> : null}
    {loading ? <ListSkeleton /> : (
      <div className="table">
        {orders.map((order) => (
          <div key={order.id} className={`list-row order-list-row ${statusClass(order.status)}`} role="button" tabIndex={0} onClick={() => onOpen(order.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(order.id); } }}>
            <div><strong>{order.customerSnapshot?.name ?? 'Sem cliente'}</strong><span className="muted order-list-status-text">Entrega: {order.deliveryDate ? formatDateBr(order.deliveryDate) : '-'} • {statusLabel[order.status]}</span></div>
            <div className="inline-right">
              <button type="button" className="icon-button small pdf-action" onClick={(event) => { event.stopPropagation(); onPdf(order.id); }} aria-label="PDF"><span className="material-symbols-outlined" aria-hidden="true">picture_as_pdf</span></button>
              <button type="button" className="icon-button" aria-label="Excluir" onClick={(event) => { event.stopPropagation(); onDelete(order); }}><span className="material-symbols-outlined" aria-hidden="true">delete_outline</span></button>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);
