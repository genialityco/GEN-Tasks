import { firebaseAuth } from '../firebase/client';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Cliente HTTP centralizado para la API NestJS. Adjunta automaticamente el ID
 * token de Firebase en cada peticion y normaliza el manejo de errores.
 */
async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const user = firebaseAuth.currentUser;
  const token = user ? await user.getIdToken() : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (data && (Array.isArray(data.message) ? data.message.join(', ') : data.message)) ||
      `Error ${res.status}`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

/**
 * Sube un archivo via multipart/form-data. No fija `Content-Type` para que el
 * navegador agregue el boundary correcto; adjunta el ID token igual que el resto.
 */
export async function uploadFile<T>(path: string, file: File): Promise<T> {
  const user = firebaseAuth.currentUser;
  const token = user ? await user.getIdToken() : null;

  const form = new FormData();
  form.append('file', file);

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    body: form,
    headers,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (data && (Array.isArray(data.message) ? data.message.join(', ') : data.message)) ||
      `Error ${res.status}`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
