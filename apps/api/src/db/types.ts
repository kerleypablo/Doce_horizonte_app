export type Role = 'master' | 'admin' | 'common';
export type {
  CompanySettings,
  CostItem,
  Input,
  Product,
  Recipe,
  RecipeIngredient,
  SalesChannel,
  Unit
} from '@doce-horizonte/domain';

export type Customer = {
  id: string;
  companyId: string;
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

export type Order = {
  id: string;
  companyId: string;
  number: string;
  type: 'PEDIDO' | 'ORCAMENTO';
  orderDateTime: string;
  customerId?: string;
  deliveryAddress?: string;
  customerSnapshot?: Record<string, unknown>;
  deliveryType: 'ENTREGA' | 'RETIRADA';
  deliveryDate?: string;
  status: 'CONCLUIDO' | 'CONFIRMADO' | 'CANCELADO';
  products: Record<string, unknown>[];
  additions: Record<string, unknown>[];
  discountMode: 'PERCENT' | 'FIXED';
  discountValue: number;
  shippingValue: number;
  notesDelivery?: string;
  notesGeneral?: string;
  notesPayment?: string;
  pix?: string;
  terms?: string;
  payments: Record<string, unknown>[];
  images: Record<string, unknown>[];
  alerts: Record<string, unknown>[];
};
