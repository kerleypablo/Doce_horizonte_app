import { apiFetch } from '../shared/api.ts';
import type { CompanySettings, CustomerForm, CustomerItem, OrderCustomerSnapshot, OrderItem, OrderListItem, OrderStatus, ProductItem } from './order-types.ts';
import type { OrderFormState } from './order-form.ts';
import { onlyDigits } from './order-formatters.ts';

type Token = string | undefined;
export type OrderSavePayload = Omit<OrderFormState, 'deliveryAddress'> & {
  deliveryAddress?: string;
  customerSnapshot?: OrderCustomerSnapshot;
};

export const orderService = {
  list: (token: Token) => apiFetch<OrderListItem[]>('/orders?view=list', { token }),
  listPage: (params: URLSearchParams, token: Token) => apiFetch<{ items: OrderListItem[]; hasMore: boolean }>(`/orders?${params.toString()}`, { token }),
  detail: (id: string, token: Token) => apiFetch<OrderItem>(`/orders/${id}`, { token }),
  customers: (token: Token) => apiFetch<CustomerItem[]>('/customers', { token }),
  products: (token: Token) => apiFetch<ProductItem[]>('/products', { token }),
  settings: (token: Token) => apiFetch<CompanySettings>('/company/settings', { token }),
  save: (id: string | null, payload: OrderSavePayload, token: Token) => apiFetch(id ? `/orders/${id}` : '/orders', { method: id ? 'PUT' : 'POST', token, body: JSON.stringify(payload) }),
  updateStatus: (id: string, status: OrderStatus, token: Token) => apiFetch<OrderItem>(`/orders/${id}/status`, { method: 'PATCH', token, body: JSON.stringify({ status }) }),
  remove: (id: string, token: Token) => apiFetch(`/orders/${id}`, { method: 'DELETE', token }),
  createCustomer: (form: CustomerForm, token: Token) => apiFetch<CustomerItem>('/customers', { method: 'POST', token, body: JSON.stringify({ ...form, phone: onlyDigits(form.phone) }) })
};
