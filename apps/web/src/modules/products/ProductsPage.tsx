import { useCatalogCosts } from '../shared/useCatalogCosts.ts';
import { CatalogEditorDialog, CatalogItemName, type CatalogEditorOptions, type CatalogEditorTarget } from '../shared/CatalogEditorDialog.tsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../shared/api.ts';
import { useAuth } from '../auth/AuthContext.tsx';
import type { RecipeItem } from '../recipes/recipe-types.ts';
import { SelectField } from '../shared/SelectField.tsx';
import { ConfirmDialog } from '../shared/ConfirmDialog.tsx';
import type { InputItem } from '../inputs/InputsPage.tsx';
import { LoadingOverlay } from '../shared/LoadingOverlay.tsx';
import { MoneyInput } from '../shared/MoneyInput.tsx';
import { invalidateQueryCache, useCachedQuery } from '../shared/queryCache.ts';
import { queryKeys } from '../shared/queryKeys.ts';
import { FormActions } from '../shared/FormActions.tsx';
import { CatalogListPanel } from '../shared/CatalogListPanel.tsx';
import { useInfiniteList } from '../shared/useInfiniteList.ts';
import { useProductPricing } from './useProductPricing.ts';

type ProductPickerType = 'EXTRA_RECIPE' | 'EXTRA_PRODUCT' | 'DIRECT_INPUT' | 'PACKAGING';

export type ProductItem = {
  id: string;
  name: string;
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
  directInputs: { inputId: string; quantity: number; unit: 'g' | 'ml' | 'un' }[];
  packagingInputs: { inputId: string; quantity: number; unit: 'g' | 'ml' | 'un' }[];
};

type ProductFormState = {
  name: string;
  prepTimeMinutes: number;
  notes: string;
  unitsCount: number;
  targetProfitPercent: number;
  extraPercent: number;
  unitPrice: number;
  channelId: string;
  extraRecipes: { recipeId: string; quantity: number }[];
  extraProducts: { productId: string; quantity: number }[];
  directInputs: { inputId: string; quantity: number; unit: 'g' | 'ml' | 'un' }[];
  packagingInputs: { inputId: string; quantity: number; unit: 'g' | 'ml' | 'un' }[];
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

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
}).format(value);

const formatPercent = (value: number) => new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
}).format(value);

const profitTone = (profitPercent: number): 'low' | 'medium' | 'high' => {
  if (profitPercent < 30) return 'low';
  if (profitPercent < 50) return 'medium';
  return 'high';
};


