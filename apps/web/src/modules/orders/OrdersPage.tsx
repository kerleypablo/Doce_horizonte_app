import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';
import { apiFetch } from '../shared/api.ts';
import { formatDateBr, normalizeDateKey, toDateKey } from '../shared/date.ts';
import { ListToolbar } from '../shared/ListToolbar.tsx';
import { SelectField } from '../shared/SelectField.tsx';
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
  companyPhone?: string;
  companyEmail?: string;
  pixKey?: string;
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

type ValueConfigType = 'ADDITION' | 'DISCOUNT' | 'SHIPPING';
type OrderStatus = 'AGUARDANDO_RETORNO' | 'CONCLUIDO' | 'CONFIRMADO' | 'CANCELADO';
type OrderStatusFilter = 'ALL' | 'AGUARDANDO_RETORNO' | 'CONFIRMADO' | 'CANCELADO';

const onlyDigits = (value: string) => value.replace(/\D/g, '');
const formatCurrency = (value: number) => `R$ ${value.toFixed(2)}`;
const formatDateTimeBr = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
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
const statusLabelMap: Record<OrderStatus, string> = {
  AGUARDANDO_RETORNO: 'Aguardando',
  CONCLUIDO: 'Concluido',
  CONFIRMADO: 'Confirmado',
  CANCELADO: 'Cancelado'
};

const getStatusLabel = (status: OrderStatus) => statusLabelMap[status] ?? status;

const getCurrentWeekRange = () => {
  const today = new Date();
  const day = today.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  start.setDate(today.getDate() + diffToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start: toDateKey(start), end: toDateKey(end) };
};

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

type OrderFormState = ReturnType<typeof newOrderForm>;

