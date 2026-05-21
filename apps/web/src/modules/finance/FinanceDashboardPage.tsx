import { useMemo, useRef, useState } from 'react';
import type React from 'react';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';
import { FinanceAccessBlocked } from './FinanceShared.tsx';
import {
  accountTypeLabels,
  expenseCategoryLabels,
  methodLabels,
  saleOriginLabels
} from './constants.ts';
import {
  useFinanceDashboard,
  useFinanceRange
} from './hooks.ts';
import { formatCurrency, monthStart, todayDate } from './utils.ts';

type DashboardTab = 'overview' | 'cashflow' | 'sources';

const dashboardTabs: Array<{ id: DashboardTab; label: string }> = [
  { id: 'overview', label: 'Visao geral' },
  { id: 'cashflow', label: 'Fluxo' },
  { id: 'sources', label: 'Origens' }
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

export const FinanceDashboardPage = () => {
  const { user } = useAuth();
  const { from, to, setFrom, setTo } = useFinanceRange();
  const fromPickerRef = useRef<HTMLInputElement | null>(null);
  const toPickerRef = useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');

  const dashboardQuery = useFinanceDashboard(user?.token, from, to);

  if (!user?.modules?.includes('financeiro')) return <FinanceAccessBlocked />;

  const data = dashboardQuery.data;
  const theme = getThemeTokens();

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

  const headlineCards = [
    {
      label: 'Saldo projetado',
      value: formatCurrency(data?.totals.projectedBalance ?? 0),
      note: 'Caixa atual + entradas - despesas'
    },
    {
      label: 'Resultado de caixa',
      value: formatCurrency(data?.totals.netResult ?? 0),
      note: 'Entradas liquidas do periodo'
    },
    {
      label: 'Lucro estimado',
      value: formatCurrency(data?.totals.estimatedNetProfit ?? 0),
      note: 'Pedidos + vendas avulsas - custos - despesas'
    },
    {
      label: 'Diferenca conferida',
      value:
        data?.totals.balanceDifference === null || data?.totals.balanceDifference === undefined
          ? '-'
          : formatCurrency(data.totals.balanceDifference),
      note: 'Comparacao com fechamento real'
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
        spacing: [12, 8, 8, 8],
        height: 300
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

  const methodChartOptions = useMemo<Highcharts.Options>(() => {
    return {
      chart: {
        type: 'column',
        backgroundColor: 'transparent',
        spacing: [12, 8, 8, 8],
        height: 280
      },
      title: { text: undefined },
      credits: { enabled: false },
      legend: { enabled: false },
      xAxis: {
        categories: (data?.salesByMethod ?? []).map((item) => methodLabels[item.method]),
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
          name: 'Liquido',
          colorByPoint: true,
          colors: [
            theme.accentStrong,
            theme.accent,
            `${theme.accentStrong}CC`,
            `${theme.accent}B3`
          ],
          data: (data?.salesByMethod ?? []).map((item) => item.net)
        }
      ]
    };
  }, [data?.salesByMethod, theme.accent, theme.accentStrong, theme.bg, theme.border, theme.muted, theme.text]);

  const originChartOptions = useMemo<Highcharts.Options>(() => {
    return {
      chart: {
        type: 'bar',
        backgroundColor: 'transparent',
        spacing: [12, 8, 8, 8],
        height: 280
      },
      title: { text: undefined },
      credits: { enabled: false },
      legend: { enabled: false },
      xAxis: {
        categories: (data?.salesByOrigin ?? []).map((item) => saleOriginLabels[item.origin]),
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
        shared: true
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
          name: 'Liquido',
          color: theme.accentStrong,
          data: (data?.salesByOrigin ?? []).map((item) => item.net)
        },
        {
          type: 'bar',
          name: 'Lucro estimado',
          color: theme.accent,
          data: (data?.salesByOrigin ?? []).map((item) => item.estimatedProfit)
        }
      ]
    };
  }, [data?.salesByOrigin, theme.accent, theme.accentStrong, theme.bg, theme.border, theme.muted, theme.text]);

  const accountHighlights = (data?.accountsByType ?? [])
    .filter((item) => item.balanceAmount > 0)
    .sort((a, b) => b.balanceAmount - a.balanceAmount)
    .slice(0, 4);

  const expenseHighlights = (data?.expensesByCategory ?? [])
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 4);

  const topOrigin = [...(data?.salesByOrigin ?? [])]
    .sort((a, b) => b.net - a.net)
    .find((item) => item.net > 0);

  return (
    <div className="page finance-page finance-dashboard-v2">
      <section className="finance-dashboard-shell">
        <div className="finance-dashboard-hero">
          <div className="finance-dashboard-greeting">
            <span className="finance-dashboard-eyebrow">Financeiro</span>
            <h2>Painel estrategico do caixa</h2>
            <p>
              A home agora fica focada em leitura: entradas, saidas, tendencia e origem do resultado
              sem misturar cadastro ou manutencao operacional.
            </p>
          </div>

          <div className="finance-dashboard-period">
            <div className="finance-dashboard-pill-row">
              <button type="button" className="ghost" onClick={setTodayRange}>Hoje</button>
              <button type="button" className="ghost" onClick={setLast7DaysRange}>7 dias</button>
              <button type="button" className="finance-pill-active" onClick={setMonthRange}>Mes</button>
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

        <div className="finance-dashboard-tabs">
          {dashboardTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? 'active' : ''}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="finance-dashboard-headline-grid">
          {headlineCards.map((card) => (
            <article key={card.label} className="finance-dashboard-stat-card">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.note}</small>
            </article>
          ))}
        </div>

        <div className="finance-dashboard-content-grid">
          <div className="finance-dashboard-main">
            <article className="finance-dashboard-panel finance-dashboard-chart-panel">
              <div className="finance-dashboard-panel-head">
                <div>
                  <span className="finance-dashboard-section-label">
                    {activeTab === 'overview' ? 'Movimento consolidado' : activeTab === 'cashflow' ? 'Fluxo diario' : 'Canais e formas'}
                  </span>
                  <h3>
                    {activeTab === 'overview' && 'Entradas e saidas no periodo'}
                    {activeTab === 'cashflow' && 'Ritmo do caixa ao longo dos dias'}
                    {activeTab === 'sources' && 'Onde o caixa esta performando melhor'}
                  </h3>
                </div>
                <span className="finance-dashboard-panel-value">
                  {formatCurrency(data?.totals.totalEntries ?? 0)}
                </span>
              </div>

              {activeTab === 'overview' ? (
                <HighchartsReact highcharts={Highcharts} options={flowChartOptions} />
              ) : null}
              {activeTab === 'cashflow' ? (
                <HighchartsReact highcharts={Highcharts} options={flowChartOptions} />
              ) : null}
              {activeTab === 'sources' ? (
                <HighchartsReact highcharts={Highcharts} options={originChartOptions} />
              ) : null}
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
                <h4>Saldos por tipo</h4>
                <Link to="/app/financeiro/contas">Contas</Link>
              </div>
              <div className="finance-dashboard-list">
                {accountHighlights.map((item) => (
                  <div key={item.accountType} className="finance-dashboard-list-row">
                    <div>
                      <strong>{accountTypeLabels[item.accountType]}</strong>
                      <span>{item.count} conta(s)</span>
                    </div>
                    <strong>{formatCurrency(item.balanceAmount)}</strong>
                  </div>
                ))}
              </div>
            </article>

            <article className="finance-dashboard-side-card">
              <div className="finance-dashboard-list-head">
                <h4>Despesas dominantes</h4>
                <Link to="/app/financeiro/despesas">Despesas</Link>
              </div>
              <div className="finance-dashboard-list">
                {expenseHighlights.map((item) => (
                  <div key={item.category} className="finance-dashboard-list-row">
                    <div>
                      <strong>{expenseCategoryLabels[item.category]}</strong>
                      <span>{item.count} lancamento(s)</span>
                    </div>
                    <strong>{formatCurrency(item.amount)}</strong>
                  </div>
                ))}
              </div>
            </article>

            <article className="finance-dashboard-side-card">
              <div className="finance-dashboard-list-head">
                <h4>Indicadores tecnicos</h4>
              </div>
              <div className="finance-dashboard-kpi-stack">
                <div className="finance-dashboard-inline-metric">
                  <span>Saldo base</span>
                  <strong>{formatCurrency(data?.totals.accountsBalance ?? 0)}</strong>
                </div>
                <div className="finance-dashboard-inline-metric">
                  <span>Despesas recorrentes</span>
                  <strong>{formatCurrency(data?.totals.recurringExpensesNet ?? 0)}</strong>
                </div>
                <div className="finance-dashboard-inline-metric">
                  <span>Custo vendas avulsas</span>
                  <strong>{formatCurrency(data?.totals.manualSalesEstimatedCost ?? 0)}</strong>
                </div>
                <div className="finance-dashboard-inline-metric">
                  <span>Custo pedidos</span>
                  <strong>{formatCurrency(data?.totals.ordersEstimatedCost ?? 0)}</strong>
                </div>
              </div>
            </article>
          </aside>
        </div>
      </section>
    </div>
  );
};
