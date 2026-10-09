#!/usr/bin/env node
// Kiểm thử giám sát hồ chứa & xả lũ (API công khai + dashboard).
// Chạy: node tests/e2e/reservoir-test.mjs [http://localhost:8000]
const BASE = (process.argv[2] || 'http://localhost:8000') + '/api/v1';
let failed = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failed++;
};
const get = async (path, token) => (await fetch(BASE + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} })).json();

const data = await get('/public/reservoirs');
const rs = data.reservoirs || [];
check('Có danh sách hồ chứa', rs.length >= 6, `${rs.length} hồ`);
check('Mỗi hồ có mực nước, MNDBT, cửa xả, trạng thái, khuyến cáo', rs.every((r) =>
  r.current_level != null && r.normal_level != null && r.spill_gates != null && r.status_label && r.downstream_warning));
check('Hồ chưa mở cửa xả → "Chưa xả tràn" (hồ đầy tới MNDBT không phải xả khẩn cấp)',
  rs.filter((r) => !r.spill_gates_open && r.updated_at).every((r) => r.status_code === 'binh_thuong'));
check('Hồ có số liệu vận hành (dữ liệu mẫu) mang thời điểm số liệu', rs.every((r) => r.updated_at && r.status_code !== 'chua_co_so_lieu'));
check('Hồ đang mở cửa → trạng thái xả', rs.filter((r) => r.spill_gates_open > 0).every((r) => r.status_code !== 'binh_thuong'));
check('Khuyến cáo không nói "mở 0 cửa"', !rs.some((r) => /mở 0\//.test(r.downstream_warning)));
check('Đếm hồ đang xả khớp danh sách', data.spill_count === rs.filter((r) => r.status_code === 'xa_dieu_tiet' || r.status_code === 'xa_khan_cap').length &&
  data.emergency_count === rs.filter((r) => r.status_code === 'xa_khan_cap').length);
check('Tổng xả = tổng từng hồ', Math.abs(data.total_outflow_m3s - rs.reduce((s, r) => s + r.outflow_m3s, 0)) < 1);
check('Nhóm theo lưu vực sông', (data.basins || []).reduce((s, b) => s + b.reservoirs_count, 0) === rs.length);

const ov = await get('/public/overview');
check('Tổng quan công khai có số liệu hồ chứa', ov.reservoirs?.total === rs.length && ov.reservoirs?.spill_count === data.spill_count);
const map = await get('/public/map');
check('Bản đồ công khai có lớp hồ chứa', map.reservoirs?.length === rs.length);

const tok = (await (await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'canbo.coba', password: 'coba123' }) })).json()).token;
const k = await get('/dashboard/kpis', tok);
check('Dashboard cán bộ xã chỉ thấy hồ trong xã', (k.reservoirs?.reservoirs || []).every((r) => r.admin_code === 'CB-COBA'), `${k.reservoirs?.total} hồ`);

// Tab Hồ chứa của Tổng quan theo bộ lọc địa phương (thiết kế F.1): /dashboard/reservoirs — cùng dạng /public/reservoirs,
// cùng hàm lọc với ô KPI. Chỉ so số hồ giữa các lần gọi (bộ mô phỏng có thể đổi trạng thái xả giữa hai lần gọi)
const admin = (await (await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) })).json()).token;
const all = await get('/dashboard/reservoirs', admin);
check('Tab Hồ chứa toàn tỉnh: đủ hồ như cổng công khai', all.total_reservoirs === rs.length && all.reservoirs.length === rs.length, `${all.total_reservoirs} hồ`);
const codes = [...new Set(rs.map((r) => r.admin_code).filter(Boolean))].slice(0, 2);
const part = await get(`/dashboard/reservoirs?admin_codes=${codes.join(',')}`, admin);
const kp = await get(`/dashboard/kpis?admin_codes=${codes.join(',')}`, admin);
check('Lọc theo xã: chỉ hồ của các xã đó, đếm / lưu vực tính lại, cùng số hồ với ô KPI',
  part.reservoirs.every((r) => codes.includes(r.admin_code)) && part.total_reservoirs === rs.filter((r) => codes.includes(r.admin_code)).length &&
  part.total_reservoirs === kp.reservoirs.total && part.basins.reduce((s, b) => s + b.reservoirs_count, 0) === part.total_reservoirs &&
  part.spill_count === part.reservoirs.filter((r) => ['xa_dieu_tiet', 'xa_khan_cap'].includes(r.status_code)).length,
  `${codes.join(', ')}: ${part.total_reservoirs} hồ`);
const xa = await get('/dashboard/reservoirs', tok);
check('Cán bộ xã: tab Hồ chứa chỉ hồ trong xã', (xa.reservoirs || []).every((r) => r.admin_code === 'CB-COBA') && xa.total_reservoirs === k.reservoirs.total, `${xa.total_reservoirs} hồ`);
check('Tab Hồ chứa cần đăng nhập', (await fetch(BASE + '/dashboard/reservoirs')).status === 401);

console.log(failed ? `\n${failed} kiểm tra KHÔNG đạt` : '\nTất cả kiểm tra hồ chứa đạt');
process.exit(failed ? 1 : 0);
