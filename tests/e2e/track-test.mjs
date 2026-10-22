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
const COBA = { lat: 23.005, lon: 105.718 }; // trong xã Cô Ba theo ranh giới thật (seed/caobang_communes.geojson)
const BASE6 = Number(String(Date.now()).slice(-6));
const PHONE = `0999${String(BASE6).padStart(6, '0')}`;
const PHONE2 = `0999${String((BASE6 + 1) % 1e6).padStart(6, '0')}`; // tài khoản thứ hai

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

// Tài khoản người dân (Đ5): gửi phản ánh cần đăng nhập (CITIZEN_ACCOUNT_REQUIRED) — đăng ký, có rồi thì đăng nhập
async function citizenToken(phone, name = 'Người dân thử nghiệm') {
  const body = { full_name: name, phone, password: 'Nguoidan2026', consent: true };
  const r = await call('POST', '/public/account/register', body);
  if (r.status === 201) return r.data.token;
  return (await call('POST', '/public/account/login', { phone, password: body.password })).data?.token;
}

// ---- Dữ liệu thử: 2 phản ánh của 2 tài khoản người dân (gửi phản ánh cần đăng nhập — SĐT lấy từ tài khoản)
const mine = await call('POST', '/public/reports', reportForm({ desc: 'Đất đá sạt xuống taluy dương, lấp nửa mặt đường (kiểm thử tra cứu)' }), await citizenToken(PHONE));
const anon = await call('POST', '/public/reports', reportForm({ desc: 'Nội dung phản ánh không được lộ ra ngoài (kiểm thử tra cứu)' }), await citizenToken(PHONE2));
check('Tạo 2 phản ánh bằng 2 tài khoản người dân', mine.status === 201 && anon.status === 201, `${mine.data?.code} ${anon.data?.code}`);

const T = { trucban: await login('trucban', 'trucban123'), coba: await login('admin.coba', 'admincoba123') };
const sos = await call('POST', '/sos', { raw_message: 'Kiểm thử tra cứu', reporter_phone: PHONE, lat: COBA.lat, lon: COBA.lon, incident_type: 'sat_lo', priority: 2, trapped_count: 1, address: 'Thôn thử nghiệm' }, T.trucban);
check('Cán bộ tạo phiếu SOS có SĐT người báo', sos.status === 200 && !!sos.data?.code, sos.data?.code);
await call('PATCH', `/sos/${sos.data.id}`, { notes: 'GHI_CHU_NOI_BO_KHONG_CONG_KHAI' }, T.trucban);

// ---- Người gửi tra cứu đúng mã + SĐT
const r1 = await track(mine.data.code, PHONE);
const it1 = r1.data?.results?.[0];
check('Đúng mã + đúng SĐT → thấy phiếu, loại sự việc, tiến độ', r1.status === 200 && r1.data.total === 1 && r1.data.verified && it1.category_label === 'Sạt lở đất đá');
// Kể cả đúng SĐT cũng không trả nội dung / địa chỉ: lỡ bị dò trúng mã + SĐT không lộ nơi người đang ở
check('Không trả mô tả / địa chỉ (kể cả đúng SĐT)', it1.description === undefined && it1.address === undefined && !JSON.stringify(r1.data).includes('taluy'));
check('Có 4 mốc tiến độ, mốc 1 đã xong', it1?.timeline?.length === 4 && it1.timeline[0].state === 'done');
check('Nhập mã không gạch nối, chữ thường, SĐT dạng +84 vẫn khớp', (await track(mine.data.code.toLowerCase().replace('-', ' '), '+84' + PHONE.slice(1))).data?.total === 1);

// ---- Chống dò / liệt kê
check('Đúng mã + sai SĐT → như không tồn tại', (await track(mine.data.code, '0999000000')).data?.total === 0);
check('Đúng mã, không nhập SĐT (phiếu có SĐT) → như không tồn tại', (await track(mine.data.code)).data?.total === 0);
for (const q of ['SOS', 'PA-', '100', PHONE]) {
  check(`Chuỗi "${q}" không liệt kê được phiếu`, (await track(q, PHONE)).data?.total === 0);
}
check('GET /track không còn dùng (SĐT không nằm trên URL)', (await call('GET', `/public/track?code=${mine.data.code}`)).status === 405);

