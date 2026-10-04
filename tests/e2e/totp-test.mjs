// Kiểm thử xác thực 2 lớp TOTP: tự bật, đăng nhập 2 bước, chống dùng lại mã, mã khôi phục, tắt, quản trị đặt lại,
// khoá khi sai nhiều lần, và (backend TOTP_REQUIRED_ROLES=admin_xa + REQUIRED_ROLE=admin_xa) bắt buộc cài đặt khi đăng nhập.
//   node tests/e2e/totp-test.mjs [http://localhost:8000]
// Mã TOTP tính ngay trong script (RFC 6238, HMAC-SHA1, 30 giây, 6 số) — không cần điện thoại. Chạy ~1 phút (chờ bước
// thời gian mới để có mã chưa dùng).
import crypto from 'node:crypto';

const ROOT = process.argv[2] || 'http://localhost:8000';
const BASE = ROOT + '/api/v1';
const REQUIRED_ROLE = process.env.REQUIRED_ROLE || ''; // vai trò bắt buộc 2 lớp để thử (VD admin_xa)
let failures = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures += 1;
};
async function call(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const login = (username, password) => call('POST', '/auth/login', { username, password });

// ---------------------------------------------------------------- TOTP (RFC 6238)
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
const currentStep = () => Math.floor(Date.now() / 30_000);
const used = new Map(); // khoá → bước đã dùng (máy chủ chỉ nhận bước lớn hơn)
async function freshCode(secret) {
  for (;;) {
    const s = currentStep();
    for (const step of [s, s + 1]) {
      if (step > (used.get(secret) ?? -1)) {
        used.set(secret, step);
        return totp(secret, step);
      }
    }
    await sleep(30_000 - (Date.now() % 30_000) + 300); // chờ bước thời gian mới
  }
}
const lastCode = (secret) => totp(secret, used.get(secret));

// ---------------------------------------------------------------- chuẩn bị tài khoản thử
const admin = (await login('admin', 'admin123')).data?.token;
check('Quản trị đăng nhập', !!admin);
const stamp = Date.now().toString(36);
const username = `mfa.${stamp}`;
const initialPassword = 'MatKhau2fa9'; // quản trị đặt khi tạo
const password = 'MatKhauRieng2fa9'; // người dùng tự đổi ở lần đăng nhập đầu (bắt buộc)
const created = await call('POST', '/rbac/users', {
  username, full_name: 'Thử xác thực 2 lớp', password: initialPassword, role: 'admin_xa', domain: 'BAOLAC/CB-COBA',
}, admin);
check('Tạo tài khoản thử', created.status === 201, username);
const userId = created.data?.id;

let first = await login(username, initialPassword);
check('Chưa bật: đăng nhập 1 bước', !!first.data?.token && !first.data?.mfa, first.data?.token ? '' : `HTTP ${first.status}`);
if (first.status === 429) {
  console.log('Giới hạn đăng nhập theo IP (30/phút) — xoá khoá rl:* trong Redis rồi chạy lại (README 12.1)');
  process.exit(1);
}
const own = await call('POST', '/auth/change-password', { current_password: initialPassword, new_password: password }, first.data?.token);
check('Lần đầu phải đổi mật khẩu quản trị đặt', first.data?.user?.must_change_password === true && own.status === 200 &&
  own.data?.user?.must_change_password === false, `HTTP ${own.status}`);
let token = own.data?.token;
let me = (await call('GET', '/auth/me', null, token)).data;
check('/auth/me báo trạng thái xác thực 2 lớp', me?.mfa?.enabled === false && me?.mfa?.required === false);

// ---------------------------------------------------------------- tự bật
const setup = await call('POST', '/auth/mfa/setup', {}, token);
check('Tạo mã QR', setup.status === 200 && /^otpauth:\/\/totp\//.test(setup.data?.uri) && setup.data?.qr?.startsWith('data:image/svg+xml'));
const secret = setup.data?.secret;
check('Mã sai không bật được', (await call('POST', '/auth/mfa/enable', { code: '000000' }, token)).status === 400);
const enabled = await call('POST', '/auth/mfa/enable', { code: await freshCode(secret) }, token);
const codes = enabled.data?.recovery_codes || [];
check('Bật: 10 mã khôi phục + token mới', enabled.status === 200 && codes.length === 10 && !!enabled.data?.token);
check('Token cũ bị thu hồi sau khi bật', (await call('GET', '/auth/me', null, token)).status === 401);
token = enabled.data?.token;
me = (await call('GET', '/auth/me', null, token)).data;
check('Trạng thái sau khi bật', me?.mfa?.enabled === true && me?.mfa?.recovery_left === 10);
check('Bật lần nữa → 409', (await call('POST', '/auth/mfa/setup', {}, token)).status === 409);

// ---------------------------------------------------------------- đăng nhập 2 bước
const step1 = await login(username, password);
check('Mật khẩu đúng → cần mã (không có token)', step1.data?.mfa === 'verify' && !!step1.data?.challenge && !step1.data?.token);
const challenge = step1.data?.challenge;
check('Phiếu xác thực không dùng làm token phiên được', (await call('GET', '/auth/me', null, challenge)).status === 401);
check('Mã sai → 401', (await call('POST', '/auth/mfa/verify', { challenge, code: '123456' })).status === 401);
check('Dùng lại mã đã dùng → 401', (await call('POST', '/auth/mfa/verify', { challenge, code: lastCode(secret) })).status === 401);
const ok = await call('POST', '/auth/mfa/verify', { challenge, code: await freshCode(secret) });
check('Mã đúng → token', ok.status === 200 && !!ok.data?.token);
token = ok.data?.token || token;
check('Phiếu hết hiệu lực khi sai giai đoạn', (await call('POST', '/auth/mfa/enable', { challenge, code: '000000' })).status === 401);

// ---------------------------------------------------------------- mã khôi phục
const c2 = (await login(username, password)).data?.challenge;
const rec = await call('POST', '/auth/mfa/verify', { challenge: c2, code: codes[0].toUpperCase() });
check('Mã khôi phục đăng nhập được (không phân biệt hoa thường)', rec.status === 200 && !!rec.data?.token);
check('Mã khôi phục chỉ dùng 1 lần', (await call('POST', '/auth/mfa/verify', { challenge: c2, code: codes[0] })).status === 401);
token = rec.data?.token || token;
check('Còn 9 mã khôi phục', (await call('GET', '/auth/me', null, token)).data?.mfa?.recovery_left === 9);
const regen = await call('POST', '/auth/mfa/recovery-codes', { code: await freshCode(secret) }, token);
check('Tạo bộ mã khôi phục mới', regen.status === 200 && regen.data?.recovery_codes?.length === 10);
const c3 = (await login(username, password)).data?.challenge;
check('Mã khôi phục cũ hết hiệu lực', (await call('POST', '/auth/mfa/verify', { challenge: c3, code: codes[1] })).status === 401);

// ---------------------------------------------------------------- tắt
check('Tắt: sai mật khẩu → 400', (await call('POST', '/auth/mfa/disable', { password: 'sai-mat-khau1', code: await freshCode(secret) }, token)).status === 400);
const off = await call('POST', '/auth/mfa/disable', { password, code: await freshCode(secret) }, token);
check('Tắt bằng mật khẩu + mã', off.status === 200 && off.data?.user?.mfa?.enabled === false);
check('Sau khi tắt: đăng nhập 1 bước', !!(await login(username, password)).data?.token);

// ---------------------------------------------------------------- quản trị đặt lại (mất điện thoại)
token = off.data?.token;
const s2 = (await call('POST', '/auth/mfa/setup', {}, token)).data?.secret;
token = (await call('POST', '/auth/mfa/enable', { code: await freshCode(s2) }, token)).data?.token;
check('Bật lại', (await login(username, password)).data?.mfa === 'verify');
const reset = await call('POST', `/rbac/users/${userId}/mfa/reset`, null, admin);
check('Quản trị đặt lại xác thực 2 lớp', reset.status === 200);
check('Đặt lại → phiên cũ bị đăng xuất', (await call('GET', '/auth/me', null, token)).status === 401);
check('Đặt lại → đăng nhập 1 bước', !!(await login(username, password)).data?.token);
const users = (await call('GET', '/rbac/users', null, admin)).data || [];
check('Danh sách tài khoản có cột xác thực 2 lớp', users.some((u) => u.username === username && u.mfa_enabled === false));

// ---------------------------------------------------------------- khoá khi sai nhiều lần
token = (await login(username, password)).data?.token;
const s3 = (await call('POST', '/auth/mfa/setup', {}, token)).data?.secret;
await call('POST', '/auth/mfa/enable', { code: await freshCode(s3) }, token);
const c4 = (await login(username, password)).data?.challenge;
let status = 0;
for (let i = 0; i < 12 && status !== 429; i += 1) status = (await call('POST', '/auth/mfa/verify', { challenge: c4, code: '000000' })).status;
check('Sai mã nhiều lần → tạm khoá (429)', status === 429);
check('Đang khoá: mã đúng cũng bị từ chối', (await call('POST', '/auth/mfa/verify', { challenge: c4, code: await freshCode(s3) })).status === 429);

// ---------------------------------------------------------------- vai trò bắt buộc
// Chỉ chạy khi backend bắt buộc 2 lớp cho Cấp 3 (TOTP_REQUIRED_ROLES=admin_xa, đặt REQUIRED_ROLE=admin_xa khi chạy test).
// CI không bật (mọi tài khoản demo cấp xã sẽ phải cài 2 lớp) — job prod kiểm bắt buộc 2 lớp cho Cấp 2 với cấu hình thật.
const forcedName = `mfa.bb.${stamp}`;
const forced = REQUIRED_ROLE
  ? (await call('POST', '/rbac/users', {
    username: forcedName, full_name: 'Thử bắt buộc 2 lớp', password: initialPassword, role: REQUIRED_ROLE, domain: 'BAOLAC/CB-COBA',
  }, admin), await login(forcedName, initialPassword))
  : null;
if (forced?.data?.mfa !== 'setup') {
  console.log('SKIP  Bắt buộc cài đặt khi đăng nhập — chạy với REQUIRED_ROLE=admin_xa + backend TOTP_REQUIRED_ROLES=admin_xa');
} else {
  const fc = forced.data.challenge;
  check('Vai trò bắt buộc: chưa có token, phải cài đặt', !forced.data.token);
  const fs = await call('POST', '/auth/mfa/setup', { challenge: fc });
  check('Cài đặt bằng phiếu đăng nhập', fs.status === 200 && !!fs.data?.secret);
  const fe = await call('POST', '/auth/mfa/enable', { challenge: fc, code: await freshCode(fs.data.secret) });
  check('Bật xong → đăng nhập luôn + mã khôi phục', fe.status === 200 && !!fe.data?.token && fe.data?.recovery_codes?.length === 10);
  // Mật khẩu quản trị đặt → đổi trước khi dùng các chức năng khác
  const ft = (await call('POST', '/auth/change-password', { current_password: initialPassword, new_password: password }, fe.data?.token)).data?.token;
  check('Vai trò bắt buộc: không tự tắt được',
    (await call('POST', '/auth/mfa/disable', { password, code: await freshCode(fs.data.secret) }, ft)).status === 403);
  check('/auth/me: required = true', (await call('GET', '/auth/me', null, ft)).data?.mfa?.required === true);
  const fu = (await call('GET', '/rbac/users', null, admin)).data.find((u) => u.username === forcedName);
  await call('POST', `/rbac/users/${fu.id}/mfa/reset`, null, admin);
  check('Đặt lại → lần đăng nhập sau phải cài lại', (await login(forcedName, password)).data?.mfa === 'setup');
}

console.log(failures ? `\n${failures} kiểm tra THẤT BẠI` : '\nTất cả kiểm tra xác thực 2 lớp đạt');
process.exit(failures ? 1 : 0);
