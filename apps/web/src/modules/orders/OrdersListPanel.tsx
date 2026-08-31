import { normalizeDateKey, toDateKey } from '../shared/date.ts';
import { ListSkeleton } from '../shared/ListSkeleton.tsx';
import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { OrderListItem, OrderStatus, OrderStatusFilter } from './order-types.ts';

const filters: Array<{ value: OrderStatusFilter; label: string }> = [
  { value: 'OPEN', label: 'Em aberto' },
  { value: 'AGUARDANDO_RETORNO', label: 'Aguardando' },
  { value: 'CONFIRMADO', label: 'Confirmados' },
  { value: 'CONCLUIDO', label: 'Concluídos' },
  { value: 'CANCELADO', label: 'Cancelados' }
];

const statusDetails: Record<OrderStatus, { label: string; tone: string }> = {
  AGUARDANDO_RETORNO: { label: 'Aguardando retorno', tone: 'pending' },
  CONFIRMADO: { label: 'Confirmado', tone: 'confirmed' },
  CONCLUIDO: { label: 'Concluído', tone: 'completed' },
  CANCELADO: { label: 'Cancelado', tone: 'cancelled' }
};

const formatCurrency = (value?: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
}).format(Number(value ?? 0));

const getDateGroup = (dateValue?: string) => {
  const key = normalizeDateKey(dateValue);
  if (!key) return { key: 'without-date', title: 'Sem data de entrega', subtitle: 'Defina a data no pedido' };
  const today = new Date();
  const todayKey = toDateKey(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (key === todayKey) return { key, title: 'Hoje', subtitle: today.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' }) };
  if (key === toDateKey(tomorrow)) return { key, title: 'Amanhã', subtitle: tomorrow.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' }) };
  const date = new Date(`${key}T12:00:00`);
  return {
    key,
    title: date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' }),
    subtitle: date.toLocaleDateString('pt-BR', { year: 'numeric' })
  };
};

const groupOrders = (orders: OrderListItem[]) => {
  const grouped = new Map<string, { title: string; subtitle: string; orders: OrderListItem[] }>();
  [...orders]
    .sort((first, second) => (normalizeDateKey(first.deliveryDate) ?? '9999-12-31').localeCompare(normalizeDateKey(second.deliveryDate) ?? '9999-12-31'))
    .forEach((order) => {
      const group = getDateGroup(order.deliveryDate);
      const current = grouped.get(group.key) ?? { title: group.title, subtitle: group.subtitle, orders: [] };
      current.orders.push(order);
      grouped.set(group.key, current);
    });
  return [...grouped.entries()].map(([key, group]) => ({ key, ...group }));
};

type OrdersListPanelProps = {
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
  onStatusChange: (order: OrderListItem, status: OrderStatus) => void;
  onPdf: (id: string) => void;
  onDelete: (order: OrderListItem) => void;
};

const nextStatusOnRightSwipe = (status: OrderStatus): OrderStatus | null => {
  if (status === 'AGUARDANDO_RETORNO') return 'CONFIRMADO';
  if (status === 'CONFIRMADO') return 'CONCLUIDO';
  return null;
};

const SwipeableOrderCard = ({
  order, onOpen, onStatusChange, onPdf, onDelete
}: Pick<OrdersListPanelProps, 'onOpen' | 'onStatusChange' | 'onPdf' | 'onDelete'> & { order: OrderListItem }) => {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const offsetRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const status = statusDetails[order.status];
  const rightStatus = nextStatusOnRightSwipe(order.status);
  const rightLabel = rightStatus === 'CONFIRMADO' ? 'Confirmado' : rightStatus === 'CONCLUIDO' ? 'Concluído' : '';

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    startXRef.current = event.clientX;
    pointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    const delta = Math.max(-130, Math.min(130, event.clientX - startXRef.current));
    if (delta > 0 && !rightStatus) return;
    offsetRef.current = delta;
    setOffset(delta);
  };

  const finishSwipe = (event: ReactPointerEvent<HTMLElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    pointerIdRef.current = null;
    setDragging(false);
    const finalOffset = offsetRef.current;
    const targetStatus = finalOffset >= 92 ? rightStatus : finalOffset <= -92 ? 'AGUARDANDO_RETORNO' : null;
    if (!targetStatus || targetStatus === order.status) {
      offsetRef.current = 0;
      setOffset(0);
      return;
    }
    suppressClickRef.current = true;
    const exitOffset = targetStatus === 'AGUARDANDO_RETORNO' ? -150 : 150;
    offsetRef.current = exitOffset;
    setOffset(exitOffset);
    onStatusChange(order, targetStatus);
    window.setTimeout(() => { offsetRef.current = 0; setOffset(0); }, 160);
  };

  return (
    <div className={`orders-swipe-card ${dragging ? 'dragging' : ''}`}>
      <div className="orders-swipe-action orders-swipe-action-right" aria-hidden="true"><span className="material-symbols-outlined">{rightStatus === 'CONCLUIDO' ? 'task_alt' : 'check_circle'}</span><strong>{rightLabel}</strong></div>
      <div className="orders-swipe-action orders-swipe-action-left" aria-hidden="true"><span className="material-symbols-outlined">schedule</span><strong>Aguardando</strong></div>
      <article
        className={`orders-board-card ${status.tone}`}
        role="button"
        tabIndex={0}
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishSwipe}
        onPointerCancel={() => { pointerIdRef.current = null; offsetRef.current = 0; setDragging(false); setOffset(0); }}
        onClick={() => {
          if (suppressClickRef.current) { suppressClickRef.current = false; return; }
          onOpen(order.id);
        }}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(order.id); } }}
      >
        <div className="orders-board-card-main">
          <div className="orders-board-card-heading"><span>{order.number}</span><strong>{order.customerSnapshot?.name ?? 'Sem cliente'}</strong></div>
          <div className="orders-board-card-meta"><span className="material-symbols-outlined" aria-hidden="true">event</span>{order.deliveryDate ? 'Entrega programada' : 'Sem data de entrega'}</div>
        </div>
        <div className="orders-board-card-side">
          <strong>{formatCurrency(order.total)}</strong>
          <span className={`orders-status-badge ${status.tone}`}>{status.label}</span>
        </div>
        <div className="orders-board-card-actions">
          <button type="button" className="icon-button tiny pdf-action" onClick={(event) => { event.stopPropagation(); onPdf(order.id); }} aria-label={`Gerar PDF do pedido ${order.number}`}><span className="material-symbols-outlined" aria-hidden="true">picture_as_pdf</span></button>
          <button type="button" className="icon-button tiny orders-delete-button" onClick={(event) => { event.stopPropagation(); onDelete(order); }} aria-label={`Excluir pedido ${order.number}`}><span className="material-symbols-outlined" aria-hidden="true">delete_outline</span></button>
        </div>
      </article>
    </div>
  );
};

