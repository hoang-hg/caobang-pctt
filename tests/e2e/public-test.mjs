// Kiểm thử cổng công khai, phản ánh người dân, quên / đổi mật khẩu, giới hạn tần suất, phân cấp quản trị.
//   node tests/e2e/public-test.mjs [http://localhost:8000] [http://localhost:8025 (Mailpit)]
// Chạy lại nhiều lần trong 1 giờ: xoá bộ đếm giới hạn tần suất trước (mỗi IP chỉ được gửi 5 phản ánh/giờ):
//   docker compose exec redis sh -c "redis-cli --scan --pattern 'rl:*' | xargs -r redis-cli del"
const ROOT = process.argv[2] || 'http://localhost:8000';
const MAILPIT = process.argv[3] || 'http://localhost:8025';
const BASE = ROOT + '/api/v1';
let failures = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(method, path, body, token, raw = false) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  return { status: res.status, data: await res.json().catch(() => null), headers: res.headers };
}
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures += 1;
};
const login = async (u, p) => (await call('POST', '/auth/login', { username: u, password: p })).data?.token;
// Ảnh PNG 2×2 hợp lệ
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
const COBA = { lat: 22.905, lon: 105.775 };
const TP = { lat: 22.676, lon: 106.25 };

// ---------------------------------------------------------------- Hạ tầng
const health = await (await fetch(ROOT + '/health')).json();
check('Health: Redis kết nối, API chạy chế độ api, lưu trữ MinIO', health.redis === true && health.run_mode === 'api' && health.storage.startsWith('MinIO'),
  `${health.run_mode} · ${health.storage}`);

// ---------------------------------------------------------------- API công khai
const SENSITIVE = ['contact_phone', 'reporter_phone', 'reporter_name', 'commander', 'raw_message', 'radio_freq', 'personnel_ready', 'client_ip_hash'];
for (const p of ['/public/overview', '/public/map', '/public/alerts', '/public/forecast/areas?hours=24', '/public/hotlines', '/public/reports']) {
  const r = await call('GET', p);
  const text = JSON.stringify(r.data);
  const leaked = SENSITIVE.filter((k) => text.includes(`"${k}"`));
  check(`Công khai ${p} không cần đăng nhập, không lộ trường nhạy cảm`, r.status === 200 && !leaked.length, leaked.join(','));
}
const map = (await call('GET', '/public/map')).data;
check('Bản đồ công khai không có lực lượng / kho / SOS chi tiết', !('forces' in map) && !('warehouses' in map) && !('sos' in map));
const ov = (await call('GET', '/public/overview')).data;
check('Tổng quan công khai: SOS chỉ là số liệu tổng hợp theo xã', ov.sos_by_commune.every((s) => Object.keys(s).sort().join() === 'code,da_xu_ly_24h,dang_xu_ly,name'));
const loc = await call('GET', `/public/locate?lat=${TP.lat}&lon=${TP.lon}`);
check('“Tôi đang ở đâu”: xã, mức nguy cơ, điểm sơ tán gần nhất', loc.status === 200 && loc.data.commune.name && loc.data.evacuation_sites.length > 0,
  `${loc.data?.commune?.name} · nguy cơ ${loc.data?.risk} · ${loc.data?.evacuation_sites?.[0]?.name}`);
check('Vị trí ngoài tỉnh → 422', (await call('GET', '/public/locate?lat=21.02&lon=105.85')).status === 422);
const alertsPub = (await call('GET', '/public/alerts')).data;
check('Cảnh báo công khai chỉ gồm lệnh đã phát', alertsPub.length > 0 && alertsPub.every((a) => a.issued_at));
const share = await call('GET', `/public/alerts/${alertsPub[0].code}/share`, null, null, true);
const shareHtml = await share.text();
check('Trang chia sẻ có thẻ Open Graph', share.status === 200 && shareHtml.includes('og:title') && shareHtml.includes('og:description'));

