import { formatCurrency } from './dashboard-utils.ts';

type DashboardFinanceMetricsProps = {
  entries: number;
  expenses: number;
  result: number;
  appOrders: number;
  loading: boolean;
};

export const DashboardFinanceMetrics = ({
  entries,
  expenses,
  result,
  appOrders,
  loading
}: DashboardFinanceMetricsProps) => {
  const value = (amount: number) => (loading ? 'Carregando...' : formatCurrency(amount));

  return (
    <div className="dashboard-metrics dashboard-finance-metrics" aria-label="Resumo financeiro do mês">
      <article className="dashboard-metric-card featured">
        <span>Entradas no mês</span>
        <strong>{value(entries)}</strong>
        <small>Pedidos e vendas avulsas</small>
      </article>
      <article className="dashboard-metric-card">
        <span>Saídas</span>
        <strong>{value(expenses)}</strong>
        <small>Despesas registradas</small>
      </article>
      <article className="dashboard-metric-card">
        <span>Resultado do período</span>
        <strong>{value(result)}</strong>
        <small>Entradas menos saídas</small>
      </article>
      <article className="dashboard-metric-card">
        <span>Pedidos no app</span>
        <strong>{value(appOrders)}</strong>
        <small>Confirmados e concluídos</small>
      </article>
    </div>
  );
};
