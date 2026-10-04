import { useStore } from '../app/store';

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Máy chủ báo tài khoản còn dùng mật khẩu do cấp trên đặt (VD phiên mở từ trước khi bị đặt lại) → App.jsx chỉ hiện
 * màn hình đổi mật khẩu. */
function mustChangePassword() {
  const { auth, setAuth } = useStore.getState();
  if (auth?.user && !auth.user.must_change_password) setAuth({ ...auth, user: { ...auth.user, must_change_password: true } });
}

/** 401 khi đang đăng nhập: phiên hết hạn / bị thu hồi (đổi mật khẩu, đổi quyền, khoá) → về trang đăng nhập, báo lý do
 * (trước đây chuyển trang không một lời giải thích). Sai mật khẩu lúc đăng nhập cũng là 401 nhưng khi đó chưa có phiên. */
function sessionEnded(detail) {
  const { auth, setAuth, toast } = useStore.getState();
  if (!auth) return;
  setAuth(null);
  toast({ tone: 'warn', title: 'Phiên đăng nhập đã kết thúc', body: detail, duration: 10000 });
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
    if (res.status === 401) sessionEnded(detail);
    if (res.status === 403 && res.headers.get('x-must-change-password')) mustChangePassword();
    throw new ApiError(res.status, detail);
  }
  // Service worker trả bản đã lưu kèm X-PCTT-Saved-At (src/sw.js) → cổng công khai báo "dữ liệu lưu lúc…"
  if (path.startsWith('/public/')) useStore.getState().setSavedAt(res.headers.get('x-pctt-saved-at'));
  // 204 No Content (thu hồi vai trò, xoá vai trò / thiết bị): không có JSON — res.json() sẽ báo lỗi dù đã xoá xong
  if (res.status === 204) return null;
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
    if (res.status === 401) sessionEnded(typeof data?.detail === 'string' ? data.detail : res.statusText);
    if (res.status === 403 && res.headers.get('x-must-change-password')) mustChangePassword();
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
