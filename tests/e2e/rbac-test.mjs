// Kiểm thử phân quyền 3 cấp qua API: mỗi cấp 1 vai trò, mỗi tài khoản 1 vai trò, phạm vi địa bàn, cấp trên quản lý cấp
// dưới (chống mạo danh cùng cấp), cảnh báo 4 mắt + PIN.
//   node tests/e2e/rbac-test.mjs [http://localhost:8000]
const BASE = (process.argv[2] || 'http://localhost:8000') + '/api/v1';
let failures = 0;

async function call(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures += 1;
};
const login = async (u, p) => (await call('POST', '/auth/login', { username: u, password: p })).data?.token;
const stamp = Date.now().toString(36);
const PW = 'MatKhau2026';
const OWN_PW = 'MatKhauRieng2026'; // mật khẩu người dùng tự đặt ở lần đăng nhập đầu
// Tài khoản cấp trên vừa tạo: đăng nhập rồi đổi sang mật khẩu riêng (bắt buộc) → token dùng được hệ thống
const firstLogin = async (u, p) => {
  const r = (await call('POST', '/auth/login', { username: u, password: p })).data;
  if (!r?.user?.must_change_password) return r?.token;
  return (await call('POST', '/auth/change-password', { current_password: p, new_password: OWN_PW }, r.token)).data?.token;
};
const jwtBody = (tok) => JSON.parse(Buffer.from(String(tok).split('.')[1] || '', 'base64url').toString() || '{}');

// ---- Chưa đăng nhập
check('Chưa đăng nhập → 401 khi xem dashboard', (await call('GET', '/dashboard/kpis')).status === 401);
check('Chưa đăng nhập → 401 khi xem SOS', (await call('GET', '/sos')).status === 401);

const T = {
  admin: await login('admin', 'admin123'), // Cấp 1
  chihuy: await login('chihuy', 'chihuy123'), // Cấp 2, có PIN 2468
  trucban: await login('trucban', 'trucban123'), // Cấp 2, chưa có PIN
  tinh: await login('admin.tinh', 'admintinh123'), // Cấp 2
  coba: await login('canbo.coba', 'coba123'), // Cấp 3 xã Cô Ba
};
check('Đăng nhập 5 tài khoản demo (3 cấp)', Object.values(T).every(Boolean));

// ---- Phiên tự gia hạn khi trang còn mở: token mới giữ mốc đăng nhập, không quá 72 giờ (SESSION_MAX_HOURS) từ lúc đó
const renewed = await call('POST', '/auth/refresh', null, T.trucban);
const t0 = jwtBody(T.trucban);
const t1 = jwtBody(renewed.data?.token);
check('Gia hạn phiên: token mới giữ mốc đăng nhập, hạn ≤ 72 giờ kể từ lúc đăng nhập',
  renewed.status === 200 && !!t0.auth_time && t1.auth_time === t0.auth_time && t1.exp >= t0.exp && t1.exp <= t0.auth_time + 72 * 3600,
  JSON.stringify({ status: renewed.status, auth_time: [t0.auth_time, t1.auth_time], exp: [t0.exp, t1.exp] }));
check('Token cũ vẫn dùng được tới hạn của nó', (await call('GET', '/auth/me', null, T.trucban)).status === 200);
check('Gia hạn cần đăng nhập → 401', (await call('POST', '/auth/refresh')).status === 401);

// ---- Đúng 3 vai trò, không tạo được vai trò khác
const roles = (await call('GET', '/rbac/roles', null, T.admin)).data || [];
check('Hệ thống có đúng 3 vai trò, mỗi cấp 1 vai trò', roles.map((r) => `${r.level}:${r.name}`).join() === '1:super_admin,2:admin_tinh,3:admin_xa',
  roles.map((r) => r.name).join());
