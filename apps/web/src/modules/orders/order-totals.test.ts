import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateOrderTotals } from './order-totals.js';

test('calcula produtos, adicionais, desconto, frete e pagamentos', () => {
  const totals = calculateOrderTotals({
    products: [{ productId: 'produto', name: 'Bolo', unitPrice: 50, quantity: 2 }],
    additions: [
      { label: 'Decoracao', mode: 'FIXED', value: 10 },
      { label: 'Urgencia', mode: 'PERCENT', value: 10 }
    ],
    discountMode: 'PERCENT',
    discountValue: 10,
    shippingValue: 15,
    payments: [{ date: '2026-08-29', amount: 50 }]
  });

  assert.deepEqual(totals, {
    productsTotal: 100,
    additionsTotal: 20,
    discountTotal: 12,
    subtotal: 108,
    total: 123,
    paid: 50,
    pending: 73
  });
});

test('calcula desconto fixo sem alterar a base dos adicionais percentuais', () => {
  const totals = calculateOrderTotals({
    products: [{ productId: 'produto', name: 'Doces', unitPrice: 5, quantity: 20 }],
    additions: [{ label: 'Embalagem especial', mode: 'PERCENT', value: 5 }],
    discountMode: 'FIXED',
    discountValue: 10,
    shippingValue: 0,
    payments: []
  });

  assert.equal(totals.additionsTotal, 5);
  assert.equal(totals.total, 95);
  assert.equal(totals.pending, 95);
});
