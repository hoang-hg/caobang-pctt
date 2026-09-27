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
  rs.filter((r) => !r.spill_gates_open).every((r) => r.status_code === 'binh_thuong'));
check('Hồ đang mở cửa → trạng thái xả', rs.filter((r) => r.spill_gates_open > 0).every((r) => r.status_code !== 'binh_thuong'));
check('Khuyến cáo không nói "mở 0 cửa"', !rs.some((r) => /mở 0\//.test(r.downstream_warning)));
check('Đếm hồ đang xả khớp danh sách', data.spill_count === rs.filter((r) => r.status_code !== 'binh_thuong').length &&
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

console.log(failed ? `\n${failed} kiểm tra KHÔNG đạt` : '\nTất cả kiểm tra hồ chứa đạt');
process.exit(failed ? 1 : 0);
