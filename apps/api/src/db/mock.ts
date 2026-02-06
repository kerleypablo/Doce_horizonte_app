import { randomUUID } from 'node:crypto';

export type Role = 'admin' | 'common';

export type User = {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  companyId: string;
};

export type Company = {
  id: string;
  name: string;
  settings: CompanySettings;
};

export type CompanySettings = {
  overheadMethod: 'PERCENT_DIRECT' | 'PER_UNIT';
  overheadPercent: number; // percent of direct cost
  overheadPerUnit: number; // R$ per unit
  laborCostPerHour: number;
  fixedCostPerHour: number;
  taxesPercent: number; // taxes over sale price
  defaultProfitPercent: number;
  salesChannels: SalesChannel[];
};

export type SalesChannel = {
  id: string;
  name: string;
  feePercent: number; // marketplace commission
  paymentFeePercent: number; // payment processor fee
  feeFixed: number; // fixed fee per order/item
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
  yield: number; // number of portions/units produced
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
  recipeId: string;
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

export const db = {
  users: [] as User[],
  companies: [] as Company[],
  inputs: [] as Input[],
  recipes: [] as Recipe[],
  products: [] as Product[]
};

export const seed = () => {
  if (db.companies.length > 0) return;

  const companyId = randomUUID();
  db.companies.push({
    id: companyId,
    name: 'Confeitaria Demo',
    settings: {
      overheadMethod: 'PERCENT_DIRECT',
      overheadPercent: 12,
      overheadPerUnit: 0,
      laborCostPerHour: 0,
      fixedCostPerHour: 0,
      taxesPercent: 4,
      defaultProfitPercent: 30,
      salesChannels: [
        {
          id: randomUUID(),
          name: 'Loja Propria',
          feePercent: 0,
          paymentFeePercent: 2.5,
          feeFixed: 0,
          active: true
        },
        {
          id: randomUUID(),
          name: 'iFood',
          feePercent: 23,
          paymentFeePercent: 0,
          feeFixed: 0,
          active: true
        }
      ]
    }
  });

  db.users.push({
    id: randomUUID(),
    email: 'admin@demo.com',
    passwordHash: 'admin',
    role: 'admin',
    companyId
  });
};
