import { useEffect, useRef, useState } from 'react';
import type React from 'react';
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
import type { Expense, ExpenseCategory, PaymentMethod } from './types.ts';

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
    return matchesSearch && matchesCategory;
  });

  const toggleExpenseReconciled = async (expense: Expense) => {
    await apiFetch(`/finance/expenses/${expense.id}/reconciled`, {
      method: 'PUT',
      token: user?.token,
      body: JSON.stringify({ reconciled: !expense.reconciled })
    });
    invalidateQueryCache(financeExpensesKey);
    invalidateQueryCache(financeDashboardKey);
    await expensesQuery.refetch();
  };

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
              <label className="finance-filter-field finance-filter-field-wide">
                <span>De</span>
                <input type="date" className="finance-date-input" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="finance-filter-field finance-filter-field-wide">
                <span>Ate</span>
                <input type="date" className="finance-date-input" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
              <label className="finance-filter-field finance-filter-field-wide">
                <span>Categoria</span>
                <SelectField
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                  options={expenseCategoryKeys.map((key) => ({ value: key, label: expenseCategoryLabels[key] }))}
                  placeholder="Todas"
                />
              </label>
            </div>
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
                    aria-label={item.reconciled ? 'Marcar despesa como nao conferida' : 'Marcar despesa como conferida'}
                    onClick={() => toggleExpenseReconciled(item)}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">{item.reconciled ? 'check_circle' : 'radio_button_unchecked'}</span>
                  </button>
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