check('Không còn tạo vai trò tuỳ chỉnh (kể cả Cấp 1)', (await call('POST', '/rbac/roles', { name: `x_${stamp}`, display_name: 'X', permissions: ['sos.view'] }, T.admin)).status === 405);
const me = (await call('GET', '/auth/me', null, T.coba)).data;
check('/auth/me: Cấp 3 có đúng 1 vai trò, quyền chỉ trong xã', me.assignments.length === 1 && me.assignments[0].role === 'admin_xa' &&
  me.assignments[0].domain === 'BAOLAC/CB-COBA' && me.permissions.every((p) => p.dom === 'BAOLAC/CB-COBA'));

// ---- Cấp 3: chỉ trong xã của mình
const cobaSos = (await call('GET', '/sos', null, T.coba)).data;
check('Cấp 3 chỉ thấy SOS trong xã Cô Ba', cobaSos.every((t) => t.admin_code === 'CB-COBA'), `${cobaSos.length} phiếu`);
const allSos = (await call('GET', '/sos', null, T.chihuy)).data;
const tpTicket = allSos.find((t) => t.admin_code === 'CB-THUCPHAN' || t.admin_code === 'CB-NUNGTRICAO');
check('Cấp 3 không sửa được phiếu xã khác → 403', (await call('PATCH', `/sos/${tpTicket.id}`, { status: 'dieu_phoi' }, T.coba)).status === 403);
const inCoba = await call('POST', '/sos', { raw_message: 'Nhà sập do sạt lở ở xã Cô Ba, 3 người mắc kẹt', source: 'CAN_BO' }, T.coba);
check('Cấp 3 tạo SOS trong xã mình', inCoba.status === 200 && inCoba.data.admin_code === 'CB-COBA', inCoba.data?.code);
check('Cấp 3 tạo SOS xã khác → 403',
  (await call('POST', '/sos', { raw_message: 'Ngập sâu thôn Bản Ngắn xã Hòa An, 4 người', source: 'CAN_BO' }, T.coba)).status === 403);
check('Cấp 3 không điều động → 403', (await call('GET', `/sos/${inCoba.data.id}/match`, null, T.coba)).status === 403);
check('Cấp 3 không xem / quản lý tài khoản → 403', (await call('GET', '/rbac/users', null, T.coba)).status === 403);
check('Cấp 3 không vào được tổng đài → 403', (await call('GET', '/alerts/hotline', null, T.coba)).status === 403);
check('Cấp 3 không xem nhật ký pháp lý → 403', (await call('GET', '/alerts/audit', null, T.coba)).status === 403);
const lay = (await call('GET', '/map/layers', null, T.coba)).data;
check('Bản đồ của Cấp 3 chỉ có SOS trong xã', lay.sos.features.every((f) => f.properties.admin_code === 'CB-COBA'));

// ---- Cấp 2: điều động toàn tỉnh; tranh chấp xe / quân số (mỗi bước dùng phiếu riêng — cùng 1 lực lượng điều 2 lần
// cho CÙNG phiếu đã bị chặn bởi quy tắc chống lệnh trùng, xem smoke)
const match = (await call('GET', `/sos/${inCoba.data.id}/match`, null, T.trucban)).data;
const disp = await call('POST', '/dispatch', { ticket_id: inCoba.data.id, force_id: match.forces[0].id, vehicle_ids: [], personnel: 3 }, T.trucban);
check('Cấp 2 điều động SOS', disp.status === 200, `${disp.data?.route?.distance_km} km`);
const newCoba = async (msg) => (await call('POST', '/sos', { raw_message: msg, source: 'CAN_BO' }, T.coba)).data;
const tA = await newCoba('Sạt lở đất vùi nhà ở xã Cô Ba, 2 người mắc kẹt');
const tB = await newCoba('Ngập sâu ở xã Cô Ba, 3 người mắc kẹt trên mái nhà');
const tC = await newCoba('Lũ cuốn trôi cầu tạm ở xã Cô Ba, 4 người bị cô lập');
const m2 = (await call('GET', `/sos/${tA.id}/match`, null, T.trucban)).data;
const f0 = m2.forces[0];
let free = tB; // phiếu chưa có lệnh của f0
if (m2.vehicles.length && f0) {
  const veh = m2.vehicles[0].id;
  const twin = await Promise.all([tA, tB].map((t) => call('POST', '/dispatch',
    { ticket_id: t.id, force_id: f0.id, vehicle_ids: [veh], personnel: 1 }, T.trucban)));
  const lost = twin.find((r) => r.status === 409);
  check('2 lệnh đồng thời (2 phiếu) cùng 1 phương tiện: chỉ 1 lệnh nhận được xe (409)',
    twin.map((r) => r.status).sort().join() === '200,409' && /phương tiện/.test(lost?.data?.detail || ''),
    twin.map((r) => r.data?.detail || r.status).join(' | '));
  free = twin[0].status === 409 ? tA : tB;
} else {
  console.log('SKIP  Tranh chấp phương tiện (không có phương tiện rảnh gần Cô Ba)');
}
const all = await call('POST', '/dispatch', { ticket_id: tC.id, force_id: f0.id, vehicle_ids: [], personnel: 10000 }, T.trucban);
check('Điều động toàn bộ quân số còn sẵn sàng', all.status === 200, all.data?.detail);
const none = await call('POST', '/dispatch', { ticket_id: free.id, force_id: f0.id, vehicle_ids: [], personnel: 1 }, T.trucban);
check('Lực lượng hết người sẵn sàng → 409 (không trừ âm quân số)',
  none.status === 409 && /người sẵn sàng/.test(none.data?.detail || ''), none.data?.detail);
