import { useCachedQuery } from '../shared/queryCache.ts';
import { queryKeys } from '../shared/queryKeys.ts';
import { orderService } from './order-service.ts';

export const useOrderData = (token: string | undefined, orderId: string | undefined, detailEnabled: boolean, formEnabled: boolean) => {
  const enabled = Boolean(token);
  const ordersQuery = useCachedQuery(queryKeys.orders, () => orderService.list(token), {
    staleTime: 60_000, enabled: false
  });
  const detailQuery = useCachedQuery(`order-detail:${orderId ?? ''}`, () => orderService.detail(orderId ?? '', token), {
    staleTime: 60_000, enabled: enabled && detailEnabled && Boolean(orderId)
  });
  const customersQuery = useCachedQuery(queryKeys.customers, () => orderService.customers(token), {
    staleTime: 3 * 60_000, enabled: enabled && formEnabled
  });
  const productsQuery = useCachedQuery(queryKeys.products, () => orderService.products(token), {
    staleTime: 3 * 60_000, enabled: enabled && formEnabled
  });
  const settingsQuery = useCachedQuery(queryKeys.companySettings, () => orderService.settings(token), {
    staleTime: 5 * 60_000, enabled: enabled && formEnabled
  });

  return { ordersQuery, detailQuery, customersQuery, productsQuery, settingsQuery };
};
