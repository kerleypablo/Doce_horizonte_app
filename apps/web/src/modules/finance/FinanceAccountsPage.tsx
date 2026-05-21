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
  accountTypeKeys,
  accountTypeLabels,
  expenseCategoryKeys,
  expenseCategoryLabels,
  financeAccountsKey,
  financeAccountsSummaryKey,
  financeDashboardKey,
  financeExpensesKey,
  financeManualSalesKey,
  methodLabels
} from './constants.ts';
import { useFinanceAccounts, useFinanceAccountsSummary, useFinanceRange } from './hooks.ts';
import { formatCurrency, monthStart, todayDate } from './utils.ts';
import type { AccountType, ExpenseCategory, FinanceAccount, PaymentMethod } from './types.ts';

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

type AdjustmentKind = 'ENTRY' | 'EXIT';

const paymentMethodOptions: PaymentMethod[] = ['PIX', 'DINHEIRO', 'CARTAO', 'VOUCHER'];

export const FinanceAccountsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const params = useParams<{ accountId?: string }>();
  const isCreateView = pathname.endsWith('/novo');
  const editingRouteId = pathname.includes('/editar/') ? params.accountId ?? null : null;
  const accountsQuery = useFinanceAccounts(user?.token);
  const { from, to, setFrom, setTo } = useFinanceRange();
  const accountsSummaryQuery = useFinanceAccountsSummary(user?.token, from, to);
  const [editingId, setEditingId] = useState<string | null>(editingRouteId);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(Boolean(isCreateView || editingRouteId));
  const [saving, setSaving] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState<{ id: string; name: string } | null>(null);
  const [adjustingAccount, setAdjustingAccount] = useState<FinanceAccount | null>(null);
  const [adjustmentSaving, setAdjustmentSaving] = useState(false);
  const initializedRouteRef = useRef<string | null>(null);
  const fromPickerRef = useRef<HTMLInputElement | null>(null);
  const toPickerRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState({
    name: '',
    accountType: 'BANK' as AccountType,
    institution: '',
    balanceDate: todayDate,
    balanceAmount: 0,
    notes: ''
  });
  const [adjustmentForm, setAdjustmentForm] = useState({
    kind: 'EXIT' as AdjustmentKind,
    occurredAt: `${todayDate}T12:00`,
    paymentMethod: 'PIX' as PaymentMethod,
    amount: 0,
    description: 'Ajuste de saldo',
    category: 'OUTROS' as ExpenseCategory,
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
      setForm({ name: '', accountType: 'BANK', institution: '', balanceDate: todayDate, balanceAmount: 0, notes: '' });
      return;
    }
    if (editingRouteId) {
      const current = (accountsQuery.data ?? []).find((item) => item.id === editingRouteId);
      if (!current) return;
      initializedRouteRef.current = routeKey;
      setEditingId(current.id);
      setShowForm(true);
      setForm({
        name: current.name,
        accountType: current.accountType ?? 'BANK',
        institution: current.institution ?? '',
        balanceDate: current.balanceDate,
        balanceAmount: current.balanceAmount,
        notes: current.notes ?? ''
      });
      return;
    }
    initializedRouteRef.current = routeKey;
    setEditingId(null);
    setShowForm(false);
  }, [isCreateView, editingRouteId, accountsQuery.data]);

  const resetForm = () => {
    setEditingId(null);
    setForm({ name: '', accountType: 'BANK', institution: '', balanceDate: todayDate, balanceAmount: 0, notes: '' });
  };

  const resetAdjustmentForm = (account?: FinanceAccount | null) => {
    setAdjustmentForm({
      kind: 'EXIT',
      occurredAt: `${todayDate}T12:00`,
      paymentMethod: 'PIX',
      amount: 0,
      description: account ? `Ajuste de saldo - ${account.name}` : 'Ajuste de saldo',
      category: 'OUTROS',
      notes: ''
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await apiFetch(editingId ? `/finance/accounts/${editingId}` : '/finance/accounts', {
        method: editingId ? 'PUT' : 'POST',
        token: user?.token,
        body: JSON.stringify(form)
      });
      invalidateQueryCache(financeAccountsKey);
      invalidateQueryCache(financeAccountsSummaryKey);
      await accountsQuery.refetch();
      await accountsSummaryQuery.refetch();
      resetForm();
      setShowForm(false);
      navigate('/app/financeiro/contas');
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteAccount = async () => {
    if (!deletingAccount) return;
    await apiFetch(`/finance/accounts/${deletingAccount.id}`, {
      method: 'DELETE',
      token: user?.token
    });
    invalidateQueryCache(financeAccountsKey);
    invalidateQueryCache(financeAccountsSummaryKey);
    invalidateQueryCache(financeDashboardKey);
    await accountsQuery.refetch();
    await accountsSummaryQuery.refetch();
    setDeletingAccount(null);
  };

  const submitAdjustment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!adjustingAccount) return;
    setAdjustmentSaving(true);
    try {
      await apiFetch(`/finance/accounts/${adjustingAccount.id}/adjustments`, {
        method: 'POST',
        token: user?.token,
        body: JSON.stringify(adjustmentForm)
      });
      invalidateQueryCache(financeAccountsSummaryKey);
      invalidateQueryCache(financeDashboardKey);
      invalidateQueryCache(financeManualSalesKey);
      invalidateQueryCache(financeExpensesKey);
      await accountsSummaryQuery.refetch();
      setAdjustingAccount(null);
      resetAdjustmentForm(null);
    } finally {
      setAdjustmentSaving(false);
    }
  };

  const filtered = (accountsQuery.data ?? []).filter((item) =>
    `${item.name} ${item.institution ?? ''} ${accountTypeLabels[item.accountType] ?? ''}`.toLowerCase().includes(search.toLowerCase())
  );

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

  const activeRangePreset = useMemo(() => {
    if (from === todayDate && to === todayDate) return 'today';
    if (from === monthStart && to === todayDate) return 'month';
    const start = new Date();
    start.setDate(start.getDate() - 6);
    const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    if (from === startDate && to === todayDate) return 'week';
    return 'custom';
  }, [from, to]);

  const theme = getThemeTokens();

  const historyChartOptions = useMemo<Highcharts.Options>(() => ({
    chart: {
      type: 'areaspline',
      backgroundColor: 'transparent',
      spacing: [8, 8, 0, 8],
      height: 280
    },
    title: { text: undefined },
    credits: { enabled: false },
    legend: { enabled: false },
    xAxis: {
      categories: (accountsSummaryQuery.data?.history ?? []).map((item) =>
        new Date(`${item.date}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
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
          return formatCurrency(Number(this.value));
        }
      }
    },
    tooltip: {
      backgroundColor: theme.bg,
      borderColor: theme.border,
      style: { color: theme.text },
      pointFormatter() {
        return `<span>${formatCurrency(Number(this.y ?? 0))}</span>`;
      }
    },
    plotOptions: {
      areaspline: {
        lineWidth: 3,
        fillOpacity: 0.18,
        marker: { enabled: false }
      }
    },
    series: [
      {
        type: 'areaspline',
        name: 'Saldo conferido',
        color: theme.accentStrong,
        data: (accountsSummaryQuery.data?.history ?? []).map((item) => item.totalBalance)
      }
    ]
  }), [accountsSummaryQuery.data?.history, theme.accentStrong, theme.bg, theme.border, theme.muted, theme.text]);

  const totalCurrentBalance = (accountsQuery.data ?? []).reduce((sum, item) => sum + item.balanceAmount, 0);
  const latestAdjustment = accountsSummaryQuery.data?.adjustments?.[0];

  return (
    <div className="page finance-page finance-accounts-page">
      {!isCreateView && !editingRouteId ? (
        <>
          <div className="panel finance-dashboard-panel">
            <FinanceHeader title="Contas e caixa" backTo="/app/financeiro" />
            <div className="finance-dashboard-panel-head compact">
              <div>
                <span className="finance-dashboard-section-label">Historico de saldos</span>
                <h3>Conferido por dia</h3>
              </div>
              <div className="finance-dashboard-period">
                <div className="finance-dashboard-pill-row">
                  <button type="button" className={activeRangePreset === 'today' ? 'active' : 'ghost'} onClick={setTodayRange}>Hoje</button>
                  <button type="button" className={activeRangePreset === 'week' ? 'active' : 'ghost'} onClick={setLast7DaysRange}>7 dias</button>
                  <button type="button" className={activeRangePreset === 'month' ? 'active' : 'ghost'} onClick={setMonthRange}>Mes</button>
                </div>
                <div className="finance-dashboard-date-card">
                  <span>Periodo</span>
                  <div className="finance-range-display">
                    <button type="button" className="finance-range-date-button" onClick={() => openPicker(fromPickerRef)}>
                      {from}
                    </button>
                    <span className="finance-range-divider">-</span>
                    <button type="button" className="finance-range-date-button" onClick={() => openPicker(toPickerRef)}>
                      {to}
                    </button>
                  </div>
                  <input ref={fromPickerRef} className="finance-date-hidden" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
                  <input ref={toPickerRef} className="finance-date-hidden" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
                </div>
              </div>
            </div>
            <HighchartsReact highcharts={Highcharts} options={historyChartOptions} />
            <div className="finance-dashboard-duo-grid">
              <article className="finance-dashboard-side-card">
                <div className="finance-dashboard-list-head">
                  <h4>Saldos atuais</h4>
                </div>
                <div className="finance-dashboard-kpi-stack">
                  <div className="finance-dashboard-inline-metric">
                    <span>Total em contas</span>
                    <strong>{formatCurrency(totalCurrentBalance)}</strong>
                  </div>
                  <div className="finance-dashboard-inline-metric">
                    <span>Contas cadastradas</span>
                    <strong>{(accountsQuery.data ?? []).length}</strong>
                  </div>
                  <div className="finance-dashboard-inline-metric">
                    <span>Ultimo ajuste</span>
                    <strong>{latestAdjustment ? formatCurrency(latestAdjustment.amount) : '-'}</strong>
                  </div>
                </div>
              </article>

              <article className="finance-dashboard-side-card">
                <div className="finance-dashboard-list-head">
                  <h4>Como funciona</h4>
                </div>
                <div className="finance-dashboard-notes">
                  <p>O grafico mostra o saldo conferido salvo por dia. Quando nao houver fechamento, a tela usa apenas a base atual das contas.</p>
                  <p>Use ajuste de entrada ou saida quando esquecer um lancamento e quiser alinhar o saldo real da conta.</p>
                  <p>Esses ajustes entram no financeiro como movimentacao real e passam a aparecer em dashboard, vendas ou despesas.</p>
                </div>
              </article>
            </div>
          </div>

          {adjustingAccount ? (
            <div className="panel finance-dashboard-panel">
              <FinanceHeader title={`Lancar ajuste - ${adjustingAccount.name}`} backTo="/app/financeiro/contas" />
              <form className="form" onSubmit={submitAdjustment}>
                <div className="grid-2">
                  <label>
                    Tipo de ajuste
                    <SelectField
                      value={adjustmentForm.kind}
                      onChange={(value) => setAdjustmentForm((current) => ({ ...current, kind: value as AdjustmentKind }))}
                      options={[
                        { value: 'EXIT', label: 'Saida' },
                        { value: 'ENTRY', label: 'Entrada' }
                      ]}
                    />
                  </label>
                  <label>
                    Forma de pagamento
                    <SelectField
                      value={adjustmentForm.paymentMethod}
                      onChange={(value) => setAdjustmentForm((current) => ({ ...current, paymentMethod: value as PaymentMethod }))}
                      options={paymentMethodOptions.map((method) => ({ value: method, label: methodLabels[method] }))}
                    />
                  </label>
                </div>
                <div className="grid-2">
                  <label>Data e hora<input type="datetime-local" value={adjustmentForm.occurredAt} onChange={(event) => setAdjustmentForm((current) => ({ ...current, occurredAt: event.target.value }))} required /></label>
                  <label>Valor<MoneyInput value={adjustmentForm.amount} onChange={(value) => setAdjustmentForm((current) => ({ ...current, amount: value }))} /></label>
                </div>
                <label>Descricao<input value={adjustmentForm.description} onChange={(event) => setAdjustmentForm((current) => ({ ...current, description: event.target.value }))} required /></label>
                {adjustmentForm.kind === 'EXIT' ? (
                  <label>
                    Categoria
                    <SelectField
                      value={adjustmentForm.category}
                      onChange={(value) => setAdjustmentForm((current) => ({ ...current, category: value as ExpenseCategory }))}
                      options={expenseCategoryKeys.map((key) => ({ value: key, label: expenseCategoryLabels[key] }))}
                    />
                  </label>
                ) : null}
                <label>Observacoes<input value={adjustmentForm.notes} onChange={(event) => setAdjustmentForm((current) => ({ ...current, notes: event.target.value }))} /></label>
                <div className="actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setAdjustingAccount(null);
                      resetAdjustmentForm(null);
                    }}
                  >
                    Cancelar
                  </button>
                  <button type="submit" disabled={adjustmentSaving || adjustmentForm.amount <= 0}>
                    {adjustmentSaving ? 'Salvando...' : 'Salvar ajuste'}
                  </button>
                </div>
              </form>
            </div>
          ) : null}

          <div className="panel">
            <FinanceHeader title="Contas cadastradas" backTo="/app/financeiro" />
            <ListToolbar
              title=""
              searchValue={search}
              onSearch={setSearch}
              actionLabel="Nova conta"
              onAction={() => navigate('/app/financeiro/contas/novo')}
            />
            <div className="table">
              {filtered.map((item) => (
                <div key={item.id} className="list-row">
                  <div>
                    <strong>{item.name}</strong>
                    <span className="muted">{accountTypeLabels[item.accountType]} • {item.institution || '-'} • {item.balanceDate} • {formatCurrency(item.balanceAmount)}</span>
                  </div>
                  <button
                    type="button"
                    className="finance-dashboard-action-link"
                    onClick={() => {
                      setAdjustingAccount(item);
                      resetAdjustmentForm(item);
                    }}
                  >
                    Lancar ajuste
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Editar"
                    onClick={() => navigate(`/app/financeiro/contas/editar/${item.id}`)}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">edit</span>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Excluir"
                    onClick={() => setDeletingAccount({ id: item.id, name: item.name })}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                  </button>
                </div>
              ))}
            </div>

            <div className="finance-dashboard-side-card finance-accounts-adjustment-history">
              <div className="finance-dashboard-list-head">
                <h4>Ajustes recentes</h4>
              </div>
              <div className="finance-dashboard-list">
                {(accountsSummaryQuery.data?.adjustments ?? []).slice(0, 6).map((item) => (
                  <div key={item.id} className="finance-dashboard-list-row">
                    <div>
                      <strong>{item.description}</strong>
                      <span>{new Date(item.occurredAt).toLocaleDateString('pt-BR')} • {item.kind === 'ENTRY' ? 'Entrada' : 'Saida'}</span>
                    </div>
                    <strong>{formatCurrency(item.amount)}</strong>
                  </div>
                ))}
                {(accountsSummaryQuery.data?.adjustments ?? []).length === 0 ? (
                  <div className="finance-dashboard-list-row">
                    <div>
                      <strong>Sem ajustes no periodo</strong>
                      <span>Os ajustes lancados aqui entram no relatorio e ajudam a alinhar o caixa.</span>
                    </div>
                    <strong>-</strong>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </>
      ) : null}

      {showForm ? (
        <div className="panel">
          <FinanceHeader title={editingId ? 'Editar conta' : 'Nova conta'} backTo="/app/financeiro/contas" />
          <form className="form" onSubmit={submit}>
            <div className="grid-2">
              <label>Nome da conta<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
              <label>
                Tipo
                <SelectField
                  value={form.accountType}
                  onChange={(value) => setForm({ ...form, accountType: value as AccountType })}
                  options={accountTypeKeys.map((key) => ({ value: key, label: accountTypeLabels[key] }))}
                />
              </label>
            </div>
            <label>Banco/Instituicao<input value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} /></label>
            <div className="grid-2">
              <label>Data base do saldo<input type="date" value={form.balanceDate} onChange={(e) => setForm({ ...form, balanceDate: e.target.value })} required /></label>
              <label>Saldo base de referencia<MoneyInput value={form.balanceAmount} onChange={(value) => setForm({ ...form, balanceAmount: value })} /></label>
            </div>
            <label>Observacoes<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
            <div className="actions">
              <button type="button" className="ghost" onClick={() => navigate('/app/financeiro/contas')}>Cancelar</button>
              <button type="submit" disabled={saving}>{saving ? 'Salvando...' : editingId ? 'Salvar conta' : 'Cadastrar conta'}</button>
            </div>
          </form>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(deletingAccount)}
        title="Excluir conta"
        message={deletingAccount ? `Deseja excluir a conta "${deletingAccount.name}"?` : ''}
        confirmLabel="Excluir"
        onConfirm={confirmDeleteAccount}
        onCancel={() => setDeletingAccount(null)}
      />
    </div>
  );
};
