import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../shared/api.ts';
import { useAuth } from '../auth/AuthContext.tsx';
import type { RecipeItem } from '../recipes/RecipesPage.tsx';
import { SelectField } from '../shared/SelectField.tsx';
import { ListToolbar } from '../shared/ListToolbar.tsx';
import { ConfirmDialog } from '../shared/ConfirmDialog.tsx';
import { SearchableSelect } from '../shared/SearchableSelect.tsx';
import type { InputItem } from '../inputs/InputsPage.tsx';

export type ProductItem = {
  id: string;
  name: string;
  recipeId: string;
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

const units = ['kg', 'g', 'l', 'ml', 'un'] as const;

export const ProductsPage = () => {
  const { user } = useAuth();
  const [recipes, setRecipes] = useState<RecipeItem[]>([]);
  const [inputs, setInputs] = useState<InputItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmActionRef = useRef<null | (() => void)>(null);
  const [unitPriceInput, setUnitPriceInput] = useState(0);
  const lastEditedRef = useRef<'profit' | 'unitPrice' | null>(null);
  const [form, setForm] = useState({
    name: '',
    recipeId: '',
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

  const load = async () => {
    const [recipesData, productsData, settingsData, inputsData] = await Promise.all([
      apiFetch<RecipeItem[]>('/recipes', { token: user?.token }),
      apiFetch<ProductItem[]>('/products', { token: user?.token }),
      apiFetch<Settings>('/company/settings', { token: user?.token }),
      apiFetch<InputItem[]>('/inputs', { token: user?.token })
    ]);

    setRecipes(recipesData);
    setProducts(productsData);
    setSettings(settingsData);
    setInputs(inputsData);

    setForm((current) => ({
      ...current,
      targetProfitPercent: settingsData.defaultProfitPercent,
      channelId: settingsData.salesChannels[0]?.id ?? ''
    }));
    setUnitPriceInput(0);
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setForm({
      name: '',
      recipeId: '',
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
        setShowForm(true);
      };
      setConfirmOpen(true);
      return;
    }
    resetForm();
    setShowForm(true);
  };

  const addExtraRecipe = () => {
    setForm({ ...form, extraRecipes: [...form.extraRecipes, { recipeId: '', quantity: 0 }] });
  };

  const addExtraProduct = () => {
    setForm({ ...form, extraProducts: [...form.extraProducts, { productId: '', quantity: 0 }] });
  };

  const addPackaging = () => {
    setForm({ ...form, packagingInputs: [...form.packagingInputs, { inputId: '', quantity: 0, unit: 'un' }] });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const payload = {
      name: form.name,
      recipeId: form.recipeId,
      prepTimeMinutes: Number(form.prepTimeMinutes),
      notes: form.notes,
      unitsCount: Number(form.unitsCount),
      targetProfitPercent: Number(form.targetProfitPercent),
      extraPercent: Number(form.extraPercent),
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

    const response = await apiFetch<{ product: ProductItem }>(editingId ? `/products/${editingId}` : '/products', {
      method: editingId ? 'PUT' : 'POST',
      token: user?.token,
      body: JSON.stringify(payload)
    });

    setProducts((prev) => {
      if (!editingId) return [response.product, ...prev];
      return prev.map((item) => (item.id === response.product.id ? response.product : item));
    });

    resetForm();
    setShowForm(false);
    lastEditedRef.current = null;
  };

  const filtered = products.filter((product) =>
    product.name.toLowerCase().includes(search.toLowerCase())
  );

  const recipeOptions = useMemo(
    () => recipes.map((recipe) => ({ value: recipe.id, label: recipe.name })),
    [recipes]
  );

  const productOptions = useMemo(
    () => products.filter((p) => p.id !== editingId).map((p) => ({ value: p.id, label: p.name })),
    [products, editingId]
  );

  const packagingOptions = useMemo(
    () => inputs.filter((input) => input.category === 'embalagem').map((input) => ({ value: input.id, label: input.name })),
    [inputs]
  );

  const costSummary = useMemo(() => {
    const baseRecipe = recipes.find((recipe) => recipe.id === form.recipeId);
    if (!baseRecipe) {
      return { labor: 0, fixed: 0, inputs: 0, total: 0, unitPrice: 0, profitPercent: form.targetProfitPercent };
    }

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

    const baseRecipeCost = calcRecipeCost(baseRecipe);
    const basePerUnit = baseRecipe.yield > 0 ? baseRecipeCost / baseRecipe.yield : baseRecipeCost;

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

    const directCost = basePerUnit * form.unitsCount + extraRecipesCost + extraProductsCost + packagingCost;

    const baseOverhead = settings?.overheadMethod === 'PERCENT_DIRECT'
      ? (directCost * (settings?.overheadPercent ?? 0)) / 100
      : (settings?.overheadPerUnit ?? 0) * form.unitsCount;

    const hours = (form.prepTimeMinutes ?? 0) / 60;
    const labor = (settings?.laborCostPerHour ?? 0) * hours;
    const fixed = (settings?.fixedCostPerHour ?? 0) * hours;

    const totalCost = directCost + baseOverhead + labor + fixed;
    const channel = settings?.salesChannels.find((c) => c.id === form.channelId);
    const variablePercentBase = (settings?.taxesPercent ?? 0) + (channel?.feePercent ?? 0) + (channel?.paymentFeePercent ?? 0);
    const variablePercent = variablePercentBase + form.targetProfitPercent + form.extraPercent;

    const totalPrice = totalCost / (1 - variablePercent / 100);
    const unitPrice = totalPrice / (form.unitsCount || 1);

    return {
      labor,
      fixed,
      inputs: directCost,
      total: totalCost,
      unitPrice,
      profitPercent: form.targetProfitPercent,
      variablePercentBase
    };
  }, [form, inputs, recipes, products, settings]);

  useEffect(() => {
    if (lastEditedRef.current === 'unitPrice') return;
    if (!form.recipeId) return;
    setUnitPriceInput(Number(costSummary.unitPrice.toFixed(2)));
  }, [costSummary.unitPrice, form.recipeId]);

  const handleUnitPriceChange = (value: number) => {
    lastEditedRef.current = 'unitPrice';
    setUnitPriceInput(value);

    const totalPrice = value * (form.unitsCount || 1);
    if (totalPrice <= 0) return;

    const profitPercent = (1 - costSummary.total / totalPrice) * 100 - costSummary.variablePercentBase - form.extraPercent;
    setForm({ ...form, targetProfitPercent: Number(profitPercent.toFixed(2)) });
  };

  return (
    <div className="page">
      <div className="panel">
        <ListToolbar
          title="Produtos cadastrados"
          searchValue={search}
          onSearch={setSearch}
          actionLabel="Novo produto"
          onAction={handleNew}
        />
        <div className="table">
          {filtered.map((product) => (
            <div key={product.id} className="list-row">
              <div>
                <strong>{product.name}</strong>
                <span className="muted">R$ {product.unitPrice?.toFixed(2)} un • R$ {product.salePrice.toFixed(2)}</span>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Editar"
                onClick={() => {
                  setEditingId(product.id);
                  setForm({
                    name: product.name,
                    recipeId: product.recipeId,
                    prepTimeMinutes: product.prepTimeMinutes ?? 0,
                    notes: product.notes ?? '',
                    unitsCount: product.unitsCount ?? 1,
                    targetProfitPercent: product.targetProfitPercent,
                    extraPercent: product.extraPercent ?? 0,
                    unitPrice: product.unitPrice ?? 0,
                    channelId: product.channelId ?? settings?.salesChannels[0]?.id ?? '',
                    extraRecipes: product.extraRecipes ?? [],
                    extraProducts: product.extraProducts ?? [],
                    packagingInputs: product.packagingInputs ?? []
                  });
                  setUnitPriceInput(product.unitPrice ?? 0);
                  lastEditedRef.current = null;
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
            <h3>{editingId ? 'Editar produto' : 'Novo produto'}</h3>
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
                <button type="button" className="ghost" onClick={() => setShowForm(false)}>
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
                Receita base
                <SearchableSelect
                  value={form.recipeId}
                  onChange={(value) => setForm({ ...form, recipeId: value })}
                  options={recipeOptions}
                  placeholder="Selecione a receita"
                />
              </label>
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
            <div className="grid-2">
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
                <input
                  type="number"
                  value={unitPriceInput}
                  onChange={(e) => handleUnitPriceChange(Number(e.target.value || 0))}
                />
              </label>
            </div>
            <div className="grid-2">
              <label>
                % de lucro
                <input
                  type="number"
                  value={form.targetProfitPercent}
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
                  value={form.extraPercent}
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
                <div key={`${item.recipeId}-${index}`} className="ingredients-row ingredients-row-3">
                  <SearchableSelect
                    value={item.recipeId}
                    onChange={(value) => {
                      const next = [...form.extraRecipes];
                      next[index] = { ...next[index], recipeId: value };
                      setForm({ ...form, extraRecipes: next });
                    }}
                    options={recipeOptions}
                    placeholder="Selecione a receita"
                  />
                  <div className="inline-field">
                    <input
                      type="number"
                      value={item.quantity === 0 ? '' : item.quantity}
                      onChange={(e) => {
                        const next = [...form.extraRecipes];
                        next[index] = { ...next[index], quantity: Number(e.target.value || 0) };
                        setForm({ ...form, extraRecipes: next });
                      }}
                      min={0}
                      step="0.01"
                    />
                    <div className="inline-right">
                      <div className="unit-tag">{form.unitsCount}</div>
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
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M6 7h12M9 7v10m6-10v10M10 4h4l1 2H9l1-2z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" className="ghost" onClick={addExtraRecipe}>
                + Adicionar receita
              </button>
            </div>
          </div>

          <div className="panel">
            <h3>Adicionar produtos</h3>
            <div className="ingredients">
              {form.extraProducts.map((item, index) => (
                <div key={`${item.productId}-${index}`} className="ingredients-row ingredients-row-3">
                  <SearchableSelect
                    value={item.productId}
                    onChange={(value) => {
                      const next = [...form.extraProducts];
                      next[index] = { ...next[index], productId: value };
                      setForm({ ...form, extraProducts: next });
                    }}
                    options={productOptions}
                    placeholder="Selecione o produto"
                  />
                  <div className="inline-field">
                    <input
                      type="number"
                      value={item.quantity === 0 ? '' : item.quantity}
                      onChange={(e) => {
                        const next = [...form.extraProducts];
                        next[index] = { ...next[index], quantity: Number(e.target.value || 0) };
                        setForm({ ...form, extraProducts: next });
                      }}
                      min={0}
                      step="0.01"
                    />
                    <div className="inline-right">
                      <div className="unit-tag">un</div>
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
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M6 7h12M9 7v10m6-10v10M10 4h4l1 2H9l1-2z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" className="ghost" onClick={addExtraProduct}>
                + Adicionar produto
              </button>
            </div>
          </div>

          <div className="panel">
            <h3>Embalagens</h3>
            <div className="ingredients">
              {form.packagingInputs.map((item, index) => (
                <div key={`${item.inputId}-${index}`} className="ingredients-row ingredients-row-3">
                  <SearchableSelect
                    value={item.inputId}
                    onChange={(value) => {
                      const next = [...form.packagingInputs];
                      next[index] = { ...next[index], inputId: value };
                      setForm({ ...form, packagingInputs: next });
                    }}
                    options={packagingOptions}
                    placeholder="Selecione embalagem"
                  />
                  <div className="inline-field">
                    <input
                      type="number"
                      value={item.quantity === 0 ? '' : item.quantity}
                      onChange={(e) => {
                        const next = [...form.packagingInputs];
                        next[index] = { ...next[index], quantity: Number(e.target.value || 0) };
                        setForm({ ...form, packagingInputs: next });
                      }}
                      min={0}
                      step="0.01"
                    />
                    <div className="inline-right">
                      <SelectField
                        className="unit-select"
                        value={item.unit}
                        onChange={(value) => {
                          const next = [...form.packagingInputs];
                          next[index] = { ...next[index], unit: value as 'kg' | 'g' | 'l' | 'ml' | 'un' };
                          setForm({ ...form, packagingInputs: next });
                        }}
                        options={units.map((unit) => ({ value: unit, label: unit }))}
                      />
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
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M6 7h12M9 7v10m6-10v10M10 4h4l1 2H9l1-2z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" className="ghost" onClick={addPackaging}>
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
    </div>
  );
};
