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
  data.no_data_count === pts.filter((p) => p.traffic_status === 'chua_co_du_lieu').length &&
  data.blocked_count + data.warning_count + data.safe_count + data.no_data_count === pts.length);
// Không cảm biến báo số đo, không vùng nguy hiểm (mức "bình thường") → xám "Chưa có dữ liệu giám sát", không xanh
check('Điểm không có bằng chứng giám sát không hiện "Chưa ghi nhận nguy cơ"',
  pts.every((p) => p.monitored || p.risk_level !== 'binh_thuong' || p.traffic_status !== 'thong_suot') &&
  pts.filter((p) => p.traffic_status === 'chua_co_du_lieu').every((p) => p.traffic_color === 'gray' && !p.monitored));
check('Mỗi điểm có trạng thái, mức nguy cơ, khuyến cáo', pts.every((p) => p.traffic_label && p.risk_label && p.response_action));
check('Bản trình diễn có sơ đồ đường → xác định được đoạn bị chia cắt', data.roads_available === true);
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

// Heatmap cảm biến cảnh báo sớm (tab Sạt lở): độ nghiêng + độ ẩm đất, giá trị lớn nhất từng giờ trong 48 giờ qua
const admin = (await (await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) })).json()).token;
const hs = await get('/dashboard/landslide-sensors?hours=48', admin);
const sensors = hs.sensors || [];
const hourMs = 3_600_000;
check('Cảm biến sạt lở: chỉ độ nghiêng / độ ẩm đất, có ngưỡng BĐ', sensors.length > 0 &&
  sensors.every((s) => ['do_nghieng', 'do_am_dat'].includes(s.type) && s.thresholds?.bd1 != null), `${sensors.length} cảm biến`);
check('Cảm biến sạt lở: chuỗi theo giờ, trong 48 giờ qua, mỗi giờ một giá trị',
  sensors.every((s) => s.series.length <= 49 && s.series.every((p, i) => new Date(p.time).getTime() % hourMs === 0 &&
    Date.now() - new Date(p.time).getTime() <= 49 * hourMs && (i === 0 || new Date(p.time) > new Date(s.series[i - 1].time)))) &&
  sensors.some((s) => s.series.length >= 24), sensors.map((s) => `${s.id} ${s.series.length}`).join(', '));
check('Cảm biến sạt lở: giờ hiện tại ≥ số đo mới nhất (lấy giá trị lớn nhất trong giờ)',
  sensors.filter((s) => s.value != null && s.series.length).every((s) => s.series[s.series.length - 1].max >= Math.round(s.value * 100) / 100 - 0.01));
check('Cảm biến sạt lở: số giờ ngoài 6–168 bị từ chối', (await fetch(BASE + '/dashboard/landslide-sensors?hours=2', { headers: { Authorization: `Bearer ${admin}` } })).status === 422);
const hsXa = await get('/dashboard/landslide-sensors', tok);
check('Cảm biến sạt lở: cán bộ xã chỉ thấy cảm biến trong xã', (hsXa.sensors || []).length < sensors.length, `${hsXa.sensors?.length} / ${sensors.length}`);

// Tab Sạt lở của Tổng quan theo bộ lọc địa phương: /dashboard/landslides — cùng dạng /public/landslides, cùng số với ô KPI
const lsAll = await get('/dashboard/landslides', admin);
check('Tab Sạt lở toàn tỉnh: đủ điểm như cổng công khai', lsAll.total_points === pts.length, `${lsAll.total_points} điểm`);
const lcodes = [...new Set(pts.map((p) => p.admin_code).filter(Boolean))].slice(0, 3);
const lpart = await get(`/dashboard/landslides?admin_codes=${lcodes.join(',')}`, admin);
const lk = await get(`/dashboard/kpis?admin_codes=${lcodes.join(',')}`, admin);
check('Sạt lở lọc theo xã: chỉ điểm của các xã đó, đếm / tuyến tính lại, cùng số điểm với ô KPI',
  lpart.points.every((p) => lcodes.includes(p.admin_code)) && lpart.total_points === pts.filter((p) => lcodes.includes(p.admin_code)).length &&
  lpart.total_points === lk.landslides.total && lpart.corridors.reduce((s, c) => s + c.count, 0) === lpart.total_points &&
  lpart.blocked_count === lpart.points.filter((p) => p.traffic_status === 'cam_duong').length,
  `${lcodes.join(', ')}: ${lpart.total_points} điểm`);
const lxa = await get('/dashboard/landslides', tok);
check('Cán bộ xã: tab Sạt lở chỉ điểm trong xã', (lxa.points || []).every((p) => p.admin_code === 'CB-COBA'), `${lxa.total_points} điểm`);

console.log(failed ? `\n${failed} kiểm tra KHÔNG đạt` : '\nTất cả kiểm tra sạt trượt & đường đèo đạt');
process.exit(failed ? 1 : 0);
