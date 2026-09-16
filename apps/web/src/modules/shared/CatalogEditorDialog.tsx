import { useEffect, useRef } from 'react';
import { InputsPage } from '../inputs/InputsPage.tsx';
import { RecipesPage } from '../recipes/RecipesPage.tsx';
import { ProductsPage } from '../products/ProductsPage.tsx';
import { createPortal } from 'react-dom';
import './catalog-editor-dialog.css';

export type CatalogEditorOptions = {
  id?: string;
  category?: 'producao' | 'embalagem' | 'outros';
  onSaved: (id: string) => void | Promise<void>;
  onClose: () => void;
};
export type CatalogEditorTarget = {
  kind: 'input' | 'recipe' | 'product';
  id?: string;
  category?: CatalogEditorOptions['category'];
};


export function CatalogEditorDialog({ target, onSaved, onClose }: {
  target: CatalogEditorTarget;
  onSaved: (id: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    element.showModal();
    return () => {
      element.close();
      previousFocus?.focus();
    };
  }, []);
  const editor: CatalogEditorOptions = { ...target, onSaved, onClose };
  const title = `${target.id ? 'Editar' : 'Cadastrar'} ${target.kind === 'input' ? 'insumo' : target.kind === 'recipe' ? 'receita' : 'produto'}`;
  return createPortal(
    <dialog ref={dialog} className="catalog-editor-dialog" aria-label={title}
      onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }}
      onSubmit={(event) => event.stopPropagation()}>
      <div className="catalog-editor-dialog-header">
        <div><strong>{title}</strong><p>Ao finalizar, você volta ao cadastro que estava preenchendo.</p></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar cadastro"><span className="material-symbols-outlined" aria-hidden="true">close</span></button>
      </div>
      <div className="catalog-editor-dialog-content">
        {target.kind === 'input' ? <InputsPage editor={editor} /> : target.kind === 'recipe' ? <RecipesPage editor={editor} /> : <ProductsPage editor={editor} />}
      </div>
    </dialog>, document.body
  );
}

export function EditCatalogItem({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="catalog-item-edit" onClick={onClick} aria-label={label} title={label}>
    <span className="material-symbols-outlined" aria-hidden="true">edit</span>
  </button>;
}

export function CatalogItemName({ name, editLabel, onEdit }: { name: string; editLabel: string; onEdit: () => void }) {
  return <span className="catalog-item-name">
    <span className="catalog-item-name-text" title={name}>{name}</span>
    <EditCatalogItem label={editLabel} onClick={onEdit} />
  </span>;
}
