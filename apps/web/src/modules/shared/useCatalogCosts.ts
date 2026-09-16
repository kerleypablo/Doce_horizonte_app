import { useMemo } from 'react';
import { calcRecipeProductionCost, type CompanySettings } from '@doce-horizonte/domain';
import type { InputItem } from '../inputs/InputsPage.tsx';
import type { RecipeItem } from '../recipes/recipe-types.ts';

// Keep row costs consistent with product pricing, including preparation of sub-recipes.
export const useCatalogCosts = (inputs: InputItem[], recipes: RecipeItem[], settings: CompanySettings | null) => useMemo(() => {
  const domainInputs = inputs.map((input) => ({ ...input, companyId: '' }));
  const domainRecipes = recipes.map((recipe) => ({ ...recipe, companyId: '' }));
  const inputsById = new Map(domainInputs.map((input) => [input.id, input]));
  const recipesById = new Map(domainRecipes.map((recipe) => [recipe.id, recipe]));
  const totals = new Map<string, number>();
  const costSettings = settings ?? {
    overheadMethod: 'PERCENT_DIRECT', overheadPercent: 0, overheadPerUnit: 0,
    laborCostPerHour: 0, fixedCostPerHour: 0, taxesPercent: 0, defaultProfitPercent: 0, salesChannels: []
  };
  return {
    inputCost: (id: string, quantity: number) => {
      const input = inputsById.get(id);
      return input && input.packageSize > 0 ? input.packagePrice / input.packageSize * quantity : 0;
    },
    recipeCost: (id: string, quantity: number) => {
      const recipe = recipesById.get(id);
      if (!recipe || recipe.yield <= 0) return 0;
      if (!totals.has(id)) totals.set(id, calcRecipeProductionCost(recipe, domainInputs, domainRecipes, costSettings));
      return totals.get(id)! / recipe.yield * quantity;
    }
  };
}, [inputs, recipes, settings]);
