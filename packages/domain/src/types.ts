export type Unit = 'kg' | 'g' | 'l' | 'ml' | 'un';
export type OverheadMethod = 'PERCENT_DIRECT' | 'PER_UNIT';

export type CostItem = {
  id?: string;
  name: string;
  monthlyAmount: number;
  active: boolean;
};

export type SalesChannel = {
  id: string;
  name: string;
  feePercent: number;
  paymentFeePercent: number;
  feeFixed: number;
  active: boolean;
};

export type CompanySettings = {
  companyName?: string;
  logoDataUrl?: string;
  appTheme?: 'caramelo' | 'oceano' | 'floresta' | 'branco_pop';
  darkMode?: boolean;
  defaultNotesDelivery?: string;
  defaultNotesGeneral?: string;
  defaultNotesPayment?: string;
  productiveHoursPerMonth?: number;
  overheadMethod: OverheadMethod;
  overheadPercent: number;
  overheadPerUnit: number;
  laborCostItems?: CostItem[];
  fixedCostItems?: CostItem[];
  laborCostPerHour: number;
  fixedCostPerHour: number;
  taxesPercent: number;
  defaultProfitPercent: number;
  salesChannels: SalesChannel[];
};

export type Input = {
  id: string;
  companyId: string;
  name: string;
  brand?: string;
  category: 'embalagem' | 'producao' | 'outros';
  unit: Unit;
  packageSize: number;
  packagePrice: number;
  tags: string[];
  notes?: string;
};

export type RecipeIngredient = {
  inputId: string;
  quantity: number;
  unit: Unit;
};

export type Recipe = {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  prepTimeMinutes: number;
  yield: number;
  yieldUnit: Unit;
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
  directInputs?: { inputId: string; quantity: number; unit: Unit }[];
  packagingInputs: { inputId: string; quantity: number; unit: Unit }[];
};
