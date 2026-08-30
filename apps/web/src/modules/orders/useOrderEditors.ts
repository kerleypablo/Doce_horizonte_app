import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { OrderFormState } from './order-form.ts';
import type { ValueConfigType } from './order-types.ts';

export const useOrderEditors = (form: OrderFormState, setForm: Dispatch<SetStateAction<OrderFormState>>) => {
  const [editProductIndex, setEditProductIndex] = useState<number | null>(null);
  const [editProductName, setEditProductName] = useState('');
  const [editProductUnitPrice, setEditProductUnitPrice] = useState(0);
  const openProductEditModal = (index: number) => {
    const item = form.products[index];
    if (!item) return;
    setEditProductIndex(index); setEditProductName(item.name); setEditProductUnitPrice(item.unitPrice);
  };
  const applyProductEditModal = () => {
    if (editProductIndex === null) return;
    setForm((current) => {
      const products = [...current.products];
      products[editProductIndex] = { ...products[editProductIndex], name: editProductName, unitPrice: editProductUnitPrice };
      return { ...current, products };
    });
    setEditProductIndex(null);
  };

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentModalIndex, setPaymentModalIndex] = useState<number | null>(null);
  const [paymentModalDate, setPaymentModalDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentModalAmount, setPaymentModalAmount] = useState(0);
  const [paymentModalNote, setPaymentModalNote] = useState('');
  const openPaymentModal = (index?: number) => {
    const current = typeof index === 'number' ? form.payments[index] : undefined;
    setPaymentModalIndex(current ? index! : null);
    setPaymentModalDate(current?.date ?? new Date().toISOString().slice(0, 10));
    setPaymentModalAmount(current?.amount ?? 0);
    setPaymentModalNote(current?.note ?? '');
    setPaymentModalOpen(true);
  };
  const savePaymentModal = () => {
    if (!paymentModalDate || !Number.isFinite(paymentModalAmount) || paymentModalAmount <= 0) return;
    const payment = { date: paymentModalDate, amount: paymentModalAmount, note: paymentModalNote };
    setForm((current) => {
      const payments = [...current.payments];
      if (paymentModalIndex === null) payments.push(payment); else payments[paymentModalIndex] = payment;
      return { ...current, payments };
    });
    setPaymentModalOpen(false);
  };

  const [showValueTypeMenu, setShowValueTypeMenu] = useState(false);
  const [valueModalOpen, setValueModalOpen] = useState(false);
  const [valueModalType, setValueModalType] = useState<ValueConfigType>('ADDITION');
  const [valueModalAdditionIndex, setValueModalAdditionIndex] = useState<number | null>(null);
  const [valueModalLabel, setValueModalLabel] = useState('');
  const [valueModalMode, setValueModalMode] = useState<'PERCENT' | 'FIXED'>('FIXED');
  const [valueModalAmount, setValueModalAmount] = useState(0);
  const openValueModal = (type: ValueConfigType, additionIndex?: number) => {
    setShowValueTypeMenu(false); setValueModalType(type); setValueModalAdditionIndex(null);
    if (type === 'ADDITION') {
      const current = typeof additionIndex === 'number' ? form.additions[additionIndex] : undefined;
      setValueModalAdditionIndex(current ? additionIndex! : null); setValueModalLabel(current?.label ?? 'Adicional'); setValueModalMode(current?.mode ?? 'FIXED'); setValueModalAmount(current?.value ?? 0);
    } else if (type === 'DISCOUNT') {
      setValueModalLabel('Desconto'); setValueModalMode(form.discountMode); setValueModalAmount(form.discountValue);
    } else {
      setValueModalLabel('Frete'); setValueModalMode('FIXED'); setValueModalAmount(form.shippingValue);
    }
    setValueModalOpen(true);
  };
  const saveValueModal = () => {
    if (valueModalType === 'ADDITION') {
      if (!valueModalLabel.trim()) return;
      setForm((current) => {
        const additions = [...current.additions];
        const addition = { label: valueModalLabel.trim(), mode: valueModalMode, value: valueModalAmount };
        if (valueModalAdditionIndex === null) additions.push(addition); else additions[valueModalAdditionIndex] = addition;
        return { ...current, additions };
      });
    } else if (valueModalType === 'DISCOUNT') setForm((current) => ({ ...current, discountMode: valueModalMode, discountValue: valueModalAmount }));
    else setForm((current) => ({ ...current, shippingValue: valueModalAmount }));
    setValueModalOpen(false);
  };
  const removeDiscountValue = () => setForm((current) => ({ ...current, discountValue: 0 }));
  const removeShippingValue = () => setForm((current) => ({ ...current, shippingValue: 0 }));

  return {
    product: { editProductIndex, editProductName, editProductUnitPrice, setEditProductName, setEditProductUnitPrice, setEditProductIndex, openProductEditModal, applyProductEditModal },
    payment: { paymentModalOpen, paymentModalIndex, paymentModalDate, paymentModalAmount, paymentModalNote, setPaymentModalOpen, setPaymentModalDate, setPaymentModalAmount, setPaymentModalNote, openPaymentModal, savePaymentModal },
    value: { showValueTypeMenu, valueModalOpen, valueModalType, valueModalLabel, valueModalMode, valueModalAmount, setShowValueTypeMenu, setValueModalOpen, setValueModalLabel, setValueModalMode, setValueModalAmount, openValueModal, saveValueModal, removeDiscountValue, removeShippingValue }
  };
};
