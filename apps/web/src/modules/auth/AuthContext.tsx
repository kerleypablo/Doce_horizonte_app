import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { clearQueryCache } from '../shared/queryCache.ts';
import { supabase } from '../shared/supabase.ts';

export type AuthUser = {
  token: string;
  refreshToken?: string;
  role: 'master' | 'admin' | 'common';
  modules: string[];
  email?: string;
  name?: string;
  avatarUrl?: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  login: (
    token: string,
    role: 'master' | 'admin' | 'common',
    modules: string[],
    profile?: { email?: string; name?: string; avatarUrl?: string },
    refreshToken?: string
  ) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const storageKey = 'confeitaria.auth';

const loadUser = (): AuthUser | null => {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AuthUser>;
    if (!parsed.token || !parsed.role) return null;
    return {
      token: parsed.token,
      refreshToken: parsed.refreshToken,
      role: parsed.role,
      modules: parsed.modules ?? [],
      email: parsed.email,
      name: parsed.name,
      avatarUrl: parsed.avatarUrl
    };
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(() => loadUser());

  const login = (
    token: string,
    role: 'master' | 'admin' | 'common',
    modules: string[],
    profile?: { email?: string; name?: string; avatarUrl?: string },
    refreshToken?: string
  ) => {
    const next = { token, refreshToken, role, modules, ...profile };
    setUser(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
    clearQueryCache();
  };

  useEffect(() => {
    if (!user?.token || !user.refreshToken) return;
    supabase.auth.setSession({ access_token: user.token, refresh_token: user.refreshToken }).catch(() => undefined);
  }, [user?.token, user?.refreshToken]);

  useEffect(() => {
    if (!user?.token || user.avatarUrl) return;
    const loadProfile = async () => {
      const { data } = await supabase.auth.getUser(user.token);
      const authUser = data.user;
      if (!authUser) return;
      const fetchedName = (authUser.user_metadata?.full_name as string | undefined) ?? user.name;
      const fetchedAvatar = (authUser.user_metadata?.avatar_url as string | undefined) ?? user.avatarUrl;
      const fetchedEmail = authUser.email ?? user.email;
      if (!fetchedName && !fetchedAvatar && !fetchedEmail) return;
      const next: AuthUser = {
        ...user,
        modules: user.modules ?? [],
        email: fetchedEmail,
        name: fetchedName,
        avatarUrl: fetchedAvatar
      };
      if (
        next.email === user.email &&
        next.name === user.name &&
        next.avatarUrl === user.avatarUrl
      ) return;
      setUser(next);
      localStorage.setItem(storageKey, JSON.stringify(next));
    };
    loadProfile();
  }, [user]);

  useEffect(() => {
    if (!user?.refreshToken) return;
    const refresh = async () => {
      const { data } = await supabase.auth.refreshSession({ refresh_token: user.refreshToken });
      if (!data.session) return;
      const next = { ...user, token: data.session.access_token, refreshToken: data.session.refresh_token };
      setUser(next);
      localStorage.setItem(storageKey, JSON.stringify(next));
    };
    const timer = window.setInterval(() => { void refresh(); }, 40 * 60_000);
    return () => window.clearInterval(timer);
  }, [user]);

  const logout = () => {
    void supabase.auth.signOut();
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
