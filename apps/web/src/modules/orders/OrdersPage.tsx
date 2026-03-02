import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';
import { apiFetch } from '../shared/api.ts';
import { ListToolbar } from '../shared/ListToolbar.tsx';
import { SelectField } from '../shared/SelectField.tsx';
import { SearchableSelect } from '../shared/SearchableSelect.tsx';
import { ConfirmDialog } from '../shared/ConfirmDialog.tsx';
import { LoadingOverlay } from '../shared/LoadingOverlay.tsx';
import { ListSkeleton } from '../shared/ListSkeleton.tsx';
import { MoneyInput } from '../shared/MoneyInput.tsx';
import { fetchWithCache, invalidateQueryCache, prefetchWithCache, useCachedQuery } from '../shared/queryCache.ts';
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

type OrderListItem = {
  id: string;
  number: string;
  type: 'PEDIDO' | 'ORCAMENTO';
  orderDateTime: string;
  deliveryDate?: string;
  status: 'AGUARDANDO_RETORNO' | 'CONCLUIDO' | 'CONFIRMADO' | 'CANCELADO';
  customerSnapshot?: { name: string };
  total?: number;
};

type CompanySettings = {
  companyName?: string;
  logoDataUrl?: string;
  defaultNotesDelivery?: string;
  defaultNotesGeneral?: string;
  defaultNotesPayment?: string;
};

const orderTabs: Array<{ key: 'pessoa' | 'produtos' | 'observacoes' | 'pagamentos' | 'imagens' | 'alertas'; label: string; icon: string }> = [
  { key: 'pessoa', label: 'Pessoa', icon: 'person' },
  { key: 'produtos', label: 'Produtos', icon: 'shopping_bag' },
  { key: 'observacoes', label: 'Observacoes', icon: 'description' },
  { key: 'pagamentos', label: 'Pagamentos', icon: 'payments' },
  { key: 'imagens', label: 'Imagens', icon: 'image' },
  { key: 'alertas', label: 'Alertas', icon: 'notifications' }
];