// ---------------------------------------------------------------- Phản ánh người dân
function reportForm({ lat, lon, desc = 'Nước ngập qua đường liên thôn, xe máy không đi được', photos = [PNG], extra = {} }) {
  const f = new FormData();
  f.append('category', 'ngap');
  f.append('description', desc);
  f.append('lat', String(lat));
  f.append('lon', String(lon));
  f.append('reporter_name', 'Người dân thử nghiệm');
  f.append('reporter_phone', '0999 555 666');
  for (const [k, v] of Object.entries(extra)) f.append(k, v);
  photos.forEach((p, i) => f.append('photos', new Blob([p], { type: 'image/png' }), `anh${i}.png`));
  return f;
}
check('Honeypot (bot điền trường ẩn) → 400', (await call('POST', '/public/reports', reportForm({ ...COBA, extra: { website: 'http://spam' } }))).status === 400);
check('Tệp không phải ảnh → 422', (await call('POST', '/public/reports', reportForm({ ...COBA, photos: [Buffer.from('<?php echo 1; ?>')] }))).status === 422);
check('Vị trí ngoài tỉnh → 422', (await call('POST', '/public/reports', reportForm({ lat: 21.02, lon: 105.85 }))).status === 422);
const sub = await call('POST', '/public/reports', reportForm(COBA));
check('Người dân gửi phản ánh kèm ảnh', sub.status === 201 && sub.data.photos === 1, sub.data?.code);
const subTp = await call('POST', '/public/reports', reportForm({ ...TP, desc: 'Cây đổ chắn ngang đường trong nội thị' }));

let pub = (await call('GET', '/public/reports')).data;
check('Phản ánh CHƯA duyệt không hiện công khai', !pub.some((r) => r.code === sub.data.code));
check('Ảnh phản ánh chưa duyệt không truy cập công khai được → 404',
  (await call('GET', `/public/reports/${sub.data.id}/photos/0`, null, null, true)).status === 404);

const T = {
  admin: await login('admin', 'admin123'),
  tinh: await login('admin.tinh', 'admintinh123'),
  coba: await login('admin.coba', 'admincoba123'),
  xem: await login('xem', 'xem123'),
};
check('Đăng nhập Quản trị tỉnh, Quản trị xã', !!T.tinh && !!T.coba);
const cobaList = (await call('GET', '/reports?status=cho_duyet', null, T.coba)).data;
check('Quản trị xã chỉ thấy phản ánh trong xã Cô Ba', cobaList.items.some((r) => r.code === sub.data.code) && cobaList.items.every((r) => r.admin_code === 'CB-COBA'));
const item = cobaList.items.find((r) => r.code === sub.data.code);
check('Cán bộ thấy SĐT người gửi (riêng tư)', item.reporter_phone === '0999 555 666');
const img = await fetch(ROOT + item.photo_urls[0].thumb);
check('Link ảnh có chữ ký cho cán bộ', img.status === 200 && img.headers.get('content-type') === 'image/jpeg');
// đổi ký tự đầu của chữ ký thành ký tự KHÁC (ký tự đầu vốn là '0' thì thay '0' không đổi gì → kiểm thử chập chờn)
const tampered = item.photo_urls[0].thumb.replace(/sig=(\w)/, (_, c) => `sig=${c === '0' ? '1' : '0'}`);
check('Link ảnh sửa chữ ký → 403', (await fetch(ROOT + tampered)).status === 403);
check('Quản trị xã không duyệt phản ánh ngoài xã → 403',
  (await call('POST', `/reports/${subTp.data.id}/moderate`, { action: 'approve' }, T.coba)).status === 403);
check('Tài khoản quan sát không duyệt được → 403',
  (await call('POST', `/reports/${sub.data.id}/moderate`, { action: 'approve' }, T.xem)).status === 403);
