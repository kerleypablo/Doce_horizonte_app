import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.tsx';
import { apiFetch } from '../shared/api.ts';
import { ListToolbar } from '../shared/ListToolbar.tsx';
import { SelectField } from '../shared/SelectField.tsx';
import { ConfirmDialog } from '../shared/ConfirmDialog.tsx';
import { LoadingOverlay } from '../shared/LoadingOverlay.tsx';
import { ListSkeleton } from '../shared/ListSkeleton.tsx';
import { invalidateQueryCache, useCachedQuery } from '../shared/queryCache.ts';
import { queryKeys } from '../shared/queryKeys.ts';

type CustomerItem = {
  id: string;
  name: string;
  phone: string;
  personType: 'PF' | 'PJ';
  email?: string;
  address?: string;
  number?: string;
  city?: string;
  neighborhood?: string;
  zipCode?: string;
  notes?: string;
};

const onlyDigits = (value: string) => value.replace(/\D/g, '');

const formatPhoneBR = (value: string) => {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const toWhatsAppUrl = (phone: string) => {
  const digits = onlyDigits(phone);
  if (!digits) return '';
  const full = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${full}`;
};

export const CustomersPage = () => {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const confirmActionRef = useRef<null | (() => void)>(null);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    personType: 'PF' as 'PF' | 'PJ',
    email: '',
    address: '',
    number: '',
    city: '',
    neighborhood: '',
    zipCode: '',
    notes: ''
  });

  const customersQuery = useCachedQuery(
    queryKeys.customers,
    () => apiFetch<CustomerItem[]>('/customers', { token: user?.token }),
    { staleTime: 3 * 60_000, enabled: Boolean(user?.token) }
  );

  useEffect(() => {
    if (customersQuery.data) setCustomers(customersQuery.data);
  }, [customersQuery.data]);

  const resetForm = () => {
    setForm({
      name: '',
      phone: '',
      personType: 'PF',
      email: '',
      address: '',
      number: '',
      city: '',
      neighborhood: '',
      zipCode: '',
      notes: ''
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await apiFetch(`/customers/${editingId}`, {
          method: 'PUT',
          token: user?.token,
          body: JSON.stringify({ ...form, phone: onlyDigits(form.phone) })
        });
      } else {
        await apiFetch('/customers', {
          method: 'POST',
          token: user?.token,
          body: JSON.stringify({ ...form, phone: onlyDigits(form.phone) })
        });
      }
      resetForm();
      setShowForm(false);
      invalidateQueryCache(queryKeys.customers);
      await customersQuery.refetch();
    } finally {
      setSaving(false);
    }
  };

  const filtered = customers.filter((customer) => {
    const haystack = `${customer.name} ${customer.phone} ${customer.email ?? ''} ${customer.city ?? ''} ${customer.neighborhood ?? ''}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  return (
    <div className="page">
      <div className="panel">
        <ListToolbar
          title="Clientes cadastrados"
          searchValue={search}
          onSearch={setSearch}
          actionLabel="Novo cliente"
          onAction={handleNew}
        />
        {customersQuery.loading && customers.length === 0 ? (
          <ListSkeleton />
        ) : (
          <div className="table">
            {filtered.map((customer) => (
              <div key={customer.id} className="list-row">
                <div>
                  <strong>{customer.name}</strong>
                  <span className="muted">
                    {customer.personType} • {formatPhoneBR(customer.phone)}
                    {customer.city ? ` • ${customer.city}` : ''}
                    {customer.neighborhood ? ` • ${customer.neighborhood}` : ''}
                  </span>
                </div>
                <div className="inline-right">
                  {toWhatsAppUrl(customer.phone) && (
                    <a
                      href={toWhatsAppUrl(customer.phone)}
                      target="_blank"
                      rel="noreferrer"
                      className="icon-button"
                      aria-label={`WhatsApp de ${customer.name}`}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 4a8 8 0 0 0-6.9 12.1L4 20l4-1.1A8 8 0 1 0 12 4zm4.3 11.5c-.2.5-1 .9-1.4 1-.4.1-.9.1-1.5-.1a11.6 11.6 0 0 1-5-4.4c-.4-.6-.8-1.6-.8-2.1s.2-.8.5-1.1.6-.4.8-.4h.6c.2 0 .4 0 .6.5l.8 1.8c.1.2.1.4 0 .6l-.4.6c-.1.1-.2.3 0 .5.2.4.7 1.2 1.5 1.9 1.1 1 2 1.3 2.4 1.4.2.1.4 0 .5-.1l.7-.8c.2-.2.4-.3.7-.2l1.8.8c.2.1.4.2.5.4s.1 1 0 1.3z" />
                      </svg>
                    </a>
                  )}
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Editar"
                    onClick={() => {
                      setEditingId(customer.id);
                      setForm({
                        name: customer.name,
                        phone: formatPhoneBR(customer.phone),
                        personType: customer.personType,
                        email: customer.email ?? '',
                        address: customer.address ?? '',
                        number: customer.number ?? '',
                        city: customer.city ?? '',
                        neighborhood: customer.neighborhood ?? '',
                        zipCode: customer.zipCode ?? '',
                        notes: customer.notes ?? ''
                      });
                      setShowForm(true);
                    }}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 20h4l10-10-4-4L4 16v4zm12-12 4 4" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="panel">
          <h3>{editingId ? 'Editar cliente' : 'Novo cliente'}</h3>
          <form className="form" onSubmit={handleSubmit}>
            <div className="grid-2">
              <label>
                Nome
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </label>
              <label>
                Telefone
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: formatPhoneBR(e.target.value) })}
                  required
                />
              </label>
            </div>
            <div className="grid-2">
              <label>
                Tipo de pessoa
                <SelectField
                  value={form.personType}
                  onChange={(value) => setForm({ ...form, personType: value as 'PF' | 'PJ' })}
                  options={[
                    { value: 'PF', label: 'Pessoa fisica' },
                    { value: 'PJ', label: 'Pessoa juridica' }
                  ]}
                />
              </label>
              <label>
                E-mail
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </label>
            </div>
            <div className="grid-3">
              <label>
                Endereco
                <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </label>
              <label>
                Numero
                <input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
              </label>
              <label>
                CEP
                <input value={form.zipCode} onChange={(e) => setForm({ ...form, zipCode: e.target.value })} />
              </label>
            </div>
            <div className="grid-2">
              <label>
                Cidade
                <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </label>
              <label>
                Bairro
                <input value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} />
              </label>
            </div>
            <label>
              Observacao
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
            </label>
            <div className="actions">
              <button type="button" className="ghost" onClick={() => setShowForm(false)}>
                Cancelar
              </button>
              <button type="submit">{editingId ? 'Salvar alteracoes' : 'Salvar cliente'}</button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Descartar edicao?"
        message="Voce tem uma edicao em andamento. Deseja cancelar e criar um novo cliente?"
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
      <LoadingOverlay open={saving} label="Salvando cliente..." />
    </div>
  );
};
