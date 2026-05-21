import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';
import { apiFetch } from '../shared/api.ts';
import { MoneyInput } from '../shared/MoneyInput.tsx';
import { SelectField } from '../shared/SelectField.tsx';
import { invalidateQueryCache } from '../shared/queryCache.ts';
import { FinanceAccessBlocked, FinanceHeader } from './FinanceShared.tsx';
import {
  expenseCategoryKeys,
  expenseCategoryLabels,
  financeAccountsSummaryKey,
  financeDashboardKey,
  financeExpensesKey,
  financeManualSalesKey,
  methodLabels,
  saleOriginKeys,
  saleOriginLabels
} from './constants.ts';
import { useFinanceAccounts, useFinanceAccountsSummary } from './hooks.ts';
import { todayDate } from './utils.ts';
import type { ExpenseCategory, PaymentMethod, SaleOrigin } from './types.ts';

type AdjustmentKind = 'ENTRY' | 'EXIT';
type AdjustmentMode = 'amount' | 'difference';

const paymentMethodOptions: PaymentMethod[] = ['PIX', 'DINHEIRO', 'CARTAO', 'VOUCHER'];

export const FinanceAccountAdjustmentsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const params = useParams<{ kind?: AdjustmentKind; adjustmentId?: string }>();
  const [searchParams] = useSearchParams();
  const accountsQuery = useFinanceAccounts(user?.token);
  const accountsSummaryQuery = useFinanceAccountsSummary(user?.token, todayDate, todayDate);
  const editingKind = params.kind ?? null;
  const editingId = params.adjustmentId ?? null;
  const isEditing = Boolean(editingKind && editingId);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    mode: 'amount' as AdjustmentMode,
    kind: 'EXIT' as AdjustmentKind,
    accountId: searchParams.get('accountId') ?? '',
    origin: 'outros' as SaleOrigin,
    occurredAt: `${todayDate}T12:00`,
    paymentMethod: 'PIX' as PaymentMethod,
    amount: 0,
    targetBalance: 0,
    description: 'Ajuste de saldo',
    category: 'OUTROS' as ExpenseCategory,
    notes: ''
  });

  if (!user?.modules?.includes('financeiro')) return <FinanceAccessBlocked />;

  useEffect(() => {
    if (!isEditing || !editingKind || !editingId) return;
    setLoading(true);
    apiFetch<{ kind: AdjustmentKind; item: { accountId: string; origin?: SaleOrigin; occurredAt: string; paymentMethod: PaymentMethod; amount: number; description: string; category?: ExpenseCategory; notes?: string } }>(
      `/finance/account-adjustments/${editingKind}/${editingId}`,
      { token: user?.token }
    )
      .then((response) => {
        setForm({
          mode: 'amount',
          kind: response.kind,
          accountId: response.item.accountId,
          origin: response.item.origin ?? 'outros',
          occurredAt: String(response.item.occurredAt).slice(0, 16),
          paymentMethod: response.item.paymentMethod,
          amount: response.item.amount,
          targetBalance: 0,
          description: response.item.description,
          category: response.item.category ?? 'OUTROS',
          notes: response.item.notes ?? ''
        });
      })
      .finally(() => setLoading(false));
  }, [editingId, editingKind, isEditing, user?.token]);

  useEffect(() => {
    if (isEditing) return;
    if (!searchParams.get('accountId') && accountsQuery.data?.[0]?.id) {
      setForm((current) => ({ ...current, accountId: current.accountId || accountsQuery.data?.[0]?.id || '' }));
    }
  }, [accountsQuery.data, isEditing, searchParams]);

  const accountOptions = useMemo(
    () => (accountsQuery.data ?? []).map((item) => ({ value: item.id, label: item.name })),
    [accountsQuery.data]
  );

  const currentBalanceMap = useMemo(
    () => new Map((accountsSummaryQuery.data?.accounts ?? []).map((item) => [item.accountId, item.currentBalance])),
    [accountsSummaryQuery.data?.accounts]
  );

  const selectedCurrentBalance = currentBalanceMap.get(form.accountId) ?? 0;
  const computedAmount = form.mode === 'difference' ? Math.abs(form.targetBalance - selectedCurrentBalance) : form.amount;
  const computedKind = form.mode === 'difference'
    ? form.targetBalance >= selectedCurrentBalance ? 'ENTRY' : 'EXIT'
    : form.kind;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.accountId) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        kind: computedKind,
        amount: computedAmount
      };
      await apiFetch(
        isEditing
          ? `/finance/account-adjustments/${editingKind}/${editingId}`
          : `/finance/accounts/${form.accountId}/adjustments`,
        {
          method: isEditing ? 'PUT' : 'POST',
          token: user?.token,
          body: JSON.stringify(payload)
        }
      );
      invalidateQueryCache(financeAccountsSummaryKey);
      invalidateQueryCache(financeDashboardKey);
      invalidateQueryCache(financeManualSalesKey);
      invalidateQueryCache(financeExpensesKey);
      navigate('/app/financeiro/contas');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="panel">
        <FinanceHeader title={isEditing ? 'Editar ajuste' : 'Novo ajuste'} backTo="/app/financeiro/contas" />
        <form className="form" onSubmit={submit}>
          <div className="grid-2">
            <label>
              Conta
              <SelectField
                value={form.accountId}
                onChange={(value) => setForm((current) => ({ ...current, accountId: value }))}
                options={accountOptions}
              />
            </label>
            <label>
              Modo de lancamento
              <div className="finance-adjustment-mode-row">
                <button type="button" className={form.mode === 'amount' ? 'active' : ''} onClick={() => setForm((current) => ({ ...current, mode: 'amount' }))}>
                  Por valor
                </button>
                <button type="button" className={form.mode === 'difference' ? 'active' : ''} onClick={() => setForm((current) => ({ ...current, mode: 'difference' }))}>
                  Por diferenca
                </button>
              </div>
            </label>
          </div>
          {form.mode === 'amount' ? (
            <div className="grid-2">
              <label>
                Tipo de ajuste
                <SelectField
                  value={form.kind}
                  onChange={(value) => setForm((current) => ({ ...current, kind: value as AdjustmentKind }))}
                  options={[
                    { value: 'EXIT', label: 'Saida' },
                    { value: 'ENTRY', label: 'Entrada' }
                  ]}
                />
              </label>
              <label>
                Valor
                <MoneyInput value={form.amount} onChange={(value) => setForm((current) => ({ ...current, amount: value }))} />
              </label>
            </div>
          ) : (
            <div className="grid-2">
              <label>
                Saldo atual da conta
                <MoneyInput value={selectedCurrentBalance} onChange={() => undefined} />
              </label>
              <label>
                Saldo real no banco
                <MoneyInput value={form.targetBalance} onChange={(value) => setForm((current) => ({ ...current, targetBalance: value }))} />
              </label>
            </div>
          )}
          <div className="grid-2">
            <label>Data e hora<input type="datetime-local" value={form.occurredAt} onChange={(event) => setForm((current) => ({ ...current, occurredAt: event.target.value }))} required /></label>
            {form.mode === 'difference' ? (
              <label>
                Ajuste calculado
                <MoneyInput value={computedAmount} onChange={() => undefined} />
              </label>
            ) : <div />}
          </div>
          <div className="grid-2">
            <label>
              Forma de pagamento
              <SelectField
                value={form.paymentMethod}
                onChange={(value) => setForm((current) => ({ ...current, paymentMethod: value as PaymentMethod }))}
                options={paymentMethodOptions.map((method) => ({ value: method, label: methodLabels[method] }))}
              />
            </label>
            {(form.mode === 'difference' ? computedKind : form.kind) === 'ENTRY' ? (
              <label>
                Tipo da entrada
                <SelectField
                  value={form.origin}
                  onChange={(value) => setForm((current) => ({ ...current, origin: value as SaleOrigin }))}
                  options={saleOriginKeys.map((key) => ({ value: key, label: saleOriginLabels[key] }))}
                />
              </label>
            ) : null}
            {(form.mode === 'difference' ? computedKind : form.kind) === 'EXIT' ? (
              <label>
                Categoria
                <SelectField
                  value={form.category}
                  onChange={(value) => setForm((current) => ({ ...current, category: value as ExpenseCategory }))}
                  options={expenseCategoryKeys.map((key) => ({ value: key, label: expenseCategoryLabels[key] }))}
                />
              </label>
            ) : null}
          </div>
          <label>Descricao<input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} required /></label>
          <label>Observacoes<input value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label>
          {form.mode === 'difference' ? (
            <div className="finance-dashboard-inline-metric">
              <span>Tipo calculado</span>
              <strong>{computedKind === 'ENTRY' ? 'Entrada' : 'Saida'}</strong>
            </div>
          ) : null}
          <div className="actions">
            <button type="button" className="ghost" onClick={() => navigate('/app/financeiro/contas')}>Cancelar</button>
            <button type="submit" disabled={saving || loading || !form.accountId || computedAmount <= 0}>
              {saving ? 'Salvando...' : isEditing ? 'Salvar ajuste' : 'Cadastrar ajuste'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
