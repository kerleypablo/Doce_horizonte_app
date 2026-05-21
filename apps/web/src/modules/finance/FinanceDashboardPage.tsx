import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';
import { apiFetch } from '../shared/api.ts';
import { invalidateQueryCache } from '../shared/queryCache.ts';
import { FinanceAccessBlocked } from './FinanceShared.tsx';
import {
  financeDashboardKey,
  financeOriginCostRulesKey,
  accountTypeLabels,
  expenseCategoryLabels,
  methodLabels,
  saleOriginLabels
} from './constants.ts';
import {
  useExpenses,
  useFinanceDashboard,
  useFinanceOriginCostRules,
  useFinanceRange,
  useManualSales
} from './hooks.ts';
import { formatCurrency, monthStart, todayDate } from './utils.ts';
import type { OriginCostRule, SaleOrigin } from './types.ts';

type DashboardTab = 'overview' | 'cashflow' | 'sources';
type FinanceHomeTab = 'dashboard' | 'sales' | 'expenses' | 'setup' | 'costs';
type RangePreset = 'today' | 'week' | 'month' | 'custom';

const dashboardTabs: Array<{ id: DashboardTab; label: string }> = [
  { id: 'overview', label: 'Visao geral' },
  { id: 'cashflow', label: 'Fluxo' },
  { id: 'sources', label: 'Origens' }
];

