import React, { createContext, useContext, useMemo, useState } from 'react';
import { clearQueryCache } from '../shared/queryCache.ts';

export type AuthUser = {
  token: string;
  role: 'admin' | 'common';
};

type AuthContextValue = {
  user: AuthUser | null;
  login: (token: string, role: 'admin' | 'common') => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const storageKey = 'confeitaria.auth';

const loadUser = (): AuthUser | null => {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(() => loadUser());

  const login = (token: string, role: 'admin' | 'common') => {
    const next = { token, role };
    setUser(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
    clearQueryCache();
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(storageKey);
    clearQueryCache();
  };

  const value = useMemo(() => ({ user, login, logout }), [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthContext not found');
  return ctx;
};
