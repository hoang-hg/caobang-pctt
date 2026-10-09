/**
 * Thang màu rủi ro dùng chung TOÀN HỆ THỐNG (Dashboard, bản đồ, cổng công khai, biểu đồ, Kanban, cảnh báo):
 *   0 Xanh – dưới ngưỡng · 1 Vàng – theo dõi · 2 Cam – nguy hiểm · 3 Đỏ – khẩn cấp
 *   null Xám – chưa có dữ liệu / mất tín hiệu: KHÔNG BAO GIỜ tô xanh như "an toàn" khi hệ thống không biết.
 *
 * Màu nền / viền / biểu đồ / bản đồ = biến CSS --good / --warn / --serious / --danger (src/index.css, cố định, không
 * đổi theo giao diện sáng – tối). Chữ màu trạng thái: text-good / -warn / -serious / -danger dùng --*-text (đủ tương
 * phản trên cả nền sáng lẫn nền tối). Chip (nhãn đặc): chữ ĐEN trên xanh lá / vàng / cam, chữ TRẮNG trên đỏ — tương phản
 * ≥ 4,5 : 1, đọc được ngoài nắng (chữ trắng trên cam chỉ 2,6 : 1, trên xanh lá 3,3 : 1).
 * Mức của từng loại đối tượng lấy theo màu backend trả (services/reservoirs.py, services/landslides.py…) — đổi ở đây,
 * không viết màu / ngưỡng riêng trong từng trang.
 */
export const RISK = [
  {
    level: 0, name: 'Xanh', meaning: 'Dưới ngưỡng', hex: '#0ca30c',
    chip: 'bg-good text-black', soft: 'border-good/50 bg-good/10', text: 'text-good', fill: 'bg-good', edge: 'border-l-good',
  },
  {
    level: 1, name: 'Vàng', meaning: 'Theo dõi', hex: '#fab219',
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
export const RESERVOIR_LEVEL = { binh_thuong: 0, phat_dien: 0, xa_dieu_tiet: 2, xa_khan_cap: 3 }; // services/reservoirs.py
export const LANDSLIDE_LEVEL = { thong_suot: 0, canh_bao: 2, cam_duong: 3 }; // services/landslides.py TRAFFIC
export const HAZARD_LEVEL = { an_toan: 0, binh_thuong: 0, vang: 1, cam: 2, do: 3 }; // LEVEL (do/cam/vang), hazard_points
export const TILT_LEVEL = { binh_thuong: 0, canh_bao: 2, nguy_hiem: 3 }; // cảm biến nghiêng taluy — tilt_info.tilt_level
export const levelOf = (table, code) => (code in table ? table[code] : null);

/**
 * Mưa 24 giờ (mm) → mức. Thuật ngữ KTTV: mưa to 51–100 mm, mưa rất to > 100 mm / 24 giờ; ≥ 200 mm ở vùng núi Cao
 * Bằng thường kéo theo lũ quét, sạt lở → Đỏ. Đây là màu báo để theo dõi, KHÔNG phải cấp độ rủi ro thiên tai chính thức.
 */
export const rainLevel = (mm) => (mm == null ? null : mm >= 200 ? 3 : mm >= 100 ? 2 : mm >= 50 ? 1 : 0);
export const RAIN_LABEL = ['Chưa tới mưa to', 'Mưa to', 'Mưa rất to', 'Mưa ≥ 200 mm']; // nhãn ngắn — vừa góc thẻ KPI

/** Phiếu SOS: quá hạn phản hồi hoặc cấp 1 → Đỏ; cấp 2 → Cam; cấp 3 → Vàng (như màu ưu tiên PRIORITY). */
export const sosLevel = (priority, overdue = false) => (overdue || priority === 1 ? 3 : priority === 2 ? 2 : 1);
