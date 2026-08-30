import type { OrderItem } from './order-types.ts';

export type OrderTotals = {
  productsTotal: number;
  additionsTotal: number;
  discountTotal: number;
  subtotal: number;
  total: number;
  paid: number;
  pending: number;
};

type OrderTotalsInput = Pick<
  OrderItem,
  'products' | 'additions' | 'discountMode' | 'discountValue' | 'shippingValue' | 'payments'
>;

export const calculateOrderTotals = (order: OrderTotalsInput): OrderTotals => {
  const productsTotal = order.products.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );
  const additionsTotal = order.additions.reduce(
    (sum, item) => sum + (item.mode === 'FIXED' ? item.value : productsTotal * item.value / 100),
    0
  );
  const discountBase = productsTotal + additionsTotal;
  const discountTotal = order.discountMode === 'FIXED'
    ? order.discountValue
    : discountBase * order.discountValue / 100;
  const subtotal = discountBase - discountTotal;
  const total = subtotal + order.shippingValue;
  const paid = order.payments.reduce((sum, payment) => sum + payment.amount, 0);

  return {
    productsTotal,
    additionsTotal,
    discountTotal,
    subtotal,
    total,
    paid,
    pending: total - paid
  };
};
