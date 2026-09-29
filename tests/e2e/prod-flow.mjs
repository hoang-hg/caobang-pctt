// Kiểm thử luồng VẬN HÀNH THẬT trên stack production (docker-compose.prod.yml) với CSDL trống: DEMO_MODE=false,
// SIMULATOR=false, bắt buộc xác thực 2 lớp cho quản trị. Gọi qua nginx (FRONTEND_BIND) như người dùng thật.
// Tài khoản quản trị lấy từ biến môi trường (giống .env.production). Chạy trong CI (job "prod"), ~3 phút.
//   SUPERADMIN_USERNAME=admin SUPERADMIN_PASSWORD=… SUPERADMIN_PIN=… \
//     node tests/e2e/prod-flow.mjs [http://127.0.0.1:8080] [http://127.0.0.1:8025 (Mailpit)]
// KHÔNG chạy trên hệ thống đang phục vụ người dân: script nhập dữ liệu mẫu, tạo tài khoản, phát lệnh cảnh báo thử.
import crypto from 'node:crypto';

const ROOT = process.argv[2] || 'http://127.0.0.1:8080';
const MAILPIT = process.argv[3] || 'http://127.0.0.1:8025';
const BASE = ROOT + '/api/v1';
const ADMIN = process.env.SUPERADMIN_USERNAME || 'admin';
const ADMIN_PW = process.env.SUPERADMIN_PASSWORD;
const ADMIN_PIN = process.env.SUPERADMIN_PIN;
if (!ADMIN_PW || !ADMIN_PIN) {
  console.error('Đặt SUPERADMIN_PASSWORD và SUPERADMIN_PIN (giống .env.production của stack đang thử)');
  process.exit(2);
}

let failures = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures += 1;
};
async function call(method, path, body, token, headers = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let data = raw;
  try { data = JSON.parse(raw); } catch { /* HTML / văn bản */ }
  return { status: res.status, data, headers: res.headers };
}
// API công khai qua nginx được cache 10 giây; khoá cache chỉ gồm tham số thật (thêm ?_= KHÔNG né được — chống dồn tải).
// Sau khi ghi: chờ tối đa 15 giây cho tới khi thấy dữ liệu mới — đồng thời kiểm tra cam kết "hiện trên cổng ≤ 10 giây".
async function until(path, ok, { raw = false } = {}) {
  let data;
  for (let i = 0; i < 16; i++) {
    data = raw ? await (await fetch(ROOT + path)).text() : (await call('GET', path)).data;
    if (ok(data)) return data;
    await sleep(1000);
  }
  return data;
}
const hasPhone = (d) => JSON.stringify(d).includes('0206 3852 000') || JSON.stringify(d).includes('02063852000');

