#!/usr/bin/env node
// Kiểm thử tài khoản người dân của cổng công khai qua API (Đ5 — docs/ke-hoach-lam-moi-giao-dien.md mục 11):
// đăng ký (kiểm dữ liệu, trùng số), đăng nhập (sai / đúng), phiên người dân TÁCH HẲN phiên cán bộ, sửa thông tin, gửi phản
// ánh khi đã đăng nhập (họ tên + số điện thoại lấy từ tài khoản, "Phiếu của tôi"), chưa đăng nhập theo cờ
// citizen_account_required, quên mật khẩu qua email (Mailpit) → đặt lại (đường dẫn dùng 1 lần), cán bộ tìm / khoá / mở
// khoá / đặt mật khẩu tạm (Cấp 3 không có quyền), mật khẩu tạm phải đổi trước khi dùng.
// node tests/e2e/citizen-test.mjs [http://localhost:8000] [http://localhost:8025]
const ROOT = process.argv[2] || 'http://localhost:8000';
const MAILPIT = process.argv[3] || 'http://localhost:8025';
const BASE = ROOT + '/api/v1';

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures += 1;
};
async function call(method, path, body, token) {
  const form = body instanceof FormData;
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body && !form ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form ? body : body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* không phải JSON */ }
  return { status: res.status, data };
}
const staffLogin = async (u, p) => (await call('POST', '/auth/login', { username: u, password: p })).data?.token;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const COBA = { lat: 23.005, lon: 105.718 }; // trong xã Cô Ba
const tail = String(Date.now()).slice(-6);
const PHONE = `0999${tail}`; // số giả (đầu 0999) — không phải số thật
const EMAIL = `nguoidan.${tail}@example.com`;
const PASS = 'Matkhau123';
const reportForm = (extra = {}) => {
  const f = new FormData();
  const v = { category: 'ngap', description: `Kiểm thử tài khoản người dân ${tail}: nước ngập qua đường liên thôn`, ...COBA, ...extra };
  for (const [k, val] of Object.entries(v)) f.append(k, String(val));
  return f;
};

const admin = await staffLogin('admin', 'admin123');
const coba = await staffLogin('canbo.coba', 'coba123');
check('Đăng nhập cán bộ để kiểm thử (Cấp 1 + Cấp 3)', !!admin && !!coba);
const units = (await call('GET', '/admin-units?level=xa', null, admin)).data || [];
const unit = units.find((u) => u.code) || null;

// ── Đăng ký
const reg = (extra = {}) => call('POST', '/public/account/register', {
  full_name: 'Người Dân Thử', phone: `+84 999 ${tail}`, password: PASS, email: EMAIL, consent: true, ...extra,
});
check('Đăng ký thiếu đồng ý dùng thông tin → 422', (await reg({ consent: false })).status === 422);
check('Đăng ký mật khẩu yếu → 422', (await reg({ password: 'abc' })).status === 422);
check('Đăng ký số điện thoại sai → 422', (await reg({ phone: '123' })).status === 422);
check('Đăng ký điền trường ẩn (bot) → 400', (await reg({ website: 'http://spam' })).status === 400);
const r1 = await reg();
check('Đăng ký đúng → 201, đăng nhập luôn, số điện thoại chuẩn hoá (+84 → 0)', r1.status === 201 && !!r1.data?.token && r1.data?.account?.phone === PHONE,
  `${r1.status} ${r1.data?.account?.phone || JSON.stringify(r1.data)}`);
check('Thông tin trả về không có mã băm mật khẩu, phiên bản phiên', !/password_hash|token_version/.test(JSON.stringify(r1.data)));
check('Đăng ký trùng số → 409', (await reg({ email: null })).status === 409);
let token = r1.data?.token;
let pw = PASS; // mật khẩu hiện tại (đổi sau bước đặt lại qua email)
const me0 = r1.data?.account;

