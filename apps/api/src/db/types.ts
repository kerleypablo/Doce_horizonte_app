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