const forceOf = async () => (await call('GET', '/resources/forces', null, T.chihuy)).data.find((x) => x.id === f0.id);
check('Quân số sẵn sàng không âm', (await forceOf()).personnel_ready === 0, `${(await forceOf()).personnel_ready}`);
for (const t of [tA, tB, tC]) await call('POST', `/sos/${t.id}/resolve`, null, T.chihuy);
const back = await forceOf();
check('Hoàn thành phiếu → lực lượng trở lại sẵn sàng', back.personnel_ready > 0 && back.personnel_on_mission >= 0, `${back.personnel_ready} sẵn sàng`);

// ---- Cảnh báo: mọi tài khoản cấp tỉnh soạn / duyệt; cần PIN; người soạn không tự duyệt (4 mắt)
const draft = async (tok, title = 'Thử cảnh báo Cô Ba') => call('POST', '/alerts/broadcasts', {
  title, message_body: 'Nội dung thử nghiệm cảnh báo sạt lở xã Cô Ba', admin_codes: ['CB-COBA'], channels: ['SMS'], severity: 'do',
}, tok);
check('Cấp 3 không soạn cảnh báo → 403', (await draft(T.coba)).status === 403);
const byTb = await draft(T.trucban);
check('Cấp 2 (trực ban) soạn cảnh báo', byTb.status === 200);
const byCh = await draft(T.chihuy);
check('Cấp 2 chưa được cấp PIN không duyệt được → 403, nêu rõ chưa có PIN',
  (await call('POST', `/alerts/broadcasts/${byCh.data.id}/approve`, { pin: '0000' }, T.trucban)).data?.detail?.includes('chưa được cấp mã PIN'));
const self = await call('POST', `/alerts/broadcasts/${byCh.data.id}/approve`, { pin: '2468' }, T.chihuy);
check('Người soạn không tự duyệt (4 mắt) → 403', self.status === 403 && /4 mắt/.test(self.data?.detail || ''), self.data?.detail);
check('Cấp 3 không duyệt cảnh báo → 403', (await call('POST', `/alerts/broadcasts/${byTb.data.id}/approve`, { pin: '2468' }, T.coba)).status === 403);
check('Cấp 2 khác (có PIN) duyệt lệnh', (await call('POST', `/alerts/broadcasts/${byTb.data.id}/approve`, { pin: '2468' }, T.chihuy)).status === 200);
const br2 = (await draft(T.trucban, 'Thử duyệt')).data;
const twinApprove = await Promise.all([1, 2].map(() => call('POST', `/alerts/broadcasts/${br2.id}/approve`, { pin: '2468' }, T.chihuy)));
check('2 lần duyệt đồng thời (bấm đúp) chỉ phát 1 lần', twinApprove.map((r) => r.status).sort().join() === '200,400',
  twinApprove.map((r) => r.status).join());
