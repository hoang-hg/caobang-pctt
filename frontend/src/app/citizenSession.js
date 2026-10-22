import { create } from 'zustand';

/**
 * Phiên đăng nhập của NGƯỜI DÂN trên cổng công khai (Đ5 — docs/ke-hoach-lam-moi-giao-dien.md mục 11): { token, account }.
 * Tách hẳn phiên cán bộ (useStore().auth) — cán bộ đang đăng nhập mở cổng vẫn là "chưa đăng nhập người dân". Lưu trên
 * máy (người dân dùng điện thoại của mình; máy chủ cho phiên 30 ngày); localStorage bọc try/catch (chế độ riêng tư).
 */
const KEY = 'pctt_citizen';

const load = () => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    return s?.token && s?.account ? s : null;
  } catch {
    return null;
  }
};

export const useCitizen = create((set, get) => ({
  session: load(),
  setSession: (session) => {
    try {
      if (session) localStorage.setItem(KEY, JSON.stringify(session));
      else localStorage.removeItem(KEY);
    } catch { /* chế độ riêng tư — phiên chỉ còn trong lần mở trang này */ }
    set({ session });
  },
  // Máy chủ báo đang dùng mật khẩu tạm (cán bộ đặt lại) → giao diện chuyển sang đổi mật khẩu
  markMustChange: () => {
    const s = get().session;
    if (s && !s.account.must_change_password) get().setSession({ ...s, account: { ...s.account, must_change_password: true } });
  },
}));
