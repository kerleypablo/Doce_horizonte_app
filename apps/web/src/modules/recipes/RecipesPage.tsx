import { CatalogEditorDialog, EditCatalogItem, type CatalogEditorOptions, type CatalogEditorTarget } from '../shared/CatalogEditorDialog.tsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../shared/api.ts';
import { useAuth } from '../auth/AuthContext.tsx';
import type { InputItem } from '../inputs/InputsPage.tsx';
import { SelectField } from '../shared/SelectField.tsx';
import { ConfirmDialog } from '../shared/ConfirmDialog.tsx';
import { TagInput } from '../shared/TagInput.tsx';
import { LoadingOverlay } from '../shared/LoadingOverlay.tsx';
import { invalidateQueryCache, useCachedQuery } from '../shared/queryCache.ts';
import { queryKeys } from '../shared/queryKeys.ts';
import { FormActions } from '../shared/FormActions.tsx';
import { RecipesListPanel } from './RecipesListPanel.tsx';
import type { RecipeFormState, RecipeItem } from './recipe-types.ts';

export type { RecipeItem } from './recipe-types.ts';

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

const units = ['g', 'ml', 'un'] as const;
const formatCurrency = (value: number) => `R$ ${value.toFixed(2)}`;

const normalizeQuantity = (quantity: number, unit: string, target: string) => {
  // Quantidades e embalagens usam a mesma unidade base (g, ml ou un).
  return quantity;
};