// ---------------------------------------------------------------- TOTP (RFC 6238) — như totp-test.mjs
function base32(s) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...s.replace(/=+$/, '').toUpperCase()].map((c) => A.indexOf(c).toString(2).padStart(5, '0')).join('');
  return Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
}
function totp(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', base32(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
const used = new Map();
async function freshCode(secret) {
  for (;;) {
    const s = Math.floor(Date.now() / 30_000);
    for (const step of [s, s + 1]) {
      if (step > (used.get(secret) ?? -1)) {
        used.set(secret, step);
        return totp(secret, step);
      }
    }
    await sleep(30_000 - (Date.now() % 30_000) + 300);
  }
}
/** Đăng nhập; vai trò bắt buộc 2 lớp lần đầu → cài đặt TOTP bằng phiếu đăng nhập. Trả về token. */
async function loginWithSetup(username, password, label) {
  const r = await call('POST', '/auth/login', { username, password });
  if (r.data?.token) return { token: r.data.token, mfa: false };
  if (r.data?.mfa !== 'setup') {
    check(`${label}: đăng nhập`, false, `HTTP ${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
    return {};
  }
  const setup = await call('POST', '/auth/mfa/setup', { challenge: r.data.challenge });
  const en = await call('POST', '/auth/mfa/enable', { challenge: r.data.challenge, code: await freshCode(setup.data?.secret) });
  return { token: en.data?.token, mfa: true, secret: setup.data?.secret };
}

// ================================================================ 1. Hạ tầng & cấu hình an toàn
const home = await fetch(ROOT + '/');
const homeHtml = await home.text();
check('Trang chủ qua nginx', home.status === 200 && homeHtml.includes('<div id="root">'));
const csp = home.headers.get('content-security-policy') || '';
check('Có CSP (script chỉ từ chính trang)', /script-src 'self'/.test(csp), csp.slice(0, 80));
check('Có X-Content-Type-Options, X-Frame-Options / frame-ancestors',
  home.headers.get('x-content-type-options') === 'nosniff' && (!!home.headers.get('x-frame-options') || csp.includes('frame-ancestors')));
check('Không có tài khoản demo (admin/admin123)', (await call('POST', '/auth/login', { username: 'admin', password: 'admin123' })).status === 401);
check('Không công khai danh sách tài khoản demo', (await call('GET', '/auth/demo-accounts')).status === 404);
const health = await fetch(ROOT + '/health');
check('/health qua nginx', health.status === 200 && !!(await health.json().catch(() => null))?.status);

// ================================================================ 2. Cổng công khai trên CSDL trống
for (const p of ['/public/overview', '/public/map', '/public/alerts', '/public/forecast/areas?hours=24', '/public/hotlines',
  '/public/reports', '/public/reservoirs', '/public/landslides', '/public/config', '/public/report-categories']) {
  const r = await call('GET', p);
  check(`Công khai ${p} (CSDL trống) → 200 JSON`, r.status === 200 && typeof r.data === 'object', `HTTP ${r.status}`);
}
const lite = await fetch(ROOT + '/ban-nhe');
check('Bản nhẹ /ban-nhe (CSDL trống)', lite.status === 200 && (await lite.text()).includes('</html>'));
const emptyRes = (await call('GET', '/public/reservoirs')).data;
check('Chưa nhập hồ chứa: 0 hồ, không báo "đang xả"', emptyRes?.total_reservoirs === 0 && emptyRes?.spill_count === 0);

// ================================================================ 3. Quản trị đăng nhập (bắt buộc cài 2 lớp)
const first = await call('POST', '/auth/login', { username: ADMIN, password: ADMIN_PW });
check('Superadmin: mật khẩu đúng → phải cài xác thực 2 lớp (chưa có token)', first.data?.mfa === 'setup' && !first.data?.token,
  JSON.stringify(first.data).slice(0, 80));
const { token: admin } = await loginWithSetup(ADMIN, ADMIN_PW, 'Superadmin');
check('Superadmin cài TOTP xong → có phiên đăng nhập', !!admin);
if (!admin) {
  console.log('\nKhông đăng nhập được — dừng');
  process.exit(1);
}

// Mọi màn hình nội bộ trên CSDL trống: không lỗi 500
const staffGets = ['/auth/me', '/dashboard/kpis', '/dashboard/logs', '/dashboard/rainfall', '/dashboard/supplies',
  '/dashboard/landslide-risk', '/stations', '/sos', '/evacuation', '/alerts/broadcasts', '/alerts/templates',
  '/alerts/channels', '/alerts/contacts', '/alerts/hotline', '/alerts/audit', '/reports', '/resources/summary',
  '/resources/forces', '/resources/vehicles', '/resources/warehouses', '/resources/evacuation-sites', '/resources/fuel-depots',
  '/integrations/sources', '/integrations/devices', '/integrations/monitor', '/map/layers', '/map/timeline',
  '/forecast/models', '/forecast/areas', '/admin-units', '/admin-units/tree', '/admin-units/presets', '/rbac/users',
  '/rbac/roles', '/rbac/permissions', '/rbac/scopes', '/rbac/audit', '/data-import/datasets', '/search?q=cao'];
const bad = [];
for (const p of staffGets) {
  const r = await call('GET', p, null, admin);
  if (r.status >= 500 || r.status === 404) bad.push(`${p} → ${r.status}`);
}
check(`${staffGets.length} API nội bộ trên CSDL trống không lỗi 5xx / 404`, bad.length === 0, bad.join(', '));

// ================================================================ 4. Nhập dữ liệu chính thức bằng tệp mẫu
const datasets = (await call('GET', '/data-import/datasets', null, admin)).data || [];
check('Danh mục loại dữ liệu nhập', datasets.length >= 10, `${datasets.length} loại`);
for (const ds of datasets) {
  const tpl = await fetch(`${BASE}/data-import/datasets/${ds.name}/template`, { headers: { Authorization: `Bearer ${admin}` } });
  const content = new Uint8Array(await tpl.arrayBuffer());
  const filename = ds.geometry === 'polygon' ? `mau_${ds.name}.geojson` : `mau_${ds.name}.csv`;
  const form = (step) => {
    const f = new FormData();
    f.append('file', new Blob([content]), filename);
    f.append('mode', 'upsert');
    return call('POST', `/data-import/datasets/${ds.name}/${step}`, f, admin);
  };
  const v = await form('validate');
  check(`Tệp mẫu "${ds.label}" hợp lệ`, tpl.status === 200 && v.status === 200 && v.data?.ok === true,
    v.data?.ok ? '' : JSON.stringify(v.data?.errors || v.data).slice(0, 160));
  // Ranh giới xã: tệp mẫu là ô vuông minh hoạ — nhập sẽ thay ranh giới thật của xã → chỉ kiểm tra, không nhập
  if (ds.update_only) continue;
  const a = await form('apply');
  check(`Nhập tệp mẫu "${ds.label}"`, a.status === 200 && (a.data?.result?.created ?? 0) + (a.data?.result?.updated ?? 0) >= 1,
    `HTTP ${a.status} ${JSON.stringify(a.data?.result || a.data).slice(0, 120)}`);
}
check('Danh bạ cấp tỉnh vừa nhập → đường dây nóng trên cổng công khai', hasPhone(await until('/public/hotlines', hasPhone)));

// ================================================================ 5. Hồ chứa: chưa có số liệu → trực ban cập nhật vận hành
const HO = 'HO-BANGGIANG';
let res = await until('/public/reservoirs', (d) => d?.reservoirs?.some((r) => r.id === HO));
let ho = res?.reservoirs?.find((r) => r.id === HO);
check('Hồ mới nhập: "Chưa có số liệu vận hành" (không khẳng định chưa xả)', ho?.status_code === 'chua_co_so_lieu' &&
  ho?.updated_at === null && res.no_data_count === 1 && res.spill_count === 0, `${ho?.status_code} ${ho?.status_label}`);
const ov = await until('/public/overview', (d) => d?.reservoirs?.no_data_count === 1);
check('Tổng quan công khai đếm hồ chưa có số liệu', ov?.reservoirs?.no_data_count === 1 && ov?.reservoirs?.spill_count === 0);
// Trạm vừa nhập, chưa có thiết bị: không được báo "dưới báo động" / "an toàn"
const river = ov?.rivers?.find((r) => r.name === 'Trạm thuỷ văn Cao Bằng');
check('Trạm chưa có số liệu: "Chưa có số liệu" (không báo dưới báo động)', river?.level === null && river?.level_label === 'Chưa có số liệu' &&
  river?.value === null, JSON.stringify(river));
const st0 = ((await until('/public/map', (d) => d?.stations?.some((x) => x.id === 'CB-WL-BANGGIANG')))?.stations || []).find((x) => x.id === 'CB-WL-BANGGIANG');
check('Bản đồ công khai: trạm chưa có số đo trả value = null, kèm thời điểm / cờ mất tín hiệu', st0 && st0.value === null &&
  'time' in st0 && st0.stale === false, JSON.stringify(st0));
check('Số cửa mở vượt số cửa của hồ → 422',
  (await call('PATCH', `/reservoirs/${HO}/operation`, { current_level: 189, spill_gates_open: 9 }, admin)).status === 422);
check('Gõ nhầm mực nước (1900 m, MNDBT 190 m) → 422, không báo "xả lũ lớn" giả',
  (await call('PATCH', `/reservoirs/${HO}/operation`, { current_level: 1900, spill_gates_open: 1 }, admin)).status === 422);
check('Hồ không tồn tại → 404',
  (await call('PATCH', '/reservoirs/HO-KHONG-CO/operation', { current_level: 189, spill_gates_open: 0 }, admin)).status === 404);
const op = await call('PATCH', `/reservoirs/${HO}/operation`, {
  current_level: 189.4, spill_gates_open: 1, inflow_m3s: 120, outflow_m3s: 150, source: 'Điện thoại trưởng ca nhà máy (kiểm thử)',
}, admin);
check('Cập nhật vận hành: mở 1/3 cửa → "Đang xả điều tiết"', op.status === 200 && op.data?.status_code === 'xa_dieu_tiet' && !!op.data?.updated_at,
  `HTTP ${op.status} ${op.data?.status_code || JSON.stringify(op.data).slice(0, 100)}`);
res = await until('/public/reservoirs', (d) => d?.reservoirs?.find((r) => r.id === HO)?.status_code === 'xa_dieu_tiet');
ho = res?.reservoirs?.find((r) => r.id === HO);
check('Cổng công khai hiện ngay số liệu mới', ho?.status_code === 'xa_dieu_tiet' && res.spill_count === 1 && res.no_data_count === 0 &&
  ho?.stale === false);

// ================================================================ 6. Tài khoản: cán bộ xã, lãnh đạo phê duyệt
const stamp = Date.now().toString(36);
const PW = `ProdFlow-${stamp}9`;
const CHECKER_PIN = '739164';
const mk = async (username, role, domain, extra = {}) =>
  call('POST', '/rbac/users', { username, full_name: `Kiểm thử ${role}`, password: PW, role, domain, ...extra }, admin);
const xaUser = `canbo.${stamp}`;
const chkUser = `lanhdao.${stamp}`;
check('Tạo tài khoản cán bộ xã (có email)', (await mk(xaUser, 'can_bo_xa', 'BAOLAC/CB-COBA', { email: `${xaUser}@ci.local` })).status === 201);
check('Tạo tài khoản lãnh đạo BCH (có PIN)', (await mk(chkUser, 'truong_ban', '*', { pin: CHECKER_PIN })).status === 201);
const xa = (await call('POST', '/auth/login', { username: xaUser, password: PW })).data?.token;
check('Cán bộ xã đăng nhập 1 bước (vai trò không bắt buộc 2 lớp)', !!xa);
check('Cán bộ xã không cập nhật được vận hành hồ → 403',
  (await call('PATCH', `/reservoirs/${HO}/operation`, { current_level: 180, spill_gates_open: 0 }, xa)).status === 403);
const { token: checker, mfa: chkMfa } = await loginWithSetup(chkUser, PW, 'Lãnh đạo');
check('Lãnh đạo BCH: bắt buộc cài 2 lớp khi đăng nhập lần đầu', !!checker && chkMfa === true);

// ---- Xã/phường gửi dữ liệu → cấp tỉnh phê duyệt rồi mới hiển thị
const qtxa = `qtxa.${stamp}`;
check('Tạo tài khoản quản trị xã (Cô Ba)', (await mk(qtxa, 'admin_xa', 'BAOLAC/CB-COBA', { email: `${qtxa}@ci.local` })).status === 201);
const xaTok = (await call('POST', '/auth/login', { username: qtxa, password: PW })).data?.token;
const coba = ((await call('GET', '/admin-units?level=xa')).data || []).find((u) => u.code === 'CB-COBA');
const SITE = `Nhà văn hoá xã gửi ${stamp}`;
const subForm = new FormData();
subForm.append('name', 'diem_so_tan');
subForm.append('mode', 'upsert');
subForm.append('file', new Blob([`ma,ten,loai,suc_chua,vi_do,kinh_do\nHS-${stamp},${SITE},nha_van_hoa,150,${coba?.lat},${coba?.lon}\n`]), 'diem.csv');
const sub = await call('POST', '/data-import/submissions', subForm, xaTok);
check('Quản trị xã gửi hồ sơ điểm sơ tán → chờ duyệt', sub.status === 201 && sub.data?.status === 'cho_duyet',
  `HTTP ${sub.status} ${sub.data?.code || JSON.stringify(sub.data).slice(0, 200)}`);
const names = (d) => (d?.evacuation_sites || []).map((e) => e.name);
check('Hồ sơ chờ duyệt chưa hiện trên cổng công khai', !names((await call('GET', '/public/map')).data).includes(SITE));
const subOk = await call('POST', `/data-import/submissions/${sub.data?.code}/approve`, {}, admin);
check('Superadmin phê duyệt → ghi dữ liệu', subOk.status === 200 && subOk.data?.result?.created === 1, JSON.stringify(subOk.data).slice(0, 160));
check('Sau khi duyệt: hiện trên cổng công khai (≤ 15 giây)', names(await until('/public/map', (d) => names(d).includes(SITE))).includes(SITE));

// ================================================================ 7. Phản ánh → duyệt → chuyển SOS → điều động
const PHONE = '0912 345 678';
const f = new FormData();
f.append('category', 'ngap');
f.append('description', `Nước ngập sâu trước cổng trường, xe máy không qua được (kiểm thử ${stamp})`);
f.append('lat', '22.6700');
f.append('lon', '106.2400');
f.append('reporter_name', 'Người dân kiểm thử');
f.append('reporter_phone', PHONE);
const rep = await call('POST', '/public/reports', f);
check('Người dân gửi phản ánh (không đăng nhập)', rep.status === 201 && !!rep.data?.code, `HTTP ${rep.status} ${rep.data?.code || JSON.stringify(rep.data).slice(0, 100)}`);
const repId = rep.data?.id;
const pending = (await call('GET', '/public/reports')).data;
check('Phản ánh chưa duyệt không hiện công khai', !JSON.stringify(pending).includes(rep.data?.code));
const mod = await call('POST', `/reports/${repId}/moderate`, { action: 'approve', public_note: 'Đã cử lực lượng kiểm tra' }, admin);
check('Duyệt phản ánh', mod.status === 200, `HTTP ${mod.status}`);
const pubRep = await until('/public/reports', (d) => JSON.stringify(d).includes(rep.data?.code));
check('Phản ánh đã duyệt hiện công khai, không lộ SĐT người gửi',
  JSON.stringify(pubRep).includes(rep.data?.code) && !JSON.stringify(pubRep).includes('345 678') && !JSON.stringify(pubRep).includes('345678'));
const toSos = await call('POST', `/reports/${repId}/to-sos`, { incident_type: 'ngap_lut', priority: 2, trapped_count: 3 }, admin);
const ticket = { id: toSos.data?.sos_id, code: toSos.data?.sos_code };
check('Chuyển phản ánh thành phiếu SOS', toSos.status === 200 && !!ticket.id, `HTTP ${toSos.status} ${ticket.code || JSON.stringify(toSos.data).slice(0, 120)}`);
const match = await call('GET', `/sos/${ticket?.id}/match`, null, admin);
const force = match.data?.forces?.find((x) => x.code === 'CB-LL-001') || match.data?.forces?.[0];
check('Gợi ý lực lượng vừa nhập (Đại đội công binh)', match.status === 200 && force?.code === 'CB-LL-001',
  `${match.data?.forces?.length ?? 0} lực lượng, bán kính ${match.data?.radius_km} km`);
if (force) {
  const disp = await call('POST', '/dispatch', { ticket_id: ticket.id, force_id: force.id, personnel: 6 }, admin);
  check('Phát lệnh điều động + lộ trình', disp.status === 200 && disp.data?.ticket?.status === 'thuc_thi' && !!disp.data?.route,
    disp.status === 200 ? `${disp.data.route?.distance_km} km, an toàn=${disp.data.route?.safe}` : JSON.stringify(disp.data).slice(0, 160));
  // Lực lượng đóng quân trong vùng sạt lở đỏ vừa nhập (tệp mẫu) → tuyến phải báo đi qua vùng nguy hiểm, nêu tên vùng
  check('Tuyến điều động xuất phát trong vùng nguy hiểm → safe = false, nêu tên vùng',
    disp.data?.route?.safe === false && disp.data?.route?.hazards?.includes('Khu dân cư xóm Nà Rì'), JSON.stringify(disp.data?.route?.hazards));
  check('Không có SMS / Push: lệnh điều động báo rõ CHƯA gửi cho đội (trực ban phải gọi)',
    disp.data?.notification?.sent === false && !!disp.data?.notification?.message);
}
const pr = (await call('GET', '/public/route?from_lat=22.6700&from_lon=106.2400&to_lat=22.6657&to_lon=106.2522')).data;
check('Chỉ đường công khai tới điểm trong vùng nguy hiểm → không báo "an toàn"', pr?.safe === false &&
  pr?.hazards?.includes('Khu dân cư xóm Nà Rì') && typeof pr?.offroad_km === 'number', JSON.stringify({ safe: pr?.safe, hazards: pr?.hazards }));
// Điểm nguy hiểm đã nhập (tệp mẫu: "Taluy Km 12 QL34" tại điểm đến) → cảnh báo kèm tuyến
check('Cảnh báo kèm tuyến: điểm nguy hiểm sát tuyến', pr?.warnings?.some((w) => w.includes('Taluy Km 12 QL34')), JSON.stringify(pr?.warnings));
await call('GET', '/public/hotlines?_=lan-1');
const hit = await call('GET', '/public/hotlines?_=lan-2');
// Khoá cache bỏ tham số lạ → lần 2 không thể là MISS (HIT, hoặc STALE/UPDATING nếu vừa hết 10 giây)
check('Tham số lạ (?_=) không né được cache nginx', !!hit.headers.get('x-cache-status') && hit.headers.get('x-cache-status') !== 'MISS', hit.headers.get('x-cache-status'));
const tr = await call('POST', '/public/track', { code: rep.data?.code, phone: PHONE });
check('Người dân tra cứu tiến độ bằng mã + SĐT', tr.status === 200 && tr.data?.total === 1 && tr.data?.verified === true);
check('Tra cứu sai SĐT → như không tồn tại',
  (await call('POST', '/public/track', { code: rep.data?.code, phone: '0987 000 111' })).data?.total === 0);
const resolved = await call('POST', `/sos/${ticket?.id}/resolve`, null, admin);
check('Xác nhận đã cứu an toàn', resolved.data?.status === 'hoan_thanh', `HTTP ${resolved.status}`);

// ================================================================ 8. Cảnh báo Maker – Checker (kênh gửi tin chưa tích hợp)
const TITLE = `Kiểm thử cảnh báo ngập ${stamp}`;
const br = await call('POST', '/alerts/broadcasts', {
  title: TITLE, message_body: 'Nội dung kiểm thử cảnh báo ngập lụt ven sông Bằng Giang, người dân chú ý an toàn',
  admin_codes: ['CB-THUCPHAN'], channels: ['SMS', 'ZALO_OA', 'LOA'], severity: 'cam',
}, admin);
check('Soạn lệnh cảnh báo → chờ duyệt', br.status === 200 && br.data?.status === 'pending_approval', br.data?.code);
check('Người soạn không tự duyệt', (await call('POST', `/alerts/broadcasts/${br.data?.id}/approve`, { pin: ADMIN_PIN }, admin)).status === 403);
check('Sai PIN → 403', (await call('POST', `/alerts/broadcasts/${br.data?.id}/approve`, { pin: '000000' }, checker)).status === 403);
const ap = await call('POST', `/alerts/broadcasts/${br.data?.id}/approve`, { pin: CHECKER_PIN }, checker);
const channelsOff = Object.values(ap.data?.metrics || {});
check('Duyệt: chốt "đã công bố", từng kênh ghi rõ chưa tích hợp (không treo "Đang phát")',
  ap.status === 200 && ap.data?.status === 'sent' && !!ap.data?.sent_at && channelsOff.length === 3 &&
  channelsOff.every((m) => m.integrated === false), `HTTP ${ap.status} ${ap.data?.status} ${JSON.stringify(ap.data?.metrics).slice(0, 120)}`);
const pubAlerts = await until('/public/alerts', (d) => JSON.stringify(d).includes(TITLE));
check('Cảnh báo đã duyệt hiện trên cổng công khai (≤ 15 giây)', JSON.stringify(pubAlerts).includes(TITLE));
const liteAfter = await until('/ban-nhe', (t) => t.includes(TITLE), { raw: true });
check('Cảnh báo hiện trên bản nhẹ', liteAfter.includes(TITLE));
await sleep(6000);
const again = (await call('GET', '/alerts/broadcasts', null, checker)).data?.find((b) => b.id === br.data?.id);
check('Không có bộ mô phỏng nào đổi số liệu giao nhận', again?.status === 'sent' && Object.values(again?.metrics || {}).every((m) => m.sent === 0));
check('Nhật ký pháp lý ghi phê duyệt', ((await call('GET', '/alerts/audit', null, checker)).data || []).some((a) => a.action === 'broadcast.approve'));

// ================================================================ 9. Thiết bị IoT gửi số đo
const DEV = `PROD-WL-${stamp}`.toUpperCase();
const dev = await call('POST', '/integrations/devices', {
  id: DEV, name: 'Thước nước kiểm thử', protocol: 'http', station_id: 'CB-WL-BANGGIANG', expected_interval_s: 600,
}, admin);
const key = dev.data?.api_key;
check('Đăng ký thiết bị cho trạm vừa nhập, nhận khoá 1 lần', dev.status === 201 && key?.startsWith('cbk_'), `HTTP ${dev.status}`);
const ing = await call('POST', '/ingest/readings', { device_id: DEV, value: 179.35 }, null, { 'X-Device-Key': key || 'x' });
check('Thiết bị gửi số đo qua HTTP (qua nginx)', ing.status === 200 && ing.data?.accepted === 1, JSON.stringify(ing.data).slice(0, 120));
let st;
for (let i = 0; i < 12 && st?.value !== 179.35; i++) {
  st = ((await call('GET', '/stations?type=muc_nuoc', null, admin)).data || []).find((s) => s.id === 'CB-WL-BANGGIANG');
  if (st?.value !== 179.35) await sleep(2500);
}
check('Trạm hiện số đo thật của thiết bị, chuyển nguồn "chờ thiết bị" → IoT', st?.value === 179.35 && st?.source === 'iot', `${st?.value} ${st?.source}`);
// Mực nước vượt BĐ II (ngưỡng mẫu 180 / 181 / 182) → chỉ đường qua gần trạm phải kèm cảnh báo
await call('POST', '/ingest/readings', { device_id: DEV, value: 181.4 }, null, { 'X-Device-Key': key || 'x' });
const rw = await until('/public/route?from_lat=22.6700&from_lon=106.2400&to_lat=22.6657&to_lon=106.2522',
  (d) => d?.warnings?.some((w) => w.includes('vượt báo động II')));
check('Cảnh báo kèm tuyến: trạm mực nước gần tuyến vượt báo động II', rw?.warnings?.some((w) => w.includes('Trạm thuỷ văn Cao Bằng') &&
  w.includes('vượt báo động II')), JSON.stringify(rw?.warnings));
check('Xoá thiết bị', (await call('DELETE', `/integrations/devices/${DEV}`, null, admin)).status === 204);
const bySource = Object.fromEntries(((await call('GET', '/integrations/monitor', null, admin)).data?.stations || []).map((s) => [s.source, s.n]));
check('Trạm hết thiết bị → về "chờ thiết bị", không thành trạm mô phỏng (không chạy bộ mô phỏng)',
  bySource.external === 1 && !bySource.simulator && !bySource.iot, JSON.stringify(bySource));
check('Cổng SOS tự động chưa cấp khoá → 503 (không nhận phiếu giả)',
  (await call('POST', '/sos/intake', { text: 'thử' }, null, { 'X-Intake-Key': 'x' })).status === 503);

// ================================================================ 10. Email thật (SMTP) & tự giám sát
const forgot = await call('POST', '/auth/forgot-password', { login: xaUser });
check('Quên mật khẩu → 200 (không lộ tài khoản có tồn tại)', forgot.status === 200);
let mail;
for (let i = 0; i < 20 && !mail; i++) {
  try {
    const list = await (await fetch(`${MAILPIT}/api/v1/messages`)).json();
    mail = list.messages?.find((m) => m.Subject.includes('Đặt lại mật khẩu') && m.To?.some((t) => t.Address === `${xaUser}@ci.local`));
  } catch { /* Mailpit chưa sẵn sàng */ }
  if (!mail) await sleep(3000);
}
check('Email đặt lại mật khẩu gửi qua SMTP', !!mail, mail?.Subject);
if (mail) {
  const body = await (await fetch(`${MAILPIT}/api/v1/message/${mail.ID}`)).json();
  check('Link trong email dùng PUBLIC_BASE_URL https://', /https:\/\/[^\s"]+\/dat-lai-mat-khau\?token=/.test(body.Text || ''));
}
const inbox = (await (await fetch(`${MAILPIT}/api/v1/messages?limit=200`)).json().catch(() => ({}))).messages || [];
check('Email báo cấp tỉnh có hồ sơ xã gửi chờ duyệt', inbox.some((m) => m.Subject.includes(`${sub.data?.code} chờ phê duyệt`)));
check('Email báo quản trị xã hồ sơ đã được phê duyệt',
  inbox.some((m) => m.Subject.includes(`${sub.data?.code} đã được phê duyệt`) && m.To?.some((t) => t.Address === `${qtxa}@ci.local`)));
// Worker kiểm tra mỗi phút; bản sao lưu đầu tiên chạy ngay khi service backup khởi động
let full;
for (let i = 0; i < 40; i++) {
  const r = await fetch(ROOT + '/health/full');
  full = { status: r.status, data: await r.json().catch(() => null) };
  const c = full.data?.checks || {};
  if (full.status === 200 && Object.keys(c).some((k) => k.startsWith('backup'))) break;
  await sleep(6000);
}
const checks = full?.data?.checks || {};
check('/health/full = 200: CSDL, Redis, worker, API, ổ đĩa, sao lưu đều đạt', full?.status === 200,
  `${full?.status} ${JSON.stringify(checks)}`);
check('Tự giám sát có kiểm tra bản sao lưu', Object.keys(checks).some((k) => k.startsWith('backup')), Object.keys(checks).join(','));

console.log(failures ? `\n${failures} kiểm tra THẤT BẠI` : '\nTất cả kiểm tra luồng vận hành thật đạt');
process.exitCode = failures ? 1 : 0;
