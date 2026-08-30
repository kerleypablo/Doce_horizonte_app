export type RecipeItem = {
  id: string;
  name: string;
  description?: string;
  prepTimeMinutes: number;
  yield: number;
  yieldUnit: 'kg' | 'g' | 'l' | 'ml' | 'un';
  ingredients: {
    inputId: string;
    quantity: number;
    unit: 'kg' | 'g' | 'l' | 'ml' | 'un';
  }[];
  subRecipes: { recipeId: string; quantity: number }[];
  tags: string[];
};

export type RecipeFormState = {
  name: string;
  description: string;
  prepTimeMinutes: number;
  yield: number;
  yieldUnit: RecipeItem['yieldUnit'];
  ingredients: { inputId: string; quantity: number; unit: 'kg' | 'g' | 'l' | 'ml' | 'un' }[];
  subRecipes: { recipeId: string; quantity: number }[];
  tags: string[];
};
