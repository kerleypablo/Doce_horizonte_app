import type { CompanySettings, Input, Product, Recipe } from '../../db/types.js';
import { normalizeQuantity } from '../common/units.js';
import { calcRecipeDirectCost } from './calc.js';

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
};

const round2 = (value: number) => Math.round(value * 100) / 100;

const calcRecipePortionCost = (recipe: Recipe, quantity: number, inputs: Input[], recipes: Recipe[]) => {
  if (recipe.yield <= 0) return 0;
  const total = calcRecipeDirectCost(recipe, inputs, recipes);
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
  visited: Set<string> = new Set()
): number => {
  if (visited.has(product.id)) return 0;
  visited.add(product.id);

  const recipesCost = product.extraRecipes.reduce((sum, item) => {
    const recipe = recipes.find((r) => r.id === item.recipeId);
    return recipe ? sum + calcRecipePortionCost(recipe, item.quantity, inputs, recipes) : sum;
  }, 0);

  const productsCost = product.extraProducts.reduce((sum, item) => {
    const child = products.find((p) => p.id === item.productId);
    if (!child) return sum;
    const direct = calcProductDirectCost(child, inputs, recipes, products, visited);
    const fallback = child.unitPrice > 0 ? child.unitPrice : child.salePrice;
    return sum + (direct > 0 ? direct : fallback) * item.quantity;
  }, 0);

  const packagingCost = calcPackagingCost(product.packagingInputs, inputs);
  const directCost = recipesCost + productsCost + packagingCost;
  visited.delete(product.id);
  return directCost;
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
  const recipesCost = extraRecipes.reduce((sum, item) => {
    const recipe = recipes.find((r) => r.id === item.recipeId);
    return recipe ? sum + calcRecipePortionCost(recipe, item.quantity, inputs, recipes) : sum;
  }, 0);

  const productsCost = extraProducts.reduce((sum, item) => {
    const product = products.find((p) => p.id === item.productId);
    if (!product) return sum;
    const direct = calcProductDirectCost(product, inputs, recipes, products);
    const fallback = product.unitPrice > 0 ? product.unitPrice : product.salePrice;
    return sum + (direct > 0 ? direct : fallback) * item.quantity;
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
  const desiredMarginPercent = targetProfitPercent + extraPercent;
  const denominator = Math.max(1 - (variablePercentBase + desiredMarginPercent) / 100, 0.001);
  const baseCost = directCost + overheadCost + feeFixed;
  const totalPrice = baseCost / denominator;
  const unitPrice = totalPrice / safeUnits;
  const profitValue = totalPrice - baseCost - (totalPrice * (settings.taxesPercent + feePercent + paymentFeePercent) / 100);
  const profitPercent = totalPrice > 0 ? (profitValue / totalPrice) * 100 : 0;

  return {
    directCost: round2(directCost),
    overheadCost: round2(overheadCost),
    totalCost: round2(baseCost),
    variablePercent: round2(variablePercentBase + targetProfitPercent + extraPercent),
    feeFixed: round2(feeFixed),
    unitsCount: round2(safeUnits),
    unitCost: round2(baseCost / safeUnits),
    unitPrice: round2(unitPrice),
    totalPrice: round2(totalPrice),
    profitValue: round2(profitValue),
    profitPercent: round2(profitPercent)
  };
};
