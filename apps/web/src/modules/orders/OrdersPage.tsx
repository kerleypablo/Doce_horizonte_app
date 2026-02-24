import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';
import { apiFetch } from '../shared/api.ts';
import { ListToolbar } from '../shared/ListToolbar.tsx';
import { SelectField } from '../shared/SelectField.tsx';
import { SearchableSelect } from '../shared/SearchableSelect.tsx';
import { ConfirmDialog } from '../shared/ConfirmDialog.tsx';
import { LoadingOverlay } from '../shared/LoadingOverlay.tsx';
import { ListSkeleton } from '../shared/ListSkeleton.tsx';
import { MoneyInput } from '../shared/MoneyInput.tsx';

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

type ProductItem = {
  id: string;
  name: string;
  unitPrice: number;
  salePrice: number;
};

type OrderItem = {
  id: string;
  number: string;
  type: 'PEDIDO' | 'ORCAMENTO';
  orderDateTime: string;
  customerId?: string;
  customerSnapshot?: CustomerItem;
  deliveryType: 'ENTREGA' | 'RETIRADA';
  deliveryDate?: string;
  status: 'AGUARDANDO_RETORNO' | 'CONCLUIDO' | 'CONFIRMADO' | 'CANCELADO';
  products: { productId: string; name: string; unitPrice: number; quantity: number; notes?: string }[];
  additions: { label: string; mode: 'PERCENT' | 'FIXED'; value: number }[];
  discountMode: 'PERCENT' | 'FIXED';
  discountValue: number;
  shippingValue: number;
  notesDelivery?: string;
  notesGeneral?: string;
  notesPayment?: string;
  pix?: string;
  terms?: string;
  payments: { date: string; amount: number; note?: string }[];
  images: { name: string; dataUrl: string }[];
  alerts: { label: string; enabled: boolean }[];
};

const onlyDigits = (value: string) => value.replace(/\D/g, '');
const formatCurrency = (value: number) => `R$ ${value.toFixed(2)}`;

