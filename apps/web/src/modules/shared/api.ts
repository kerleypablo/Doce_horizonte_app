const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';
const AUTH_STORAGE_KEY = 'confeitaria.auth';

export const apiFetch = async <T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> => {
  const { token, headers, ...rest } = options;
  const hasJsonBody = typeof rest.body === 'string' && rest.body.length > 0;
  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      ...(hasJsonBody ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {})
    }
  });

  if (!response.ok) {
    const responseBody = await response.text();
    let message = responseBody;
    try {
      const parsed = JSON.parse(responseBody) as { message?: unknown; detail?: unknown; hint?: unknown };
      const summary = typeof parsed.message === 'string' ? parsed.message : '';
      const detail = typeof parsed.detail === 'string' ? parsed.detail : '';
      const hint = typeof parsed.hint === 'string' ? parsed.hint : '';
      message = [summary, detail, hint].filter(Boolean).join(' ');
    } catch {
      // Respostas que nao sao JSON continuam sendo exibidas como foram recebidas.
    }
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