check('Từ chối cần lý do → 422', (await call('POST', `/reports/${sub.data.id}/moderate`, { action: 'reject' }, T.coba)).status === 422);
const appr = await call('POST', `/reports/${sub.data.id}/moderate`, { action: 'approve', public_note: 'Đã cử dân quân kiểm tra' }, T.coba);
check('Quản trị xã duyệt phản ánh trong xã', appr.status === 200 && appr.data.status === 'da_duyet');
pub = (await call('GET', '/public/reports')).data;
const shown = pub.find((r) => r.code === sub.data.code);
check('Sau khi duyệt: hiện công khai, không kèm thông tin người gửi', shown && !('reporter_phone' in shown) && shown.public_note === 'Đã cử dân quân kiểm tra');
const pubImg = await call('GET', `/public/reports/${sub.data.id}/photos/0`, null, null, true);
const jpeg = Buffer.from(await pubImg.arrayBuffer());
check('Ảnh công khai là JPEG đã mã hoá lại (không còn EXIF)', pubImg.status === 200 && jpeg[0] === 0xff && jpeg[1] === 0xd8 && !jpeg.includes(Buffer.from('Exif')));
const toSos = await call('POST', `/reports/${subTp.data.id}/to-sos`, { incident_type: 'ngap_lut', priority: 2 }, T.tinh);
check('Quản trị tỉnh chuyển phản ánh thành phiếu SOS', toSos.status === 200 && toSos.data.sos_code?.startsWith('SOS-'), toSos.data?.sos_code);
check('Không chuyển SOS lần 2 → 409', (await call('POST', `/reports/${subTp.data.id}/to-sos`, {}, T.tinh)).status === 409);

// ---------------------------------------------------------------- Phân cấp quản trị
const stamp = Date.now().toString(36).slice(-5);
const adminXa = await call('POST', '/rbac/users', {
  username: `qtxa.${stamp}`, full_name: 'Quản trị xã thử', password: 'MatKhau2026', role: 'admin_xa', domain: 'BAOLAC/CB-HUNGDAO', email: `qtxa.${stamp}@caobang-pctt.local`,
}, T.tinh);
check('Quản trị tỉnh tạo tài khoản Quản trị xã', adminXa.status === 201);
check('Mật khẩu yếu bị từ chối → 422', (await call('POST', '/rbac/users', {
  username: `yeu.${stamp}`, full_name: 'Mật khẩu yếu', password: 'abc', role: 'can_bo_xa', domain: 'BAOLAC/CB-COBA',
}, T.coba)).status === 422);
const canbo = await call('POST', '/rbac/users', {
  username: `cbx.${stamp}`, full_name: 'Cán bộ xã thử', password: 'MatKhau2026', role: 'can_bo_xa', domain: 'BAOLAC/CB-COBA',
}, T.coba);
check('Quản trị xã tạo cán bộ trong xã mình', canbo.status === 201);
check('Quản trị xã không tạo tài khoản ở xã khác → 403', (await call('POST', '/rbac/users', {
  username: `x.${stamp}`, full_name: 'Xã khác', password: 'MatKhau2026', role: 'can_bo_xa', domain: 'BAOLAC/CB-HUNGDAO',
}, T.coba)).status === 403);
check('Quản trị xã không cấp vai trò Thủ kho (không có quyền xuất kho) → 403', (await call('POST', `/rbac/users/${canbo.data.id}/assignments`, { role: 'thu_kho', domain: 'BAOLAC/CB-COBA' }, T.coba)).status === 403);
// Quản trị tỉnh được điều động toàn tỉnh (vai trò admin_tinh có dispatch.create) — lực lượng không tồn tại → lỗi dữ liệu, không phải 403
check('Quản trị tỉnh có quyền điều động (không bị 403)', (await call('POST', '/dispatch', { ticket_id: toSos.data.sos_id, force_id: toSos.data.sos_id }, T.tinh)).status !== 403);

