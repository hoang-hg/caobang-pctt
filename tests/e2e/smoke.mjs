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
const again2 = await call('POST', '/dispatch', { ticket_id: ticket.id, force_id: match.forces[0].id, personnel: 1 }, maker);
check('Điều lại cùng lực lượng cho cùng phiếu (bấm đúp / 2 trực ban) → 409, không trừ quân số 2 lần', again2.status === 409, again2.data?.detail);

// Điều động song song với "Đã cứu an toàn": phiếu đã xong không bị mở lại, không còn lệnh treo giữ quân số
for (let i = 0; i < 3; i++) {
  const t = (await call('POST', '/sos', { raw_message: `Kiểm thử tranh chấp điều động ${i}`, lat: 22.676, lon: 106.25, incident_type: 'ngap_lut', priority: 2 }, maker)).data;
  const f = (await call('GET', `/sos/${t.id}/match`, null, maker)).data?.forces?.[0];
  const [d, r] = await Promise.all([
    call('POST', '/dispatch', { ticket_id: t.id, force_id: f.id, personnel: 1 }, maker),
    call('POST', `/sos/${t.id}/resolve`, null, maker),
  ]);
  const after = (await call('GET', '/sos', null, maker)).data.find((x) => x.id === t.id);
  check(`Điều động ‖ "Đã cứu" (lần ${i + 1}): phiếu vẫn hoàn thành, lệnh (nếu có) đã được giải phóng`,
    r.status === 200 && after?.status === 'hoan_thanh' && (after.dispatch_status == null || after.dispatch_status === 'hoan_thanh'),
    `dispatch ${d.status}, phiếu ${after?.status}, lệnh ${after?.dispatch_status}`);
}

// Phiếu có thể trùng: cùng SĐT trong 30 phút
const dupPhone = `0966${String(Date.now()).slice(-6)}`;
const s1 = (await call('POST', '/sos', { raw_message: 'Nhà ngập, cần xuồng', reporter_phone: dupPhone, lat: 22.60, lon: 106.10, incident_type: 'ngap_lut' }, maker)).data;
const s2 = (await call('POST', '/sos', { raw_message: 'Gọi lại: nhà ngập, cần xuồng', reporter_phone: dupPhone, lat: 22.70, lon: 106.30, incident_type: 'ngap_lut' }, maker)).data;
check('Phiếu thứ 2 cùng SĐT → báo "có thể trùng" phiếu trước', s2.possible_duplicates?.includes(s1.code), JSON.stringify(s2.possible_duplicates));

// Webhook (Zalo / app) gửi lại cùng mã tin → không tạo phiếu thứ hai
if (process.env.INTAKE_API_KEY) {
  const intake = (body) => fetch(`${BASE}/sos/intake`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Intake-Key': process.env.INTAKE_API_KEY }, body: JSON.stringify(body),
  }).then(async (res) => ({ status: res.status, data: await res.json() }));
  const msg = { raw_message: 'Sạt lở vùi nhà ở xã Yên Thổ', source: 'ZALO', external_id: `zalo-msg-${Date.now()}` };
  const [i1, i2] = await Promise.all([intake(msg), intake(msg)]);  // gửi lại gần như cùng lúc
  const i3 = await intake(msg);
  check('Webhook gửi lại cùng mã tin → cùng 1 phiếu', i1.status === 200 && i2.data.code === i1.data.code && i3.data.code === i1.data.code && i3.data.duplicate === true,
    `${i1.data?.code} ${i2.data?.code} ${i3.data?.code}`);
} else {
  console.log('SKIP  Webhook gửi lại (chưa đặt INTAKE_API_KEY)');
}

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

