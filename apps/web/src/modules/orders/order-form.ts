import type { CompanySettings, OrderItem } from './order-types.ts';

const toDateTimeLocal = (iso?: string) => {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const createOrderForm = (defaults?: CompanySettings) => ({
  type: 'PEDIDO' as OrderItem['type'],
  orderDateTime: toDateTimeLocal(new Date().toISOString()),
  customerId: '', deliveryAddress: '', deliveryType: 'ENTREGA' as OrderItem['deliveryType'], deliveryDate: '', status: 'AGUARDANDO_RETORNO' as OrderItem['status'],
  products: [] as OrderItem['products'], additions: [] as OrderItem['additions'], discountMode: 'FIXED' as OrderItem['discountMode'], discountValue: 0, shippingValue: 0,
  notesDelivery: defaults?.defaultNotesDelivery ?? '', notesGeneral: defaults?.defaultNotesGeneral ?? '', notesPayment: defaults?.defaultNotesPayment ?? '', pix: '', terms: '',
  payments: [] as OrderItem['payments'], images: [] as OrderItem['images'], alerts: [{ label: 'Lembrar 3 dias antes da entrega', enabled: false }, { label: 'Lembrar 1 dia antes da entrega', enabled: false }] as OrderItem['alerts']
});

export type OrderFormState = ReturnType<typeof createOrderForm>;
export { toDateTimeLocal };
