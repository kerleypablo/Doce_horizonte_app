import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';
import { apiFetch } from '../shared/api.ts';
import { SelectField } from '../shared/SelectField.tsx';
import { invalidateQueryCache } from '../shared/queryCache.ts';
import { FinanceAccessBlocked } from './FinanceShared.tsx';
import { DashboardCalendar } from '../dashboard/DashboardCalendar.tsx';
import { buildWeekCells } from '../dashboard/dashboard-utils.ts';
import type { CalendarCell } from '../dashboard/dashboard-types.ts';
import {
  financeDashboardKey,
  accountTypeLabels,
  expenseCategoryLabels,
  expenseCategoryKeys,
  methodLabels,
  modeLabels,
  saleOriginKeys,
  saleOriginLabels
} from './constants.ts';
import {
  useExpenses,
  useFinanceDashboard,
  useFinanceRange,
  useManualSales
} from './hooks.ts';
import { formatCompactCurrency, formatCurrency, monthStart, todayDate } from './utils.ts';
import type { PaymentMethod, SaleOrigin } from './types.ts';

type DashboardTab = 'overview' | 'cashflow' | 'sources';
type DetailChartTab = 'general' | 'byMethod';
type FinanceHomeTab = 'dashboard' | 'sales' | 'expenses' | 'accounts' | 'rates';
type RangePreset = 'today' | 'week' | 'month' | 'custom';

const dashboardTabs: Array<{ id: DashboardTab; label: string }> = [
  { id: 'overview', label: 'Visao geral' },
  { id: 'cashflow', label: 'Fluxo' },
  { id: 'sources', label: 'Origens' }
];

const detailChartTabs: Array<{ id: DetailChartTab; label: string }> = [
  { id: 'general', label: 'Geral' },
  { id: 'byMethod', label: 'Por tipo' }
];

const financeHomeTabs: Array<{ id: FinanceHomeTab; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'sales', label: 'Vendas' },
  { id: 'expenses', label: 'Despesas' },
  { id: 'accounts', label: 'Contas' },
  { id: 'rates', label: 'Taxas' }
];

const getThemeTokens = () => {
  if (typeof window === 'undefined') {
    return {
      bg: '#ffffff',
      surfaceAlt: '#f3f3f3',
      text: '#1f2937',
      muted: '#6b7280',
      accent: '#3f7ea2',
      accentStrong: '#23526f',
      border: '#e5e7eb'
    };
  }

  const styles = getComputedStyle(document.documentElement);
  return {
    bg: styles.getPropertyValue('--surface').trim() || '#ffffff',
    surfaceAlt: styles.getPropertyValue('--surface-alt').trim() || '#f3f3f3',
    text: styles.getPropertyValue('--text').trim() || '#1f2937',
    muted: styles.getPropertyValue('--muted').trim() || '#6b7280',
    accent: styles.getPropertyValue('--accent').trim() || '#3f7ea2',
    accentStrong: styles.getPropertyValue('--accent-strong').trim() || '#23526f',
    border: styles.getPropertyValue('--border').trim() || '#e5e7eb'
  };
};

const buildColumnChart = ({
  categories,
  values,
  theme,
  name = 'Liquido'
}: {
  categories: string[];
  values: number[];
  theme: ReturnType<typeof getThemeTokens>;
  name?: string;
}): Highcharts.Options => ({
  chart: {
    type: 'column',
    backgroundColor: 'transparent',
    spacing: [8, 8, 0, 8],
    height: 250
  },
  title: { text: undefined },
  credits: { enabled: false },
  legend: { enabled: false },
  xAxis: {
    categories,
    lineColor: theme.border,
    labels: { style: { color: theme.muted, fontSize: '11px' } }
  },
  yAxis: {
    title: { text: undefined },
    gridLineColor: theme.border,
    labels: {
      style: { color: theme.muted, fontSize: '11px' },
      formatter() {
        return formatCompactCurrency(Number(this.value));
      }
    }
  },
  tooltip: {
    backgroundColor: theme.bg,
    borderColor: theme.border,
      style: { color: theme.text },
      pointFormatter() {
      return `<span>${this.category}: <b>${formatCompactCurrency(Number(this.y ?? 0))}</b></span>`;
      }
  },
  plotOptions: {
    column: {
      borderRadius: 10,
      borderWidth: 0,
      pointPadding: 0.12,
      groupPadding: 0.14
    }
  },
  series: [
    {
      type: 'column',
      name,
      colorByPoint: true,
      colors: [
        theme.accentStrong,
        theme.accent,
        `${theme.accentStrong}CC`,
        `${theme.accent}B3`,
        `${theme.accentStrong}99`
      ],
      data: values
    }
  ]
});

const buildBarChart = ({
  categories,
  firstSeries,
  secondSeries,
  theme,
  firstName,
  secondName
}: {
  categories: string[];
  firstSeries: number[];
  secondSeries?: number[];
  theme: ReturnType<typeof getThemeTokens>;
  firstName: string;
  secondName?: string;
}): Highcharts.Options => ({
  chart: {
    type: 'bar',
    backgroundColor: 'transparent',
    spacing: [8, 8, 0, 8],
    height: 260
  },
  title: { text: undefined },
  credits: { enabled: false },
  legend: { enabled: Boolean(secondSeries) },
  xAxis: {
    categories,
    lineColor: theme.border,
    labels: { style: { color: theme.muted, fontSize: '11px' } }
  },
  yAxis: {
    title: { text: undefined },
    gridLineColor: theme.border,
    labels: {
      style: { color: theme.muted, fontSize: '11px' },
      formatter() {
        return formatCompactCurrency(Number(this.value));
      }
    }
  },
  tooltip: {
    shared: true,
    backgroundColor: theme.bg,
    borderColor: theme.border,
    style: { color: theme.text },
    pointFormatter() {
      return `<span style="color:${this.color}">\u25cf</span> ${this.series.name}: <b>${formatCompactCurrency(Number(this.y ?? 0))}</b><br/>`;
    }
  },
  plotOptions: {
    bar: {
      borderRadius: 10,
      borderWidth: 0,
      pointPadding: 0.14,
      groupPadding: 0.16
    }
  },
  series: [
    {
      type: 'bar',
      name: firstName,
      color: theme.accentStrong,
      data: firstSeries
    },
    ...(secondSeries
      ? [
          {
            type: 'bar' as const,
            name: secondName ?? 'Serie 2',
            color: theme.accent,
            data: secondSeries
          }
        ]
      : [])
  ]
});

