import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.tsx';

const navItems = [
  {
    path: '/app',
    label: 'Home',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z" />
      </svg>
    )
  },
  {
    path: '/app/insumos',
    label: 'Insumos',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 4h10a2 2 0 0 1 2 2v14H5V6a2 2 0 0 1 2-2zm0 4h10M7 12h6" />
      </svg>
    )
  },
  {
    path: '/app/receitas',
    label: 'Receitas',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 4h9a3 3 0 0 1 3 3v13H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm3 7h6M9 15h6" />
      </svg>
    )
  },
  {
    path: '/app/produtos',
    label: 'Produtos',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 7l6-3 6 3v10l-6 3-6-3V7zm6 0v13" />
      </svg>
    )
  },
  {
    path: '/app/empresa',
    label: 'Empresa',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20V6l6-2v16H4zm10-9h6v9h-6v-9z" />
      </svg>
    )
  }
];

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${drawerOpen ? 'open' : ''}`}>
        <div className="brand">
          <span>Confeitaria</span>
          <strong>Precificacao</strong>
        </div>
        <nav>
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={pathname === item.path ? 'active' : ''}
              onClick={() => setDrawerOpen(false)}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="role">Perfil: {user?.role === 'admin' ? 'Admin' : 'Comum'}</div>
          <button onClick={logout}>Sair</button>
        </div>
      </aside>
      <div className={`drawer-backdrop ${drawerOpen ? 'open' : ''}`} onClick={() => setDrawerOpen(false)} />
      <main>
        <header className="mobile-header">
          <button className="icon-button" onClick={() => setDrawerOpen((prev) => !prev)} aria-label="Menu">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="mobile-title">
            <span>Controle</span>
            <strong>Precificacao</strong>
          </div>
          <div className="mobile-user" aria-label="Usuario logado">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-7 8a7 7 0 0 1 14 0" />
            </svg>
          </div>
        </header>
        <header className="app-header">
          <div>
            <h2>Controle de Precificacao</h2>
            <p>Custos, receitas e margens sempre atualizados.</p>
          </div>
          <div className="header-actions">
            <span>{user?.role === 'admin' ? 'Administrador' : 'Operacional'}</span>
          </div>
        </header>
        <section className="content">{children}</section>
      </main>
      <nav className="bottom-nav">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={pathname === item.path ? 'active' : ''}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
};
