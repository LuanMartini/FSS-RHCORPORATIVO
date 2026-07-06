const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';

function getToken(): string | null {
  return localStorage.getItem('token');
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { erro: 'Resposta invalida da API' };
  }

  if (!res.ok) {
    const err = data as { erro?: string; message?: string };
    throw new Error(err.erro || err.message || 'Erro na requisicao');
  }

  return data as T;
}

export { API_BASE };