// ── Đăng nhập, phiên tách hẳn cán bộ
check('Đăng nhập sai mật khẩu → 401', (await call('POST', '/public/account/login', { phone: PHONE, password: 'Saimatkhau1' })).status === 401);
const l1 = await call('POST', '/public/account/login', { phone: PHONE, password: PASS });
check('Đăng nhập đúng → phiên người dân', l1.status === 200 && !!l1.data?.token);
token = l1.data?.token || token;
check('Phiên người dân KHÔNG gọi được API điều hành (/auth/me, /citizens)',
  (await call('GET', '/auth/me', null, token)).status === 401 && (await call('GET', '/citizens', null, token)).status === 401);
check('Phiên cán bộ KHÔNG thay được phiên người dân (/public/account/me)', (await call('GET', '/public/account/me', null, admin)).status === 401);
const me1 = await call('GET', '/public/account/me', null, token);
check('/public/account/me: đúng tài khoản', me1.status === 200 && me1.data?.id === me0?.id && me1.data?.full_name === 'Người Dân Thử');

// ── Sửa thông tin
if (unit) {
  const p = await call('PATCH', '/public/account/me', { full_name: '  Người   Dân  Thử Hai ', admin_code: unit.code }, token);
  check('Sửa họ tên (gọn khoảng trắng) + xã đang ở', p.status === 200 && p.data?.full_name === 'Người Dân Thử Hai' && p.data?.admin_code === unit.code,
    JSON.stringify(p.data).slice(0, 120));
}
check('Xã không có thật → 422', (await call('PATCH', '/public/account/me', { admin_code: 'KHONG_CO' }, token)).status === 422);

// ── Gửi phản ánh
const cfg = (await call('GET', '/public/config')).data || {};
check('/public/config có cờ citizen_account_required', typeof cfg.citizen_account_required === 'boolean');
const anon = await call('POST', '/public/reports', reportForm({ reporter_name: 'Ẩn danh', reporter_phone: '0999000001' }));
check(cfg.citizen_account_required ? 'Chưa đăng nhập gửi phản ánh → 401 (bắt buộc tài khoản)' : 'Chưa đăng nhập vẫn gửi được (chưa bật bắt buộc tài khoản)',
  cfg.citizen_account_required ? anon.status === 401 : anon.status === 201, String(anon.status));
const rep = await call('POST', '/public/reports', reportForm({ reporter_name: 'Tên khác', reporter_phone: '0999000002' }), token);
check('Đã đăng nhập gửi phản ánh → 201', rep.status === 201 && /^PA-\d+/.test(rep.data?.code || ''), `${rep.status} ${rep.data?.code || JSON.stringify(rep.data)}`);
const mine = await call('GET', '/public/account/reports', null, token);
check('"Phiếu của tôi" có phản ánh vừa gửi', mine.status === 200 && (mine.data || []).some((x) => x.code === rep.data?.code));
const staffList = (await call('GET', '/reports?status=cho_duyet', null, admin)).data?.items || [];
const sr = staffList.find((x) => x.code === rep.data?.code);
check('Họ tên, số điện thoại của phản ánh lấy từ tài khoản (không theo ô nhập)', !!sr && sr.reporter_phone === PHONE && sr.reporter_name === 'Người Dân Thử Hai',
  sr ? `${sr.reporter_name} ${sr.reporter_phone}` : 'không thấy phản ánh');

