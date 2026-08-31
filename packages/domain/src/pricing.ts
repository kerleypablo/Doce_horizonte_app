import type { CompanySettings, Input, Product, Recipe, Unit } from './types.js';

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

export const normalizeQuantity = (quantity: number, from: Unit, to: Unit) => {
  if (from === to || from === 'un' || to === 'un') return quantity;
  const weight: Partial<Record<Unit, number>> = { kg: 1000, g: 1 };
  const volume: Partial<Record<Unit, number>> = { l: 1000, ml: 1 };
  if (weight[from] !== undefined && weight[to] !== undefined) return quantity * weight[from]! / weight[to]!;
  if (volume[from] !== undefined && volume[to] !== undefined) return quantity * volume[from]! / volume[to]!;
  return quantity;
};

export const calcSalePriceFromMarkup = (baseCost: number, variablePercent: number, markupPercent: number) => {
  const denominator = 1 - variablePercent / 100;
  return denominator > 0 ? baseCost * (1 + markupPercent / 100) / denominator : 0;
};

export const calcMarkupFromSalePrice = (salePrice: number, baseCost: number, variablePercent: number) => {
  if (salePrice <= 0 || baseCost <= 0) return 0;
  const netRevenue = salePrice * (1 - variablePercent / 100);
  return (netRevenue - baseCost) / baseCost * 100;
};

export const calcRecipeProductionCost = (
  recipe: Recipe,
  inputs: Input[],
  recipes: Recipe[],
  settings: CompanySettings,
  visited: Set<string> = new Set()
): number => {
  if (visited.has(recipe.id)) return 0;
  visited.add(recipe.id);
  const inputsCost = recipe.ingredients.reduce((sum, ingredient) => {
    const input = inputs.find((candidate) => candidate.id === ingredient.inputId);
    if (!input || input.packageSize <= 0) return sum;
    return sum + input.packagePrice / input.packageSize * normalizeQuantity(ingredient.quantity, ingredient.unit, input.unit);
  }, 0);
  const subRecipesCost = recipe.subRecipes.reduce((sum, item) => {
    const subRecipe = recipes.find((candidate) => candidate.id === item.recipeId);
    if (!subRecipe || subRecipe.yield <= 0) return sum;
    return sum + calcRecipeProductionCost(subRecipe, inputs, recipes, settings, visited) / subRecipe.yield * item.quantity;
  }, 0);
  visited.delete(recipe.id);
  const hours = Math.max(recipe.prepTimeMinutes, 0) / 60;
  return inputsCost + subRecipesCost + settings.laborCostPerHour * hours + settings.fixedCostPerHour * hours;
};

const calcPackagingCost = (items: Product['packagingInputs'], inputs: Input[]) => items.reduce((sum, item) => {
  const input = inputs.find((candidate) => candidate.id === item.inputId);
  if (!input || input.packageSize <= 0) return sum;
  return sum + input.packagePrice / input.packageSize * normalizeQuantity(item.quantity, item.unit, input.unit);
}, 0);

const calcDirectInputsCost = (items: NonNullable<Product['directInputs']>, inputs: Input[]) => calcPackagingCost(items, inputs);

const calcRecipePortionCost = (recipe: Recipe, quantity: number, inputs: Input[], recipes: Recipe[], settings: CompanySettings) => {
  if (recipe.yield <= 0) return 0;
  return calcRecipeProductionCost(recipe, inputs, recipes, settings) / recipe.yield * quantity;
};

