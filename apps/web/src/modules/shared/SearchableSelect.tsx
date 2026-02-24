import { useEffect, useMemo, useRef, useState } from 'react';
import type { SelectOption } from './SelectField.tsx';

const normalize = (value: string) => value.toLowerCase().trim();

export const SearchableSelect = ({
  value,
  onChange,
  options,
  placeholder = 'Selecione',
  disabled
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const sorted = useMemo(
    () => [...options].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
    [options]
  );

  const filtered = useMemo(() => {
    if (!query) return sorted;
    return sorted.filter((opt) => normalize(opt.label).includes(normalize(query)));
  }, [query, sorted]);

  const selected = options.find((opt) => opt.value === value);

  useEffect(() => {
    setQuery(selected?.label ?? '');
  }, [selected?.label]);

  useEffect(() => {
    const handler = (event: PointerEvent) => {
      if (!ref.current) return;
      if (ref.current.contains(event.target as Node)) return;
      setOpen(false);
    };

    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, []);

  return (
    <div className={`select-field searchable ${open ? 'open' : ''}`} ref={ref}>
      <div className="select-trigger">
        <input
          ref={inputRef}
          className="select-search"
          placeholder={placeholder}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => !disabled && setOpen(true)}
          disabled={disabled}
        />
        <button
          type="button"
          className="select-icon"
          onClick={() => !disabled && setOpen((prev) => !prev)}
          aria-label="Abrir"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
      {open && (
        <div className="select-menu" role="listbox">
          {filtered.length === 0 && <div className="select-empty">Nenhuma opcao</div>}
          {filtered.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`select-option ${option.value === value ? 'active' : ''}`}
              onPointerDown={(event) => {
                event.preventDefault();
                onChange(option.value);
                setQuery(option.label);
                setOpen(false);
                inputRef.current?.blur();
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
