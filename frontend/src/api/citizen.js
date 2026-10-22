import { useCitizen } from '../app/citizenSession';
import { ApiError } from './client';

/**
 * Gọi API tài khoản người dân / gửi phản ánh của cổng công khai (Đ5) bằng token NGƯỜI DÂN — không dùng `api()`: hàm đó gắn
 * token cán bộ và 401 thì đăng xuất phiên cán bộ. Ở đây 401 khi đang có phiên người dân = phiên hết hạn / bị khoá → chỉ xoá
 * phiên người dân. `form`: FormData (gửi phản ánh kèm ảnh).
 */
export async function citizenApi(path, { method = 'GET', body, form } = {}) {
  const token = useCitizen.getState().session?.token;
  const res = await fetch(`/api/v1${path}`, {
    method,
    headers: { ...(form ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = typeof data?.detail === 'string'
      ? data.detail
      : res.status === 429 ? 'Bạn thao tác quá nhiều lần trong thời gian ngắn — thử lại sau ít phút' : res.statusText;
    if (res.status === 401 && token) useCitizen.getState().setSession(null);
    if (res.status === 403 && res.headers.get('x-must-change-password')) useCitizen.getState().markMustChange();
    const err = new ApiError(res.status, detail);
    err.data = data;
    throw err;
  }
  return data;
}
