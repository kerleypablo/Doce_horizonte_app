import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';
import { apiFetch } from '../shared/api.ts';
import { MoneyInput } from '../shared/MoneyInput.tsx';
import { SelectField } from '../shared/SelectField.tsx';
import { ListToolbar } from '../shared/ListToolbar.tsx';
import { invalidateQueryCache } from '../shared/queryCache.ts';
import { FinanceAccessBlocked, FinanceHeader } from './FinanceShared.tsx';
import { accountTypeKeys, accountTypeLabels, financeAccountsKey } from './constants.ts';
import { useFinanceAccounts } from './hooks.ts';
import { formatCurrency, todayDate } from './utils.ts';
import type { AccountType } from './types.ts';

export const FinanceAccountsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const params = useParams<{ accountId?: string }>();
  const isCreateView = pathname.endsWith('/novo');
  const editingRouteId = pathname.includes('/editar/') ? params.accountId ?? null : null;
  const accountsQuery = useFinanceAccounts(user?.token);
  const [editingId, setEditingId] = useState<string | null>(editingRouteId);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(Boolean(isCreateView || editingRouteId));
  const [saving, setSaving] = useState(false);
  const initializedRouteRef = useRef<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    accountType: 'BANK' as AccountType,
    institution: '',
    balanceDate: todayDate,
    balanceAmount: 0,
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
      await accountsQuery.refetch();
      resetForm();
      setShowForm(false);
      navigate('/app/financeiro/contas');
    } finally {
      setSaving(false);
    }
  };

  const filtered = (accountsQuery.data ?? []).filter((item) =>
    `${item.name} ${item.institution ?? ''} ${accountTypeLabels[item.accountType] ?? ''}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page">
      {!isCreateView && !editingRouteId ? (
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
                  className="icon-button"
                  aria-label="Editar"
                  onClick={() => navigate(`/app/financeiro/contas/editar/${item.id}`)}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">edit</span>
                </button>
              </div>
            ))}
          </div>
        </div>
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
              <label>Data do saldo<input type="date" value={form.balanceDate} onChange={(e) => setForm({ ...form, balanceDate: e.target.value })} required /></label>
              <label>Saldo informado<MoneyInput value={form.balanceAmount} onChange={(value) => setForm({ ...form, balanceAmount: value })} /></label>
            </div>
            <label>Observacoes<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
            <div className="actions">
              <button type="button" className="ghost" onClick={() => navigate('/app/financeiro/contas')}>Cancelar</button>
              <button type="submit" disabled={saving}>{saving ? 'Salvando...' : editingId ? 'Salvar conta' : 'Cadastrar conta'}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
};