// ── Quên mật khẩu qua email
check('Quên mật khẩu: email không có tài khoản vẫn trả cùng câu (không lộ)', (await call('POST', '/public/account/forgot', { email: `khongco.${tail}@example.com` })).status === 200);
check('Quên mật khẩu: email có tài khoản → 200', (await call('POST', '/public/account/forgot', { email: EMAIL })).status === 200);
let link = null;
for (let i = 0; i < 20 && !link; i += 1) {
  await sleep(500);
  try {
    const list = await (await fetch(`${MAILPIT}/api/v1/messages?limit=50`)).json();
    const msg = (list.messages || []).find((m) => (m.To || []).some((t) => t.Address === EMAIL));
    if (msg) {
      const full = await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json();
      link = (full.Text || '').match(/dat-lai-mat-khau\?token=([\w.-]+)/)?.[1] || null;
    }
  } catch { /* Mailpit chưa sẵn sàng */ }
}
check('Thư đặt lại mật khẩu tới hộp thư (Mailpit), có đường dẫn', !!link);
if (link) {
  const NEW = 'Matkhaumoi456';
  check('Đặt lại mật khẩu bằng đường dẫn → 200', (await call('POST', '/public/account/reset', { token: link, password: NEW })).status === 200);
  check('Đường dẫn đặt lại chỉ dùng 1 lần', (await call('POST', '/public/account/reset', { token: link, password: 'Matkhaukhac789' })).status === 400);
  check('Phiên cũ hết hiệu lực sau khi đặt lại', (await call('GET', '/public/account/me', null, token)).status === 401);
  pw = NEW;
  const l2 = await call('POST', '/public/account/login', { phone: PHONE, password: NEW });
  check('Đăng nhập bằng mật khẩu mới', l2.status === 200);
  token = l2.data?.token || token;
}

// ── Cán bộ quản lý tài khoản người dân
const found = await call('GET', `/citizens?q=${tail}`, null, admin);
const acc = (found.data?.items || []).find((x) => x.phone === PHONE);
check('Cán bộ tỉnh tìm theo số điện thoại', found.status === 200 && !!acc && !JSON.stringify(found.data).includes('password_hash'));
check('Cán bộ xã (Cấp 3) không xem được tài khoản người dân → 403', (await call('GET', '/citizens', null, coba)).status === 403);
if (acc) {
  check('Khoá không ghi lý do → 422', (await call('PATCH', `/citizens/${acc.id}`, { is_active: false }, admin)).status === 422);
  const lock = await call('PATCH', `/citizens/${acc.id}`, { is_active: false, reason: 'Kiểm thử khoá tài khoản' }, admin);
  const lockedLogin = await call('POST', '/public/account/login', { phone: PHONE, password: pw });
  check('Khoá tài khoản → phiên đang mở hết hiệu lực; đăng nhập đúng mật khẩu báo "bị khoá" (403)',
    lock.status === 200 && (await call('GET', '/public/account/me', null, token)).status === 401 && lockedLogin.status === 403,
    `${lock.status} ${lockedLogin.status}`);
  check('Cán bộ xã không khoá / mở khoá được → 403', (await call('PATCH', `/citizens/${acc.id}`, { is_active: true }, coba)).status === 403);
  check('Mở khoá → 200', (await call('PATCH', `/citizens/${acc.id}`, { is_active: true }, admin)).status === 200);
  const reset = await call('POST', `/citizens/${acc.id}/reset-password`, null, admin);
  const temp = reset.data?.temp_password;
  check('Đặt mật khẩu tạm (qua đường dây nóng) → trả mật khẩu tạm một lần', reset.status === 200 && /^[a-z]{4}\d{4}$/.test(temp || ''));
  const l3 = await call('POST', '/public/account/login', { phone: PHONE, password: temp });
  check('Đăng nhập mật khẩu tạm → phải đổi mật khẩu', l3.status === 200 && l3.data?.account?.must_change_password === true);
  check('Mật khẩu tạm chưa đổi: không xem / gửi được phản ánh (403)', (await call('GET', '/public/account/reports', null, l3.data?.token)).status === 403);
  const ch = await call('POST', '/public/account/change-password', { old_password: temp, new_password: 'Matkhaucuatoi789' }, l3.data?.token);
  check('Đổi mật khẩu → phiên mới dùng được', ch.status === 200 && (await call('GET', '/public/account/reports', null, ch.data?.token)).status === 200);
}

if (failures) {
  console.log(`\n${failures} kiểm tra THẤT BẠI`);
  process.exit(1);
}
console.log('\nĐạt');
