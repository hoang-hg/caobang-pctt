import { create } from 'zustand';
import { audioAllowed } from '../utils/audio';

const safeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* bỏ qua */ } };

const initialTheme = () => {
  const saved = safeGet('pctt_theme');
  if (saved) return saved;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
};

const savedAuth = (() => { try { return JSON.parse(safeGet('pctt_auth') || 'null'); } catch { return null; } })();

/** Chưa bấm chọn Sáng / Tối → theo hệ điều hành, kể cả khi máy tự đổi (điện thoại chuyển nền tối lúc chiều tối, máy
 * tính theo lịch). Đã bấm chọn (pctt_theme) thì giữ lựa chọn đó. */
function followSystemTheme() {
  try {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
      if (safeGet('pctt_theme')) return;
      const theme = e.matches ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', theme === 'dark');
      useStore.setState({ theme });
    });
  } catch {
    /* trình duyệt cũ không có matchMedia / addEventListener */
  }
}

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
  // Trình duyệt chặn âm thanh tới lần bấm đầu tiên trên trang (utils/audio.js) — thanh trên nhắc khi còn bị chặn
  audioReady: audioAllowed(),
  setAudioReady: () => set({ audioReady: true }),
  toggleSound: () => { const soundOn = !get().soundOn; safeSet('pctt_sound', soundOn ? 'on' : 'off'); set({ soundOn }); },

  // ---- Điều khiển Sidebar (Thu gọn trên Desktop & Mở Drawer trên Mobile) ----
  // Chưa bấm chọn: màn 1024–1279 px (iPad ngang, laptop nhỏ) thu gọn sẵn để nội dung (bản đồ, KPI) đủ rộng; từ 1280 px mở
  // rộng. Đã bấm "Thu gọn / Mở rộng" thì giữ lựa chọn đó.
  sidebarCollapsed: (() => {
    const saved = safeGet('pctt_sidebar_collapsed');
    if (saved != null) return saved === 'true';
    return typeof window !== 'undefined' && window.innerWidth < 1280;
  })(),
  toggleSidebarCollapse: () => {
    const next = !get().sidebarCollapsed;
    safeSet('pctt_sidebar_collapsed', String(next));
    set({ sidebarCollapsed: next });
  },
  mobileMenuOpen: false,
  setMobileMenuOpen: (mobileMenuOpen) => set({ mobileMenuOpen }),
  // Chế độ trình chiếu (màn hình lớn phòng điều hành, Dashboard): ẩn thanh trên + menu trái — không lưu lại
  presentation: false,
  setPresentation: (presentation) => set({ presentation }),

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

followSystemTheme();
