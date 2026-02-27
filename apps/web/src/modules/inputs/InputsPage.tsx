import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../shared/api.ts';
import { useAuth } from '../auth/AuthContext.tsx';
import { SelectField } from '../shared/SelectField.tsx';
import { MoneyInput } from '../shared/MoneyInput.tsx';
import { ListToolbar } from '../shared/ListToolbar.tsx';
import { ConfirmDialog } from '../shared/ConfirmDialog.tsx';
import { TagInput } from '../shared/TagInput.tsx';
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
  const [inputs, setInputs] = useState<InputItem[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
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

  const filtered = inputs.filter((input) => {
    const haystack = `${input.name} ${input.brand ?? ''} ${input.category} ${(input.tags || []).join(' ')}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  return (
    <div className="page">
      <div className="panel">
        <ListToolbar
          title="Insumos cadastrados"
          searchValue={search}
          onSearch={setSearch}
          actionLabel="Novo insumo"
          onAction={handleNew}
        />
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
                  onClick={() => {
                    setEditingId(input.id);
                    setForm({
                      name: input.name,
                      brand: input.brand ?? '',
                      category: input.category,
                      unit: input.unit,
                      packageSize: input.packageSize,
                      packagePrice: input.packagePrice,
                      notes: input.notes ?? '',
                      tags: input.tags ?? []
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
        )}
      </div>

      {showForm && (
        <div className="panel">
          <h3>{editingId ? 'Editar insumo' : 'Novo insumo'}</h3>
          <form className="form" onSubmit={handleSubmit}>
            <div className="grid-2">
              <label>
                Nome
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
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
                    type="number"
                    value={form.packageSize === 0 ? '' : form.packageSize}
                    onChange={(e) => setForm({ ...form, packageSize: Number(e.target.value || 0) })}
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
              </label>
            </div>
            <div className="grid-2">
              <label>
                Preco do pacote
                <MoneyInput value={form.packagePrice} onChange={(value) => setForm({ ...form, packagePrice: value })} />
              </label>
              <label>
                Observacoes
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>
            </div>
            <label>
              Tags
              <TagInput value={form.tags} onChange={(tags) => setForm({ ...form, tags })} placeholder="Ex: doce, natal" />
            </label>
            <div className="actions">
              <button type="button" className="ghost" onClick={() => { setShowForm(false); }}>
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
