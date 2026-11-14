export const calcOrderTotal = (row: any) => {
    const products = Array.isArray(row.products) ? row.products : [];
    const additions = Array.isArray(row.additions) ? row.additions : [];
    const productsTotal = products.reduce(
      (sum: number, item: any) => sum + Number(item?.unitPrice ?? 0) * Number(item?.quantity ?? 0),
      0
    );
    const additionsTotal = additions.reduce((sum: number, item: any) => {
      if (item?.mode === 'FIXED') return sum + Number(item?.value ?? 0);
      return sum + (productsTotal * Number(item?.value ?? 0)) / 100;
    }, 0);
    const discountMode = row.discount_mode ?? 'FIXED';
    const discountValue = Number(row.discount_value ?? 0);
    const discountTotal = discountMode === 'PERCENT'
      ? ((productsTotal + additionsTotal) * discountValue) / 100
      : discountValue;
    return productsTotal + additionsTotal - discountTotal + Number(row.shipping_value ?? 0);
  };
