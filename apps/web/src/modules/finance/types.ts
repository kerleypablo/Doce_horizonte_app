export type PaymentMethod = 'PIX' | 'DINHEIRO' | 'CARTAO' | 'VOUCHER';
export type RuleMode = 'NONE' | 'PERCENT' | 'FIXED_ADD' | 'FIXED_SUBTRACT';
export type SaleOrigin = 'balcao' | 'rua' | 'porta-a-porta' | 'ifood' | 'outros';
export type AccountType = 'BANK' | 'CASH' | 'CARD_RECEIVABLE' | 'IFOOD_RECEIVABLE' | 'OTHER';
export type ExpenseCategory =
  | 'INSUMOS'
  | 'EMBALAGENS'
  | 'ALUGUEL'
  | 'ENERGIA'
  | 'FUNCIONARIO'
  | 'ENTREGA'
  | 'TAXAS'
  | 'MARKETING'
  | 'OUTROS';

export type FinanceAccount = {
  id: string;
  name: string;
  accountType: AccountType;
  institution?: string;
  balanceDate: string;
  balanceAmount: number;
  notes?: string;
};

export type FinanceAccountDailyBalance = {
  date: string;
  totalBalance: number;
};

export type FinanceAccountHistorySeries = {
  accountId: string;
  accountName: string;
  points: Array<{ date: string; balance: number }>;
};

export type FinanceAccountAdjustment = {
  id: string;
  accountId: string;
  kind: 'ENTRY' | 'EXIT' | 'BALANCE';
  origin?: SaleOrigin;
  occurredAt: string;
  description: string;
  paymentMethod?: PaymentMethod;
  amount: number;
  category?: ExpenseCategory;
  notes?: string;
};

export type FinanceAccountsSummary = {
  range: { from: string; to: string };
  history: FinanceAccountDailyBalance[];
  historyByAccount: FinanceAccountHistorySeries[];
  accounts: Array<{ accountId: string; currentBalance: number }>;
  adjustments: FinanceAccountAdjustment[];
};

export type MethodRule = {
  method: PaymentMethod;
  mode: RuleMode;
  value: number;
};

export type OriginCostRule = {
  origin: SaleOrigin;
  costPercent: number;
};

export type FinanceProduct = {
  id: string;
  name: string;
  unitPrice: number;
  salePrice: number;
};

export type ManualSaleProduct = {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
};

export type ManualSaleFormLine = {
  id: string;
  paymentMethod: PaymentMethod;
  amount: number;
};

export type ManualSale = {
  id: string;
  accountId?: string;
  occurredAt: string;
  description: string;
  paymentMethod: PaymentMethod;
  amount: number;
  netAmount: number;
  tags: string[];
  products: ManualSaleProduct[];
  notes?: string;
};

export type Expense = {
  id: string;
  accountId?: string;
  occurredAt: string;
  description: string;
  category: ExpenseCategory;
  paymentMethod: PaymentMethod;
  amount: number;
  netAmount: number;
  recurring: boolean;
  notes?: string;
};

export type DailyClosing = {
  id: string;
  accountId: string;
  date: string;
  checkedBalance: number;
  notes?: string;
};

export type AccountClosing = {
  id: string | null;
  accountId: string;
  accountName: string;
  accountType: AccountType;
  balanceDate?: string | null;
  baseBalance: number;
  projectedBalance: number;
  checkedBalance: number | null;
  difference: number | null;
  notes?: string;
};

export type DashboardData = {
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
  methodRules: MethodRule[];
  originCostRules: OriginCostRule[];
  dailyClosing: DailyClosing | null;
  accountClosings: AccountClosing[];
  accountsByType: Array<{ accountType: AccountType; balanceAmount: number; count: number }>;
  accounts: Array<{ id: string; name: string; accountType: AccountType; balanceAmount: number }>;
};
