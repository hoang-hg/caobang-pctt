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
const COBA = { lat: 23.005, lon: 105.718 }; // trong xã Cô Ba theo ranh giới thật (seed/caobang_communes.geojson)
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
// Điểm sơ tán: đúng danh sách trường được công khai — số trực điểm sơ tán (hotline) công khai có chủ đích (README 9.1)
const EVAC_FIELDS = 'admin_name,capacity,current_occupancy,hotline,id,lat,lon,name,site_type';
check('Điểm sơ tán công khai chỉ gồm trường cho phép (có số trực)',
  map.evacuation_sites.length > 0 && map.evacuation_sites.every((e) => Object.keys(e).sort().join() === EVAC_FIELDS)
    && map.evacuation_sites.some((e) => e.hotline));
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
// Xóm / tổ dân phố người dân chọn (danh sách nhập bằng loại "xom"; dữ liệu mẫu: Thôn Bản Ngắn – Hòa An)
const hamletList = await call('GET', '/public/hamlets?xa=CB-HOAAN');
const hamlet = hamletList.data?.find((h) => h.name.includes('Bản Ngắn'));
check('Danh sách xóm của xã (công khai, không cần đăng nhập)', hamletList.status === 200 && !!hamlet,
  (hamletList.data || []).map((h) => h.name).join(', '));
check('Xã không tồn tại → 404', (await call('GET', '/public/hamlets?xa=CB-KHONGCO')).status === 404);
check('Mã xóm không có trong danh sách → 422',
  (await call('POST', '/public/reports', reportForm({ ...COBA, extra: { hamlet: 'CB-HOAAN-KHONGCO' } }))).status === 422);
// Mô tả có SĐT + tên người (người dân hay ghi) → phần công khai phải che SĐT; tên người do cán bộ bỏ khi duyệt
const SUB_DESC = 'Nước ngập qua đường liên thôn trước nhà ông Nông Văn Thử, cần gì gọi 0912 345 678';
const sub = await call('POST', '/public/reports', reportForm({ ...COBA, desc: SUB_DESC, extra: { hamlet: hamlet?.code || '' } }));
check('Người dân gửi phản ánh kèm ảnh + xóm', sub.status === 201 && sub.data.photos === 1, sub.data?.code);
const subTp = await call('POST', '/public/reports', reportForm({ ...TP, desc: 'Cây đổ chắn ngang đường trong nội thị' }));

let pub = (await call('GET', '/public/reports')).data;
check('Phản ánh CHƯA duyệt không hiện công khai', !pub.some((r) => r.code === sub.data.code));
check('Ảnh phản ánh chưa duyệt không truy cập công khai được → 404',
  (await call('GET', `/public/reports/${sub.data.id}/photos/0`, null, null, true)).status === 404);

const T = {
  admin: await login('admin', 'admin123'),
  tinh: await login('admin.tinh', 'admintinh123'),
  coba: await login('admin.coba', 'admincoba123'),
  thucphan: await login('admin.thucphan', 'adminthucphan123'),
};
check('Đăng nhập Quản trị tỉnh, Quản trị xã', !!T.tinh && !!T.coba);
const cobaList = (await call('GET', '/reports?status=cho_duyet', null, T.coba)).data;
check('Quản trị xã chỉ thấy phản ánh trong xã Cô Ba', cobaList.items.some((r) => r.code === sub.data.code) && cobaList.items.every((r) => r.admin_code === 'CB-COBA'));
const item = cobaList.items.find((r) => r.code === sub.data.code);
check('Cán bộ thấy SĐT người gửi (riêng tư)', item.reporter_phone === '0999 555 666');
check('Cán bộ thấy xóm người dân chọn (kèm xã)', item.hamlet_name === 'Thôn Bản Ngắn, xã Hòa An', item.hamlet_name);
const img = await fetch(ROOT + item.photo_urls[0].thumb);
check('Link ảnh có chữ ký cho cán bộ', img.status === 200 && img.headers.get('content-type') === 'image/jpeg');
// đổi ký tự đầu của chữ ký thành ký tự KHÁC (ký tự đầu vốn là '0' thì thay '0' không đổi gì → kiểm thử chập chờn)
const tampered = item.photo_urls[0].thumb.replace(/sig=(\w)/, (_, c) => `sig=${c === '0' ? '1' : '0'}`);
check('Link ảnh sửa chữ ký → 403', (await fetch(ROOT + tampered)).status === 403);
check('Quản trị xã không duyệt phản ánh ngoài xã → 403',
  (await call('POST', `/reports/${subTp.data.id}/moderate`, { action: 'approve' }, T.coba)).status === 403);
check('Quản trị xã khác (Thục Phán) không duyệt phản ánh của Cô Ba → 403',
  (await call('POST', `/reports/${sub.data.id}/moderate`, { action: 'approve' }, T.thucphan)).status === 403);