export const ProductsPage = ({ editor }: { editor?: CatalogEditorOptions } = {}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname, state } = location;
  const params = useParams<{ productId?: string }>();
  const isCreateView = editor ? !editor.id : pathname.endsWith('/novo');
  const editingRouteId = editor ? editor.id ?? null : pathname.includes('/editar/') ? params.productId ?? null : null;
  const isListView = !isCreateView && !editingRouteId;
  const formDataEnabled = Boolean(user?.token) && !isListView;
  const duplicateState = (editor ? null : state as { duplicateDraft?: ProductFormState; unitPriceInput?: number } | null) ?? null;
  const duplicateDraft = duplicateState?.duplicateDraft ?? null;
  const duplicateUnitPriceInput = duplicateState?.unitPriceInput ?? 0;
  const [recipes, setRecipes] = useState<RecipeItem[]>([]);
  const [inputs, setInputs] = useState<InputItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(Boolean(isCreateView || editingRouteId));
  const [editingId, setEditingId] = useState<string | null>(editingRouteId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProductItem | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerType, setPickerType] = useState<ProductPickerType>('EXTRA_RECIPE');
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerSelectedIds, setPickerSelectedIds] = useState<string[]>([]);
  const [catalogEditor, setCatalogEditor] = useState<CatalogEditorTarget | null>(null);
  const confirmActionRef = useRef<null | (() => void)>(null);
  const [unitPriceInput, setUnitPriceInput] = useState(0);
  const [priceSource, setPriceSource] = useState<'markup' | 'price'>('markup');
  const [form, setForm] = useState({
    name: '',
    prepTimeMinutes: 0,
    notes: '',
    unitsCount: 1,
    targetProfitPercent: 0,
    extraPercent: 0,
    unitPrice: 0,
    channelId: '',
    extraRecipes: [] as { recipeId: string; quantity: number }[],
    extraProducts: [] as { productId: string; quantity: number }[],
    directInputs: [] as { inputId: string; quantity: number; unit: 'g' | 'ml' | 'un' }[],
    packagingInputs: [] as { inputId: string; quantity: number; unit: 'g' | 'ml' | 'un' }[]
  });

  const createEmptyForm = (): ProductFormState => ({
    name: '',
    prepTimeMinutes: 0,
    notes: '',
    unitsCount: 1,
    targetProfitPercent: 0,
    extraPercent: 0,
    unitPrice: 0,
    channelId: settings?.salesChannels.find((channel) => channel.active)?.id ?? '',
    extraRecipes: [],
    extraProducts: [],
    directInputs: [],
    packagingInputs: []
  });

  const recipesQuery = useCachedQuery(
    queryKeys.recipes,
    () => apiFetch<RecipeItem[]>('/recipes', { token: user?.token }),
    { staleTime: 3 * 60_000, enabled: formDataEnabled }
  );
  const productsQuery = useCachedQuery(
    queryKeys.products,
    () => apiFetch<ProductItem[]>('/products', { token: user?.token }),
    { staleTime: 3 * 60_000, enabled: formDataEnabled }
  );
  const settingsQuery = useCachedQuery(
    queryKeys.companySettings,
    () => apiFetch<Settings>('/company/settings', { token: user?.token }),
    { staleTime: 5 * 60_000, enabled: formDataEnabled }
  );
  const inputsQuery = useCachedQuery(
    queryKeys.inputs,
    () => apiFetch<InputItem[]>('/inputs', { token: user?.token }),
    { staleTime: 3 * 60_000, enabled: formDataEnabled }
  );

  const listedProductsQuery = useInfiniteList<ProductItem>({
    enabled: Boolean(user?.token) && isListView,
    resetKey: search.trim().toLocaleLowerCase(),
    fetchPage: (offset) => {
      const params = new URLSearchParams({ view: 'list', offset: String(offset), limit: '20' });
      if (search.trim()) params.set('search', search.trim());
      return apiFetch<{ items: ProductItem[]; hasMore: boolean }>(`/products?${params.toString()}`, { token: user?.token });
    }
  });

  useEffect(() => {
    if (recipesQuery.data) setRecipes(recipesQuery.data);
  }, [recipesQuery.data]);

  useEffect(() => {
    if (productsQuery.data) setProducts(productsQuery.data);
  }, [productsQuery.data]);

  useEffect(() => {
    const loadedSettings = settingsQuery.data;
    if (!loadedSettings) return;
    setSettings(loadedSettings);
    if (isCreateView && !duplicateDraft) {
      setForm((current) => ({
        ...current,
        targetProfitPercent: current.targetProfitPercent || loadedSettings.defaultProfitPercent || 0,
        channelId: current.channelId || loadedSettings.salesChannels.find((channel) => channel.active)?.id || ''
      }));
    }
  }, [settingsQuery.data]);

  useEffect(() => {
    if (inputsQuery.data) setInputs(inputsQuery.data);
  }, [inputsQuery.data]);

  useEffect(() => {
    if (!pickerOpen && !catalogEditor) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [pickerOpen, catalogEditor]);

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
              extraRecipes: duplicateDraft.extraRecipes.map((item) => ({ ...item })),
              extraProducts: duplicateDraft.extraProducts.map((item) => ({ ...item })),
              directInputs: (duplicateDraft.directInputs ?? []).map((item) => ({ ...item })),
              packagingInputs: duplicateDraft.packagingInputs.map((item) => ({ ...item }))
            }
          : createEmptyForm()
      );
      setEditingId(null);
      setUnitPriceInput(duplicateDraft ? duplicateUnitPriceInput : 0);
      setPriceSource('markup');
      setSaveError(null);
      setShowForm(true);
      return;
    }
    if (editingRouteId) {
      const current = (productsQuery.data ?? []).find((item) => item.id === editingRouteId);
      if (!current) return;
      initializedForm.current = formKey;
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
        directInputs: current.directInputs ?? [],
        packagingInputs: current.packagingInputs ?? []
      });
      setUnitPriceInput(current.unitPrice ?? 0);
      setPriceSource('markup');
      setSaveError(null);
      setShowForm(true);
      return;
    }
    setEditingId(null);
    setShowForm(false);
  }, [formKey, isCreateView, editingRouteId, productsQuery.data, duplicateDraft, duplicateUnitPriceInput]);

  const resetForm = () => {
    setForm(createEmptyForm());
    setEditingId(null);
    setUnitPriceInput(0);
    setPriceSource('markup');
    setSaveError(null);
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
    event.stopPropagation();
    if (priceSource === 'price' && unitPriceInput <= 0) {
      setSaveError('Informe um valor de venda maior que zero.');
      return;
    }
    setSaving(true);
    setSaveError(null);

    const payload = {
      name: form.name,
      prepTimeMinutes: Number(form.prepTimeMinutes),
      notes: form.notes,
      unitsCount: Number(form.unitsCount),
      targetProfitPercent: priceSource === 'price' ? Math.max(costSummary.profitPercent - form.extraPercent, 0) : Number(form.targetProfitPercent),
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
      directInputs: form.directInputs.map((item) => ({
        inputId: item.inputId,
        quantity: Number(item.quantity),
        unit: inputsById.get(item.inputId)?.unit ?? item.unit
      })),
      packagingInputs: form.packagingInputs.map((item) => ({
        inputId: item.inputId,
        quantity: Number(item.quantity),
        unit: inputsById.get(item.inputId)?.unit ?? item.unit
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
      if (editor) { await editor.onSaved(response.product.id); return; }

      resetForm();
      setShowForm(false);
      navigate('/app/produtos');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Nao foi possivel salvar o produto.');
    } finally {
      setSaving(false);
    }
  };

  const recipesById = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes]);
  const inputsById = useMemo(() => new Map(inputs.map((input) => [input.id, input])), [inputs]);
  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const packagingCandidates = useMemo(
    () => inputs.filter((input) => input.category === 'embalagem'),
    [inputs]
  );
  const directInputCandidates = useMemo(
    () => inputs.filter((input) => input.category !== 'embalagem'),
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
    } else if (type === 'DIRECT_INPUT') {
      setPickerSelectedIds(
        form.directInputs
          .map((item) => item.inputId)
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

  const openQuickCreate = () => setCatalogEditor({
    kind: pickerType === 'EXTRA_RECIPE' ? 'recipe' : pickerType === 'EXTRA_PRODUCT' ? 'product' : 'input',
    category: pickerType === 'PACKAGING' ? 'embalagem' : 'producao'
  });

  const handleCatalogSaved = async (id: string) => {
    if (!catalogEditor?.id) setPickerSelectedIds((current) => current.includes(id) ? current : [...current, id]);
    await Promise.all([inputsQuery.refetch(), recipesQuery.refetch(), productsQuery.refetch()])
      .catch(() => setSaveError('O item foi salvo, mas nao foi possivel atualizar os dados. Tente novamente.'));
    setCatalogEditor(null);
  };

  const togglePickerItem = (id: string, checked: boolean) => {
    setPickerSelectedIds((current) => checked ? (current.includes(id) ? current : [...current, id]) : current.filter((itemId) => itemId !== id));
  };

  const pickerAllItems = useMemo(() => {
    if (pickerType === 'EXTRA_RECIPE') return recipes as Array<{ id: string; name: string }>;
    if (pickerType === 'EXTRA_PRODUCT') return productCandidates as Array<{ id: string; name: string }>;
    return (pickerType === 'DIRECT_INPUT' ? directInputCandidates : packagingCandidates) as Array<{ id: string; name: string }>;
  }, [pickerType, recipes, productCandidates, directInputCandidates, packagingCandidates]);

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
          return { recipeId: id, quantity: recipe.yield };
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
    } else if (pickerType === 'DIRECT_INPUT') {
      const existingById = new Map(form.directInputs.map((item) => [item.inputId, item] as const));
      const next = pickerSelectedIds
        .map((id) => {
          const existing = existingById.get(id);
          if (existing) return existing;
          const input = inputsById.get(id);
          if (!input) return null;
          return { inputId: id, quantity: 0, unit: input.unit as 'g' | 'ml' | 'un' };
        })
        .filter((item): item is { inputId: string; quantity: number; unit: 'g' | 'ml' | 'un' } => Boolean(item));
      setForm((prev) => ({ ...prev, directInputs: next }));
    } else {
      const existingById = new Map(form.packagingInputs.map((item) => [item.inputId, item] as const));
      const next = pickerSelectedIds
        .map((id) => {
          const existing = existingById.get(id);
          if (existing) return existing;
          const input = inputsById.get(id);
          if (!input) return null;
          return { inputId: id, quantity: 0, unit: input.unit as 'g' | 'ml' | 'un' };
        })
        .filter((item): item is { inputId: string; quantity: number; unit: 'g' | 'ml' | 'un' } => Boolean(item));
      setForm((prev) => ({ ...prev, packagingInputs: next }));
    }
    setPickerOpen(false);
  };

  const { inputCost, recipeCost } = useCatalogCosts(inputs, recipes, settings);
  const costSummary = useProductPricing({ form, inputs, recipes, products, settings, manualUnitPrice: priceSource === 'price' ? unitPriceInput : undefined });

  useEffect(() => {
    if (priceSource === 'markup') setUnitPriceInput(costSummary.unitPrice);
  }, [costSummary.unitPrice, priceSource]);

  const displayedProfitPercent = priceSource === 'price'
    ? Number((costSummary.profitPercent - form.extraPercent).toFixed(2))
    : form.targetProfitPercent;

  const handleUnitPriceChange = (value: number) => {
    setPriceSource('price');
    setUnitPriceInput(value);
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
      await listedProductsQuery.refresh();
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="page">
      {!isCreateView && !editingRouteId ? (
      <CatalogListPanel className="products-catalog" title="Produtos" eyebrow="Catálogo" description="Defina o preço, o rendimento e os componentes de cada item vendido." icon="shopping_bag" singularLabel="produto" actionLabel="Novo produto" search={search} loading={listedProductsQuery.loading} hasMore={listedProductsQuery.hasMore} loadingMore={listedProductsQuery.loadingMore} items={listedProductsQuery.items.map((product) => { const profitPercent = (product.targetProfitPercent || 0) + (product.extraPercent || 0); return { ...product, subtitle: formatCurrency(product.unitPrice), inlineBadge: `${formatPercent(profitPercent)}%`, inlineBadgeTone: profitTone(profitPercent) }; })} onSearch={setSearch} onNew={handleNew} onOpen={(product) => navigate(`/app/produtos/editar/${product.id}`)} onDuplicate={(product) => navigate('/app/produtos/novo', { state: { duplicateDraft: { name: `${product.name} copia`, prepTimeMinutes: product.prepTimeMinutes ?? 0, notes: product.notes ?? '', unitsCount: product.unitsCount ?? 1, targetProfitPercent: product.targetProfitPercent ?? 0, extraPercent: product.extraPercent ?? 0, unitPrice: product.unitPrice ?? 0, channelId: product.channelId ?? settings?.salesChannels[0]?.id ?? '', extraRecipes: (product.extraRecipes ?? []).map((item) => ({ ...item })), extraProducts: (product.extraProducts ?? []).map((item) => ({ ...item })), directInputs: (product.directInputs ?? []).map((item) => ({ ...item })), packagingInputs: (product.packagingInputs ?? []).map((item) => ({ ...item })) } satisfies ProductFormState, unitPriceInput: product.unitPrice ?? 0 } })} onDelete={setDeleteTarget} onLoadMore={listedProductsQuery.loadMore} />
      ) : null}

      {editor && initializedForm.current !== formKey ? <p role="status">{productsQuery.error ? 'Nao foi possivel carregar o cadastro. Feche e tente novamente.' : 'Carregando cadastro...'}</p> : null}
      {showForm && initializedForm.current === formKey && (
        <>
          <section className="catalog-editor product-editor">
            <header className="catalog-editor-hero">
              <button type="button" className="catalog-editor-back" onClick={() => editor ? editor.onClose() : navigate('/app/produtos')} aria-label="Voltar para produtos"><span className="material-symbols-outlined" aria-hidden="true">arrow_back</span></button>
              <div className="catalog-editor-hero-copy"><span>Produto para venda</span><h1>{editingId ? 'Editar produto' : 'Novo produto'}</h1><small>Combine receitas e embalagens para chegar ao preço correto.</small></div>
              <div className="catalog-editor-total"><span>Preço por unidade</span><strong>{formatCurrency(costSummary.unitPrice)}</strong></div>
            </header>
            <div className="catalog-editor-form">
            <form className="form" onSubmit={handleSubmit}>
              <div className="grid-2">
                <label>
                  Nome
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </label>
              </div>
              <div className="grid-2">
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
              {saveError ? <p className="error" role="alert">{saveError}</p> : null}
              <FormActions
                onCancel={() => editor ? editor.onClose() : navigate('/app/produtos')}
                submitLabel={editingId ? 'Salvar alteracoes' : 'Salvar produto'}
              />
            </form>
            </div>
          </section>

          <div className="panel">
            <h3>Calculo por unidade</h3>
            <div className="grid-2">
              <label>
                Canal de venda
                <SelectField
                  value={form.channelId}
                  onChange={(value) => setForm({ ...form, channelId: value })}
                  options={(settings?.salesChannels ?? []).filter((channel) => channel.active).map((channel) => ({
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
                    setForm({ ...form, unitsCount: Number(e.target.value || 0) });
                  }}
                  min={1}
                />
              </label>
              <label>
                Valor por unidade (calculado ou ajustado)
                <MoneyInput
                  value={unitPriceInput}
                  onChange={handleUnitPriceChange}
                />
              </label>
            </div>
            <div className="grid-2 compact-grid">
              <label>
                Lucro sobre o custo (%)
                <input
                  type="number"
                  value={displayedProfitPercent === 0 ? '' : displayedProfitPercent}
                  onChange={(e) => {
                    setPriceSource('markup');
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
                <div key={`${item.recipeId}-${index}`} className="add-item-row recipe-add-item-row">
                  <div className="order-product-label">
                    <CatalogItemName name={recipesById.get(item.recipeId)?.name ?? 'Receita nao encontrada'} editLabel="Editar receita" onEdit={() => setCatalogEditor({ kind: 'recipe', id: item.recipeId })} />
                    <small className="order-product-meta">{item.quantity} {recipesById.get(item.recipeId)?.yieldUnit ?? '-'} · {formatCurrency(recipeCost(item.recipeId, item.quantity))}</small>
                  </div>
                  <label className="add-item-qty-field">
                    <span>Quantidade usada ({recipesById.get(item.recipeId)?.yieldUnit ?? '-'})</span>
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
                  <SelectField className="add-item-unit-select" value={recipesById.get(item.recipeId)?.yieldUnit ?? 'un'} onChange={() => undefined} options={[{ value: recipesById.get(item.recipeId)?.yieldUnit ?? 'un', label: recipesById.get(item.recipeId)?.yieldUnit ?? 'un' }]} disabled />
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
              <small className="muted">Receitas extras usam a unidade do rendimento da receita. Ex.: receita que rende 1470 g e usa o lote inteiro deve ficar com quantidade 1470.</small>
            </div>
          </div>

          <div className="panel">
            <h3>Adicionar produtos</h3>
            <div className="ingredients">
              {form.extraProducts.map((item, index) => (
                <div key={`${item.productId}-${index}`} className="add-item-row recipe-add-item-row">
                  <div className="order-product-label">
                    <CatalogItemName name={productsById.get(item.productId)?.name ?? 'Produto nao encontrado'} editLabel="Editar produto" onEdit={() => setCatalogEditor({ kind: 'product', id: item.productId })} />
                  </div>
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
                  <SelectField className="add-item-unit-select" value="un" onChange={() => undefined} options={[{ value: 'un', label: 'und' }]} disabled />
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
            <h3>Insumos</h3>
            <div className="ingredients">
              {form.directInputs.map((item, index) => (
                <div key={`${item.inputId}-${index}`} className="add-item-row recipe-add-item-row">
                  <div className="order-product-label">
                    <CatalogItemName name={inputsById.get(item.inputId)?.name ?? 'Insumo nao encontrado'} editLabel="Editar insumo" onEdit={() => setCatalogEditor({ kind: 'input', id: item.inputId })} />
                    <small className="order-product-meta">{item.quantity} {inputsById.get(item.inputId)?.unit ?? item.unit} · {formatCurrency(inputCost(item.inputId, item.quantity))}</small>
                  </div>
                  <label className="add-item-qty-field">
                    <span>Quantidade</span>
                    <input className="add-item-qty-input" type="number" min={0} step="0.01" value={item.quantity === 0 ? '' : item.quantity} onChange={(e) => {
                      const next = [...form.directInputs];
                      next[index] = { ...next[index], quantity: Number(e.target.value || 0) };
                      setForm({ ...form, directInputs: next });
                    }} aria-label="Quantidade" />
                  </label>
                  <SelectField className="add-item-unit-select" value={inputsById.get(item.inputId)?.unit ?? item.unit} onChange={() => undefined} options={[{ value: inputsById.get(item.inputId)?.unit ?? item.unit, label: inputsById.get(item.inputId)?.unit ?? item.unit }]} disabled />
                  <button type="button" className="icon-button tiny" aria-label="Remover insumo" onClick={() => setForm((prev) => ({ ...prev, directInputs: prev.directInputs.filter((_, itemIndex) => itemIndex !== index) }))}>
                    <span className="material-symbols-outlined" aria-hidden="true">delete_outline</span>
                  </button>
                </div>
              ))}
              <button type="button" className="ghost" onClick={() => openPicker('DIRECT_INPUT')}>+ Adicionar insumo</button>
              <small className="muted">A quantidade usa a unidade escolhida e entra no custo e no preço calculado do produto.</small>
            </div>
          </div>

          <div className="panel">
            <h3>Embalagens</h3>
            <div className="ingredients">
              {form.packagingInputs.map((item, index) => (
                <div key={`${item.inputId}-${index}`} className="add-item-row recipe-add-item-row">
                  <div className="order-product-label">
                    <CatalogItemName name={inputsById.get(item.inputId)?.name ?? 'Embalagem nao encontrada'} editLabel="Editar embalagem" onEdit={() => setCatalogEditor({ kind: 'input', id: item.inputId })} />
                    <small className="order-product-meta">{item.quantity} {inputsById.get(item.inputId)?.unit ?? item.unit} · {formatCurrency(inputCost(item.inputId, item.quantity))}</small>
                  </div>
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
                  <SelectField className="add-item-unit-select" value={inputsById.get(item.inputId)?.unit ?? item.unit} onChange={() => undefined} options={[{ value: inputsById.get(item.inputId)?.unit ?? item.unit, label: inputsById.get(item.inputId)?.unit ?? item.unit }]} disabled />
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
              <small className="muted">A quantidade e o numero de embalagens usadas. O tamanho do pacote serve somente para calcular o custo de cada embalagem.</small>
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
                <span>Composicao, receitas, insumos e embalagens</span>
                <strong>R$ {costSummary.inputs.toFixed(2)}</strong>
              </div>
              <div className="summary-total">
                <span>Valor total</span>
                <strong>R$ {costSummary.total.toFixed(2)}</strong>
              </div>
            </div>
            {costSummary.pricingError ? <p className="error">{costSummary.pricingError}</p> : null}
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
                    : pickerType === 'DIRECT_INPUT'
                      ? 'Selecionar insumos'
                    : 'Selecionar embalagens'}
              </h4>
              <div className="product-picker-head-right">
                <strong className="product-picker-count">{pickerSelectedIds.length} selecionado(s)</strong>
                <button type="button" className="icon-button small" onClick={() => setPickerOpen(false)} aria-label="Fechar">
                  <span className="material-symbols-outlined" aria-hidden="true">close</span>
                </button>
              </div>
            </div>
            <div className="product-picker-search-row">
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
                    : pickerType === 'DIRECT_INPUT'
                      ? 'Buscar insumo...'
                    : 'Buscar embalagem...'
                }
              />
              <button type="button" className="icon-button" onClick={openQuickCreate} aria-label="Criar novo">
                <span className="material-symbols-outlined" aria-hidden="true">add</span>
              </button>
            </div>
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

      {catalogEditor ? <CatalogEditorDialog target={catalogEditor} onClose={() => setCatalogEditor(null)} onSaved={handleCatalogSaved} /> : null}

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
