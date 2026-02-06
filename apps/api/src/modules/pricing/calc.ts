import type { CompanySettings, Input, Recipe } from '../../db/mock.js';
import { normalizeQuantity } from '../common/units.js';

export type PricePreview = {
  directCost: number;
  overheadCost: number;
  variablePercent: number;
  feeFixed: number;
  suggestedPrice: number;
  profitValue: number;
  profitPercent: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export const calcRecipeDirectCost = (
  recipe: Recipe,
  inputs: Input[],
  recipes: Recipe[],
  visited: Set<string> = new Set()
) => {
  if (visited.has(recipe.id)) return 0;
  visited.add(recipe.id);

  const inputsCost = recipe.ingredients.reduce((sum, ingredient) => {
    const input = inputs.find((item) => item.id === ingredient.inputId);
    if (!input) return sum;

    const unitCost = input.packagePrice / input.packageSize;
    const normalizedQty = normalizeQuantity(ingredient.quantity, ingredient.unit, input.unit);
    return sum + unitCost * normalizedQty;
  }, 0);

  const subRecipesCost = recipe.subRecipes.reduce((sum, item) => {
    const sub = recipes.find((r) => r.id === item.recipeId);
    if (!sub || sub.yield <= 0) return sum;
    const subTotal = calcRecipeDirectCost(sub, inputs, recipes, visited);
    const unitCost = subTotal / sub.yield;
    return sum + unitCost * item.quantity;
  }, 0);

  return inputsCost + subRecipesCost;
};

export const calcPricePreview = ({
  recipe,
  inputs,
  recipes,
  settings,
  profitPercent,
  feePercent,
  paymentFeePercent,
  feeFixed
}: {
  recipe: Recipe;
  inputs: Input[];
  recipes: Recipe[];
  settings: CompanySettings;
  profitPercent: number;
  feePercent: number;
  paymentFeePercent: number;
  feeFixed: number;
}): PricePreview => {
  const directCost = calcRecipeDirectCost(recipe, inputs, recipes);
  const baseOverhead = settings.overheadMethod === 'PERCENT_DIRECT'
    ? (directCost * settings.overheadPercent) / 100
    : settings.overheadPerUnit;
  const hours = (recipe.prepTimeMinutes ?? 0) / 60;
  const laborCost = settings.laborCostPerHour * hours;
  const fixedCost = settings.fixedCostPerHour * hours;
  const overheadCost = baseOverhead + laborCost + fixedCost;

  const variablePercent = settings.taxesPercent + feePercent + paymentFeePercent + profitPercent;
  const baseCost = directCost + overheadCost + feeFixed;

  const suggestedPrice = baseCost / (1 - variablePercent / 100);
  const profitValue = suggestedPrice - baseCost - (suggestedPrice * (settings.taxesPercent + feePercent + paymentFeePercent) / 100);

  return {
    directCost: round2(directCost),
    overheadCost: round2(overheadCost),
    variablePercent: round2(variablePercent),
    feeFixed: round2(feeFixed),
    suggestedPrice: round2(suggestedPrice),
    profitValue: round2(profitValue),
    profitPercent: round2(profitPercent)
  };
};

export const calcProfitFromPrice = ({
  recipe,
  inputs,
  recipes,
  settings,
  salePrice,
  feePercent,
  paymentFeePercent,
  feeFixed
}: {
  recipe: Recipe;
  inputs: Input[];
  recipes: Recipe[];
  settings: CompanySettings;
  salePrice: number;
  feePercent: number;
  paymentFeePercent: number;
  feeFixed: number;
}) => {
  const directCost = calcRecipeDirectCost(recipe, inputs, recipes);
  const baseOverhead = settings.overheadMethod === 'PERCENT_DIRECT'
    ? (directCost * settings.overheadPercent) / 100
    : settings.overheadPerUnit;
  const hours = (recipe.prepTimeMinutes ?? 0) / 60;
  const laborCost = settings.laborCostPerHour * hours;
  const fixedCost = settings.fixedCostPerHour * hours;
  const overheadCost = baseOverhead + laborCost + fixedCost;

  const variablePercent = settings.taxesPercent + feePercent + paymentFeePercent;
  const variableCost = salePrice * (variablePercent / 100);
  const baseCost = directCost + overheadCost + feeFixed + variableCost;
  const profitValue = salePrice - baseCost;
  const profitPercent = (profitValue / salePrice) * 100;

  return {
    directCost: round2(directCost),
    overheadCost: round2(overheadCost),
    variablePercent: round2(variablePercent),
    feeFixed: round2(feeFixed),
    salePrice: round2(salePrice),
    profitValue: round2(profitValue),
    profitPercent: round2(profitPercent)
  };
};