check('Từ chối cần lý do → 422', (await call('POST', `/reports/${sub.data.id}/moderate`, { action: 'reject' }, T.coba)).status === 422);
const appr = await call('POST', `/reports/${sub.data.id}/moderate`, { action: 'approve', public_note: 'Đã cử dân quân kiểm tra' }, T.coba);
check('Quản trị xã duyệt phản ánh trong xã', appr.status === 200 && appr.data.status === 'da_duyet');
pub = (await call('GET', '/public/reports')).data;
const shown = pub.find((r) => r.code === sub.data.code);
check('Sau khi duyệt: hiện công khai, không kèm thông tin người gửi', shown && !('reporter_phone' in shown) && shown.public_note === 'Đã cử dân quân kiểm tra');
// Phần công khai mặc định (cán bộ không sửa gì): nội dung đã che SĐT, vị trí làm tròn (điểm chấm có thể là nhà người báo)
check('Gợi ý nội dung công khai cho cán bộ đã che SĐT', item.public_description_suggested?.includes('[đã ẩn]') && !item.public_description_suggested.includes('345'),
  item.public_description_suggested);
check('Công khai mặc định: che SĐT trong mô tả', shown && !shown.description.includes('345 678') && shown.description.includes('[đã ẩn]'), shown?.description);
const dLat = Math.abs(shown.lat - COBA.lat), dLon = Math.abs(shown.lon - COBA.lon);
check('Công khai mặc định: vị trí làm tròn (lệch ≤ ~150 m), ghi rõ gần đúng',
  (dLat > 1e-6 || dLon > 1e-6) && dLat <= 0.0011 && dLon <= 0.0011 && shown.approx_m === 150, `${shown.lat},${shown.lon} ~${shown.approx_m} m`);
const pubImg = await call('GET', `/public/reports/${sub.data.id}/photos/0`, null, null, true);
const jpeg = Buffer.from(await pubImg.arrayBuffer());
check('Ảnh công khai là JPEG đã mã hoá lại (không còn EXIF)', pubImg.status === 200 && jpeg[0] === 0xff && jpeg[1] === 0xd8 && !jpeg.includes(Buffer.from('Exif')));
// Cán bộ sửa phần công khai: bỏ tên người, công khai đúng điểm (điểm công cộng), không công khai ảnh
const PUB_DESC = 'Nước ngập qua đường liên thôn, xe máy không đi được';
const edit = await call('POST', `/reports/${sub.data.id}/moderate`,
  { action: 'edit_public', public_description: PUB_DESC, exact_location: true, public_photos: false }, T.coba);
check('Sửa phần công khai giữ trạng thái đã duyệt', edit.status === 200 && edit.data.status === 'da_duyet' && edit.data.public_description === PUB_DESC);
const shown2 = (await call('GET', '/public/reports')).data.find((r) => r.code === sub.data.code);
check('Cổng hiện nội dung cán bộ đã sửa (không còn tên người)', shown2?.description === PUB_DESC && !JSON.stringify(shown2).includes('Nông Văn Thử'));
check('Vị trí chính xác khi cán bộ chọn', Math.abs(shown2.lat - COBA.lat) < 1e-6 && Math.abs(shown2.lon - COBA.lon) < 1e-6 && shown2.approx_m === null);
check('Không công khai ảnh → cổng không có ảnh, link ảnh công khai 404',
  shown2.photos.length === 0 && (await call('GET', `/public/reports/${sub.data.id}/photos/0`, null, null, true)).status === 404);
check('Cán bộ vẫn xem được ảnh (link có chữ ký)', (await fetch(ROOT + edit.data.photo_urls[0].thumb)).status === 200);
check('Không sửa phần công khai của phản ánh chưa duyệt → 409',
  (await call('POST', `/reports/${subTp.data.id}/moderate`, { action: 'edit_public', public_description: PUB_DESC }, T.tinh)).status === 409);
const toSos = await call('POST', `/reports/${subTp.data.id}/to-sos`, { incident_type: 'ngap_lut', priority: 2 }, T.tinh);
check('Quản trị tỉnh chuyển phản ánh thành phiếu SOS', toSos.status === 200 && toSos.data.sos_code?.startsWith('SOS-'), toSos.data?.sos_code);
check('Không chuyển SOS lần 2 → 409', (await call('POST', `/reports/${subTp.data.id}/to-sos`, {}, T.tinh)).status === 409);
const shownTp = (await call('GET', '/public/reports')).data.find((r) => r.code === subTp.data.code);
check('Chuyển SOS cũng công khai phản ánh → vị trí làm tròn mặc định', shownTp?.approx_m === 150, `${shownTp?.lat},${shownTp?.lon}`);

