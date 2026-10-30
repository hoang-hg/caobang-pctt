import { create } from 'zustand';
import { audioAllowed } from '../utils/audio';

const safeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* bỏ qua */ } };

// Chế độ Sáng / Tối (thiết kế F.2–F.3): "Theo máy" (theo hệ điều hành, tự đổi khi máy đổi) cho tới khi người dùng chọn Sáng /
// Tối — lựa chọn lưu ở pctt_theme (index.html đọc trước khi nạp trang để không nháy màn hình); chọn lại "Theo máy" thì xoá
const THEME_KEY = 'pctt_theme';
const savedTheme = () => {
  const t = safeGet(THEME_KEY);
  return t === 'light' || t === 'dark' ? t : null;
};
const systemTheme = () => (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

// CHẾ ĐỘ GIẢ LẬP (dữ liệu giả trên trình duyệt — api/simulationEngine.js): CHỈ máy dev (vite dev server,
// import.meta.env.DEV) và phải BẬT CHỦ ĐỘNG (nút trên trang đăng nhập / thanh trên) — mặc định tắt. Bản build chạy thật luôn
// tắt và không chứa mã giả lập. Phiên giả lập dùng token DEMO_TOKEN: tắt giả lập (hoặc mở trên bản thật) thì phiên đó bị bỏ,
// không bao giờ gửi lên máy chủ thật.
export const DEMO_TOKEN = 'demo-gia-lap';
const SIM_KEY = 'pctt_sim_mode';
const SIM_ALLOWED = import.meta.env.DEV;
const savedSim = SIM_ALLOWED && safeGet(SIM_KEY) === 'true';
// Giao diện giả lập gọn (mặc định): không dải vàng trên cùng, nút giả lập trên thanh chỉ còn biểu tượng — dữ liệu vẫn là giả
// lập. Chọn "Hiện dải giả lập" trong menu nút đó (VD trước khi chụp ảnh gửi người khác) → nhớ trên máy (pctt_sim_ui = 'full').
const SIM_UI_KEY = 'pctt_sim_ui';

const savedAuth = (() => {
  try {
    const auth = JSON.parse(safeGet('pctt_auth') || 'null');
    return auth?.token === DEMO_TOKEN && !savedSim ? null : auth;
  } catch {
    return null;
  }
})();

// Bộ lọc địa phương nhớ THEO TÀI KHOẢN (pctt_filter = { user, filter }): tải lại trang, mở lại máy trực, phiên hết hạn rồi
// đăng nhập lại vẫn đúng vùng đang xem; tài khoản khác đăng nhập trên cùng máy thì về Toàn tỉnh. Mã ngoài phạm vi / không còn
// (đổi vai trò, nhập lại danh sách xã) do AdminFilter bỏ khi đã tải danh sách xã.
export const DEFAULT_FILTER = { codes: [], label: 'Toàn tỉnh Cao Bằng', presetCode: null };
const FILTER_KEY = 'pctt_filter';
const savedFilterOf = (username) => {
  try {
    const s = JSON.parse(safeGet(FILTER_KEY) || 'null');
    if (username && s?.user === username && Array.isArray(s.filter?.codes) && s.filter.codes.length) return { ...DEFAULT_FILTER, ...s.filter };
  } catch {
    /* bỏ qua giá trị hỏng */
  }
  return DEFAULT_FILTER;
};

/** Chưa bấm chọn Sáng / Tối → theo hệ điều hành, kể cả khi máy tự đổi (điện thoại chuyển nền tối lúc chiều tối, máy
 * tính theo lịch). Đã bấm chọn (pctt_theme) thì giữ lựa chọn đó. */
function followSystemTheme() {
  try {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
      if (savedTheme()) return;
      const theme = e.matches ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', theme === 'dark');
      useStore.setState({ theme });
    });
  } catch {
    /* trình duyệt cũ không có matchMedia / addEventListener */
  }
}

export const useStore = create((set, get) => ({
  // ---- Chế độ giả lập (chỉ máy dev, bật chủ động — xem DEMO_TOKEN) ----
  simulationMode: savedSim,
  setSimulationMode: (on) => {
    const simulationMode = SIM_ALLOWED && Boolean(on);
    safeSet(SIM_KEY, simulationMode ? 'true' : null);
    set({ simulationMode });
    if (!simulationMode && get().auth?.token === DEMO_TOKEN) get().setAuth(null); // tắt giả lập → thoát phiên giả lập
  },
  simulationUiFull: SIM_ALLOWED && safeGet(SIM_UI_KEY) === 'full',
  setSimulationUiFull: (on) => {
    safeSet(SIM_UI_KEY, on ? 'full' : null);
    set({ simulationUiFull: Boolean(on) });
  },
  simulationScenario: 'normal',
  setSimulationScenario: (scenario) => set({ simulationScenario: scenario }),

  // ---- Chế độ Sáng/Tối ----
  theme: savedTheme() || systemTheme(),
  themePref: savedTheme() || 'system', // 'system' | 'light' | 'dark' — chọn trong menu tài khoản
  setThemePref: (pref) => {
    const theme = pref === 'system' ? systemTheme() : pref;
    safeSet(THEME_KEY, pref === 'system' ? null : pref);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    set({ theme, themePref: pref });
  },
  toggleTheme: () => get().setThemePref(get().theme === 'dark' ? 'light' : 'dark'),

  // ---- Bộ lọc địa phương (Global State) ----
  filter: savedFilterOf(savedAuth?.user?.username),
  // `remember: false` — bộ lọc hệ thống tự đặt (VD thẻ "Cấp xã" chọn sẵn xã đầu tiên): chỉ trong phiên, tải lại trang về Toàn
  // tỉnh; không thì xã người dùng không hề chọn cứ bám theo mọi trang sau mỗi lần tải lại
  setFilter: (filter, { remember = true } = {}) => {
    const user = get().auth?.user?.username;
    safeSet(FILTER_KEY, remember && user && filter.codes.length ? JSON.stringify({ user, filter }) : null);
    set({ filter });
  },
  clearFilter: () => get().setFilter(DEFAULT_FILTER),

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
  // Đăng xuất: về Toàn tỉnh (vẫn nhớ bộ lọc của tài khoản đó); đăng nhập: lấy lại bộ lọc đã nhớ nếu đúng tài khoản. Làm mới
  // phiên cùng tài khoản: giữ nguyên
  setAuth: (auth) => {
    safeSet('pctt_auth', auth ? JSON.stringify(auth) : null);
    const user = auth?.user?.username;
    if (user === get().auth?.user?.username) return set({ auth });
    return set({ auth, filter: savedFilterOf(user) });
  },

  // ---- Trạng thái kết nối realtime & âm báo ----
  wsStatus: 'connecting',
  setWsStatus: (wsStatus) => set({ wsStatus }),
  soundOn: safeGet('pctt_sound') !== 'off',
  // Trình duyệt chặn âm thanh tới lần bấm đầu tiên trên trang (utils/audio.js) — thanh trên nhắc khi còn bị chặn
  audioReady: audioAllowed(),
  setAudioReady: () => set({ audioReady: true }),
  toggleSound: () => { const soundOn = !get().soundOn; safeSet('pctt_sound', soundOn ? 'on' : 'off'); set({ soundOn }); },

  // Ngăn menu của điện thoại / máy tính bảng (nút ☰). Máy tính: menu ngang trên thanh trên cùng (TopNav), không menu trái
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