// Khoá PIN: tài khoản duyệt riêng cho kiểm thử (không khoá tài khoản demo các bộ khác dùng)
const approver = `duyet.${stamp}`;
await call('POST', '/rbac/users', { username: approver, full_name: 'Người duyệt thử', password: PW, pin: '2580', role: 'admin_tinh', domain: '*' }, T.admin);
const apTok = await firstLogin(approver, PW);
const br3 = (await draft(T.trucban, 'Thử khoá PIN')).data;
const wrong = [];
for (let i = 0; i < 5; i++) wrong.push((await call('POST', `/alerts/broadcasts/${br3.id}/approve`, { pin: '0000' }, apTok)).status);
check('Sai PIN 5 lần → 403', wrong.every((s) => s === 403), wrong.join());
const locked = await call('POST', `/alerts/broadcasts/${br3.id}/approve`, { pin: '2580' }, apTok);
check('Sau 5 lần sai, PIN đúng cũng bị tạm khoá → 429 (chống dò PIN)', locked.status === 429, locked.data?.detail);

// ---- Tài khoản: chỉ cấp trên quản lý cấp dưới, mỗi tài khoản 1 vai trò
const mkUser = (tok, username, role, domain, extra = {}) =>
  call('POST', '/rbac/users', { username, full_name: 'Tài khoản thử', password: PW, role, domain, ...extra }, tok);
const sub = await mkUser(T.tinh, `xa.${stamp}`, 'admin_xa', 'BAOLAC/CB-HUNGDAO');
check('Cấp 2 tạo tài khoản Cấp 3 (1 xã)', sub.status === 201, sub.data?.detail);
const peer = await mkUser(T.tinh, `tinh2.${stamp}`, 'admin_tinh', '*');
check('Cấp 2 không tạo được tài khoản Cấp 2 → 403', peer.status === 403, peer.data?.detail);
check('Cấp 3 phải đúng 1 xã: phạm vi toàn tỉnh → 422', (await mkUser(T.tinh, `x1.${stamp}`, 'admin_xa', '*')).status === 422);
check('Không còn phạm vi cụm: Cấp 3 theo cụm → 422', (await mkUser(T.tinh, `x2.${stamp}`, 'admin_xa', 'BAOLAC/*')).status === 422);
check('Không còn vai trò cũ (truc_ban) → 404', (await mkUser(T.admin, `x3.${stamp}`, 'truc_ban', '*')).status === 404);
check('Cấp 3 kèm PIN → 422 (Cấp 3 không duyệt cảnh báo)', (await mkUser(T.tinh, `x4.${stamp}`, 'admin_xa', 'BAOLAC/CB-COBA', { pin: '1357' })).status === 422);
check('Cấp 3 không tạo được tài khoản → 403', (await mkUser(T.coba, `x5.${stamp}`, 'admin_xa', 'BAOLAC/CB-COBA')).status === 403);
// Mật khẩu do cấp trên đặt: đăng nhập được nhưng phải tự đổi rồi mới dùng hệ thống
const fresh = (await call('POST', '/auth/login', { username: `xa.${stamp}`, password: PW })).data;
check('Tài khoản Cấp 3 mới đăng nhập được, bị yêu cầu đổi mật khẩu cấp trên đặt', !!fresh?.token && fresh.user?.must_change_password === true);
const blocked = await fetch(BASE + '/sos', { headers: { Authorization: `Bearer ${fresh?.token}` } });
check('Chưa đổi mật khẩu → mọi chức năng bị chặn 403 (kèm header cho giao diện)',
  blocked.status === 403 && blocked.headers.get('x-must-change-password') === '1', `HTTP ${blocked.status}`);