// ---------------------------------------------------------------- Mật khẩu
check('Đổi mật khẩu sai mật khẩu hiện tại → 400', (await call('POST', '/auth/change-password', { current_password: 'sai', new_password: 'MoiMoi2026' }, T.xem)).status === 400);
check('Đổi mật khẩu yếu → 422', (await call('POST', '/auth/change-password', { current_password: 'xem123', new_password: '12345678' }, T.xem)).status === 422);
// Tài khoản tạm có email cho luồng quên mật khẩu (không đụng tới tài khoản demo)
const pwUser = `pw.${stamp}`;
const pwMail = `${pwUser}@caobang-pctt.local`;
await call('POST', '/rbac/users', { username: pwUser, full_name: 'Tài khoản thử mật khẩu', password: 'BanDau2026', role: 'quan_sat', domain: '*', email: pwMail }, T.admin);
const pwTok = await login(pwUser, 'BanDau2026');
const fp = await call('POST', '/auth/forgot-password', { login: pwMail });
const fpNone = await call('POST', '/auth/forgot-password', { login: 'khong.ton.tai' });
check('Quên mật khẩu: cùng một thông báo dù tài khoản có hay không', fp.status === 200 && fp.data.message === fpNone.data.message);
await sleep(1500);
let token = null;
try {
  const list = await (await fetch(`${MAILPIT}/api/v1/messages`)).json();
  const msg = list.messages.find((m) => m.To.some((x) => x.Address === pwMail));
  const full = await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json();
  token = full.Text.match(/token=([A-Za-z0-9_-]+)/)?.[1];
} catch { /* Mailpit không chạy */ }
check('Email đặt lại mật khẩu tới hộp thư (Mailpit)', !!token);
check('Token sai → 400', (await call('POST', '/auth/reset-password', { token: 'x'.repeat(40), new_password: 'MoiMoi2026' })).status === 400);
check('Mật khẩu mới yếu → 422', (await call('POST', '/auth/reset-password', { token, new_password: 'abcdefgh' })).status === 422);
const rs = await call('POST', '/auth/reset-password', { token, new_password: 'MoiMoi2026' });
check('Đặt lại mật khẩu bằng link email', rs.status === 200);
check('Token đã dùng không dùng lại được → 400', (await call('POST', '/auth/reset-password', { token, new_password: 'KhacNua2026' })).status === 400);
check('Phiên cũ bị đăng xuất sau khi đặt lại → 401', (await call('GET', '/auth/me', null, pwTok)).status === 401);
check('Mật khẩu cũ không đăng nhập được', !(await login(pwUser, 'BanDau2026')));
const newTok = await login(pwUser, 'MoiMoi2026');
check('Đăng nhập bằng mật khẩu mới', !!newTok);
const changed = await call('POST', '/auth/change-password', { current_password: 'MoiMoi2026', new_password: 'LanHai2026' }, newTok);
check('Đổi mật khẩu → nhận token mới, token cũ hết hiệu lực', changed.status === 200 && !!changed.data.token
  && (await call('GET', '/auth/me', null, newTok)).status === 401 && (await call('GET', '/auth/me', null, changed.data.token)).status === 200);

// ---------------------------------------------------------------- Chống dò mật khẩu & giới hạn tần suất
let lastStatus;
for (let i = 0; i < 11; i++) lastStatus = (await call('POST', '/auth/login', { username: `do.mat.khau.${stamp}`, password: 'sai' })).status;
check('Sai mật khẩu 10 lần → tạm khoá đăng nhập 15 phút (429)', lastStatus === 429);
let rl;
// Cửa sổ cố định theo phút đồng hồ: 62 lần bảo đảm có 1 cửa sổ > 30 dù chạy vắt qua ranh giới phút
for (let i = 0; i < 62 && rl?.status !== 429; i++) rl = await call('GET', `/public/locate?lat=${TP.lat}&lon=${TP.lon}`);
check('Giới hạn tần suất API công khai (30 lần/phút) → 429 + Retry-After', rl.status === 429 && !!rl.headers.get('retry-after'));

console.log(failures ? `\n${failures} kiểm tra THẤT BẠI` : '\nTất cả kiểm tra cổng công khai, phản ánh & tài khoản đạt');
process.exit(failures ? 1 : 0);
