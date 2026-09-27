import { create } from 'zustand';

const safeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* bỏ qua */ } };

const initialTheme = () => {
  const saved = safeGet('pctt_theme');
  if (saved) return saved;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
};

const savedAuth = (() => { try { return JSON.parse(safeGet('pctt_auth') || 'null'); } catch { return null; } })();

export const useStore = create((set, get) => ({
  // ---- Chế độ Sáng/Tối ----
  theme: initialTheme(),
  toggleTheme: () => {
    const theme = get().theme === 'dark' ? 'light' : 'dark';
    safeSet('pctt_theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    set({ theme });
  },

  // ---- Bộ lọc địa phương (Global State) ----
  filter: { codes: [], label: 'Toàn tỉnh Cao Bằng', presetCode: null },
  setFilter: (filter) => set({ filter }),
  clearFilter: () => set({ filter: { codes: [], label: 'Toàn tỉnh Cao Bằng', presetCode: null } }),

  // ---- Điểm cần bay tới trên bản đồ (từ Omni-search / nút "Xem trên bản đồ") ----
  focus: null, // { lat, lon, zoom, label }
  setFocus: (focus) => set({ focus: { ...focus, at: Date.now() } }),

  // ---- Vùng khoanh trên bản đồ chuyển sang soạn cảnh báo ----
  alertDraft: null, // { polygon, stats }
  setAlertDraft: (alertDraft) => set({ alertDraft }),

  // ---- Vị trí GPS realtime (ghi đè lên dữ liệu lớp bản đồ) ----
  gps: {},
  applyGps: (updates) => set((s) => {
    const gps = { ...s.gps };
    for (const u of updates) {
      if (u.force_id) gps[u.force_id] = [u.lat, u.lon];
      for (const v of u.vehicle_ids || []) gps[v] = [u.lat, u.lon];
    }
    return { gps };
  }),

  // ---- Đăng nhập ----
  auth: savedAuth, // { token, user }
  setAuth: (auth) => { safeSet('pctt_auth', auth ? JSON.stringify(auth) : null); set({ auth }); },

  // ---- Trạng thái kết nối realtime & âm báo ----
  wsStatus: 'connecting',
  setWsStatus: (wsStatus) => set({ wsStatus }),
  soundOn: safeGet('pctt_sound') !== 'off',
  toggleSound: () => { const soundOn = !get().soundOn; safeSet('pctt_sound', soundOn ? 'on' : 'off'); set({ soundOn }); },

  // ---- Điều khiển Sidebar (Thu gọn trên Desktop & Mở Drawer trên Mobile) ----
  sidebarCollapsed: safeGet('pctt_sidebar_collapsed') === 'true',
  toggleSidebarCollapse: () => {
    const next = !get().sidebarCollapsed;
    safeSet('pctt_sidebar_collapsed', String(next));
    set({ sidebarCollapsed: next });
  },
  mobileMenuOpen: false,
  setMobileMenuOpen: (mobileMenuOpen) => set({ mobileMenuOpen }),

  // ---- Cổng công khai đang hiện dữ liệu service worker đã lưu (mất mạng / mạng quá chậm): thời điểm lưu, ISO ----
  savedAt: null,
  setSavedAt: (savedAt) => { if (get().savedAt !== savedAt) set({ savedAt }); },

  // ---- Thông báo nổi ----
  toasts: [],
  toast: (t) => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, tone: 'info', ...t }].slice(-4) }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), t.duration || 6000);
  },
}));
