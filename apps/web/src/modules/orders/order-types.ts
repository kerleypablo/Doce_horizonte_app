export type CustomerItem = {
  id: string;
  name: string;
  phone: string;
  personType: 'PF' | 'PJ';
  email?: string;
  address?: string;
  number?: string;
  city?: string;
  neighborhood?: string;
  zipCode?: string;
  notes?: string;
};

export type CustomerForm = {
  name: string;
  phone: string;
  personType: 'PF' | 'PJ';
  email: string;
  address: string;
  number: string;
  city: string;
  neighborhood: string;
  zipCode: string;
  notes: string;
};

export type OrderCustomerSnapshot = Partial<CustomerItem> & {
  deliveryAddress?: string;
};

export type ProductItem = {
  id: string;
  name: string;
  unitPrice: number;
  salePrice: number;
};

export type OrderStatus = 'AGUARDANDO_RETORNO' | 'CONCLUIDO' | 'CONFIRMADO' | 'CANCELADO';
export type OrderStatusFilter = 'OPEN' | OrderStatus;
export type ValueConfigType = 'ADDITION' | 'DISCOUNT' | 'SHIPPING';

export type OrderItem = {
  id: string;
  number: string;
  type: 'PEDIDO' | 'ORCAMENTO';
  orderDateTime: string;
  customerId?: string;
  deliveryAddress?: string;
  customerSnapshot?: OrderCustomerSnapshot;
  deliveryType: 'ENTREGA' | 'RETIRADA';
  deliveryDate?: string;
  status: OrderStatus;
  products: { productId: string; name: string; unitPrice: number; quantity: number; notes?: string }[];
  additions: { label: string; mode: 'PERCENT' | 'FIXED'; value: number }[];
  discountMode: 'PERCENT' | 'FIXED';
  discountValue: number;
  shippingValue: number;
  notesDelivery?: string;
  notesGeneral?: string;
  notesPayment?: string;
  pix?: string;
  terms?: string;
  payments: { date: string; amount: number; note?: string }[];
  images: { name: string; dataUrl: string }[];
  alerts: { label: string; enabled: boolean }[];
};

export type OrderListItem = Pick<
  OrderItem,
  'id' | 'number' | 'type' | 'orderDateTime' | 'deliveryDate' | 'status' | 'customerSnapshot'
> & { total?: number };

export type CompanySettings = {
  companyName?: string;
  companyPhone?: string;
  companyEmail?: string;
  pixKey?: string;
  logoDataUrl?: string;
  defaultNotesDelivery?: string;
  defaultNotesGeneral?: string;
  defaultNotesPayment?: string;
};
