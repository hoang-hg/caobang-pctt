// Kiểm thử phân quyền RBAC theo phạm vi địa bàn qua API.
//   node scripts/rbac-test.mjs [http://localhost:8000]
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
const login = async (u, p) => (await call('POST', '/auth/login', { username: u, password: p })).data.token;
const stamp = Date.now().toString(36);

// ---- Chưa đăng nhập
check('Chưa đăng nhập → 401 khi xem dashboard', (await call('GET', '/dashboard/kpis')).status === 401);
check('Chưa đăng nhập → 401 khi xem SOS', (await call('GET', '/sos')).status === 401);

const T = {
  admin: await login('admin', 'admin123'),
  chihuy: await login('chihuy', 'chihuy123'),
  trucban: await login('trucban', 'trucban123'),
  baolac: await login('chihuy.baolac', 'baolac123'),
  coba: await login('canbo.coba', 'coba123'),
  thukho: await login('thukho', 'thukho123'),
  xem: await login('xem', 'xem123'),
};
check('Đăng nhập 7 tài khoản demo', Object.values(T).every(Boolean));

const me = (await call('GET', '/auth/me', null, T.coba)).data;
check('/auth/me trả vai trò + quyền theo phạm vi', me.assignments[0].domain === 'BAOLAC/CB-COBA' && me.permissions.every((p) => p.dom === 'BAOLAC/CB-COBA'));

// ---- Cán bộ xã Cô Ba
const cobaSos = (await call('GET', '/sos', null, T.coba)).data;
check('Cán bộ xã chỉ thấy SOS trong xã Cô Ba', cobaSos.every((t) => t.admin_code === 'CB-COBA'), `${cobaSos.length} phiếu`);
const allSos = (await call('GET', '/sos', null, T.chihuy)).data;
const tpTicket = allSos.find((t) => t.admin_code === 'CB-THUCPHAN' || t.admin_code === 'CB-NUNGTRICAO');
check('Cán bộ xã không sửa được phiếu xã khác → 403', (await call('PATCH', `/sos/${tpTicket.id}`, { status: 'dieu_phoi' }, T.coba)).status === 403);
const inCoba = await call('POST', '/sos', { raw_message: 'Nhà sập do sạt lở ở xã Cô Ba, 3 người mắc kẹt', source: 'CAN_BO' }, T.coba);
check('Cán bộ xã tạo SOS trong xã mình', inCoba.status === 200 && inCoba.data.admin_code === 'CB-COBA', inCoba.data?.code);
check('Cán bộ xã tạo SOS xã khác → 403',
  (await call('POST', '/sos', { raw_message: 'Ngập sâu thôn Bản Ngắn xã Hòa An, 4 người', source: 'CAN_BO' }, T.coba)).status === 403);
check('Cán bộ xã không có quyền điều động → 403', (await call('GET', `/sos/${inCoba.data.id}/match`, null, T.coba)).status === 403);
check('Cán bộ xã không xem được quản trị tài khoản → 403', (await call('GET', '/rbac/users', null, T.coba)).status === 403);
check('Cán bộ xã không vào được tổng đài → 403', (await call('GET', '/alerts/hotline', null, T.coba)).status === 403);
const lay = (await call('GET', '/map/layers', null, T.coba)).data;
check('Bản đồ của cán bộ xã chỉ có SOS trong xã', lay.sos.features.every((f) => f.properties.admin_code === 'CB-COBA'));

// ---- Chỉ huy cụm Bảo Lạc
const blSos = (await call('GET', '/sos', null, T.baolac)).data;
const blCodes = new Set(me && (await call('GET', '/admin-units?level=xa')).data.filter((u) => u.rbac_domain.startsWith('BAOLAC/')).map((u) => u.code));
check('Chỉ huy cụm chỉ thấy SOS trong cụm Bảo Lạc', blSos.every((t) => blCodes.has(t.admin_code)), `${blSos.length} phiếu`);
check('Chỉ huy cụm không điều động SOS ngoài cụm → 403',
  (await call('POST', '/dispatch', { ticket_id: tpTicket.id, force_id: '00000000-0000-0000-0000-000000000000' }, T.baolac)).status === 403);
const match = (await call('GET', `/sos/${inCoba.data.id}/match`, null, T.baolac)).data;
const disp = await call('POST', '/dispatch', { ticket_id: inCoba.data.id, force_id: match.forces[0].id, vehicle_ids: [], personnel: 3 }, T.baolac);
check('Chỉ huy cụm điều động SOS trong cụm', disp.status === 200, `${disp.data?.route?.distance_km} km`);

// Cảnh báo: maker–checker theo phạm vi
const brCoba = await call('POST', '/alerts/broadcasts', {
  title: 'Thử cảnh báo Cô Ba', message_body: 'Nội dung thử nghiệm cảnh báo sạt lở xã Cô Ba', admin_codes: ['CB-COBA'], channels: ['SMS'], severity: 'do',
}, T.baolac);
check('Chỉ huy cụm soạn cảnh báo trong cụm', brCoba.status === 200);
check('Chỉ huy cụm soạn cảnh báo ngoài cụm → 403', (await call('POST', '/alerts/broadcasts', {
  title: 'Thử cảnh báo TP', message_body: 'Nội dung thử nghiệm cảnh báo TP Cao Bằng', admin_codes: ['CB-THUCPHAN'], channels: ['SMS'],
}, T.baolac)).status === 403);
check('Người soạn không tự duyệt (4 mắt) → 403', (await call('POST', `/alerts/broadcasts/${brCoba.data.id}/approve`, { pin: '1357' }, T.baolac)).status === 403);
const brTp = await call('POST', '/alerts/broadcasts', {
  title: 'Thử cảnh báo TP', message_body: 'Nội dung thử nghiệm cảnh báo TP Cao Bằng', admin_codes: ['CB-THUCPHAN'], channels: ['SMS'],
}, T.trucban);
check('Chỉ huy cụm không duyệt lệnh ngoài cụm → 403', (await call('POST', `/alerts/broadcasts/${brTp.data.id}/approve`, { pin: '1357' }, T.baolac)).status === 403);
const list = (await call('GET', '/alerts/broadcasts', null, T.baolac)).data;
check('Danh sách cảnh báo của chỉ huy cụm không có lệnh ngoài cụm', !list.some((b) => b.id === brTp.data.id));
check('Lãnh đạo tỉnh duyệt lệnh của cụm', (await call('POST', `/alerts/broadcasts/${brCoba.data.id}/approve`, { pin: '2468' }, T.chihuy)).status === 200);