const onlyDigits = (value: string) => value.replace(/\D/g, '');
const formatCurrency = (value: number) => `R$ ${value.toFixed(2)}`;
const formatDateBr = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
};
const escapeHtml = (value?: string) =>
  (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

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

const newOrderForm = (defaults?: CompanySettings) => ({
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
  notesDelivery: defaults?.defaultNotesDelivery ?? '',
  notesGeneral: defaults?.defaultNotesGeneral ?? '',
  notesPayment: defaults?.defaultNotesPayment ?? '',
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
  const { orderId } = useParams<{ orderId?: string }>();
  const isCreateView = pathname === '/app/pedidos/novo';
  const isDetailView = Boolean(orderId);
  const isFormRoute = isCreateView || isDetailView;
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [orderDefaults, setOrderDefaults] = useState<CompanySettings>({});
  const confirmActionRef = useRef<null | (() => void)>(null);
  const [tab, setTab] = useState<'pessoa' | 'produtos' | 'observacoes' | 'pagamentos' | 'imagens' | 'alertas'>('pessoa');
  const [form, setForm] = useState(newOrderForm(orderDefaults));
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [editProductIndex, setEditProductIndex] = useState<number | null>(null);
  const [editProductName, setEditProductName] = useState('');
  const [editProductUnitPrice, setEditProductUnitPrice] = useState(0);
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

  const ordersQuery = useCachedQuery(
    queryKeys.orders,
    () => apiFetch<OrderListItem[]>('/orders?view=list', { token: user?.token }),
    { staleTime: 60_000, enabled: Boolean(user?.token), refetchInterval: 90_000 }
  );
  const detailQuery = useCachedQuery(
    `order-detail:${orderId ?? ''}`,
    () => apiFetch<OrderItem>(`/orders/${orderId}`, { token: user?.token }),
    { staleTime: 60_000, enabled: Boolean(user?.token && isDetailView && orderId) }
  );
  const customersQuery = useCachedQuery(
    queryKeys.customers,
    () => apiFetch<CustomerItem[]>('/customers', { token: user?.token }),
    { staleTime: 3 * 60_000, enabled: Boolean(user?.token) }
  );
  const productsQuery = useCachedQuery(
    queryKeys.products,
    () => apiFetch<ProductItem[]>('/products', { token: user?.token }),
    { staleTime: 3 * 60_000, enabled: Boolean(user?.token) }
  );
  const settingsQuery = useCachedQuery(
    queryKeys.companySettings,
    () => apiFetch<CompanySettings>('/company/settings', { token: user?.token }),
    { staleTime: 5 * 60_000, enabled: Boolean(user?.token) }
  );

  useEffect(() => {
    if (ordersQuery.data) setOrders(ordersQuery.data);
  }, [ordersQuery.data]);

  useEffect(() => {
    if (customersQuery.data) setCustomers(customersQuery.data);
  }, [customersQuery.data]);

  useEffect(() => {
    if (productsQuery.data) setProducts(productsQuery.data);
  }, [productsQuery.data]);

  useEffect(() => {
    if (settingsQuery.data) setOrderDefaults(settingsQuery.data);
  }, [settingsQuery.data]);

  const resetForm = () => {
    setForm(newOrderForm(orderDefaults));
    setEditingId(null);
    setTab('pessoa');
  };

  const handleNew = () => {
    if (user?.token) {
      prefetchWithCache(
        queryKeys.customers,
        () => apiFetch('/customers', { token: user.token }),
        { staleTime: 3 * 60_000 }
      );
      prefetchWithCache(
        queryKeys.products,
        () => apiFetch('/products', { token: user.token }),
        { staleTime: 3 * 60_000 }
      );
      prefetchWithCache(
        queryKeys.companySettings,
        () => apiFetch('/company/settings', { token: user.token }),
        { staleTime: 5 * 60_000 }
      );
    }
    navigate('/app/pedidos/novo');
  };

  useEffect(() => {
    if (isCreateView) {
      resetForm();
      setShowForm(true);
      return;
    }
    if (!isDetailView) {
      setShowForm(false);
    }
  }, [isCreateView, isDetailView, orderDefaults]);

  useEffect(() => {
    if (!isDetailView) return;
    const selectedOrder = detailQuery.data;
    if (!selectedOrder) {
      return;
    }
    setEditingId(selectedOrder.id);
    setForm({
      ...newOrderForm(orderDefaults),
      ...selectedOrder,
      orderDateTime: toDateTimeLocal(selectedOrder.orderDateTime),
      customerId: selectedOrder.customerId ?? ''
    });
    setShowForm(true);
  }, [isDetailView, detailQuery.data, navigate, orderDefaults]);

  const customerMap = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

  const productOptions = useMemo(
    () => products.map((p) => ({ value: p.id, label: `${p.name} • ${formatCurrency(p.unitPrice || p.salePrice)}` })),
    [products]
  );

  const filtered = orders.filter((order) => {
    const customerName = order.customerSnapshot?.name ?? '';
    const haystack = `${order.number} ${order.type} ${customerName} ${order.status}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });
  const activeTabIndex = orderTabs.findIndex((item) => item.key === tab);

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
      if (isFormRoute) navigate('/app/pedidos');
      invalidateQueryCache(queryKeys.orders);
      invalidateQueryCache(queryKeys.ordersSummaryCalendar);
      invalidateQueryCache('tasks-board');
      invalidateQueryCache(`order-detail:${editingId ?? ''}`);
      await ordersQuery.refetch();
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

  const openProductEditModal = (index: number) => {
    const item = form.products[index];
    if (!item) return;
    setEditProductIndex(index);
    setEditProductName(item.name);
    setEditProductUnitPrice(item.unitPrice);
  };

  const applyProductEditModal = () => {
    if (editProductIndex === null) return;
    const next = [...form.products];
    next[editProductIndex] = {
      ...next[editProductIndex],
      name: editProductName,
      unitPrice: editProductUnitPrice
    };
    setForm({ ...form, products: next });
    setEditProductIndex(null);
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
    invalidateQueryCache(queryKeys.customers);
    customersQuery.refetch().catch(() => undefined);
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
    const companyName = settingsQuery.data?.companyName ?? 'Controle Precificacao';
    const logoDataUrl = settingsQuery.data?.logoDataUrl ?? '';
    const productsHtml = (order.products ?? [])
      .map(
        (item, index) =>
          `<tr><td>${index + 1}</td><td>${escapeHtml(item.name)}</td><td>${item.quantity}</td><td>${formatCurrency(item.unitPrice)}</td><td>${formatCurrency(
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
    const additionsSummaryHtml = (order.additions ?? [])
      .map((item) => {
        const value = item.mode === 'FIXED' ? item.value : (productsTotal * item.value) / 100;
        const suffix = item.mode === 'PERCENT' ? ` (${item.value}%)` : '';
        return `<div class="summary-line"><span>${escapeHtml(item.label)}${suffix}</span><strong>${formatCurrency(value)}</strong></div>`;
      })
      .join('');

    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${order.type} ${order.number}</title>
      <style>
        *{box-sizing:border-box}
        body{font-family:Manrope,Arial,sans-serif;margin:0;padding:28px;color:#1f2328;background:#fff}
        .wrap{max-width:860px;margin:0 auto}
        .top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
        h1{font-family:"Space Grotesk",Arial,sans-serif;font-size:54px;line-height:1;margin:0 0 8px;color:#1f2328}
        .subtitle{font-size:22px;color:#4c5158}
        .logo{width:130px;height:90px;object-fit:contain}
        .cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:20px}
        .card{border:1px solid #1f2328;padding:12px;position:relative;background:#f8f9fb;min-height:86px}
        .card:before{content:"";position:absolute;left:0;top:0;bottom:0;width:9px;background:#1f2328}
        .card span{display:block;font-size:13px;color:#5a6068;margin-left:10px}
        .card strong{display:block;font-size:30px;color:#1f2328;line-height:1.1;margin-left:10px}
        .meta{margin-top:12px;font-size:14px;color:#2e3338}
        table{width:100%;border-collapse:collapse;margin-top:18px}
        th{background:#1f2328;color:#fff;padding:10px 8px;text-align:left;font-weight:600;font-size:13px}
        td{padding:10px 8px;border-bottom:1px solid #dde1e6;font-size:14px}
        td:nth-child(1),td:nth-child(3){text-align:center}
        td:nth-child(4),td:nth-child(5){text-align:right}
        .summary{margin-top:14px;display:grid;gap:6px;justify-items:end}
        .summary-line{display:flex;justify-content:space-between;gap:14px;width:320px;font-size:14px}
        .summary-line strong{font-weight:700}
        .total-row{margin-top:8px;display:flex;align-items:stretch;width:320px}
        .total-row .label{background:#1f2328;color:#fff;padding:12px 16px;font-weight:700;letter-spacing:.08em}
        .total-row .value{border:1px solid #1f2328;border-left:none;padding:12px 16px;font-weight:800;font-size:24px;flex:1;text-align:right}
        .footer{margin-top:24px;border-top:1px solid #d7dce2;padding-top:18px;display:grid;grid-template-columns:1fr 1fr;gap:14px}
        .box{border:1px solid #d7dce2;padding:12px;min-height:116px}
        .box h4{margin:0 0 8px;font-size:14px;color:#5a6068;text-transform:uppercase;letter-spacing:.06em}
        .box p{margin:0;font-size:13px;line-height:1.45;white-space:pre-wrap}
      </style></head><body>
      <div class="wrap">
        <div class="top">
          <div>
            <h1>${order.type === 'ORCAMENTO' ? 'Orcamento' : 'Pedido'}</h1>
            <div class="subtitle">${escapeHtml(companyName)}</div>
          </div>
          ${logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="Logo" />` : ''}
        </div>
        <div class="cards">
          <div class="card"><span>${order.type === 'ORCAMENTO' ? 'Orcamento' : 'Pedido'}:</span><strong>#${escapeHtml(order.number)}</strong></div>
          <div class="card"><span>Data:</span><strong>${formatDateBr(order.orderDateTime)}</strong></div>
          <div class="card"><span>Entrega:</span><strong>${order.deliveryDate ? formatDateBr(order.deliveryDate) : '-'}</strong></div>
        </div>
        <div class="meta"><strong>Cliente:</strong> ${escapeHtml(customer?.name ?? '-')} | <strong>Telefone:</strong> ${escapeHtml(customer?.phone ?? '-')} | <strong>Tipo:</strong> ${order.deliveryType}</div>
        <table>
          <thead><tr><th>Nº</th><th>Descricao do Produto</th><th>Qt.</th><th>Preco</th><th>Total</th></tr></thead>
          <tbody>${productsHtml || '<tr><td colspan="5" style="text-align:center">Sem produtos</td></tr>'}</tbody>
        </table>
        <div class="summary">
          ${additionsSummaryHtml}
          <div class="summary-line"><span>Desconto${order.discountMode === 'PERCENT' ? ` (${order.discountValue}%)` : ''}</span><strong>- ${formatCurrency(discountTotal)}</strong></div>
          <div class="summary-line"><span>Frete</span><strong>${formatCurrency(order.shippingValue ?? 0)}</strong></div>
          <div class="total-row"><div class="label">TOTAL</div><div class="value">${formatCurrency(total)}</div></div>
        </div>
        <div class="footer">
          <div class="box">
            <h4>Pagamento</h4>
            <p>${escapeHtml(note(order.notesPayment))}</p>
          </div>
          <div class="box">
            <h4>Observacoes</h4>
            <p>Entrega/Retirada: ${escapeHtml(note(order.notesDelivery))}</p>
            <p>${escapeHtml(note(order.notesGeneral))}</p>
          </div>
        </div>
      </div>
      </body></html>`;

    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    frame.style.opacity = '0';
    frame.setAttribute('aria-hidden', 'true');
    document.body.appendChild(frame);
    frame.srcdoc = html;
    frame.onload = () => {
      setTimeout(() => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        setTimeout(() => {
          if (frame.parentNode) frame.parentNode.removeChild(frame);
        }, 1200);
      }, 80);
    };
  };

  const handleGeneratePdf = async (orderIdToPrint: string) => {
    const order = await fetchWithCache<OrderItem>(
      `order-detail:${orderIdToPrint}`,
      () => apiFetch<OrderItem>(`/orders/${orderIdToPrint}`, { token: user?.token }),
      { staleTime: 60_000 }
    );
    generatePdf(order);
  };

  return (
    <div className="page">
      {!isFormRoute && (
      <div className="panel">
        <ListToolbar
          title="Pedidos e orcamentos"
          searchValue={search}
          onSearch={setSearch}
          actionLabel="Novo pedido"
          onAction={handleNew}
        />
        {ordersQuery.isFetching && !(ordersQuery.loading && orders.length === 0) ? <p className="muted">Atualizando pedidos...</p> : null}
        {ordersQuery.loading && orders.length === 0 ? (
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
                  <button type="button" className="icon-button small pdf-action" onClick={() => handleGeneratePdf(order.id)} aria-label="PDF">
                    <span className="material-symbols-outlined" aria-hidden="true">picture_as_pdf</span>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Editar"
                    onClick={() => navigate(`/app/pedidos/${order.id}`)}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">edit</span>
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
          <div className="tabs order-tabs" style={{ '--order-tab-index': Math.max(activeTabIndex, 0) } as CSSProperties}>
            <span className="order-tabs-indicator" aria-hidden="true" />
            {orderTabs.map((item) => (
              <button
                key={item.key}
                type="button"
                title={item.label}
                className={tab === item.key ? 'tab-icon active' : 'tab-icon'}
                onClick={() => setTab(item.key)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">{item.icon}</span>
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
                      <span className="material-symbols-outlined" aria-hidden="true">person_add</span>
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
                      <div key={index} className="order-product-row">
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
                        <input
                          className="order-product-qty"
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => {
                            const next = [...form.products];
                            next[index] = { ...next[index], quantity: Number(e.target.value || 1) };
                            setForm({ ...form, products: next });
                          }}
                        />
                        <div className="order-product-actions">
                          <button
                            type="button"
                            className="icon-button tiny"
                            aria-label="Editar item do pedido"
                            onClick={() => openProductEditModal(index)}
                          >
                            <span className="material-symbols-outlined" aria-hidden="true">edit</span>
                          </button>
                          <button
                            type="button"
                            className="icon-button tiny"
                            aria-label="Remover"
                            onClick={() => setForm({ ...form, products: form.products.filter((_, i) => i !== index) })}
                          >
                            <span className="material-symbols-outlined" aria-hidden="true">delete_outline</span>
                          </button>
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
                            <span className="material-symbols-outlined" aria-hidden="true">delete_outline</span>
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
                </div>
                <button type="button" className="ghost" onClick={addPayment}>+ Adicionar pagamento</button>
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
                </div>
                <div className="summary">
                  <div><span>Total pago</span><strong>{formatCurrency(totals.paid)}</strong></div>
                  <div className="summary-total"><span>Falta receber</span><strong>{formatCurrency(totals.pending)}</strong></div>
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
              <button type="button" className="ghost" onClick={() => (isFormRoute ? navigate('/app/pedidos') : setShowForm(false))}>Cancelar</button>
              <button type="submit">{editingId ? 'Salvar alteracoes' : 'Salvar pedido'}</button>
            </div>
            {submitError && <div className="error">{submitError}</div>}
          </form>
        </div>
      )}

      {editProductIndex !== null && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <h4>Editar item do pedido</h4>
              <p>Essa alteracao vale apenas para este pedido.</p>
            </div>
            <div className="form">
              <label>
                Nome no pedido
                <input value={editProductName} onChange={(e) => setEditProductName(e.target.value)} />
              </label>
              <label>
                Valor unitario no pedido
                <MoneyInput value={editProductUnitPrice} onChange={setEditProductUnitPrice} />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setEditProductIndex(null)}>Cancelar</button>
              <button type="button" onClick={applyProductEditModal}>Salvar item</button>
            </div>
          </div>
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
