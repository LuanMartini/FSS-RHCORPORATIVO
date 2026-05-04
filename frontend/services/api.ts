const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';

function getToken(): string | null {
  return localStorage.getItem('token');
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });

  const text = await res.text();
  const data = (text ? JSON.parse(text) : {}) as unknown;

  if (!res.ok) {
    const err = data as { erro?: string; message?: string };
    throw new Error(err.erro || err.message || 'Erro na requisição');
  }
  return data as T;
}

export { API_BASE };
