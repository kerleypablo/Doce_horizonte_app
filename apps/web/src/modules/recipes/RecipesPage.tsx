import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../shared/api.ts';
import { useAuth } from '../auth/AuthContext.tsx';
import type { InputItem } from '../inputs/InputsPage.tsx';
import { SelectField } from '../shared/SelectField.tsx';
import { ListToolbar } from '../shared/ListToolbar.tsx';
import { ConfirmDialog } from '../shared/ConfirmDialog.tsx';
import { SearchableSelect } from '../shared/SearchableSelect.tsx';
import { TagInput } from '../shared/TagInput.tsx';

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

type Settings = {
  overheadMethod: 'PERCENT_DIRECT' | 'PER_UNIT';
  overheadPercent: number;
  overheadPerUnit: number;
  laborCostPerHour: number;
  fixedCostPerHour: number;
  taxesPercent: number;
  defaultProfitPercent: number;
  salesChannels: {
    id: string;
    name: string;
    feePercent: number;
    paymentFeePercent: number;
    feeFixed: number;
    active: boolean;
  }[];
};

const units = ['kg', 'g', 'l', 'ml', 'un'] as const;

const normalizeQuantity = (quantity: number, unit: string, target: string) => {
  if (unit === 'un' || target === 'un') return quantity;
  const weight = { kg: 1000, g: 1 } as Record<string, number>;
  const volume = { l: 1000, ml: 1 } as Record<string, number>;
  const isWeight = unit in weight && target in weight;
  const isVolume = unit in volume && target in volume;
  if (isWeight) return (quantity * weight[unit]) / weight[target];
  if (isVolume) return (quantity * volume[unit]) / volume[target];
  return quantity;
};