const calcProductCompositionCost = (product: Product, inputs: Input[], recipes: Recipe[], products: Product[], settings: CompanySettings, visited = new Set<string>()): number => {
  if (visited.has(product.id)) return 0;
  visited.add(product.id);
  const recipesCost = product.extraRecipes.reduce((sum, item) => {
    const recipe = recipes.find((candidate) => candidate.id === item.recipeId);
    return recipe ? sum + calcRecipePortionCost(recipe, item.quantity, inputs, recipes, settings) : sum;
  }, 0);
  const productsCost = product.extraProducts.reduce((sum, item) => {
    const child = products.find((candidate) => candidate.id === item.productId);
    if (!child) return sum;
    const compositionTotal = calcProductCompositionCost(child, inputs, recipes, products, settings, visited);
    const unitCost = compositionTotal > 0 ? compositionTotal / Math.max(child.unitsCount, 1) : (child.unitPrice || child.salePrice / Math.max(child.unitsCount, 1));
    return sum + unitCost * item.quantity;
  }, 0);
  visited.delete(product.id);
  const directCost = recipesCost + productsCost + calcDirectInputsCost(product.directInputs ?? [], inputs) + calcPackagingCost(product.packagingInputs, inputs);
  const overhead = settings.overheadMethod === 'PERCENT_DIRECT'
    ? directCost * settings.overheadPercent / 100
    : settings.overheadPerUnit * Math.max(product.unitsCount, 1);
  const hours = Math.max(product.prepTimeMinutes, 0) / 60;
  return directCost + overhead + settings.laborCostPerHour * hours + settings.fixedCostPerHour * hours;
};

export const calcProductPreview = ({ unitsCount, prepTimeMinutes, targetProfitPercent, extraPercent, extraRecipes, extraProducts, directInputs = [], packagingInputs, settings, inputs, recipes, products, feePercent, paymentFeePercent, feeFixed }: {
  unitsCount: number;
  prepTimeMinutes: number;
  targetProfitPercent: number;
  extraPercent: number;
  extraRecipes: Product['extraRecipes'];
  extraProducts: Product['extraProducts'];
  directInputs?: Product['directInputs'];
  packagingInputs: Product['packagingInputs'];
  settings: CompanySettings;
  inputs: Input[];
  recipes: Recipe[];
  products: Product[];
  feePercent: number;
  paymentFeePercent: number;
  feeFixed: number;
}): ProductPricePreview => {
  const safeUnits = Math.max(unitsCount, 1);
  const recipesCost = extraRecipes.reduce((sum, item) => {
    const recipe = recipes.find((candidate) => candidate.id === item.recipeId);
    return recipe ? sum + calcRecipePortionCost(recipe, item.quantity, inputs, recipes, settings) : sum;
  }, 0);
  const productsCost = extraProducts.reduce((sum, item) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    if (!product) return sum;
    const compositionTotal = calcProductCompositionCost(product, inputs, recipes, products, settings);
    const unitCost = compositionTotal > 0 ? compositionTotal / Math.max(product.unitsCount, 1) : (product.unitPrice || product.salePrice / Math.max(product.unitsCount, 1));
    return sum + unitCost * item.quantity;
  }, 0);
  const directCost = recipesCost + productsCost + calcDirectInputsCost(directInputs, inputs) + calcPackagingCost(packagingInputs, inputs);
  const baseOverhead = settings.overheadMethod === 'PERCENT_DIRECT'
    ? directCost * settings.overheadPercent / 100
    : settings.overheadPerUnit * safeUnits;
  const hours = Math.max(prepTimeMinutes, 0) / 60;
  const overheadCost = baseOverhead + settings.laborCostPerHour * hours + settings.fixedCostPerHour * hours;
  const variablePercent = settings.taxesPercent + feePercent + paymentFeePercent;
  const baseCost = directCost + overheadCost + feeFixed * safeUnits;
  const pricingError = variablePercent >= 100 ? 'A soma dos impostos e das taxas precisa ser menor que 100% para calcular o valor de venda.' : undefined;
  const totalPrice = pricingError ? 0 : calcSalePriceFromMarkup(baseCost, variablePercent, targetProfitPercent + extraPercent);
  const profitValue = pricingError ? 0 : totalPrice - baseCost - totalPrice * variablePercent / 100;
  return {
    directCost: round2(directCost), overheadCost: round2(overheadCost), totalCost: round2(baseCost), variablePercent: round2(variablePercent), feeFixed: round2(feeFixed), unitsCount: round2(safeUnits), unitCost: round2(baseCost / safeUnits), unitPrice: round2(totalPrice / safeUnits), totalPrice: round2(totalPrice), profitValue: round2(profitValue), profitPercent: round2(baseCost > 0 ? profitValue / baseCost * 100 : 0), pricingError
  };
};
