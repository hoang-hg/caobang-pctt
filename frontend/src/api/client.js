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

/** Gửi tệp (multipart/form-data). Lỗi → ApiError, kèm `data` là JSON phản hồi (VD báo cáo kiểm tra tệp). */
export async function apiUpload(path, formData) {
  const token = useStore.getState().auth?.token;
  const res = await fetch(`/api/v1${path}`, {
    method: 'POST',
    body: formData,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) useStore.getState().setAuth(null);
    const err = new ApiError(res.status, typeof data?.detail === 'string' ? data.detail : res.statusText);
    err.data = data;
    throw err;
  }
  return data;
}

/** Tải tệp từ API (có token) và lưu xuống máy, tên tệp theo Content-Disposition. */
export async function apiDownload(path, fallbackName) {
  const token = useStore.getState().auth?.token;
  const res = await fetch(`/api/v1${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  const name = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
