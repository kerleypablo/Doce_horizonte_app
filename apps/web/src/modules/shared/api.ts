const API_BASE = 'http://localhost:3333';

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
    throw new Error(message || 'Erro na requisicao');
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
};
