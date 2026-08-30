import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { formatPhoneBR } from './order-formatters.ts';
import type { OrderFormState } from './order-form.ts';
import type { CustomerItem, ProductItem } from './order-types.ts';

type UseOrderPickersParams = {
  form: OrderFormState;
  setForm: Dispatch<SetStateAction<OrderFormState>>;
  products: ProductItem[];
  customers: CustomerItem[];
};

export const useOrderPickers = ({ form, setForm, products, customers }: UseOrderPickersParams) => {
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');

  const filteredProducts = useMemo(() => {
    const needle = productSearch.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((item) => item.name.toLowerCase().includes(needle));
  }, [productSearch, products]);

  const selectedProducts = useMemo(
    () =>
      selectedProductIds
        .map((id) => products.find((item) => item.id === id))
        .filter((item): item is ProductItem => Boolean(item)),
    [products, selectedProductIds]
  );

  const unselectedProducts = useMemo(
    () => filteredProducts.filter((item) => !selectedProductIds.includes(item.id)),
    [filteredProducts, selectedProductIds]
  );

  const filteredCustomers = useMemo(() => {
    const needle = customerSearch.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter((item) => {
      const phone = formatPhoneBR(item.phone).toLowerCase();
      return item.name.toLowerCase().includes(needle) || phone.includes(needle);
    });
  }, [customerSearch, customers]);

  const orderedCustomers = useMemo(() => {
    if (!selectedCustomerId) return filteredCustomers;
    const selected = filteredCustomers.find((item) => item.id === selectedCustomerId);
    if (!selected) return filteredCustomers;
    return [selected, ...filteredCustomers.filter((item) => item.id !== selectedCustomerId)];
  }, [filteredCustomers, selectedCustomerId]);

  const openProductPicker = () => {
    setSelectedProductIds(
      form.products
        .map((item) => item.productId)
        .filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index)
    );
    setProductSearch('');
    setShowProductPicker(true);
  };

  const toggleProduct = (productId: string, checked: boolean) => {
    setSelectedProductIds((current) => {
      if (checked) return current.includes(productId) ? current : [...current, productId];
      return current.filter((id) => id !== productId);
    });
  };

  const applyProducts = () => {
    const existingByProductId = new Map(
      form.products
        .filter((item) => item.productId)
        .map((item) => [item.productId, item] as const)
    );
    const nextProducts = selectedProductIds
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
      .filter((item): item is OrderFormState['products'][number] => Boolean(item));

    setForm((current) => ({ ...current, products: nextProducts }));
    setShowProductPicker(false);
  };

  const openCustomerPicker = () => {
    setSelectedCustomerId(form.customerId || '');
    setCustomerSearch('');
    setShowCustomerPicker(true);
  };

  const selectCustomer = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setForm((current) => ({ ...current, customerId }));
    setShowCustomerPicker(false);
  };

  return {
    productPicker: {
      open: showProductPicker,
      search: productSearch,
      selectedIds: selectedProductIds,
      selectedProducts,
      unselectedProducts,
      setSearch: setProductSearch,
      show: openProductPicker,
      close: () => setShowProductPicker(false),
      toggle: toggleProduct,
      apply: applyProducts
    },
    customerPicker: {
      open: showCustomerPicker,
      search: customerSearch,
      selectedId: selectedCustomerId,
      customers: orderedCustomers,
      setSearch: setCustomerSearch,
      setSelectedId: setSelectedCustomerId,
      show: openCustomerPicker,
      close: () => setShowCustomerPicker(false),
      select: selectCustomer
    }
  };
};
