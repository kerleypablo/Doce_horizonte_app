import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.tsx';
import { apiFetch } from './api.ts';
import { prefetchWithCache, useCachedQuery } from './queryCache.ts';
import { queryKeys } from './queryKeys.ts';
import { QuickActionsSheet } from './QuickActionsSheet.tsx';
import { normalizeAppTheme } from './app-theme.ts';
import type { AppTheme } from './app-theme.ts';

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

const isPathActive = (pathname: string, path: string) => {
  if (path === '/app') return pathname === '/app';
  return pathname === path || pathname.startsWith(`${path}/`);
};

const getHeaderTitle = (pathname: string) => {
  if (pathname === '/app') return 'Visão geral';
  if (pathname === '/backoffice') return 'Backoffice';
  const matched = navItems.find((item) => isPathActive(pathname, item.path));
  if (!matched) return 'Visão geral';
  if (matched.path === '/app/pedidos' && pathname !== '/app/pedidos') return 'Pedido';
  return matched.label;
};

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const isTasksMode = pathname.startsWith('/app/tasks');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const headerTitle = getHeaderTitle(pathname);
  const visibleNavItems = navItems.filter((item) => {
    if (item.requiresMaster && user?.role !== 'master') return false;
    if (item.requiresModule && !user?.modules?.includes(item.requiresModule)) return false;
    return true;
  });
  const settingsQuery = useCachedQuery(
    queryKeys.companySettings,
    () => apiFetch<{ companyName?: string; logoDataUrl?: string; appTheme?: AppTheme; darkMode?: boolean }>('/company/settings', { token: user?.token }),
    { staleTime: 5 * 60_000, enabled: Boolean(user?.token) }
  );

  useEffect(() => {
    const root = document.documentElement;
    const themeOverride = typeof window !== 'undefined' ? window.localStorage.getItem('app-theme-override') : null;
    const darkOverride = typeof window !== 'undefined' ? window.localStorage.getItem('app-dark-override') : null;
    const selectedTheme = normalizeAppTheme(themeOverride || settingsQuery.data?.appTheme);
    const darkFromApi = settingsQuery.data?.darkMode ? 'true' : 'false';
    root.setAttribute('data-theme', selectedTheme);
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
  const financeEnabled = Boolean(user?.modules?.includes('financeiro'));
  const thirdDestination = financeEnabled ? '/app/financeiro' : '/app/receitas';
  const isMoreActive = !['/app', '/app/pedidos', thirdDestination].some((path) => isPathActive(pathname, path));

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
          {settingsQuery.data?.logoDataUrl ? (
            <img className="brand-logo" src={settingsQuery.data.logoDataUrl} alt="Logo da empresa" />
          ) : (
            <span className="brand-mark material-symbols-outlined" aria-hidden="true">bakery_dining</span>
          )}
          <span className="brand-copy">
            <small>Gestão para confeitaria</small>
            <strong>{settingsQuery.data?.companyName ?? 'Doce Horizonte'}</strong>
          </span>
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
            {pathname === '/app' ? <span>{settingsQuery.data?.companyName ?? 'Doce Horizonte'}</span> : null}
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
      <nav className="bottom-nav" aria-label="Navegação principal">
        <Link to="/app" className={pathname === '/app' ? 'active' : ''}>
          <span className="material-symbols-outlined nav-icon" aria-hidden="true">home</span>
          <span className="nav-label">Início</span>
        </Link>
        <Link to="/app/pedidos" className={isPathActive(pathname, '/app/pedidos') ? 'active' : ''}>
          <span className="material-symbols-outlined nav-icon" aria-hidden="true">receipt_long</span>
          <span className="nav-label">Pedidos</span>
        </Link>
        <button
          type="button"
          className="bottom-nav-create"
          onClick={() => setQuickActionsOpen(true)}
          aria-label="Abrir ações rápidas"
          aria-expanded={quickActionsOpen}
        >
          <span className="material-symbols-outlined" aria-hidden="true">add</span>
        </button>
        {financeEnabled ? (
          <Link to="/app/financeiro" className={isPathActive(pathname, '/app/financeiro') ? 'active' : ''}>
            <span className="material-symbols-outlined nav-icon" aria-hidden="true">account_balance_wallet</span>
            <span className="nav-label">Financeiro</span>
          </Link>
        ) : (
          <Link to="/app/receitas" className={isPathActive(pathname, '/app/receitas') ? 'active' : ''}>
            <span className="material-symbols-outlined nav-icon" aria-hidden="true">menu_book</span>
            <span className="nav-label">Receitas</span>
          </Link>
        )}
        <button
          type="button"
          className={isMoreActive || drawerOpen ? 'bottom-nav-more active' : 'bottom-nav-more'}
          onClick={() => setDrawerOpen(true)}
          aria-label="Abrir mais opções"
        >
          <span className="material-symbols-outlined nav-icon" aria-hidden="true">menu</span>
          <span className="nav-label">Mais</span>
        </button>
      </nav>
      <QuickActionsSheet open={quickActionsOpen} onClose={() => setQuickActionsOpen(false)} />
    </div>
  );
};
