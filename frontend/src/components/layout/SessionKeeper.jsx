import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Clock, LogIn } from 'lucide-react';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { time } from '../../utils/format';

const REFRESH_MS = 10 * 60_000; // gia hạn token mỗi 10 phút khi trang còn mở (lỗi mạng thì lần sau thử lại)
const WARN_MS = 30 * 60_000; // báo trước khi phiên hết hạn

/** Hạn của token (ms) đọc từ phần payload JWT; null nếu không đọc được. */
export function tokenExpiry(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    return JSON.parse(json).exp * 1000;
  } catch {
    return null;
  }
}

/** Giữ phiên khi trang điều hành còn mở: gia hạn token định kỳ (POST /auth/refresh), tới tối đa SESSION_MAX_HOURS kể từ lúc
 * đăng nhập (máy chủ quyết định). Còn dưới 30 phút mà không gia hạn được nữa → thanh báo để lưu việc đang làm và đăng nhập
 * lại; hết hạn → về trang đăng nhập (giữ đường dẫn đang mở). */
export default function SessionKeeper() {
  const qc = useQueryClient();
  const token = useStore((s) => s.auth?.token);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let lastRefresh = 0;
    const refresh = () => {
      lastRefresh = Date.now();
      api('/auth/refresh', { method: 'POST' })
        .then((s) => {
          if (useStore.getState().auth?.token) useStore.getState().setAuth(s);
        })
        .catch(() => {}); // 401 → api() đã đăng xuất; lỗi mạng → lần sau thử lại
    };
    refresh(); // mở lại trang với token đã cũ (VD máy ngủ qua đêm) → gia hạn ngay
    const id = setInterval(refresh, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRefresh > REFRESH_MS) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const exp = token ? tokenExpiry(token) : null;
  const expired = exp != null && now >= exp;
  useEffect(() => {
    if (expired) {
      useStore.getState().toast({ tone: 'warn', title: 'Phiên đăng nhập đã hết hạn', body: 'Đăng nhập lại để tiếp tục' });
      useStore.getState().setAuth(null);
      qc.clear();
    }
  }, [expired, qc]);

  if (exp == null || expired || exp - now > WARN_MS) return null;
  const relogin = () => {
    useStore.getState().setAuth(null);
    qc.clear();
  };
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 border-b border-warn/40 bg-warn/15 px-3 py-1.5 text-xs text-warn print:hidden">
      <Clock size={14} className="shrink-0" />
      <span className="min-w-0 flex-1">
        Phiên đăng nhập sẽ hết hạn lúc <b>{time(exp)}</b> — lưu việc đang làm rồi đăng nhập lại để không bị gián đoạn.
      </span>
      <button className="btn-ghost px-2 py-0.5 text-xs" onClick={relogin}>
        <LogIn size={12} /> Đăng nhập lại
      </button>
    </div>
  );
}
