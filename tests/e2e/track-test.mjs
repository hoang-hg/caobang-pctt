#!/usr/bin/env node
// Kiểm thử tra cứu tiến độ phiếu SOS / phản ánh trên cổng công khai (POST /api/v1/public/track).
// Tự tạo dữ liệu, không phụ thuộc mã phiếu cố định. Chạy: node tests/e2e/track-test.mjs [http://localhost:8000]
// Chạy lại nhiều lần: xoá khoá rl:* trong Redis trước (giới hạn 5 phản ánh/giờ/IP).
const ROOT = process.argv[2] || 'http://localhost:8000';
const BASE = ROOT + '/api/v1';

async function call(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}
let failed = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failed++;
};
const login = async (u, p) => (await call('POST', '/auth/login', { username: u, password: p })).data?.token;
const track = (code, phone) => call('POST', '/public/track', { code, phone });

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
const COBA = { lat: 22.905, lon: 105.775 };
const PHONE = `0999${String(Date.now()).slice(-6)}`;

function reportForm({ desc, phone }) {
  const f = new FormData();
  f.append('category', 'sat_lo');
  f.append('description', desc);
  f.append('lat', String(COBA.lat));
  f.append('lon', String(COBA.lon));
  if (phone) f.append('reporter_phone', phone);
  f.append('photos', new Blob([PNG], { type: 'image/png' }), 'anh.png');
  return f;
}

// ---- Dữ liệu thử
const mine = await call('POST', '/public/reports', reportForm({ desc: 'Đất đá sạt xuống taluy dương, lấp nửa mặt đường (kiểm thử tra cứu)', phone: PHONE }));
const anon = await call('POST', '/public/reports', reportForm({ desc: 'Nội dung phản ánh ẩn danh không được lộ ra ngoài (kiểm thử tra cứu)' }));
check('Tạo 2 phản ánh (có SĐT / ẩn danh)', mine.status === 201 && anon.status === 201, `${mine.data?.code} ${anon.data?.code}`);

const T = { trucban: await login('trucban', 'trucban123'), coba: await login('admin.coba', 'admincoba123') };
const sos = await call('POST', '/sos', { raw_message: 'Kiểm thử tra cứu', reporter_phone: PHONE, lat: COBA.lat, lon: COBA.lon, incident_type: 'sat_lo', priority: 2, trapped_count: 1, address: 'Thôn thử nghiệm' }, T.trucban);
check('Cán bộ tạo phiếu SOS có SĐT người báo', sos.status === 200 && !!sos.data?.code, sos.data?.code);
await call('PATCH', `/sos/${sos.data.id}`, { notes: 'GHI_CHU_NOI_BO_KHONG_CONG_KHAI' }, T.trucban);

// ---- Người gửi tra cứu đúng mã + SĐT
const r1 = await track(mine.data.code, PHONE);
const it1 = r1.data?.results?.[0];
check('Đúng mã + đúng SĐT → thấy phiếu và nội dung', r1.status === 200 && r1.data.total === 1 && r1.data.verified && it1.description?.includes('taluy'));
check('Có 4 mốc tiến độ, mốc 1 đã xong', it1?.timeline?.length === 4 && it1.timeline[0].state === 'done');
check('Nhập mã không gạch nối, chữ thường, SĐT dạng +84 vẫn khớp', (await track(mine.data.code.toLowerCase().replace('-', ' '), '+84' + PHONE.slice(1))).data?.total === 1);

// ---- Chống dò / liệt kê
check('Đúng mã + sai SĐT → như không tồn tại', (await track(mine.data.code, '0999000000')).data?.total === 0);
check('Đúng mã, không nhập SĐT (phiếu có SĐT) → như không tồn tại', (await track(mine.data.code)).data?.total === 0);
for (const q of ['SOS', 'PA-', '100', PHONE]) {
  check(`Chuỗi "${q}" không liệt kê được phiếu`, (await track(q, PHONE)).data?.total === 0);
}
check('GET /track không còn dùng (SĐT không nằm trên URL)', (await call('GET', `/public/track?code=${mine.data.code}`)).status === 405);

// ---- Phản ánh ẩn danh: chỉ tiến độ, không lộ nội dung
const r2 = await track(anon.data.code);
const it2 = r2.data?.results?.[0];
check('Phản ánh ẩn danh tra bằng mã → chỉ có tiến độ', r2.data?.total === 1 && !r2.data.verified && it2.description == null && it2.address == null);
check('Không lộ nội dung phản ánh ẩn danh', !JSON.stringify(r2.data).includes('không được lộ'));

// ---- Lý do từ chối là nội bộ
const anonRow = (await call('GET', '/reports?status=cho_duyet', null, T.coba)).data?.items?.find((x) => x.code === anon.data.code);
await call('POST', `/reports/${anonRow.id}/moderate`, { action: 'reject', reject_reason: 'LY_DO_NOI_BO_BI_MAT' }, T.coba);
const r3 = await track(anon.data.code);
check('Từ chối → mốc "rejected", không lộ lý do nội bộ', r3.data?.results?.[0]?.timeline?.[1]?.state === 'rejected' && !JSON.stringify(r3.data).includes('LY_DO_NOI_BO'));

// ---- SOS
const r4 = await track(sos.data.code, PHONE);
check('Người báo tin tra được phiếu SOS', r4.data?.total === 1 && r4.data.results[0].type === 'sos');
check('Không lộ ghi chú nội bộ của phiếu SOS', !JSON.stringify(r4.data).includes('GHI_CHU_NOI_BO'));
check('SOS: sai SĐT → như không tồn tại', (await track(sos.data.code, '0999000000')).data?.total === 0);
const SENSITIVE = ['reporter_phone"', 'reporter_name', 'raw_message', 'lat"', 'lon"', 'reject_reason', 'notes'];
const leaked = SENSITIVE.filter((k) => JSON.stringify([r1.data, r2.data, r3.data, r4.data]).includes(`"${k}`));
check('Không trả trường nhạy cảm', leaked.length === 0, leaked.join(', '));

check('Mã không tồn tại → rỗng', (await track('SOS-9999999', PHONE)).data?.total === 0);

console.log(failed ? `\n${failed} kiểm tra KHÔNG đạt` : '\nTất cả kiểm tra tra cứu tiến độ đạt');
process.exit(failed ? 1 : 0);
