import { Link } from 'react-router-dom';

const quickActions = [
  { label: 'Pedidos', icon: 'receipt_long', path: '/app/pedidos' },
  { label: 'Receitas', icon: 'menu_book', path: '/app/receitas' },
  { label: 'Insumos', icon: 'inventory_2', path: '/app/insumos' },
  { label: 'Clientes', icon: 'groups', path: '/app/clientes' },
  { label: 'Produtos', icon: 'shopping_bag', path: '/app/produtos' }
];

export const DashboardQuickActions = () => (
  <section className="dashboard-quick-actions">
    <div className="dashboard-section-heading compact">
      <div><span>Acesso rápido</span><h3>Atalhos</h3></div>
    </div>
    <div className="dashboard-quick-actions-grid">
      {quickActions.map((action) => (
        <Link key={action.path} className="dashboard-quick-action" to={action.path}>
          <span className="material-symbols-outlined" aria-hidden="true">{action.icon}</span>
          <strong>{action.label}</strong>
        </Link>
      ))}
    </div>
  </section>
);