// ---------------------------------------------------------------- Phân cấp quản trị
const stamp = Date.now().toString(36).slice(-5);
const adminXa = await call('POST', '/rbac/users', {
  username: `qtxa.${stamp}`, full_name: 'Quản trị xã thử', password: 'MatKhau2026', role: 'admin_xa', domain: 'BAOLAC/CB-HUNGDAO', email: `qtxa.${stamp}@caobang-pctt.local`,
}, T.tinh);
check('Quản trị tỉnh tạo tài khoản Quản trị xã', adminXa.status === 201);
check('Mật khẩu yếu bị từ chối → 422', (await call('POST', '/rbac/users', {
  username: `yeu.${stamp}`, full_name: 'Mật khẩu yếu', password: 'abc', role: 'admin_xa', domain: 'BAOLAC/CB-COBA',
}, T.tinh)).status === 422);
// 3 cấp: chỉ cấp trên tạo tài khoản — Quản trị xã (Cấp 3) không tạo tài khoản nào, kể cả trong xã mình
check('Quản trị xã không tạo được tài khoản (chỉ cấp trên tạo) → 403', (await call('POST', '/rbac/users', {
  username: `cbx.${stamp}`, full_name: 'Cán bộ xã thử', password: 'MatKhau2026', role: 'admin_xa', domain: 'BAOLAC/CB-COBA',
}, T.coba)).status === 403);
// Quản trị tỉnh được điều động toàn tỉnh (vai trò admin_tinh có dispatch.create) — lực lượng không tồn tại → lỗi dữ liệu, không phải 403
check('Quản trị tỉnh có quyền điều động (không bị 403)', (await call('POST', '/dispatch', { ticket_id: toSos.data.sos_id, force_id: toSos.data.sos_id }, T.tinh)).status !== 403);

// ---------------------------------------------------------------- Mật khẩu
check('Đổi mật khẩu sai mật khẩu hiện tại → 400', (await call('POST', '/auth/change-password', { current_password: 'sai', new_password: 'MoiMoi2026' }, T.thucphan)).status === 400);
check('Đổi mật khẩu yếu → 422', (await call('POST', '/auth/change-password', { current_password: 'adminthucphan123', new_password: '12345678' }, T.thucphan)).status === 422);
// Tài khoản tạm có email cho luồng quên mật khẩu (không đụng tới tài khoản demo)
const pwUser = `pw.${stamp}`;
const pwMail = `${pwUser}@caobang-pctt.local`;
await call('POST', '/rbac/users', { username: pwUser, full_name: 'Tài khoản thử mật khẩu', password: 'BanDau2026', role: 'admin_xa', domain: 'BAOLAC/CB-COBA', email: pwMail }, T.admin);
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
// Hai yêu cầu đồng thời cùng một link (bấm đúp / bị lộ link) → chỉ một yêu cầu đổi được mật khẩu
const resets = await Promise.all([1, 2].map(() => call('POST', '/auth/reset-password', { token, new_password: 'MoiMoi2026' })));
check('Đặt lại mật khẩu bằng link email — 2 yêu cầu đồng thời chỉ 1 thành công',
  resets.map((r) => r.status).sort().join() === '200,400', resets.map((r) => r.status).join());
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
// Khoá theo (tài khoản, IP): kẻ xấu gõ sai liên tục chỉ tự khoá IP của mình, không khoá được chủ tài khoản ở nơi khác.
// Backend tin X-Forwarded-For từ mạng nội bộ docker (TRUSTED_PROXIES) → giả lập 2 IP khác nhau.
const loginFrom = (ip, password) => fetch(BASE + '/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ username: pwUser, password }),
});
for (let i = 0; i < 10; i++) await loginFrom('203.0.113.10', 'KeXau2026sai');
check('IP kẻ xấu bị khoá (kể cả gõ đúng mật khẩu)', (await loginFrom('203.0.113.10', 'LanHai2026')).status === 429);
const owner = await loginFrom('198.51.100.20', 'LanHai2026');
check('Chủ tài khoản ở IP khác vẫn đăng nhập được', owner.status === 200 && !!(await owner.json()).token);
let rl = await call('GET', `/public/locate?lat=${TP.lat}&lon=${TP.lon}`);
const locLimit = Number(rl.headers.get('x-ratelimit-limit'));
check('Giới hạn định vị công khai đủ rộng cho CGNAT (≥ 200 lần/phút/IP)', locLimit >= 200);
// Cửa sổ cố định theo phút đồng hồ: 2×ngưỡng + 2 lần bảo đảm có 1 cửa sổ vượt ngưỡng dù chạy vắt qua ranh giới phút
for (let i = 0; i < 2 * locLimit + 2 && rl?.status !== 429; i++) rl = await call('GET', `/public/locate?lat=${TP.lat}&lon=${TP.lon}`);
check(`Giới hạn tần suất API công khai (${locLimit} lần/phút) → 429 + Retry-After`, rl.status === 429 && !!rl.headers.get('retry-after'));

console.log(failures ? `\n${failures} kiểm tra THẤT BẠI` : '\nTất cả kiểm tra cổng công khai, phản ánh & tài khoản đạt');
process.exit(failures ? 1 : 0);
