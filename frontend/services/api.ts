const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

function getToken(): string | null {
  return accessToken;
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
    const err = data as { erro?: string; message?: string; codigo?: string; detalhes?: unknown };
    throw Object.assign(new Error(err.erro || err.message || 'Erro na requisicao'), {
      status: res.status,
      code: err.codigo,
      details: err.detalhes,
    });
  }

  return data as T;
}

export { API_BASE };

export function uploadBinary<T>(
  path: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (percent: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${API_BASE}${path}`);
    const token = getToken();
    if (token) request.setRequestHeader('Authorization', `Bearer ${token}`);
    Object.entries(headers).forEach(([name, value]) => request.setRequestHeader(name, value));
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error('Falha de rede durante o upload.'));
    request.onload = () => {
      let body: unknown = {};
      try { body = request.responseText ? JSON.parse(request.responseText) : {}; } catch { /* resposta invalida */ }
      if (request.status >= 200 && request.status < 300) resolve(body as T);
      else reject(new Error((body as { erro?: string }).erro ?? 'Falha no upload.'));
    };
    request.send(file);
  });
}

export async function fetchDocumentBlob(documentId: number): Promise<Blob> {
  const token = getToken();
  const response = await fetch(`${API_BASE}/core/documentos/${documentId}/conteudo`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { erro?: string };
    throw new Error(body.erro ?? 'Nao foi possivel abrir o documento.');
  }
  return response.blob();
}

export async function apiFormData<T>(path: string, formData: FormData, method = 'POST'): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const body = await response.json().catch(() => ({})) as { erro?: string } & T;
  if (!response.ok) throw new Error(body.erro ?? 'Erro na requisicao.');
  return body;
}
