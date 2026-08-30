import { formatCurrency } from './dashboard-utils.ts';

type DashboardMetricsProps = {
  monthlySales: number;
  weekOrders: number;
  todayDeliveries: number;
  confirmedOrders: number;
  loading: boolean;
  hidden: boolean;
  onToggleVisibility: () => void;
};

export const DashboardMetrics = ({
  monthlySales,
  weekOrders,
  todayDeliveries,
  confirmedOrders,
  loading,
  hidden,
  onToggleVisibility
}: DashboardMetricsProps) => {
  const salesValue = loading ? 'Carregando...' : hidden ? 'R$ --,--' : formatCurrency(monthlySales);

  return (
    <div className="dashboard-metrics" aria-label="Resumo da empresa">
      <article className="dashboard-metric-card featured">
        <div className="dashboard-metric-heading">
          <span>Vendas no mês</span>
          <button type="button" onClick={onToggleVisibility} aria-label={hidden ? 'Exibir vendas' : 'Ocultar vendas'}>
            <span className="material-symbols-outlined" aria-hidden="true">{hidden ? 'visibility_off' : 'visibility'}</span>
          </button>
        </div>
        <strong>{salesValue}</strong>
        <small>Pedidos confirmados e concluídos</small>
      </article>
      <article className="dashboard-metric-card">
        <span>Pedidos da semana</span>
        <strong>{weekOrders}</strong>
        <small>Agenda da semana atual</small>
      </article>
      <article className="dashboard-metric-card">
        <span>Entregas hoje</span>
        <strong>{todayDeliveries}</strong>
        <small>Pedidos na data de hoje</small>
      </article>
      <article className="dashboard-metric-card">
        <span>Confirmados</span>
        <strong>{confirmedOrders}</strong>
        <small>Dentro da semana atual</small>
      </article>
    </div>
  );
};
