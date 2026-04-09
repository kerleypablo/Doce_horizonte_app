import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';
import { apiFetch } from '../shared/api.ts';
import { MoneyInput } from '../shared/MoneyInput.tsx';
import { SelectField } from '../shared/SelectField.tsx';
import { TagInput } from '../shared/TagInput.tsx';
import { ListToolbar } from '../shared/ListToolbar.tsx';
import { invalidateQueryCache, useCachedQuery } from '../shared/queryCache.ts';

const financeDashboardKey = 'finance-dashboard';
const financeAccountsKey = 'finance-accounts';
const financeRulesKey = 'finance-rules';
const financeOriginCostRulesKey = 'finance-origin-cost-rules';
const financeManualSalesKey = 'finance-manual-sales';
const financeExpensesKey = 'finance-expenses';

type PaymentMethod = 'PIX' | 'DINHEIRO' | 'CARTAO' | 'VOUCHER';
type RuleMode = 'NONE' | 'PERCENT' | 'FIXED_ADD' | 'FIXED_SUBTRACT';
type SaleOrigin = 'balcao' | 'rua' | 'porta-a-porta' | 'ifood' | 'outros';
type AccountType = 'BANK' | 'CASH' | 'CARD_RECEIVABLE' | 'IFOOD_RECEIVABLE' | 'OTHER';
type ExpenseCategory = 'INSUMOS' | 'EMBALAGENS' | 'ALUGUEL' | 'ENERGIA' | 'FUNCIONARIO' | 'ENTREGA' | 'TAXAS' | 'MARKETING' | 'OUTROS';

type FinanceAccount = {
  id: string;
  name: string;
  accountType: AccountType;
  institution?: string;
  balanceDate: string;
  balanceAmount: number;
  notes?: string;
};

type MethodRule = {
  method: PaymentMethod;
  mode: RuleMode;
  value: number;
};

type OriginCostRule = {
  origin: SaleOrigin;
  costPercent: number;
};

type FinanceProduct = {
  id: string;
  name: string;
  unitPrice: number;
  salePrice: number;
};

type ManualSaleProduct = {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
};

type ManualSale = {
  id: string;
  accountId?: string;
  occurredAt: string;
  description: string;
  paymentMethod: PaymentMethod;
  amount: number;
  netAmount: number;
  tags: string[];
  products: ManualSaleProduct[];
  reconciled: boolean;
  notes?: string;
};

type Expense = {
  id: string;
  accountId?: string;
  occurredAt: string;
  description: string;
  category: ExpenseCategory;
  paymentMethod: PaymentMethod;
  amount: number;
  netAmount: number;
  reconciled: boolean;
  recurring: boolean;
  notes?: string;
};

type DailyClosing = {
  id: string;
  date: string;
  checkedBalance: number;
  notes?: string;
};

type DashboardData = {
  range: { from: string; to: string };
  totals: {
    accountsBalance: number;
    ordersTotal: number;
	    ordersCount: number;
	    manualSalesGross: number;
	    manualSalesNet: number;
	    manualSalesFees: number;
	    manualSalesEstimatedCost: number;
	    manualSalesEstimatedProfit: number;
	    ordersEstimatedCost: number;
	    ordersEstimatedProfit: number;
	    expensesGross: number;
	    expensesNet: number;
	    recurringExpensesNet: number;
	    totalEntries: number;
	    netResult: number;
	    estimatedGrossProfit: number;
	    estimatedNetProfit: number;
	    projectedBalance: number;
	    checkedBalance?: number;
	    balanceDifference: number | null;
	  };
	  chart: Array<{ date: string; orders: number; manualSales: number; expenses: number; net: number }>;
	  salesByOrigin: Array<{ origin: SaleOrigin; gross: number; net: number; estimatedCost: number; estimatedProfit: number; count: number }>;
	  salesByMethod: Array<{ method: PaymentMethod; gross: number; net: number; fees: number; count: number }>;
	  expensesByCategory: Array<{ category: ExpenseCategory; amount: number; count: number }>;
	  originCostRules: OriginCostRule[];
	  dailyClosing: DailyClosing | null;
	  accountsByType: Array<{ accountType: AccountType; balanceAmount: number; count: number }>;
	  accounts: Array<{ id: string; name: string; accountType: AccountType; balanceAmount: number }>;
	};

const methodLabels: Record<PaymentMethod, string> = {
  PIX: 'Pix',
  DINHEIRO: 'Dinheiro',
  CARTAO: 'Cartao',
  VOUCHER: 'Voucher'
};

const modeLabels: Record<RuleMode, string> = {
  NONE: 'Sem ajuste',
  PERCENT: 'Percentual',
  FIXED_ADD: 'Somar valor fixo',
  FIXED_SUBTRACT: 'Subtrair valor fixo'
};

const saleOriginLabels: Record<SaleOrigin, string> = {
  balcao: 'Balcao',
  rua: 'Rua',
  'porta-a-porta': 'Porta a porta',
  ifood: 'iFood',
  outros: 'Outros'
};

const saleOriginKeys = Object.keys(saleOriginLabels) as SaleOrigin[];

const accountTypeLabels: Record<AccountType, string> = {
  BANK: 'Banco',
  CASH: 'Caixa fisico',
  CARD_RECEIVABLE: 'Maquininha a receber',
  IFOOD_RECEIVABLE: 'iFood a receber',
  OTHER: 'Outro'
};

const accountTypeKeys = Object.keys(accountTypeLabels) as AccountType[];

const expenseCategoryLabels: Record<ExpenseCategory, string> = {
  INSUMOS: 'Insumos',
  EMBALAGENS: 'Embalagens',
  ALUGUEL: 'Aluguel',
  ENERGIA: 'Energia',
  FUNCIONARIO: 'Funcionario',
  ENTREGA: 'Entrega',
  TAXAS: 'Taxas',
  MARKETING: 'Marketing',
  OUTROS: 'Outros'
};