check('Chưa đổi mật khẩu vẫn xem được hồ sơ của mình', (await call('GET', '/auth/me', null, fresh?.token)).data?.must_change_password === true);
const wsBlocked = await new Promise((resolve) => {
  const ws = new WebSocket(`${BASE.replace('http', 'ws').replace('/api/v1', '/ws')}?token=${encodeURIComponent(fresh?.token)}`);
  ws.onopen = () => { resolve('open'); ws.close(); };
  ws.onerror = () => resolve('rejected');
  ws.onclose = () => resolve('rejected');
  setTimeout(() => resolve('timeout'), 5000);
});
check('Chưa đổi mật khẩu → không nhận tin realtime (WebSocket bị từ chối)', wsBlocked === 'rejected', wsBlocked);
check('Mật khẩu mới phải khác mật khẩu cấp trên đặt → 422',
  (await call('POST', '/auth/change-password', { current_password: PW, new_password: PW }, fresh?.token)).status === 422);
const own = await call('POST', '/auth/change-password', { current_password: PW, new_password: OWN_PW }, fresh?.token);
const subTok = own.data?.token;
check('Tự đổi mật khẩu → dùng được hệ thống', own.status === 200 && own.data?.user?.must_change_password === false &&
  (await call('GET', '/sos', null, subTok)).status === 200);

// Chống mạo danh cùng cấp: Quản trị tỉnh không đổi mật khẩu / PIN / 2 lớp / khoá tài khoản Cấp 2 khác
const chihuyId = (await call('GET', '/auth/me', null, T.chihuy)).data.id;
const adminId = (await call('GET', '/auth/me', null, T.admin)).data.id;
check('Cấp 2 không đổi mật khẩu của Cấp 2 khác → 403', (await call('PATCH', `/rbac/users/${chihuyId}`, { password: 'MatKhauMoi2026' }, T.tinh)).status === 403);
check('Cấp 2 không đổi PIN của Cấp 2 khác → 403', (await call('PATCH', `/rbac/users/${chihuyId}`, { pin: '1111' }, T.tinh)).status === 403);
check('Cấp 2 không đặt lại 2 lớp của Cấp 2 khác → 403', (await call('POST', `/rbac/users/${chihuyId}/mfa/reset`, null, T.tinh)).status === 403);
check('Cấp 2 không khoá Cấp 2 khác → 403', (await call('PATCH', `/rbac/users/${chihuyId}`, { is_active: false }, T.tinh)).status === 403);
check('Cấp 2 không sửa Cấp 1 → 403', (await call('PATCH', `/rbac/users/${adminId}`, { is_active: false }, T.tinh)).status === 403);
check('Cấp 2 không đặt PIN cho Cấp 3 → 422', (await call('PATCH', `/rbac/users/${sub.data.id}`, { pin: '1357' }, T.tinh)).status === 422);
check('Cấp 2 đặt lại mật khẩu cho Cấp 3', (await call('PATCH', `/rbac/users/${sub.data.id}`, { password: 'MatKhauMoi2026' }, T.tinh)).status === 200);
check('Mật khẩu mới dùng được, mật khẩu cũ hết hiệu lực', !!(await login(`xa.${stamp}`, 'MatKhauMoi2026')) && !(await login(`xa.${stamp}`, OWN_PW)));
check('Cấp trên đặt lại mật khẩu → lần đăng nhập tới phải đổi lại',
  (await call('POST', '/auth/login', { username: `xa.${stamp}`, password: 'MatKhauMoi2026' })).data?.user?.must_change_password === true);
check('Danh sách tài khoản báo "chờ tự đổi mật khẩu"',
  ((await call('GET', '/rbac/users', null, T.tinh)).data || []).some((u) => u.username === `xa.${stamp}` && u.must_change_password === true));
const subTok2 = await login(`xa.${stamp}`, 'MatKhauMoi2026');

