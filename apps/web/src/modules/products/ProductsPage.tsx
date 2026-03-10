import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../shared/api.ts';
import { useAuth } from '../auth/AuthContext.tsx';
import type { RecipeItem } from '../recipes/RecipesPage.tsx';
import { SelectField } from '../shared/SelectField.tsx';
import { ListToolbar } from '../shared/ListToolbar.tsx';
import { ConfirmDialog } from '../shared/ConfirmDialog.tsx';
import type { InputItem } from '../inputs/InputsPage.tsx';
import { LoadingOverlay } from '../shared/LoadingOverlay.tsx';
import { MoneyInput } from '../shared/MoneyInput.tsx';
import { ListSkeleton } from '../shared/ListSkeleton.tsx';
import { invalidateQueryCache, useCachedQuery } from '../shared/queryCache.ts';
import { queryKeys } from '../shared/queryKeys.ts';

type ProductPickerType = 'EXTRA_RECIPE' | 'EXTRA_PRODUCT' | 'PACKAGING';

export type ProductItem = {
  id: string;
  name: string;
  recipeId?: string;
  prepTimeMinutes: number;
  notes?: string;
  unitsCount: number;
  targetProfitPercent: number;
  extraPercent: number;
  unitPrice: number;
  salePrice: number;
  channelId?: string;
  extraRecipes: { recipeId: string; quantity: number }[];
  extraProducts: { productId: string; quantity: number }[];
  packagingInputs: { inputId: string; quantity: number; unit: 'kg' | 'g' | 'l' | 'ml' | 'un' }[];
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

const formatCurrency = (value: number) => `R$ ${value.toFixed(2)}`;

export const ProductsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const params = useParams<{ productId?: string }>();
  const isCreateView = pathname.endsWith('/novo');
  const editingRouteId = pathname.includes('/editar/') ? params.productId ?? null : null;
  const [recipes, setRecipes] = useState<RecipeItem[]>([]);
  const [inputs, setInputs] = useState<InputItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(Boolean(isCreateView || editingRouteId));
  const [editingId, setEditingId] = useState<string | null>(editingRouteId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProductItem | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerType, setPickerType] = useState<ProductPickerType>('EXTRA_RECIPE');
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerSelectedIds, setPickerSelectedIds] = useState<string[]>([]);
  const confirmActionRef = useRef<null | (() => void)>(null);
  const [unitPriceInput, setUnitPriceInput] = useState(0);
  const lastEditedRef = useRef<'profit' | 'unitPrice' | null>(null);
  const [form, setForm] = useState({
    name: '',
    prepTimeMinutes: 0,
    notes: '',
    unitsCount: 1,
    targetProfitPercent: 30,
    extraPercent: 0,
    unitPrice: 0,
    channelId: '',
    extraRecipes: [] as { recipeId: string; quantity: number }[],
    extraProducts: [] as { productId: string; quantity: number }[],
    packagingInputs: [] as { inputId: string; quantity: number; unit: 'kg' | 'g' | 'l' | 'ml' | 'un' }[]
  });

  const recipesQuery = useCachedQuery(
    queryKeys.recipes,
    () => apiFetch<RecipeItem[]>('/recipes', { token: user?.token }),
    { staleTime: 3 * 60_000, enabled: Boolean(user?.token) }
  );
  const productsQuery = useCachedQuery(
    queryKeys.products,
    () => apiFetch<ProductItem[]>('/products', { token: user?.token }),
    { staleTime: 3 * 60_000, enabled: Boolean(user?.token) }
  );
  const settingsQuery = useCachedQuery(
    queryKeys.companySettings,
    () => apiFetch<Settings>('/company/settings', { token: user?.token }),
    { staleTime: 5 * 60_000, enabled: Boolean(user?.token) }
  );
  const inputsQuery = useCachedQuery(
    queryKeys.inputs,
    () => apiFetch<InputItem[]>('/inputs', { token: user?.token }),
    { staleTime: 3 * 60_000, enabled: Boolean(user?.token) }
  );

  useEffect(() => {
    if (recipesQuery.data) setRecipes(recipesQuery.data);
  }, [recipesQuery.data]);

  useEffect(() => {
    if (productsQuery.data) setProducts(productsQuery.data);
  }, [productsQuery.data]);

  useEffect(() => {
    if (!settingsQuery.data) return;
    setSettings(settingsQuery.data);
    setForm((current) => ({
      ...current,
      targetProfitPercent: settingsQuery.data.defaultProfitPercent,
      channelId: settingsQuery.data.salesChannels[0]?.id ?? ''
    }));
    setUnitPriceInput(0);
  }, [settingsQuery.data]);

  useEffect(() => {
    if (inputsQuery.data) setInputs(inputsQuery.data);
  }, [inputsQuery.data]);

  useEffect(() => {
    if (isCreateView) {
      resetForm();
      setShowForm(true);
      return;
    }
    if (editingRouteId) {
      const current = (productsQuery.data ?? []).find((item) => item.id === editingRouteId);
      if (!current) return;
      setEditingId(current.id);
      setForm({
        name: current.name,
        prepTimeMinutes: current.prepTimeMinutes ?? 0,
        notes: current.notes ?? '',
        unitsCount: current.unitsCount ?? 1,
        targetProfitPercent: current.targetProfitPercent,
        extraPercent: current.extraPercent ?? 0,
        unitPrice: current.unitPrice ?? 0,
        channelId: current.channelId ?? settings?.salesChannels[0]?.id ?? '',
        extraRecipes: current.extraRecipes ?? [],
        extraProducts: current.extraProducts ?? [],
        packagingInputs: current.packagingInputs ?? []
      });
      setUnitPriceInput(current.unitPrice ?? 0);
      lastEditedRef.current = null;
      setShowForm(true);
      return;
    }
    setEditingId(null);
    setShowForm(false);
  }, [isCreateView, editingRouteId, productsQuery.data, settings]);

  const resetForm = () => {
    setForm({
      name: '',
      prepTimeMinutes: 0,
      notes: '',
      unitsCount: 1,
      targetProfitPercent: settings?.defaultProfitPercent ?? 30,
      extraPercent: 0,
      unitPrice: 0,
      channelId: settings?.salesChannels[0]?.id ?? '',
      extraRecipes: [],
      extraProducts: [],
      packagingInputs: []
    });
    setEditingId(null);
    setUnitPriceInput(0);
  };

  const handleNew = () => {
    if (editingId) {
      confirmActionRef.current = () => {
        resetForm();
        navigate('/app/produtos/novo');
      };
      setConfirmOpen(true);
      return;
    }
    navigate('/app/produtos/novo');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);

    const payload = {
      name: form.name,
      recipeId: form.extraRecipes[0]?.recipeId,
      prepTimeMinutes: Number(form.prepTimeMinutes),
      notes: form.notes,
      unitsCount: Number(form.unitsCount),
      targetProfitPercent: Number(form.targetProfitPercent),
      extraPercent: Number(form.extraPercent),
      manualUnitPrice: Number(unitPriceInput || 0),
      channelId: form.channelId,
      extraRecipes: form.extraRecipes.map((item) => ({
        recipeId: item.recipeId,
        quantity: Number(item.quantity)
      })),
      extraProducts: form.extraProducts.map((item) => ({
        productId: item.productId,
        quantity: Number(item.quantity)
      })),
      packagingInputs: form.packagingInputs.map((item) => ({
        inputId: item.inputId,
        quantity: Number(item.quantity),
        unit: item.unit
      }))
    };

    try {
      const response = await apiFetch<{ product: ProductItem }>(editingId ? `/products/${editingId}` : '/products', {
        method: editingId ? 'PUT' : 'POST',
        token: user?.token,
        body: JSON.stringify(payload)
      });

      setProducts((prev) => {
        if (!editingId) return [response.product, ...prev];
        return prev.map((item) => (item.id === response.product.id ? response.product : item));
      });
      invalidateQueryCache(queryKeys.products);
      productsQuery.refetch().catch(() => undefined);

      resetForm();
      setShowForm(false);
      lastEditedRef.current = null;
      navigate('/app/produtos');
    } finally {
      setSaving(false);
    }
  };

  const filtered = products.filter((product) =>
    product.name.toLowerCase().includes(search.toLowerCase())
  );

  const recipesById = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes]);
  const inputsById = useMemo(() => new Map(inputs.map((input) => [input.id, input])), [inputs]);
  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const packagingCandidates = useMemo(
    () => inputs.filter((input) => input.category === 'embalagem'),
    [inputs]
  );
  const productCandidates = useMemo(
    () => products.filter((product) => product.id !== editingId),
    [products, editingId]
  );

  const openPicker = (type: ProductPickerType) => {
    setPickerType(type);
    setPickerSearch('');
    if (type === 'EXTRA_RECIPE') {
      setPickerSelectedIds(
        form.extraRecipes
          .map((item) => item.recipeId)
          .filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index)
      );
    } else if (type === 'EXTRA_PRODUCT') {
      setPickerSelectedIds(
        form.extraProducts
          .map((item) => item.productId)
          .filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index)
      );
    } else {
      setPickerSelectedIds(
        form.packagingInputs
          .map((item) => item.inputId)
          .filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index)
      );
    }
    setPickerOpen(true);
  };

  const togglePickerItem = (id: string, checked: boolean) => {
    setPickerSelectedIds((current) => {
      if (checked) return current.includes(id) ? current : [...current, id];
      return current.filter((itemId) => itemId !== id);
    });
  };

  const pickerAllItems = useMemo(() => {
    if (pickerType === 'EXTRA_RECIPE') return recipes as Array<{ id: string; name: string }>;
    if (pickerType === 'EXTRA_PRODUCT') return productCandidates as Array<{ id: string; name: string }>;
    return packagingCandidates as Array<{ id: string; name: string }>;
  }, [pickerType, recipes, productCandidates, packagingCandidates]);

  const pickerFilteredItems = useMemo(() => {
    const needle = pickerSearch.trim().toLowerCase();
    if (!needle) return pickerAllItems;
    return pickerAllItems.filter((item) => item.name.toLowerCase().includes(needle));
  }, [pickerAllItems, pickerSearch]);

  const pickerSelectedItems = useMemo(
    () =>
      pickerSelectedIds
        .map((id) => pickerAllItems.find((item) => item.id === id))
        .filter((item): item is { id: string; name: string } => Boolean(item)),
    [pickerAllItems, pickerSelectedIds]
  );

  const pickerUnselectedItems = useMemo(
    () => pickerFilteredItems.filter((item) => !pickerSelectedIds.includes(item.id)),
    [pickerFilteredItems, pickerSelectedIds]
  );

  const applyPickerSelection = () => {
    if (pickerType === 'EXTRA_RECIPE') {
      const existingById = new Map(form.extraRecipes.map((item) => [item.recipeId, item] as const));
      const next = pickerSelectedIds
        .map((id) => {
          const existing = existingById.get(id);
          if (existing) return existing;
          const recipe = recipesById.get(id);
          if (!recipe) return null;
          return { recipeId: id, quantity: 0 };
        })
        .filter((item): item is { recipeId: string; quantity: number } => Boolean(item));
      setForm((prev) => ({ ...prev, extraRecipes: next }));
    } else if (pickerType === 'EXTRA_PRODUCT') {
      const existingById = new Map(form.extraProducts.map((item) => [item.productId, item] as const));
      const next = pickerSelectedIds
        .map((id) => {
          const existing = existingById.get(id);
          if (existing) return existing;
          const product = productsById.get(id);
          if (!product) return null;
          return { productId: id, quantity: 0 };
        })
        .filter((item): item is { productId: string; quantity: number } => Boolean(item));
      setForm((prev) => ({ ...prev, extraProducts: next }));
    } else {
      const existingById = new Map(form.packagingInputs.map((item) => [item.inputId, item] as const));
      const next = pickerSelectedIds
        .map((id) => {
          const existing = existingById.get(id);
          if (existing) return existing;
          const input = inputsById.get(id);
          if (!input) return null;
          return { inputId: id, quantity: 0, unit: input.unit as 'kg' | 'g' | 'l' | 'ml' | 'un' };
        })
        .filter((item): item is { inputId: string; quantity: number; unit: 'kg' | 'g' | 'l' | 'ml' | 'un' } => Boolean(item));
      setForm((prev) => ({ ...prev, packagingInputs: next }));
    }
    setPickerOpen(false);
  };

  const costSummary = useMemo(() => {
    const inputsMap = new Map(inputs.map((input) => [input.id, input]));
    const recipesMap = new Map(recipes.map((recipe) => [recipe.id, recipe]));
    const productsMap = new Map(products.map((product) => [product.id, product]));

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

    const extraRecipesCost = form.extraRecipes.reduce((sum, item) => {
      const recipe = recipesMap.get(item.recipeId);
      if (!recipe || recipe.yield <= 0) return sum;
      const total = calcRecipeCost(recipe);
      return sum + (total / recipe.yield) * item.quantity;
    }, 0);

    const extraProductsCost = form.extraProducts.reduce((sum, item) => {
      const product = productsMap.get(item.productId);
      if (!product) return sum;
      const unit = product.unitPrice > 0 ? product.unitPrice : product.salePrice;
      return sum + unit * item.quantity;
    }, 0);

    const packagingCost = form.packagingInputs.reduce((sum, item) => {
      const input = inputsMap.get(item.inputId);
      if (!input) return sum;
      const unitCost = input.packagePrice / input.packageSize;
      const normalized = normalizeQuantity(item.quantity, item.unit, input.unit);
      return sum + unitCost * normalized;
    }, 0);

    const directCost = extraRecipesCost + extraProductsCost + packagingCost;

    const baseOverhead = settings?.overheadMethod === 'PERCENT_DIRECT'
      ? (directCost * (settings?.overheadPercent ?? 0)) / 100
      : (settings?.overheadPerUnit ?? 0) * form.unitsCount;

    const hours = (form.prepTimeMinutes ?? 0) / 60;
    const labor = (settings?.laborCostPerHour ?? 0) * hours;
    const fixed = (settings?.fixedCostPerHour ?? 0) * hours;

    const totalCost = directCost + baseOverhead + labor + fixed;
    const channel = settings?.salesChannels.find((c) => c.id === form.channelId);
    const variablePercentBase = (settings?.taxesPercent ?? 0) + (channel?.feePercent ?? 0) + (channel?.paymentFeePercent ?? 0);
    const feeFixed = channel?.feeFixed ?? 0;
    const denominator = Math.max(1 - variablePercentBase / 100, 0.001);
    const baseCost = totalCost + feeFixed;
    const markupMultiplier = 1 + (form.targetProfitPercent + form.extraPercent) / 100;
    const totalPrice = (baseCost * markupMultiplier) / denominator;
    const unitPrice = totalPrice / (form.unitsCount || 1);

    return {
      labor,
      fixed,
      inputs: directCost,
      total: totalCost,
      baseCost,
      unitPrice,
      profitPercent: form.targetProfitPercent,
      variablePercentBase
    };
  }, [form, inputs, recipes, products, settings]);

  useEffect(() => {
    if (lastEditedRef.current === 'unitPrice') return;
    setUnitPriceInput(Number(costSummary.unitPrice.toFixed(2)));
  }, [costSummary.unitPrice]);

  const handleUnitPriceChange = (value: number) => {
    lastEditedRef.current = 'unitPrice';
    setUnitPriceInput(value);

    const totalPrice = value * (form.unitsCount || 1);
    if (totalPrice <= 0) return;

    const denominator = Math.max(1 - costSummary.variablePercentBase / 100, 0.001);
    const recoveredBase = totalPrice * denominator;
    const markupPercent = (recoveredBase / Math.max(costSummary.baseCost, 0.0001) - 1) * 100;
    const profitPercent = markupPercent - form.extraPercent;
    setForm({ ...form, targetProfitPercent: Number(Math.max(profitPercent, 0).toFixed(2)) });
  };

  const handleDeleteProduct = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/products/${deleteTarget.id}`, {
        method: 'DELETE',
        token: user?.token
      });
      setProducts((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      invalidateQueryCache(queryKeys.products);
      await productsQuery.refetch();
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="page">
      {!isCreateView && !editingRouteId ? (
      <div className="panel">
        <ListToolbar
          title="Produtos cadastrados"
          searchValue={search}
          onSearch={setSearch}
          actionLabel="+"
          onAction={handleNew}
        />
        {productsQuery.loading && products.length === 0 ? (
          <ListSkeleton />
        ) : (
          <div className="table">
            {filtered.map((product) => (
              <div key={product.id} className="list-row">
                <div>
                  <strong>{product.name}</strong>
                  <span className="muted">R$ {product.unitPrice?.toFixed(2)} un • R$ {product.salePrice.toFixed(2)}</span>
                </div>
                <div className="inline-right">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Editar"
                    onClick={() => navigate(`/app/produtos/editar/${product.id}`)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 20h4l10-10-4-4L4 16v4zm12-12 4 4" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Excluir"
                    onClick={() => setDeleteTarget(product)}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">delete_outline</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      ) : null}

      {showForm && (
        <>
          <div className="panel">
            <div className="panel-title-row">
                <button type="button" className="icon-button small" onClick={() => navigate('/app/produtos')} aria-label="Voltar">
                  <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
                </button>
              <h3>{editingId ? 'Editar produto' : 'Novo produto'}</h3>
            </div>
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
                Observacoes
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
              </label>
              <div className="actions">
                <button type="button" className="ghost" onClick={() => navigate('/app/produtos')}>
                  Cancelar
                </button>
                <button type="submit">{editingId ? 'Salvar alteracoes' : 'Salvar produto'}</button>
              </div>
            </form>
          </div>

          <div className="panel">
            <h3>Calculo por unidade</h3>
            <div className="grid-2">
              <label>
                Canal de venda
                <SelectField
                  value={form.channelId}
                  onChange={(value) => setForm({ ...form, channelId: value })}
                  options={(settings?.salesChannels ?? []).map((channel) => ({
                    value: channel.id,
                    label: channel.name
                  }))}
                />
              </label>
            </div>
            <div className="grid-2 compact-grid">
              <label>
                Unidades produzidas
                <input
                  type="number"
                  value={form.unitsCount === 0 ? '' : form.unitsCount}
                  onChange={(e) => {
                    lastEditedRef.current = 'profit';
                    setForm({ ...form, unitsCount: Number(e.target.value || 0) });
                  }}
                  min={1}
                />
              </label>
              <label>
                Valor por unidade (calculado)
                <MoneyInput
                  value={unitPriceInput}
                  onChange={handleUnitPriceChange}
                />
              </label>
            </div>
            <div className="grid-2 compact-grid">
              <label>
                % de lucro
                <input
                  type="number"
                  value={form.targetProfitPercent === 0 ? '' : form.targetProfitPercent}
                  onChange={(e) => {
                    lastEditedRef.current = 'profit';
                    setForm({ ...form, targetProfitPercent: Number(e.target.value || 0) });
                  }}
                  min={0}
                />
              </label>
              <label>
                Taxa adicional (%)
                <input
                  type="number"
                  value={form.extraPercent === 0 ? '' : form.extraPercent}
                  onChange={(e) => {
                    lastEditedRef.current = 'profit';
                    setForm({ ...form, extraPercent: Number(e.target.value || 0) });
                  }}
                  min={0}
                />
              </label>
            </div>
          </div>

          <div className="panel">
            <h3>Adicionar receitas</h3>
            <div className="ingredients">
              {form.extraRecipes.map((item, index) => (
                <div key={`${item.recipeId}-${index}`} className="add-item-row">
                  <span className="order-product-label">
                    {recipesById.get(item.recipeId)?.name ?? 'Receita nao encontrada'}
                  </span>
                  <label className="add-item-qty-field">
                    <span>Quantidade</span>
                    <input
                      className="add-item-qty-input"
                      type="number"
                      value={item.quantity === 0 ? '' : item.quantity}
                      onChange={(e) => {
                        const next = [...form.extraRecipes];
                        next[index] = { ...next[index], quantity: Number(e.target.value || 0) };
                        setForm({ ...form, extraRecipes: next });
                      }}
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
                        extraRecipes: prev.extraRecipes.filter((_, itemIndex) => itemIndex !== index)
                      }))
                    }
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">delete_outline</span>
                  </button>
                </div>
              ))}
              <button type="button" className="ghost" onClick={() => openPicker('EXTRA_RECIPE')}>
                + Adicionar receita
              </button>
            </div>
          </div>

          <div className="panel">
            <h3>Adicionar produtos</h3>
            <div className="ingredients">
              {form.extraProducts.map((item, index) => (
                <div key={`${item.productId}-${index}`} className="add-item-row">
                  <span className="order-product-label">
                    {productsById.get(item.productId)?.name ?? 'Produto nao encontrado'}
                  </span>
                  <label className="add-item-qty-field">
                    <span>Quantidade</span>
                    <input
                      className="add-item-qty-input"
                      type="number"
                      value={item.quantity === 0 ? '' : item.quantity}
                      onChange={(e) => {
                        const next = [...form.extraProducts];
                        next[index] = { ...next[index], quantity: Number(e.target.value || 0) };
                        setForm({ ...form, extraProducts: next });
                      }}
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
                        extraProducts: prev.extraProducts.filter((_, itemIndex) => itemIndex !== index)
                      }))
                    }
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">delete_outline</span>
                  </button>
                </div>
              ))}
              <button type="button" className="ghost" onClick={() => openPicker('EXTRA_PRODUCT')}>
                + Adicionar produto
              </button>
            </div>
          </div>

          <div className="panel">
            <h3>Embalagens</h3>
            <div className="ingredients">
              {form.packagingInputs.map((item, index) => (
                <div key={`${item.inputId}-${index}`} className="add-item-row">
                  <span className="order-product-label">
                    {inputsById.get(item.inputId)?.name ?? 'Embalagem nao encontrada'}
                  </span>
                  <label className="add-item-qty-field">
                    <span>Quantidade</span>
                    <input
                      className="add-item-qty-input"
                      type="number"
                      value={item.quantity === 0 ? '' : item.quantity}
                      onChange={(e) => {
                        const next = [...form.packagingInputs];
                        next[index] = { ...next[index], quantity: Number(e.target.value || 0) };
                        setForm({ ...form, packagingInputs: next });
                      }}
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
                        packagingInputs: prev.packagingInputs.filter((_, itemIndex) => itemIndex !== index)
                      }))
                    }
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">delete_outline</span>
                  </button>
                </div>
              ))}
              <button type="button" className="ghost" onClick={() => openPicker('PACKAGING')}>
                + Adicionar embalagem
              </button>
            </div>
          </div>

          <div className="panel">
            <h3>Resumo</h3>
            <div className="summary">
              <div>
                <span>Valor total de mao de obra</span>
                <strong>R$ {costSummary.labor.toFixed(2)}</strong>
              </div>
              <div>
                <span>Valor total de custos fixos</span>
                <strong>R$ {costSummary.fixed.toFixed(2)}</strong>
              </div>
              <div>
                <span>Valor total de insumos</span>
                <strong>R$ {costSummary.inputs.toFixed(2)}</strong>
              </div>
              <div className="summary-total">
                <span>Valor total</span>
                <strong>R$ {costSummary.total.toFixed(2)}</strong>
              </div>
            </div>
          </div>
        </>
      )}

      {pickerOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal product-picker-modal">
            <div className="product-picker-head">
              <h4>
                {pickerType === 'EXTRA_RECIPE'
                  ? 'Selecionar receitas'
                  : pickerType === 'EXTRA_PRODUCT'
                    ? 'Selecionar produtos'
                    : 'Selecionar embalagens'}
              </h4>
              <div className="product-picker-head-right">
                <strong className="product-picker-count">{pickerSelectedIds.length} selecionado(s)</strong>
                <button type="button" className="icon-button small" onClick={() => setPickerOpen(false)} aria-label="Fechar">
                  <span className="material-symbols-outlined" aria-hidden="true">close</span>
                </button>
              </div>
            </div>
            <input
              className="product-picker-search"
              type="search"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              placeholder={
                pickerType === 'EXTRA_RECIPE'
                  ? 'Buscar receita...'
                  : pickerType === 'EXTRA_PRODUCT'
                    ? 'Buscar produto...'
                    : 'Buscar embalagem...'
              }
            />
            <div className="product-picker-list">
              {pickerSelectedItems.map((item) => {
                const checked = pickerSelectedIds.includes(item.id);
                return (
                  <label key={item.id} className="product-picker-row">
                    <div className="product-picker-main">
                      <strong>{item.name}</strong>
                      <span className="muted">
                        {pickerType === 'EXTRA_RECIPE'
                          ? (() => {
                              const recipe = recipesById.get(item.id);
                              return recipe ? `Rendimento ${recipe.yield} ${recipe.yieldUnit}` : '';
                            })()
                          : pickerType === 'EXTRA_PRODUCT'
                            ? (() => {
                                const product = productsById.get(item.id);
                                return product ? formatCurrency(product.unitPrice || product.salePrice || 0) : '';
                              })()
                            : (() => {
                                const input = inputsById.get(item.id);
                                return input ? `${formatCurrency(input.packagePrice)} / ${input.packageSize} ${input.unit}` : '';
                              })()}
                      </span>
                    </div>
                    <input
                      className="pretty-checkbox"
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => togglePickerItem(item.id, event.target.checked)}
                    />
                  </label>
                );
              })}
              {pickerSelectedItems.length > 0 && pickerUnselectedItems.length > 0 ? (
                <div className="product-picker-divider" aria-hidden="true" />
              ) : null}
              {pickerUnselectedItems.map((item) => {
                const checked = pickerSelectedIds.includes(item.id);
                return (
                  <label key={item.id} className="product-picker-row">
                    <div className="product-picker-main">
                      <strong>{item.name}</strong>
                      <span className="muted">
                        {pickerType === 'EXTRA_RECIPE'
                          ? (() => {
                              const recipe = recipesById.get(item.id);
                              return recipe ? `Rendimento ${recipe.yield} ${recipe.yieldUnit}` : '';
                            })()
                          : pickerType === 'EXTRA_PRODUCT'
                            ? (() => {
                                const product = productsById.get(item.id);
                                return product ? formatCurrency(product.unitPrice || product.salePrice || 0) : '';
                              })()
                            : (() => {
                                const input = inputsById.get(item.id);
                                return input ? `${formatCurrency(input.packagePrice)} / ${input.packageSize} ${input.unit}` : '';
                              })()}
                      </span>
                    </div>
                    <input
                      className="pretty-checkbox"
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => togglePickerItem(item.id, event.target.checked)}
                    />
                  </label>
                );
              })}
            </div>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setPickerOpen(false)}>Cancelar</button>
              <button type="button" onClick={applyPickerSelection}>Salvar selecao</button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        title="Descartar edicao?"
        message="Voce tem uma edicao em andamento. Deseja cancelar e criar um novo produto?"
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
        title="Excluir produto?"
        message={`Deseja realmente excluir "${deleteTarget?.name ?? ''}"?`}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteProduct}
      />
      <LoadingOverlay open={saving || deleting} label={deleting ? 'Excluindo produto...' : 'Salvando produto...'} />
    </div>
  );
};