const expenseCategoryKeys = Object.keys(expenseCategoryLabels) as ExpenseCategory[];

const isSaleOrigin = (value: string): value is SaleOrigin =>
  saleOriginKeys.includes(value as SaleOrigin);

const stripOriginTags = (tags: string[]) => tags.filter((tag) => !isSaleOrigin(tag));

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const today = new Date();
const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

const FinanceAccessBlocked = () => (
  <div className="panel">
    <h3>Modulo Financeiro</h3>
    <p>Seu usuario nao tem acesso ao modulo financeiro.</p>
  </div>
);

const FinanceHeader = ({ title, backTo }: { title: string; backTo?: string }) => {
  const navigate = useNavigate();
  return (
    <div className="panel-title-row">
      {backTo ? (
        <button type="button" className="icon-button small" onClick={() => navigate(backTo)} aria-label="Voltar">
          <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
        </button>
      ) : null}
    </div>
  );
};

const useFinanceRange = () => {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(todayDate);
  return { from, to, setFrom, setTo };
};

const useFinanceDashboard = (token?: string, from?: string, to?: string) =>
  useCachedQuery(
    `${financeDashboardKey}:${from ?? ''}:${to ?? ''}`,
    () => apiFetch<DashboardData>(`/finance/dashboard?from=${from}&to=${to}`, { token }),
    { enabled: Boolean(token && from && to), staleTime: 45_000 }
  );

const useFinanceAccounts = (token?: string) =>
  useCachedQuery(
    financeAccountsKey,
    () => apiFetch<FinanceAccount[]>('/finance/accounts', { token }),
    { enabled: Boolean(token), staleTime: 45_000 }
  );

const useFinanceRules = (token?: string) =>
  useCachedQuery(
    financeRulesKey,
    () => apiFetch<{ rules: MethodRule[] }>('/finance/method-rules', { token }),
    { enabled: Boolean(token), staleTime: 45_000 }
  );

const useFinanceOriginCostRules = (token?: string) =>
  useCachedQuery(
    financeOriginCostRulesKey,
    () => apiFetch<{ rules: OriginCostRule[] }>('/finance/origin-cost-rules', { token }),
    { enabled: Boolean(token), staleTime: 45_000 }
  );

const useManualSales = (token?: string, from?: string, to?: string, tag?: string, search?: string) =>
  useCachedQuery(
    `${financeManualSalesKey}:${from ?? ''}:${to ?? ''}:${tag ?? ''}:${search ?? ''}`,
    () => {
      const params = new URLSearchParams();
      params.set('from', from ?? '');
      params.set('to', to ?? '');
      if (tag) params.set('tag', tag);
      if (search) params.set('search', search);
      return apiFetch<ManualSale[]>(`/finance/manual-sales?${params.toString()}`, { token });
    },
    { enabled: Boolean(token && from && to), staleTime: 15_000 }
  );

const useManualSalesTags = (token?: string) =>
  useCachedQuery(
    `${financeManualSalesKey}:tags`,
    () => apiFetch<{ tags: string[] }>('/finance/manual-sales/tags', { token }),
    { enabled: Boolean(token), staleTime: 60_000 }
  );

const useExpenses = (token?: string, from?: string, to?: string) =>
  useCachedQuery(
    `${financeExpensesKey}:${from ?? ''}:${to ?? ''}`,
    () => apiFetch<Expense[]>(`/finance/expenses?from=${from}&to=${to}`, { token }),
    { enabled: Boolean(token && from && to), staleTime: 30_000 }
  );

const useFinanceProducts = (token?: string) =>
  useCachedQuery(
    'finance-products',
    () => apiFetch<FinanceProduct[]>('/products', { token }),
    { enabled: Boolean(token), staleTime: 60_000 }
  );

