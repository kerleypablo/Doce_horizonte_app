import { useEffect, useRef, useState } from 'react';

export type SelectOption = {
  value: string;
  label: string;
};

type SelectFieldProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export const SelectField = ({ value, onChange, options, placeholder, disabled, className }: SelectFieldProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    const handler = (event: PointerEvent) => {
      if (!ref.current) return;
      if (ref.current.contains(event.target as Node)) return;
      setOpen(false);
    };

    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      setOpen(false);
    }
  }, [value]);

  return (
    <div className={`select-field ${open ? 'open' : ''} ${className ?? ''}`} ref={ref}>
      <button
        type="button"
        className="select-trigger"
        onClick={() => !disabled && setOpen((prev) => !prev)}
        disabled={disabled}
      >
        <span>{selected?.label ?? placeholder ?? 'Selecione'}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="select-menu" role="listbox">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`select-option ${option.value === value ? 'active' : ''}`}
              onPointerDown={(event) => {
                event.preventDefault();
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
