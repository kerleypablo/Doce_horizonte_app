const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';
const AUTH_STORAGE_KEY = 'confeitaria.auth';

export const apiFetch = async <T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> => {
  const { token, headers, ...rest } = options;
  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {})
    }
  });

  if (!response.ok) {
    const message = await response.text();
    if (response.status === 401) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    throw new Error(message || 'Erro na requisicao');
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
};
