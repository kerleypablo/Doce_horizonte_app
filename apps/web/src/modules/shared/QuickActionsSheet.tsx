import { useEffect } from 'react';
import { Link } from 'react-router-dom';

const actions = [
  { path: '/app/pedidos/novo', label: 'Novo pedido', icon: 'receipt_long' },
  { path: '/app/receitas/novo', label: 'Nova receita', icon: 'menu_book' },
  { path: '/app/produtos/novo', label: 'Novo produto', icon: 'shopping_bag' },
  { path: '/app/insumos/novo', label: 'Novo insumo', icon: 'inventory_2' },
  { path: '/app/clientes/novo', label: 'Novo cliente', icon: 'person_add' }
];

type QuickActionsSheetProps = {
  open: boolean;
  onClose: () => void;
};

export const QuickActionsSheet = ({ open, onClose }: QuickActionsSheetProps) => {
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="quick-actions-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="quick-actions-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-actions-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="quick-actions-handle" aria-hidden="true" />
        <div className="quick-actions-header">
          <div>
            <span>Acesso rápido</span>
            <h3 id="quick-actions-title">O que você quer criar?</h3>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar ações rápidas">
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>
        <div className="quick-actions-grid">
          {actions.map((action) => (
            <Link key={action.path} to={action.path} className="quick-action-card" onClick={onClose}>
              <span className="material-symbols-outlined" aria-hidden="true">{action.icon}</span>
              <strong>{action.label}</strong>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
};
