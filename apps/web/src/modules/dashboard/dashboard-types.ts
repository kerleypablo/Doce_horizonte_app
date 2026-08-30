export type DashboardOrderStatus = 'AGUARDANDO_RETORNO' | 'CONCLUIDO' | 'CONFIRMADO' | 'CANCELADO';

export type DashboardOrder = {
  id: string;
  number: string;
  orderDateTime: string;
  deliveryDate?: string;
  deliveryType?: 'ENTREGA' | 'RETIRADA';
  status: DashboardOrderStatus;
  products?: { name: string; quantity: number; unitPrice?: number }[];
  customerSnapshot?: { name: string };
  additions?: { mode: 'PERCENT' | 'FIXED'; value: number }[];
  discountMode?: 'PERCENT' | 'FIXED';
  discountValue?: number;
  shippingValue?: number;
  total?: number;
};

export type CompanySettings = {
  companyName?: string;
  logoDataUrl?: string;
};

export type CalendarCell = { day: number; dateKey: string } | null;
