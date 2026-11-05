#!/usr/bin/env node
// Nạp bộ tệp giả lập qua đúng API nhập dữ liệu (kiểm tra → ghi), theo thứ tự trong tep/muc_luc.json.
//   node tests/du-lieu-gia-lap/nap.mjs [http://localhost:8000] [--lan-hai]
// --lan-hai: nạp lại trên dữ liệu đã có, kiểm tra không phát sinh bản ghi mới.
// Biến môi trường: ADMIN_USER, ADMIN_PASS (mặc định admin / admin123 của stack dev).
// CHỈ cho chạy với máy chủ trên máy này: dữ liệu giả không được lọt vào hệ thống thật (xem README cùng thư mục).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = (process.argv.slice(2).find((a) => a.startsWith('http')) || 'http://localhost:8000').replace(/\/$/, '');
const BASE = `${ROOT}/api/v1`;
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tep');
if (!['localhost', '127.0.0.1'].includes(new URL(ROOT).hostname)) {
  console.error(`Từ chối chạy với ${ROOT}: bộ dữ liệu giả lập chỉ dùng cho stack thử trên máy này.`);
  process.exit(2);
}

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failed += 1;
};
async function call(method, p, body, token) {
  const res = await fetch(BASE + p, {
    method,
    headers: { ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  try {
    return { status: res.status, data: JSON.parse(raw) };
  } catch {
    return { status: res.status, data: raw };
  }
}

const login = await call('POST', '/auth/login', { username: process.env.ADMIN_USER || 'admin', password: process.env.ADMIN_PASS || 'admin123' });
const admin = login.data?.token;
if (!admin) {
  console.error(`Không đăng nhập được (HTTP ${login.status}): ${JSON.stringify(login.data).slice(0, 160)}`);
  console.error('Tài khoản bắt buộc 2 lớp không dùng được với script này — chạy stack thử không đặt TOTP_REQUIRED_ROLES.');
  process.exit(1);
}

const mucLuc = JSON.parse(fs.readFileSync(path.join(DIR, 'muc_luc.json'), 'utf8'));
const danhMuc = (await call('GET', '/data-import/datasets', null, admin)).data || [];
const thieu = danhMuc.map((d) => d.name).filter((n) => !mucLuc.tep.some((t) => t.loai === n));
check('Bộ tệp có đủ mọi loại dữ liệu của hệ thống', danhMuc.length > 0 && thieu.length === 0, thieu.length ? `thiếu: ${thieu.join(', ')}` : `${danhMuc.length} loại`);

// Hạn sử dụng trong tệp tính từ ngày gốc: dời theo hôm nay để "sắp hết hạn" (dưới 30 ngày) luôn có dữ liệu thử
const doiNgay = (text) => {
  const lech = Math.round((Date.now() - Date.parse(mucLuc.ngay_goc)) / 86_400_000);
  return text.replace(/\b(20\d\d-\d\d-\d\d)\s*$/gm, (d) => new Date(Date.parse(d) + lech * 86_400_000).toISOString().slice(0, 10));
};
const gui = (loai, buoc, ten, noiDung) => {
  const f = new FormData();
  f.append('file', new Blob([noiDung]), ten);
  f.append('mode', 'upsert');
  return call('POST', `/data-import/datasets/${loai}/${buoc}`, f, admin);
};

let them = 0;
let capNhat = 0;
for (const { loai, tep, so_dong: soDong } of mucLuc.tep) {
  let noiDung = fs.readFileSync(path.join(DIR, tep), 'utf8');
  if (loai === 'ton_kho') noiDung = doiNgay(noiDung);
  const kt = await gui(loai, 'validate', tep, noiDung);
  const loi = kt.data?.errors || [];
  if (kt.status !== 200 || !kt.data?.ok || kt.data.total !== soDong) {
    check(`${tep}: kiểm tra`, false, `HTTP ${kt.status}, ${kt.data?.total ?? '?'}/${soDong} dòng, ${kt.data?.error_count ?? '?'} lỗi: ${JSON.stringify(loi.slice(0, 3)).slice(0, 300)}${typeof kt.data === 'string' ? kt.data.slice(0, 200) : ''}`);
    continue;
  }
  const ghi = await gui(loai, 'apply', tep, noiDung);
  const bc = ghi.data?.report || ghi.data;
  them += bc?.creates || 0;
  capNhat += bc?.updates || 0;
  const canhBao = kt.data.warnings || [];
  check(`${tep}`, ghi.status === 200 && !canhBao.length, `${soDong} dòng · thêm ${bc?.creates ?? '?'} · cập nhật ${bc?.updates ?? '?'}${canhBao.length ? ` · ${canhBao.length} cảnh báo, VD: ${canhBao[0].message}` : ''}${ghi.status === 200 ? '' : ` · HTTP ${ghi.status} ${JSON.stringify(ghi.data).slice(0, 200)}`}`);
}
console.log(`Tổng: thêm ${them}, cập nhật ${capNhat}`);
if (process.argv.includes('--lan-hai')) check('Nạp lại không thêm bản ghi nào (không nhân đôi)', them === 0, `thêm ${them}`);

// Dữ liệu vào đúng chỗ người dùng nhìn thấy, không chỉ báo "đã ghi"
const dem = async (p) => {
  const r = await call('GET', p, null, admin);
  return Array.isArray(r.data) ? r.data.length : -1;
};
const soDong = Object.fromEntries(mucLuc.tep.map((t) => [t.loai, t.so_dong]));
for (const [ten, p, loai] of [
  ['Lực lượng', '/resources/forces', 'luc_luong'],
  ['Phương tiện', '/resources/vehicles', 'phuong_tien'],
  ['Kho vật tư', '/resources/warehouses', 'kho'],
  ['Điểm sơ tán', '/resources/evacuation-sites', 'diem_so_tan'],
  ['Điểm cấp nhiên liệu', '/resources/fuel-depots', 'cay_xang'],
  ['Trạm quan trắc', '/stations', 'tram_quan_trac'],
]) {
  const n = await dem(p);
  check(`Trang hiển thị đủ: ${ten}`, n >= soDong[loai], `${n}/${soDong[loai]}`);
}
const banDo = (await call('GET', '/public/map')).data;
check('Cổng công khai có điểm sơ tán đã nhập', (banDo?.evacuation_sites?.length || 0) >= soDong.diem_so_tan, `${banDo?.evacuation_sites?.length}`);
const hotline = (await call('GET', '/public/hotlines')).data;
check('Cổng công khai có đường dây nóng', Array.isArray(hotline) ? hotline.length > 0 : !!hotline, JSON.stringify(hotline).slice(0, 80));

console.log(failed ? `\n${failed} MỤC LỖI` : '\nNạp xong, không có lỗi');
process.exit(failed ? 1 : 0);
