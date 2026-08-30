import { ListSkeleton } from '../shared/ListSkeleton.tsx';
import type { RecipeItem } from './recipe-types.ts';

type RecipesListPanelProps = {
  recipes: RecipeItem[];
  search: string;
  loading: boolean;
  onSearch: (value: string) => void;
  onNew: () => void;
  onOpen: (id: string) => void;
  onDuplicate: (recipe: RecipeItem) => void;
  onDelete: (recipe: RecipeItem) => void;
};

export const RecipesListPanel = ({ recipes, search, loading, onSearch, onNew, onOpen, onDuplicate, onDelete }: RecipesListPanelProps) => (
  <section className="recipes-board">
    <header className="recipes-board-header">
      <div>
        <span>Produção</span>
        <h1>Receitas</h1>
        <small>Monte fichas técnicas e acompanhe o rendimento de cada preparo.</small>
      </div>
      <button type="button" className="recipes-new-button" onClick={onNew}>
        <span className="material-symbols-outlined" aria-hidden="true">add</span>
        Nova receita
      </button>
    </header>

    <div className="recipes-board-search">
      <span className="material-symbols-outlined" aria-hidden="true">search</span>
      <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Buscar receita" aria-label="Buscar receita" />
      {search ? <button type="button" onClick={() => onSearch('')} aria-label="Limpar busca"><span className="material-symbols-outlined" aria-hidden="true">close</span></button> : null}
    </div>

    {loading ? <div className="recipes-loading"><ListSkeleton /></div> : null}
    {!loading && recipes.length === 0 ? (
      <div className="recipes-empty-state">
        <span className="material-symbols-outlined" aria-hidden="true">menu_book</span>
        <div><strong>Nenhuma receita encontrada</strong><small>Crie sua primeira ficha técnica para começar.</small></div>
        <button type="button" onClick={onNew}>Criar receita</button>
      </div>
    ) : null}
    {!loading && recipes.length > 0 ? (
      <div className="recipes-card-list">
        {recipes.map((recipe) => (
          <article key={recipe.id} className="recipes-board-card" role="button" tabIndex={0} onClick={() => onOpen(recipe.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(recipe.id); } }}>
            <div className="recipes-board-icon"><span className="material-symbols-outlined" aria-hidden="true">menu_book</span></div>
            <div className="recipes-board-card-main">
              <strong>{recipe.name}</strong>
              <span>{recipe.prepTimeMinutes || 0} min de preparo · rende {recipe.yield} {recipe.yieldUnit}</span>
              {recipe.tags?.length ? <div className="recipes-tag-list">{recipe.tags.slice(0, 3).map((tag) => <small key={tag}>{tag}</small>)}</div> : null}
            </div>
            <div className="recipes-board-card-side"><strong>{recipe.ingredients?.length ?? 0}</strong><span>insumos</span></div>
            <div className="recipes-board-card-actions">
              <button type="button" className="icon-button tiny" onClick={(event) => { event.stopPropagation(); onDuplicate(recipe); }} aria-label={`Duplicar ${recipe.name}`}><span className="material-symbols-outlined" aria-hidden="true">content_copy</span></button>
              <button type="button" className="icon-button tiny recipes-delete-button" onClick={(event) => { event.stopPropagation(); onDelete(recipe); }} aria-label={`Excluir ${recipe.name}`}><span className="material-symbols-outlined" aria-hidden="true">delete_outline</span></button>
            </div>
          </article>
        ))}
      </div>
    ) : null}
  </section>
);