// ---- Mã PA-… tăng dần (đoán được) → không SĐT thì chỉ mã tra cứu đầy đủ (đuôi ngẫu nhiên cấp khi gửi) xem được
check('Gửi phản ánh nhận mã tra cứu PA-…-XXXXXX', /^PA-\d+-[A-Z]{6}$/.test(anon.data?.track_code || '') &&
  anon.data.track_code.startsWith(`${anon.data.code}-`), anon.data?.track_code);
check('Chỉ nhập mã phiếu, không SĐT (dò mã tăng dần) → như không tồn tại', (await track(anon.data.code)).data?.total === 0);
const wrongKey = `${anon.data.code}-${anon.data.track_code.endsWith('AAAAAA') ? 'BBBBBB' : 'AAAAAA'}`;
check('Sai đuôi mã tra cứu → như không tồn tại', (await track(wrongKey)).data?.total === 0);
const r2 = await track(anon.data.track_code);
const it2 = r2.data?.results?.[0];
check('Đúng mã tra cứu → thấy tiến độ, không cần SĐT', r2.data?.total === 1 && it2?.timeline?.length === 4 && it2.description == null && it2.address == null);
check('Mã tra cứu chữ thường, không gạch nối vẫn khớp', (await track(anon.data.track_code.toLowerCase().replaceAll('-', ''))).data?.total === 1);
check('Không lộ nội dung phản ánh', !JSON.stringify(r2.data).includes('không được lộ'));
check('Phản ánh có SĐT: mã tra cứu cũng dùng được', (await track(mine.data.track_code)).data?.total === 1);

// ---- Lý do từ chối là nội bộ
const anonRow = (await call('GET', '/reports?status=cho_duyet', null, T.coba)).data?.items?.find((x) => x.code === anon.data.code);
check('Cán bộ không thấy mã tra cứu của người gửi', anonRow && !JSON.stringify(anonRow).includes(anon.data.track_code.slice(-6)));
await call('POST', `/reports/${anonRow.id}/moderate`, { action: 'reject', reject_reason: 'LY_DO_NOI_BO_BI_MAT' }, T.coba);
const r3 = await track(anon.data.track_code);
check('Từ chối → mốc "rejected", không lộ lý do nội bộ', r3.data?.results?.[0]?.timeline?.[1]?.state === 'rejected' && !JSON.stringify(r3.data).includes('LY_DO_NOI_BO'));

// ---- SOS
const r4 = await track(sos.data.code, PHONE);
check('Người báo tin tra được phiếu SOS', r4.data?.total === 1 && r4.data.results[0].type === 'sos');
check('Không lộ ghi chú nội bộ của phiếu SOS', !JSON.stringify(r4.data).includes('GHI_CHU_NOI_BO'));
check('SOS: sai SĐT → như không tồn tại', (await track(sos.data.code, '0999000000')).data?.total === 0);
const SENSITIVE = ['reporter_phone"', 'reporter_name', 'raw_message', 'lat"', 'lon"', 'reject_reason', 'notes', 'track_key'];
const leaked = SENSITIVE.filter((k) => JSON.stringify([r1.data, r2.data, r3.data, r4.data]).includes(`"${k}`));
check('Không trả trường nhạy cảm', leaked.length === 0, leaked.join(', '));

check('Mã không tồn tại → rỗng', (await track('SOS-9999999', PHONE)).data?.total === 0);
check('SOS: không trả địa chỉ nơi người mắc kẹt', !JSON.stringify(r4.data).includes('Thôn thử nghiệm'));

// ---- Một chức năng gửi yêu cầu: "Cần cứu người" / "Cần tiếp tế" → phiếu SOS ngay, vào thẳng "Chờ xử lý"
function requestForm(category, desc, extra = {}) {
  const f = new FormData();
  f.append('category', category);
  f.append('description', desc);
  f.append('lat', String(COBA.lat));
  f.append('lon', String(COBA.lon));
  for (const [k, v] of Object.entries(extra)) for (const x of [].concat(v)) f.append(k, String(x));
  return f;
}
const tokMine = await citizenToken(PHONE);
const rescue = await call('POST', '/public/reports', requestForm('mac_ket',
  'Đất đá đổ vào nhà sau núi, 2 người kẹt trong bếp (kiểm thử yêu cầu cứu người)',
  { incident_type: 'sap_nha', trapped_count: 2, vulnerable: ['nguoi_gia'] }), tokMine);
