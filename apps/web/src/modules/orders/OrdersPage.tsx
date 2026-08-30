import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';
import { apiFetch } from '../shared/api.ts';
import { normalizeDateKey, toDateKey } from '../shared/date.ts';
import { ConfirmDialog } from '../shared/ConfirmDialog.tsx';
import { LoadingOverlay } from '../shared/LoadingOverlay.tsx';
import { fetchWithCache, invalidateQueryCache, prefetchWithCache, useCachedQuery } from '../shared/queryCache.ts';
import { queryKeys } from '../shared/queryKeys.ts';
import { orderTabs } from './order-tabs.ts';
import { buildOrderPdfHtml } from './order-pdf.ts';
import { calculateOrderTotals } from './order-totals.ts';
import { OrderTotalsSummary } from './OrderTotalsSummary.tsx';
import { OrderValuesSection } from './OrderValuesSection.tsx';
import { OrderProductsSection } from './OrderProductsSection.tsx';
import { OrderPaymentsSection } from './OrderPaymentsSection.tsx';
import { OrderPaymentModal } from './OrderPaymentModal.tsx';
import { OrderCustomerSection } from './OrderCustomerSection.tsx';
import { OrderCustomerPicker } from './OrderCustomerPicker.tsx';
import { OrderCustomerModal } from './OrderCustomerModal.tsx';
import { formatPhoneBR, onlyDigits } from './order-formatters.ts';
import { readOrderImages } from './order-images.ts';
import { OrderNotesSection } from './OrderNotesSection.tsx';
import { OrderImagesSection } from './OrderImagesSection.tsx';
import { OrderAlertsSection } from './OrderAlertsSection.tsx';
import { OrdersListPanel } from './OrdersListPanel.tsx';
import { OrderProductEditModal } from './OrderProductEditModal.tsx';
import { OrderValueModal } from './OrderValueModal.tsx';
import { OrderProductPicker } from './OrderProductPicker.tsx';
import type {
  CompanySettings,
  CustomerForm,
  CustomerItem,
  OrderItem,
  OrderListItem,
  OrderStatus,
  OrderStatusFilter,
  ProductItem,
  ValueConfigType
} from './order-types.ts';

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
  deliveryAddress: '',
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
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('OPEN');
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
  const pdfPreviewRef = useRef<HTMLIFrameElement | null>(null);
  const [customerForm, setCustomerForm] = useState<CustomerForm>({
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

  useEffect(() => {
    if (!isCreateView || !settingsQuery.data) return;
    setForm((current) => {
      const shouldHydrateDefaults =
        !current.customerId &&
        current.products.length === 0 &&
        current.additions.length === 0 &&
        current.payments.length === 0 &&
        current.notesDelivery === '' &&
        current.notesGeneral === '' &&
        current.notesPayment === '';

      if (!shouldHydrateDefaults) return current;

      return {
        ...current,
        notesDelivery: settingsQuery.data.defaultNotesDelivery ?? '',
        notesGeneral: settingsQuery.data.defaultNotesGeneral ?? '',
        notesPayment: settingsQuery.data.defaultNotesPayment ?? ''
      };
    });
  }, [isCreateView, settingsQuery.data]);

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
      customerId: selectedOrder.customerId ?? '',
      deliveryAddress: selectedOrder.deliveryAddress ?? ''
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
      if (statusFilter === 'OPEN' && (order.status === 'CONCLUIDO' || order.status === 'CANCELADO')) return false;
      if (statusFilter !== 'OPEN' && order.status !== statusFilter) return false;
      if (!currentWeekOnly) return true;
      const deliveryDate = normalizeDateKey(order.deliveryDate);
      return Boolean(deliveryDate && deliveryDate >= currentWeekRange.start && deliveryDate <= currentWeekRange.end);
    });
  }, [orders, search, statusFilter, currentWeekOnly, currentWeekRange]);
  const activeTabIndex = orderTabs.findIndex((item) => item.key === tab);

  const totals = useMemo(() => calculateOrderTotals(form), [form]);

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
        deliveryAddress: form.deliveryType === 'ENTREGA' ? form.deliveryAddress.trim() || undefined : undefined,
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
    if (!paymentModalDate || !Number.isFinite(paymentModalAmount) || paymentModalAmount <= 0) return;
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
    try {
      const uploaded = await readOrderImages(files);
      if (!uploaded.length) return;
      setForm((prev) => ({ ...prev, images: [...prev.images, ...uploaded] }));
    } catch {
      setSubmitError('Nao foi possivel ler uma das imagens selecionadas.');
    }
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

  const handleGeneratePdf = async (orderIdToPrint: string) => {
    const order = await fetchWithCache<OrderItem>(
      `order-detail:${orderIdToPrint}`,
      () => apiFetch<OrderItem>(`/orders/${orderIdToPrint}`, { token: user?.token }),
      { staleTime: 60_000 }
    );
    setPdfPreviewHtml(buildOrderPdfHtml(order, settingsQuery.data));
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

  const updateProductQuantity = (index: number, rawValue: string) => {
    setForm((prev) => {
      const next = [...prev.products];
      const quantity = rawValue === '' ? 0 : Number(rawValue);
      next[index] = { ...next[index], quantity: Number.isFinite(quantity) ? quantity : 0 };
      return { ...prev, products: next };
    });
  };
  const normalizeProductQuantity = (index: number) => {
    setForm((prev) => {
      const next = [...prev.products];
      const current = next[index];
      if (!current) return prev;
      if (current.quantity > 0) return prev;
      next[index] = { ...current, quantity: 1 };
      return { ...prev, products: next };
    });
  };
  return (
    <div className="page">
      {!isFormRoute ? (
        <OrdersListPanel
          orders={filtered}
          search={search}
          statusFilter={statusFilter}
          currentWeekOnly={currentWeekOnly}
          loading={ordersQuery.loading && orders.length === 0}
          refreshing={ordersQuery.isFetching}
          onSearch={setSearch}
          onNew={handleNew}
          onStatusFilter={setStatusFilter}
          onToggleWeek={() => setCurrentWeekOnly((current) => !current)}
          onOpen={(id) => navigate(`/app/pedidos/${id}`)}
          onPdf={(id) => void handleGeneratePdf(id)}
          onDelete={setDeleteTarget}
        />
      ) : null}

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
                <span className="tab-icon-label">{item.label}</span>
              </button>
            ))}
          </div>

          <form className="form" onSubmit={handleSubmit}>
            {tab === 'pessoa' && (
              <OrderCustomerSection
                order={form}
                customer={selectedCustomer}
                onOpenCustomer={openCustomerPicker}
                onChange={(field, value) => setForm((current) => ({ ...current, [field]: value }))}
              />
            )}

            {tab === 'produtos' && (
              <>
                <OrderProductsSection
                  products={form.products}
                  onAdd={openProductPicker}
                  onEdit={openProductEditModal}
                  onRemove={(index) => setForm((current) => ({
                    ...current,
                    products: current.products.filter((_, itemIndex) => itemIndex !== index)
                  }))}
                  onQuantityChange={updateProductQuantity}
                  onQuantityBlur={normalizeProductQuantity}
                />
                <OrderValuesSection
                  additions={form.additions}
                  discountMode={form.discountMode}
                  discountValue={form.discountValue}
                  shippingValue={form.shippingValue}
                  menuOpen={showValueTypeMenu}
                  onToggleMenu={() => setShowValueTypeMenu((current) => !current)}
                  onOpenValue={openValueModal}
                  onRemoveAddition={(index) => setForm((current) => ({
                    ...current,
                    additions: current.additions.filter((_, itemIndex) => itemIndex !== index)
                  }))}
                  onRemoveDiscount={removeDiscountValue}
                  onRemoveShipping={removeShippingValue}
                />
                <OrderTotalsSummary
                  totals={totals}
                  additionsCount={form.additions.length}
                  discountValue={form.discountValue}
                  shippingValue={form.shippingValue}
                />
              </>
            )}

            {tab === 'observacoes' && (
              <OrderNotesSection
                order={form}
                onChange={(field, value) => setForm((current) => ({ ...current, [field]: value }))}
              />
            )}

           {tab === 'pagamentos' && (
              <OrderPaymentsSection
                payments={form.payments}
                totals={totals}
                onAdd={() => openPaymentModal()}
                onEdit={openPaymentModal}
                onRemove={(index) => setForm((current) => ({
                  ...current,
                  payments: current.payments.filter((_, itemIndex) => itemIndex !== index)
                }))}
              />
            )}

            {tab === 'imagens' && (
              <OrderImagesSection
                images={form.images}
                onSelect={(files) => void handleUploadImages(files)}
                onRemove={(index) => setForm((current) => ({
                  ...current,
                  images: current.images.filter((_, itemIndex) => itemIndex !== index)
                }))}
              />
            )}

            {tab === 'alertas' && (
              <OrderAlertsSection
                alerts={form.alerts}
                onToggle={(index, enabled) => setForm((current) => {
                  const alerts = [...current.alerts];
                  alerts[index] = { ...alerts[index], enabled };
                  return { ...current, alerts };
                })}
              />
            )}

            <div className="actions">
              <button type="button" className="ghost" onClick={() => (isFormRoute ? navigate('/app/pedidos') : setShowForm(false))}>Cancelar</button>
              <button type="submit">{editingId ? 'Salvar alteracoes' : 'Salvar pedido'}</button>
            </div>
            {submitError && <div className="error">{submitError}</div>}
          </form>
        </div>
      )}

      {editProductIndex !== null ? (
        <OrderProductEditModal name={editProductName} unitPrice={editProductUnitPrice} onNameChange={setEditProductName} onPriceChange={setEditProductUnitPrice} onCancel={() => setEditProductIndex(null)} onSave={applyProductEditModal} />
      ) : null}
      {showCustomerModal ? (
        <OrderCustomerModal
          form={customerForm}
          onChange={setCustomerForm}
          onCancel={() => setShowCustomerModal(false)}
          onSubmit={handleCreateCustomer}
        />
      ) : null}

      {valueModalOpen ? (
        <OrderValueModal type={valueModalType} label={valueModalLabel} mode={valueModalMode} amount={valueModalAmount} onLabelChange={setValueModalLabel} onModeChange={setValueModalMode} onAmountChange={setValueModalAmount} onCancel={() => setValueModalOpen(false)} onSave={saveValueModal} />
      ) : null}
      {showCustomerPicker ? (
        <OrderCustomerPicker
          customers={pickerOrderedCustomers}
          selectedId={customerPickerSelectedId}
          search={customerPickerSearch}
          onSearch={setCustomerPickerSearch}
          onSelect={selectCustomerFromPicker}
          onNew={() => {
            setShowCustomerPicker(false);
            setShowCustomerModal(true);
          }}
          onClose={() => setShowCustomerPicker(false)}
        />
      ) : null}

     {paymentModalOpen ? (
        <OrderPaymentModal
          editing={paymentModalIndex !== null}
          date={paymentModalDate}
          amount={paymentModalAmount}
          note={paymentModalNote}
          onDateChange={setPaymentModalDate}
          onAmountChange={setPaymentModalAmount}
          onNoteChange={setPaymentModalNote}
          onCancel={() => setPaymentModalOpen(false)}
          onSave={savePaymentModal}
        />
      ) : null}

      {showProductPicker ? (
        <OrderProductPicker selectedProducts={pickerSelectedProducts} unselectedProducts={pickerUnselectedProducts} selectedIds={productPickerSelectedIds} search={productPickerSearch} onSearch={setProductPickerSearch} onToggle={toggleProductPickerItem} onCancel={() => setShowProductPicker(false)} onSave={applyProductPicker} />
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
