import { useState } from 'react';
import { apiFetch } from '../shared/api.ts';
import { useCachedQuery } from '../shared/queryCache.ts';
import {
  financeAccountsKey,
  financeAccountsSummaryKey,
  financeDashboardKey,
  financeExpensesKey,
  financeManualSalesKey,
  financeRulesKey
} from './constants.ts';
import { monthStart, todayDate } from './utils.ts';
import type {
  DashboardData,
  Expense,
  FinanceAccount,
  FinanceAccountsSummary,
  FinanceProduct,
  ManualSale,
  MethodRule
} from './types.ts';

export const useFinanceRange = () => {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(todayDate);
  return { from, to, setFrom, setTo };
};

export const useFinanceDashboard = (token?: string, from?: string, to?: string) =>
  useCachedQuery(
    `${financeDashboardKey}:${from ?? ''}:${to ?? ''}`,
    () => apiFetch<DashboardData>(`/finance/dashboard?from=${from}&to=${to}`, { token }),
    { enabled: Boolean(token && from && to), staleTime: 45_000 }
  );

export const useFinanceAccounts = (token?: string) =>
  useCachedQuery(
    financeAccountsKey,
    () => apiFetch<FinanceAccount[]>('/finance/accounts', { token }),
    { enabled: Boolean(token), staleTime: 45_000 }
  );

export const useFinanceAccountsSummary = (token?: string, from?: string, to?: string) =>
  useCachedQuery(
    `${financeAccountsSummaryKey}:${from ?? ''}:${to ?? ''}`,
    () => apiFetch<FinanceAccountsSummary>(`/finance/accounts/summary?from=${from}&to=${to}`, { token }),
    { enabled: Boolean(token && from && to), staleTime: 30_000 }
  );

export const useFinanceRules = (token?: string) =>
  useCachedQuery(
    financeRulesKey,
    () => apiFetch<{ rules: MethodRule[] }>('/finance/method-rules', { token }),
    { enabled: Boolean(token), staleTime: 45_000 }
  );

export const useManualSales = (token?: string, from?: string, to?: string, tag?: string, search?: string) =>
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

export const useManualSalesTags = (token?: string) =>
  useCachedQuery(
    `${financeManualSalesKey}:tags`,
    () => apiFetch<{ tags: string[] }>('/finance/manual-sales/tags', { token }),
    { enabled: Boolean(token), staleTime: 60_000 }
  );

export const useExpenses = (token?: string, from?: string, to?: string) =>
  useCachedQuery(
    `${financeExpensesKey}:${from ?? ''}:${to ?? ''}`,
    () => apiFetch<Expense[]>(`/finance/expenses?from=${from}&to=${to}`, { token }),
    { enabled: Boolean(token && from && to), staleTime: 30_000 }
  );

export const useFinanceProducts = (token?: string) =>
  useCachedQuery(
    'finance-products',
    () => apiFetch<FinanceProduct[]>('/products', { token }),
    { enabled: Boolean(token), staleTime: 60_000 }
  );