// Uỷ quyền & chống leo thang
const sub = await call('POST', '/rbac/users', {
  username: `test.${stamp}`, full_name: 'Tài khoản thử', password: 'matkhau123', role: 'can_bo_xa', domain: 'BAOLAC/CB-COBA',
}, T.baolac);
check('Chỉ huy cụm tạo tài khoản con cấp xã trong cụm', sub.status === 201);
check('Không cấp được ngoài cụm → 403',
  (await call('POST', `/rbac/users/${sub.data.id}/assignments`, { role: 'can_bo_xa', domain: 'TPCAOBANG/CB-THUCPHAN' }, T.baolac)).status === 403);
check('Không cấp được vai trò Lãnh đạo tỉnh → 403',
  (await call('POST', `/rbac/users/${sub.data.id}/assignments`, { role: 'truong_ban', domain: 'BAOLAC/CB-COBA' }, T.baolac)).status === 403);
const esc = await call('POST', `/rbac/users/${sub.data.id}/assignments`, { role: 'truc_ban', domain: 'BAOLAC/*' }, T.baolac);
check('Không cấp quyền mình không có (hotline.operate) → 403', esc.status === 403, esc.data?.detail);
const subTok = await login(`test.${stamp}`, 'matkhau123');
check('Tài khoản con đăng nhập được', !!subTok);
check('Cấp thêm vai trò thủ kho trong cụm', (await call('POST', `/rbac/users/${sub.data.id}/assignments`, { role: 'thu_kho', domain: 'BAOLAC/*' }, T.baolac)).status === 201);
check('Token cũ bị thu hồi sau khi đổi quyền → 401', (await call('GET', '/auth/me', null, subTok)).status === 401);
check('Thu hồi vai trò', (await call('DELETE', `/rbac/users/${sub.data.id}/assignments?role=thu_kho&domain=${encodeURIComponent('BAOLAC/*')}`, null, T.baolac)).status === 204);
check('Khoá tài khoản con', (await call('PATCH', `/rbac/users/${sub.data.id}`, { is_active: false }, T.baolac)).status === 200);
check('Tài khoản bị khoá không đăng nhập được → 403', (await call('POST', '/auth/login', { username: `test.${stamp}`, password: 'matkhau123' })).status === 403);
check('Chỉ huy cụm không sửa được tài khoản cấp tỉnh → 403', (await call('PATCH', `/rbac/users/${(await call('GET', '/auth/me', null, T.trucban)).data.id}`, { is_active: false }, T.baolac)).status === 403);

// ---- Thủ kho / Quan sát
const wh = (await call('GET', '/resources/warehouses', null, T.thukho)).data[0];
check('Thủ kho xuất kho', (await call('POST', `/resources/warehouses/${wh.id}/issue`, { item_code: 'MI_TOM', quantity: 1 }, T.thukho)).status === 200);
check('Thủ kho không sửa phiếu SOS → 403', (await call('PATCH', `/sos/${tpTicket.id}`, { status: 'dieu_phoi' }, T.thukho)).status === 403);
check('Tài khoản xem không điều động được → 403', (await call('POST', '/dispatch', { ticket_id: tpTicket.id, force_id: tpTicket.id }, T.xem)).status === 403);
check('Tài khoản xem không xem nhật ký pháp lý → 403', (await call('GET', '/alerts/audit', null, T.xem)).status === 403);

// ---- Quản trị vai trò (chỉ super_admin)
const role = await call('POST', '/rbac/roles', {
  name: `thu_nghiem_${stamp}`, display_name: 'Vai trò thử nghiệm', permissions: ['monitoring.view', 'sos.view'], is_delegatable: true,
}, T.admin);
check('Quản trị hệ thống tạo vai trò tuỳ chỉnh', role.status === 201);
check('Lãnh đạo tỉnh không tạo được vai trò (rbac.manage) → 403', (await call('POST', '/rbac/roles', {
  name: `x_${stamp}`, display_name: 'X', permissions: ['sos.view'],
}, T.chihuy)).status === 403);
check('Không sửa quyền vai trò hệ thống → 400', (await call('PATCH', '/rbac/roles/truc_ban', { permissions: ['sos.view'] }, T.admin)).status === 400);
check('Xoá vai trò tuỳ chỉnh', (await call('DELETE', `/rbac/roles/thu_nghiem_${stamp}`, null, T.admin)).status === 204);
const aud = (await call('GET', '/rbac/audit', null, T.baolac)).data;
check('Nhật ký phân quyền của cụm chỉ có thao tác trong cụm', aud.length > 0 && aud.every((a) => a.domain && a.domain.startsWith('BAOLAC/')));

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

console.log(failures ? `\n${failures} kiểm tra THẤT BẠI` : '\nTất cả kiểm tra RBAC đạt');
process.exit(failures ? 1 : 0);