const financeHomeTabs: Array<{ id: FinanceHomeTab; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'sales', label: 'Vendas' },
  { id: 'expenses', label: 'Despesas' },
  { id: 'setup', label: 'Cadastro' },
  { id: 'costs', label: 'Custos' }
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
        return formatCurrency(Number(this.value));
      }
    }
  },
  tooltip: {
    backgroundColor: theme.bg,
    borderColor: theme.border,
    style: { color: theme.text },
    pointFormatter() {
      return `<span>${this.category}: <b>${formatCurrency(Number(this.y ?? 0))}</b></span>`;
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
        return formatCurrency(Number(this.value));
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

export const FinanceDashboardPage = () => {
  const { user } = useAuth();
  const { from, to, setFrom, setTo } = useFinanceRange();
  const fromPickerRef = useRef<HTMLInputElement | null>(null);
  const toPickerRef = useRef<HTMLInputElement | null>(null);
  const [activeDashboardTab, setActiveDashboardTab] = useState<DashboardTab>('overview');
  const [activeHomeTab, setActiveHomeTab] = useState<FinanceHomeTab>('dashboard');

  const dashboardQuery = useFinanceDashboard(user?.token, from, to);
  const originCostRulesQuery = useFinanceOriginCostRules(user?.token);
  const salesQuery = useManualSales(user?.token, from, to);
  const expensesQuery = useExpenses(user?.token, from, to);
  const [originRules, setOriginRules] = useState<OriginCostRule[]>([]);
  const [originRulesSaving, setOriginRulesSaving] = useState(false);

  if (!user?.modules?.includes('financeiro')) return <FinanceAccessBlocked />;

  const data = dashboardQuery.data;
  const theme = getThemeTokens();

  useEffect(() => {
    if (originCostRulesQuery.data?.rules) {
      setOriginRules(originCostRulesQuery.data.rules);
    }
  }, [originCostRulesQuery.data]);

  const openPicker = (ref: React.RefObject<HTMLInputElement>) => {
    const input = ref.current;
    if (!input) return;
    const picker = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof picker.showPicker === 'function') {
      picker.showPicker();
      return;
    }
    input.click();
  };

  const formatRangeDate = (value: string) => {
    if (!value) return '--';
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(parsed);
  };

  const setTodayRange = () => {
    setFrom(todayDate);
    setTo(todayDate);
  };

  const setLast7DaysRange = () => {
    const start = new Date();
    start.setDate(start.getDate() - 6);
    const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    setFrom(startDate);
    setTo(todayDate);
  };

  const setMonthRange = () => {
    setFrom(monthStart);
    setTo(todayDate);
  };

  const activeRangePreset: RangePreset = useMemo(() => {
    if (from === todayDate && to === todayDate) return 'today';
    if (from === monthStart && to === todayDate) return 'month';
    const start = new Date();
    start.setDate(start.getDate() - 6);
    const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    if (from === startDate && to === todayDate) return 'week';
    return 'custom';
  }, [from, to]);

  const updateOriginRule = (origin: SaleOrigin, costPercent: number) => {
    setOriginRules((current) => {
      const map = new Map(current.map((item) => [item.origin, item.costPercent]));
      map.set(origin, costPercent);
      return Array.from(map.entries()).map(([itemOrigin, itemPercent]) => ({
        origin: itemOrigin as SaleOrigin,
        costPercent: itemPercent
      }));
    });
  };

  const saveOriginRules = async () => {
    setOriginRulesSaving(true);
    try {
      await apiFetch('/finance/origin-cost-rules', {
        method: 'PUT',
        token: user?.token,
        body: JSON.stringify({ rules: originRules })
      });
      invalidateQueryCache(financeOriginCostRulesKey);
      invalidateQueryCache(financeDashboardKey);
      await originCostRulesQuery.refetch();
      await dashboardQuery.refetch();
    } finally {
      setOriginRulesSaving(false);
    }
  };

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
            return formatCurrency(Number(this.value));
          }
        }
      },
      tooltip: {
        shared: true,
        backgroundColor: theme.bg,
        borderColor: theme.border,
        style: { color: theme.text },
        valuePrefix: 'R$ '
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

  const originChartOptions = useMemo(
    () =>
      buildBarChart({
        categories: (data?.salesByOrigin ?? []).map((item) => saleOriginLabels[item.origin]),
        firstSeries: (data?.salesByOrigin ?? []).map((item) => item.net),
        secondSeries: (data?.salesByOrigin ?? []).map((item) => item.estimatedProfit),
        theme,
        firstName: 'Liquido',
        secondName: 'Lucro estimado'
      }),
    [data?.salesByOrigin, theme]
  );

  const expenseChartOptions = useMemo(
    () =>
      buildColumnChart({
        categories: (data?.expensesByCategory ?? []).map((item) => expenseCategoryLabels[item.category]),
        values: (data?.expensesByCategory ?? []).map((item) => item.amount),
        theme,
        name: 'Despesas'
      }),
    [data?.expensesByCategory, theme]
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

  const salesHighlights = [...(salesQuery.data ?? [])]
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 4)
    .map((item) => ({
      title: item.description,
      subtitle: `${new Date(item.occurredAt).toLocaleDateString('pt-BR')} • ${methodLabels[item.paymentMethod]}`,
      value: formatCurrency(item.netAmount)
    }));

  const expenseHighlights = [...(expensesQuery.data ?? [])]
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 4)
    .map((item) => ({
      title: item.description,
      subtitle: `${expenseCategoryLabels[item.category]} • ${methodLabels[item.paymentMethod]}`,
      value: formatCurrency(item.netAmount)
    }));

  const accountHighlights = [...(data?.accountsByType ?? [])]
    .sort((a, b) => b.balanceAmount - a.balanceAmount)
    .slice(0, 4)
    .map((item) => ({
      title: accountTypeLabels[item.accountType],
      subtitle: `${item.count} conta(s)`,
      value: formatCurrency(item.balanceAmount)
    }));

  const topExpenseCategory = [...(data?.expensesByCategory ?? [])].sort((a, b) => b.amount - a.amount)[0];

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

            {activeDashboardTab === 'overview' ? <HighchartsReact highcharts={Highcharts} options={flowChartOptions} /> : null}
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
            <Link to="/app/financeiro/vendas-manuais">Vendas</Link>
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
    <div className="finance-dashboard-content-grid">
      <div className="finance-dashboard-main">
        <article className="finance-dashboard-panel">
          <div className="finance-dashboard-panel-head compact">
            <div>
              <span className="finance-dashboard-section-label">Performance</span>
              <h3>Origem e retorno das vendas</h3>
            </div>
            <div className="finance-dashboard-action-row">
              <Link to="/app/financeiro/vendas-manuais" className="finance-dashboard-action-link">Ver vendas</Link>
              <Link to="/app/financeiro/vendas-manuais/novo" className="finance-dashboard-action-link primary">Nova venda</Link>
            </div>
          </div>
          <HighchartsReact highcharts={Highcharts} options={originChartOptions} />
        </article>
      </div>

      <aside className="finance-dashboard-side">
        <article className="finance-dashboard-side-card">
          <div className="finance-dashboard-list-head">
            <h4>Ultimas vendas</h4>
          </div>
          {renderListRows(salesHighlights)}
        </article>

        <article className="finance-dashboard-side-card">
          <div className="finance-dashboard-list-head">
            <h4>Liquido por metodo</h4>
          </div>
          <HighchartsReact highcharts={Highcharts} options={methodChartOptions} />
        </article>
      </aside>
    </div>
  );

  const expensesContent = (
    <div className="finance-dashboard-content-grid">
      <div className="finance-dashboard-main">
        <article className="finance-dashboard-panel">
          <div className="finance-dashboard-panel-head compact">
            <div>
              <span className="finance-dashboard-section-label">Saidas</span>
              <h3>Despesas por categoria</h3>
            </div>
            <div className="finance-dashboard-action-row">
              <Link to="/app/financeiro/despesas" className="finance-dashboard-action-link">Ver despesas</Link>
              <Link to="/app/financeiro/despesas/novo" className="finance-dashboard-action-link primary">Nova despesa</Link>
            </div>
          </div>
          <HighchartsReact highcharts={Highcharts} options={expenseChartOptions} />
        </article>
      </div>

      <aside className="finance-dashboard-side">
        <article className="finance-dashboard-side-card">
          <div className="finance-dashboard-list-head">
            <h4>Ultimas despesas</h4>
          </div>
          {renderListRows(expenseHighlights)}
        </article>

        <article className="finance-dashboard-side-card">
          <div className="finance-dashboard-list-head">
            <h4>Pontos de atencao</h4>
          </div>
          <div className="finance-dashboard-kpi-stack">
            <div className="finance-dashboard-inline-metric">
              <span>Despesas no periodo</span>
              <strong>{formatCurrency(data?.totals.expensesNet ?? 0)}</strong>
            </div>
            <div className="finance-dashboard-inline-metric">
              <span>Maior categoria</span>
              <strong>
                {topExpenseCategory ? expenseCategoryLabels[topExpenseCategory.category] : 'Sem dados'}
              </strong>
            </div>
            <div className="finance-dashboard-inline-metric">
              <span>Recorrentes</span>
              <strong>
                {formatCurrency(data?.totals.recurringExpensesNet ?? 0)}
              </strong>
            </div>
          </div>
        </article>
      </aside>
    </div>
  );

  const setupContent = (
    <div className="finance-dashboard-content-grid">
      <div className="finance-dashboard-main">
        <article className="finance-dashboard-panel">
          <div className="finance-dashboard-panel-head compact">
            <div>
              <span className="finance-dashboard-section-label">Cadastros base</span>
              <h3>Saldos por tipo de conta</h3>
            </div>
            <div className="finance-dashboard-action-row">
              <Link to="/app/financeiro/contas" className="finance-dashboard-action-link">Contas</Link>
              <Link to="/app/financeiro/regras" className="finance-dashboard-action-link primary">Taxas e regras</Link>
            </div>
          </div>
          <HighchartsReact highcharts={Highcharts} options={accountsChartOptions} />
        </article>

        <article className="finance-dashboard-panel">
          <div className="finance-dashboard-panel-head compact">
            <div>
              <span className="finance-dashboard-section-label">Operacao das contas</span>
              <h3>Onde controlar saldo e ajustes</h3>
            </div>
          </div>
          <div className="finance-dashboard-notes">
            <p>O dashboard principal nao usa mais saldo bancario como destaque. Aqui ficam apenas os atalhos para a base do financeiro.</p>
            <p>Use a tela de contas para acompanhar saldo conferido por dia, editar a base de cada conta e lancar ajustes de entrada ou saida.</p>
            <p>Os ajustes lancados em contas entram como movimentacao real e aparecem nas telas de vendas ou despesas, alem do resultado do dashboard.</p>
          </div>
        </article>
      </div>

      <aside className="finance-dashboard-side">
        <article className="finance-dashboard-side-card">
          <div className="finance-dashboard-list-head">
            <h4>Contas organizadas</h4>
          </div>
          {renderListRows(accountHighlights)}
        </article>

        <article className="finance-dashboard-side-card">
          <div className="finance-dashboard-list-head">
            <h4>O que entra em cadastro</h4>
          </div>
          <div className="finance-dashboard-kpi-stack">
            <div className="finance-dashboard-inline-metric">
              <span>Contas bancarias e caixa</span>
              <strong>Contas</strong>
            </div>
            <div className="finance-dashboard-inline-metric">
              <span>Taxas por metodo</span>
              <strong>Regras</strong>
            </div>
            <div className="finance-dashboard-inline-metric">
              <span>Historico de saldo por dia</span>
              <strong>Contas</strong>
            </div>
            <div className="finance-dashboard-inline-metric">
              <span>Ajustes de entrada e saida</span>
              <strong>Movimentacao</strong>
            </div>
          </div>
        </article>
      </aside>
    </div>
  );

  const costsContent = (
    <div className="finance-dashboard-content-grid">
      <div className="finance-dashboard-main">
        <article className="finance-dashboard-panel">
          <div className="finance-dashboard-panel-head compact">
            <div>
              <span className="finance-dashboard-section-label">Custos por origem</span>
              <h3>Percentual medio usado no lucro estimado</h3>
            </div>
            <div className="finance-dashboard-action-row">
              <button type="button" className="finance-dashboard-action-link primary" onClick={saveOriginRules} disabled={originRulesSaving}>
                {originRulesSaving ? 'Salvando...' : 'Salvar custos'}
              </button>
            </div>
          </div>
          <HighchartsReact
            highcharts={Highcharts}
            options={buildColumnChart({
              categories: originRules.map((item) => saleOriginLabels[item.origin]),
              values: originRules.map((item) => item.costPercent),
              theme,
              name: 'Custo %'
            })}
          />
        </article>

        <article className="finance-dashboard-panel">
          <div className="finance-dashboard-panel-head compact">
            <div>
              <span className="finance-dashboard-section-label">Edicao</span>
              <h3>Ajuste por canal de venda</h3>
            </div>
          </div>
          <div className="finance-dashboard-cost-grid">
            {originRules.map((rule) => (
              <label key={rule.origin}>
                <span>{saleOriginLabels[rule.origin]}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={rule.costPercent}
                  onChange={(event) => updateOriginRule(rule.origin, Number(event.target.value || 0))}
                />
              </label>
            ))}
          </div>
        </article>
      </div>

      <aside className="finance-dashboard-side">
        <article className="finance-dashboard-side-card">
          <div className="finance-dashboard-list-head">
            <h4>O que essa aba faz</h4>
          </div>
          <div className="finance-dashboard-kpi-stack">
            <div className="finance-dashboard-inline-metric">
              <span>Balcao / rua / iFood etc.</span>
              <strong>Canal</strong>
            </div>
            <div className="finance-dashboard-inline-metric">
              <span>Percentual medio de custo</span>
              <strong>Regra</strong>
            </div>
            <div className="finance-dashboard-inline-metric">
              <span>Impacta lucro estimado</span>
              <strong>Dashboard</strong>
            </div>
          </div>
        </article>

        <article className="finance-dashboard-side-card">
          <div className="finance-dashboard-list-head">
            <h4>Como usar</h4>
          </div>
          <div className="finance-dashboard-notes">
            <p>Se vendas de iFood costumam ter custo maior, aumente esse percentual.</p>
            <p>Se balcao tem margem melhor, reduza o custo medio dessa origem.</p>
            <p>Isso nao muda caixa nem despesa real. Muda apenas o lucro estimado exibido.</p>
          </div>
        </article>
      </aside>
    </div>
  );

  const contentByHomeTab: Record<FinanceHomeTab, React.ReactNode> = {
    dashboard: dashboardSummaryContent,
    sales: salesContent,
    expenses: expensesContent,
    setup: setupContent,
    costs: costsContent
  };

  return (
    <div className="page finance-page finance-dashboard-v2">
      <section className="finance-dashboard-shell">
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
              <span>Periodo analisado</span>
              <div className="finance-range-display">
                <button type="button" className="finance-range-date-button" onClick={() => openPicker(fromPickerRef)}>
                  {formatRangeDate(from)}
                </button>
                <span className="finance-range-divider">-</span>
                <button type="button" className="finance-range-date-button" onClick={() => openPicker(toPickerRef)}>
                  {formatRangeDate(to)}
                </button>
              </div>
              <input ref={fromPickerRef} className="finance-date-hidden" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
              <input ref={toPickerRef} className="finance-date-hidden" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </div>
          </div>
        </div>

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
