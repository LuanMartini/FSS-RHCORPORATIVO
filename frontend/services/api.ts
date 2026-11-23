const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';
let accessToken: string | null = null;
let onSessionExpired: (() => void) | undefined;

export interface ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function setSessionExpiryHandler(handler?: () => void): void {
  onSessionExpired = handler;
}

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function checkSession(status: number, token: string | null) {
  if (status === 401 && token && token === accessToken) onSessionExpired?.();
}

function apiError(status: number, body: unknown, fallback = 'Não foi possível concluir a solicitação.'): ApiError {
  const data = body as { erro?: string; message?: string; codigo?: string; detalhes?: unknown } | null;
  const message = status === 403 ? 'Seu perfil não tem acesso a esta operação.'
    : status >= 500 ? 'O serviço está indisponível. Tente novamente em instantes.'
      : data?.erro || data?.message || fallback;
  return Object.assign(new Error(message), { status, code: data?.codigo, details: data?.detalhes });
}

async function request(path: string, options: RequestInit, token: string | null) {
  try {
    const response = await fetch(`${API_BASE}${path}`, options);
    checkSession(response.status, token);
    return response;
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error('Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.');
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = accessToken;
  const headers = new Headers({ 'Content-Type': 'application/json', ...authHeaders(token) });
  new Headers(options.headers).forEach((value, name) => headers.set(name, value));
  const response = await request(path, { ...options, headers }, token);
  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    if (response.ok) throw new Error('O serviço retornou uma resposta inválida. Tente novamente.');
  }
  if (!response.ok) throw apiError(response.status, data);
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
    const upload = new XMLHttpRequest();
    upload.open('POST', `${API_BASE}${path}`);
    const token = accessToken;
    Object.entries({ ...authHeaders(token), ...headers }).forEach(([name, value]) => upload.setRequestHeader(name, value));
    upload.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    upload.onerror = () => reject(new Error('Falha de rede durante o envio. Tente novamente.'));
    upload.onload = () => {
      checkSession(upload.status, token);
      let body: unknown = {};
      try { body = upload.responseText ? JSON.parse(upload.responseText) : {}; }
      catch {
        if (upload.status >= 200 && upload.status < 300) {
          reject(new Error('O serviço retornou uma resposta inválida.'));
          return;
        }
      }
      if (upload.status >= 200 && upload.status < 300) resolve(body as T);
      else reject(apiError(upload.status, body, 'Falha no envio do arquivo.'));
    };
    upload.send(file);
  });
}

async function fetchBlob(path: string, fallback: string): Promise<Blob> {
  const token = accessToken;
  const response = await request(path, { headers: authHeaders(token) }, token);
  if (!response.ok) throw apiError(response.status, await response.json().catch(() => null), fallback);
  return response.blob();
}

export function fetchDocumentBlob(documentId: number): Promise<Blob> {
  return fetchBlob(`/core/documentos/${documentId}/conteudo`, 'Não foi possível abrir o documento.');
}

export function fetchContractBlob(contractId: number): Promise<Blob> {
  return fetchBlob(`/core/contratos/${contractId}/conteudo`, 'Não foi possível baixar o contrato.');
}

export async function apiFormData<T>(path: string, formData: FormData, method = 'POST'): Promise<T> {
  const token = accessToken;
  const response = await request(path, { method, headers: authHeaders(token), body: formData }, token);
  if (!response.ok) throw apiError(response.status, await response.json().catch(() => null));
  if (response.status === 204) return {} as T;
  return response.json() as Promise<T>;
}
