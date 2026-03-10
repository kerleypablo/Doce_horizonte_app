import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../shared/api.ts';
import { useAuth } from '../auth/AuthContext.tsx';
import { SelectField } from '../shared/SelectField.tsx';
import { MoneyInput } from '../shared/MoneyInput.tsx';
import { ListToolbar } from '../shared/ListToolbar.tsx';
import { ConfirmDialog } from '../shared/ConfirmDialog.tsx';
import { LoadingOverlay } from '../shared/LoadingOverlay.tsx';
import { ListSkeleton } from '../shared/ListSkeleton.tsx';
import { invalidateQueryCache, useCachedQuery } from '../shared/queryCache.ts';
import { queryKeys } from '../shared/queryKeys.ts';

export type InputItem = {
  id: string;
  name: string;
  brand?: string;
  category: 'embalagem' | 'producao' | 'outros';
  unit: 'kg' | 'g' | 'l' | 'ml' | 'un';
  packageSize: number;
  packagePrice: number;
  tags: string[];
  notes?: string;
};

export const InputsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const params = useParams<{ inputId?: string }>();
  const isCreateView = pathname.endsWith('/novo');
  const editingRouteId = pathname.includes('/editar/') ? params.inputId ?? null : null;
  const [inputs, setInputs] = useState<InputItem[]>([]);
  const [search, setSearch] = useState('');
  const [activeTagFilters, setActiveTagFilters] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(Boolean(isCreateView || editingRouteId));
  const [editingId, setEditingId] = useState<string | null>(editingRouteId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<'name' | 'packageSize' | 'packagePrice', string>>>({});
  const confirmActionRef = useRef<null | (() => void)>(null);
  const [form, setForm] = useState({
    name: '',
    brand: '',
    category: 'producao',
    unit: 'kg',
    packageSize: 1,
    packagePrice: 0,
    notes: '',
    tags: [] as string[]
  });

  const inputsQuery = useCachedQuery(
    queryKeys.inputs,
    () => apiFetch<InputItem[]>('/inputs', { token: user?.token }),
    { staleTime: 3 * 60_000, enabled: Boolean(user?.token) }
  );

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
      const current = (inputsQuery.data ?? []).find((item) => item.id === editingRouteId);
      if (!current) return;
      setEditingId(current.id);
      setForm({
        name: current.name,
        brand: current.brand ?? '',
        category: current.category,
        unit: current.unit,
        packageSize: current.packageSize,
        packagePrice: current.packagePrice,
        notes: current.notes ?? '',
        tags: current.tags ?? []
      });
      setShowForm(true);
      return;
    }
    setEditingId(null);
    setShowForm(false);
  }, [isCreateView, editingRouteId, inputsQuery.data]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationErrors: Partial<Record<'name' | 'packageSize' | 'packagePrice', string>> = {};
    if (!form.name.trim()) validationErrors.name = 'Nome e obrigatorio.';
    if (Number(form.packageSize) <= 0) validationErrors.packageSize = 'Informe um tamanho maior que zero.';
    if (Number(form.packagePrice) <= 0) validationErrors.packagePrice = 'Preco do pacote e obrigatorio.';
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      return;
    }

    setFieldErrors({});
    setSaving(true);
    const payload = {
      ...form,
      packageSize: Number(form.packageSize),
      packagePrice: Number(form.packagePrice)
    };

    try {
      if (editingId) {
        await apiFetch<InputItem>(`/inputs/${editingId}`, {
          method: 'PUT',
          token: user?.token,
          body: JSON.stringify(payload)
        });
      } else {
        await apiFetch<InputItem>('/inputs', {
          method: 'POST',
          token: user?.token,
          body: JSON.stringify(payload)
        });
      }

      resetForm();
      setShowForm(false);
      invalidateQueryCache(queryKeys.inputs);
      await inputsQuery.refetch();
      navigate('/app/insumos');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setForm({
      name: '',
      brand: '',
      category: 'producao',
      unit: 'kg',
      packageSize: 1,
      packagePrice: 0,
      notes: '',
      tags: []
    });
    setTagDraft('');
    setFieldErrors({});
    setEditingId(null);
  };

  const handleNew = () => {
    if (editingId) {
      confirmActionRef.current = () => {
        resetForm();
        navigate('/app/insumos/novo');
      };
      setConfirmOpen(true);
      return;
    }
    navigate('/app/insumos/novo');
  };

  const listTagOptions = useMemo(() => {
    const unique = new Map<string, string>();
    inputs.forEach((item) => {
      (item.tags ?? []).forEach((tag) => {
        const clean = tag.trim();
        if (!clean) return;
        const key = clean.toLowerCase();
        if (!unique.has(key)) unique.set(key, clean);
      });
    });
    return [...unique.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [inputs]);

  const availableTags = useMemo(() => {
    const unique = new Map<string, string>();
    [...inputs.flatMap((item) => item.tags ?? []), ...form.tags].forEach((tag) => {
      const clean = tag.trim();
      if (!clean) return;
      const key = clean.toLowerCase();
      if (!unique.has(key)) unique.set(key, clean);
    });
    return [...unique.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [inputs, form.tags]);

  const availableTagsSorted = useMemo(() => {
    return [...availableTags].sort((left, right) => {
      const leftSelected = form.tags.some((tag) => tag.toLowerCase() === left.toLowerCase());
      const rightSelected = form.tags.some((tag) => tag.toLowerCase() === right.toLowerCase());
      if (leftSelected !== rightSelected) return leftSelected ? -1 : 1;
      return left.localeCompare(right, 'pt-BR');
    });
  }, [availableTags, form.tags]);

  const filtered = inputs.filter((input) => {
    const haystack = `${input.name} ${input.brand ?? ''} ${input.category} ${(input.tags || []).join(' ')}`.toLowerCase();
    const searchMatch = haystack.includes(search.toLowerCase());
    if (!searchMatch) return false;
    if (activeTagFilters.length === 0) return true;
    const inputTags = new Set((input.tags ?? []).map((tag) => tag.toLowerCase()));
    return activeTagFilters.every((tag) => inputTags.has(tag.toLowerCase()));
  });

  const addTagToForm = (value: string) => {
    const clean = value.trim();
    if (!clean) return;
    const alreadyExists = form.tags.some((tag) => tag.toLowerCase() === clean.toLowerCase());
    if (alreadyExists) return;
    setForm((current) => ({ ...current, tags: [...current.tags, clean] }));
  };

  return (
    <div className="page">
      {!isCreateView && !editingRouteId ? (
      <div className="panel">
        <ListToolbar
          title="Insumos cadastrados"
          searchValue={search}
          onSearch={setSearch}
          actionLabel="+"
          onAction={handleNew}
        />
        {listTagOptions.length > 0 ? (
          <div className="list-tags-carousel" aria-label="Filtrar por tags">
            {listTagOptions.map((tag) => {
              const selected = activeTagFilters.some((value) => value.toLowerCase() === tag.toLowerCase());
              return (
                <button
                  key={tag}
                  type="button"
                  className={`list-tag-filter ${selected ? 'active' : ''}`}
                  onClick={() =>
                    setActiveTagFilters((current) =>
                      selected
                        ? current.filter((value) => value.toLowerCase() !== tag.toLowerCase())
                        : [...current, tag]
                    )
                  }
                >
                  {tag}
                </button>
              );
            })}
          </div>
        ) : null}
        {inputsQuery.loading && inputs.length === 0 ? (
          <ListSkeleton withTableHead />
        ) : (
          <div className="table">
            <div className="table-head">
              <span>Nome</span>
              <span>Categoria</span>
              <span>Pacote</span>
              <span>Preco</span>
            </div>
            {filtered.map((input) => (
              <div key={input.id} className="list-row">
                <div>
                  <strong>{input.name}</strong>
                  <span className="muted">
                    {input.category} • {input.packageSize} {input.unit} • R$ {input.packagePrice.toFixed(2)}
                    {input.tags?.length ? ` • ${input.tags.join(', ')}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Editar"
                  onClick={() => navigate(`/app/insumos/editar/${input.id}`)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 20h4l10-10-4-4L4 16v4zm12-12 4 4" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      ) : null}

      {showForm && (
        <div className="panel">
            <div className="panel-title-row">
              <button type="button" className="icon-button small" onClick={() => navigate('/app/insumos')} aria-label="Voltar">
                <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
              </button>
            <h3>{editingId ? 'Editar insumo' : 'Novo insumo'}</h3>
          </div>
          <form className="form" onSubmit={handleSubmit}>
            <div className="grid-2">
              <label>
                Nome
                <input
                  className={fieldErrors.name ? 'field-input-invalid' : ''}
                  value={form.name}
                  onChange={(e) => {
                    setForm({ ...form, name: e.target.value });
                    if (fieldErrors.name) setFieldErrors((current) => ({ ...current, name: undefined }));
                  }}
                  required
                />
                {fieldErrors.name ? <span className="field-error">{fieldErrors.name}</span> : null}
              </label>
              <label>
                Marca
                <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              </label>
            </div>
            <div className="grid-3">
              <label>
                Categoria
                <SelectField
                  value={form.category}
                  onChange={(value) => setForm({ ...form, category: value as InputItem['category'] })}
                  options={[
                    { value: 'producao', label: 'Producao' },
                    { value: 'embalagem', label: 'Embalagem' },
                    { value: 'outros', label: 'Outros' }
                  ]}
                />
              </label>
              <label>
                Tamanho pacote
                <div className="inline-field">
                  <input
                    className={fieldErrors.packageSize ? 'field-input-invalid' : ''}
                    type="number"
                    value={form.packageSize === 0 ? '' : form.packageSize}
                    onChange={(e) => {
                      setForm({ ...form, packageSize: Number(e.target.value || 0) });
                      if (fieldErrors.packageSize) setFieldErrors((current) => ({ ...current, packageSize: undefined }));
                    }}
                    min={0}
                    step="0.01"
                  />
                  <SelectField
                    className="unit-select"
                    value={form.unit}
                    onChange={(value) => setForm({ ...form, unit: value as InputItem['unit'] })}
                    options={[
                      { value: 'kg', label: 'Kg' },
                      { value: 'g', label: 'Gramas' },
                      { value: 'l', label: 'Litro' },
                      { value: 'ml', label: 'ML' },
                      { value: 'un', label: 'Unidade' }
                    ]}
                  />
                </div>
                {fieldErrors.packageSize ? <span className="field-error">{fieldErrors.packageSize}</span> : null}
              </label>
            </div>
            <div className="grid-2">
              <label>
                Preco do pacote
                <MoneyInput
                  className={fieldErrors.packagePrice ? 'field-input-invalid' : ''}
                  value={form.packagePrice}
                  onChange={(value) => {
                    setForm({ ...form, packagePrice: value });
                    if (fieldErrors.packagePrice) setFieldErrors((current) => ({ ...current, packagePrice: undefined }));
                  }}
                />
                {fieldErrors.packagePrice ? <span className="field-error">{fieldErrors.packagePrice}</span> : null}
              </label>
              <label>
                Observacoes
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>
            </div>
            <label>
              Tags
              <div className="input-tags-panel">
                <div className="input-tags-create">
                  <input
                    value={tagDraft}
                    placeholder="Digite a tag"
                    onChange={(event) => setTagDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return;
                      event.preventDefault();
                      addTagToForm(tagDraft);
                      setTagDraft('');
                    }}
                  />
                  <button
                    type="button"
                    className="input-tags-add"
                    aria-label="Criar tag"
                    onClick={() => {
                      addTagToForm(tagDraft);
                      setTagDraft('');
                    }}
                  >
                    +
                  </button>
                </div>
                <div className="input-tags-pool">
                  {availableTagsSorted.map((tag) => {
                    const selected = form.tags.some((current) => current.toLowerCase() === tag.toLowerCase());
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={`input-tag-item ${selected ? 'active' : ''}`}
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            tags: selected
                              ? current.tags.filter((currentTag) => currentTag.toLowerCase() !== tag.toLowerCase())
                              : [...current.tags, tag]
                          }))
                        }
                      >
                        {selected ? (
                          <span className="material-symbols-outlined input-tag-check" aria-hidden="true">check_circle</span>
                        ) : null}
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            </label>
            <div className="actions">
              <button type="button" className="ghost" onClick={() => navigate('/app/insumos')}>
                Cancelar
              </button>
              <button type="submit">{editingId ? 'Salvar alteracoes' : 'Salvar insumo'}</button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Descartar edicao?"
        message="Voce tem uma edicao em andamento. Deseja cancelar e criar um novo insumo?"
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
      <LoadingOverlay open={saving} label="Salvando insumo..." />
    </div>
  );
};
