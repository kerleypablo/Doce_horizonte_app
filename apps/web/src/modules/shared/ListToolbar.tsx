import { ReactNode } from 'react';

type ListToolbarProps = {
  title: string;
  searchValue: string;
  onSearch: (value: string) => void;
  actionLabel: string;
  onAction: () => void;
  actionIcon?: ReactNode;
};

export const ListToolbar = ({
  title,
  searchValue,
  onSearch,
  actionLabel,
  onAction,
  actionIcon
}: ListToolbarProps) => {
  return (
    <div className="list-toolbar">
      <div>
        <h3>{title}</h3>
        <p>Gerencie e encontre itens rapidamente.</p>
      </div>
      <div className="list-toolbar-actions">
        <input
          className="search"
          placeholder="Buscar..."
          value={searchValue}
          onChange={(event) => onSearch(event.target.value)}
        />
        <button type="button" onClick={onAction}>
          {actionIcon}
          <span>{actionLabel}</span>
        </button>
      </div>
    </div>
  );
};