const buildPieChart = ({
  data,
  theme
}: {
  data: Array<{ name: string; y: number }>;
  theme: ReturnType<typeof getThemeTokens>;
}): Highcharts.Options => ({
  chart: {
    type: 'pie',
    backgroundColor: 'transparent',
    spacing: [8, 8, 0, 8],
    height: 290
  },
  title: { text: undefined },
  credits: { enabled: false },
  tooltip: {
    backgroundColor: theme.bg,
    borderColor: theme.border,
    style: { color: theme.text },
    pointFormatter() {
      return `<span>${this.name}: <b>${formatCompactCurrency(Number(this.y ?? 0))}</b></span>`;
    }
  },
  plotOptions: {
    pie: {
      innerSize: '52%',
      borderWidth: 0,
      dataLabels: {
        enabled: true,
        formatter() {
          return `${this.point.name}<br/>${formatCompactCurrency(Number(this.y ?? 0))}`;
        },
        style: {
          color: theme.text,
          fontSize: '11px',
          fontWeight: '600',
          textOutline: 'none'
        }
      }
    }
  },
  series: [
    {
      type: 'pie',
      name: 'Distribuicao',
      data,
      colors: [theme.accentStrong, theme.accent, `${theme.accentStrong}88`]
    }
  ]
});

const renderListRows = (
  items: Array<{ title: string; subtitle: string; value: string }>
) => (
  <div className="finance-dashboard-list">
    {items.map((item) => (
      <div key={`${item.title}-${item.subtitle}`} className="finance-dashboard-list-row">
        <div>
          <strong>{item.title}</strong>
          <span>{item.subtitle}</span>
        </div>
        <strong>{item.value}</strong>
      </div>
    ))}
  </div>
);

const paymentDotClass: Record<PaymentMethod, string> = {
  PIX: 'payment-dot-pix',
  DINHEIRO: 'payment-dot-cash',
  CARTAO: 'payment-dot-card',
  VOUCHER: 'payment-dot-voucher'
};

