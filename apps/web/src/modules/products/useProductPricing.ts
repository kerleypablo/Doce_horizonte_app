import { useMemo } from 'react';
import { calcProductPreview } from '@doce-horizonte/domain';
import type { InputItem } from '../inputs/InputsPage.tsx';
import type { RecipeItem } from '../recipes/recipe-types.ts';
import type { ProductItem, ProductFormState, Settings } from './product-types.ts';

export const useProductPricing = (params: {
  form: ProductFormState;
  inputs: InputItem[];
  recipes: RecipeItem[];
  products: ProductItem[];
  settings: Settings | null;
}) => useMemo(() => {
  const activeChannels = params.settings?.salesChannels.filter((channel) => channel.active) ?? [];
  const channel = activeChannels.find((candidate) => candidate.id === params.form.channelId) ?? activeChannels[0];
  const preview = calcProductPreview({
    ...params.form,
    settings: params.settings ?? { overheadMethod: 'PERCENT_DIRECT', overheadPercent: 0, overheadPerUnit: 0, laborCostPerHour: 0, fixedCostPerHour: 0, taxesPercent: 0, defaultProfitPercent: 0, salesChannels: [] },
    inputs: params.inputs.map((input) => ({ ...input, companyId: '' })),
    recipes: params.recipes.map((recipe) => ({ ...recipe, companyId: '' })),
    products: params.products.map((product) => ({ ...product, companyId: '' })),
    feePercent: channel?.feePercent ?? 0,
    paymentFeePercent: channel?.paymentFeePercent ?? 0,
    feeFixed: channel?.feeFixed ?? 0
  });
  return {
    labor: (params.settings?.laborCostPerHour ?? 0) * Math.max(params.form.prepTimeMinutes, 0) / 60,
    fixed: (params.settings?.fixedCostPerHour ?? 0) * Math.max(params.form.prepTimeMinutes, 0) / 60,
    inputs: preview.directCost,
    total: preview.totalCost - (channel?.feeFixed ?? 0) * Math.max(params.form.unitsCount, 1),
    baseCost: preview.totalCost,
    unitPrice: preview.unitPrice,
    profitPercent: params.form.targetProfitPercent,
    variablePercentBase: preview.variablePercent,
    pricingError: preview.pricingError ?? ''
  };
}, [params.form, params.inputs, params.products, params.recipes, params.settings]);