check('Cần cứu người → tạo phiếu SOS ngay trong lần gửi', rescue.status === 201 && /^SOS-\d+$/.test(rescue.data?.sos_code || ''),
  `HTTP ${rescue.status} ${rescue.data?.sos_code || JSON.stringify(rescue.data).slice(0, 120)}`);
check('Sập nhà → ưu tiên Cấp 1 (người dân không tự chọn mức)', rescue.data?.priority === 1, String(rescue.data?.priority));
const floor = await call('POST', '/public/reports', requestForm('mac_ket',
  'Hết lương thực hai ngày, cần nước sạch cho cả nhà (kiểm thử cứu người)'), tokMine);
check('"Cần cứu người" không bao giờ dưới Cấp 2 (nội dung chỉ nói lương thực)', floor.status === 201 && floor.data?.priority === 2,
  String(floor.data?.priority));
const floorCard = ((await call('GET', '/sos', null, T.trucban)).data || []).find((t) => t.code === floor.data?.sos_code);
const dup = await call('POST', `/sos/${floorCard?.id}/close`, { reason: 'trung', note: `Trùng ${rescue.data?.sos_code}` }, T.trucban);
check('Đóng phiếu trùng → người dân thấy "trùng với yêu cầu khác"', dup.status === 200
  && (await track(floor.data?.code, PHONE)).data?.results?.[0]?.status_label === 'Đã đóng – trùng với yêu cầu khác');
const card = ((await call('GET', '/sos', null, T.trucban)).data || []).find((t) => t.code === rescue.data?.sos_code);
check('Phiếu vào thẳng "Chờ xử lý", kèm mã yêu cầu PA-, số người, nhóm yếu thế',
  card?.status === 'moi' && card.request_code === rescue.data.code && card.trapped_count === 2 && card.vulnerable.includes('nguoi_gia'),
  JSON.stringify(card && { status: card.status, request: card.request_code, n: card.trapped_count }));
check('Không nằm trong "Chờ duyệt" của trang Phản ánh (xử lý ở bảng cứu hộ)',
  !((await call('GET', '/reports?status=cho_duyet', null, T.coba)).data?.items || []).some((x) => x.code === rescue.data.code));
check('Chưa xác minh → chưa hiện trên cổng công khai', !JSON.stringify((await call('GET', '/public/reports')).data).includes(rescue.data.code));
const r5 = await track(rescue.data.code, PHONE);
const r6 = await track(rescue.data.sos_code, PHONE);
check('Tra mã PA- hay SOS- đều ra cùng một dòng tiến độ cứu hộ', r5.data?.results?.[0]?.type === 'sos'
  && r5.data.results[0].sos_code === rescue.data.sos_code
  && JSON.stringify(r5.data.results[0].timeline) === JSON.stringify(r6.data?.results?.[0]?.timeline));
// Cán bộ gọi lại không được → đóng phiếu KHÔNG CẦN CỨU (không ghi "Đã cứu an toàn")
check('Đóng phiếu phải có ghi chú → 422', (await call('POST', `/sos/${card?.id}/close`, { reason: 'khong_xac_minh', note: '' }, T.trucban)).status === 422);
const closed = await call('POST', `/sos/${card?.id}/close`, { reason: 'khong_xac_minh', note: 'GHI_CHU_DONG_PHIEU gọi 3 lần không nghe máy' }, T.trucban);
check('Đóng phiếu không cần cứu (không xác minh được)', closed.status === 200 && closed.data?.status === 'hoan_thanh'
  && closed.data?.close_reason === 'khong_xac_minh', `HTTP ${closed.status}`);
check('Đóng lần hai → 409', (await call('POST', `/sos/${card?.id}/close`, { reason: 'trung', note: 'thử lại' }, T.trucban)).status === 409);
const r7 = await track(rescue.data.code, PHONE);
check('Người dân thấy "Đã đóng – chưa xác minh được", không phải "đã cứu", không lộ ghi chú',
  r7.data?.results?.[0]?.status_label?.startsWith('Đã đóng') && !JSON.stringify(r7.data).includes('Đã cứu hộ an toàn')
  && !JSON.stringify(r7.data).includes('GHI_CHU_DONG_PHIEU'), r7.data?.results?.[0]?.status_label);