const FinanceMovementCalendar = ({
  title,
  month,
  movements,
  newEntryTo
}: {
  title: string;
  month: string;
  movements: Array<{ occurredAt: string; paymentMethod: PaymentMethod; netAmount?: number }>;
  newEntryTo: 'sales' | 'expenses';
}) => {
  const navigate = useNavigate();
  const monthDate = new Date(`${month.slice(0, 7)}-01T12:00:00`);
  const [compact, setCompact] = useState(false);
  const [selectedDate, setSelectedDate] = useState(month);
  const year = monthDate.getFullYear();
  const monthIndex = monthDate.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const totalDays = new Date(year, monthIndex + 1, 0).getDate();
  const movementsByDay = new Map<number, Set<PaymentMethod>>();

  movements.forEach((movement) => {
    const date = new Date(`${movement.occurredAt.slice(0, 10)}T12:00:00`);
    if (date.getFullYear() !== year || date.getMonth() !== monthIndex) return;
    const methods = movementsByDay.get(date.getDate()) ?? new Set<PaymentMethod>();
    methods.add(movement.paymentMethod);
    movementsByDay.set(date.getDate(), methods);
  });

  const cells = Array.from({ length: firstWeekday + totalDays }, (_, index) => index < firstWeekday ? null : ({ day: index - firstWeekday + 1, dateKey: `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(index - firstWeekday + 1).padStart(2, '0')}` } as CalendarCell));
  const visibleCells = compact ? buildWeekCells(selectedDate) : cells;
  const selectedMovements = movements.filter((item) => item.occurredAt.slice(0, 10) === selectedDate);
  const selectedTotal = selectedMovements.reduce((total, item) => total + Number(item.netAmount ?? 0), 0);
  const titleLabel = compact
    ? `${new Date(`${selectedDate}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} — ${new Date(`${selectedDate}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`
    : new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(monthDate);
  const shift = (direction: -1 | 1) => {
    const next = new Date(`${selectedDate}T12:00:00`);
    next.setDate(next.getDate() + direction * (compact ? 7 : 30));
    setSelectedDate(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`);
  };

  return (
    <article className="finance-dashboard-panel finance-movement-calendar">
      <DashboardCalendar compact={compact} title={titleLabel} cells={visibleCells} selectedDate={selectedDate} todayDate={todayDate} orderDates={new Set(movements.map((item) => item.occurredAt.slice(0, 10)))} onToggleCompact={() => setCompact((value) => !value)} onShift={shift} onSelectDate={setSelectedDate} renderDayMarker={(dateKey) => {
        const methods = Array.from(movementsByDay.get(Number(dateKey.slice(-2))) ?? []);
        return methods.length ? <span className="finance-movement-calendar-dots">{methods.map((method) => <i key={method} className={paymentDotClass[method]} />)}</span> : null;
      }} />
      <div className="finance-movement-calendar-legend">
        <span><i className="payment-dot-pix" /> Pix</span><span><i className="payment-dot-card" /> Cartão</span><span><i className="payment-dot-voucher" /> Voucher</span><span><i className="payment-dot-cash" /> Dinheiro</span>
      </div>
      <div className="finance-calendar-selection">
        <strong>{selectedMovements.length ? `${selectedMovements.length} lançamento(s): ${formatCurrency(selectedTotal)}` : 'Nenhum lançamento nesta data'}</strong>
        <button type="button" className="finance-dashboard-action-link primary" onClick={() => navigate(newEntryTo === 'sales' ? `/app/financeiro/vendas-manuais/novo?date=${selectedDate}` : `/app/financeiro/despesas/novo?date=${selectedDate}`)}>{newEntryTo === 'sales' ? 'Adicionar venda' : 'Adicionar despesa'}</button>
      </div>
    </article>
  );
};

export const FinanceDashboardPage = () => {
  const { user } = useAuth();
  const { from, to, setFrom, setTo } = useFinanceRange();
  const [activeDashboardTab, setActiveDashboardTab] = useState<DashboardTab>('overview');
  const [activeHomeTab, setActiveHomeTab] = useState<FinanceHomeTab>('dashboard');
  const [activeSalesChartTab, setActiveSalesChartTab] = useState<DetailChartTab>('general');
  const [activeExpensesChartTab, setActiveExpensesChartTab] = useState<DetailChartTab>('general');
  const [salesOriginFilter, setSalesOriginFilter] = useState<'ALL' | SaleOrigin>('ALL');
  const [salesMethodFilter, setSalesMethodFilter] = useState<'ALL' | PaymentMethod>('ALL');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<'ALL' | string>('ALL');
  const [expenseMethodFilter, setExpenseMethodFilter] = useState<'ALL' | PaymentMethod>('ALL');
  const [salesPage, setSalesPage] = useState(1);
  const [expensesPage, setExpensesPage] = useState(1);

  const dashboardQuery = useFinanceDashboard(user?.token, from, to);
  const salesQuery = useManualSales(user?.token, from, to);
  const expensesQuery = useExpenses(user?.token, from, to);

  if (!user?.modules?.includes('financeiro')) return <FinanceAccessBlocked />;

  const data = dashboardQuery.data;
  const theme = getThemeTokens();

  const formatRangeDate = (value: string) => {
    if (!value) return '--';
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(parsed);
  };

  const toLocalDateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  const setTodayRange = () => {
    setFrom(todayDate);
    setTo(todayDate);
  };

  const setLast7DaysRange = () => {
    const start = new Date();
    start.setDate(start.getDate() - 6);
    setFrom(toLocalDateKey(start));
    setTo(todayDate);
  };

  const setMonthRange = () => {
    setFrom(monthStart);
    setTo(todayDate);
  };

  const setCustomFrom = (date: string) => {
    setFrom(date);
    if (date > to) setTo(date);
  };

  const setCustomTo = (date: string) => {
    setTo(date);
    if (date < from) setFrom(date);
  };

  const activeRangePreset: RangePreset = useMemo(() => {
    if (from === todayDate && to === todayDate) return 'today';
    if (from === monthStart && to === todayDate) return 'month';
    const start = new Date();
    start.setDate(start.getDate() - 6);
    if (from === toLocalDateKey(start) && to === todayDate) return 'week';
    return 'custom';
  }, [from, to]);

  const headlineCards = [
    {
      label: 'Entradas no periodo',
      value: formatCurrency(data?.totals.totalEntries ?? 0),
      note: 'Pedidos do app + vendas avulsas'
    },
    {
      label: 'Saidas no periodo',
      value: formatCurrency(data?.totals.expensesNet ?? 0),
      note: 'Despesas liquidas registradas'
    },
    {
      label: 'Resultado do periodo',
      value: formatCurrency(data?.totals.netResult ?? 0),
      note: 'Entradas menos saidas'
    },
    {
      label: 'Pedidos do app',
      value: formatCurrency(data?.totals.ordersTotal ?? 0),
      note: `${data?.totals.ordersCount ?? 0} pedido(s) no periodo`
    }
  ];

  const flowChartOptions = useMemo<Highcharts.Options>(() => {
    const categories = (data?.chart ?? []).map((item) =>
      new Date(`${item.date}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    );

    return {
      chart: {
        type: 'areaspline',
        backgroundColor: 'transparent',
        spacing: [4, 8, 0, 8],
        height: 290
      },
      title: { text: undefined },
      credits: { enabled: false },
      legend: { enabled: false },
      xAxis: {
        categories,
        tickColor: theme.border,
        lineColor: theme.border,
        labels: { style: { color: theme.muted, fontSize: '11px' } }
      },
      yAxis: {
        title: { text: undefined },
        gridLineColor: theme.border,
        labels: {
          style: { color: theme.muted, fontSize: '11px' },
          formatter() {
            return formatCompactCurrency(Number(this.value));
          }
        }
      },
      tooltip: {
        shared: true,
        backgroundColor: theme.bg,
        borderColor: theme.border,
        style: { color: theme.text },
        pointFormatter() {
          return `<span style="color:${this.color}">\u25cf</span> ${this.series.name}: <b>${formatCompactCurrency(Number(this.y ?? 0))}</b><br/>`;
        }
      },
      plotOptions: {
        series: {
          marker: { enabled: false },
          states: { inactive: { opacity: 1 } }
        },
        areaspline: {
          fillOpacity: 0.18,
          lineWidth: 3
        }
      },
      series: [
        {
          type: 'areaspline',
          name: 'Entradas',
          color: theme.accentStrong,
          data: (data?.chart ?? []).map((item) => item.orders + item.manualSales)
        },
        {
          type: 'areaspline',
          name: 'Saidas',
          color: theme.accent,
          data: (data?.chart ?? []).map((item) => item.expenses)
        }
      ]
    };
  }, [data?.chart, theme.accent, theme.accentStrong, theme.bg, theme.border, theme.muted, theme.text]);

  const methodChartOptions = useMemo(
    () =>
      buildColumnChart({
        categories: (data?.salesByMethod ?? []).map((item) => methodLabels[item.method]),
        values: (data?.salesByMethod ?? []).map((item) => item.net),
        theme
      }),
    [data?.salesByMethod, theme]
  );

  const overviewChartOptions = useMemo(
    () =>
      buildPieChart({
        data: [
          { name: 'Pedidos do app', y: data?.totals.ordersTotal ?? 0 },
          { name: 'Vendas avulsas', y: data?.totals.manualSalesNet ?? 0 },
          { name: 'Despesas', y: data?.totals.expensesNet ?? 0 }
        ],
        theme
      }),
    [data?.totals.expensesNet, data?.totals.manualSalesNet, data?.totals.ordersTotal, theme]
  );

  const originChartOptions = useMemo(
    () =>
      buildBarChart({
        categories: (data?.salesByOrigin ?? []).map((item) => saleOriginLabels[item.origin]),
        firstSeries: (data?.salesByOrigin ?? []).map((item) => item.net),
        theme,
        firstName: 'Liquido'
      }),
    [data?.salesByOrigin, theme]
  );

  const filteredSales = useMemo(
    () => (salesQuery.data ?? []).filter((item) =>
      (salesOriginFilter === 'ALL' || item.tags.includes(salesOriginFilter)) &&
      (salesMethodFilter === 'ALL' || item.paymentMethod === salesMethodFilter)
    ),
    [salesMethodFilter, salesOriginFilter, salesQuery.data]
  );

  const filteredExpenses = useMemo(
    () => (expensesQuery.data ?? []).filter((item) =>
      (expenseCategoryFilter === 'ALL' || item.category === expenseCategoryFilter) &&
      (expenseMethodFilter === 'ALL' || item.paymentMethod === expenseMethodFilter)
    ),
    [expenseCategoryFilter, expenseMethodFilter, expensesQuery.data]
  );

  const salesTimelineChartData = useMemo(() => {
    const byDate = new Map<string, { total: number; PIX: number; DINHEIRO: number; CARTAO: number; VOUCHER: number }>();
    for (const item of filteredSales) {
      const date = String(item.occurredAt).slice(0, 10);
      const current = byDate.get(date) ?? { total: 0, PIX: 0, DINHEIRO: 0, CARTAO: 0, VOUCHER: 0 };
      current.total += Number(item.netAmount ?? 0);
      current[item.paymentMethod] += Number(item.netAmount ?? 0);
      byDate.set(date, current);
    }
    const dates = Array.from(byDate.keys()).sort((left, right) => left.localeCompare(right));
    return {
      dates,
      totals: dates.map((date) => byDate.get(date)?.total ?? 0),
      byMethod: (Object.keys(methodLabels) as Array<keyof typeof methodLabels>).map((method) => ({
        method,
        data: dates.map((date) => byDate.get(date)?.[method] ?? 0)
      }))
    };
  }, [filteredSales]);

  const expensesTimelineChartData = useMemo(() => {
    const byDate = new Map<string, { total: number; PIX: number; DINHEIRO: number; CARTAO: number; VOUCHER: number }>();
    for (const item of filteredExpenses) {
      const date = String(item.occurredAt).slice(0, 10);
      const current = byDate.get(date) ?? { total: 0, PIX: 0, DINHEIRO: 0, CARTAO: 0, VOUCHER: 0 };
      current.total += Number(item.netAmount ?? 0);
      current[item.paymentMethod] += Number(item.netAmount ?? 0);
      byDate.set(date, current);
    }
    const dates = Array.from(byDate.keys()).sort((left, right) => left.localeCompare(right));
    return {
      dates,
      totals: dates.map((date) => byDate.get(date)?.total ?? 0),
      byMethod: (Object.keys(methodLabels) as Array<keyof typeof methodLabels>).map((method) => ({
        method,
        data: dates.map((date) => byDate.get(date)?.[method] ?? 0)
      }))
    };
  }, [filteredExpenses]);

  const salesDailyChartOptions = useMemo<Highcharts.Options>(
    () =>
      buildColumnChart({
        categories: salesTimelineChartData.dates.map((date) =>
          new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
        ),
        values: salesTimelineChartData.totals,
        theme,
        name: 'Total do dia'
      }),
    [salesTimelineChartData.dates, salesTimelineChartData.totals, theme]
  );

  const salesByMethodDailyChartOptions = useMemo<Highcharts.Options>(
    () => ({
      chart: {
        type: 'column',
        backgroundColor: 'transparent',
        spacing: [8, 8, 0, 8],
        height: 290
      },
      title: { text: undefined },
      credits: { enabled: false },
      xAxis: {
        categories: salesTimelineChartData.dates.map((date) =>
          new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
        ),
        lineColor: theme.border,
        labels: { style: { color: theme.muted, fontSize: '11px' } }
      },
      yAxis: {
        title: { text: undefined },
        gridLineColor: theme.border,
        labels: {
          style: { color: theme.muted, fontSize: '11px' },
          formatter() {
            return formatCompactCurrency(Number(this.value));
          }
        }
      },
      tooltip: {
        shared: true,
        backgroundColor: theme.bg,
        borderColor: theme.border,
        style: { color: theme.text }
      },
      plotOptions: {
        column: {
          stacking: 'normal',
          borderRadius: 6,
          borderWidth: 0
        }
      },
      series: salesTimelineChartData.byMethod.map((entry) => ({
        type: 'column' as const,
        name: methodLabels[entry.method],
        data: entry.data
      }))
    }),
    [salesTimelineChartData.byMethod, salesTimelineChartData.dates, theme]
  );

  const expensesDailyChartOptions = useMemo<Highcharts.Options>(
    () =>
      buildColumnChart({
        categories: expensesTimelineChartData.dates.map((date) =>
          new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
        ),
        values: expensesTimelineChartData.totals,
        theme,
        name: 'Total do dia'
      }),
    [expensesTimelineChartData.dates, expensesTimelineChartData.totals, theme]
  );

  const expensesByMethodDailyChartOptions = useMemo<Highcharts.Options>(
    () => ({
      chart: {
        type: 'column',
        backgroundColor: 'transparent',
        spacing: [8, 8, 0, 8],
        height: 290
      },
      title: { text: undefined },
      credits: { enabled: false },
      xAxis: {
        categories: expensesTimelineChartData.dates.map((date) =>
          new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
        ),
        lineColor: theme.border,
        labels: { style: { color: theme.muted, fontSize: '11px' } }
      },
      yAxis: {
        title: { text: undefined },
        gridLineColor: theme.border,
        labels: {
          style: { color: theme.muted, fontSize: '11px' },
          formatter() {
            return formatCompactCurrency(Number(this.value));
          }
        }
      },
      tooltip: {
        shared: true,
        backgroundColor: theme.bg,
        borderColor: theme.border,
        style: { color: theme.text }
      },
      plotOptions: {
        column: {
          stacking: 'normal',
          borderRadius: 6,
          borderWidth: 0
        }
      },
      series: expensesTimelineChartData.byMethod.map((entry) => ({
        type: 'column' as const,
        name: methodLabels[entry.method],
        data: entry.data
      }))
    }),
    [expensesTimelineChartData.byMethod, expensesTimelineChartData.dates, theme]
  );

  const accountsChartOptions = useMemo(
    () =>
      buildColumnChart({
        categories: (data?.accountsByType ?? []).map((item) => accountTypeLabels[item.accountType]),
        values: (data?.accountsByType ?? []).map((item) => item.balanceAmount),
        theme,
        name: 'Saldo'
      }),
    [data?.accountsByType, theme]
  );

  const topOrigin = [...(data?.salesByOrigin ?? [])]
    .sort((a, b) => b.net - a.net)
    .find((item) => item.net > 0);

  const accountHighlights = [...(data?.accountsByType ?? [])]
    .sort((a, b) => b.balanceAmount - a.balanceAmount)
    .slice(0, 4)
    .map((item) => ({
      title: accountTypeLabels[item.accountType],
      subtitle: `${item.count} conta(s)`,
      value: formatCurrency(item.balanceAmount)
    }));

  const salesGrossTotal = filteredSales.reduce((total, item) => total + Number(item.amount ?? 0), 0);
  const salesNetTotal = filteredSales.reduce((total, item) => total + Number(item.netAmount ?? 0), 0);
  const expensesGrossTotal = filteredExpenses.reduce((total, item) => total + Number(item.amount ?? 0), 0);
  const expensesNetTotal = filteredExpenses.reduce((total, item) => total + Number(item.netAmount ?? 0), 0);
  const salesPageSize = 10;
  const expensesPageSize = 10;
  const visibleSales = filteredSales.slice((salesPage - 1) * salesPageSize, salesPage * salesPageSize);
  const visibleExpenses = filteredExpenses.slice((expensesPage - 1) * expensesPageSize, expensesPage * expensesPageSize);
  const salesTotalPages = Math.max(1, Math.ceil(filteredSales.length / salesPageSize));
  const expensesTotalPages = Math.max(1, Math.ceil(filteredExpenses.length / expensesPageSize));

  const deleteSale = async (id: string, description: string) => {
    if (!window.confirm(`Excluir a venda "${description}"?`)) return;
    await apiFetch(`/finance/manual-sales/${id}`, { method: 'DELETE', token: user?.token });
    await Promise.all([salesQuery.refetch(), dashboardQuery.refetch()]);
  };

  const deleteExpense = async (id: string, description: string) => {
    if (!window.confirm(`Excluir a despesa "${description}"?`)) return;
    await apiFetch(`/finance/expenses/${id}`, { method: 'DELETE', token: user?.token });
    await Promise.all([expensesQuery.refetch(), dashboardQuery.refetch()]);
  };

  const dashboardSummaryContent = (
    <>
      <div className="finance-dashboard-content-grid">
        <div className="finance-dashboard-main">
          <article className="finance-dashboard-panel finance-dashboard-chart-panel">
            <div className="finance-dashboard-tabs finance-dashboard-tabs-inner">
              {dashboardTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={activeDashboardTab === tab.id ? 'active' : ''}
                  onClick={() => setActiveDashboardTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeDashboardTab === 'overview' ? <HighchartsReact highcharts={Highcharts} options={overviewChartOptions} /> : null}
            {activeDashboardTab === 'cashflow' ? <HighchartsReact highcharts={Highcharts} options={flowChartOptions} /> : null}
            {activeDashboardTab === 'sources' ? <HighchartsReact highcharts={Highcharts} options={originChartOptions} /> : null}
          </article>

          <div className="finance-dashboard-duo-grid">
            <article className="finance-dashboard-panel">
              <div className="finance-dashboard-panel-head compact">
                <div>
                  <span className="finance-dashboard-section-label">Formas de pagamento</span>
                  <h3>Liquido por metodo</h3>
                </div>
              </div>
              <HighchartsReact highcharts={Highcharts} options={methodChartOptions} />
            </article>

            <article className="finance-dashboard-panel">
              <div className="finance-dashboard-panel-head compact">
                <div>
                  <span className="finance-dashboard-section-label">Leitura rapida</span>
                  <h3>Resumo executivo</h3>
                </div>
              </div>
              <div className="finance-dashboard-kpi-stack">
                <div className="finance-dashboard-inline-metric">
                  <span>Pedidos do app</span>
                  <strong>{formatCurrency(data?.totals.ordersTotal ?? 0)}</strong>
                </div>
                <div className="finance-dashboard-inline-metric">
                  <span>Vendas avulsas</span>
                  <strong>{formatCurrency(data?.totals.manualSalesNet ?? 0)}</strong>
                </div>
                <div className="finance-dashboard-inline-metric">
                  <span>Despesas</span>
                  <strong>{formatCurrency(data?.totals.expensesNet ?? 0)}</strong>
                </div>
                <div className="finance-dashboard-inline-metric">
                  <span>Taxas estimadas</span>
                  <strong>{formatCurrency(data?.totals.manualSalesFees ?? 0)}</strong>
                </div>
              </div>
            </article>
          </div>
        </div>

        <aside className="finance-dashboard-side">
        <article className="finance-dashboard-side-card accent">
          <span className="finance-dashboard-section-label">Melhor canal</span>
          <strong>{topOrigin ? saleOriginLabels[topOrigin.origin] : 'Sem dados'}</strong>
            <small>
              {topOrigin
                ? `${formatCurrency(topOrigin.net)} liquidos no periodo`
                : 'Ainda nao ha vendas suficientes no periodo selecionado'}
            </small>
        </article>

        <article className="finance-dashboard-side-card">
          <div className="finance-dashboard-list-head">
            <h4>Entradas por origem</h4>
            <Link to="/app/financeiro/vendas-manuais">Vendas avulsas</Link>
          </div>
          {renderListRows(
            [...(data?.salesByOrigin ?? [])]
              .sort((a, b) => b.net - a.net)
              .slice(0, 4)
              .map((item) => ({
                title: saleOriginLabels[item.origin],
                subtitle: `${item.count} venda(s)`,
                value: formatCurrency(item.net)
              }))
          )}
        </article>

          <article className="finance-dashboard-side-card">
            <div className="finance-dashboard-list-head">
              <h4>Despesas dominantes</h4>
              <Link to="/app/financeiro/despesas">Despesas</Link>
            </div>
            {renderListRows(
              [...(data?.expensesByCategory ?? [])]
                .sort((a, b) => b.amount - a.amount)
                .slice(0, 4)
                .map((item) => ({
                  title: expenseCategoryLabels[item.category],
                  subtitle: `${item.count} lancamento(s)`,
                  value: formatCurrency(item.amount)
                }))
            )}
          </article>
        </aside>
      </div>
    </>
  );

  const salesContent = (
    <>
      <article className="finance-dashboard-panel finance-analytics-filter-panel">
        <div className="finance-dashboard-panel-head compact">
          <div><span className="finance-dashboard-section-label">Filtros</span><h3>Vendas no período</h3></div>
        </div>
        <div className="finance-analytics-filter-row">
          <label>Origem
            <SelectField value={salesOriginFilter} onChange={(value) => setSalesOriginFilter(value as 'ALL' | SaleOrigin)} options={[{ value: 'ALL', label: 'Todas as origens' }, ...saleOriginKeys.map((origin) => ({ value: origin, label: saleOriginLabels[origin] }))]} />
          </label>
          <label>Pagamento
            <SelectField value={salesMethodFilter} onChange={(value) => setSalesMethodFilter(value as 'ALL' | PaymentMethod)} options={[{ value: 'ALL', label: 'Todos os pagamentos' }, ...(Object.keys(methodLabels) as PaymentMethod[]).map((method) => ({ value: method, label: methodLabels[method] }))]} />
          </label>
        </div>
        <div className="finance-analytics-kpis">
          <div><span>Total bruto filtrado</span><strong>{formatCurrency(salesGrossTotal)}</strong></div>
          <div><span>Total líquido filtrado</span><strong>{formatCurrency(salesNetTotal)}</strong></div>
          <div><span>Vendas encontradas</span><strong>{filteredSales.length}</strong></div>
        </div>
      </article>
      <article className="finance-dashboard-panel finance-dashboard-chart-panel finance-analytics-chart-full">
        <div className="finance-dashboard-tabs finance-dashboard-tabs-inner">
          {detailChartTabs.map((tab) => <button key={tab.id} type="button" className={activeSalesChartTab === tab.id ? 'active' : ''} onClick={() => setActiveSalesChartTab(tab.id)}>{tab.label}</button>)}
        </div>
        <div className="finance-dashboard-panel-head compact"><div><span className="finance-dashboard-section-label">{activeSalesChartTab === 'general' ? 'Visão geral' : 'Por tipo'}</span><h3>{activeSalesChartTab === 'general' ? 'Vendas por dia' : 'Pagamento por dia'}</h3></div></div>
        <HighchartsReact highcharts={Highcharts} options={activeSalesChartTab === 'general' ? salesDailyChartOptions : salesByMethodDailyChartOptions} />
      </article>
      <FinanceMovementCalendar title="Dias com registros de venda" month={to} movements={filteredSales} newEntryTo="sales" />
      <article className="finance-dashboard-panel finance-embedded-transactions">
        <div className="finance-dashboard-panel-head compact"><div><span className="finance-dashboard-section-label">Lançamentos</span><h3>Vendas registradas</h3></div></div>
        <div className="finance-dashboard-list">
          {visibleSales.map((item) => <div key={item.id} className="finance-dashboard-list-row"><div><strong>{item.description}</strong><span>{new Date(item.occurredAt).toLocaleString('pt-BR')} • {methodLabels[item.paymentMethod]}</span></div><div className="finance-embedded-actions"><strong>{formatCurrency(item.netAmount)}</strong><button type="button" className="icon-button" aria-label={`Editar venda ${item.description}`} onClick={() => navigate(`/app/financeiro/vendas-manuais/editar/${item.id}`)}><span className="material-symbols-outlined">edit</span></button><button type="button" className="icon-button" aria-label={`Excluir venda ${item.description}`} onClick={() => deleteSale(item.id, item.description)}><span className="material-symbols-outlined">delete</span></button></div></div>)}
          {filteredSales.length === 0 ? <span className="muted">Nenhuma venda encontrada para os filtros selecionados.</span> : null}
        </div>
        {salesTotalPages > 1 ? <div className="finance-pagination"><button type="button" className="ghost" disabled={salesPage === 1} onClick={() => setSalesPage((page) => page - 1)}>Anterior</button><span>Página {salesPage} de {salesTotalPages}</span><button type="button" className="ghost" disabled={salesPage === salesTotalPages} onClick={() => setSalesPage((page) => page + 1)}>Próxima</button></div> : null}
      </article>
    </>
  );

  const expensesContent = (
    <>
      <article className="finance-dashboard-panel finance-analytics-filter-panel">
        <div className="finance-dashboard-panel-head compact"><div><span className="finance-dashboard-section-label">Filtros</span><h3>Despesas no período</h3></div></div>
        <div className="finance-analytics-filter-row">
          <label>Categoria
            <SelectField value={expenseCategoryFilter} onChange={setExpenseCategoryFilter} options={[{ value: 'ALL', label: 'Todas as categorias' }, ...expenseCategoryKeys.map((category) => ({ value: category, label: expenseCategoryLabels[category] }))]} />
          </label>
          <label>Pagamento
            <SelectField value={expenseMethodFilter} onChange={(value) => setExpenseMethodFilter(value as 'ALL' | PaymentMethod)} options={[{ value: 'ALL', label: 'Todos os pagamentos' }, ...(Object.keys(methodLabels) as PaymentMethod[]).map((method) => ({ value: method, label: methodLabels[method] }))]} />
          </label>
        </div>
        <div className="finance-analytics-kpis">
          <div><span>Total bruto filtrado</span><strong>{formatCurrency(expensesGrossTotal)}</strong></div>
          <div><span>Total líquido filtrado</span><strong>{formatCurrency(expensesNetTotal)}</strong></div>
          <div><span>Despesas encontradas</span><strong>{filteredExpenses.length}</strong></div>
        </div>
      </article>
      <article className="finance-dashboard-panel finance-dashboard-chart-panel finance-analytics-chart-full">
        <div className="finance-dashboard-tabs finance-dashboard-tabs-inner">
          {detailChartTabs.map((tab) => <button key={tab.id} type="button" className={activeExpensesChartTab === tab.id ? 'active' : ''} onClick={() => setActiveExpensesChartTab(tab.id)}>{tab.label}</button>)}
        </div>
        <div className="finance-dashboard-panel-head compact"><div><span className="finance-dashboard-section-label">{activeExpensesChartTab === 'general' ? 'Visão geral' : 'Por tipo'}</span><h3>{activeExpensesChartTab === 'general' ? 'Despesas por dia' : 'Pagamento por dia'}</h3></div></div>
        <HighchartsReact highcharts={Highcharts} options={activeExpensesChartTab === 'general' ? expensesDailyChartOptions : expensesByMethodDailyChartOptions} />
      </article>
      <FinanceMovementCalendar title="Dias com lançamentos de despesa" month={to} movements={filteredExpenses} newEntryTo="expenses" />
      <article className="finance-dashboard-panel finance-embedded-transactions">
        <div className="finance-dashboard-panel-head compact"><div><span className="finance-dashboard-section-label">Lançamentos</span><h3>Despesas registradas</h3></div></div>
        <div className="finance-dashboard-list">
          {visibleExpenses.map((item) => <div key={item.id} className="finance-dashboard-list-row"><div><strong>{item.description}</strong><span>{new Date(item.occurredAt).toLocaleString('pt-BR')} • {expenseCategoryLabels[item.category]} • {methodLabels[item.paymentMethod]}</span></div><div className="finance-embedded-actions"><strong>{formatCurrency(item.netAmount)}</strong><button type="button" className="icon-button" aria-label={`Editar despesa ${item.description}`} onClick={() => navigate(`/app/financeiro/despesas/editar/${item.id}`)}><span className="material-symbols-outlined">edit</span></button><button type="button" className="icon-button" aria-label={`Excluir despesa ${item.description}`} onClick={() => deleteExpense(item.id, item.description)}><span className="material-symbols-outlined">delete</span></button></div></div>)}
          {filteredExpenses.length === 0 ? <span className="muted">Nenhuma despesa encontrada para os filtros selecionados.</span> : null}
        </div>
        {expensesTotalPages > 1 ? <div className="finance-pagination"><button type="button" className="ghost" disabled={expensesPage === 1} onClick={() => setExpensesPage((page) => page - 1)}>Anterior</button><span>Página {expensesPage} de {expensesTotalPages}</span><button type="button" className="ghost" disabled={expensesPage === expensesTotalPages} onClick={() => setExpensesPage((page) => page + 1)}>Próxima</button></div> : null}
      </article>
    </>
  );

  const accountsContent = (
    <>
      <div className="finance-dashboard-toolbar">
        <Link to="/app/financeiro/contas" className="finance-dashboard-action-link">Ver contas</Link>
        <Link to="/app/financeiro/contas/novo" className="finance-dashboard-action-link primary">Nova conta</Link>
      </div>
      <div className="finance-dashboard-content-grid">
        <div className="finance-dashboard-main">
          <article className="finance-dashboard-panel">
            <div className="finance-dashboard-panel-head compact">
              <div>
                <span className="finance-dashboard-section-label">Contas</span>
                <h3>Saldos por tipo de conta</h3>
              </div>
            </div>
            <HighchartsReact highcharts={Highcharts} options={accountsChartOptions} />
          </article>
        </div>

        <aside className="finance-dashboard-side">
          <article className="finance-dashboard-side-card">
            <div className="finance-dashboard-list-head">
              <h4>Contas organizadas</h4>
            </div>
            {renderListRows(accountHighlights)}
          </article>
        </aside>
      </div>
    </>
  );

  const ratesContent = (
    <div className="finance-dashboard-content-grid">
      <div className="finance-dashboard-main">
        <article className="finance-dashboard-panel">
          <div className="finance-dashboard-panel-head compact">
            <div>
              <span className="finance-dashboard-section-label">Taxas e regras</span>
              <h3>Ajuste por metodo de pagamento</h3>
            </div>
            <div className="finance-dashboard-action-row">
              <Link to="/app/financeiro/regras" className="finance-dashboard-action-link primary">Editar regras</Link>
            </div>
          </div>
          {renderListRows(
            (data?.methodRules ?? [])
              .map((item) => ({
                title: methodLabels[item.method],
                subtitle: modeLabels[item.mode],
                value: item.value ? formatCurrency(item.value) : 'Sem ajuste'
              }))
          )}
        </article>
      </div>
    </div>
  );

  const contentByHomeTab: Record<FinanceHomeTab, React.ReactNode> = {
    dashboard: dashboardSummaryContent,
    sales: salesContent,
    expenses: expensesContent,
    accounts: accountsContent,
    rates: ratesContent
  };

  return (
    <div className="page finance-page finance-dashboard-v2">
      <section className="finance-dashboard-shell">
        <header className="finance-board-header">
          <div>
            <span>Controle do caixa</span>
            <h1>Financeiro</h1>
            <small>Acompanhe entradas, despesas e o saldo do seu negócio.</small>
          </div>
          <div className="finance-board-actions">
            <Link to="/app/financeiro/vendas-manuais/novo" className="finance-board-secondary-action">
              <span className="material-symbols-outlined" aria-hidden="true">add</span>
              Nova venda avulsa
            </Link>
            <Link to="/app/financeiro/despesas/novo" className="finance-board-primary-action">
              <span className="material-symbols-outlined" aria-hidden="true">add</span>
              Nova despesa
            </Link>
          </div>
        </header>
        <div className="finance-dashboard-tabs finance-dashboard-tabs-primary">
          {financeHomeTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeHomeTab === tab.id ? 'active' : ''}
              onClick={() => setActiveHomeTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeHomeTab !== 'rates' ? (
          <div className={`finance-dashboard-hero ${activeHomeTab !== 'dashboard' ? 'finance-dashboard-hero-compact' : ''}`}>
            {activeHomeTab === 'dashboard' ? (
              <div className="finance-dashboard-balance-card">
                <span className="finance-dashboard-section-label">Entradas no periodo</span>
                <strong>{formatCurrency(data?.totals.totalEntries ?? 0)}</strong>
                <small>
                  {formatRangeDate(from)} ate {formatRangeDate(to)}
                </small>
              </div>
            ) : <div />}

            <div className="finance-dashboard-period">
              <div className="finance-dashboard-pill-row">
                <button type="button" className={activeRangePreset === 'today' ? 'active' : 'ghost'} onClick={setTodayRange}>Hoje</button>
                <button type="button" className={activeRangePreset === 'week' ? 'active' : 'ghost'} onClick={setLast7DaysRange}>7 dias</button>
                <button type="button" className={activeRangePreset === 'month' ? 'active' : 'ghost'} onClick={setMonthRange}>Mes</button>
              </div>

              <div className="finance-dashboard-date-card">
                <span>Escolha o periodo</span>
                <div className="finance-dashboard-date-fields">
                  <label>
                    <span>Data inicial</span>
                    <input type="date" value={from} onChange={(event) => setCustomFrom(event.target.value)} />
                  </label>
                  <label>
                    <span>Data final</span>
                    <input type="date" value={to} onChange={(event) => setCustomTo(event.target.value)} />
                  </label>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {activeHomeTab === 'dashboard' ? (
          <div className="finance-dashboard-headline-grid">
            {headlineCards.map((card) => (
              <article key={card.label} className="finance-dashboard-stat-card">
                <span>{card.label}</span>
                <strong>{card.value}</strong>
                <small>{card.note}</small>
              </article>
            ))}
          </div>
        ) : null}

        {contentByHomeTab[activeHomeTab]}
      </section>
    </div>
  );
};
