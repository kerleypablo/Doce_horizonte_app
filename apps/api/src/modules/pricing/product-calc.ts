import type { CompanySettings, Input, Product, Recipe } from '../../db/types.js';
import { normalizeQuantity } from '../common/units.js';
import { calcRecipeDirectCost } from './calc.js';

export type ProductPricePreview = {
  directCost: number;
  overheadCost: number;
  variablePercent: number;
  feeFixed: number;
  unitsCount: number;
  unitPrice: number;
  totalPrice: number;
  profitValue: number;
  profitPercent: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export const calcProductPreview = ({
  baseRecipe,
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
  baseRecipe?: Recipe;
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
  const baseRecipeCost = baseRecipe ? calcRecipeDirectCost(baseRecipe, inputs, recipes) : 0;
  const basePerUnit = baseRecipe ? (baseRecipe.yield > 0 ? baseRecipeCost / baseRecipe.yield : baseRecipeCost) : 0;

  const recipesCost = extraRecipes.reduce((sum, item) => {
    const recipe = recipes.find((r) => r.id === item.recipeId);
    if (!recipe || recipe.yield <= 0) return sum;
    const total = calcRecipeDirectCost(recipe, inputs, recipes);
    const perUnit = total / recipe.yield;
    return sum + perUnit * item.quantity;
  }, 0);

  const productsCost = extraProducts.reduce((sum, item) => {
    const product = products.find((p) => p.id === item.productId);
    if (!product) return sum;
    const perUnit = product.unitPrice > 0 ? product.unitPrice : product.salePrice;
    return sum + perUnit * item.quantity;
  }, 0);

  const packagingCost = packagingInputs.reduce((sum, item) => {
    const input = inputs.find((i) => i.id === item.inputId);
    if (!input) return sum;
    const unitCost = input.packagePrice / input.packageSize;
    const normalizedQty = normalizeQuantity(item.quantity, item.unit, input.unit);
    return sum + unitCost * normalizedQty;
  }, 0);

  const directCost = basePerUnit * safeUnits + recipesCost + productsCost + packagingCost;

  const baseOverhead = settings.overheadMethod === 'PERCENT_DIRECT'
    ? (directCost * settings.overheadPercent) / 100
    : settings.overheadPerUnit * safeUnits;

  const hours = (prepTimeMinutes ?? 0) / 60;
  const laborCost = settings.laborCostPerHour * hours;
  const fixedCost = settings.fixedCostPerHour * hours;
  const overheadCost = baseOverhead + laborCost + fixedCost;

  const variablePercentBase = settings.taxesPercent + feePercent + paymentFeePercent;
  const denominator = Math.max(1 - variablePercentBase / 100, 0.001);
  const baseCost = directCost + overheadCost + feeFixed;
  const markupMultiplier = 1 + (targetProfitPercent + extraPercent) / 100;
  const totalPrice = (baseCost * markupMultiplier) / denominator;
  const unitPrice = totalPrice / safeUnits;
  const profitValue = totalPrice - baseCost - (totalPrice * (settings.taxesPercent + feePercent + paymentFeePercent) / 100);
  const profitPercent = totalPrice > 0 ? (profitValue / totalPrice) * 100 : 0;

  return {
    directCost: round2(directCost),
    overheadCost: round2(overheadCost),
    variablePercent: round2(variablePercentBase + targetProfitPercent + extraPercent),
    feeFixed: round2(feeFixed),
    unitsCount: round2(safeUnits),
    unitPrice: round2(unitPrice),
    totalPrice: round2(totalPrice),
    profitValue: round2(profitValue),
    profitPercent: round2(profitPercent)
  };
};