// Sổ xuất – nhập kho, lịch sử sơ tán (DB7, DB8 — trigger migration 0024): mọi lần tồn kho đổi số lượng đều có dòng sổ đúng
// lý do, người thao tác, lệnh điều động; sổ theo phạm vi được giao. Ghi tồn kho thật của dữ liệu mẫu (xuất 2, nhập 3, điều
// động kèm 1 rồi huỷ trả lại) — tồn kho chung cuộc tăng 1.
{
  // Bộ mô phỏng tự trừ 5 mặt hàng này theo thời gian (services/simulator.py: consume_inventory) → chọn mặt hàng khác, số tồn
  // không đổi ngoài các bước của bài thử
  const SIMULATED = ['MI_TOM', 'NUOC_CHAI', 'LUONG_KHO', 'AO_PHAO', 'TUI_SO_CUU'];
  const usable = (i) => i.quantity >= 10 && !SIMULATED.includes(i.item_code);
  const whs = (await call('GET', '/resources/warehouses', null, maker)).data;
  const wh = whs.find((w) => w.items.some(usable));
  const it = wh.items.find(usable);
  const iss = await call('POST', `/resources/warehouses/${wh.id}/issue`, { item_code: it.item_code, quantity: 2, destination: 'Thử sổ kho' }, maker);
  const rec = await call('POST', `/resources/warehouses/${wh.id}/receive`, { item_code: it.item_code, quantity: 3, source: 'Cứu trợ thử sổ kho' }, maker);
  check('Xuất kho / nhập kho', iss.status === 200 && rec.status === 200, `${iss.status} / ${rec.status}`);
  const t2 = (await call('POST', '/sos', { raw_message: 'Ngập sâu, cần lương thực (thử sổ kho)', lat: wh.lat, lon: wh.lon, incident_type: 'ngap_lut', source: 'CAN_BO' }, maker)).data;
  const m2 = (await call('GET', `/sos/${t2.id}/match`, null, maker)).data;
  const d2 = await call('POST', '/dispatch', {
    ticket_id: t2.id, force_id: m2.forces[0].id, personnel: 1, warehouse_id: wh.id, supplies: { [it.item_code]: 1 },
  }, maker);
  const orderId = d2.data?.order?.id;
  const c2 = await call('POST', `/dispatch/${orderId}/cancel`, { reason: 'Thử sổ kho: hoàn trả vật tư', return_supplies: true }, maker);
  check('Điều động kèm vật tư, huỷ lệnh trả lại kho', d2.status === 200 && c2.status === 200, `${d2.status} / ${c2.status}`);
  const moves = (await call('GET', `/resources/inventory-moves?warehouse_id=${wh.id}&item_code=${it.item_code}&limit=10`, null, maker)).data;
  const by = (reason) => moves.find((m) => m.reason === reason);
  const issued = by('xuat');
  const received = by('nhap');
  const withOrder = by('xuat_dieu_dong');
  const returned = by('hoan_tra');
  check('Sổ kho: xuất −2 (người xuất, nơi nhận), nhập +3 (nguồn hàng)',
    issued?.delta === -2 && issued.actor_name && issued.note === 'Thử sổ kho' && received?.delta === 3 && received.note === 'Cứu trợ thử sổ kho',
    JSON.stringify(moves.slice(0, 4).map((m) => [m.reason, m.delta, m.actor_name, m.note])));
  check('Sổ kho: vật tư kèm lệnh điều động −1 và hoàn trả +1, cùng ghi mã phiếu SOS',
    withOrder?.delta === -1 && withOrder.ticket_code === t2.code && returned?.delta === 1 && returned.ticket_code === t2.code,
    `${withOrder?.ticket_code} / ${returned?.ticket_code}`);
  check('Sổ kho: số tồn sau mỗi dòng khớp tồn kho hiện tại', moves[0]?.quantity_after === it.quantity + 1,
    `${moves[0]?.quantity_after} vs ${it.quantity + 1}`);
  const ward = await login('admin.thucphan', 'adminthucphan123');
  const wardMoves = (await call('GET', '/resources/inventory-moves?limit=500', null, ward)).data;
  // Không chỉ "mọi dòng thuộc phường" (đúng hiển nhiên khi phường chưa có dòng nào): các dòng vừa ghi ở kho thử phải hiện với
  // phường khi và chỉ khi kho thử nằm trong phường
  const testIds = new Set(moves.map((m) => m.id));
  const wardSeesTest = wardMoves.some((m) => testIds.has(m.id));
  check('Sổ kho theo phạm vi: tài khoản phường chỉ thấy kho trong phường', Array.isArray(wardMoves)
    && wardMoves.every((m) => m.admin_code === 'CB-THUCPHAN') && wardSeesTest === (wh.admin_code === 'CB-THUCPHAN'),
    `${wardMoves.length} dòng; kho thử ở ${wh.admin_code} — phường ${wardSeesTest ? 'thấy' : 'không thấy'} dòng vừa ghi`);
  check('Sổ kho: quá 5.000 dòng một lần → 422', (await call('GET', '/resources/inventory-moves?limit=100000', null, maker)).status === 422);

  const evac = (await call('GET', '/evacuation', null, maker)).data.progress;
  const ev = evac.find((e) => e.planned_households > e.evacuated_households) || evac[0];
  const put = await call('PUT', `/evacuation/${ev.code}`, {
    planned_households: ev.planned_households, evacuated_households: Math.min(ev.planned_households, ev.evacuated_households + 1),
    planned_persons: ev.planned_persons, evacuated_persons: Math.min(ev.planned_persons, ev.evacuated_persons + 1),
  }, maker);
  const hist = (await call('GET', `/evacuation/${ev.code}/history?hours=1`, null, maker)).data;
  const last = hist.at(-1);
  check('Lịch sử sơ tán: lần cập nhật vừa rồi có dòng mới, ghi người cập nhật', put.status === 200
    && last?.evacuated_households === put.data.evacuated_households && last.actor_name, JSON.stringify(last));
  const other = evac.find((e) => e.code !== 'CB-THUCPHAN');
  check('Lịch sử sơ tán theo phạm vi: tài khoản phường hỏi xã khác → 404',
    (await call('GET', `/evacuation/${other.code}/history`, null, ward)).status === 404);
}

