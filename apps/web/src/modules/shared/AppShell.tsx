import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useAuth } from '../auth/AuthContext.tsx';
import { apiFetch } from './api.ts';
import { prefetchWithCache, useCachedQuery } from './queryCache.ts';
import { queryKeys } from './queryKeys.ts';

const navItems = [
  {
    path: '/app',
    label: 'Home',
    icon: 'home'
  },
  {
    path: '/app/insumos',
    label: 'Insumos',
    icon: 'inventory_2'
  },
  {
    path: '/app/receitas',
    label: 'Receitas',
    icon: 'menu_book'
  },
  {
    path: '/app/produtos',
    label: 'Produtos',
    icon: 'shopping_bag'
  },
  {
    path: '/app/clientes',
    label: 'Clientes',
    icon: 'groups'
  },
  {
    path: '/app/pedidos',
    label: 'Pedidos',
    icon: 'receipt_long'
  },
  {
    path: '/app/empresa',
    label: 'Empresa',
    icon: 'domain'
  },
  {
    path: '/app/configuracoes',
    label: 'Configuracoes',
    icon: 'settings'
  }
];

const bottomNavItems = navItems.filter((item) =>
  ['/app', '/app/receitas', '/app/produtos', '/app/pedidos'].includes(item.path)
);

const isPathActive = (pathname: string, path: string) => {
  if (path === '/app') return pathname === '/app';
  return pathname === path || pathname.startsWith(`${path}/`);
};

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const activeBottomIndex = bottomNavItems.findIndex((item) => isPathActive(pathname, item.path));
  const settingsQuery = useCachedQuery(
    queryKeys.companySettings,
    () => apiFetch<{ appTheme?: string; darkMode?: boolean }>('/company/settings', { token: user?.token }),
    { staleTime: 5 * 60_000, enabled: Boolean(user?.token) }
  );

  useEffect(() => {
    const root = document.documentElement;
    if (!settingsQuery.data) {
      root.setAttribute('data-theme', 'caramelo');
      root.setAttribute('data-dark', 'false');
      return;
    }
    root.setAttribute('data-theme', settingsQuery.data.appTheme ?? 'caramelo');
    root.setAttribute('data-dark', settingsQuery.data.darkMode ? 'true' : 'false');
  }, [settingsQuery.data]);

  useEffect(() => {
    if (!user?.token) return;
    prefetchWithCache(
      queryKeys.customers,
      () => apiFetch('/customers', { token: user.token }),
      { staleTime: 3 * 60_000 }
    );
    prefetchWithCache(
      queryKeys.products,
      () => apiFetch('/products', { token: user.token }),
      { staleTime: 3 * 60_000 }
    );
  }, [user?.token]);

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
              className={isPathActive(pathname, item.path) ? 'active' : ''}
              onClick={() => setDrawerOpen(false)}
            >
              <span className="material-symbols-outlined nav-icon" aria-hidden="true">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
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
            <span className="material-symbols-outlined" aria-hidden="true">menu</span>
          </button>
          <div className="mobile-title">
            <span>Controle</span>
            <strong>Precificacao</strong>
          </div>
          <div className="mobile-user" aria-label="Usuario logado">
            <span className="material-symbols-outlined" aria-hidden="true">person</span>
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
      <nav className="bottom-nav" style={{ '--bottom-nav-index': Math.max(activeBottomIndex, 0) } as CSSProperties}>
        <span className="bottom-nav-indicator" aria-hidden="true" />
        {bottomNavItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={isPathActive(pathname, item.path) ? 'active' : ''}
          >
            <span className="material-symbols-outlined nav-icon" aria-hidden="true">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
};
