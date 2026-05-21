import type { ManualSaleFormLine, SaleOrigin } from './types.ts';
import { saleOriginKeys } from './constants.ts';

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

export const formatCompactCurrency = (value: number) => {
  const amount = Number(value || 0);
  if (Math.abs(amount) < 1000) return formatCurrency(amount);

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(amount);
};

export const today = new Date();
export const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
export const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

export const isSaleOrigin = (value: string): value is SaleOrigin =>
  saleOriginKeys.includes(value as SaleOrigin);

export const stripOriginTags = (tags: string[]) => tags.filter((tag) => !isSaleOrigin(tag));

export const createManualSaleLine = (
  paymentMethod: ManualSaleFormLine['paymentMethod'] = 'PIX',
  amount = 0
): ManualSaleFormLine => ({
  id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
  paymentMethod,
  amount
});

export const createEmptyManualSaleForm = () => ({
  occurredAt: `${todayDate}T09:00`,
  description: '',
  origin: 'balcao' as SaleOrigin,
  tags: [] as string[],
  lines: [createManualSaleLine()],
  products: [],
  notes: ''
});
