import { calculateOrderTotals } from '../orders/order-totals.ts';
import { normalizeDateKey, toDateKey } from '../shared/date.ts';
import type { DashboardOrder, DashboardOrderStatus } from './dashboard-types.ts';

export const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
export const endOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);

export const startOfWeek = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - next.getDay());
  return next;
};

export const endOfWeek = (date: Date) => {
  const next = startOfWeek(date);
  next.setDate(next.getDate() + 6);
  return next;
};

export const getOrderReferenceDateKey = (order: DashboardOrder) =>
  normalizeDateKey(order.deliveryDate) ?? normalizeDateKey(order.orderDateTime);

export const getOrderDateKeys = (order: DashboardOrder) => {
  const deliveryKey = normalizeDateKey(order.deliveryDate);
  return deliveryKey ? [deliveryKey] : [];
};

export const getOrderTotal = (order: DashboardOrder) => {
  if (typeof order.total === 'number') return Number(order.total ?? 0);
  return calculateOrderTotals({
    products: order.products ?? [],
    additions: order.additions ?? [],
    discountMode: order.discountMode ?? 'FIXED',
    discountValue: order.discountValue ?? 0,
    shippingValue: order.shippingValue ?? 0,
    payments: []
  }).total;
};

export const isConfirmedOrder = (order: DashboardOrder) =>
  order.status === 'CONFIRMADO' || order.status === 'CONCLUIDO';

export const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
}).format(value);

export const formatOrderTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

export const formatDateLabel = (dateKey: string) => {
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' });
};

export const getGreeting = (date: Date) => {
  const hour = date.getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
};

const statusDetails: Record<DashboardOrderStatus, { label: string; tone: string }> = {
  AGUARDANDO_RETORNO: { label: 'Aguardando retorno', tone: 'pending' },
  CONFIRMADO: { label: 'Confirmado', tone: 'confirmed' },
  CONCLUIDO: { label: 'Concluído', tone: 'completed' },
  CANCELADO: { label: 'Cancelado', tone: 'cancelled' }
};

export const getStatusDetails = (status: DashboardOrderStatus) => statusDetails[status];

export const buildWeekCells = (selectedDate: string) => {
  const selected = new Date(`${selectedDate}T12:00:00`);
  if (Number.isNaN(selected.getTime())) return [];
  const weekStart = startOfWeek(selected);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + index);
    return { day: day.getDate(), dateKey: toDateKey(day) };
  });
};