export const FinanceDashboardPage = () => {
  const { user } = useAuth();
  const { from, to, setFrom, setTo } = useFinanceRange();
  const fromPickerRef = useRef<HTMLInputElement | null>(null);
  const toPickerRef = useRef<HTMLInputElement | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [closingAmount, setClosingAmount] = useState(0);
  const [closingNotes, setClosingNotes] = useState('');
  const [closingSaving, setClosingSaving] = useState(false);
  const [originRules, setOriginRules] = useState<OriginCostRule[]>([]);
  const [originRulesSaving, setOriginRulesSaving] = useState(false);
  const [expandedFinanceSections, setExpandedFinanceSections] = useState<Record<string, boolean>>({});
  const dashboardQuery = useFinanceDashboard(user?.token, from, to);
  const originRulesQuery = useFinanceOriginCostRules(user?.token);
  const salesQuery = useManualSales(user?.token, from, to);
  const expensesQuery = useExpenses(user?.token, from, to);

  useEffect(() => {
    if (!dashboardQuery.data) return;
    setClosingAmount(dashboardQuery.data.dailyClosing?.checkedBalance ?? dashboardQuery.data.totals.projectedBalance ?? 0);
    setClosingNotes(dashboardQuery.data.dailyClosing?.notes ?? '');
  }, [dashboardQuery.data]);

  useEffect(() => {
    if (originRulesQuery.data?.rules) setOriginRules(originRulesQuery.data.rules);
  }, [originRulesQuery.data]);

  if (!user?.modules?.includes('financeiro')) return <FinanceAccessBlocked />;
  const data = dashboardQuery.data;

  const formatRangeDate = (value: string) => {
    if (!value) return '--';
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
  };

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

  const saveDailyClosing = async () => {
    setClosingSaving(true);
    try {
      await apiFetch('/finance/daily-closing', {
        method: 'PUT',
        token: user?.token,
        body: JSON.stringify({
          date: to,
          checkedBalance: closingAmount,
          notes: closingNotes
        })
      });
      invalidateQueryCache(financeDashboardKey);
      await dashboardQuery.refetch();
    } finally {
      setClosingSaving(false);
    }
  };

  const updateOriginRule = (origin: SaleOrigin, costPercent: number) => {
    setOriginRules((current) =>
      saleOriginKeys.map((key) => {
        const existing = current.find((item) => item.origin === key);
        const next = key === origin ? costPercent : existing?.costPercent ?? 0;
        return { origin: key, costPercent: next };
      })
    );
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
      await originRulesQuery.refetch();
      await dashboardQuery.refetch();
    } finally {
      setOriginRulesSaving(false);
    }
  };

  const isFinanceSectionExpanded = (section: string) => Boolean(expandedFinanceSections[section]);

  const toggleFinanceSection = (section: string) => {
    setExpandedFinanceSections((current) => ({
      ...current,
      [section]: !current[section]
    }));
  };

  const summaryCards = useMemo(() => {
    const totals = data?.totals;
    return [
      {
        id: 'saldo-base',
        title: 'Saldo Base',
        value: formatCurrency(totals?.accountsBalance ?? 0),
        note: 'Valor total em contas',
        icon: 'wallet'
      },
      {
        id: 'pedidos',
        title: 'Pedidos',
        value: formatCurrency(totals?.ordersTotal ?? 0),
        note: `${totals?.ordersCount ?? 0} pedidos`,
        icon: 'shopping_bag',
        trend: '+12%'
      },
	      {
	        id: 'balcao',
	        title: 'Vendas Avulsas',
	        value: formatCurrency(totals?.manualSalesNet ?? 0),
	        note: `${(salesQuery.data ?? []).length} vendas`,
	        icon: 'payments'
	      },
	      {
	        id: 'taxas',
	        title: 'Taxas Estimadas',
	        value: formatCurrency(totals?.manualSalesFees ?? 0),
	        note: 'Descontos por metodo',
	        icon: 'price_check'
	      },
	      {
	        id: 'despesas',
	        title: 'Despesas',
	        value: formatCurrency(totals?.expensesNet ?? 0),
	        note: `${(expensesQuery.data ?? []).length} lancamentos`,
	        icon: 'receipt_long'
	      }
	    ];
	  }, [data, salesQuery.data, expensesQuery.data]);

  useEffect(() => {
    if (!summaryCards.length) {
      setCurrentCardIndex(0);
      return;
    }
    if (currentCardIndex > summaryCards.length - 1) {
      setCurrentCardIndex(0);
    }
  }, [summaryCards.length, currentCardIndex]);

  const nextCard = () => {
    if (!summaryCards.length) return;
    setCurrentCardIndex((value) => (value + 1) % summaryCards.length);
  };

  const prevCard = () => {
    if (!summaryCards.length) return;
    setCurrentCardIndex((value) => (value - 1 + summaryCards.length) % summaryCards.length);
  };

  const flowData = useMemo(() => (data?.chart ?? []).slice(-7), [data]);
  const flowMax = useMemo(() => {
    const values = flowData.map((item) => Math.max(item.orders + item.manualSales, item.expenses));
    return Math.max(...values, 1);
  }, [flowData]);

  const transactions = useMemo(() => {
    const sales = (salesQuery.data ?? []).map((item) => ({
      id: `sale-${item.id}`,
      title: item.description,
      method: methodLabels[item.paymentMethod],
      amount: item.netAmount,
      positive: true,
      occurredAt: item.occurredAt
    }));
    const expenses = (expensesQuery.data ?? []).map((item) => ({
      id: `expense-${item.id}`,
      title: item.description,
      method: methodLabels[item.paymentMethod],
      amount: item.netAmount,
      positive: false,
      occurredAt: item.occurredAt
    }));
    return [...sales, ...expenses]
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, 6);
  }, [salesQuery.data, expensesQuery.data]);

  return (
    <div className="page finance-page">
      <div className="panel finance-hero-panel">
        <div className="finance-hero-head">
          <div className="finance-hero-top">
            <FinanceHeader title="Financeiro" />
            <div className="finance-actions-menu">
              <button
                type="button"
                className="finance-actions-trigger finance-actions-plus"
                onClick={() => setActionsOpen((open) => !open)}
                aria-label="Novo lancamento"
                aria-expanded={actionsOpen}
              >
                <span className="material-symbols-outlined" aria-hidden="true">add</span>
              </button>
              {actionsOpen ? (
                <div className="finance-actions-popover">
                  <Link to="/app/pedidos/novo" className="finance-action-item" onClick={() => setActionsOpen(false)}>Novo pedido</Link>
                  <Link to="/app/insumos/novo" className="finance-action-item" onClick={() => setActionsOpen(false)}>Novo insumo</Link>
                  <Link to="/app/financeiro/vendas-manuais/novo" className="finance-action-item" onClick={() => setActionsOpen(false)}>Nova venda</Link>
                  <Link to="/app/financeiro/despesas/novo" className="finance-action-item" onClick={() => setActionsOpen(false)}>Nova despesa</Link>
                </div>
              ) : null}
            </div>
            <div className="finance-range-inline">
              <span className="finance-range-label">Periodo</span>
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
          <p className="muted">Resumo inteligente do que esta acontecendo no caixa.</p>
        </div>
        <div className="finance-period-pills">
          <button type="button" className="ghost" onClick={setTodayRange}>Hoje</button>
          <button type="button" className="ghost" onClick={setLast7DaysRange}>Semana</button>
          <button type="button" className="finance-pill-active" onClick={setMonthRange}>Mes</button>
        </div>
        <div className="finance-carousel-wrap">
          <div className="finance-carousel-frame" aria-label="Resumo financeiro">
            <button type="button" className="finance-carousel-nav" onClick={prevCard} aria-label="Card anterior">
              <span className="material-symbols-outlined" aria-hidden="true">chevron_left</span>
            </button>
            <div className="finance-carousel-overflow">
              <div className="finance-carousel-track" style={{ transform: `translateX(-${currentCardIndex * 100}%)` }}>
                {summaryCards.map((card, index) => (
                <article key={card.id} className={`finance-summary-slide tone-${(index % 4) + 1}`}>
                <div className="finance-slide-head">
                  <span>{card.title}</span>
                  <span className="material-symbols-outlined finance-slide-icon" aria-hidden="true">{card.icon}</span>
                </div>
                <strong>{card.value}</strong>
                <div className="finance-slide-meta">
                  <span className="material-symbols-outlined" aria-hidden="true">insights</span>
                  <small>{card.note}</small>
                </div>
                {card.trend ? (
                  <span className={`finance-slide-trend ${card.trend.startsWith('-') ? 'negative' : 'positive'}`}>{card.trend} vs. mes anterior</span>
                ) : null}
                </article>
                ))}
              </div>
            </div>
            <button type="button" className="finance-carousel-nav" onClick={nextCard} aria-label="Proximo card">
              <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
            </button>
          </div>
          <div className="finance-carousel-dots">
            {summaryCards.map((card, index) => (
              <button
                key={card.id}
                type="button"
                className={`finance-carousel-dot ${index === currentCardIndex ? 'active' : ''}`}
                onClick={() => setCurrentCardIndex(index)}
                aria-label={`Ir para card ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </div>

	      <div className="panel finance-result-panel">
	        <div>
	          <p className="muted">Resultado de Caixa</p>
	          <strong>{formatCurrency(data?.totals.netResult ?? 0)}</strong>
	        </div>
	        <div>
	          <p className="muted">Lucro Estimado</p>
	          <strong>{formatCurrency(data?.totals.estimatedNetProfit ?? 0)}</strong>
	        </div>
	        <div>
	          <p className="muted">Saldo Projetado</p>
	          <strong>{formatCurrency(data?.totals.projectedBalance ?? 0)}</strong>
	        </div>
	        <div>
	          <p className="muted">Diferenca Conferida</p>
	          <strong>{data?.totals.balanceDifference === null || data?.totals.balanceDifference === undefined ? '-' : formatCurrency(data.totals.balanceDifference)}</strong>
	        </div>
	      </div>

	      <div className="finance-kpi-grid">
	        <div className="panel finance-kpi-card">
	          <span>Lucro pedidos</span>
	          <strong>{formatCurrency(data?.totals.ordersEstimatedProfit ?? 0)}</strong>
	        </div>
	        <div className="panel finance-kpi-card">
	          <span>Custo pedidos</span>
	          <strong>{formatCurrency(data?.totals.ordersEstimatedCost ?? 0)}</strong>
	        </div>
	        <div className="panel finance-kpi-card">
	          <span>Lucro vendas avulsas</span>
	          <strong>{formatCurrency(data?.totals.manualSalesEstimatedProfit ?? 0)}</strong>
	        </div>
	        <div className="panel finance-kpi-card">
	          <span>Custo vendas avulsas</span>
	          <strong>{formatCurrency(data?.totals.manualSalesEstimatedCost ?? 0)}</strong>
	        </div>
	      </div>

	      <div className="panel finance-closing-panel">
	        <div>
	          <h3>Fechamento do dia</h3>
	          <p className="muted">Informe o saldo real conferido em {formatRangeDate(to)} para comparar com a projecao.</p>
	        </div>
	        <div className="finance-closing-form">
	          <label>
	            Saldo conferido
	            <MoneyInput value={closingAmount} onChange={setClosingAmount} />
	          </label>
	          <label>
	            Observacoes
	            <input value={closingNotes} onChange={(event) => setClosingNotes(event.target.value)} placeholder="Ex: caixa fechado as 18h" />
	          </label>
	          <button type="button" onClick={saveDailyClosing} disabled={closingSaving}>
	            {closingSaving ? 'Salvando...' : 'Salvar fechamento'}
	          </button>
	        </div>
	      </div>

	      <div className="finance-kpi-grid">
	        <div className="panel finance-kpi-card">
	          <span>Pedidos do app</span>
	          <strong>{formatCurrency(data?.totals.ordersTotal ?? 0)}</strong>
	        </div>
	        <div className="panel finance-kpi-card">
	          <span>Vendas avulsas</span>
	          <strong>{formatCurrency(data?.totals.manualSalesNet ?? 0)}</strong>
	        </div>
	        <div className="panel finance-kpi-card">
	          <span>Despesas</span>
	          <strong>{formatCurrency(data?.totals.expensesNet ?? 0)}</strong>
	        </div>
	        <div className="panel finance-kpi-card">
	          <span>Despesas recorrentes</span>
	          <strong>{formatCurrency(data?.totals.recurringExpensesNet ?? 0)}</strong>
	        </div>
	      </div>

	      <div className="panel">
	        <div className="finance-transactions-head">
	          <h3>Saldos por tipo de conta</h3>
	          <Link to="/app/financeiro/contas" className="ghost">Gerenciar contas</Link>
	        </div>
	        <div className="table">
	          {(data?.accountsByType ?? []).map((item) => (
	            <div key={item.accountType} className="list-row finance-compact-row">
	              <div>
	                <strong>{accountTypeLabels[item.accountType]}</strong>
	                <span className="muted">{item.count} conta(s)</span>
	              </div>
	              <strong>{formatCurrency(item.balanceAmount)}</strong>
	            </div>
	          ))}
	        </div>
	      </div>

	      <div className="panel">
	        <div className="finance-transactions-head">
	          <h3>Despesas por categoria</h3>
	          <div className="finance-section-actions">
	            <Link to="/app/financeiro/despesas" className="finance-link-button">Ver despesas</Link>
	            <button
	              type="button"
	              className="finance-section-toggle"
	              onClick={() => toggleFinanceSection('expensesByCategory')}
	              aria-label={isFinanceSectionExpanded('expensesByCategory') ? 'Recolher despesas por categoria' : 'Expandir despesas por categoria'}
	              aria-expanded={isFinanceSectionExpanded('expensesByCategory')}
	              aria-controls="finance-expenses-by-category"
	            >
	              <span className="material-symbols-outlined" aria-hidden="true">
	                {isFinanceSectionExpanded('expensesByCategory') ? 'expand_less' : 'expand_more'}
	              </span>
	            </button>
	          </div>
	        </div>
	        {isFinanceSectionExpanded('expensesByCategory') ? (
	          <div id="finance-expenses-by-category" className="table">
	            {(data?.expensesByCategory ?? []).map((item) => (
	              <div key={item.category} className="list-row finance-compact-row">
	                <div>
	                  <strong>{expenseCategoryLabels[item.category]}</strong>
	                  <span className="muted">{item.count} lancamento(s)</span>
	                </div>
	                <strong>{formatCurrency(item.amount)}</strong>
	              </div>
	            ))}
	          </div>
	        ) : null}
	      </div>

	      <div className="finance-breakdown-grid">
	        <div className="panel">
	          <div className="finance-transactions-head">
	            <h3>Vendas por origem</h3>
	            <div className="finance-section-actions">
	              <button
	                type="button"
	                className="finance-section-toggle"
	                onClick={() => toggleFinanceSection('salesByOrigin')}
	                aria-label={isFinanceSectionExpanded('salesByOrigin') ? 'Recolher vendas por origem' : 'Expandir vendas por origem'}
	                aria-expanded={isFinanceSectionExpanded('salesByOrigin')}
	                aria-controls="finance-sales-by-origin"
	              >
	                <span className="material-symbols-outlined" aria-hidden="true">
	                  {isFinanceSectionExpanded('salesByOrigin') ? 'expand_less' : 'expand_more'}
	                </span>
	              </button>
	            </div>
	          </div>
	          {isFinanceSectionExpanded('salesByOrigin') ? (
	            <div id="finance-sales-by-origin" className="table">
	              {(data?.salesByOrigin ?? []).map((item) => (
	              <div key={item.origin} className="list-row finance-compact-row">
	                <div>
	                  <strong>{saleOriginLabels[item.origin]}</strong>
	                  <span className="muted">{item.count} lancamento(s) • Lucro {formatCurrency(item.estimatedProfit)}</span>
	                </div>
	                <strong>{formatCurrency(item.net)}</strong>
	              </div>
	              ))}
	            </div>
	          ) : null}
	        </div>
	        <div className="panel">
	          <div className="finance-transactions-head">
	            <h3>Vendas por pagamento</h3>
	            <div className="finance-section-actions">
	              <button
	                type="button"
	                className="finance-section-toggle"
	                onClick={() => toggleFinanceSection('salesByPayment')}
	                aria-label={isFinanceSectionExpanded('salesByPayment') ? 'Recolher vendas por pagamento' : 'Expandir vendas por pagamento'}
	                aria-expanded={isFinanceSectionExpanded('salesByPayment')}
	                aria-controls="finance-sales-by-payment"
	              >
	                <span className="material-symbols-outlined" aria-hidden="true">
	                  {isFinanceSectionExpanded('salesByPayment') ? 'expand_less' : 'expand_more'}
	                </span>
	              </button>
	            </div>
	          </div>
	          {isFinanceSectionExpanded('salesByPayment') ? (
	            <div id="finance-sales-by-payment" className="table">
	              {(data?.salesByMethod ?? []).map((item) => (
	                <div key={item.method} className="list-row finance-compact-row">
	                  <div>
	                    <strong>{methodLabels[item.method]}</strong>
	                    <span className="muted">Bruto {formatCurrency(item.gross)} • Taxas {formatCurrency(item.fees)}</span>
	                  </div>
	                  <strong>{formatCurrency(item.net)}</strong>
	                </div>
	              ))}
	            </div>
	          ) : null}
	        </div>
	      </div>

	      <div className="panel finance-flow-panel">
        <h3>Fluxo diario</h3>
        <div className="finance-flow-bars">
          {flowData.map((item) => {
            const entries = item.orders + item.manualSales;
            const dayLabel = new Date(`${item.date}T00:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' });
            const entryHeight = Math.max((entries / flowMax) * 100, 6);
            const expenseHeight = Math.max((item.expenses / flowMax) * 100, 4);
            return (
              <div key={item.date} className="finance-flow-day">
                <div className="finance-flow-columns">
                  <div className="entry" style={{ height: `${entryHeight}%` }} />
                  <div className="expense" style={{ height: `${expenseHeight}%` }} />
                </div>
                <span>{dayLabel}</span>
              </div>
            );
          })}
        </div>
        <div className="finance-flow-legend">
          <span><i className="entry" />Entradas</span>
          <span><i className="expense" />Saidas</span>
        </div>
      </div>

      <div className="panel">
        <div className="finance-transactions-head">
          <h3>Ultimas transacoes</h3>
          <button type="button" className="ghost">Ver todas</button>
        </div>
        <div className="table">
          {transactions.map((item) => (
            <div key={item.id} className="list-row finance-transaction-row">
              <div>
                <strong>{item.title}</strong>
                <span className="muted">{item.method}</span>
              </div>
              <strong className={item.positive ? 'positive' : 'negative'}>
                {item.positive ? '+' : '-'}{formatCurrency(item.amount)}
              </strong>
            </div>
          ))}
        </div>
      </div>

	      <div className="panel">
	        <div className="finance-transactions-head">
	          <div>
	            <h3>Custo medio por origem</h3>
	            <p className="muted">Percentual usado para estimar lucro das vendas avulsas sem produtos detalhados.</p>
	          </div>
	          <div className="finance-section-actions">
	            <button type="button" className="ghost" onClick={saveOriginRules} disabled={originRulesSaving}>
	              {originRulesSaving ? 'Salvando...' : 'Salvar custos'}
	            </button>
	            <button
	              type="button"
	              className="finance-section-toggle"
	              onClick={() => toggleFinanceSection('originCostRules')}
	              aria-label={isFinanceSectionExpanded('originCostRules') ? 'Recolher custo medio por origem' : 'Expandir custo medio por origem'}
	              aria-expanded={isFinanceSectionExpanded('originCostRules')}
	              aria-controls="finance-origin-cost-rules"
	            >
	              <span className="material-symbols-outlined" aria-hidden="true">
	                {isFinanceSectionExpanded('originCostRules') ? 'expand_less' : 'expand_more'}
	              </span>
	            </button>
	          </div>
	        </div>
	        {isFinanceSectionExpanded('originCostRules') ? (
	          <div id="finance-origin-cost-rules" className="finance-origin-rules-grid">
	            {saleOriginKeys.map((origin) => {
	              const rule = originRules.find((item) => item.origin === origin);
	              return (
	                <label key={origin}>
	                  {saleOriginLabels[origin]}
	                  <input
	                    type="number"
	                    min={0}
	                    max={100}
	                    value={rule?.costPercent ?? 0}
	                    onChange={(event) => updateOriginRule(origin, Number(event.target.value || 0))}
	                  />
	                </label>
	              );
	            })}
	          </div>
	        ) : null}
	      </div>
    </div>
  );
};

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
	    if (isCreateView) {
	      setEditingId(null);
	      setShowForm(true);
	      setForm({ name: '', accountType: 'BANK', institution: '', balanceDate: todayDate, balanceAmount: 0, notes: '' });
	      return;
	    }
    if (editingRouteId) {
      const current = (accountsQuery.data ?? []).find((item) => item.id === editingRouteId);
      if (!current) return;
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

	  const toggleSaleReconciled = async (sale: ManualSale) => {
	    await apiFetch(`/finance/manual-sales/${sale.id}/reconciled`, {
	      method: 'PUT',
	      token: user?.token,
	      body: JSON.stringify({ reconciled: !sale.reconciled })
	    });
	    invalidateQueryCache(financeManualSalesKey);
	    invalidateQueryCache(financeDashboardKey);
	    await salesQuery.refetch();
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

export const FinanceRulesPage = () => {
  const { user } = useAuth();
  const rulesQuery = useFinanceRules(user?.token);
  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState<MethodRule[]>([]);

  useEffect(() => {
    if (rulesQuery.data?.rules) setRules(rulesQuery.data.rules);
  }, [rulesQuery.data]);

  if (!user?.modules?.includes('financeiro')) return <FinanceAccessBlocked />;

  const updateRule = (method: PaymentMethod, patch: Partial<MethodRule>) => {
    setRules((current) => current.map((item) => (item.method === method ? { ...item, ...patch } : item)));
  };

  const saveRules = async () => {
    setSaving(true);
    try {
      await apiFetch('/finance/method-rules', {
        method: 'PUT',
        token: user?.token,
        body: JSON.stringify({ rules })
      });
      invalidateQueryCache(financeRulesKey);
      invalidateQueryCache(financeDashboardKey);
      await rulesQuery.refetch();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="panel">
        <FinanceHeader title="Taxas por metodo" backTo="/app/financeiro" />
        <p className="muted">
          Use essas regras para transformar venda bruta em valor liquido. Exemplo: se o cartao cobra 3%, uma venda de R$ 100 entra como R$ 97 no financeiro.
        </p>
        <div className="table">
          {(['PIX', 'DINHEIRO', 'CARTAO', 'VOUCHER'] as PaymentMethod[]).map((method) => {
            const rule = rules.find((item) => item.method === method) ?? { method, mode: 'NONE' as RuleMode, value: 0 };
            return (
              <div key={method} className="table-row">
                <label>
                  Metodo de pagamento
                  <input value={methodLabels[method]} readOnly />
                </label>
                <label>
                  Regra
                  <SelectField
                    value={rule.mode}
                    onChange={(value) => updateRule(method, { mode: value as RuleMode })}
                    options={(Object.keys(modeLabels) as RuleMode[]).map((mode) => ({
                      value: mode,
                      label: modeLabels[mode]
                    }))}
                  />
                </label>
                <label>
                  Valor
                  {rule.mode === 'PERCENT' ? (
                    <input
                      type="number"
                      value={rule.value === 0 ? '' : rule.value}
                      min={0}
                      onChange={(event) => updateRule(method, { value: Number(event.target.value || 0) })}
                    />
                  ) : (
                    <MoneyInput value={rule.value} onChange={(value) => updateRule(method, { value })} />
                  )}
                </label>
              </div>
            );
          })}
        </div>
        <div className="actions">
              <button type="button" onClick={saveRules} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar taxas'}
          </button>
        </div>
      </div>
    </div>
  );
};

export const FinanceManualSalesPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const params = useParams<{ saleId?: string }>();
  const isCreateView = pathname.endsWith('/novo');
  const editingRouteId = pathname.includes('/editar/') ? params.saleId ?? null : null;
  const { from, to, setFrom, setTo } = useFinanceRange();
  const [filterTag, setFilterTag] = useState('');
  const [searchText, setSearchText] = useState('');
	  const salesQuery = useManualSales(user?.token, from, to, filterTag || undefined, searchText || undefined);
	  const tagsQuery = useManualSalesTags(user?.token);
	  const accountsQuery = useFinanceAccounts(user?.token);
	  const productsQuery = useFinanceProducts(user?.token);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(editingRouteId);
  const [showForm, setShowForm] = useState(Boolean(isCreateView || editingRouteId));
  const [form, setForm] = useState({
    accountId: '',
    occurredAt: `${todayDate}T09:00`,
    description: '',
    origin: 'balcao' as SaleOrigin,
	    tags: [] as string[],
	    lines: [{ paymentMethod: 'PIX' as PaymentMethod, amount: 0 }],
	    products: [] as ManualSaleProduct[],
	    notes: ''
  });

  if (!user?.modules?.includes('financeiro')) return <FinanceAccessBlocked />;

  useEffect(() => {
    if (isCreateView) {
      setEditingId(null);
      setShowForm(true);
      setForm({
        accountId: '',
        occurredAt: `${todayDate}T09:00`,
        description: '',
        origin: 'balcao',
	        tags: [],
	        lines: [{ paymentMethod: 'PIX', amount: 0 }],
	        products: [],
	        notes: ''
      });
      return;
    }
    if (editingRouteId) {
      const current = (salesQuery.data ?? []).find((item) => item.id === editingRouteId);
      if (!current) return;
      setEditingId(current.id);
      setShowForm(true);
      const currentTags = current.tags ?? [];
      const currentOrigin = currentTags.find(isSaleOrigin) ?? 'balcao';
      setForm({
        accountId: current.accountId ?? '',
        occurredAt: current.occurredAt.slice(0, 16),
        description: current.description,
        origin: currentOrigin,
	        tags: stripOriginTags(currentTags),
	        lines: [{ paymentMethod: current.paymentMethod, amount: current.amount }],
	        products: current.products ?? [],
	        notes: current.notes ?? ''
      });
      return;
    }
    setEditingId(null);
    setShowForm(false);
  }, [isCreateView, editingRouteId, salesQuery.data]);

  const tagOptions = tagsQuery.data?.tags ?? [];
  const reusableTagOptions = tagOptions.filter((tag) => !isSaleOrigin(tag));
  const grossTotal = form.lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);

  const resetForm = () => {
    setEditingId(null);
    setForm({
      accountId: '',
      occurredAt: `${todayDate}T09:00`,
      description: '',
      origin: 'balcao',
	      tags: [],
	      lines: [{ paymentMethod: 'PIX', amount: 0 }],
	      products: [],
	      notes: ''
    });
    setShowForm(false);
  };

  const addLine = () => {
    setForm((current) => ({
      ...current,
      lines: [...current.lines, { paymentMethod: 'PIX', amount: 0 }]
    }));
  };

  const updateLine = (index: number, patch: Partial<{ paymentMethod: PaymentMethod; amount: number }>) => {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line))
    }));
  };

	  const removeLine = (index: number) => {
	    setForm((current) => {
	      if (current.lines.length === 1) return current;
	      return { ...current, lines: current.lines.filter((_, lineIndex) => lineIndex !== index) };
	    });
	  };

	  const addSaleProduct = (productId: string) => {
	    const product = (productsQuery.data ?? []).find((item) => item.id === productId);
	    if (!product) return;
	    setForm((current) => {
	      if (current.products.some((item) => item.productId === product.id)) return current;
	      return {
	        ...current,
	        products: [
	          ...current.products,
	          {
	            productId: product.id,
	            name: product.name,
	            unitPrice: product.unitPrice || product.salePrice || 0,
	            quantity: 1
	          }
	        ]
	      };
	    });
	  };

	  const updateSaleProduct = (index: number, patch: Partial<ManualSaleProduct>) => {
	    setForm((current) => ({
	      ...current,
	      products: current.products.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
	    }));
	  };

	  const removeSaleProduct = (index: number) => {
	    setForm((current) => ({
	      ...current,
	      products: current.products.filter((_, itemIndex) => itemIndex !== index)
	    }));
	  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const validLines = form.lines.filter((line) => Number(line.amount) > 0);
      if (!validLines.length) {
        setSaving(false);
        return;
      }
      const basePayload = {
        accountId: form.accountId || undefined,
	        occurredAt: new Date(form.occurredAt).toISOString(),
	        description: form.description,
	        tags: Array.from(new Set([form.origin, ...stripOriginTags(form.tags)])),
	        products: form.products,
	        notes: form.notes
	      };
      await apiFetch(editingId ? `/finance/manual-sales/${editingId}` : '/finance/manual-sales', {
        method: editingId ? 'PUT' : 'POST',
        token: user?.token,
        body: JSON.stringify(
          editingId
            ? {
                ...basePayload,
                paymentMethod: validLines[0].paymentMethod,
                amount: validLines[0].amount
              }
            : {
                ...basePayload,
                lines: validLines
              }
        )
      });
      invalidateQueryCache(financeManualSalesKey);
      invalidateQueryCache(`${financeManualSalesKey}:tags`);
      invalidateQueryCache(financeDashboardKey);
      await salesQuery.refetch();
      await tagsQuery.refetch();
      resetForm();
      navigate('/app/financeiro/vendas-manuais');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      {showForm ? (
      <div className="panel">
        <FinanceHeader title={editingId ? 'Editar venda avulsa' : 'Nova venda avulsa'} backTo="/app/financeiro/vendas-manuais" />
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
            <label>
              Origem
              <SelectField
                value={form.origin}
                onChange={(value) => setForm({ ...form, origin: value as SaleOrigin })}
                options={saleOriginKeys.map((key) => ({ value: key, label: saleOriginLabels[key] }))}
              />
            </label>
            <label>Descricao<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required /></label>
            <label>
              Marcadores
              <TagInput value={form.tags} onChange={(value) => setForm({ ...form, tags: stripOriginTags(value) })} placeholder="Ex: evento, feira, loja parceira" />
            </label>
            <div className="finance-tag-reuse">
              {reusableTagOptions.slice(0, 12).map((tag) => (
                <button
                  type="button"
                  key={tag}
                  className="ghost"
                  onClick={() => setForm((current) => ({ ...current, tags: current.tags.includes(tag) ? current.tags : [...current.tags, tag] }))}
                >
                  #{tag}
                </button>
              ))}
            </div>
          </div>
          <div className="finance-lines-block">
            <div className="finance-lines-head">
              <div>
                <strong>Formas de recebimento</strong>
                <span className="muted">Lance o total vendido por forma de pagamento.</span>
              </div>
              {!editingId ? <button type="button" className="finance-inline-button" onClick={addLine}>Adicionar forma</button> : null}
            </div>
            <div className="finance-lines-list">
              {form.lines.map((line, index) => (
                <div className="finance-line-row finance-payment-row" key={`${line.paymentMethod}-${index}`}>
                  <SelectField
                    value={line.paymentMethod}
                    onChange={(value) => updateLine(index, { paymentMethod: value as PaymentMethod })}
                    options={(Object.keys(methodLabels) as PaymentMethod[]).map((key) => ({ value: key, label: methodLabels[key] }))}
                  />
                  <div className="finance-payment-value-group">
                    <MoneyInput value={line.amount} onChange={(value) => updateLine(index, { amount: value })} />
                    {!editingId ? (
                      <button type="button" className="icon-button" aria-label="Remover forma" onClick={() => removeLine(index)}>
                        <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
	            <div className="finance-lines-total">
	              <span>Total bruto</span>
	              <strong>{formatCurrency(grossTotal)}</strong>
	            </div>
	          </div>
	          <div className="finance-lines-block">
	            <div className="finance-lines-head">
	              <strong>Produtos vendidos</strong>
	              <span className="muted">Opcional. Use quando quiser detalhar a venda de balcao.</span>
	            </div>
	            <SelectField
	              value=""
	              onChange={addSaleProduct}
	              options={(productsQuery.data ?? [])
	                .filter((product) => !form.products.some((item) => item.productId === product.id))
	                .map((product) => ({ value: product.id, label: product.name }))}
	              placeholder="Adicionar produto"
	            />
	            <div className="finance-lines-list">
	              {form.products.map((item, index) => (
	                <div className="finance-line-row" key={item.productId}>
	                  <span>{item.name}</span>
	                  <input
	                    type="number"
	                    min={0.01}
	                    step="0.01"
	                    value={item.quantity}
	                    onChange={(event) => updateSaleProduct(index, { quantity: Number(event.target.value || 0) })}
	                  />
	                  <button type="button" className="icon-button" aria-label="Remover produto" onClick={() => removeSaleProduct(index)}>
	                    <span className="material-symbols-outlined" aria-hidden="true">delete</span>
	                  </button>
	                </div>
	              ))}
	            </div>
	          </div>
	          <label>Observacoes<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          <div className="actions">
            <button type="button" className="ghost" onClick={() => navigate('/app/financeiro/vendas-manuais')}>Cancelar</button>
	            <button type="submit" disabled={saving}>{saving ? 'Salvando...' : editingId ? 'Salvar venda' : 'Cadastrar venda'}</button>
          </div>
        </form>
      </div>
      ) : null}

      {!isCreateView && !editingRouteId ? (
      <div className="panel">
        <FinanceHeader title="Vendas avulsas" backTo="/app/financeiro" />
        <ListToolbar
          title=""
          searchValue={searchText}
          onSearch={setSearchText}
          actionLabel="Nova venda"
          onAction={() => navigate('/app/financeiro/vendas-manuais/novo')}
        />
        <div className="finance-filter-row">
          <label className="finance-filter-field">
            <span>De</span>
            <input type="date" className="finance-date-input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="finance-filter-field">
            <span>Ate</span>
            <input type="date" className="finance-date-input" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="finance-filter-field">
            <span>Buscar</span>
            <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Descricao da venda" />
          </label>
          <label className="finance-filter-field">
	            <span>Origem ou marcador</span>
            <SelectField
              value={filterTag}
              onChange={(value) => setFilterTag(value)}
              options={tagOptions.map((tag) => ({
                value: tag,
                label: isSaleOrigin(tag) ? saleOriginLabels[tag] : `#${tag}`
              }))}
              placeholder="Todas"
            />
          </label>
        </div>
        <div className="table">
          {(salesQuery.data ?? []).map((item) => (
            <div key={item.id} className="list-row">
              <div>
                <strong>{item.description}</strong>
                <span className="muted">
                  {new Date(item.occurredAt).toLocaleString('pt-BR')} • {methodLabels[item.paymentMethod]} • {formatCurrency(item.netAmount)}
                </span>
	                {item.tags?.length ? (
	                  <span className="finance-list-tags">
	                    {item.tags.map((tag) => (isSaleOrigin(tag) ? saleOriginLabels[tag] : `#${tag}`)).join('  ')}
	                  </span>
	                ) : null}
	                {item.products?.length ? (
	                  <span className="finance-list-tags">
	                    {item.products.map((product) => `${product.name} x${product.quantity}`).join('  ')}
	                  </span>
	                ) : null}
	              </div>
	              <button
	                type="button"
	                className="icon-button"
	                aria-label={item.reconciled ? 'Marcar venda como nao conferida' : 'Marcar venda como conferida'}
	                onClick={() => toggleSaleReconciled(item)}
	              >
	                <span className="material-symbols-outlined" aria-hidden="true">{item.reconciled ? 'check_circle' : 'radio_button_unchecked'}</span>
	              </button>
	              <button
	                type="button"
	                className="icon-button"
	                onClick={() => navigate(`/app/financeiro/vendas-manuais/editar/${item.id}`)}
	              >
                <span className="material-symbols-outlined" aria-hidden="true">edit</span>
              </button>
            </div>
          ))}
        </div>
      </div>
      ) : null}
    </div>
  );
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
	  const [showForm, setShowForm] = useState(Boolean(isCreateView || editingRouteId));
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
    if (isCreateView) {
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
      <div className="panel">
        <FinanceHeader title="Despesas" backTo="/app/financeiro" />
        <ListToolbar
          title=""
          searchValue={search}
          onSearch={setSearch}
          actionLabel="Nova despesa"
          onAction={() => navigate('/app/financeiro/despesas/novo')}
        />
        <div className="finance-filter-row">
          <label className="finance-filter-field">
            <span>De</span>
            <input type="date" className="finance-date-input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
	          <label className="finance-filter-field">
	            <span>Ate</span>
	            <input type="date" className="finance-date-input" value={to} onChange={(e) => setTo(e.target.value)} />
	          </label>
	          <label className="finance-filter-field">
	            <span>Categoria</span>
	            <SelectField
	              value={categoryFilter}
	              onChange={setCategoryFilter}
	              options={expenseCategoryKeys.map((key) => ({ value: key, label: expenseCategoryLabels[key] }))}
	              placeholder="Todas"
	            />
	          </label>
	        </div>
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
            </div>
          ))}
        </div>
      </div>
      ) : null}
    </div>
  );
};
