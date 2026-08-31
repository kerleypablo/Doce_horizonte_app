export type ProductPickerType = 'EXTRA_RECIPE' | 'EXTRA_PRODUCT' | 'DIRECT_INPUT' | 'PACKAGING';
export type ProductItem = {
  id: string; name: string; prepTimeMinutes: number; notes?: string; unitsCount: number;
  targetProfitPercent: number; extraPercent: number; unitPrice: number; salePrice: number; channelId?: string;
  extraRecipes: { recipeId: string; quantity: number }[];
  extraProducts: { productId: string; quantity: number }[];
  directInputs: { inputId: string; quantity: number; unit: 'kg' | 'g' | 'l' | 'ml' | 'un' }[];
  packagingInputs: { inputId: string; quantity: number; unit: 'kg' | 'g' | 'l' | 'ml' | 'un' }[];
};
export type ProductFormState = Omit<ProductItem, 'id' | 'salePrice'> & { notes: string; channelId: string };
export type Settings = {
  overheadMethod: 'PERCENT_DIRECT' | 'PER_UNIT'; overheadPercent: number; overheadPerUnit: number;
  laborCostPerHour: number; fixedCostPerHour: number; taxesPercent: number; defaultProfitPercent: number;
  salesChannels: { id: string; name: string; feePercent: number; paymentFeePercent: number; feeFixed: number; active: boolean }[];
};
