import type { ReactNode } from 'react';
import { ListSkeleton } from './ListSkeleton.tsx';
import { ListToolbar } from './ListToolbar.tsx';

type EntityListPanelProps = {
  title: string;
  searchValue: string;
  onSearch: (value: string) => void;
  actionLabel: string;
  onAction: () => void;
  loading: boolean;
  isEmpty: boolean;
  withTableHead?: boolean;
  filtersSlot?: ReactNode;
  children: ReactNode;
};

export const EntityListPanel = ({
  title,
  searchValue,
  onSearch,
  actionLabel,
  onAction,
  loading,
  isEmpty,
  withTableHead = false,
  filtersSlot,
  children
}: EntityListPanelProps) => (
  <div className="panel">
    <ListToolbar
      title={title}
      searchValue={searchValue}
      onSearch={onSearch}
      actionLabel={actionLabel}
      onAction={onAction}
    />
    {filtersSlot}
    {loading && isEmpty ? <ListSkeleton withTableHead={withTableHead} /> : children}
  </div>
);