export const RecipesPage = () => {
  const { user } = useAuth();
  const [inputs, setInputs] = useState<InputItem[]>([]);
  const [recipes, setRecipes] = useState<RecipeItem[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmActionRef = useRef<null | (() => void)>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    prepTimeMinutes: 0,
    yield: 1,
    yieldUnit: 'un' as const,
    ingredients: [] as { inputId: string; quantity: number; unit: 'kg' | 'g' | 'l' | 'ml' | 'un' }[],
    subRecipes: [] as { recipeId: string; quantity: number }[],
    tags: [] as string[]
  });

  const load = async () => {
    const [inputsData, recipesData, settingsData] = await Promise.all([
      apiFetch<InputItem[]>('/inputs', { token: user?.token }),
      apiFetch<RecipeItem[]>('/recipes', { token: user?.token }),
      apiFetch<Settings>('/company/settings', { token: user?.token })
    ]);
    setInputs(inputsData);
    setRecipes(recipesData);
    setSettings(settingsData);
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setForm({
      name: '',
      description: '',
      prepTimeMinutes: 0,
      yield: 1,
      yieldUnit: 'un',
      ingredients: [],
      subRecipes: [],
      tags: []
    });
    setEditingId(null);
  };

  const handleNew = () => {
    if (editingId) {
      confirmActionRef.current = () => {
        resetForm();
        setShowForm(true);
      };
      setConfirmOpen(true);
      return;
    }
    resetForm();
    setShowForm(true);
  };

  const handleIngredientChange = (index: number, field: string, value: string | number) => {
    setForm((prev) => {
      const next = [...prev.ingredients];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, ingredients: next };
    });
  };

  const handleSubRecipeChange = (index: number, field: string, value: string | number) => {
    setForm((prev) => {
      const next = [...prev.subRecipes];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, subRecipes: next };
    });
  };

  const addIngredient = () => {
    setForm({
      ...form,
      ingredients: [...form.ingredients, { inputId: '', quantity: 0, unit: 'g' }]
    });
  };

  const addSubRecipe = () => {
    setForm({
      ...form,
      subRecipes: [...form.subRecipes, { recipeId: '', quantity: 0 }]
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      name: form.name,
      description: form.description,
      prepTimeMinutes: Number(form.prepTimeMinutes),
      yield: Number(form.yield),
      yieldUnit: form.yieldUnit,
      ingredients: form.ingredients.map((item) => ({
        inputId: item.inputId,
        quantity: Number(item.quantity),
        unit: item.unit
      })),
      subRecipes: form.subRecipes.map((item) => ({
        recipeId: item.recipeId,
        quantity: Number(item.quantity)
      })),
      tags: form.tags
    };

    if (editingId) {
      await apiFetch<RecipeItem>(`/recipes/${editingId}`, {
        method: 'PUT',
        token: user?.token,
        body: JSON.stringify(payload)
      });
    } else {
      await apiFetch<RecipeItem>('/recipes', {
        method: 'POST',
        token: user?.token,
        body: JSON.stringify(payload)
      });
    }

    resetForm();
    setShowForm(false);
    await load();
  };

  const filtered = recipes.filter((recipe) => {
    const haystack = `${recipe.name} ${recipe.tags?.join(' ') ?? ''}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const inputOptions = useMemo(
    () => inputs.map((input) => ({ value: input.id, label: input.name })),
    [inputs]
  );

  const inputsMap = useMemo(() => new Map(inputs.map((input) => [input.id, input])), [inputs]);

  const unitOptionsForInput = (inputId: string) => {
    const input = inputsMap.get(inputId);
    if (!input) return units.map((unit) => ({ value: unit, label: unit }));
    if (input.unit === 'un') return [{ value: 'un', label: 'un' }];
    if (input.unit === 'kg' || input.unit === 'g') {
      return [
        { value: 'kg', label: 'kg' },
        { value: 'g', label: 'g' }
      ];
    }
    if (input.unit === 'l' || input.unit === 'ml') {
      return [
        { value: 'l', label: 'l' },
        { value: 'ml', label: 'ml' }
      ];
    }
    return units.map((unit) => ({ value: unit, label: unit }));
  };

  const recipeOptions = useMemo(
    () =>
      recipes
        .filter((recipe) => recipe.id !== editingId)
        .map((recipe) => ({ value: recipe.id, label: recipe.name })),
    [recipes, editingId]
  );

  const costSummary = useMemo(() => {
    const inputsMap = new Map(inputs.map((input) => [input.id, input]));
    const recipesMap = new Map(recipes.map((recipe) => [recipe.id, recipe]));

    const calcRecipeCost = (recipe: RecipeItem, visited = new Set<string>()) => {
      if (visited.has(recipe.id)) return 0;
      visited.add(recipe.id);

      const ingredientsCost = recipe.ingredients.reduce((sum, item) => {
        const input = inputsMap.get(item.inputId);
        if (!input) return sum;
        const unitCost = input.packagePrice / input.packageSize;
        const normalized = normalizeQuantity(item.quantity, item.unit, input.unit);
        return sum + unitCost * normalized;
      }, 0);

      const subCost = recipe.subRecipes.reduce((sum, item) => {
        const sub = recipesMap.get(item.recipeId);
        if (!sub || sub.yield <= 0) return sum;
        const total = calcRecipeCost(sub, visited);
        return sum + (total / sub.yield) * item.quantity;
      }, 0);

      return ingredientsCost + subCost;
    };

    const currentRecipe: RecipeItem = {
      id: editingId ?? 'draft',
      name: form.name,
      description: form.description,
      prepTimeMinutes: form.prepTimeMinutes,
      yield: form.yield,
      yieldUnit: form.yieldUnit,
      ingredients: form.ingredients,
      subRecipes: form.subRecipes,
      tags: form.tags
    };

    const ingredientsTotal = calcRecipeCost(currentRecipe);
    const hours = (form.prepTimeMinutes ?? 0) / 60;
    const laborTotal = (settings?.laborCostPerHour ?? 0) * hours;
    const fixedTotal = (settings?.fixedCostPerHour ?? 0) * hours;
    const total = ingredientsTotal + laborTotal + fixedTotal;

    return {
      ingredientsTotal,
      laborTotal,
      fixedTotal,
      total
    };
  }, [form, inputs, recipes, settings, editingId]);

  return (
    <div className="page">
      <div className="panel">
        <ListToolbar
          title="Receitas cadastradas"
          searchValue={search}
          onSearch={setSearch}
          actionLabel="Nova receita"
          onAction={handleNew}
        />
        <div className="table">
          {filtered.map((recipe) => (
            <div key={recipe.id} className="list-row">
              <div>
                <strong>{recipe.name}</strong>
                <span className="muted">
                  {recipe.prepTimeMinutes ?? 0} min • Rendimento {recipe.yield} {recipe.yieldUnit}
                  {recipe.tags?.length ? ` • ${recipe.tags.join(', ')}` : ''}
                </span>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Editar"
                onClick={() => {
                  setEditingId(recipe.id);
                  setForm({
                    name: recipe.name,
                    description: recipe.description ?? '',
                    prepTimeMinutes: recipe.prepTimeMinutes ?? 0,
                    yield: recipe.yield,
                    yieldUnit: recipe.yieldUnit ?? 'un',
                    ingredients: recipe.ingredients ?? [],
                    subRecipes: recipe.subRecipes ?? [],
                    tags: recipe.tags ?? []
                  });
                  setShowForm(true);
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 20h4l10-10-4-4L4 16v4zm12-12 4 4" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      {showForm && (
        <>
          <div className="panel">
            <h3>{editingId ? 'Editar receita' : 'Nova receita'}</h3>
            <form className="form" onSubmit={handleSubmit}>
              <div className="grid-2">
                <label>
                  Nome
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </label>
                <label>
                  Tempo de preparo (min)
                  <input
                    type="number"
                    value={form.prepTimeMinutes === 0 ? '' : form.prepTimeMinutes}
                    onChange={(e) => setForm({ ...form, prepTimeMinutes: Number(e.target.value || 0) })}
                    min={0}
                  />
                </label>
              </div>
              <label>
                Rendimento
                <div className="inline-field">
                  <input
                    type="number"
                    value={form.yield}
                    onChange={(e) => setForm({ ...form, yield: Number(e.target.value) })}
                    min={1}
                  />
                  <SelectField
                    className="unit-select"
                    value={form.yieldUnit}
                    onChange={(value) => setForm({ ...form, yieldUnit: value as RecipeItem['yieldUnit'] })}
                    options={units.map((unit) => ({ value: unit, label: unit }))}
                  />
                </div>
              </label>
              <label>
                Modo de preparo
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={4}
                />
              </label>
              <label>
                Tags
                <TagInput value={form.tags} onChange={(tags) => setForm({ ...form, tags })} placeholder="Ex: doce, natal" />
              </label>
              <div className="actions">
                <button type="button" className="ghost" onClick={() => setShowForm(false)}>
                  Cancelar
                </button>
                <button type="submit">{editingId ? 'Salvar alteracoes' : 'Salvar receita'}</button>
              </div>
            </form>
          </div>

          <div className="panel">
            <h3>Insumos</h3>
            <div className="ingredients">
              {form.ingredients.map((ingredient, index) => (
                <div key={`${ingredient.inputId}-${index}`} className="ingredients-row ingredients-row-3">
                  <SearchableSelect
                    value={ingredient.inputId}
                    onChange={(value) => {
                      const input = inputsMap.get(value);
                      setForm((prev) => {
                        const next = [...prev.ingredients];
                        next[index] = {
                          ...next[index],
                          inputId: value,
                          unit: input ? input.unit : next[index].unit
                        };
                        return { ...prev, ingredients: next };
                      });
                    }}
                    options={inputOptions}
                    placeholder="Selecione o insumo"
                  />
                  <div className="inline-field">
                    <input
                      type="number"
                      value={ingredient.quantity === 0 ? '' : ingredient.quantity}
                      onChange={(e) => handleIngredientChange(index, 'quantity', Number(e.target.value || 0))}
                      min={0}
                      step="0.01"
                    />
                    <div className="inline-right">
                      <SelectField
                        className="unit-select"
                        value={ingredient.unit}
                        onChange={(value) => handleIngredientChange(index, 'unit', value)}
                        options={unitOptionsForInput(ingredient.inputId)}
                      />
                      <button
                        type="button"
                        className="icon-button tiny"
                        aria-label="Remover"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            ingredients: prev.ingredients.filter((_, itemIndex) => itemIndex !== index)
                          }))
                        }
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M6 7h12M9 7v10m6-10v10M10 4h4l1 2H9l1-2z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" className="ghost" onClick={addIngredient}>
                + Adicionar insumo
              </button>
            </div>
          </div>

          <div className="panel">
            <h3>Outras receitas</h3>
            <div className="ingredients">
              {form.subRecipes.map((item, index) => (
                <div key={`${item.recipeId}-${index}`} className="ingredients-row ingredients-row-3">
                  <SearchableSelect
                    value={item.recipeId}
                    onChange={(value) => handleSubRecipeChange(index, 'recipeId', value)}
                    options={recipeOptions}
                    placeholder="Selecione a receita"
                  />
                  <div className="inline-field">
                    <input
                      type="number"
                      value={item.quantity === 0 ? '' : item.quantity}
                      onChange={(e) => handleSubRecipeChange(index, 'quantity', Number(e.target.value || 0))}
                      min={0}
                      step="0.01"
                    />
                    <div className="inline-right">
                      <div className="unit-tag">{form.yieldUnit}</div>
                      <button
                        type="button"
                        className="icon-button tiny"
                        aria-label="Remover"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            subRecipes: prev.subRecipes.filter((_, itemIndex) => itemIndex !== index)
                          }))
                        }
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M6 7h12M9 7v10m6-10v10M10 4h4l1 2H9l1-2z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" className="ghost" onClick={addSubRecipe}>
                + Adicionar receita
              </button>
            </div>
          </div>

          <div className="panel">
            <h3>Resumo de custos</h3>
            <div className="summary">
              <div>
                <span>Valor total de insumos</span>
                <strong>R$ {costSummary.ingredientsTotal.toFixed(2)}</strong>
              </div>
              <div>
                <span>Valor total de mao de obra</span>
                <strong>R$ {costSummary.laborTotal.toFixed(2)}</strong>
              </div>
              <div>
                <span>Valor total de custos fixos</span>
                <strong>R$ {costSummary.fixedTotal.toFixed(2)}</strong>
              </div>
              <div className="summary-total">
                <span>Valor total da receita</span>
                <strong>R$ {costSummary.total.toFixed(2)}</strong>
              </div>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Descartar edicao?"
        message="Voce tem uma edicao em andamento. Deseja cancelar e criar uma nova receita?"
        confirmLabel="Sim, descartar"
        cancelLabel="Continuar editando"
        onCancel={() => {
          setConfirmOpen(false);
          confirmActionRef.current = null;
        }}
        onConfirm={() => {
          confirmActionRef.current?.();
          confirmActionRef.current = null;
          setConfirmOpen(false);
        }}
      />
    </div>
  );
};
