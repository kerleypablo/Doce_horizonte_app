import type {
  AccountType,
  ExpenseCategory,
  PaymentMethod,
  RuleMode,
  SaleOrigin
} from './types.ts';

export const financeDashboardKey = 'finance-dashboard';
export const financeAccountsKey = 'finance-accounts';
export const financeRulesKey = 'finance-rules';
export const financeOriginCostRulesKey = 'finance-origin-cost-rules';
export const financeManualSalesKey = 'finance-manual-sales';
export const financeExpensesKey = 'finance-expenses';

export const methodLabels: Record<PaymentMethod, string> = {
  PIX: 'Pix',
  DINHEIRO: 'Dinheiro',
  CARTAO: 'Cartao',
  VOUCHER: 'Voucher'
};

export const modeLabels: Record<RuleMode, string> = {
  NONE: 'Sem ajuste',
  PERCENT: 'Percentual',
  FIXED_ADD: 'Somar valor fixo',
  FIXED_SUBTRACT: 'Subtrair valor fixo'
};

export const saleOriginLabels: Record<SaleOrigin, string> = {
  balcao: 'Balcao',
  rua: 'Rua',
  'porta-a-porta': 'Porta a porta',
  ifood: 'iFood',
  outros: 'Outros'
};

export const saleOriginKeys = Object.keys(saleOriginLabels) as SaleOrigin[];
export const manualSaleOriginKeys: SaleOrigin[] = ['balcao', 'rua', 'ifood'];

export const accountTypeLabels: Record<AccountType, string> = {
  BANK: 'Banco',
  CASH: 'Caixa fisico',
  CARD_RECEIVABLE: 'Maquininha a receber',
  IFOOD_RECEIVABLE: 'iFood a receber',
  OTHER: 'Outro'
};

export const accountTypeKeys = Object.keys(accountTypeLabels) as AccountType[];

export const expenseCategoryLabels: Record<ExpenseCategory, string> = {
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

export const expenseCategoryKeys = Object.keys(expenseCategoryLabels) as ExpenseCategory[];
