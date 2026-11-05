#!/usr/bin/env node
// Nạp bộ tệp giả lập qua đúng API nhập dữ liệu (kiểm tra → ghi), theo thứ tự trong tep/muc_luc.json.
//   node tests/du-lieu-gia-lap/nap.mjs [http://localhost:8000] [--lan-hai] [--kem-so-do | --chi-so-do]
// --lan-hai: nạp lại trên dữ liệu đã có, kiểm tra không phát sinh bản ghi mới.
// --kem-so-do: nạp xong gửi số đo mẫu 3,5 giờ qua cho mọi trạm; --chi-so-do: chỉ gửi số đo (làm mới khi số đo đã cũ).
// Biến môi trường: ADMIN_USER, ADMIN_PASS (mặc định admin / admin123 của stack dev), ADMIN_OTP (mã 6 số nếu tài khoản bật 2 lớp).
// Mặc định chỉ chạy với máy chủ trên máy này: dữ liệu giả không được lọt vào hệ thống thật. Máy thử cho chuyên gia: thêm
// --may-thu=<tên máy đúng như trong địa chỉ> và tự đặt ADMIN_USER, ADMIN_PASS — xem README cùng thư mục.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const ROOT = (args.find((a) => a.startsWith('http')) || 'http://localhost:8000').replace(/\/$/, '');
const SO_DO = args.includes('--kem-so-do') || args.includes('--chi-so-do');
const CHI_SO_DO = args.includes('--chi-so-do');
const BASE = `${ROOT}/api/v1`;
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tep');
const host = new URL(ROOT).hostname;
const tuMayNay = ['localhost', '127.0.0.1'].includes(host);
if (!tuMayNay) {
  const khai = args.find((a) => a.startsWith('--may-thu='))?.slice('--may-thu='.length);
  if (khai !== host) {
    console.error(`Từ chối chạy với ${ROOT}: bộ dữ liệu giả lập không được nạp vào hệ thống thật.`);
    console.error(`Nếu đây đúng là máy thử, không phục vụ người dân: thêm --may-thu=${host} (xem README cùng thư mục).`);
    process.exit(2);
  }
  if (!process.env.ADMIN_USER || !process.env.ADMIN_PASS) {
    console.error('Máy thử không có mật khẩu mặc định: đặt ADMIN_USER, ADMIN_PASS (và ADMIN_OTP nếu tài khoản bật 2 lớp).');
    process.exit(2);
  }
  console.log(`Nạp dữ liệu GIẢ LẬP vào máy thử ${host}. Cổng công khai của máy này sẽ hiện điểm sơ tán, số điện thoại không có thật.\n`);
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
let admin = login.data?.token;
if (!admin && login.data?.mfa === 'verify') {
  if (!process.env.ADMIN_OTP) {
    console.error('Tài khoản đã bật 2 lớp: đặt ADMIN_OTP = mã 6 số đang hiện trong ứng dụng xác thực rồi chạy ngay.');
    process.exit(1);
  }
  const otp = await call('POST', '/auth/mfa/verify', { challenge: login.data.challenge, code: process.env.ADMIN_OTP });
  admin = otp.data?.token;
  if (!admin) {
    console.error(`Mã 2 lớp không được nhận (HTTP ${otp.status}): ${JSON.stringify(otp.data).slice(0, 160)}`);
    process.exit(1);
  }
}
if (!admin) {
  console.error(`Không đăng nhập được (HTTP ${login.status}): ${JSON.stringify(login.data).slice(0, 160)}`);
  if (login.data?.mfa === 'setup') console.error('Tài khoản bắt buộc 2 lớp nhưng chưa cài: đăng nhập trên giao diện để cài trước.');
  process.exit(1);
}

/**
 * Số đo mẫu 3,5 giờ qua qua đúng API thiết bị, để trạm trên cổng và trang nội bộ có số. Thiết bị tạm xoá ngay sau khi gửi.
 * Vượt báo động II: hệ thống tự khoanh vùng, tạo phiếu, soạn nháp cảnh báo — tình huống cho chuyên gia xử lý, duyệt.
 */
async function guiSoDo() {
  const dong = fs.readFileSync(path.join(DIR, '04_tram_quan_trac.csv'), 'utf8').replace(/^\uFEFF/, '').trim().split('\n').slice(1);
  const tram = dong.map((d) => {
    const cot = d.match(/("[^"]*"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, ''));
    return { id: cot[0], loai: cot[2], bd: [Number(cot[5]), Number(cot[6]), Number(cot[7])] };
  });
  // Giá trị cuối theo từng trạm; trạm đầu mỗi loại vượt ngưỡng, còn lại dưới ngưỡng để có đủ các mức
  const cuoi = (t, i) => {
    if (t.loai === 'muc_nuoc') return i === 0 ? t.bd[1] + 0.4 : i === 1 ? t.bd[0] + 0.2 : t.bd[0] - 1;
    if (t.loai === 'luong_mua') return [32, 24, 18, 12, 9, 6, 4, 3, 1, 0][i % 10];
    if (t.loai === 'do_nghieng') return i === 0 ? t.bd[1] + 0.4 : 0.2;
    return i === 0 ? t.bd[1] + 2 : t.bd[0] - 6;
  };
  const dem = {};
  let duoc = 0;
  let loi = 0;
  const DIEM = 8;
  for (const t of tram) {
    const i = dem[t.loai] ?? 0;
    dem[t.loai] = i + 1;
    const id = `GIA-LAP-${t.id}`;
    await call('DELETE', `/integrations/devices/${id}`, null, admin); // lần chạy trước dừng giữa chừng
    const tb = await call('POST', '/integrations/devices', { id, name: `Số đo mẫu ${t.id} (giả lập)`, protocol: 'http', station_id: t.id, expected_interval_s: 86_400 }, admin);
    if (tb.status !== 201) {
      loi += 1;
      console.log(`FAIL  Đăng ký thiết bị ${t.id} — HTTP ${tb.status} ${JSON.stringify(tb.data).slice(0, 120)}`);
      continue;
    }
    const dich = cuoi(t, i);
    for (let k = 0; k < DIEM; k += 1) {
      // Lên dần tới giá trị cuối (mưa: dao động); làm tròn như số đo thật
      const giam = t.loai === 'luong_mua' ? dich * 0.5 * Math.abs(Math.sin(k)) : (DIEM - 1 - k) * (t.loai === 'muc_nuoc' ? 0.2 : t.loai === 'do_nghieng' ? 0.1 : 1.5);
      const value = Math.round(Math.max(0, dich - giam) * 100) / 100;
      const time = new Date(Date.now() - (DIEM - 1 - k) * 1_800_000).toISOString();
      const res = await fetch(`${BASE}/ingest/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Device-Key': tb.data.api_key },
        body: JSON.stringify({ device_id: id, value, time }),
      });
      if (res.status === 200) duoc += 1;
      else loi += 1;
      await res.text();
    }
    await call('DELETE', `/integrations/devices/${id}`, null, admin);
  }
  check('Gửi số đo mẫu', loi === 0 && duoc === tram.length * DIEM, `${duoc}/${tram.length * DIEM} số đo, ${tram.length} trạm`);
  await new Promise((r) => setTimeout(r, 3000));
  const coSo = ((await call('GET', '/stations', null, admin)).data || []).filter((s) => tram.some((t) => t.id === s.id) && s.value != null).length;
  check('Trạm hiện số đo', coSo === tram.length, `${coSo}/${tram.length}`);
}

if (CHI_SO_DO) {
  await guiSoDo();
  console.log(failed ? `\n${failed} MỤC LỖI` : '\nGửi số đo xong, không có lỗi');
  process.exit(failed ? 1 : 0);
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

if (SO_DO) await guiSoDo();

console.log(failed ? `\n${failed} MỤC LỖI` : '\nNạp xong, không có lỗi');
process.exit(failed ? 1 : 0);
