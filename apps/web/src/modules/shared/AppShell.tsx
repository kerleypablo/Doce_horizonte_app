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
    path: '/app/financeiro',
    label: 'Financeiro',
    icon: 'monitoring',
    requiresModule: 'financeiro'
  },
  {
    path: '/app/tasks',
    label: 'Tasks',
    icon: 'checklist'
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
  },
  {
    path: '/backoffice',
    label: 'Backoffice',
    icon: 'admin_panel_settings',
    requiresMaster: true
  }
];

const bottomNavItems = navItems.filter((item) =>
  ['/app', '/app/receitas', '/app/produtos', '/app/pedidos'].includes(item.path)
);

const isPathActive = (pathname: string, path: string) => {
  if (path === '/app') return pathname === '/app';
  return pathname === path || pathname.startsWith(`${path}/`);
};

const getHeaderTitle = (pathname: string) => {
  if (pathname === '/app') return 'Controle de Precificacao';
  if (pathname === '/backoffice') return 'Backoffice';
  const matched = navItems.find((item) => isPathActive(pathname, item.path));
  if (!matched) return 'Controle de Precificacao';
  if (matched.path === '/app/pedidos' && pathname !== '/app/pedidos') return 'Pedido';
  return matched.label;
};

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const isTasksMode = pathname.startsWith('/app/tasks');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const headerTitle = getHeaderTitle(pathname);
  const activeBottomIndex = bottomNavItems.findIndex((item) => isPathActive(pathname, item.path));
  const visibleNavItems = navItems.filter((item) => {
    if (item.requiresMaster && user?.role !== 'master') return false;
    if (item.requiresModule && !user?.modules?.includes(item.requiresModule)) return false;
    return true;
  });
  const settingsQuery = useCachedQuery(
    queryKeys.companySettings,
    () => apiFetch<{ appTheme?: string; darkMode?: boolean }>('/company/settings', { token: user?.token }),
    { staleTime: 5 * 60_000, enabled: Boolean(user?.token) }
  );

  useEffect(() => {
    const root = document.documentElement;
    const themeOverride = typeof window !== 'undefined' ? window.localStorage.getItem('app-theme-override') : null;
    const darkOverride = typeof window !== 'undefined' ? window.localStorage.getItem('app-dark-override') : null;
    const themeFromApi = settingsQuery.data?.appTheme ?? 'caramelo';
    const darkFromApi = settingsQuery.data?.darkMode ? 'true' : 'false';
    root.setAttribute('data-theme', themeOverride || themeFromApi);
    root.setAttribute('data-dark', darkOverride ?? darkFromApi);
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

  const avatarContent = user?.avatarUrl ? (
    <img src={user.avatarUrl} alt={user.name ?? 'Usuario'} />
  ) : (
    <span className="material-symbols-outlined" aria-hidden="true">person</span>
  );

  if (isTasksMode) {
    return (
      <div className="app-shell tasks-shell">
        <main>
          <header className="tasks-mode-header">
            <h2>Modo Tasks</h2>
            <Link to="/app" className="ghost">Sair do modo Tasks</Link>
          </header>
          <section className="content">{children}</section>
        </main>
      </div>
    );
  }

  return (
    <div className={`app-shell ${drawerOpen ? 'drawer-open' : ''}`}>
      <aside className={`sidebar ${drawerOpen ? 'open' : ''}`}>
        <div className="brand">
          <span>Confeitaria</span>
          <strong>Precificacao</strong>
        </div>
        <nav>
          {visibleNavItems.map((item) => (
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
          <div className="role">
            Perfil: {user?.role === 'master' ? 'Master' : user?.role === 'admin' ? 'Admin' : 'Comum'}
          </div>
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
            {pathname === '/app' ? <span>Controle</span> : null}
            <strong>{headerTitle}</strong>
          </div>
          <div className="mobile-user" aria-label="Usuario logado">
            {avatarContent}
          </div>
        </header>
        <header className="app-header">
          <div>
            <h2>{headerTitle}</h2>
            {pathname === '/app' ? <p>Custos, receitas e margens sempre atualizados.</p> : null}
          </div>
          <div className="header-actions">
            <span>
              {user?.role === 'master' ? 'Master' : user?.role === 'admin' ? 'Administrador' : 'Operacional'}
            </span>
            <div className="mobile-user" aria-label="Usuario logado">
              {avatarContent}
            </div>
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