const formatPhoneBR = (value: string) => {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const toDateTimeLocal = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const currentDateTimeLocal = () => toDateTimeLocal(new Date().toISOString());

const newOrderForm = () => ({
  type: 'PEDIDO' as 'PEDIDO' | 'ORCAMENTO',
  orderDateTime: currentDateTimeLocal(),
  customerId: '',
  deliveryType: 'ENTREGA' as 'ENTREGA' | 'RETIRADA',
  deliveryDate: '',
  status: 'AGUARDANDO_RETORNO' as 'AGUARDANDO_RETORNO' | 'CONCLUIDO' | 'CONFIRMADO' | 'CANCELADO',
  products: [] as { productId: string; name: string; unitPrice: number; quantity: number; notes?: string }[],
  additions: [] as { label: string; mode: 'PERCENT' | 'FIXED'; value: number }[],
  discountMode: 'FIXED' as 'PERCENT' | 'FIXED',
  discountValue: 0,
  shippingValue: 0,
  notesDelivery: '',
  notesGeneral: '',
  notesPayment: '',
  pix: '',
  terms: '',
  payments: [] as { date: string; amount: number; note?: string }[],
  images: [] as { name: string; dataUrl: string }[],
  alerts: [
    { label: 'Lembrar 3 dias antes da entrega', enabled: false },
    { label: 'Lembrar 1 dia antes da entrega', enabled: false }
  ] as { label: string; enabled: boolean }[]
});

export const OrdersPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isCreateView = pathname === '/app/pedidos/novo';
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [search, setSearch] = useState('');
  const confirmActionRef = useRef<null | (() => void)>(null);
  const [tab, setTab] = useState<'pessoa' | 'produtos' | 'observacoes' | 'pagamentos' | 'imagens' | 'alertas'>('pessoa');
  const [form, setForm] = useState(newOrderForm());
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerForm, setCustomerForm] = useState({
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

  const load = async () => {
    try {
      const [ordersData, customersData, productsData] = await Promise.all([
        apiFetch<OrderItem[]>('/orders', { token: user?.token }),
        apiFetch<CustomerItem[]>('/customers', { token: user?.token }),
        apiFetch<ProductItem[]>('/products', { token: user?.token })
      ]);
      setOrders(ordersData);
      setCustomers(customersData);
      setProducts(productsData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setForm(newOrderForm());
    setEditingId(null);
    setTab('pessoa');
  };

  const handleNew = () => {
    navigate('/app/pedidos/novo');
  };

  useEffect(() => {
    if (isCreateView) {
      resetForm();
      setShowForm(true);
      return;
    }
    setShowForm(false);
  }, [isCreateView]);

  const customerMap = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

  const productOptions = useMemo(
    () => products.map((p) => ({ value: p.id, label: `${p.name} • ${formatCurrency(p.unitPrice || p.salePrice)}` })),
    [products]
  );

  const filtered = orders.filter((order) => {
    const customerName = order.customerSnapshot?.name ?? customerMap.get(order.customerId ?? '')?.name ?? '';
    const haystack = `${order.number} ${order.type} ${customerName} ${order.status}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const totals = useMemo(() => {
    const productsTotal = form.products.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const additionsTotal = form.additions.reduce((sum, item) => {
      if (item.mode === 'FIXED') return sum + item.value;
      return sum + (productsTotal * item.value) / 100;
    }, 0);
    const discountTotal = form.discountMode === 'FIXED'
      ? form.discountValue
      : ((productsTotal + additionsTotal) * form.discountValue) / 100;
    const subtotal = productsTotal + additionsTotal - discountTotal;
    const total = subtotal + form.shippingValue;
    const paid = form.payments.reduce((sum, p) => sum + p.amount, 0);
    const pending = total - paid;
    return { productsTotal, additionsTotal, discountTotal, subtotal, total, paid, pending };
  }, [form]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setSubmitError(null);
    try {
      const selectedCustomer = customerMap.get(form.customerId);
      const payload = {
        ...form,
        orderDateTime: new Date(form.orderDateTime).toISOString(),
        customerId: form.customerId || undefined,
        customerSnapshot: selectedCustomer
          ? {
              name: selectedCustomer.name,
              phone: onlyDigits(selectedCustomer.phone),
              personType: selectedCustomer.personType,
              email: selectedCustomer.email,
              address: selectedCustomer.address,
              number: selectedCustomer.number,
              city: selectedCustomer.city,
              neighborhood: selectedCustomer.neighborhood,
              zipCode: selectedCustomer.zipCode
            }
          : undefined
      };

      if (editingId) {
        await apiFetch(`/orders/${editingId}`, {
          method: 'PUT',
          token: user?.token,
          body: JSON.stringify(payload)
        });
      } else {
        await apiFetch('/orders', {
          method: 'POST',
          token: user?.token,
          body: JSON.stringify(payload)
        });
      }

      resetForm();
      setShowForm(false);
      if (isCreateView) navigate('/app/pedidos');
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar pedido';
      setSubmitError(message);
    } finally {
      setSaving(false);
    }
  };

  const addProductLine = () => {
    setForm((prev) => ({
      ...prev,
      products: [...prev.products, { productId: '', name: '', unitPrice: 0, quantity: 1, notes: '' }]
    }));
  };

  const addAddition = () => {
    setForm((prev) => ({
      ...prev,
      additions: [...prev.additions, { label: 'Novo ajuste', mode: 'FIXED', value: 0 }]
    }));
  };

  const addPayment = () => {
    setForm((prev) => ({
      ...prev,
      payments: [...prev.payments, { date: new Date().toISOString().slice(0, 10), amount: 0, note: '' }]
    }));
  };

  const handleUploadImages = async (files: FileList | null) => {
    if (!files?.length) return;
    const readAsDataUrl = (file: File) =>
      new Promise<{ name: string; dataUrl: string }>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, dataUrl: String(reader.result) });
        reader.readAsDataURL(file);
      });
    const uploaded = await Promise.all(Array.from(files).map(readAsDataUrl));
    setForm((prev) => ({ ...prev, images: [...prev.images, ...uploaded] }));
  };

  const handleCreateCustomer = async (event: React.FormEvent) => {
    event.preventDefault();
    const created = await apiFetch<CustomerItem>('/customers', {
      method: 'POST',
      token: user?.token,
      body: JSON.stringify({ ...customerForm, phone: onlyDigits(customerForm.phone) })
    });
    setCustomers((prev) => [created, ...prev]);
    setForm((prev) => ({ ...prev, customerId: created.id }));
    setShowCustomerModal(false);
    setCustomerForm({
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
  };

  const generatePdf = (order: OrderItem) => {
    const customer = order.customerSnapshot;
    const productsHtml = (order.products ?? [])
      .map(
        (item, index) =>
          `<tr><td>${index + 1}</td><td>${item.name}</td><td>${item.quantity}</td><td>${formatCurrency(item.unitPrice)}</td><td>${formatCurrency(
            item.unitPrice * item.quantity
          )}</td></tr>`
      )
      .join('');
    const productsTotal = (order.products ?? []).reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const additionsTotal = (order.additions ?? []).reduce((sum, item) => {
      if (item.mode === 'FIXED') return sum + item.value;
      return sum + (productsTotal * item.value) / 100;
    }, 0);
    const discountTotal = order.discountMode === 'FIXED'
      ? order.discountValue
      : ((productsTotal + additionsTotal) * order.discountValue) / 100;
    const total = productsTotal + additionsTotal - discountTotal + (order.shippingValue ?? 0);
    const additionsLines = (order.additions ?? [])
      .map((item) => {
        const value = item.mode === 'FIXED' ? item.value : (productsTotal * item.value) / 100;
        const suffix = item.mode === 'PERCENT' ? ` (${item.value}%)` : '';
        return `<tr><td>${item.label}${suffix}</td><td>${formatCurrency(value)}</td></tr>`;
      })
      .join('');
    const note = (value?: string) => (value && value.trim().length ? value : '-');

    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${order.type} ${order.number}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;color:#222}h1{margin:0 0 8px}table{width:100%;border-collapse:collapse;margin-top:12px}
      th,td{border:1px solid #ddd;padding:8px;text-align:left} .meta{margin:8px 0} .total{margin-top:16px;font-size:18px;font-weight:700;text-align:right}
      .totals-table{width:420px;margin-left:auto}.note-box{border:1px solid #ddd;padding:10px;border-radius:8px;white-space:pre-wrap;margin-top:8px}</style></head><body>
      <h1>${order.type} ${order.number}</h1>
      <div class="meta">Cliente: ${customer?.name ?? '-'} | Telefone: ${customer?.phone ?? '-'}</div>
      <div class="meta">Entrega/Retirada: ${order.deliveryType}</div>
      <div class="meta">Data entrega: ${order.deliveryDate ?? '-'}</div>
      <table><thead><tr><th>#</th><th>Produto</th><th>Qtd</th><th>Valor unit.</th><th>Total</th></tr></thead><tbody>${productsHtml}</tbody></table>
      <table class="totals-table"><tbody>
      ${additionsLines}
      <tr><td>Desconto${order.discountMode === 'PERCENT' ? ` (${order.discountValue}%)` : ''}</td><td>- ${formatCurrency(discountTotal)}</td></tr>
      <tr><td>Frete</td><td>${formatCurrency(order.shippingValue ?? 0)}</td></tr>
      </tbody></table>
      <div class="total">Total do pedido: ${formatCurrency(total)}</div>
      <div class="meta">Obs entrega/retirada:</div><div class="note-box">${note(order.notesDelivery)}</div>
      <div class="meta">Obs gerais:</div><div class="note-box">${note(order.notesGeneral)}</div>
      <div class="meta">Obs pagamento:</div><div class="note-box">${note(order.notesPayment)}</div>
      </body></html>`;

    const popup = window.open('', '_blank');
    if (!popup) return;
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  return (
    <div className="page">
      {!isCreateView && (
      <div className="panel">
        <ListToolbar
          title="Pedidos e orcamentos"
          searchValue={search}
          onSearch={setSearch}
          actionLabel="Novo pedido"
          onAction={handleNew}
        />
        {loading ? (
          <ListSkeleton />
        ) : (
          <div className="table">
            {filtered.map((order) => (
              <div key={order.id} className="list-row">
                <div>
                  <strong>{order.number} • {order.type}</strong>
                  <span className="muted">
                    {order.customerSnapshot?.name ?? 'Sem cliente'} • {order.status}
                  </span>
                </div>
                <div className="inline-right">
                  <button type="button" className="icon-button small" onClick={() => generatePdf(order)} aria-label="PDF">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l5 5v13H6zM15 3v5h5M8 14h8M8 18h8" /></svg>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Editar"
                    onClick={() => {
                      setEditingId(order.id);
                      setForm({
                        ...newOrderForm(),
                        ...order,
                        orderDateTime: toDateTimeLocal(order.orderDateTime),
                        customerId: order.customerId ?? ''
                      });
                      setShowForm(true);
                    }}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16v4zm12-12 4 4" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {showForm && (
        <div className="panel order-editor">
          <h3>{editingId ? 'Editar pedido/orcamento' : 'Novo pedido/orcamento'}</h3>
          <div className="tabs">
            {[
              ['pessoa', 'Pessoa'],
              ['produtos', 'Produtos'],
              ['observacoes', 'Observacoes'],
              ['pagamentos', 'Pagamentos'],
              ['imagens', 'Imagens'],
              ['alertas', 'Alertas']
            ].map(([key, label]) => (
              <button key={key} type="button" title={label} className={tab === key ? 'tab-icon active' : 'tab-icon'} onClick={() => setTab(key as any)}>
                {key === 'pessoa' && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-7 8a7 7 0 0 1 14 0"/></svg>}
                {key === 'produtos' && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7l6-3 6 3v10l-6 3-6-3V7z"/></svg>}
                {key === 'observacoes' && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v16H6zM9 9h6M9 13h6"/></svg>}
                {key === 'pagamentos' && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v10H4zM4 10h16"/></svg>}
                {key === 'imagens' && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4zM8 10h.01M6 16l4-4 3 3 3-2 2 3"/></svg>}
                {key === 'alertas' && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a6 6 0 0 0-6 6v4l-2 2h16l-2-2v-4a6 6 0 0 0-6-6zM10 20h4"/></svg>}
              </button>
            ))}
          </div>

          <form className="form" onSubmit={handleSubmit}>
            {tab === 'pessoa' && (
              <>
                <div className="panel form-box">
                  <h4>Pedido</h4>
                  <div className="grid-2">
                    <label>
                      Tipo
                      <SelectField
                        value={form.type}
                        onChange={(value) => setForm({ ...form, type: value as 'PEDIDO' | 'ORCAMENTO' })}
                        options={[
                          { value: 'PEDIDO', label: 'Pedido' },
                          { value: 'ORCAMENTO', label: 'Orcamento' }
                        ]}
                      />
                    </label>
                    <label>
                      Data e hora
                      <input
                        type="datetime-local"
                        value={form.orderDateTime}
                        onChange={(e) => setForm({ ...form, orderDateTime: e.target.value })}
                      />
                    </label>
                  </div>
                </div>

                <div className="panel form-box">
                  <h4>Cliente</h4>
                  <div className="inline-field">
                    <SelectField
                      value={form.customerId}
                      onChange={(value) => setForm({ ...form, customerId: value })}
                      options={customers.map((c) => ({ value: c.id, label: `${c.name} • ${formatPhoneBR(c.phone)}` }))}
                      placeholder="Selecione o cliente"
                    />
                    <button type="button" className="icon-button" aria-label="Novo cliente" onClick={() => setShowCustomerModal(true)}>
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                    </button>
                  </div>
                </div>

                <div className="panel form-box">
                  <h4>Entrega</h4>
                  <div className="grid-2">
                    <label>
                      Entrega ou retirada
                      <SelectField
                        value={form.deliveryType}
                        onChange={(value) => setForm({ ...form, deliveryType: value as 'ENTREGA' | 'RETIRADA' })}
                        options={[
                          { value: 'ENTREGA', label: 'Entrega' },
                          { value: 'RETIRADA', label: 'Retirada' }
                        ]}
                      />
                    </label>
                    <label>
                      Data de entrega
                      <input type="date" value={form.deliveryDate} onChange={(e) => setForm({ ...form, deliveryDate: e.target.value })} />
                    </label>
                  </div>
                </div>

                <div className="panel form-box">
                  <h4>Status</h4>
                  <SelectField
                    value={form.status}
                    onChange={(value) => setForm({ ...form, status: value as 'AGUARDANDO_RETORNO' | 'CONCLUIDO' | 'CONFIRMADO' | 'CANCELADO' })}
                    options={[
                      { value: 'AGUARDANDO_RETORNO', label: 'Aguardando retorno' },
                      { value: 'CONFIRMADO', label: 'Confirmado' },
                      { value: 'CONCLUIDO', label: 'Concluido' },
                      { value: 'CANCELADO', label: 'Cancelado' }
                    ]}
                  />
                </div>
              </>
            )}

            {tab === 'produtos' && (
              <>
                <div className="panel form-box">
                  <h4>Produtos</h4>
                  <div className="ingredients">
                    {form.products.map((item, index) => (
                      <div key={index} className="ingredients-row ingredients-row-3">
                        <SearchableSelect
                          value={item.productId}
                          onChange={(value) => {
                            const selected = products.find((p) => p.id === value);
                            const next = [...form.products];
                            next[index] = {
                              ...next[index],
                              productId: value,
                              name: selected?.name ?? next[index].name,
                              unitPrice: selected?.unitPrice ?? selected?.salePrice ?? next[index].unitPrice
                            };
                            setForm({ ...form, products: next });
                          }}
                          options={productOptions}
                          placeholder="Selecione o produto"
                        />
                        <div className="inline-field">
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => {
                              const next = [...form.products];
                              next[index] = { ...next[index], quantity: Number(e.target.value || 1) };
                              setForm({ ...form, products: next });
                            }}
                          />
                          <div className="inline-right">
                            <button
                              type="button"
                              className="icon-button tiny"
                              aria-label="Remover"
                              onClick={() => setForm({ ...form, products: form.products.filter((_, i) => i !== index) })}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12M9 7v10m6-10v10M10 4h4l1 2H9l1-2z" /></svg>
                            </button>
                          </div>
                        </div>
                        <div className="grid-2">
                          <label>
                            Nome no pedido
                            <input
                              value={item.name}
                              onChange={(e) => {
                                const next = [...form.products];
                                next[index] = { ...next[index], name: e.target.value };
                                setForm({ ...form, products: next });
                              }}
                            />
                          </label>
                          <label>
                            Valor unitario no pedido
                            <MoneyInput
                              value={item.unitPrice}
                              onChange={(value) => {
                                const next = [...form.products];
                                next[index] = { ...next[index], unitPrice: value };
                                setForm({ ...form, products: next });
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                    <button type="button" className="ghost" onClick={addProductLine}>+ Adicionar produto</button>
                  </div>
                </div>

                <div className="panel form-box">
                  <h4>Valores</h4>
                  <div className="ingredients">
                    {form.additions.map((item, index) => (
                      <div key={index} className="values-item">
                        <label>
                          Nome
                          <input
                            value={item.label}
                            onChange={(e) => {
                              const next = [...form.additions];
                              next[index] = { ...next[index], label: e.target.value };
                              setForm({ ...form, additions: next });
                            }}
                          />
                        </label>
                        <div className="values-row">
                          <label>
                            Tipo
                            <SelectField
                              className="value-type-select"
                              value={item.mode}
                              onChange={(value) => {
                                const next = [...form.additions];
                                next[index] = { ...next[index], mode: value as 'PERCENT' | 'FIXED' };
                                setForm({ ...form, additions: next });
                              }}
                              options={[
                                { value: 'FIXED', label: 'R$' },
                                { value: 'PERCENT', label: '%' }
                              ]}
                            />
                          </label>
                          <label>
                            Valor
                            {item.mode === 'FIXED' ? (
                              <MoneyInput
                                value={item.value}
                                onChange={(value) => {
                                  const next = [...form.additions];
                                  next[index] = { ...next[index], value };
                                  setForm({ ...form, additions: next });
                                }}
                              />
                            ) : (
                              <input
                                type="number"
                                value={item.value === 0 ? '' : item.value}
                                onChange={(e) => {
                                  const next = [...form.additions];
                                  next[index] = { ...next[index], value: Number(e.target.value || 0) };
                                  setForm({ ...form, additions: next });
                                }}
                              />
                            )}
                          </label>
                          <button
                            type="button"
                            className="icon-button tiny"
                            aria-label="Remover valor"
                            onClick={() => setForm({ ...form, additions: form.additions.filter((_, i) => i !== index) })}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12M9 7v10m6-10v10M10 4h4l1 2H9l1-2z" /></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                    <button type="button" className="ghost" onClick={addAddition}>+ Adicionar valor</button>
                  </div>
                  <div className="values-main-row">
                    <label>
                      Desconto tipo
                      <SelectField
                        className="value-type-select"
                        value={form.discountMode}
                        onChange={(value) => setForm({ ...form, discountMode: value as 'PERCENT' | 'FIXED' })}
                        options={[
                          { value: 'FIXED', label: 'R$' },
                          { value: 'PERCENT', label: '%' }
                        ]}
                      />
                    </label>
                    <label>
                      Desconto
                      {form.discountMode === 'FIXED' ? (
                        <MoneyInput value={form.discountValue} onChange={(value) => setForm({ ...form, discountValue: value })} />
                      ) : (
                        <input
                          type="number"
                          value={form.discountValue === 0 ? '' : form.discountValue}
                          onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value || 0) })}
                        />
                      )}
                    </label>
                    <label className="shipping-field">
                      Frete
                      <MoneyInput value={form.shippingValue} onChange={(value) => setForm({ ...form, shippingValue: value })} />
                    </label>
                  </div>
                </div>

                <div className="panel form-box">
                  <h4>Resumo geral</h4>
                  <div className="summary">
                    <div><span>Produtos</span><strong>{formatCurrency(totals.productsTotal)}</strong></div>
                    <div><span>Adicionais</span><strong>{formatCurrency(totals.additionsTotal)}</strong></div>
                    <div><span>Desconto</span><strong>{formatCurrency(totals.discountTotal)}</strong></div>
                    <div><span>Frete</span><strong>{formatCurrency(form.shippingValue)}</strong></div>
                    <div className="summary-total"><span>Total pedido</span><strong>{formatCurrency(totals.total)}</strong></div>
                  </div>
                </div>
              </>
            )}

            {tab === 'observacoes' && (
              <div className="panel form-box">
                <h4>Observacoes</h4>
                <label>Obs entrega/retirada<textarea value={form.notesDelivery} onChange={(e) => setForm({ ...form, notesDelivery: e.target.value })} rows={3} /></label>
                <label>Obs gerais<textarea value={form.notesGeneral} onChange={(e) => setForm({ ...form, notesGeneral: e.target.value })} rows={3} /></label>
                <label>Obs pagamento<textarea value={form.notesPayment} onChange={(e) => setForm({ ...form, notesPayment: e.target.value })} rows={3} /></label>
                <label>PIX<textarea value={form.pix} onChange={(e) => setForm({ ...form, pix: e.target.value })} rows={2} /></label>
                <label>Termos<textarea value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} rows={3} /></label>
              </div>
            )}

            {tab === 'pagamentos' && (
              <div className="panel form-box">
                <h4>Pagamentos</h4>
                <div className="summary">
                  <div><span>Total pedido</span><strong>{formatCurrency(totals.total)}</strong></div>
                  <div><span>Total pago</span><strong>{formatCurrency(totals.paid)}</strong></div>
                  <div className="summary-total"><span>Falta receber</span><strong>{formatCurrency(totals.pending)}</strong></div>
                </div>
                <div className="ingredients">
                  {form.payments.map((payment, index) => (
                    <div key={index} className="grid-3">
                      <label>Data<input type="date" value={payment.date} onChange={(e) => {
                        const next = [...form.payments];
                        next[index] = { ...next[index], date: e.target.value };
                        setForm({ ...form, payments: next });
                      }} /></label>
                      <label>Valor<MoneyInput value={payment.amount} onChange={(value) => {
                        const next = [...form.payments];
                        next[index] = { ...next[index], amount: value };
                        setForm({ ...form, payments: next });
                      }} /></label>
                      <label>Obs<input value={payment.note ?? ''} onChange={(e) => {
                        const next = [...form.payments];
                        next[index] = { ...next[index], note: e.target.value };
                        setForm({ ...form, payments: next });
                      }} /></label>
                    </div>
                  ))}
                  <button type="button" className="ghost" onClick={addPayment}>+ Adicionar pagamento</button>
                </div>
              </div>
            )}

            {tab === 'imagens' && (
              <div className="panel form-box">
                <h4>Imagens de referencia</h4>
                <input type="file" accept="image/*" multiple onChange={(e) => handleUploadImages(e.target.files)} />
                <div className="image-grid">
                  {form.images.map((image, index) => (
                    <div key={`${image.name}-${index}`} className="image-card">
                      <img src={image.dataUrl} alt={image.name} />
                      <span>{image.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'alertas' && (
              <div className="panel form-box">
                <h4>Alertas (modelo)</h4>
                <div className="form">
                  {form.alerts.map((alert, index) => (
                    <label key={`${alert.label}-${index}`} className="inline-right">
                      <input
                        type="checkbox"
                        checked={alert.enabled}
                        onChange={(e) => {
                          const next = [...form.alerts];
                          next[index] = { ...next[index], enabled: e.target.checked };
                          setForm({ ...form, alerts: next });
                        }}
                      />
                      <span>{alert.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="actions">
              <button type="button" className="ghost" onClick={() => (isCreateView ? navigate('/app/pedidos') : setShowForm(false))}>Cancelar</button>
              <button type="submit">{editingId ? 'Salvar alteracoes' : 'Salvar pedido'}</button>
            </div>
            {submitError && <div className="error">{submitError}</div>}
          </form>
        </div>
      )}

      {showCustomerModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <h4>Novo cliente</h4>
              <p>Cadastro rapido sem sair do pedido</p>
            </div>
            <form className="form" onSubmit={handleCreateCustomer}>
              <label>Nome<input value={customerForm.name} onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })} required /></label>
              <label>Telefone<input value={customerForm.phone} onChange={(e) => setCustomerForm({ ...customerForm, phone: formatPhoneBR(e.target.value) })} required /></label>
              <label>Tipo pessoa
                <SelectField
                  value={customerForm.personType}
                  onChange={(value) => setCustomerForm({ ...customerForm, personType: value as 'PF' | 'PJ' })}
                  options={[{ value: 'PF', label: 'Pessoa fisica' }, { value: 'PJ', label: 'Pessoa juridica' }]}
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="ghost" onClick={() => setShowCustomerModal(false)}>Cancelar</button>
                <button type="submit">Salvar cliente</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Descartar edicao?"
        message="Voce tem uma edicao em andamento. Deseja cancelar e criar um novo pedido?"
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
      <LoadingOverlay open={saving} label="Salvando pedido..." />
    </div>
  );
};
