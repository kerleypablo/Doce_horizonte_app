import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';
import { apiFetch } from '../shared/api.ts';
import { toDateKey } from '../shared/date.ts';
import { prefetchWithCache, useCachedQuery } from '../shared/queryCache.ts';
import { queryKeys } from '../shared/queryKeys.ts';
import { DashboardCalendar } from './DashboardCalendar.tsx';
import { DashboardFinanceMetrics } from './DashboardFinanceMetrics.tsx';
import { DashboardMetrics } from './DashboardMetrics.tsx';
import { DashboardOrderList } from './DashboardOrderList.tsx';
import { DashboardQuickActions } from './DashboardQuickActions.tsx';
import type { CalendarCell, CompanySettings, DashboardOrder } from './dashboard-types.ts';
import type { DashboardData } from '../finance/types.ts';
import {
  buildWeekCells, endOfMonth, endOfWeek, getGreeting, getOrderDateKeys,
  getOrderReferenceDateKey, getOrderTotal, isConfirmedOrder, startOfMonth, startOfWeek
} from './dashboard-utils.ts';

const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

export const DashboardPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => toDateKey(today), [today]);
  const [monthDate, setMonthDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [calendarCompact, setCalendarCompact] = useState(true);
  const [showRevenue, setShowRevenue] = useState(true);

  const calendarRange = useMemo(() => {
    if (calendarCompact) {
      const selected = new Date(`${selectedDate}T12:00:00`);
      if (!Number.isNaN(selected.getTime())) return { from: toDateKey(startOfWeek(selected)), to: toDateKey(endOfWeek(selected)) };
    }
    return { from: toDateKey(startOfMonth(monthDate)), to: toDateKey(endOfMonth(monthDate)) };
  }, [calendarCompact, monthDate, selectedDate]);
  const revenueRange = useMemo(() => ({ from: toDateKey(startOfMonth(today)), to: toDateKey(endOfMonth(today)) }), [today]);
  const currentWeekRange = useMemo(() => ({ from: toDateKey(startOfWeek(today)), to: toDateKey(endOfWeek(today)) }), [today]);
  const fetchOrderSummary = (from: string, to: string) => apiFetch<DashboardOrder[]>(
    `/orders/summary-calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    { token: user?.token }
  );
  const ordersQuery = useCachedQuery(
    `${queryKeys.ordersSummaryCalendar}:home:${calendarRange.from}:${calendarRange.to}`,
    () => fetchOrderSummary(calendarRange.from, calendarRange.to),
    { staleTime: 60_000, enabled: Boolean(user?.token), refetchInterval: 90_000 }
  );
  const revenueQuery = useCachedQuery(
    `${queryKeys.ordersSummaryCalendar}:home-revenue:${revenueRange.from}:${revenueRange.to}`,
    () => fetchOrderSummary(revenueRange.from, revenueRange.to),
    { staleTime: 60_000, enabled: Boolean(user?.token), refetchInterval: 90_000 }
  );
  const weekOrdersQuery = useCachedQuery(
    `${queryKeys.ordersSummaryCalendar}:home-week:${currentWeekRange.from}:${currentWeekRange.to}`,
    () => fetchOrderSummary(currentWeekRange.from, currentWeekRange.to),
    { staleTime: 60_000, enabled: Boolean(user?.token), refetchInterval: 90_000 }
  );
  const settingsQuery = useCachedQuery(
    queryKeys.companySettings,
    () => apiFetch<CompanySettings>('/company/settings', { token: user?.token }),
    { staleTime: 5 * 60_000, enabled: Boolean(user?.token) }
  );
  const financeEnabled = Boolean(user?.modules?.includes('financeiro'));
  const financeQuery = useCachedQuery(
    `finance-dashboard:home:${revenueRange.from}:${revenueRange.to}`,
    () => apiFetch<DashboardData>(`/finance/dashboard?from=${revenueRange.from}&to=${revenueRange.to}`, { token: user?.token }),
    { staleTime: 45_000, enabled: Boolean(user?.token && financeEnabled) }
  );

  const orders = ordersQuery.data ?? [];
  const revenueOrders = revenueQuery.data ?? [];
  const currentWeekOrders = weekOrdersQuery.data ?? [];
  const settings = settingsQuery.data;

  useEffect(() => {
    if (!user?.token) return;
    prefetchWithCache(queryKeys.customers, () => apiFetch('/customers', { token: user.token }), { staleTime: 3 * 60_000 });
    prefetchWithCache(queryKeys.products, () => apiFetch('/products', { token: user.token }), { staleTime: 3 * 60_000 });
  }, [user?.token]);

  const ordersByDate = useMemo(() => {
    const grouped = new Map<string, DashboardOrder[]>();
    for (const order of orders) {
      for (const dateKey of getOrderDateKeys(order)) grouped.set(dateKey, [...(grouped.get(dateKey) ?? []), order]);
    }
    return grouped;
  }, [orders]);
  const calendarCells = useMemo<CalendarCell[]>(() => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const cells: CalendarCell[] = Array.from({ length: new Date(year, month, 1).getDay() }, () => null);
    for (let day = 1; day <= totalDays; day += 1) cells.push({ day, dateKey: toDateKey(new Date(year, month, day)) });
    return cells;
  }, [monthDate]);
  const visibleCalendarCells = useMemo(() => calendarCompact ? buildWeekCells(selectedDate) : calendarCells, [calendarCells, calendarCompact, selectedDate]);
  const calendarTitle = useMemo(() => {
    if (!calendarCompact) return monthLabel.format(monthDate);
    const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };
    return `${new Date(`${calendarRange.from}T12:00:00`).toLocaleDateString('pt-BR', options)} — ${new Date(`${calendarRange.to}T12:00:00`).toLocaleDateString('pt-BR', options)}`;
  }, [calendarCompact, calendarRange.from, calendarRange.to, monthDate]);
  const selectedOrders = (ordersByDate.get(selectedDate) ?? [])
    .map((order) => ({ ...order, total: getOrderTotal(order) }))
    .sort((first, second) => first.orderDateTime.localeCompare(second.orderDateTime));
  const monthlySales = useMemo(() => revenueOrders.filter(isConfirmedOrder).reduce((total, order) => total + getOrderTotal(order), 0), [revenueOrders]);
  const todayDeliveries = currentWeekOrders.filter((order) => getOrderReferenceDateKey(order) === todayKey).length;
  const confirmedOrders = currentWeekOrders.filter(isConfirmedOrder).length;
  const firstName = user?.name?.trim().split(/\s+/)[0] || 'empreendedora';

  const shiftCalendar = (direction: -1 | 1) => {
    if (calendarCompact) {
      const selected = new Date(`${selectedDate}T12:00:00`);
      if (Number.isNaN(selected.getTime())) return;
      selected.setDate(selected.getDate() + direction * 7);
      setSelectedDate(toDateKey(selected));
      setMonthDate(new Date(selected.getFullYear(), selected.getMonth(), 1));
      return;
    }
    setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
  };

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div className="dashboard-welcome">
          <div className="dashboard-company-mark">
            {settings?.logoDataUrl ? <img src={settings.logoDataUrl} alt={`Logo ${settings.companyName ?? 'da empresa'}`} /> : <span className="material-symbols-outlined">bakery_dining</span>}
          </div>
          <div><span>{settings?.companyName ?? 'Doce Horizonte'}</span><h1>{getGreeting(today)}, {firstName}</h1><small>Confira como está sua operação hoje.</small></div>
        </div>
        <div className={financeEnabled ? 'dashboard-metrics-carousel' : undefined}>
          <div className={financeEnabled ? 'dashboard-metrics-carousel-track' : undefined}>
            <div className={financeEnabled ? 'dashboard-metrics-carousel-slide' : undefined}>
              <DashboardMetrics monthlySales={monthlySales} weekOrders={currentWeekOrders.length} todayDeliveries={todayDeliveries} confirmedOrders={confirmedOrders} loading={revenueQuery.loading || weekOrdersQuery.loading} hidden={!showRevenue} onToggleVisibility={() => setShowRevenue((current) => !current)} />
            </div>
            {financeEnabled ? (
              <div className="dashboard-metrics-carousel-slide">
                <DashboardFinanceMetrics
                  entries={financeQuery.data?.totals.totalEntries ?? 0}
                  expenses={financeQuery.data?.totals.expensesNet ?? 0}
                  result={financeQuery.data?.totals.netResult ?? 0}
                  appOrders={financeQuery.data?.totals.ordersTotal ?? 0}
                  loading={financeQuery.loading}
                />
              </div>
            ) : null}
          </div>
          {financeEnabled ? <small className="dashboard-metrics-carousel-hint">Deslize para ver o resumo financeiro</small> : null}
        </div>
      </section>
      <div className="dashboard-content-grid">
        <div className="dashboard-primary-column">
          <DashboardCalendar compact={calendarCompact} title={calendarTitle} cells={visibleCalendarCells} selectedDate={selectedDate} todayDate={todayKey} orderDates={new Set(ordersByDate.keys())} onToggleCompact={() => setCalendarCompact((current) => !current)} onShift={shiftCalendar} onSelectDate={setSelectedDate} />
          <DashboardOrderList dateKey={selectedDate} orders={selectedOrders} onCreate={() => navigate(`/app/pedidos/novo?deliveryDate=${selectedDate}`, { state: { deliveryDate: selectedDate } })} />
        </div>
        <DashboardQuickActions />
      </div>
    </div>
  );
};
