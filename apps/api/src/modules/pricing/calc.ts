import type { CompanySettings, Input, Recipe } from '../../db/types.js';
import {
  calcMarkupFromSalePrice,
  calcRecipeProductionCost,
  calcSalePriceFromMarkup,
  normalizeQuantity
} from '@doce-horizonte/domain';

export type PricePreview = {
  directCost: number;
  overheadCost: number;
  variablePercent: number;
  feeFixed: number;
  suggestedPrice: number;
  profitValue: number;
  profitPercent: number;
  pricingError?: string;
};

export type ProfitFromPrice = {
  directCost: number;
  overheadCost: number;
  variablePercent: number;
  feeFixed: number;
  salePrice: number;
  profitValue: number;
  profitPercent: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export { calcMarkupFromSalePrice, calcSalePriceFromMarkup } from '@doce-horizonte/domain';

export const calcRecipeDirectCost = (
  recipe: Recipe,
  inputs: Input[],
  recipes: Recipe[],
  visited: Set<string> = new Set()
): number => {
  if (visited.has(recipe.id)) return 0;
  visited.add(recipe.id);

  const inputsCost = recipe.ingredients.reduce((sum: number, ingredient): number => {
    const input = inputs.find((item) => item.id === ingredient.inputId);
    if (!input) return sum;

    const unitCost = input.packagePrice / input.packageSize;
    const normalizedQty = normalizeQuantity(ingredient.quantity, ingredient.unit, input.unit);
    return sum + unitCost * normalizedQty;
  }, 0);

  const subRecipesCost = recipe.subRecipes.reduce((sum: number, item): number => {
    const sub = recipes.find((r) => r.id === item.recipeId);
    if (!sub || sub.yield <= 0) return sum;
    const subTotal: number = calcRecipeDirectCost(sub, inputs, recipes, visited);
    const unitCost: number = subTotal / sub.yield;
    return sum + unitCost * item.quantity;
  }, 0);

  visited.delete(recipe.id);
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

  const variablePercentBase = settings.taxesPercent + feePercent + paymentFeePercent;
  const baseCost = directCost + overheadCost + feeFixed;
  const pricingError = variablePercentBase >= 100
    ? 'A soma dos impostos e das taxas precisa ser menor que 100% para calcular o valor de venda.'
    : undefined;
  const suggestedPrice = pricingError ? 0 : calcSalePriceFromMarkup(baseCost, variablePercentBase, profitPercent);
  const profitValue = suggestedPrice - baseCost - (suggestedPrice * (settings.taxesPercent + feePercent + paymentFeePercent) / 100);

  return {
    directCost: round2(directCost),
    overheadCost: round2(overheadCost),
    variablePercent: round2(variablePercentBase),
    feeFixed: round2(feeFixed),
    suggestedPrice: round2(suggestedPrice),
    profitValue: round2(profitValue),
    profitPercent: round2(baseCost > 0 ? (profitValue / baseCost) * 100 : 0),
    pricingError
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
}): ProfitFromPrice => {
  const directCost = calcRecipeDirectCost(recipe, inputs, recipes);
  const baseOverhead = settings.overheadMethod === 'PERCENT_DIRECT'
    ? (directCost * settings.overheadPercent) / 100
    : settings.overheadPerUnit;
  const hours = (recipe.prepTimeMinutes ?? 0) / 60;
  const laborCost = settings.laborCostPerHour * hours;
  const fixedCost = settings.fixedCostPerHour * hours;
  const overheadCost = baseOverhead + laborCost + fixedCost;

  const variablePercent = settings.taxesPercent + feePercent + paymentFeePercent;
  const fixedBaseCost = directCost + overheadCost + feeFixed;
  const variableCost = salePrice * (variablePercent / 100);
  const baseCost = fixedBaseCost + variableCost;
  const profitValue = salePrice - baseCost;
  const profitPercent = calcMarkupFromSalePrice(salePrice, fixedBaseCost, variablePercent);

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
