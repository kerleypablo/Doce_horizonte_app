import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';
import { apiFetch } from '../shared/api.ts';
import { queryKeys } from '../shared/queryKeys.ts';
import { prefetchWithCache, useCachedQuery } from '../shared/queryCache.ts';

const cards = [
  {
    title: 'Pedidos',
    icon: 'receipt_long',
    path: '/app/pedidos'
  },
  {
    title: 'Insumos',
    icon: 'inventory_2',
    path: '/app/insumos'
  },
  {
    title: 'Receita',
    icon: 'menu_book',
    path: '/app/receitas'
  },
  {
    title: 'Produtos',
    icon: 'shopping_bag',
    path: '/app/produtos'
  },
  {
    title: 'Cliente',
    icon: 'groups',
    path: '/app/clientes'
  },
  {
    title: 'Empresa',
    icon: 'domain',
    path: '/app/empresa'
  }
];

type OrderItem = {
  id: string;
  number: string;
  orderDateTime: string;
  deliveryDate?: string;
  status: 'AGUARDANDO_RETORNO' | 'CONCLUIDO' | 'CONFIRMADO' | 'CANCELADO';
  products?: { name: string; quantity: number; unitPrice?: number }[];
  customerSnapshot?: { name: string };
  additions?: { mode: 'PERCENT' | 'FIXED'; value: number }[];
  discountMode?: 'PERCENT' | 'FIXED';
  discountValue?: number;
  shippingValue?: number;
  total?: number;
};

type CompanySettings = {
  companyName?: string;
  logoDataUrl?: string;
};

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeDateKey = (value?: string) => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return toDateKey(parsed);
};

const getOrderDateKeys = (order: OrderItem) => {
  const deliveryKey = normalizeDateKey(order.deliveryDate);
  return deliveryKey ? [deliveryKey] : [];
};

const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

