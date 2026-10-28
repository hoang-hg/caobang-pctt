/**
 * Thang màu rủi ro dùng chung TOÀN HỆ THỐNG (Dashboard, bản đồ, cổng công khai, biểu đồ, Kanban, cảnh báo):
 *   0 Xanh – dưới ngưỡng · 1 Vàng – theo dõi · 2 Cam – nguy hiểm · 3 Đỏ – khẩn cấp
 *   null Xám – chưa có dữ liệu / mất tín hiệu: KHÔNG BAO GIỜ tô xanh như "an toàn" khi hệ thống không biết.
 *
 * Màu nền / viền / biểu đồ / bản đồ = biến CSS --good / --warn / --serious / --danger (src/index.css, cố định, không
 * đổi theo giao diện sáng – tối). Chữ màu trạng thái: text-good / -warn / -serious / -danger dùng --*-text (đủ tương
 * phản trên cả nền sáng lẫn nền tối). Chip (nhãn đặc): chữ ĐEN trên xanh lá / vàng / cam, chữ TRẮNG trên đỏ — tương phản
 * ≥ 4,5 : 1, đọc được ngoài nắng (chữ trắng trên cam chỉ 2,6 : 1, trên xanh lá 3,3 : 1).
 * Mức của từng loại đối tượng lấy theo màu backend trả (services/landslides.py…) — đổi ở đây,
 * không viết màu / ngưỡng riêng trong từng trang.
 *
 * Vàng là vàng chanh #F7C800 (từ 15/10/2026): #FAB219 cũ ngả hổ phách, cách Cam chỉ ΔE 13,6 (OKLab ×100, dưới ngưỡng 15)
 * — khó phân biệt Cấp 3 / Cấp 2 trên biểu đồ cột chồng, bản đồ. Nay Vàng–Cam 19,0 (người mù màu đỏ–lục 15,0), Cam–Đỏ giữ
 * 15,7. Không đẩy Cam đậm hơn: Cam #EA580C cách Vàng 20,3 nhưng cách Đỏ còn 8,9 — dễ nhầm Cấp 1 với Cấp 2, tệ hơn.
 */
export const RISK = [
  {
    level: 0, name: 'Xanh', meaning: 'Dưới ngưỡng', hex: '#0ca30c',
    chip: 'bg-good text-black', soft: 'border-good/50 bg-good/10', text: 'text-good', fill: 'bg-good', edge: 'border-l-good',
  },
  {
    level: 1, name: 'Vàng', meaning: 'Theo dõi', hex: '#f7c800',
    chip: 'bg-warn text-black', soft: 'border-warn/70 bg-warn/10', text: 'text-warn', fill: 'bg-warn', edge: 'border-l-warn',
  },
  {
    level: 2, name: 'Cam', meaning: 'Nguy hiểm', hex: '#ec835a',
    chip: 'bg-serious text-black', soft: 'border-serious/70 bg-serious/10', text: 'text-serious', fill: 'bg-serious', edge: 'border-l-serious',
  },
  {
    level: 3, name: 'Đỏ', meaning: 'Khẩn cấp', hex: '#d03b3b',
    chip: 'bg-danger text-white', soft: 'border-danger/70 bg-danger/10', text: 'text-danger', fill: 'bg-danger', edge: 'border-l-danger',
  },
];
export const NO_DATA = {
  level: null, name: 'Xám', meaning: 'Chưa có dữ liệu', hex: '#64748b',
  chip: 'bg-panel2 text-muted', soft: 'border-dashed border-line', text: 'text-muted', fill: 'bg-line', edge: 'border-l-line',
};

/** Kiểu hiển thị của một mức (0–3); null / undefined / ngoài khoảng → Xám (chưa có dữ liệu). */
export const risk = (level) => (Number.isInteger(level) && level >= 0 && level <= 3 ? RISK[level] : NO_DATA);

