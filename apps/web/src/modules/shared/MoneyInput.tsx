import { useEffect, useMemo, useState } from 'react';

type MoneyInputProps = {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  placeholder?: string;
  min?: number;
  disabled?: boolean;
};

const formatBRL = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
};

const parseDigitsToNumber = (digits: string) => {
  if (!digits) return 0;
  const intValue = Number(digits);
  return intValue / 100;
};

export const MoneyInput = ({ value, onChange, placeholder, min = 0, disabled }: MoneyInputProps) => {
  const [text, setText] = useState(() => (value === 0 ? '' : formatBRL(value)));

  const formatted = useMemo(() => (value === 0 ? '' : formatBRL(value)), [value]);

  useEffect(() => {
    setText(formatted);
  }, [formatted]);

  return (
    <input
      inputMode="numeric"
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, '');
        if (!digits) {
          onChange(min);
          setText('');
          return;
        }
        const nextValue = Math.max(parseDigitsToNumber(digits), min);
        onChange(nextValue);
        setText(formatBRL(nextValue));
      }}
    />
  );
};