export const RecipesPage = ({ editor }: { editor?: CatalogEditorOptions } = {}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname, state } = location;
  const params = useParams<{ recipeId?: string }>();
  const isCreateView = editor ? !editor.id : pathname.endsWith('/novo');
  const editingRouteId = editor ? editor.id ?? null : pathname.includes('/editar/') ? params.recipeId ?? null : null;
  const duplicateDraft = (editor ? null : state as { duplicateDraft?: RecipeFormState } | null)?.duplicateDraft ?? null;
  const [inputs, setInputs] = useState<InputItem[]>([]);
  const [recipes, setRecipes] = useState<RecipeItem[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(Boolean(isCreateView || editingRouteId));
  const [editingId, setEditingId] = useState<string | null>(editingRouteId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RecipeItem | null>(null);
  const [showInputPicker, setShowInputPicker] = useState(false);
  const [inputPickerSearch, setInputPickerSearch] = useState('');
  const [inputPickerSelectedIds, setInputPickerSelectedIds] = useState<string[]>([]);
  const [catalogEditor, setCatalogEditor] = useState<CatalogEditorTarget | null>(null);
  const [showSubRecipePicker, setShowSubRecipePicker] = useState(false);
  const [subRecipePickerSearch, setSubRecipePickerSearch] = useState('');
  const [subRecipePickerSelectedIds, setSubRecipePickerSelectedIds] = useState<string[]>([]);
  const confirmActionRef = useRef<null | (() => void)>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    prepTimeMinutes: 0,
    yield: 1,
    yieldUnit: 'un' as RecipeItem['yieldUnit'],
    ingredients: [] as { inputId: string; quantity: number; unit: 'g' | 'ml' | 'un' }[],
    subRecipes: [] as { recipeId: string; quantity: number }[],
    tags: [] as string[]
  });

  const createEmptyForm = (): RecipeFormState => ({
    name: '',
    description: '',
    prepTimeMinutes: 0,
    yield: 1,
    yieldUnit: 'un',
    ingredients: [],
    subRecipes: [],
    tags: []
  });

  const inputsQuery = useCachedQuery(
    queryKeys.inputs,
    () => apiFetch<InputItem[]>('/inputs', { token: user?.token }),
    { staleTime: 3 * 60_000, enabled: Boolean(user?.token) }
  );
  const recipesQuery = useCachedQuery(
    queryKeys.recipes,
    () => apiFetch<RecipeItem[]>('/recipes', { token: user?.token }),
    { staleTime: 3 * 60_000, enabled: Boolean(user?.token) }
  );
  const settingsQuery = useCachedQuery(
    queryKeys.companySettings,
    () => apiFetch<Settings>('/company/settings', { token: user?.token }),
    { staleTime: 5 * 60_000, enabled: Boolean(user?.token) }
  );

  useEffect(() => {
    if (inputsQuery.data) setInputs(inputsQuery.data);
  }, [inputsQuery.data]);

  useEffect(() => {
    if (recipesQuery.data) setRecipes(recipesQuery.data);
  }, [recipesQuery.data]);

  useEffect(() => {
    if (isCreateView || editingRouteId) return;
    recipesQuery.refetch().catch(() => undefined);
  }, [pathname]);

  useEffect(() => {
    if (settingsQuery.data) setSettings(settingsQuery.data);
  }, [settingsQuery.data]);

  const initializedForm = useRef<string | null>(null);
  const formKey = editor ? `embedded:${editingRouteId ?? 'new'}` : `${location.key}:${editingRouteId ?? 'new'}`;
  useEffect(() => {
    if (initializedForm.current === formKey) return;
    if (isCreateView) {
      initializedForm.current = formKey;
      setForm(
        duplicateDraft
          ? {
              ...duplicateDraft,
              ingredients: duplicateDraft.ingredients.map((item) => ({ ...item })),
              subRecipes: duplicateDraft.subRecipes.map((item) => ({ ...item })),
              tags: [...duplicateDraft.tags]
            }
          : createEmptyForm()
      );
      setEditingId(null);
      setShowForm(true);
      return;
    }
    if (editingRouteId) {
      const current = (recipesQuery.data ?? []).find((item) => item.id === editingRouteId);
      if (!current) return;
      initializedForm.current = formKey;
      setEditingId(current.id);
      setForm({
        name: current.name,
        description: current.description ?? '',
        prepTimeMinutes: current.prepTimeMinutes ?? 0,
        yield: current.yield,
        yieldUnit: current.yieldUnit ?? 'un',
        ingredients: current.ingredients ?? [],
        subRecipes: current.subRecipes ?? [],
        tags: current.tags ?? []
      });
      setShowForm(true);
      return;
    }
    setEditingId(null);
    setShowForm(false);
  }, [formKey, isCreateView, editingRouteId, recipesQuery.data, duplicateDraft]);

  const resetForm = () => {
    setForm(createEmptyForm());
    setEditingId(null);
  };

  const handleNew = () => {
    if (editingId) {
      confirmActionRef.current = () => {
        resetForm();
        navigate('/app/receitas/novo');
      };
      setConfirmOpen(true);
      return;
    }
    navigate('/app/receitas/novo');
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setSaving(true);
    setSaveError(null);
    const payload = {
      name: form.name,
      description: form.description,
      prepTimeMinutes: Number(form.prepTimeMinutes),
      yield: Number(form.yield),
      yieldUnit: form.yieldUnit,
      ingredients: form.ingredients.map((item) => ({
        inputId: item.inputId,
        quantity: Number(item.quantity),
        unit: inputs.find((input) => input.id === item.inputId)?.unit ?? item.unit
      })),
      subRecipes: form.subRecipes.map((item) => ({
        recipeId: item.recipeId,
        quantity: Number(item.quantity)
      })),
      tags: form.tags
    };

    try {
      const saved = await apiFetch<RecipeItem>(editingId ? `/recipes/${editingId}` : '/recipes', {
        method: editingId ? 'PUT' : 'POST', token: user?.token, body: JSON.stringify(payload)
      });
      invalidateQueryCache(queryKeys.recipes);
      if (editor) { await editor.onSaved(saved.id); return; }

      resetForm();
      setShowForm(false);
      invalidateQueryCache(queryKeys.recipes);
      await recipesQuery.refetch();
      navigate('/app/receitas');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Nao foi possivel salvar.');
    } finally {
      setSaving(false);
    }
  };

  const filtered = recipes.filter((recipe) => {
    const haystack = `${recipe.name} ${recipe.tags?.join(' ') ?? ''}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const inputsMap = useMemo(() => new Map(inputs.map((input) => [input.id, input])), [inputs]);

  const unitOptionsForInput = (inputId: string) => {
    const input = inputsMap.get(inputId);
    if (!input) return units.map((unit) => ({ value: unit, label: unit === 'un' ? 'und' : unit }));
    return [{ value: input.unit, label: input.unit === 'un' ? 'und' : input.unit }];
  };

  const subRecipeCandidates = useMemo(
    () => recipes.filter((recipe) => recipe.id !== editingId),
    [recipes, editingId]
  );

  const openInputPicker = () => {
    setInputPickerSelectedIds(
      form.ingredients
        .map((item) => item.inputId)
        .filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index)
    );
    setInputPickerSearch('');
    setShowInputPicker(true);
  };

  const openQuickInputCreate = () => setCatalogEditor({ kind: 'input' });
  const handleCatalogSaved = async (id: string) => {
    if (!catalogEditor?.id) {
      const select = catalogEditor?.kind === 'recipe' ? setSubRecipePickerSelectedIds : setInputPickerSelectedIds;
      select((current) => current.includes(id) ? current : [...current, id]);
    }
    await Promise.all([inputsQuery.refetch(), recipesQuery.refetch()])
      .catch(() => setSaveError('O item foi salvo, mas nao foi possivel atualizar os dados. Tente novamente.'));
    setCatalogEditor(null);
  };

  const toggleInputPickerItem = (inputId: string, checked: boolean) => {
    setInputPickerSelectedIds((current) => {
      if (checked) return current.includes(inputId) ? current : [...current, inputId];
      return current.filter((id) => id !== inputId);
    });
  };

  const applyInputPicker = () => {
    const existingByInputId = new Map(
      form.ingredients
        .filter((item) => item.inputId)
        .map((item) => [item.inputId, item] as const)
    );

    const nextIngredients = inputPickerSelectedIds
      .map((inputId) => {
        const input = inputsMap.get(inputId);
        if (!input) return null;
        const existing = existingByInputId.get(inputId);
        if (existing) return existing;
        return { inputId, quantity: 0, unit: input.unit };
      })
      .filter((item): item is { inputId: string; quantity: number; unit: 'g' | 'ml' | 'un' } => Boolean(item));

    setForm((prev) => ({ ...prev, ingredients: nextIngredients }));
    setShowInputPicker(false);
  };

  const inputFilteredItems = useMemo(() => {
    const needle = inputPickerSearch.trim().toLowerCase();
    if (!needle) return inputs;
    return inputs.filter((item) => item.name.toLowerCase().includes(needle));
  }, [inputs, inputPickerSearch]);

  const inputSelectedItems = useMemo(
    () =>
      inputPickerSelectedIds
        .map((id) => inputsMap.get(id))
        .filter((item): item is InputItem => Boolean(item)),
    [inputsMap, inputPickerSelectedIds]
  );

  const inputUnselectedItems = useMemo(
    () => inputFilteredItems.filter((item) => !inputPickerSelectedIds.includes(item.id)),
    [inputFilteredItems, inputPickerSelectedIds]
  );

  const openSubRecipePicker = () => {
    setSubRecipePickerSelectedIds(
      form.subRecipes
        .map((item) => item.recipeId)
        .filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index)
    );
    setSubRecipePickerSearch('');
    setShowSubRecipePicker(true);
  };

  const toggleSubRecipePickerItem = (recipeId: string, checked: boolean) => {
    setSubRecipePickerSelectedIds((current) => {
      if (checked) return current.includes(recipeId) ? current : [...current, recipeId];
      return current.filter((id) => id !== recipeId);
    });
  };

  const applySubRecipePicker = () => {
    const existingByRecipeId = new Map(
      form.subRecipes
        .filter((item) => item.recipeId)
        .map((item) => [item.recipeId, item] as const)
    );

    const nextSubRecipes = subRecipePickerSelectedIds
      .map((recipeId) => {
        const recipe = subRecipeCandidates.find((item) => item.id === recipeId);
        if (!recipe) return null;
        const existing = existingByRecipeId.get(recipeId);
        if (existing) return existing;
        return { recipeId, quantity: 0 };
      })
      .filter((item): item is { recipeId: string; quantity: number } => Boolean(item));

    setForm((prev) => ({ ...prev, subRecipes: nextSubRecipes }));
    setShowSubRecipePicker(false);
  };

  const subRecipeFilteredItems = useMemo(() => {
    const needle = subRecipePickerSearch.trim().toLowerCase();
    if (!needle) return subRecipeCandidates;
    return subRecipeCandidates.filter((item) => item.name.toLowerCase().includes(needle));
  }, [subRecipeCandidates, subRecipePickerSearch]);

  const subRecipeSelectedItems = useMemo(
    () =>
      subRecipePickerSelectedIds
        .map((id) => subRecipeCandidates.find((item) => item.id === id))
        .filter((item): item is RecipeItem => Boolean(item)),
    [subRecipeCandidates, subRecipePickerSelectedIds]
  );

  const subRecipeUnselectedItems = useMemo(
    () => subRecipeFilteredItems.filter((item) => !subRecipePickerSelectedIds.includes(item.id)),
    [subRecipeFilteredItems, subRecipePickerSelectedIds]
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

  const handleDeleteRecipe = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/recipes/${deleteTarget.id}`, {
        method: 'DELETE',
        token: user?.token
      });
      setRecipes((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      invalidateQueryCache(queryKeys.recipes);
      await recipesQuery.refetch();
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="page recipes-page">
      {saveError ? <p className="error" role="alert">{saveError}</p> : null}
      {!isCreateView && !editingRouteId ? <RecipesListPanel recipes={filtered} search={search} loading={recipesQuery.loading} onSearch={setSearch} onNew={handleNew} onOpen={(id) => navigate(`/app/receitas/editar/${id}`)} onDuplicate={(recipe) => navigate('/app/receitas/novo', { state: { duplicateDraft: { name: `${recipe.name} copia`, description: recipe.description ?? '', prepTimeMinutes: recipe.prepTimeMinutes ?? 0, yield: recipe.yield, yieldUnit: recipe.yieldUnit ?? 'un', ingredients: (recipe.ingredients ?? []).map((item) => ({ ...item })), subRecipes: (recipe.subRecipes ?? []).map((item) => ({ ...item })), tags: [...(recipe.tags ?? [])] } satisfies RecipeFormState } })} onDelete={setDeleteTarget} /> : null}

      {editor && initializedForm.current !== formKey ? <p role="status">{recipesQuery.error ? 'Nao foi possivel carregar o cadastro. Feche e tente novamente.' : 'Carregando cadastro...'}</p> : null}
      {showForm && initializedForm.current === formKey && (
        <>
          <section className="recipe-editor">
            <header className="recipe-editor-hero">
              <button type="button" className="recipe-editor-back" onClick={() => editor ? editor.onClose() : navigate('/app/receitas')} aria-label="Voltar para receitas"><span className="material-symbols-outlined" aria-hidden="true">arrow_back</span></button>
              <div className="recipe-editor-hero-copy"><span>Ficha técnica</span><h1>{editingId ? 'Editar receita' : 'Nova receita'}</h1><small>Defina o rendimento, os insumos e o custo deste preparo.</small></div>
              <div className="recipe-editor-total"><span>Custo atual</span><strong>{formatCurrency(costSummary.total)}</strong></div>
            </header>
            <div className="recipe-editor-form">
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
                    value={form.yield === 0 ? '' : form.yield}
                    onChange={(e) => setForm({ ...form, yield: Number(e.target.value || 0) })}
                    min={1}
                  />
                  <SelectField
                    className="unit-select"
                    value={form.yieldUnit}
                    onChange={(value) => setForm({ ...form, yieldUnit: value as RecipeItem['yieldUnit'] })}
                    options={units.map((unit) => ({ value: unit, label: unit === 'un' ? 'und' : unit }))}
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
              <FormActions
                onCancel={() => editor ? editor.onClose() : navigate('/app/receitas')}
                submitLabel={editingId ? 'Salvar alteracoes' : 'Salvar receita'}
              />
            </form>
            </div>
          </section>

          <div className="panel">
            <h3>Insumos</h3>
            <div className="ingredients">
              {form.ingredients.map((ingredient, index) => (
                <div key={`${ingredient.inputId}-${index}`} className="add-item-row recipe-add-item-row">
                  <div className="order-product-label">
                    <span>{inputsMap.get(ingredient.inputId)?.name ?? 'Insumo nao encontrado'}</span>
                    <EditCatalogItem label="Editar insumo" onClick={() => setCatalogEditor({ kind: 'input', id: ingredient.inputId })} />
                    <small className="order-product-meta">
                      {inputsMap.get(ingredient.inputId)?.packageSize ?? 0} {inputsMap.get(ingredient.inputId)?.unit ?? '-'}
                    </small>
                  </div>
                  <label className="add-item-qty-field">
                    <span>Quantidade</span>
                    <input
                      className="add-item-qty-input"
                      type="number"
                      value={ingredient.quantity === 0 ? '' : ingredient.quantity}
                      onChange={(e) => handleIngredientChange(index, 'quantity', Number(e.target.value || 0))}
                      min={0}
                      step="0.01"
                      aria-label="Quantidade"
                    />
                  </label>
                  <SelectField
                    className="add-item-unit-select"
                    value={inputsMap.get(ingredient.inputId)?.unit ?? ingredient.unit}
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
                    <span className="material-symbols-outlined" aria-hidden="true">delete_outline</span>
                  </button>
                </div>
              ))}
              <button type="button" className="ghost" onClick={openInputPicker}>
                + Adicionar insumo
              </button>
            </div>
          </div>

          <div className="panel">
            <h3>Outras receitas</h3>
            <div className="ingredients">
              {form.subRecipes.map((item, index) => (
                <div key={`${item.recipeId}-${index}`} className="add-item-row recipe-sub-item-row">
                  <div className="order-product-label">
                    <span>{subRecipeCandidates.find((recipe) => recipe.id === item.recipeId)?.name ?? 'Receita nao encontrada'}</span>
                    <EditCatalogItem label="Editar receita" onClick={() => setCatalogEditor({ kind: 'recipe', id: item.recipeId })} />
                    <small className="order-product-meta">
                      {subRecipeCandidates.find((recipe) => recipe.id === item.recipeId)?.yield ?? 0} {subRecipeCandidates.find((recipe) => recipe.id === item.recipeId)?.yieldUnit ?? '-'} 
                    </small>
                  </div>
                  <label className="add-item-qty-field">
                    <span>Quantidade</span>
                    <input
                      className="add-item-qty-input"
                      type="number"
                      value={item.quantity === 0 ? '' : item.quantity}
                      onChange={(e) => handleSubRecipeChange(index, 'quantity', Number(e.target.value || 0))}
                      min={0}
                      step="0.01"
                      aria-label="Quantidade"
                    />
                  </label>
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
                    <span className="material-symbols-outlined" aria-hidden="true">delete_outline</span>
                  </button>
                </div>
              ))}
              <button type="button" className="ghost" onClick={openSubRecipePicker}>
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

      {showInputPicker ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal product-picker-modal">
            <div className="product-picker-head">
              <h4>Selecionar insumos</h4>
              <div className="product-picker-head-right">
                <strong className="product-picker-count">{inputPickerSelectedIds.length} selecionado(s)</strong>
                <button type="button" className="icon-button small" onClick={() => setShowInputPicker(false)} aria-label="Fechar">
                  <span className="material-symbols-outlined" aria-hidden="true">close</span>
                </button>
              </div>
            </div>
            <div className="product-picker-search-row">
              <input
                className="product-picker-search"
                type="search"
                value={inputPickerSearch}
                onChange={(e) => setInputPickerSearch(e.target.value)}
                placeholder="Buscar insumo..."
              />
              <button type="button" className="icon-button" onClick={openQuickInputCreate} aria-label="Novo insumo">
                <span className="material-symbols-outlined" aria-hidden="true">add</span>
              </button>
            </div>
            <div className="product-picker-list">
              {inputSelectedItems.map((input) => {
                const checked = inputPickerSelectedIds.includes(input.id);
                return (
                  <label key={input.id} className="product-picker-row">
                    <div className="product-picker-main">
                      <strong>{input.name}</strong>
                      <span className="muted">{formatCurrency(input.packagePrice)} / {input.packageSize} {input.unit}</span>
                    </div>
                    <input
                      className="pretty-checkbox"
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => toggleInputPickerItem(input.id, event.target.checked)}
                    />
                  </label>
                );
              })}
              {inputSelectedItems.length > 0 && inputUnselectedItems.length > 0 ? (
                <div className="product-picker-divider" aria-hidden="true" />
              ) : null}
              {inputUnselectedItems.map((input) => {
                const checked = inputPickerSelectedIds.includes(input.id);
                return (
                  <label key={input.id} className="product-picker-row">
                    <div className="product-picker-main">
                      <strong>{input.name}</strong>
                      <span className="muted">{formatCurrency(input.packagePrice)} / {input.packageSize} {input.unit}</span>
                    </div>
                    <input
                      className="pretty-checkbox"
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => toggleInputPickerItem(input.id, event.target.checked)}
                    />
                  </label>
                );
              })}
            </div>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setShowInputPicker(false)}>Cancelar</button>
              <button type="button" onClick={applyInputPicker}>Salvar selecao</button>
            </div>
          </div>
        </div>
      ) : null}

      {catalogEditor ? <CatalogEditorDialog target={catalogEditor} onClose={() => setCatalogEditor(null)} onSaved={handleCatalogSaved} /> : null}

      {showSubRecipePicker ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal product-picker-modal">
            <div className="product-picker-head">
              <h4>Selecionar receitas</h4>
              <button type="button" className="ghost" onClick={() => setCatalogEditor({ kind: 'recipe' })}>+ Nova receita</button>
              <div className="product-picker-head-right">
                <strong className="product-picker-count">{subRecipePickerSelectedIds.length} selecionado(s)</strong>
                <button type="button" className="icon-button small" onClick={() => setShowSubRecipePicker(false)} aria-label="Fechar">
                  <span className="material-symbols-outlined" aria-hidden="true">close</span>
                </button>
              </div>
            </div>
            <input
              className="product-picker-search"
              type="search"
              value={subRecipePickerSearch}
              onChange={(e) => setSubRecipePickerSearch(e.target.value)}
              placeholder="Buscar receita..."
            />
            <div className="product-picker-list">
              {subRecipeSelectedItems.map((recipe) => {
                const checked = subRecipePickerSelectedIds.includes(recipe.id);
                return (
                  <label key={recipe.id} className="product-picker-row">
                    <div className="product-picker-main">
                      <strong>{recipe.name}</strong>
                      <span className="muted">Rendimento {recipe.yield} {recipe.yieldUnit}</span>
                    </div>
                    <input
                      className="pretty-checkbox"
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => toggleSubRecipePickerItem(recipe.id, event.target.checked)}
                    />
                  </label>
                );
              })}
              {subRecipeSelectedItems.length > 0 && subRecipeUnselectedItems.length > 0 ? (
                <div className="product-picker-divider" aria-hidden="true" />
              ) : null}
              {subRecipeUnselectedItems.map((recipe) => {
                const checked = subRecipePickerSelectedIds.includes(recipe.id);
                return (
                  <label key={recipe.id} className="product-picker-row">
                    <div className="product-picker-main">
                      <strong>{recipe.name}</strong>
                      <span className="muted">Rendimento {recipe.yield} {recipe.yieldUnit}</span>
                    </div>
                    <input
                      className="pretty-checkbox"
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => toggleSubRecipePickerItem(recipe.id, event.target.checked)}
                    />
                  </label>
                );
              })}
            </div>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setShowSubRecipePicker(false)}>Cancelar</button>
              <button type="button" onClick={applySubRecipePicker}>Salvar selecao</button>
            </div>
          </div>
        </div>
      ) : null}

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
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Excluir receita?"
        message={`Deseja realmente excluir "${deleteTarget?.name ?? ''}"?`}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteRecipe}
      />
      <LoadingOverlay open={saving || deleting} label={deleting ? 'Excluindo receita...' : 'Salvando receita...'} />
    </div>
  );
};