export const DashboardPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);
  const [monthDate, setMonthDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(toDateKey(today));
  const [calendarCompact, setCalendarCompact] = useState(true);
  const [showRevenue, setShowRevenue] = useState(true);
  const ordersQuery = useCachedQuery(
    queryKeys.ordersSummaryCalendar,
    () => apiFetch<OrderItem[]>('/orders', { token: user?.token }),
    { staleTime: 60_000, enabled: Boolean(user?.token), refetchInterval: 90_000 }
  );
  const settingsQuery = useCachedQuery(
    queryKeys.companySettings,
    () => apiFetch<CompanySettings>('/company/settings', { token: user?.token }),
    { staleTime: 5 * 60_000, enabled: Boolean(user?.token) }
  );
  const orders = ordersQuery.data ?? [];
  const settings = settingsQuery.data ?? null;

  useEffect(() => {
    if (!user?.token) return;
    prefetchWithCache(
      queryKeys.customers,
      () => apiFetch('/customers', { token: user.token }),
      { staleTime: 3 * 60_000 }
    );
    prefetchWithCache(
      queryKeys.products,
      () => apiFetch('/products', { token: user.token }),
      { staleTime: 3 * 60_000 }
    );
  }, [user?.token]);

  const ordersByDate = useMemo(() => {
    const map = new Map<string, Map<string, OrderItem>>();
    for (const order of orders) {
      const dateKeys = getOrderDateKeys(order);
      for (const key of dateKeys) {
        if (!map.has(key)) map.set(key, new Map());
        map.get(key)?.set(order.id, order);
      }
    }
    const normalized = new Map<string, OrderItem[]>();
    for (const [key, value] of map.entries()) {
      normalized.set(key, [...value.values()]);
    }
    return normalized;
  }, [orders]);

  const calendarCells = useMemo(() => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDayWeek = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ day: number; dateKey: string } | null> = [];

    for (let i = 0; i < firstDayWeek; i += 1) cells.push(null);
    for (let day = 1; day <= totalDays; day += 1) {
      const dateKey = toDateKey(new Date(year, month, day));
      cells.push({ day, dateKey });
    }
    return cells;
  }, [monthDate]);

  const visibleCalendarCells = useMemo(() => {
    if (!calendarCompact) return calendarCells;
    const selected = new Date(`${selectedDate}T12:00:00`);
    if (Number.isNaN(selected.getTime())) return calendarCells;
    const weekStart = new Date(selected);
    weekStart.setDate(selected.getDate() - selected.getDay());
    return Array.from({ length: 7 }, (_, index) => {
      const dayDate = new Date(weekStart);
      dayDate.setDate(weekStart.getDate() + index);
      return { day: dayDate.getDate(), dateKey: toDateKey(dayDate) };
    });
  }, [calendarCells, calendarCompact, selectedDate]);

  const selectedOrders = ordersByDate.get(selectedDate) ?? [];
  const confirmedRevenue = useMemo(() => {
    const calcTotal = (order: OrderItem) => {
      if (typeof order.total === 'number') return Number(order.total ?? 0);
      const productsTotal = (order.products ?? []).reduce(
        (sum, item) => sum + Number(item.quantity ?? 0) * Number(item.unitPrice ?? 0),
        0
      );
      const additionsTotal = (order.additions ?? []).reduce((sum, item) => {
        if (item.mode === 'FIXED') return sum + Number(item.value ?? 0);
        return sum + (productsTotal * Number(item.value ?? 0)) / 100;
      }, 0);
      const discountValue = Number(order.discountValue ?? 0);
      const discountTotal = order.discountMode === 'PERCENT'
        ? ((productsTotal + additionsTotal) * discountValue) / 100
        : discountValue;
      return productsTotal + additionsTotal - discountTotal + Number(order.shippingValue ?? 0);
    };
    return orders
      .filter((order) => order.status === 'CONFIRMADO' || order.status === 'CONCLUIDO')
      .reduce((sum, order) => sum + calcTotal(order), 0);
  }, [orders]);

  const revenueLabel = showRevenue
    ? `R$ ${confirmedRevenue.toFixed(2).replace('.', ',')}`
    : 'R$ --,--';

  return (
    <div className="page">
      <div className="home-company-summary">
        <div className="home-company-title">
          {settings?.logoDataUrl ? <img src={settings.logoDataUrl} alt="Logo da empresa" /> : null}
          <h3>{settings?.companyName ?? 'Minha empresa'}</h3>
        </div>
        <div className="home-revenue-row">
          <span>Total de pedidos</span>
          <div className="home-revenue-value-row">
            <strong>{revenueLabel}</strong>
            <button
              type="button"
              className="icon-button small"
              aria-label={showRevenue ? 'Ocultar valor' : 'Exibir valor'}
              onClick={() => setShowRevenue((prev) => !prev)}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {showRevenue ? 'visibility' : 'visibility_off'}
              </span>
            </button>
          </div>
          <div className="home-revenue-divider" aria-hidden="true" />
        </div>
      </div>

      <div className="panel home-calendar">
        <div className="home-calendar-header">
          <div className="home-calendar-title-row">
            <h3>Calendario de pedidos</h3>
            <div className="home-calendar-title-actions">
              <button
                type="button"
                className="icon-button small"
                aria-label={calendarCompact ? 'Expandir calendario' : 'Recolher calendario'}
                onClick={() => setCalendarCompact((prev) => !prev)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {calendarCompact ? 'calendar_view_month' : 'calendar_view_week'}
                </span>
              </button>
              <Link to="/app/tasks" className="ghost home-tasks-link">
                <span className="material-symbols-outlined" aria-hidden="true">view_kanban</span>
                <span>Modo Tasks</span>
              </Link>
            </div>
          </div>
          <div className="home-calendar-nav">
            <button
              type="button"
              className="icon-button"
              aria-label="Mes anterior"
              onClick={() => setMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
            >
              ‹
            </button>
            <strong>{monthLabel.format(monthDate)}</strong>
            <button
              type="button"
              className="icon-button"
              aria-label="Proximo mes"
              onClick={() => setMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
            >
              ›
            </button>
          </div>
        </div>
        {ordersQuery.isFetching && orders.length > 0 ? <p className="muted">Atualizando pedidos...</p> : null}

        <div className="home-calendar-grid">
          {weekDays.map((day) => (
            <span key={day} className="home-calendar-weekday">
              {day}
            </span>
          ))}
          {visibleCalendarCells.map((cell, index) =>
            cell ? (
              <button
                key={cell.dateKey}
                type="button"
                className={`home-calendar-day ${selectedDate === cell.dateKey ? 'active' : ''} ${toDateKey(today) === cell.dateKey ? 'today' : ''}`}
                onClick={() => setSelectedDate(cell.dateKey)}
              >
                <span>{cell.day}</span>
                {ordersByDate.has(cell.dateKey) ? <span className="home-calendar-event-dot" aria-hidden="true" /> : null}
              </button>
            ) : (
              <span key={`empty-${index}`} className="home-calendar-empty" />
            )
          )}
        </div>

        <div className="home-orders-summary">
          <div className="home-orders-summary-head">
            <h4>Pedidos do dia {selectedDate.split('-').reverse().join('/')}</h4>
            <button
              type="button"
              className="icon-button small"
              aria-label="Criar pedido na data selecionada"
              onClick={() => navigate(`/app/pedidos/novo?deliveryDate=${selectedDate}`, { state: { deliveryDate: selectedDate } })}
            >
              <span className="material-symbols-outlined" aria-hidden="true">add</span>
            </button>
          </div>
          {selectedOrders.length === 0 ? (
            <p className="muted">Nenhum pedido nesta data.</p>
          ) : (
            <div className="home-orders-list">
              {selectedOrders.map((order) => (
                <button key={order.id} type="button" className="home-order-item" onClick={() => navigate(`/app/pedidos/${order.id}`)}>
                  <strong>{order.number}</strong>
                  <span>{order.customerSnapshot?.name ?? 'Sem cliente'}</span>
                  <span>
                    Produtos:{' '}
                    {(order.products ?? []).length
                      ? order.products
                          .map((product) => `${product.name}${product.quantity > 1 ? ` (${product.quantity})` : ''}`)
                          .join(', ')
                      : 'Sem produtos'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="home-shortcuts">
        {cards.map((card) => (
          <Link key={card.title} to={card.path} className="card home-shortcut-card">
            <span className="material-symbols-outlined home-shortcut-icon" aria-hidden="true">{card.icon}</span>
            <h3>{card.title}</h3>
          </Link>
        ))}
      </div>
    </div>
  );
};