export const OrdersPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname } = location;
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
  const [deleteTarget, setDeleteTarget] = useState<OrderListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('ALL');
  const [currentWeekOnly, setCurrentWeekOnly] = useState(false);
  const [orderDefaults, setOrderDefaults] = useState<CompanySettings>({});
  const confirmActionRef = useRef<null | (() => void)>(null);
  const [tab, setTab] = useState<'pessoa' | 'produtos' | 'observacoes' | 'pagamentos' | 'imagens' | 'alertas'>('pessoa');
  const [form, setForm] = useState(newOrderForm(orderDefaults));
  const [showValueTypeMenu, setShowValueTypeMenu] = useState(false);
  const [valueModalOpen, setValueModalOpen] = useState(false);
  const [valueModalType, setValueModalType] = useState<ValueConfigType>('ADDITION');
  const [valueModalAdditionIndex, setValueModalAdditionIndex] = useState<number | null>(null);
  const [valueModalLabel, setValueModalLabel] = useState('');
  const [valueModalMode, setValueModalMode] = useState<'PERCENT' | 'FIXED'>('FIXED');
  const [valueModalAmount, setValueModalAmount] = useState(0);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentModalIndex, setPaymentModalIndex] = useState<number | null>(null);
  const [paymentModalDate, setPaymentModalDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentModalAmount, setPaymentModalAmount] = useState(0);
  const [paymentModalNote, setPaymentModalNote] = useState('');
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [productPickerSearch, setProductPickerSearch] = useState('');
  const [productPickerSelectedIds, setProductPickerSelectedIds] = useState<string[]>([]);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [customerPickerSearch, setCustomerPickerSearch] = useState('');
  const [customerPickerSelectedId, setCustomerPickerSelectedId] = useState('');
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [editProductIndex, setEditProductIndex] = useState<number | null>(null);
  const [editProductName, setEditProductName] = useState('');
  const [editProductUnitPrice, setEditProductUnitPrice] = useState(0);
  const [pdfPreviewHtml, setPdfPreviewHtml] = useState<string | null>(null);
  const createRouteInitRef = useRef<string>('');
  const detailRouteInitRef = useRef<string>('');
  const latestOrderDefaultsRef = useRef<CompanySettings>({});
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const pdfPreviewRef = useRef<HTMLIFrameElement | null>(null);
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
  const deliveryDateFromQuery = useMemo(() => {
    const value = new URLSearchParams(location.search).get('deliveryDate');
    return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
  }, [location.search]);
  const deliveryDateFromState = useMemo(() => {
    const state = location.state as { deliveryDate?: string } | null;
    const value = state?.deliveryDate ?? '';
    return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
  }, [location.state]);

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

  useEffect(() => {
    latestOrderDefaultsRef.current = orderDefaults;
  }, [orderDefaults]);

  const resetForm = () => {
    setForm(newOrderForm(orderDefaults));
    setEditingId(null);
    setTab('pessoa');
  };

  const updateFormField = <Key extends keyof OrderFormState>(field: Key, value: OrderFormState[Key]) => {
    setForm((current) => ({ ...current, [field]: value }));
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
      const initialDeliveryDate = deliveryDateFromQuery || deliveryDateFromState;
      const initKey = `${pathname}|${initialDeliveryDate || ''}`;
      if (createRouteInitRef.current !== initKey) {
        const next = newOrderForm(latestOrderDefaultsRef.current);
        if (initialDeliveryDate) next.deliveryDate = initialDeliveryDate;
        setForm(next);
        setEditingId(null);
        setTab('pessoa');
        setShowForm(true);
        createRouteInitRef.current = initKey;
      }
      return;
    }
    createRouteInitRef.current = '';
    if (!isDetailView) {
      setShowForm(false);
    }
  }, [isCreateView, isDetailView, deliveryDateFromQuery, deliveryDateFromState, pathname]);

  useEffect(() => {
    if (!isDetailView) return;
    const selectedOrder = detailQuery.data;
    if (!selectedOrder) {
      return;
    }
    if (detailRouteInitRef.current === selectedOrder.id) {
      setShowForm(true);
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
    detailRouteInitRef.current = selectedOrder.id;
  }, [isDetailView, detailQuery.data, orderDefaults]);

  useEffect(() => {
    if (isDetailView) return;
    detailRouteInitRef.current = '';
  }, [isDetailView, orderId]);

  const customerMap = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const selectedCustomer = useMemo(() => customerMap.get(form.customerId), [customerMap, form.customerId]);

  const currentWeekRange = useMemo(() => getCurrentWeekRange(), []);
  const filtered = useMemo(() => {
    const searchTerm = search.toLowerCase().trim();
    return orders.filter((order) => {
      const customerName = order.customerSnapshot?.name ?? '';
      const haystack = `${order.number} ${order.type} ${customerName} ${getStatusLabel(order.status)}`.toLowerCase();
      if (searchTerm && !haystack.includes(searchTerm)) return false;
      if (statusFilter !== 'ALL' && order.status !== statusFilter) return false;
      if (!currentWeekOnly) return true;
      const deliveryDate = normalizeDateKey(order.deliveryDate);
      return Boolean(deliveryDate && deliveryDate >= currentWeekRange.start && deliveryDate <= currentWeekRange.end);
    });
  }, [orders, search, statusFilter, currentWeekOnly, currentWeekRange]);
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

  const openProductPicker = () => {
    setProductPickerSelectedIds(
      form.products
        .map((item) => item.productId)
        .filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index)
    );
    setProductPickerSearch('');
    setShowProductPicker(true);
  };

  const openCustomerPicker = () => {
    setCustomerPickerSelectedId(form.customerId || '');
    setCustomerPickerSearch('');
    setShowCustomerPicker(true);
  };
  const selectCustomerFromPicker = (customerId: string) => {
    setCustomerPickerSelectedId(customerId);
    setForm((prev) => ({ ...prev, customerId: customerId }));
    setShowCustomerPicker(false);
  };

  const toggleProductPickerItem = (productId: string, checked: boolean) => {
    setProductPickerSelectedIds((current) => {
      if (checked) return current.includes(productId) ? current : [...current, productId];
      return current.filter((id) => id !== productId);
    });
  };

  const applyProductPicker = () => {
    const existingByProductId = new Map(
      form.products
        .filter((item) => item.productId)
        .map((item) => [item.productId, item] as const)
    );

    const nextProducts = productPickerSelectedIds
      .map((productId) => {
        const selectedProduct = products.find((item) => item.id === productId);
        if (!selectedProduct) return null;
        const existing = existingByProductId.get(productId);
        if (existing) {
          return {
            ...existing,
            name: existing.name || selectedProduct.name,
            unitPrice: existing.unitPrice || selectedProduct.unitPrice || selectedProduct.salePrice || 0
          };
        }
        return {
          productId,
          name: selectedProduct.name,
          unitPrice: selectedProduct.unitPrice || selectedProduct.salePrice || 0,
          quantity: 1,
          notes: ''
        };
      })
      .filter((item): item is { productId: string; name: string; unitPrice: number; quantity: number; notes?: string } => Boolean(item));

    setForm((prev) => ({ ...prev, products: nextProducts }));
    setShowProductPicker(false);
  };

  const pickerFilteredProducts = useMemo(() => {
    const needle = productPickerSearch.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((item) => item.name.toLowerCase().includes(needle));
  }, [products, productPickerSearch]);

  const pickerSelectedProducts = useMemo(
    () =>
      productPickerSelectedIds
        .map((id) => products.find((item) => item.id === id))
        .filter((item): item is ProductItem => Boolean(item)),
    [products, productPickerSelectedIds]
  );

  const pickerUnselectedProducts = useMemo(
    () => pickerFilteredProducts.filter((item) => !productPickerSelectedIds.includes(item.id)),
    [pickerFilteredProducts, productPickerSelectedIds]
  );

  const pickerFilteredCustomers = useMemo(() => {
    const needle = customerPickerSearch.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter((item) => {
      const phone = formatPhoneBR(item.phone).toLowerCase();
      return item.name.toLowerCase().includes(needle) || phone.includes(needle);
    });
  }, [customers, customerPickerSearch]);

  const pickerOrderedCustomers = useMemo(() => {
    if (!customerPickerSelectedId) return pickerFilteredCustomers;
    const selected = pickerFilteredCustomers.find((item) => item.id === customerPickerSelectedId);
    if (!selected) return pickerFilteredCustomers;
    return [selected, ...pickerFilteredCustomers.filter((item) => item.id !== customerPickerSelectedId)];
  }, [pickerFilteredCustomers, customerPickerSelectedId]);

  const openProductEditModal = (index: number) => {
    const item = form.products[index];
    if (!item) return;
    setEditProductIndex(index);
    setEditProductName(item.name);
    setEditProductUnitPrice(item.unitPrice);
  };

  const applyProductEditModal = () => {
    if (editProductIndex === null) return;
    setForm((prev) => {
      const next = [...prev.products];
      next[editProductIndex] = {
        ...next[editProductIndex],
        name: editProductName,
        unitPrice: editProductUnitPrice
      };
      return { ...prev, products: next };
    });
    setEditProductIndex(null);
  };

  const openPaymentModal = (index?: number) => {
    if (typeof index === 'number') {
      const current = form.payments[index];
      if (!current) return;
      setPaymentModalIndex(index);
      setPaymentModalDate(current.date);
      setPaymentModalAmount(current.amount);
      setPaymentModalNote(current.note ?? '');
    } else {
      setPaymentModalIndex(null);
      setPaymentModalDate(new Date().toISOString().slice(0, 10));
      setPaymentModalAmount(0);
      setPaymentModalNote('');
    }
    setPaymentModalOpen(true);
  };

  const savePaymentModal = () => {
    const nextPayment = {
      date: paymentModalDate,
      amount: paymentModalAmount,
      note: paymentModalNote
    };
    if (paymentModalIndex === null) {
      setForm((prev) => ({ ...prev, payments: [...prev.payments, nextPayment] }));
    } else {
      setForm((prev) => {
        const next = [...prev.payments];
        next[paymentModalIndex] = nextPayment;
        return { ...prev, payments: next };
      });
    }
    setPaymentModalOpen(false);
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
    setCustomerPickerSelectedId(created.id);
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

  const buildPdfHtml = (order: OrderItem) => {
    const customer = order.customerSnapshot;
    const companyName = settingsQuery.data?.companyName ?? 'Controle Precificacao';
    const companyPhone = settingsQuery.data?.companyPhone ?? '';
    const companyEmail = settingsQuery.data?.companyEmail ?? '';
    const pixKey = settingsQuery.data?.pixKey ?? '';
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
    const note = (value?: string) => (value && value.trim().length ? value : '-');
    const additionsSummaryHtml = (order.additions ?? [])
      .map((item) => {
        const value = item.mode === 'FIXED' ? item.value : (productsTotal * item.value) / 100;
        const suffix = item.mode === 'PERCENT' ? ` (${item.value}%)` : '';
        return `<div class="summary-line"><span>${escapeHtml(item.label)}${suffix}</span><strong>${formatCurrency(value)}</strong></div>`;
      })
      .join('');

    const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${order.type} ${order.number}</title>
      <style>
        @page{size:A4;margin:12mm}
        *{box-sizing:border-box;-webkit-text-size-adjust:100%}
        body{font-family:Manrope,Arial,sans-serif;margin:0;padding:10px;color:#1f2328;background:#e8edf3;overflow:auto}
        .sheet{width:210mm;min-height:297mm;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 10px 32px rgba(17,24,39,.12);padding:20px}
        .wrap{max-width:100%;margin:0 auto}
        .top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
        h1{font-family:"Space Grotesk",Arial,sans-serif;font-size:54px;line-height:1;margin:0 0 8px;color:#1f2328}
        .subtitle{font-size:22px;color:#4c5158}
        .logo{width:130px;height:90px;object-fit:contain}
        .order-meta{margin-top:8px;font-size:18px;font-weight:700;color:#1f2328;display:flex;gap:18px;flex-wrap:wrap}
        .cards{display:grid;grid-template-columns:minmax(220px,320px);gap:12px;margin-top:20px}
        .card{border:1px solid #1f2328;padding:12px;position:relative;background:#f8f9fb;min-height:86px}
        .card:before{content:"";position:absolute;left:0;top:0;bottom:0;width:9px;background:#1f2328}
        .card span{display:block;font-size:13px;color:#5a6068;margin-left:10px}
        .card strong{display:block;font-size:30px;color:#1f2328;line-height:1.1;margin-left:10px}
        .meta{margin-top:12px;font-size:14px;color:#2e3338}
        table{width:100%;border-collapse:collapse;margin-top:18px}
        th{background:#1f2328;color:#fff;padding:10px 8px;text-align:left;font-weight:600;font-size:13px}
        th:nth-child(4),th:nth-child(5){text-align:right}
        td{padding:10px 8px;border-bottom:1px solid #dde1e6;font-size:14px}
        td:nth-child(1),td:nth-child(3){text-align:center}
        td:nth-child(4),td:nth-child(5){text-align:right}
        .summary{margin-top:14px;display:grid;gap:6px;justify-items:end}
        .summary-line{display:flex;justify-content:space-between;gap:14px;width:320px;font-size:14px}
        .summary-line strong{font-weight:700}
        .total-row{margin-top:8px;display:flex;align-items:stretch;width:320px}
        .total-row .label{background:#1f2328;color:#fff;padding:12px 16px;font-weight:700;letter-spacing:.08em}
        .total-row .value{border:1px solid #1f2328;border-left:none;padding:12px 16px;font-weight:800;font-size:24px;flex:1;text-align:right}
        .section-grid{margin-top:24px;display:grid;gap:12px}
        .box-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .box{border:1px solid #d7dce2;padding:12px;min-height:110px}
        .box h4{margin:0 0 8px;font-size:14px;color:#5a6068;text-transform:uppercase;letter-spacing:.06em;font-weight:800}
        .box p{margin:0;font-size:15px;line-height:1.45;white-space:pre-wrap}
        .contact-line{display:flex;align-items:center;gap:8px;font-size:13px;line-height:1.45;margin:0 0 6px}
        .pix{font-weight:800;margin-top:8px}
        .page-break{break-before:page;page-break-before:always}
        .photo-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        .photo{border:1px solid #d7dce2;border-radius:10px;padding:8px}
        .photo img{width:100%;height:280px;object-fit:contain;background:#fff}
        .photo span{display:block;margin-top:6px;font-size:12px;color:#5a6068;word-break:break-word}
        @media print{
          body{padding:0;background:#fff;overflow:visible}
          .sheet{width:auto;min-height:auto;margin:0;padding:0;box-shadow:none;border-radius:0}
        }
      </style></head><body>
      <div class="sheet"><div class="wrap">
        <div class="top">
          <div>
            <h1>${order.type === 'ORCAMENTO' ? 'Orcamento' : 'Pedido'}</h1>
            <div class="subtitle">${escapeHtml(companyName)}</div>
            <div class="order-meta">
              <span>${order.type === 'ORCAMENTO' ? 'Orcamento' : 'Pedido'}: #${escapeHtml(order.number)}</span>
              <span>Data: ${formatDateBr(order.orderDateTime)}</span>
            </div>
          </div>
          ${logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="Logo" />` : ''}
        </div>
        <div class="cards">
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
        <div class="section-grid">
          <div class="box">
            <h4>Observacoes gerais</h4>
            <p>${escapeHtml(note(order.notesGeneral))}</p>
          </div>
          <div class="box-row">
            <div class="box">
              <h4>Pagamento</h4>
              <p>${escapeHtml(note(order.notesPayment))}</p>
              <p class="pix">PIX: ${escapeHtml(pixKey || order.pix || '-')}</p>
            </div>
            <div class="box">
              <h4>Entrega</h4>
              <p>${escapeHtml(note(order.notesDelivery))}</p>
            </div>
          </div>
          <div class="box">
            <h4>Contato</h4>
            <p class="contact-line">☎ ${escapeHtml(companyPhone || '-')}</p>
            <p class="contact-line">✉ ${escapeHtml(companyEmail || '-')}</p>
          </div>
        </div>
      </div>
      ${(order.images?.length ?? 0) > 0 ? `
      <div class="wrap page-break">
        <h2 style="font-family:'Space Grotesk',Arial,sans-serif;margin:0 0 12px;font-size:30px">Fotos referencia</h2>
        <div class="photo-grid">
          ${(order.images ?? [])
            .map((image) => `<div class="photo"><img src="${image.dataUrl}" alt="Foto de referencia" /><span>${escapeHtml(image.name || 'Imagem')}</span></div>`)
            .join('')}
        </div>
      </div>` : ''}</div>
      </body></html>`;

    return html;
  };

  const handleGeneratePdf = async (orderIdToPrint: string) => {
    const order = await fetchWithCache<OrderItem>(
      `order-detail:${orderIdToPrint}`,
      () => apiFetch<OrderItem>(`/orders/${orderIdToPrint}`, { token: user?.token }),
      { staleTime: 60_000 }
    );
    setPdfPreviewHtml(buildPdfHtml(order));
  };

  const handlePrintPdfPreview = () => {
    const frameWindow = pdfPreviewRef.current?.contentWindow;
    if (frameWindow) {
      try {
        frameWindow.focus();
        frameWindow.print();
        return;
      } catch {
        // fallback below
      }
    }
    if (!pdfPreviewHtml) return;
    const popup = window.open('', '_blank', 'noopener,noreferrer,width=980,height=720');
    if (!popup) return;
    popup.document.open();
    popup.document.write(pdfPreviewHtml);
    popup.document.close();
    popup.focus();
    setTimeout(() => {
      popup.print();
    }, 250);
  };

  const handleDeleteOrder = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/orders/${deleteTarget.id}`, {
        method: 'DELETE',
        token: user?.token
      });
      setOrders((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      invalidateQueryCache(queryKeys.orders);
      invalidateQueryCache(queryKeys.ordersSummaryCalendar);
      await ordersQuery.refetch();
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const openValueModal = (type: ValueConfigType, additionIndex?: number) => {
    setShowValueTypeMenu(false);
    setValueModalType(type);
    if (type === 'ADDITION') {
      if (typeof additionIndex === 'number') {
        const current = form.additions[additionIndex];
        if (!current) return;
        setValueModalAdditionIndex(additionIndex);
        setValueModalLabel(current.label);
        setValueModalMode(current.mode);
        setValueModalAmount(current.value);
      } else {
        setValueModalAdditionIndex(null);
        setValueModalLabel('Adicional');
        setValueModalMode('FIXED');
        setValueModalAmount(0);
      }
    } else if (type === 'DISCOUNT') {
      setValueModalAdditionIndex(null);
      setValueModalLabel('Desconto');
      setValueModalMode(form.discountMode);
      setValueModalAmount(form.discountValue);
    } else {
      setValueModalAdditionIndex(null);
      setValueModalLabel('Frete');
      setValueModalMode('FIXED');
      setValueModalAmount(form.shippingValue);
    }
    setValueModalOpen(true);
  };

  const saveValueModal = () => {
    if (valueModalType === 'ADDITION') {
      if (!valueModalLabel.trim()) return;
      if (valueModalAdditionIndex === null) {
        setForm((prev) => ({
          ...prev,
          additions: [...prev.additions, { label: valueModalLabel.trim(), mode: valueModalMode, value: valueModalAmount }]
        }));
      } else {
        setForm((prev) => {
          const next = [...prev.additions];
          next[valueModalAdditionIndex] = { label: valueModalLabel.trim(), mode: valueModalMode, value: valueModalAmount };
          return { ...prev, additions: next };
        });
      }
    } else if (valueModalType === 'DISCOUNT') {
      setForm((prev) => ({ ...prev, discountMode: valueModalMode, discountValue: valueModalAmount }));
    } else {
      setForm((prev) => ({ ...prev, shippingValue: valueModalAmount }));
    }
    setValueModalOpen(false);
  };

  const removeDiscountValue = () => {
    setForm((prev) => ({ ...prev, discountValue: 0 }));
  };

  const removeShippingValue = () => {
    setForm((prev) => ({ ...prev, shippingValue: 0 }));
  };

  const formatValueModeLabel = (mode: 'PERCENT' | 'FIXED') => (mode === 'PERCENT' ? '%' : 'R$');
  const formatValueAmount = (mode: 'PERCENT' | 'FIXED', amount: number) =>
    mode === 'PERCENT' ? `${amount}%` : formatCurrency(amount);

  return (
    <div className="page">
      {!isFormRoute && (
      <div className="panel">
        <ListToolbar
          title="Pedidos e orcamentos"
          searchValue={search}
          onSearch={setSearch}
          actionLabel="+"
          onAction={handleNew}
        />
        <div className="orders-filters">
          <SelectField
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as OrderStatusFilter)}
            options={[
              { value: 'ALL', label: 'Todos os status' },
              { value: 'AGUARDANDO_RETORNO', label: 'Aguardando' },
              { value: 'CONFIRMADO', label: 'Confirmado' },
              { value: 'CANCELADO', label: 'Cancelado' }
            ]}
            placeholder="Filtrar status"
            className="orders-filter-select"
          />
          <button
            type="button"
            className={currentWeekOnly ? 'ghost active' : 'ghost'}
            onClick={() => setCurrentWeekOnly((current) => !current)}
          >
            Desta semana
          </button>
        </div>
        {ordersQuery.isFetching && !(ordersQuery.loading && orders.length === 0) ? <p className="muted">Atualizando pedidos...</p> : null}
        {ordersQuery.loading && orders.length === 0 ? (
          <ListSkeleton />
        ) : (
          <div className="table">
            {filtered.map((order) => (
              <div
                key={order.id}
                className="list-row"
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/app/pedidos/${order.id}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(`/app/pedidos/${order.id}`);
                  }
                }}
              >
                <div>
                  <strong>{order.customerSnapshot?.name ?? 'Sem cliente'}</strong>
                  <span className="muted">
                    Entrega: {order.deliveryDate ? formatDateBr(order.deliveryDate) : '-'} • {getStatusLabel(order.status)}
                  </span>
                </div>
                <div className="inline-right">
                  <button
                    type="button"
                    className="icon-button small pdf-action"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleGeneratePdf(order.id);
                    }}
                    aria-label="PDF"
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">picture_as_pdf</span>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Excluir"
                    onClick={(event) => {
                      event.stopPropagation();
                      setDeleteTarget(order);
                    }}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">delete_outline</span>
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
          <div className="panel-title-row">
            {isFormRoute && (
              <button type="button" className="icon-button small" onClick={() => navigate('/app/pedidos')} aria-label="Voltar">
                <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
              </button>
            )}
            <h3>{editingId ? 'Editar pedido/orcamento' : 'Novo pedido/orcamento'}</h3>
          </div>
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
                  <div className="order-box-head">
                    <h4>Pedido</h4>
                    <span className="order-date-label">{formatDateTimeBr(form.orderDateTime)}</span>
                  </div>
                  <div>
                    <label>
                      Tipo
                      <SelectField
                        value={form.type}
                        onChange={(value) => updateFormField('type', value as 'PEDIDO' | 'ORCAMENTO')}
                        options={[
                          { value: 'PEDIDO', label: 'Pedido' },
                          { value: 'ORCAMENTO', label: 'Orcamento' }
                        ]}
                      />
                    </label>
                  </div>
                </div>

                <div className="panel form-box">
                  <h4>Cliente</h4>
                  <div className="values-toolbar">
                    <button type="button" className="ghost" onClick={openCustomerPicker}>
                      {selectedCustomer ? 'Trocar cliente' : '+ Selecionar cliente'}
                    </button>
                  </div>
                  {selectedCustomer ? (
                    <div className="values-config-row">
                      <div>
                        <strong>{selectedCustomer.name}</strong>
                        <span className="muted">{formatPhoneBR(selectedCustomer.phone)}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="muted">Nenhum cliente selecionado.</p>
                  )}
                </div>

                <div className="panel form-box">
                  <h4>Entrega</h4>
                  <div className="grid-2">
                    <label>
                      Entrega ou retirada
                      <SelectField
                        value={form.deliveryType}
                        onChange={(value) => updateFormField('deliveryType', value as 'ENTREGA' | 'RETIRADA')}
                        options={[
                          { value: 'ENTREGA', label: 'Entrega' },
                          { value: 'RETIRADA', label: 'Retirada' }
                        ]}
                      />
                    </label>
                    <label>
                      Data de entrega
                      <input type="date" value={form.deliveryDate} onChange={(e) => updateFormField('deliveryDate', e.target.value)} />
                    </label>
                  </div>
                </div>

                <div className="panel form-box">
                  <h4>Status</h4>
                  <SelectField
                    value={form.status}
                    onChange={(value) => updateFormField('status', value as 'AGUARDANDO_RETORNO' | 'CONCLUIDO' | 'CONFIRMADO' | 'CANCELADO')}
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
                          <span className="order-product-label">{item.name || 'Produto sem nome'}</span>
                          <label className="add-item-qty-field">
                            <span>Quantidade</span>
                            <input
                              className="order-product-qty"
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) => {
                                setForm((prev) => {
                                  const next = [...prev.products];
                                  next[index] = { ...next[index], quantity: Number(e.target.value || 1) };
                                  return { ...prev, products: next };
                                });
                              }}
                            />
                          </label>
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
                            onClick={() => setForm((prev) => ({ ...prev, products: prev.products.filter((_, i) => i !== index) }))}
                          >
                            <span className="material-symbols-outlined" aria-hidden="true">delete_outline</span>
                          </button>
                        </div>
                      </div>
                    ))}
                    <button type="button" className="ghost" onClick={openProductPicker}>+ Adicionar produto</button>
                  </div>
                </div>

                <div className="panel form-box">
                  <h4>Valores</h4>
                  <div className="values-toolbar">
                    <button type="button" className="ghost" onClick={() => setShowValueTypeMenu((prev) => !prev)}>+ Adicionar valor</button>
                    {showValueTypeMenu ? (
                      <div className="values-type-menu">
                        <button type="button" onClick={() => openValueModal('SHIPPING')}>Frete</button>
                        <button type="button" onClick={() => openValueModal('DISCOUNT')}>Desconto</button>
                        <button type="button" onClick={() => openValueModal('ADDITION')}>Adicionais</button>
                      </div>
                    ) : null}
                  </div>

                  <div className="values-config-list">
                    {form.additions.map((item, index) => (
                      <div key={`${item.label}-${index}`} className="values-config-row">
                        <div>
                          <strong>{item.label}</strong>
                          <span className="muted">{formatValueAmount(item.mode, item.value)}</span>
                        </div>
                        <div className="values-config-actions">
                          <span className="value-mode-badge">{formatValueModeLabel(item.mode)}</span>
                          <button type="button" className="icon-button tiny" aria-label="Editar" onClick={() => openValueModal('ADDITION', index)}>
                            <span className="material-symbols-outlined" aria-hidden="true">edit</span>
                          </button>
                          <button
                            type="button"
                            className="icon-button tiny"
                            aria-label="Remover"
                            onClick={() => setForm((prev) => ({ ...prev, additions: prev.additions.filter((_, i) => i !== index) }))}
                          >
                            <span className="material-symbols-outlined" aria-hidden="true">delete_outline</span>
                          </button>
                        </div>
                      </div>
                    ))}

                    {form.discountValue > 0 ? (
                      <div className="values-config-row">
                        <div>
                          <strong>Desconto</strong>
                          <span className="muted">{formatValueAmount(form.discountMode, form.discountValue)}</span>
                        </div>
                        <div className="values-config-actions">
                          <span className="value-mode-badge">{formatValueModeLabel(form.discountMode)}</span>
                          <button type="button" className="icon-button tiny" aria-label="Editar" onClick={() => openValueModal('DISCOUNT')}>
                            <span className="material-symbols-outlined" aria-hidden="true">edit</span>
                          </button>
                          <button type="button" className="icon-button tiny" aria-label="Remover" onClick={removeDiscountValue}>
                            <span className="material-symbols-outlined" aria-hidden="true">delete_outline</span>
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {form.shippingValue > 0 ? (
                      <div className="values-config-row">
                        <div>
                          <strong>Frete</strong>
                          <span className="muted">{formatCurrency(form.shippingValue)}</span>
                        </div>
                        <div className="values-config-actions">
                          <span className="value-mode-badge">R$</span>
                          <button type="button" className="icon-button tiny" aria-label="Editar" onClick={() => openValueModal('SHIPPING')}>
                            <span className="material-symbols-outlined" aria-hidden="true">edit</span>
                          </button>
                          <button type="button" className="icon-button tiny" aria-label="Remover" onClick={removeShippingValue}>
                            <span className="material-symbols-outlined" aria-hidden="true">delete_outline</span>
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {form.additions.length === 0 && form.discountValue <= 0 && form.shippingValue <= 0 ? (
                      <p className="muted">Nenhum valor adicional configurado.</p>
                    ) : null}
                  </div>
                </div>

                <div className="panel form-box">
                  <h4>Resumo geral</h4>
                  <div className="summary">
                    <div><span>Produtos</span><strong>{formatCurrency(totals.productsTotal)}</strong></div>
                    {form.additions.length > 0 ? <div><span>Adicionais</span><strong>{formatCurrency(totals.additionsTotal)}</strong></div> : null}
                    {form.discountValue > 0 ? <div><span>Desconto</span><strong>{formatCurrency(totals.discountTotal)}</strong></div> : null}
                    {form.shippingValue > 0 ? <div><span>Frete</span><strong>{formatCurrency(form.shippingValue)}</strong></div> : null}
                    <div className="summary-total"><span>Total pedido</span><strong>{formatCurrency(totals.total)}</strong></div>
                  </div>
                </div>
              </>
            )}

            {tab === 'observacoes' && (
              <div className="panel form-box">
                <h4>Observacoes</h4>
                <label>Obs entrega/retirada<textarea value={form.notesDelivery} onChange={(e) => updateFormField('notesDelivery', e.target.value)} rows={3} /></label>
                <label>Obs gerais<textarea value={form.notesGeneral} onChange={(e) => updateFormField('notesGeneral', e.target.value)} rows={3} /></label>
                <label>Obs pagamento<textarea value={form.notesPayment} onChange={(e) => updateFormField('notesPayment', e.target.value)} rows={3} /></label>
                <label>PIX<textarea value={form.pix} onChange={(e) => updateFormField('pix', e.target.value)} rows={2} /></label>
                <label>Termos<textarea value={form.terms} onChange={(e) => updateFormField('terms', e.target.value)} rows={3} /></label>
              </div>
            )}

            {tab === 'pagamentos' && (
              <div className="panel form-box">
                <h4>Pagamentos</h4>
                <div className="summary">
                  <div><span>Total pedido</span><strong>{formatCurrency(totals.total)}</strong></div>
                </div>
                <div className="values-toolbar">
                  <button type="button" className="ghost" onClick={() => openPaymentModal()}>+ Adicionar pagamento</button>
                </div>
                <div className="values-config-list">
                  {form.payments.map((payment, index) => (
                    <div key={index} className="values-config-row">
                      <div>
                        <strong>Pagamento {index + 1}</strong>
                        <span className="muted">
                          {formatDateBr(payment.date)} • {formatCurrency(payment.amount)}
                          {payment.note ? ` • ${payment.note}` : ''}
                        </span>
                      </div>
                      <div className="values-config-actions">
                        <button type="button" className="icon-button tiny" aria-label="Editar" onClick={() => openPaymentModal(index)}>
                          <span className="material-symbols-outlined" aria-hidden="true">edit</span>
                        </button>
                        <button
                          type="button"
                          className="icon-button tiny"
                          aria-label="Remover"
                          onClick={() => setForm((prev) => ({ ...prev, payments: prev.payments.filter((_, i) => i !== index) }))}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">delete_outline</span>
                        </button>
                      </div>
                    </div>
                  ))}
                  {form.payments.length === 0 ? <p className="muted">Nenhum pagamento adicionado.</p> : null}
                </div>
                <div className="summary payments-summary">
                  <div><span>Total pago</span><strong>{formatCurrency(totals.paid)}</strong></div>
                  <div className="summary-total"><span>Falta receber</span><strong>{formatCurrency(totals.pending)}</strong></div>
                </div>
              </div>
            )}

            {tab === 'imagens' && (
              <div className="panel form-box">
                <h4>Imagens de referencia</h4>
                <input
                  ref={imageInputRef}
                  className="order-image-input-hidden"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => handleUploadImages(e.target.files)}
                />
                <div className="order-image-picker-row">
                  <button type="button" className="ghost" onClick={() => imageInputRef.current?.click()}>
                    Selecionar imagens
                  </button>
                  <span className="order-image-picker-text">
                    {form.images.length > 0 ? `${form.images.length} imagem(ns) selecionada(s)` : 'Nenhuma imagem selecionada'}
                  </span>
                </div>
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
                          setForm((prev) => {
                            const next = [...prev.alerts];
                            next[index] = { ...next[index], enabled: e.target.checked };
                            return { ...prev, alerts: next };
                          });
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

      {valueModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <div className="modal-icon">
                <span className="material-symbols-outlined" aria-hidden="true">calculate</span>
              </div>
              <div>
                <h4>{valueModalType === 'ADDITION' ? 'Adicionar valor' : valueModalType === 'DISCOUNT' ? 'Configurar desconto' : 'Configurar frete'}</h4>
                <p>Defina o tipo e o valor que sera aplicado no pedido.</p>
              </div>
            </div>
            <div className="form">
              {valueModalType === 'ADDITION' ? (
                <label>
                  Nome
                  <input value={valueModalLabel} onChange={(e) => setValueModalLabel(e.target.value)} />
                </label>
              ) : (
                <label>
                  Tipo
                  <input value={valueModalType === 'DISCOUNT' ? 'Desconto' : 'Frete'} disabled />
                </label>
              )}
              <label>
                Modo
                <SelectField
                  value={valueModalType === 'SHIPPING' ? 'FIXED' : valueModalMode}
                  onChange={(value) => setValueModalMode(value as 'PERCENT' | 'FIXED')}
                  disabled={valueModalType === 'SHIPPING'}
                  options={[
                    { value: 'FIXED', label: 'R$' },
                    { value: 'PERCENT', label: '%' }
                  ]}
                />
              </label>
              <label>
                Valor
                {valueModalMode === 'FIXED' || valueModalType === 'SHIPPING' ? (
                  <MoneyInput value={valueModalAmount} onChange={setValueModalAmount} />
                ) : (
                  <input
                    type="number"
                    value={valueModalAmount === 0 ? '' : valueModalAmount}
                    onChange={(e) => setValueModalAmount(Number(e.target.value || 0))}
                  />
                )}
              </label>
            </div>
            <div className="modal-actions values-modal-actions">
              <button type="button" className="ghost" onClick={() => setValueModalOpen(false)}>Cancelar</button>
              <button type="button" onClick={saveValueModal}>Salvar</button>
            </div>
          </div>
        </div>
      ) : null}

      {showCustomerPicker ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal product-picker-modal">
            <div className="product-picker-head">
              <h4>Selecionar cliente</h4>
              <div className="product-picker-head-right">
                <button type="button" className="icon-button small" onClick={() => setShowCustomerPicker(false)} aria-label="Fechar">
                  <span className="material-symbols-outlined" aria-hidden="true">close</span>
                </button>
              </div>
            </div>
            <div className="product-picker-search-row customer-picker-search-row">
              <input
                className="product-picker-search"
                type="search"
                value={customerPickerSearch}
                onChange={(e) => setCustomerPickerSearch(e.target.value)}
                placeholder="Buscar cliente..."
              />
              <button
                type="button"
                className="icon-button"
                aria-label="Novo cliente"
                onClick={() => {
                  setShowCustomerPicker(false);
                  setShowCustomerModal(true);
                }}
              >
                <span className="material-symbols-outlined" aria-hidden="true">person_add</span>
              </button>
            </div>
            <div className="product-picker-list">
              {pickerOrderedCustomers.map((customer) => {
                const selected = customer.id === customerPickerSelectedId;
                return (
                  <button
                    key={customer.id}
                    type="button"
                    className={selected ? 'product-picker-row customer-picker-row active' : 'product-picker-row customer-picker-row'}
                    onClick={() => selectCustomerFromPicker(customer.id)}
                  >
                    <div className="product-picker-main">
                      <strong>{customer.name}</strong>
                      <span className="muted">{formatPhoneBR(customer.phone)}</span>
                    </div>
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {selected ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setShowCustomerPicker(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      ) : null}

      {paymentModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <div className="modal-icon">
                <span className="material-symbols-outlined" aria-hidden="true">payments</span>
              </div>
              <div>
                <h4>{paymentModalIndex === null ? 'Adicionar pagamento' : 'Editar pagamento'}</h4>
                <p>Defina os dados do pagamento do pedido.</p>
              </div>
            </div>
            <div className="form">
              <label>
                Data
                <input type="date" value={paymentModalDate} onChange={(e) => setPaymentModalDate(e.target.value)} />
              </label>
              <label>
                Valor
                <MoneyInput value={paymentModalAmount} onChange={setPaymentModalAmount} />
              </label>
              <label>
                Observacao
                <input value={paymentModalNote} onChange={(e) => setPaymentModalNote(e.target.value)} />
              </label>
            </div>
            <div className="modal-actions values-modal-actions">
              <button type="button" className="ghost" onClick={() => setPaymentModalOpen(false)}>Cancelar</button>
              <button type="button" onClick={savePaymentModal}>Salvar</button>
            </div>
          </div>
        </div>
      ) : null}

      {showProductPicker ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal product-picker-modal">
            <div className="product-picker-head">
              <h4>Selecionar produtos</h4>
              <div className="product-picker-head-right">
                <strong className="product-picker-count">{productPickerSelectedIds.length} selecionado(s)</strong>
                <button type="button" className="icon-button small" onClick={() => setShowProductPicker(false)} aria-label="Fechar">
                  <span className="material-symbols-outlined" aria-hidden="true">close</span>
                </button>
              </div>
            </div>
            <input
              className="product-picker-search"
              type="search"
              value={productPickerSearch}
              onChange={(e) => setProductPickerSearch(e.target.value)}
              placeholder="Buscar produto..."
            />
            <div className="product-picker-list">
              {pickerSelectedProducts.map((product) => {
                const checked = productPickerSelectedIds.includes(product.id);
                return (
                  <label key={product.id} className="product-picker-row">
                    <div className="product-picker-main">
                      <strong>{product.name}</strong>
                      <span className="muted">{formatCurrency(product.unitPrice || product.salePrice || 0)}</span>
                    </div>
                    <input
                      className="pretty-checkbox"
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => toggleProductPickerItem(product.id, event.target.checked)}
                    />
                  </label>
                );
              })}
              {pickerSelectedProducts.length > 0 && pickerUnselectedProducts.length > 0 ? (
                <div className="product-picker-divider" aria-hidden="true" />
              ) : null}
              {pickerUnselectedProducts.map((product) => {
                const checked = productPickerSelectedIds.includes(product.id);
                return (
                  <label key={product.id} className="product-picker-row">
                    <div className="product-picker-main">
                      <strong>{product.name}</strong>
                      <span className="muted">{formatCurrency(product.unitPrice || product.salePrice || 0)}</span>
                    </div>
                    <input
                      className="pretty-checkbox"
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => toggleProductPickerItem(product.id, event.target.checked)}
                    />
                  </label>
                );
              })}
            </div>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setShowProductPicker(false)}>Cancelar</button>
              <button type="button" onClick={applyProductPicker}>Salvar selecao</button>
            </div>
          </div>
        </div>
      ) : null}

      {pdfPreviewHtml ? (
        <div className="tasks-modal-backdrop" role="dialog" aria-modal="true">
          <div className="tasks-modal">
            <div className="tasks-modal-head">
              <h4>Pre-visualizacao do PDF</h4>
              <button type="button" className="icon-button small" onClick={() => setPdfPreviewHtml(null)} aria-label="Fechar">
                <span className="material-symbols-outlined" aria-hidden="true">close</span>
              </button>
            </div>
            <div className="tasks-modal-content">
              <iframe ref={pdfPreviewRef} title="PDF preview" srcDoc={pdfPreviewHtml} className="pdf-preview-frame" />
            </div>
            <div className="modal-actions">
              <button type="button" onClick={handlePrintPdfPreview}>Imprimir / Salvar PDF</button>
              <button type="button" className="ghost" onClick={() => setPdfPreviewHtml(null)}>Fechar</button>
            </div>
          </div>
        </div>
      ) : null}

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
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Excluir pedido?"
        message={`Deseja realmente excluir o pedido de "${deleteTarget?.customerSnapshot?.name ?? 'Sem cliente'}"?`}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteOrder}
      />
      <LoadingOverlay open={saving || deleting} label={deleting ? 'Excluindo pedido...' : 'Salvando pedido...'} />
    </div>
  );
};
