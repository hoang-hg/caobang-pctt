import { useStore } from '../app/store';

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function api(path, { method = 'GET', body, params } = {}) {
  const url = new URL(`/api/v1${path}`, window.location.origin);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, Array.isArray(v) ? v.join(',') : v);
  });
  const token = useStore.getState().auth?.token;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
    } catch { /* không phải JSON */ }
    if (res.status === 401) useStore.getState().setAuth(null);
    throw new ApiError(res.status, detail);
  }
  return res.json();
}

/** Tham số lọc địa phương dùng chung cho mọi truy vấn. */
export const useAreaParams = () => {
  const codes = useStore((s) => s.filter.codes);
  return { admin_codes: codes.length ? codes.join(',') : undefined };
};