check('Yêu cầu cứu hộ: tra cứu không trả trường nhạy cảm, không trả nội dung',
  SENSITIVE.every((k) => !JSON.stringify([r5.data, r6.data, r7.data]).includes(`"${k}`)) && !JSON.stringify(r5.data).includes('kẹt trong bếp'));
const rejected = ((await call('GET', '/reports?status=tu_choi', null, T.coba)).data?.items || []).find((x) => x.code === rescue.data.code);
check('Phiếu yêu cầu theo phiếu SOS: không công khai, lý do nêu phiếu cứu hộ đã đóng', !!rejected?.reject_reason?.includes('không xác minh được'));
// Tiếp tế: Cấp 3; cán bộ xác minh tại bảng → công khai câu chung; người dân đã tự an toàn → "đã xử lý"
const supply = await call('POST', '/public/reports', requestForm('tiep_te',
  'Xóm bị cô lập 3 ngày, hết lương thực, cần nước sạch (kiểm thử tiếp tế)'), tokMine);
const sCard = ((await call('GET', '/sos', null, T.trucban)).data || []).find((t) => t.code === supply.data?.sos_code);
check('Cần tiếp tế → phiếu SOS loại tiếp tế, Cấp 3', supply.status === 201 && sCard?.incident_type === 'tiep_te' && sCard.priority === 3,
  `${sCard?.incident_type} ${sCard?.priority}`);
await call('PATCH', `/sos/${sCard?.id}`, { status: 'dieu_phoi' }, T.trucban);
const shownS = ((await call('GET', '/public/reports')).data || []).find((r) => r.code === supply.data?.code);
check('Xác minh tại bảng cứu hộ → cổng chỉ hiện câu chung, không nội dung gốc, không ảnh, vị trí làm tròn',
  !!shownS && !shownS.description.includes('cô lập 3 ngày') && shownS.photos.length === 0 && shownS.approx_m === 150, shownS?.description);
await call('POST', `/sos/${sCard?.id}/close`, { reason: 'da_an_toan', note: 'Thôn đã tiếp tế bằng xuồng' }, T.trucban);
const ms = ((await call('GET', '/public/account/reports', null, tokMine)).data || []).find((x) => x.code === supply.data?.code);
check('"Phiếu của tôi": một nhãn tiến độ theo phiếu cứu hộ', ms?.sos_code === supply.data?.sos_code && ms.progress_label?.startsWith('Đã đóng'),
  ms?.progress_label);
const doneS = ((await call('GET', '/reports?status=da_xu_ly', null, T.coba)).data?.items || []).find((x) => x.code === supply.data?.code);
check('Đã công khai + người gặp nạn tự an toàn → phiếu yêu cầu "đã xử lý"', !!doneS?.public_note?.includes('an toàn'), doneS?.public_note);

// ---- Chống dò: giới hạn số lần KHÔNG ra kết quả theo SĐT và theo mã (ngoài giới hạn theo IP)
// Biết SĐT → thử lần lượt mã tăng dần
const P2 = `0988${String(Date.now()).slice(-6)}`;
let st = 0;
for (let i = 0; i < 12 && st !== 429; i++) st = (await track(`SOS-${8000000 + i}`, P2)).status;
check('Dò mã bằng 1 SĐT: sau 10 lần không ra kết quả → 429', st === 429);
// Biết mã → thử nhiều SĐT (kể cả từ nhiều IP: đếm theo mã, không theo IP)
st = 0;
for (let i = 0; i < 12 && st !== 429; i++) st = (await track(sos.data.code, `0977${String(100000 + i)}`)).status;
check('Dò SĐT của 1 mã: sau 10 lần sai → khoá tra cứu mã đó', st === 429);
// Biết mã phản ánh → thử đuôi mã tra cứu (đếm theo mã phiếu, không theo đuôi)
st = 0;
for (let i = 0; i < 12 && st !== 429; i++) st = (await track(`${anon.data.code}-${'ABCDEFGHJKLM'[i]}ZZZZZ`)).status;
check('Dò đuôi mã tra cứu: sau 10 lần sai → khoá tra cứu mã đó', st === 429);
check('Mã khác, SĐT khác vẫn tra cứu bình thường', (await track(mine.data.code, PHONE)).data?.total === 1);

console.log(failed ? `\n${failed} kiểm tra KHÔNG đạt` : '\nTất cả kiểm tra tra cứu tiến độ đạt');
process.exit(failed ? 1 : 0);
