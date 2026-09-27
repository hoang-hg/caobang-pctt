// Kiểm thử nhanh luồng nghiệp vụ end-to-end qua API.
//   node tests/e2e/smoke.mjs [http://localhost:8000]
const BASE = (process.argv[2] || 'http://localhost:8000') + '/api/v1';
let failures = 0;

async function call(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures += 1;
}

const login = async (u, p) => (await call('POST', '/auth/login', { username: u, password: p })).data.token;
const maker = await login('trucban', 'trucban123');
const checker = await login('chihuy', 'chihuy123');
check('Đăng nhập maker & checker', maker && checker);

const parsed = (await call('POST', '/sos/parse', { text: 'Nhà ở thôn Bản Ngắn xã Hòa An ngập sâu, 3 hộ có trẻ em cần xuồng' }, maker)).data;
check('NLP bóc tách tin nhắn', parsed.place?.unit_code === 'CB-HOAAN' && parsed.trapped_count === 12 && parsed.vulnerable.includes('tre_em'),
  JSON.stringify({ place: parsed.place?.name, n: parsed.trapped_count, type: parsed.incident_type, p: parsed.priority }));

const created = await call('POST', '/sos', { raw_message: 'Sạt lở vùi nhà ở xã Yên Thổ, 2 người bị thương nặng', source: 'ZALO' }, maker);
const ticket = created.data;
check('Tạo SOS từ tin nhắn thô', created.status === 200 && ticket.incident_type === 'sat_lo' && ticket.priority === 1,
  `${ticket.code} ${ticket.admin_name}`);

const match = (await call('GET', `/sos/${ticket.id}/match`, null, maker)).data;
check('Khớp nối lực lượng/phương tiện', match.forces.length > 0 && match.vehicles.length > 0,
  `${match.forces[0]?.name} (${match.forces[0]?.distance_km} km), ${match.vehicles[0]?.code}; bán kính ${match.radius_km} km`);

const noAuth = await call('POST', '/dispatch', { ticket_id: ticket.id, force_id: match.forces[0].id });
check('Điều động yêu cầu đăng nhập', noAuth.status === 401);

const disp = await call('POST', '/dispatch', {
  ticket_id: ticket.id, force_id: match.forces[0].id, vehicle_ids: [match.vehicles[0].id], personnel: 6,
}, maker);
check('Phát lệnh điều động + lộ trình', disp.status === 200 && disp.data.route.geometry.coordinates.length > 2,
  disp.status === 200 ? `${disp.data.route.distance_km} km, ${disp.data.route.duration_min} phút, an toàn=${disp.data.route.safe}` : JSON.stringify(disp.data));
check('Phiếu chuyển sang Đang thực thi', disp.data.ticket?.status === 'thuc_thi');

const route = (await call('POST', '/map/route', { from_lat: 22.676, from_lon: 106.25, to_lat: 22.95, to_lon: 105.672 }, maker)).data;
check('Định tuyến TP → Bảo Lạc', route.distance_km > 50, `${route.distance_km} km, an toàn=${route.safe}, ${route.roads.join(' → ')}`);

const area = (await call('POST', '/map/area-stats', {
  polygon: { type: 'Polygon', coordinates: [[[106.2, 22.64], [106.3, 22.64], [106.3, 22.7], [106.2, 22.7], [106.2, 22.64]]] },
}, maker)).data;
check('Khoanh vùng đếm hộ dân', area.households > 0, `${area.households} hộ, ${area.subscribers} thuê bao`);

const br = await call('POST', '/alerts/broadcasts', {
  title: 'Thử nghiệm cảnh báo ngập', message_body: 'Nội dung thử nghiệm cảnh báo ngập lụt ven sông Bằng Giang',
  admin_codes: ['CB-THUCPHAN'], channels: ['SMS', 'ZALO_OA'], severity: 'cam',
}, maker);
check('Maker soạn lệnh cảnh báo', br.status === 200 && br.data.status === 'pending_approval', br.data.code);
check('Maker không được tự duyệt', (await call('POST', `/alerts/broadcasts/${br.data.id}/approve`, { pin: '2468' }, maker)).status === 403);
check('Sai PIN bị từ chối', (await call('POST', `/alerts/broadcasts/${br.data.id}/approve`, { pin: '0000' }, checker)).status === 403);
const ap = await call('POST', `/alerts/broadcasts/${br.data.id}/approve`, { pin: '2468' }, checker);
check('Checker phê duyệt bằng PIN', ap.status === 200 && ap.data.status === 'sending');

const ivr = await call('POST', '/alerts/ivr', { caller: '0999 111 222', key: '2', message: 'Sạt lở đèo Mẻ Pia, 3 người mắc kẹt' }, maker);
check('Tổng đài IVR phân luồng + tạo SOS', ivr.status === 200 && ivr.data.ticket?.incident_type === 'sat_lo', ivr.data.call?.routed_to);

check('Mã phiếu sai → 404', (await call('GET', '/sos/khong-hop-le/match', null, maker)).status === 404);

await new Promise((r) => setTimeout(r, 10_000));
const after = (await call('GET', '/alerts/broadcasts', null, checker)).data.find((b) => b.id === br.data.id);
check('Delivery dashboard tăng số liệu', after.metrics.SMS?.delivered > 0, JSON.stringify(after.metrics.SMS));

const resolved = await call('POST', `/sos/${ticket.id}/resolve`, null, maker);
check('Xác nhận đã cứu an toàn', resolved.data?.status === 'hoan_thanh');
const audit = (await call('GET', '/alerts/audit', null, checker)).data;
check('Nhật ký pháp lý ghi nhận', audit.some((a) => a.action === 'broadcast.approve'), `${audit.length} bản ghi`);

console.log(failures ? `\n${failures} kiểm tra THẤT BẠI` : '\nTất cả kiểm tra đạt');
process.exit(failures ? 1 : 0);
