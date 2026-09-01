import { ListSkeleton } from './ListSkeleton.tsx';
import { InfiniteScrollSentinel } from './InfiniteScrollSentinel.tsx';
import type { ReactNode } from 'react';

type CatalogListItem = {
  id: string;
  name: string;
  subtitle: string;
  tags?: string[];
  badge?: string;
};

type CatalogListPanelProps<T extends CatalogListItem> = {
  className?: string;
  title: string;
  eyebrow: string;
  description: string;
  icon: string;
  singularLabel: string;
  actionLabel: string;
  search: string;
  loading: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  items: T[];
  filtersSlot?: ReactNode;
  onSearch: (value: string) => void;
  onNew: () => void;
  onOpen: (item: T) => void;
  onDuplicate: (item: T) => void;
  onDelete: (item: T) => void;
  onLoadMore?: () => void;
};

export const CatalogListPanel = <T extends CatalogListItem>({ className, title, eyebrow, description, icon, singularLabel, actionLabel, search, loading, hasMore = false, loadingMore = false, items, filtersSlot, onSearch, onNew, onOpen, onDuplicate, onDelete, onLoadMore }: CatalogListPanelProps<T>) => (
  <section className={`catalog-board ${className ?? ''}`}>
    <header className="catalog-board-header">
      <div><span>{eyebrow}</span><h1>{title}</h1><small>{description}</small></div>
      <button type="button" className="catalog-new-button" onClick={onNew}><span className="material-symbols-outlined" aria-hidden="true">add</span>{actionLabel}</button>
    </header>
    <div className="catalog-board-search"><span className="material-symbols-outlined" aria-hidden="true">search</span><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder={`Buscar ${singularLabel}`} aria-label={`Buscar ${singularLabel}`} />{search ? <button type="button" onClick={() => onSearch('')} aria-label="Limpar busca"><span className="material-symbols-outlined" aria-hidden="true">close</span></button> : null}</div>
    {filtersSlot ? <div className="catalog-board-filters">{filtersSlot}</div> : null}
    {loading ? <div className="catalog-loading"><ListSkeleton /></div> : null}
    {!loading && items.length === 0 ? <div className="catalog-empty-state"><span className="material-symbols-outlined" aria-hidden="true">{icon}</span><div><strong>Nenhum {singularLabel} encontrado</strong><small>Crie o primeiro cadastro para começar.</small></div><button type="button" onClick={onNew}>Criar {singularLabel}</button></div> : null}
    {!loading && items.length > 0 ? <><div className="catalog-card-list">{items.map((item) => <article key={item.id} className="catalog-board-card" role="button" tabIndex={0} onClick={() => onOpen(item)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(item); } }}><div className="catalog-board-icon"><span className="material-symbols-outlined" aria-hidden="true">{icon}</span></div><div className="catalog-board-card-main"><strong>{item.name}</strong><span>{item.subtitle}</span>{item.tags?.length ? <div className="catalog-tag-list">{item.tags.slice(0, 3).map((tag) => <small key={tag}>{tag}</small>)}</div> : null}</div>{item.badge ? <div className="catalog-board-card-side">{item.badge}</div> : null}<div className="catalog-board-card-actions"><button type="button" className="icon-button tiny" onClick={(event) => { event.stopPropagation(); onDuplicate(item); }} aria-label={`Duplicar ${item.name}`}><span className="material-symbols-outlined" aria-hidden="true">content_copy</span></button><button type="button" className="icon-button tiny catalog-delete-button" onClick={(event) => { event.stopPropagation(); onDelete(item); }} aria-label={`Excluir ${item.name}`}><span className="material-symbols-outlined" aria-hidden="true">delete_outline</span></button></div></article>)}</div>{onLoadMore ? <InfiniteScrollSentinel hasMore={hasMore} loading={loadingMore} onVisible={onLoadMore} /> : null}</> : null}
  </section>
);
