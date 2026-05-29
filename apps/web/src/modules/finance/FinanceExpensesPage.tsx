import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';
import { apiFetch } from '../shared/api.ts';
import { ConfirmDialog } from '../shared/ConfirmDialog.tsx';
import { MoneyInput } from '../shared/MoneyInput.tsx';
import { SelectField } from '../shared/SelectField.tsx';
import { ListToolbar } from '../shared/ListToolbar.tsx';
import { invalidateQueryCache } from '../shared/queryCache.ts';
import { FinanceAccessBlocked, FinanceHeader } from './FinanceShared.tsx';
import {
  expenseCategoryKeys,
  expenseCategoryLabels,
  financeDashboardKey,
  financeExpensesKey,
  methodLabels
} from './constants.ts';
import { useExpenses, useFinanceAccounts, useFinanceRange } from './hooks.ts';
import { formatCurrency, todayDate } from './utils.ts';
import type { ExpenseCategory, PaymentMethod } from './types.ts';

const getThemeTokens = () => {
  if (typeof window === 'undefined') {
    return {
      bg: '#ffffff',
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
    text: styles.getPropertyValue('--text').trim() || '#1f2937',
    muted: styles.getPropertyValue('--muted').trim() || '#6b7280',
    accent: styles.getPropertyValue('--accent').trim() || '#3f7ea2',
    accentStrong: styles.getPropertyValue('--accent-strong').trim() || '#23526f',
    border: styles.getPropertyValue('--border').trim() || '#e5e7eb'
  };
};

export const FinanceExpensesPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const params = useParams<{ expenseId?: string }>();
  const isCreateView = pathname.endsWith('/novo');
  const editingRouteId = pathname.includes('/editar/') ? params.expenseId ?? null : null;
  const { from, to, setFrom, setTo } = useFinanceRange();
  const expensesQuery = useExpenses(user?.token, from, to);
  const accountsQuery = useFinanceAccounts(user?.token);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(editingRouteId);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState<'ALL' | PaymentMethod>('ALL');
  const [showForm, setShowForm] = useState(Boolean(isCreateView || editingRouteId));
  const [deletingExpense, setDeletingExpense] = useState<{ id: string; description: string } | null>(null);
  const initializedRouteRef = useRef<string | null>(null);
  const [form, setForm] = useState({
    accountId: '',
    occurredAt: `${todayDate}T09:00`,
    description: '',
    category: 'OUTROS' as ExpenseCategory,
    paymentMethod: 'PIX' as PaymentMethod,
    amount: 0,
    recurring: false,
    notes: ''
  });

  if (!user?.modules?.includes('financeiro')) return <FinanceAccessBlocked />;

  useEffect(() => {
    const routeKey = isCreateView ? 'create' : editingRouteId ? `edit:${editingRouteId}` : 'list';
    if (initializedRouteRef.current === routeKey) return;

    if (isCreateView) {
      initializedRouteRef.current = routeKey;
      setEditingId(null);
      setShowForm(true);
      setForm({
        accountId: '',
        occurredAt: `${todayDate}T09:00`,
        description: '',
        category: 'OUTROS',
        paymentMethod: 'PIX',
        amount: 0,
        recurring: false,
        notes: ''
      });
      return;
    }
    if (editingRouteId) {
      const current = (expensesQuery.data ?? []).find((item) => item.id === editingRouteId);
      if (!current) return;
      initializedRouteRef.current = routeKey;
      setEditingId(current.id);
      setShowForm(true);
      setForm({
        accountId: current.accountId ?? '',
        occurredAt: current.occurredAt.slice(0, 16),
        description: current.description,
        category: current.category ?? 'OUTROS',
        paymentMethod: current.paymentMethod,
        amount: current.amount,
        recurring: current.recurring ?? false,
        notes: current.notes ?? ''
      });
      return;
    }
    initializedRouteRef.current = routeKey;
    setEditingId(null);
    setShowForm(false);
  }, [isCreateView, editingRouteId, expensesQuery.data]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await apiFetch(editingId ? `/finance/expenses/${editingId}` : '/finance/expenses', {
        method: editingId ? 'PUT' : 'POST',
        token: user?.token,
        body: JSON.stringify({
          ...form,
          accountId: form.accountId || undefined,
          occurredAt: new Date(form.occurredAt).toISOString()
        })
      });
      invalidateQueryCache(financeExpensesKey);
      invalidateQueryCache(financeDashboardKey);
      await expensesQuery.refetch();
      setEditingId(null);
      setForm({ accountId: '', occurredAt: `${todayDate}T09:00`, description: '', category: 'OUTROS', paymentMethod: 'PIX', amount: 0, recurring: false, notes: '' });
      setShowForm(false);
      navigate('/app/financeiro/despesas');
    } finally {
      setSaving(false);
    }
  };

  const filtered = (expensesQuery.data ?? []).filter((item) => {
    const matchesSearch = `${item.description} ${expenseCategoryLabels[item.category] ?? ''}`.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !categoryFilter || item.category === categoryFilter;
    const matchesMethod = methodFilter === 'ALL' || item.paymentMethod === methodFilter;
    return matchesSearch && matchesCategory && matchesMethod;
  });
  const filteredGrossTotal = useMemo(
    () => filtered.reduce((sum, item) => sum + Number(item.amount ?? 0), 0),
    [filtered]
  );
  const filteredNetTotal = useMemo(
    () => filtered.reduce((sum, item) => sum + Number(item.netAmount ?? 0), 0),
    [filtered]
  );
  const expensesChartData = useMemo(() => {
    const byDate = new Map<string, { total: number } & Record<PaymentMethod, number>>();
    for (const item of filtered) {
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
      byMethod: (Object.keys(methodLabels) as PaymentMethod[]).map((method) => ({
        method,
        data: dates.map((date) => byDate.get(date)?.[method] ?? 0)
      }))
    };
  }, [filtered]);
  const theme = getThemeTokens();
  const expensesDailyChartOptions = useMemo<Highcharts.Options>(() => ({
    chart: {
      type: 'column',
      backgroundColor: 'transparent',
      height: 280
    },
    title: { text: undefined },
    credits: { enabled: false },
    legend: { enabled: false },
    xAxis: {
      categories: expensesChartData.dates.map((date) => new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })),
      lineColor: theme.border,
      labels: { style: { color: theme.muted, fontSize: '11px' } }
    },
    yAxis: {
      title: { text: undefined },
      gridLineColor: theme.border,
      labels: {
        style: { color: theme.muted, fontSize: '11px' },
        formatter() { return formatCurrency(Number(this.value)); }
      }
    },
    tooltip: {
      backgroundColor: theme.bg,
      borderColor: theme.border,
      style: { color: theme.text },
      pointFormatter() { return `<span>${formatCurrency(Number(this.y ?? 0))}</span>`; }
    },
    series: [{
      type: 'column',
      name: 'Total do dia',
      color: theme.accentStrong,
      data: expensesChartData.totals
    }]
  }), [expensesChartData.dates, expensesChartData.totals, theme.accentStrong, theme.bg, theme.border, theme.muted, theme.text]);

  const expensesByMethodChartOptions = useMemo<Highcharts.Options>(() => ({
    chart: {
      type: 'column',
      backgroundColor: 'transparent',
      height: 320
    },
    title: { text: undefined },
    credits: { enabled: false },
    xAxis: {
      categories: expensesChartData.dates.map((date) => new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })),
      lineColor: theme.border,
      labels: { style: { color: theme.muted, fontSize: '11px' } }
    },
    yAxis: {
      title: { text: undefined },
      gridLineColor: theme.border,
      labels: {
        style: { color: theme.muted, fontSize: '11px' },
        formatter() { return formatCurrency(Number(this.value)); }
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
        borderRadius: 4
      }
    },
    series: expensesChartData.byMethod.map((entry) => ({
      type: 'column',
      name: methodLabels[entry.method],
      data: entry.data
    }))
  }), [expensesChartData.byMethod, expensesChartData.dates, theme.bg, theme.border, theme.muted, theme.text]);

  const confirmDeleteExpense = async () => {
    if (!deletingExpense) return;
    await apiFetch(`/finance/expenses/${deletingExpense.id}`, {
      method: 'DELETE',
      token: user?.token
    });
    invalidateQueryCache(financeExpensesKey);
    invalidateQueryCache(financeDashboardKey);
    await expensesQuery.refetch();
    setDeletingExpense(null);
  };

  return (
    <div className="page">
      {showForm ? (
        <div className="panel">
          <FinanceHeader title={editingId ? 'Editar despesa' : 'Nova despesa'} backTo="/app/financeiro/despesas" />
          <form className="form" onSubmit={submit}>
            <div className="grid-2">
              <label>
                Conta
                <SelectField
                  value={form.accountId}
                  onChange={(value) => setForm({ ...form, accountId: value })}
                  options={(accountsQuery.data ?? []).map((item) => ({ value: item.id, label: item.name }))}
                  placeholder="Sem conta"
                />
              </label>
              <label>
                Data/hora
                <input type="datetime-local" value={form.occurredAt} onChange={(e) => setForm({ ...form, occurredAt: e.target.value })} />
              </label>
            </div>
            <div className="grid-3">
              <label>Descricao<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required /></label>
              <label>
                Categoria
                <SelectField
                  value={form.category}
                  onChange={(value) => setForm({ ...form, category: value as ExpenseCategory })}
                  options={expenseCategoryKeys.map((key) => ({ value: key, label: expenseCategoryLabels[key] }))}
                />
              </label>
              <label>Valor<MoneyInput value={form.amount} onChange={(value) => setForm({ ...form, amount: value })} /></label>
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.recurring}
                onChange={(event) => setForm({ ...form, recurring: event.target.checked })}
              />
              Despesa recorrente do mes
            </label>
            <label>
              Metodo
              <SelectField
                value={form.paymentMethod}
                onChange={(value) => setForm({ ...form, paymentMethod: value as PaymentMethod })}
                options={(Object.keys(methodLabels) as PaymentMethod[]).map((key) => ({ value: key, label: methodLabels[key] }))}
              />
            </label>
            <label>Observacoes<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
            <div className="actions">
              <button type="button" className="ghost" onClick={() => navigate('/app/financeiro/despesas')}>Cancelar</button>
              <button type="submit" disabled={saving}>{saving ? 'Salvando...' : editingId ? 'Salvar despesa' : 'Cadastrar despesa'}</button>
            </div>
          </form>
        </div>
      ) : null}

      {!isCreateView && !editingRouteId ? (
        <>
          <div className="panel finance-filter-panel">
            <FinanceHeader title="Despesas" backTo="/app/financeiro" />
            <ListToolbar
              title=""
              searchValue={search}
              onSearch={setSearch}
              actionLabel="Nova despesa"
              onAction={() => navigate('/app/financeiro/despesas/novo')}
            />
            <div className="finance-filter-grid">
              <div className="finance-filter-date-group finance-filter-field-wide">
                <label className="finance-filter-field finance-filter-field-date">
                  <span>De</span>
                  <input type="date" className="finance-date-input" value={from} onChange={(e) => setFrom(e.target.value)} />
                </label>
                <label className="finance-filter-field finance-filter-field-date">
                  <span>Ate</span>
                  <input type="date" className="finance-date-input" value={to} onChange={(e) => setTo(e.target.value)} />
                </label>
              </div>
              <label className="finance-filter-field finance-filter-field-wide">
                <span>Categoria</span>
                <SelectField
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                  options={expenseCategoryKeys.map((key) => ({ value: key, label: expenseCategoryLabels[key] }))}
                  placeholder="Todas"
                />
              </label>
              <label className="finance-filter-field finance-filter-field-wide">
                <span>Metodo</span>
                <SelectField
                  value={methodFilter}
                  onChange={(value) => setMethodFilter(value as 'ALL' | PaymentMethod)}
                  options={[
                    { value: 'ALL', label: 'Todos' },
                    ...((Object.keys(methodLabels) as PaymentMethod[]).map((key) => ({ value: key, label: methodLabels[key] })))
                  ]}
                />
              </label>
            </div>
            <div className="finance-filter-summary">
              <div>
                <span>Total bruto filtrado</span>
                <strong>{formatCurrency(filteredGrossTotal)}</strong>
              </div>
              <div>
                <span>Total liquido filtrado</span>
                <strong>{formatCurrency(filteredNetTotal)}</strong>
              </div>
              <div>
                <span>Despesas encontradas</span>
                <strong>{filtered.length}</strong>
              </div>
            </div>
            {filtered.length > 0 ? (
              <div className="finance-chart-grid">
                <article className="finance-chart-card">
                  <div className="finance-chart-head">
                    <h4>Total de despesas por dia</h4>
                  </div>
                  <HighchartsReact highcharts={Highcharts} options={expensesDailyChartOptions} />
                </article>
                <article className="finance-chart-card">
                  <div className="finance-chart-head">
                    <h4>Despesas por tipo e por dia</h4>
                  </div>
                  <HighchartsReact highcharts={Highcharts} options={expensesByMethodChartOptions} />
                </article>
              </div>
            ) : null}
          </div>

          <div className="panel">
            <div className="table">
              {filtered.map((item) => (
                <div key={item.id} className="list-row">
                  <div>
                    <strong>{item.description}</strong>
                    <span className="muted">
                      {new Date(item.occurredAt).toLocaleString('pt-BR')} • {expenseCategoryLabels[item.category]} • {methodLabels[item.paymentMethod]} • {formatCurrency(item.netAmount)}
                    </span>
                    {item.recurring ? <span className="finance-list-tags">Recorrente</span> : null}
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => navigate(`/app/financeiro/despesas/editar/${item.id}`)}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">edit</span>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Excluir despesa"
                    onClick={() => setDeletingExpense({ id: item.id, description: item.description })}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                  </button>
                </div>
              ))}
              {filtered.length === 0 ? (
                <div className="list-row">
                  <div>
                    <strong>Nenhuma despesa encontrada</strong>
                    <span className="muted">Ajuste os filtros para ver outros resultados.</span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      <ConfirmDialog
        open={Boolean(deletingExpense)}
        title="Excluir despesa"
        message={deletingExpense ? `Deseja excluir a despesa "${deletingExpense.description}"?` : ''}
        confirmLabel="Excluir"
        onConfirm={confirmDeleteExpense}
        onCancel={() => setDeletingExpense(null)}
      />
    </div>
  );
};
