#!/usr/bin/env node
// Kiểm thử giám sát điểm đen sạt trượt & đường đèo (API công khai + dashboard).
// Trạng thái phải tính từ dữ liệu thật: vùng nguy hiểm, đường bị chia cắt, cảm biến — không ghi cứng.
// Chạy: node tests/e2e/landslide-test.mjs [http://localhost:8000]
const BASE = (process.argv[2] || 'http://localhost:8000') + '/api/v1';
let failed = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failed++;
};
const get = async (path, token) => (await fetch(BASE + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} })).json();

const data = await get('/public/landslides');
const pts = data.points || [];
check('Có danh mục điểm đen', pts.length >= 10, `${pts.length} điểm`);
check('Đếm trạng thái khớp danh sách',
  data.blocked_count === pts.filter((p) => p.traffic_status === 'cam_duong').length &&
  data.warning_count === pts.filter((p) => p.traffic_status === 'canh_bao').length &&
  data.blocked_count + data.warning_count + data.safe_count === pts.length);
check('Mỗi điểm có trạng thái, mức nguy cơ, khuyến cáo', pts.every((p) => p.traffic_label && p.risk_label && p.response_action));
check('Xã/phường tra theo toạ độ (ranh giới 2 cấp, không còn "H." / "Thị trấn")',
  pts.filter((p) => p.admin_name).length >= pts.length - 1 && !pts.some((p) => /^(H\.|Thị trấn|Huyện)/.test(p.admin_name || '')));
check('Có điểm chịu ảnh hưởng vùng sạt lở đang hiệu lực (dữ liệu mô phỏng)', pts.some((p) => p.risk_level !== 'binh_thuong'));
check('Cảm biến nghiêng: mức theo ngưỡng BĐ', pts.filter((p) => p.tilt_info).every((p) =>
  (p.tilt_info.tilt_level === 'nguy_hiem') === (p.tilt_info.current_tilt_deg >= p.tilt_info.alarm_threshold)));
check('Mưa 24h là số đo thật (không có giá trị mặc định cố định)', !pts.some((p) => p.rain_info?.rain_24h_mm === 18.5));
const text = JSON.stringify(data);
check('Không có nội dung sự cố ghi cứng / gán cho cơ quan', !/Sở Giao thông|UBND huyện|1\.200 m³|3 giờ nữa|sơ tán khẩn cấp 18 hộ/.test(text));
check('Không lộ vị trí lực lượng', !/force|personnel|vehicle/i.test(Object.keys(pts[0] || {}).join(',')));

const ov = await get('/public/overview');
check('Tổng quan công khai có số liệu sạt lở', ov.landslides?.total === pts.length);
const map = await get('/public/map');
check('Bản đồ công khai có lớp điểm đen', map.landslides?.length === pts.length);

// Dashboard lọc theo phạm vi: cán bộ xã Cô Ba chỉ thấy điểm trong xã mình
const tok = (await (await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'canbo.coba', password: 'coba123' }) })).json()).token;
const k = await get('/dashboard/kpis', tok);
check('Dashboard cán bộ xã chỉ thấy điểm đen trong xã', (k.landslides?.points || []).every((p) => p.admin_code === 'CB-COBA'), `${k.landslides?.total} điểm`);

console.log(failed ? `\n${failed} kiểm tra KHÔNG đạt` : '\nTất cả kiểm tra sạt trượt & đường đèo đạt');
process.exit(failed ? 1 : 0);
