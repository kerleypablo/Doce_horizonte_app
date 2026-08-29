import type { CompanySettings, Input, Product, Recipe } from '../../db/types.js';
import { normalizeQuantity } from '../common/units.js';
import { calcRecipeProductionCost, calcSalePriceFromMarkup } from './calc.js';

export type ProductPricePreview = {
  directCost: number;
  overheadCost: number;
  totalCost: number;
  variablePercent: number;
  feeFixed: number;
  unitsCount: number;
  unitCost: number;
  unitPrice: number;
  totalPrice: number;
  profitValue: number;
  profitPercent: number;
  pricingError?: string;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

const calcRecipePortionCost = (
  recipe: Recipe,
  quantity: number,
  inputs: Input[],
  recipes: Recipe[],
  settings: CompanySettings
) => {
  if (recipe.yield <= 0) return 0;
  const total = calcRecipeProductionCost(recipe, inputs, recipes, settings);
  return (total / recipe.yield) * quantity;
};

const calcPackagingCost = (
  packagingInputs: { inputId: string; quantity: number; unit: 'kg' | 'g' | 'l' | 'ml' | 'un' }[],
  inputs: Input[]
) =>
  packagingInputs.reduce((sum, item) => {
    const input = inputs.find((i) => i.id === item.inputId);
    if (!input) return sum;
    const unitCost = input.packagePrice / input.packageSize;
    const normalizedQty = normalizeQuantity(item.quantity, item.unit, input.unit);
    return sum + unitCost * normalizedQty;
  }, 0);

const calcProductDirectCost = (
  product: Product,
  inputs: Input[],
  recipes: Recipe[],
  products: Product[],
  settings: CompanySettings,
  visited: Set<string> = new Set()
): number => {
  if (visited.has(product.id)) return 0;
  visited.add(product.id);

  const recipesCost = product.extraRecipes.reduce((sum, item) => {
    const recipe = recipes.find((r) => r.id === item.recipeId);
    return recipe ? sum + calcRecipePortionCost(recipe, item.quantity, inputs, recipes, settings) : sum;
  }, 0);

  const productsCost = product.extraProducts.reduce((sum, item) => {
    const child = products.find((p) => p.id === item.productId);
    if (!child) return sum;
    const direct = calcProductDirectCost(child, inputs, recipes, products, settings, visited);
    const fallback = child.unitPrice > 0
      ? child.unitPrice
      : child.salePrice / Math.max(child.unitsCount, 1);
    const compositionUnitCost = direct > 0 ? direct / Math.max(child.unitsCount, 1) : fallback;
    return sum + compositionUnitCost * item.quantity;
  }, 0);

  const packagingCost = calcPackagingCost(product.packagingInputs, inputs);
  const directCost = recipesCost + productsCost + packagingCost;
  visited.delete(product.id);
  const safeUnits = Math.max(product.unitsCount, 1);
  const overhead = settings.overheadMethod === 'PERCENT_DIRECT'
    ? directCost * (settings.overheadPercent / 100)
    : settings.overheadPerUnit * safeUnits;
  const hours = Math.max(product.prepTimeMinutes ?? 0, 0) / 60;
  return directCost
    + overhead
    + settings.laborCostPerHour * hours
    + settings.fixedCostPerHour * hours;
};

export const calcProductPreview = ({
  unitsCount,
  prepTimeMinutes,
  targetProfitPercent,
  extraPercent,
  extraRecipes,
  extraProducts,
  packagingInputs,
  settings,
  inputs,
  recipes,
  products,
  feePercent,
  paymentFeePercent,
  feeFixed
}: {
  unitsCount: number;
  prepTimeMinutes: number;
  targetProfitPercent: number;
  extraPercent: number;
  extraRecipes: { recipeId: string; quantity: number }[];
  extraProducts: { productId: string; quantity: number }[];
  packagingInputs: { inputId: string; quantity: number; unit: 'kg' | 'g' | 'l' | 'ml' | 'un' }[];
  settings: CompanySettings;
  inputs: Input[];
  recipes: Recipe[];
  products: Product[];
  feePercent: number;
  paymentFeePercent: number;
  feeFixed: number;
}): ProductPricePreview => {
  const safeUnits = unitsCount > 0 ? unitsCount : 1;
  const recipesCost = extraRecipes.reduce((sum, item) => {
    const recipe = recipes.find((r) => r.id === item.recipeId);
    return recipe ? sum + calcRecipePortionCost(recipe, item.quantity, inputs, recipes, settings) : sum;
  }, 0);

  const productsCost = extraProducts.reduce((sum, item) => {
    const product = products.find((p) => p.id === item.productId);
    if (!product) return sum;
    const direct = calcProductDirectCost(product, inputs, recipes, products, settings);
    const fallback = product.unitPrice > 0
      ? product.unitPrice
      : product.salePrice / Math.max(product.unitsCount, 1);
    const compositionUnitCost = direct > 0 ? direct / Math.max(product.unitsCount, 1) : fallback;
    return sum + compositionUnitCost * item.quantity;
  }, 0);

  const packagingCost = calcPackagingCost(packagingInputs, inputs);

  const directCost = recipesCost + productsCost + packagingCost;

  const baseOverhead = settings.overheadMethod === 'PERCENT_DIRECT'
    ? (directCost * settings.overheadPercent) / 100
    : settings.overheadPerUnit * safeUnits;

  const hours = (prepTimeMinutes ?? 0) / 60;
  const laborCost = settings.laborCostPerHour * hours;
  const fixedCost = settings.fixedCostPerHour * hours;
  const overheadCost = baseOverhead + laborCost + fixedCost;

  const variablePercentBase = settings.taxesPercent + feePercent + paymentFeePercent;
  const desiredMarkupPercent = targetProfitPercent + extraPercent;
  const denominator = 1 - variablePercentBase / 100;
  // O produto e precificado por unidade; uma taxa fixa do canal por item
  // precisa ser provisionada para cada unidade produzida.
  const totalFixedFees = feeFixed * safeUnits;
  const baseCost = directCost + overheadCost + totalFixedFees;
  const pricingError = denominator <= 0
    ? 'A soma dos impostos e das taxas precisa ser menor que 100% para calcular o valor de venda.'
    : undefined;
  const totalPrice = pricingError ? 0 : calcSalePriceFromMarkup(baseCost, variablePercentBase, desiredMarkupPercent);
  const unitPrice = pricingError ? 0 : totalPrice / safeUnits;
  const profitValue = pricingError
    ? 0
    : totalPrice - baseCost - (totalPrice * (settings.taxesPercent + feePercent + paymentFeePercent) / 100);
  const profitPercent = pricingError
    ? 0
    : baseCost > 0 ? (profitValue / baseCost) * 100 : 0;

  return {
    directCost: round2(directCost),
    overheadCost: round2(overheadCost),
    totalCost: round2(baseCost),
    variablePercent: round2(variablePercentBase),
    feeFixed: round2(feeFixed),
    unitsCount: round2(safeUnits),
    unitCost: round2(baseCost / safeUnits),
    unitPrice: round2(unitPrice),
    totalPrice: round2(totalPrice),
    profitValue: round2(profitValue),
    profitPercent: round2(profitPercent),
    pricingError
  };
};
