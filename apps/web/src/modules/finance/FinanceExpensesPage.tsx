import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';
import { apiFetch } from '../shared/api.ts';
import { ConfirmDialog } from '../shared/ConfirmDialog.tsx';
import { MoneyInput } from '../shared/MoneyInput.tsx';
import { SelectField } from '../shared/SelectField.tsx';
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
        <section className="finance-list-board">
          <header className="finance-list-board-header expense">
            <div>
              <span>Controle financeiro</span>
              <h1>Despesas</h1>
              <small>Registre e acompanhe todas as saídas do seu negócio.</small>
            </div>
            <button type="button" className="finance-list-new-button" onClick={() => navigate('/app/financeiro/despesas/novo')}>
              <span className="material-symbols-outlined" aria-hidden="true">add</span>
              Nova despesa
            </button>
          </header>
          <div className="finance-list-search">
            <span className="material-symbols-outlined" aria-hidden="true">search</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar despesa" aria-label="Buscar despesa" />
            {search ? <button type="button" onClick={() => setSearch('')} aria-label="Limpar busca"><span className="material-symbols-outlined" aria-hidden="true">close</span></button> : null}
          </div>
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
              <small className="finance-filter-count">{filtered.length} {filtered.length === 1 ? 'despesa encontrada' : 'despesas encontradas'}</small>
            </div>
          <div className="finance-transaction-list">
              {filtered.map((item) => (
                <article key={item.id} className="finance-transaction-card expense">
                  <span className="finance-transaction-icon material-symbols-outlined" aria-hidden="true">receipt_long</span>
                  <div className="finance-transaction-main">
                    <div className="finance-transaction-heading"><strong>{item.description}</strong></div>
                    <span className="finance-transaction-meta"><span className="material-symbols-outlined" aria-hidden="true">event</span>{new Date(item.occurredAt).toLocaleDateString('pt-BR')} <b>•</b> {methodLabels[item.paymentMethod]} <b>•</b> {expenseCategoryLabels[item.category]}{item.recurring ? ' • Recorrente' : ''}</span>
                    <div className="finance-transaction-value"><small>Saída líquida</small><strong>{formatCurrency(item.netAmount)}</strong></div>
                  </div>
                  <div className="finance-transaction-actions">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Editar despesa ${item.description}`}
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
                </article>
              ))}
              {filtered.length === 0 ? (
                <div className="finance-transaction-empty">
                  <span className="material-symbols-outlined" aria-hidden="true">receipt_long</span>
                  <div>
                    <strong>Nenhuma despesa encontrada</strong>
                    <span className="muted">Ajuste os filtros para ver outros resultados.</span>
                  </div>
                </div>
              ) : null}
          </div>
        </section>
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