export const OrdersListPanel = ({
  orders, search, statusFilter, currentWeekOnly, loading, refreshing,
  onSearch, onNew, onStatusFilter, onToggleWeek, onOpen, onStatusChange, onPdf, onDelete
}: OrdersListPanelProps) => {
  const groups = groupOrders(orders);

  return (
    <section className="orders-board">
      <header className="orders-board-header">
        <div>
          <span>Gestão de vendas</span>
          <h1>Pedidos</h1>
          <small>Organize sua agenda e acompanhe cada venda.</small>
        </div>
        <button type="button" className="orders-new-button" onClick={onNew}>
          <span className="material-symbols-outlined" aria-hidden="true">add</span>
          Novo pedido
        </button>
      </header>

      <div className="orders-board-search">
        <span className="material-symbols-outlined" aria-hidden="true">search</span>
        <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Buscar pedido ou cliente" aria-label="Buscar pedido ou cliente" />
        {search ? <button type="button" onClick={() => onSearch('')} aria-label="Limpar busca"><span className="material-symbols-outlined" aria-hidden="true">close</span></button> : null}
      </div>

      <div className="orders-board-filters">
        <div className="orders-filter-chips" role="tablist" aria-label="Filtrar pedidos por status">
          {filters.map((option) => (
            <button key={option.value} type="button" className={statusFilter === option.value ? 'active' : ''} onClick={() => onStatusFilter(option.value)} aria-pressed={statusFilter === option.value}>
              {option.label}
            </button>
          ))}
        </div>
        <button type="button" className={currentWeekOnly ? 'orders-week-filter active' : 'orders-week-filter'} onClick={onToggleWeek}>
          <span className="material-symbols-outlined" aria-hidden="true">date_range</span>
          Esta semana
        </button>
      </div>

      {refreshing && !loading ? <p className="orders-refreshing">Atualizando pedidos...</p> : null}
      {loading ? <div className="orders-loading"><ListSkeleton /></div> : null}
      {!loading && groups.length === 0 ? (
        <div className="orders-empty-state">
          <span className="material-symbols-outlined" aria-hidden="true">receipt_long</span>
          <div><strong>Nenhum pedido encontrado</strong><small>Altere os filtros ou crie um novo pedido.</small></div>
          <button type="button" onClick={onNew}>Criar pedido</button>
        </div>
      ) : null}
      {!loading ? (
        <div className="orders-date-groups">
          {groups.map((group) => (
            <section key={group.key} className="orders-date-group">
              <div className="orders-date-group-title"><div><strong>{group.title}</strong><span>{group.subtitle}</span></div><small>{group.orders.length} {group.orders.length === 1 ? 'pedido' : 'pedidos'}</small></div>
              <div className="orders-card-list">
                {group.orders.map((order) => <SwipeableOrderCard key={order.id} order={order} onOpen={onOpen} onStatusChange={onStatusChange} onPdf={onPdf} onDelete={onDelete} />)}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </section>
  );
};