// Đợt thiên tai (DB5 — migration 0025): mở đợt với giờ bắt đầu trong quá khứ → gắn bù phiếu đã có trong vùng; phiếu mới trong
// vùng tự gắn, ngoài vùng không; lệnh điều động + vật tư kèm lệnh theo đợt của phiếu; kết thúc → phiếu mới không gắn nữa. Báo
// cáo theo phạm vi; mở / kết thúc chỉ quyền event.manage. Toạ độ: phường Thục Phán (trong vùng), Bảo Lạc (ngoài vùng).
{
  const IN = { lat: 22.668, lon: 106.257 };
  const OUT = { lat: 22.95, lon: 105.672 };
  const sosAt = async (pt, text) => (await call('POST', '/sos', { raw_message: text, ...pt, incident_type: 'ngap_lut', source: 'CAN_BO' }, maker)).data;
  const ticketOf = async (id) => (await call('GET', '/sos?hours=2', null, maker)).data.find((t) => t.id === id);
  const early = await sosAt(IN, 'Thử đợt thiên tai: ngập trước khi mở đợt');
  const area = early.admin_code;
  const ward = await login('admin.thucphan', 'adminthucphan123');
  check('Mở đợt: tài khoản phường không có quyền → 403',
    (await call('POST', '/events', { name: 'Đợt thử của phường', hazard: 'lu_lut' }, ward)).status === 403);
  const future = new Date(Date.now() + 3600e3).toISOString();
  check('Mở đợt: loại thiên tai sai / giờ bắt đầu ở tương lai / xã không có → 422',
    (await call('POST', '/events', { name: 'Đợt thử', hazard: 'dong_dat' }, maker)).status === 422
    && (await call('POST', '/events', { name: 'Đợt thử', hazard: 'lu_lut', started_at: future }, maker)).status === 422
    && (await call('POST', '/events', { name: 'Đợt thử', hazard: 'lu_lut', admin_codes: ['CB-KHONG-CO'] }, maker)).status === 422);
  const ev = await call('POST', '/events', {
    name: 'Thử: mưa lũ (kiểm thử tự động)', hazard: 'lu_lut', started_at: new Date(Date.now() - 10 * 60e3).toISOString(),
    admin_codes: [area], note: 'smoke',
  }, maker);
  const code = ev.data?.code;
  check('Mở đợt thiên tai bắt đầu 10 phút trước → gắn bù phiếu đã có trong vùng',
    ev.status === 201 && /^DT-\d{4}-\d{3}$/.test(code) && (await ticketOf(early.id))?.event_code === code,
    `${code} · ${JSON.stringify(ev.data?.attached)}`);
  const inside = await sosAt(IN, 'Thử đợt thiên tai: ngập sau khi mở đợt');
  const outside = await sosAt(OUT, 'Thử đợt thiên tai: ngoài vùng');
  check('Phiếu mới trong vùng tự gắn đợt; phiếu ngoài vùng không', inside.event_code === code && !outside.event_code,
    `${inside.event_code} / ${outside.event_code}`);

  // Sửa vùng ảnh hưởng: đổi sang xã khác → phiếu của phường cũ gỡ ra, phiếu của xã mới (trong khung giờ) gắn bù; đổi lại → như cũ
  const codesOf = async () => (await Promise.all([early, inside, outside].map((t) => ticketOf(t.id)))).map((t) => t?.event_code || null);
  const sw = await call('PATCH', `/events/${code}`, { admin_codes: [outside.admin_code] }, maker);
  const swapped = await codesOf();
  const back = await call('PATCH', `/events/${code}`, { admin_codes: [area] }, maker);
  const restored = await codesOf();
  check('Sửa vùng ảnh hưởng: xã bỏ ra → gỡ phiếu, xã thêm vào → gắn bù; đổi lại → như cũ',
    sw.status === 200 && sw.data.detached?.sos >= 2 && sw.data.attached?.sos >= 1
    && JSON.stringify(swapped) === JSON.stringify([null, null, code])
    && back.status === 200 && JSON.stringify(restored) === JSON.stringify([code, code, null]),
    `gỡ ${JSON.stringify(sw.data?.detached)} · gắn ${JSON.stringify(sw.data?.attached)} · ${JSON.stringify(swapped)} → ${JSON.stringify(restored)}`);

  // Sơ tán trong đợt (lịch sử sơ tán): cập nhật số của phường trong vùng → diễn biến có điểm cuối ≥ số vừa ghi (bộ mô phỏng
  // có thể cộng thêm ngay sau), bảng "sơ tán cao nhất" có phường
  const evA = (await call('GET', '/evacuation', null, maker)).data.progress.find((e) => e.code === area);
  const putA = await call('PUT', `/evacuation/${area}`, {
    planned_households: evA.planned_households, evacuated_households: Math.min(evA.planned_households, evA.evacuated_households + 1),
    planned_persons: evA.planned_persons, evacuated_persons: Math.min(evA.planned_persons, evA.evacuated_persons + 1),
  }, maker);
  const sumE = (await call('GET', `/events/${code}/summary`, null, maker)).data;
  const lastPt = sumE.evacuation_timeline?.at(-1);
  const rowE = sumE.evacuation?.find((r) => r.code === area);
  check('Sơ tán trong đợt: diễn biến có điểm cuối theo số vừa cập nhật, bảng sơ tán cao nhất có phường',
    putA.status === 200 && lastPt?.households >= putA.data.evacuated_households
    && (!putA.data.evacuated_households || rowE?.peak_households >= putA.data.evacuated_households),
    `${sumE.evacuation_timeline?.length} điểm · cuối ${lastPt?.households} hộ · cao nhất ${rowE?.peak_households} / ${putA.data?.evacuated_households}`);

  // Lệnh điều động kèm vật tư → lệnh và dòng sổ kho theo đợt của phiếu (dù kho ở xã khác); huỷ trả lại
  const SIMULATED = ['MI_TOM', 'NUOC_CHAI', 'LUONG_KHO', 'AO_PHAO', 'TUI_SO_CUU'];
  const whs = (await call('GET', '/resources/warehouses', null, maker)).data;
  const wh = whs.find((w) => w.items.some((i) => i.quantity >= 10 && !SIMULATED.includes(i.item_code)));
  const it = wh.items.find((i) => i.quantity >= 10 && !SIMULATED.includes(i.item_code));
  const m3 = (await call('GET', `/sos/${inside.id}/match`, null, maker)).data;
  const d3 = await call('POST', '/dispatch', {
    ticket_id: inside.id, force_id: m3.forces[0].id, personnel: 1, warehouse_id: wh.id, supplies: { [it.item_code]: 1 },
  }, maker);
  const sum = (await call('GET', `/events/${code}/summary`, null, maker)).data;
  const sup = sum.supplies?.find((s) => s.item_code === it.item_code);
  check('Báo cáo theo đợt: phiếu, lệnh điều động, vật tư kèm lệnh đều tính vào đợt',
    d3.status === 200 && sum.sos.total >= 2 && sum.dispatch.orders >= 1 && sup?.issued >= 1,
    `${sum.sos.total} phiếu, ${sum.dispatch.orders} lệnh, ${it.item_code} xuất ${sup?.issued}`);
  await call('POST', `/dispatch/${d3.data.order.id}/cancel`, { reason: 'Thử đợt thiên tai: hoàn trả', return_supplies: true }, maker);
  const sup2 = (await call('GET', `/events/${code}/summary`, null, maker)).data.supplies?.find((s) => s.item_code === it.item_code);
  check('Huỷ lệnh, trả vật tư → dòng hoàn trả cũng theo đợt (kho ở xã khác vẫn tính)',
    sup2?.returned >= 1 && sup2.returned === sup2.issued, `xuất ${sup2?.issued} · hoàn trả ${sup2?.returned}`);

  // Phạm vi: đợt ở Bảo Lạc — tài khoản phường Thục Phán không thấy, hỏi báo cáo → 404; đợt Thục Phán thì thấy
  const evOut = await call('POST', '/events', { name: 'Thử: sạt lở Bảo Lạc (kiểm thử)', hazard: 'sat_lo', admin_codes: [outside.admin_code] }, maker);
  const wardList = (await call('GET', '/events', null, ward)).data;
  check('Đợt theo phạm vi: phường thấy đợt của mình, không thấy đợt xã khác (báo cáo → 404)',
    wardList.some((e) => e.code === code) && !wardList.some((e) => e.code === evOut.data.code)
    && (await call('GET', `/events/${evOut.data.code}/summary`, null, ward)).status === 404, `${wardList.length} đợt`);

  // Kết thúc lùi giờ (quên kết thúc đúng lúc) tới trước lúc nhận phiếu "inside" → phiếu đó, lệnh điều động và vật tư kèm lệnh
  // (xuất + hoàn trả) gỡ khỏi đợt; phiếu nhận trước giờ kết thúc vẫn thuộc đợt. Kiểm từng bản ghi, không so tổng: bộ mô phỏng
  // (CI) có thể tạo thêm phiếu trong phường lúc đang chạy
  // Giờ kết thúc: giữa lúc nhận "early" và "inside" (2 phiếu chỉ cách nhau chưa tới 1 giây)
  const endAt = new Date((Date.parse(early.received_at) + Date.parse(inside.received_at)) / 2).toISOString();
  const end = await call('POST', `/events/${code}/end`, { end_note: 'Nước rút (kiểm thử)', ended_at: endAt }, maker);
  const sumEnd = (await call('GET', `/events/${code}/summary`, null, maker)).data;
  const supEnd = sumEnd.supplies.find((s) => s.item_code === it.item_code) || { issued: 0, returned: 0 };
  check('Kết thúc lùi giờ → phiếu nhận sau giờ kết thúc, lệnh, vật tư kèm lệnh gỡ khỏi đợt; phiếu trước đó vẫn thuộc đợt',
    end.status === 200 && end.data.detached?.sos >= 1 && end.data.detached.dispatch >= 1 && end.data.detached.supplies >= 2
    && !(await ticketOf(inside.id))?.event_code && (await ticketOf(early.id))?.event_code === code
    && supEnd.issued === sup2.issued - 1 && supEnd.returned === sup2.returned - 1,
    `gỡ ${JSON.stringify(end.data?.detached)} · ${it.item_code} xuất ${sup2.issued}→${supEnd.issued}, hoàn trả ${sup2.returned}→${supEnd.returned}`);
  const after = await sosAt(IN, 'Thử đợt thiên tai: sau khi kết thúc đợt');
  check('Kết thúc đợt → phiếu mới không gắn nữa; kết thúc lần 2 → 409',
    end.status === 200 && end.data.ended_at && !after.event_code
    && (await call('POST', `/events/${code}/end`, {}, maker)).status === 409, after.event_code || 'không gắn');
  await call('POST', `/events/${evOut.data.code}/end`, { end_note: 'Kiểm thử xong' }, maker);
}