// Mức theo trạng thái backend trả (khớp màu green / orange / red / gray của máy chủ); mã không có trong bảng → null
export const LANDSLIDE_LEVEL = { thong_suot: 0, canh_bao: 2, cam_duong: 3 }; // services/landslides.py TRAFFIC
export const HAZARD_LEVEL = { an_toan: 0, binh_thuong: 0, vang: 1, cam: 2, do: 3 }; // LEVEL (do/cam/vang), hazard_points
export const TILT_LEVEL = { binh_thuong: 0, canh_bao: 2, nguy_hiem: 3 }; // cảm biến nghiêng taluy — tilt_info.tilt_level
export const levelOf = (table, code) => (code in table ? table[code] : null);

/**
 * Mưa 24 giờ (mm) → mức. MỘT thang cho mọi màn (ô chỉ số, trạm trên bản đồ, cổng công khai). Ngưỡng do cán bộ khai báo
 * (Nhập dữ liệu → Ngưỡng cảnh báo, máy chủ trả ở GET /public/config — App gọi `setRainThresholds`); chưa khai báo → mặc
 * định theo thuật ngữ KTTV: ≥ 50 mm mưa to (Vàng), ≥ 100 mm mưa rất to (Cam), ≥ 200 mm ở vùng núi Cao Bằng thường kéo theo
 * lũ quét, sạt lở (Đỏ). Đây là màu báo để theo dõi, KHÔNG phải cấp độ rủi ro thiên tai chính thức.
 */
let RAIN_T = { vang: 50, cam: 100, do: 200 };
export const rainThresholds = () => RAIN_T;
export function setRainThresholds(t) {
  if (t && [t.vang, t.cam, t.do].every(Number.isFinite) && (t.vang !== RAIN_T.vang || t.cam !== RAIN_T.cam || t.do !== RAIN_T.do)) {
    RAIN_T = { vang: t.vang, cam: t.cam, do: t.do };
  }
}
export const rainLevel = (mm) => (mm == null ? null : mm >= RAIN_T.do ? 3 : mm >= RAIN_T.cam ? 2 : mm >= RAIN_T.vang ? 1 : 0);
// Nhãn ngắn theo mức — vừa góc thẻ KPI
export const rainLabel = (lv) => ['Chưa tới mưa to', 'Mưa to', 'Mưa rất to', `Mưa ≥ ${RAIN_T.do} mm`][lv] ?? '';

/**
 * Dự trữ (%) so với định mức an toàn của kho, sức chứa điểm nhiên liệu, bình nhiên liệu phương tiện → mức (thiết kế C.2):
 * dưới 20 % Đỏ — cạn kiệt (phương tiện báo nhiên liệu dưới 20 % không được gợi ý điều động — FUEL_LOW,
 * services/logistics.py); dưới 50 % Vàng — theo dõi, lên kế hoạch bổ sung; còn lại Xanh. Chưa có định mức / chưa ai báo →
 * null (Xám). Cam dành cho hàng sắp hết hạn dùng (EXPIRY_DAYS ngày, như resources.py).
 */
export const STOCK_LOW = 20;
export const STOCK_WATCH = 50;
export const EXPIRY_DAYS = 30;
export const stockLevel = (pct) => (pct == null || Number.isNaN(Number(pct)) ? null : pct < STOCK_LOW ? 3 : pct < STOCK_WATCH ? 1 : 0);

/**
 * Điểm sơ tán: số người đang ở / sức chứa → mức (biểu tượng trên bản đồ, cổng công khai, Điều hành cứu hộ): đầy / quá tải
 * (≥ 100 %) Đỏ, sắp đầy (trên 85 %) Cam, còn chỗ Xanh; chưa có sức chứa → null.
 */
export const OCCUPANCY_NEAR = 0.85;
export const occupancyLevel = (current, capacity) => {
  if (!capacity) return null;
  const r = (current || 0) / capacity;
  return r >= 1 ? 3 : r > OCCUPANCY_NEAR ? 2 : 0;
};

/** Phiếu SOS: quá hạn phản hồi hoặc cấp 1 → Đỏ; cấp 2 → Cam; cấp 3 → Vàng (như màu ưu tiên PRIORITY). */
export const sosLevel = (priority, overdue = false) => (overdue || priority === 1 ? 3 : priority === 2 ? 2 : 1);
