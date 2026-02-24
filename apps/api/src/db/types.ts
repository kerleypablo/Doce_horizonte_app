export type Role = 'admin' | 'common';

export type CompanySettings = {
  overheadMethod: 'PERCENT_DIRECT' | 'PER_UNIT';
  overheadPercent: number;
  overheadPerUnit: number;
  laborCostPerHour: number;
  fixedCostPerHour: number;
  taxesPercent: number;
  defaultProfitPercent: number;
  salesChannels: SalesChannel[];
};

export type SalesChannel = {
  id: string;
  name: string;
  feePercent: number;
  paymentFeePercent: number;
  feeFixed: number;
  active: boolean;
};

export type Input = {
  id: string;
  companyId: string;
  name: string;
  brand?: string;
  category: 'embalagem' | 'producao' | 'outros';
  unit: 'kg' | 'g' | 'l' | 'ml' | 'un';
  packageSize: number;
  packagePrice: number;
  tags: string[];
  notes?: string;
};

export type RecipeIngredient = {
  inputId: string;
  quantity: number;
  unit: 'kg' | 'g' | 'l' | 'ml' | 'un';
};

export type Recipe = {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  prepTimeMinutes: number;
  yield: number;
  yieldUnit: 'kg' | 'g' | 'l' | 'ml' | 'un';
  ingredients: RecipeIngredient[];
  subRecipes: { recipeId: string; quantity: number }[];
  tags: string[];
  notes?: string;
};

export type Product = {
  id: string;
  companyId: string;
  name: string;
  recipeId?: string;
  prepTimeMinutes: number;
  notes?: string;
  unitsCount: number;
  targetProfitPercent: number;
  extraPercent: number;
  unitPrice: number;
  salePrice: number;
  channelId?: string;
  extraRecipes: { recipeId: string; quantity: number }[];
  extraProducts: { productId: string; quantity: number }[];
  packagingInputs: { inputId: string; quantity: number; unit: 'kg' | 'g' | 'l' | 'ml' | 'un' }[];
};

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
