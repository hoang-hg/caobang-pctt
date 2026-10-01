// Kiểm thử đăng nhập và phân quyền 3 cấp (Cấp 1 Quản trị hệ thống · Cấp 2 Quản trị tỉnh · Cấp 3 Quản trị xã/phường)
//   node tests/e2e/login-hierarchy-test.mjs [http://localhost:8000]

const BASE = (process.argv[2] || 'http://localhost:8000') + '/api/v1';
let failures = 0;

async function call(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures += 1;
}

async function main() {
  console.log('=== KIỂM THỬ XÁC THỰC BẢO MẬT & PHÂN CẤP 3 TẦNG ADMIN ===\n');

  // 1. Kiểm tra không để lộ tài khoản qua demo-accounts
  const demoRes = await call('GET', '/auth/demo-accounts');
  check(
    'Bảo mật ATTT: Không lộ danh sách tài khoản qua /auth/demo-accounts',
    demoRes.status === 404,
    `Status: ${demoRes.status}`
  );

  // 2. Đăng nhập sai mật khẩu hoặc tài khoản không tồn tại
  const wrongRes = await call('POST', '/auth/login', { username: 'admin', password: 'wrongpassword' });
  check('Đăng nhập sai mật khẩu → 401', wrongRes.status === 401, wrongRes.data?.detail);

  const notFoundRes = await call('POST', '/auth/login', { username: 'nonexistent_user', password: 'password123' });
  check('Tài khoản không tồn tại → 401', notFoundRes.status === 401);

  // 3. Đăng nhập CẤP 1: ADMIN TỔNG HỆ THỐNG
  const superUser = await call('POST', '/auth/login', { username: 'admin', password: 'admin123' });
  check(
    'Cấp 1: Đăng nhập Admin Tổng bằng username ("admin")',
    superUser.status === 200 && superUser.data?.user?.assignments[0]?.role === 'super_admin'
  );

  const superEmail = await call('POST', '/auth/login', { username: 'admin@caobang-pctt.local', password: 'admin123' });
  check(
    'Cấp 1: Đăng nhập Admin Tổng bằng email ("admin@caobang-pctt.local")',
    superEmail.status === 200 && superEmail.data?.token
  );

  // 4. Đăng nhập CẤP 2: ADMIN TỈNH
  const tinhUser = await call('POST', '/auth/login', { username: 'admin.tinh', password: 'admintinh123' });
  check(
    'Cấp 2: Đăng nhập Admin Tỉnh bằng username ("admin.tinh")',
    tinhUser.status === 200 && tinhUser.data?.user?.assignments[0]?.role === 'admin_tinh'
  );

  const tinhEmail = await call('POST', '/auth/login', { username: 'admin.tinh@caobang-pctt.local', password: 'admintinh123' });
  check(
    'Cấp 2: Đăng nhập Admin Tỉnh bằng email ("admin.tinh@caobang-pctt.local")',
    tinhEmail.status === 200 && tinhEmail.data?.user?.assignments[0]?.domain === '*'
  );

  // 5. Đăng nhập CẤP 3: ADMIN XÃ (Cô Ba, Ca Thành, Thục Phán)
  const cobaUser = await call('POST', '/auth/login', { username: 'admin.coba', password: 'admincoba123' });
  check(
    'Cấp 3: Đăng nhập Admin Xã Cô Ba ("admin.coba")',
    cobaUser.status === 200 && cobaUser.data?.user?.assignments[0]?.domain === 'BAOLAC/CB-COBA',
    cobaUser.data?.user?.assignments[0]?.domain_label
  );

  const cathanEmail = await call('POST', '/auth/login', { username: 'admin.cathan@caobang-pctt.local', password: 'admincathan123' });
  check(
    'Cấp 3: Đăng nhập Admin Xã Ca Thành bằng email',
    cathanEmail.status === 200 && cathanEmail.data?.user?.assignments[0]?.domain === 'NGUYENBINH/CB-CATHANH',
    cathanEmail.data?.user?.assignments[0]?.domain_label
  );

  const thucphanUser = await call('POST', '/auth/login', { username: 'admin.thucphan', password: 'adminthucphan123' });
  check(
    'Cấp 3: Đăng nhập Admin Phường Thục Phán bằng username',
    thucphanUser.status === 200 && thucphanUser.data?.user?.assignments[0]?.domain === 'TPCAOBANG/CB-THUCPHAN',
    thucphanUser.data?.user?.assignments[0]?.domain_label
  );

  // 6. Kiểm tra thẩm quyền phân cấp không gian (Spatial RBAC)
  const superToken = superUser.data.token;
  const tinhToken = tinhUser.data.token;
  const cobaToken = cobaUser.data.token;

  const superUsers = await call('GET', '/rbac/users', null, superToken);
  const tinhUsers = await call('GET', '/rbac/users', null, tinhToken);
  const cobaUsers = await call('GET', '/rbac/users', null, cobaToken);

  check(
    'Cấp 1 & 2 thấy danh sách người dùng toàn tỉnh',
    // không phụ thuộc số tài khoản trong CSDL: admin tỉnh (phạm vi *) thấy đúng bằng Superadmin
    superUsers.status === 200 && tinhUsers.status === 200 && superUsers.data.length > 0 &&
      tinhUsers.data.length === superUsers.data.length
  );

  check('Cấp 3 (Admin xã Cô Ba) không xem / quản lý tài khoản → 403', cobaUsers.status === 403, `HTTP ${cobaUsers.status}`);

  // 7. Chỉ cấp trên tạo / quản lý tài khoản cấp dưới; Cấp 3 không tạo tài khoản nào
  const stamp = Date.now().toString(36);
  const body = (role, domain) => ({ username: `cbx.${stamp}`, full_name: 'Cán bộ thử nghiệm', password: 'matkhau123', role, domain });
  const byXa = await call('POST', '/rbac/users', body('admin_xa', 'BAOLAC/CB-COBA'), cobaToken);
  check('Cấp 3 không tạo được tài khoản, kể cả trong xã mình → 403', byXa.status === 403, byXa.data?.detail);
  const byTinh = await call('POST', '/rbac/users', body('admin_xa', 'BAOLAC/CB-COBA'), tinhToken);
  check('Cấp 2 tạo tài khoản Cấp 3 xã Cô Ba', byTinh.status === 201, byTinh.data?.detail);
  const escalate = await call('PUT', `/rbac/users/${byTinh.data?.id}/assignment`, { role: 'admin_tinh', domain: '*' }, tinhToken);
  check('Cấp 2 không nâng tài khoản lên Cấp 2 → 403', escalate.status === 403, escalate.data?.detail);
  const xaEsc = await call('PUT', `/rbac/users/${byTinh.data?.id}/assignment`, { role: 'admin_tinh', domain: '*' }, cobaToken);
  check('Cấp 3 cố leo thang cấp vai trò → 403', xaEsc.status === 403, xaEsc.data?.detail);

  console.log(`\n=== TỔNG KẾT: ${failures === 0 ? 'TẤT CẢ KIỂM THỬ THÀNH CÔNG (100% PASS)' : `${failures} THẤT BẠI`} ===`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