// Mưa bình quân lưu vực (Phân hệ A): theo diện tích đa giác Thiessen — KPI 24h, biểu đồ mưa giờ, cổng công khai cùng một số
const kp = (await call('GET', '/dashboard/kpis', null, checker)).data;
const rf = (await call('GET', '/dashboard/rainfall', null, checker)).data;
const pub = (await call('GET', '/public/overview')).data;
const hourly = rf.observed.reduce((a, d) => a + d.mm, 0);
const near = (a, b, pct) => Math.abs(a - b) <= Math.max(1, pct * b);
check('Mưa TB lưu vực 24h theo đa giác Thiessen (≥ 2 trạm), không vượt trạm mưa lớn nhất',
  kp.rain?.avg_method === 'thiessen' && kp.rain.stations >= 2 && kp.rain.avg_24h > 0 && kp.rain.avg_24h <= kp.rain.max_24h, JSON.stringify(kp.rain));
check('Biểu đồ mưa giờ cùng cách tính, tổng các giờ ≈ KPI 24h', rf.method === 'thiessen' && near(hourly, kp.rain.avg_24h, 0.03),
  `${hourly.toFixed(1)} / ${kp.rain.avg_24h}`);
check('Cổng công khai cùng số mưa TB toàn tỉnh', near(pub.rain?.avg_24h, kp.rain.avg_24h, 0.02), `${pub.rain?.avg_24h} / ${kp.rain.avg_24h}`);
// Ô SOS (thiết kế A.2): số phiếu chờ quá 15 phút chưa có lực lượng tiếp nhận — phiếu "chờ xử lý" lâu nhất đã quá 15 phút
// thì phải được đếm; không vượt số phiếu đang mở
const s15 = kp.sos || {};
const oldestMin = s15.oldest_waiting ? (Date.now() - new Date(s15.oldest_waiting).getTime()) / 60_000 : 0;
check('KPI SOS: đếm phiếu chờ quá 15 phút chưa có đội tiếp nhận', Number.isInteger(s15.no_team_15m) && s15.no_team_15m >= 0 &&
  (oldestMin <= 15.5 || s15.no_team_15m >= 1) && s15.no_team_15m <= s15.waiting + s15.in_progress,
  `${s15.no_team_15m} phiếu (chờ lâu nhất ${Math.round(oldestMin)}′, quá hạn theo cấp ${s15.overdue})`);
const one = (await call('GET', '/dashboard/kpis?admin_codes=CB-BAOLAC', null, checker)).data;
check('Vùng chỉ có 1 trạm mưa: lấy đúng số của trạm (không dựng được đa giác)',
  one.rain?.stations === 1 && one.rain.avg_method === 'trung_binh_cong' && one.rain.avg_24h === one.rain.max_24h, JSON.stringify(one.rain));

console.log(failures ? `\n${failures} kiểm tra THẤT BẠI` : '\nTất cả kiểm tra đạt');
process.exit(failures ? 1 : 0);