// Đổi cấp / phạm vi = thay vai trò (không cộng dồn)
check('API cộng thêm vai trò cũ đã bỏ', (await call('POST', `/rbac/users/${sub.data.id}/assignments`, { role: 'admin_xa', domain: 'BAOLAC/CB-COBA' }, T.tinh)).status === 404);
const move = await call('PUT', `/rbac/users/${sub.data.id}/assignment`, { role: 'admin_xa', domain: 'TPCAOBANG/CB-THUCPHAN' }, T.tinh);
check('Cấp 2 đổi xã của tài khoản Cấp 3', move.status === 200, move.data?.detail);
check('Token cũ bị thu hồi sau khi đổi phạm vi → 401', (await call('GET', '/auth/me', null, subTok2)).status === 401);
const moved = (await call('GET', '/auth/me', null, await login(`xa.${stamp}`, 'MatKhauMoi2026'))).data;
check('Sau khi đổi vẫn đúng 1 vai trò, ở xã mới', moved.assignments.length === 1 && moved.assignments[0].domain === 'TPCAOBANG/CB-THUCPHAN');
check('Cấp 2 không nâng Cấp 3 lên Cấp 2 → 403',
  (await call('PUT', `/rbac/users/${sub.data.id}/assignment`, { role: 'admin_tinh', domain: '*' }, T.tinh)).status === 403);
check('Không tự đổi vai trò của mình → 400', (await call('PUT', `/rbac/users/${adminId}/assignment`, { role: 'admin_tinh', domain: '*' }, T.admin)).status === 400);
check('Cấp 1 nâng tài khoản lên Cấp 2', (await call('PUT', `/rbac/users/${sub.data.id}/assignment`, { role: 'admin_tinh', domain: '*' }, T.admin)).status === 200);
check('Đã thành Cấp 2 → Cấp 2 khác không quản lý được nữa → 403',
  (await call('PATCH', `/rbac/users/${sub.data.id}`, { is_active: false }, T.tinh)).status === 403);
check('Cấp 1 khoá tài khoản', (await call('PATCH', `/rbac/users/${sub.data.id}`, { is_active: false }, T.admin)).status === 200);
check('Tài khoản bị khoá không đăng nhập được → 403',
  (await call('POST', '/auth/login', { username: `xa.${stamp}`, password: 'MatKhauMoi2026' })).status === 403);
const aud = (await call('GET', '/rbac/audit', null, T.tinh)).data || [];
check('Nhật ký phân quyền ghi đổi cấp / phạm vi (ai, của ai, từ đâu sang đâu)',
  aud.some((a) => a.action === 'assign' && a.target_user === `xa.${stamp}` && a.domain === 'TPCAOBANG/CB-THUCPHAN'));

// ---- WebSocket cần token
const wsBase = BASE.replace('http', 'ws').replace('/api/v1', '/ws');
const wsResult = await new Promise((resolve) => {
  const ws = new WebSocket(wsBase);
  ws.onopen = () => resolve('open');
  ws.onerror = () => resolve('rejected');
  ws.onclose = () => resolve('rejected');
  setTimeout(() => resolve('timeout'), 5000);
});
check('WebSocket không token bị từ chối', wsResult === 'rejected');

// Sự kiện realtime theo quyền: cuộc gọi đường dây nóng có SĐT người gọi → chỉ người có quyền tổng đài (Cấp 2) nhận
const listen = (tok) => new Promise((resolve) => {
  const ws = new WebSocket(`${wsBase}?token=${encodeURIComponent(tok)}`);
  const got = [];
  ws.onmessage = (e) => got.push(JSON.parse(e.data).event);
  ws.onopen = () => resolve({ ws, got });
  ws.onerror = () => resolve(null);
});
const xa = await listen(T.coba);
const tb = await listen(T.trucban);
await call('POST', '/alerts/ivr', { caller: '0912345678', key: '0' }, T.trucban);
await new Promise((r) => setTimeout(r, 2000));
check('call.new tới Cấp 2 (có quyền tổng đài)', tb?.got.includes('call.new'), tb?.got.join(','));
check('call.new KHÔNG tới Cấp 3 (không có quyền tổng đài)', xa && !xa.got.includes('call.new'), xa?.got.join(','));
xa?.ws.close();
tb?.ws.close();

console.log(failures ? `\n${failures} kiểm tra THẤT BẠI` : '\nTất cả kiểm tra RBAC đạt');
process.exit(failures ? 1 : 0);
