#!/usr/bin/env node
// Diễn tập trọn một đợt mưa lũ trên bộ dữ liệu giả lập, qua API thật. Chạy SAU nap.mjs, trên stack thử trên máy này.
//   node tests/du-lieu-gia-lap/dien-tap.mjs [http://localhost:8000] [--dung-giua]
// Mặc định đi hết tới kết thúc đợt. --dung-giua: dừng lúc đang ứng phó (đợt còn mở, phiếu còn chờ) để mở giao diện xem.
// Biến môi trường: ADMIN_USER, ADMIN_PASS (mặc định admin / admin123 của stack dev).
// Tài khoản, số điện thoại, nội dung đều là giả định; mật khẩu dưới đây chỉ dùng cho stack thử.
const args = process.argv.slice(2);
const ROOT = (args.find((a) => a.startsWith('http')) || 'http://localhost:8000').replace(/\/$/, '');
const DUNG_GIUA = args.includes('--dung-giua');
const BASE = `${ROOT}/api/v1`;
if (!['localhost', '127.0.0.1'].includes(new URL(ROOT).hostname)) {
  console.error(`Từ chối chạy với ${ROOT}: diễn tập ghi phiếu, lệnh cảnh báo giả — chỉ dùng cho stack thử trên máy này.`);
  process.exit(2);
}

const XA = 'CB-COBA';
const XA_DOMAIN = 'BAOLAC/CB-COBA';
const TAG_CHI_VIEN = '[Xã xin chi viện]';
const PIN = '739164';
const stamp = Date.now().toString(36);
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failed += 1;
  return ok;
};
const buoc = (t) => console.log(`\n=== ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ago = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
async function call(method, p, body, token, headers = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: { ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  try {
    return { status: res.status, data: JSON.parse(raw) };
  } catch {
    return { status: res.status, data: raw };
  }
}
const ngan = (r) => `HTTP ${r.status} ${JSON.stringify(r.data).slice(0, 140)}`;
function dung(msg) {
  console.error(`\nDừng: ${msg}`);
  process.exit(1);
}

buoc('Chuẩn bị: tài khoản lãnh đạo tỉnh (có PIN), cán bộ xã Cô Ba');
const dn = await call('POST', '/auth/login', { username: process.env.ADMIN_USER || 'admin', password: process.env.ADMIN_PASS || 'admin123' });
const admin = dn.data?.token;
if (!admin) dung(`không đăng nhập được quản trị: ${ngan(dn)}`);
const stations = (await call('GET', '/stations', null, admin)).data;
if (!Array.isArray(stations) || !stations.some((s) => s.id === 'CB-WL-01')) dung('chưa có trạm CB-WL-01 — chạy nap.mjs trước');

/** Tạo tài khoản lần đầu; chạy lại thì đăng nhập bằng mật khẩu đã đổi. */
async function taiKhoan(username, fullName, role, domain, extra = {}) {
  const dau = `DienTap-${username}-1`;
  const rieng = `${dau}-rieng`;
  const lai = await call('POST', '/auth/login', { username, password: rieng });
  if (lai.data?.token) return lai.data.token;
  const tao = await call('POST', '/rbac/users', { username, full_name: fullName, password: dau, role, domain, ...extra }, admin);
  if (tao.status !== 201) dung(`không tạo được ${username}: ${ngan(tao)}`);
  const first = await call('POST', '/auth/login', { username, password: dau });
  if (!first.data?.token) dung(`${username} chưa đăng nhập được: ${ngan(first)} — stack thử không đặt TOTP_REQUIRED_ROLES`);
  const doi = await call('POST', '/auth/change-password', { current_password: dau, new_password: rieng }, first.data.token);
  return doi.data?.token;
}
const chiHuy = await taiKhoan('chihuy.dientap', 'Lãnh đạo tỉnh (diễn tập)', 'admin_tinh', '*', { pin: PIN });
const canBoXa = await taiKhoan('xa.dientap', 'Cán bộ xã Cô Ba (diễn tập)', 'admin_xa', XA_DOMAIN);
check('Có đủ tài khoản', !!chiHuy && !!canBoXa);
const coBa = (await call('GET', '/admin-units?level=xa', null, admin)).data.find((u) => u.code === XA);
const gan = async (dLat, dLon, gui) => {
  const r = await gui(coBa.lat + dLat, coBa.lon + dLon);
  return r.status < 300 ? r : gui(coBa.lat, coBa.lon); // lệch ra ngoài ranh giới xã thì dùng điểm đại diện
};

buoc('1. Mở đợt thiên tai');
let dot = ((await call('GET', '/events', null, admin)).data || []).find?.((e) => !e.ended_at);
const dotMoi = !dot;
if (!dot) {
  const r = await call('POST', '/events', { name: `Mưa lũ diện rộng (diễn tập ${stamp})`, hazard: 'lu_lut', note: 'Đợt diễn tập trên dữ liệu giả lập.' }, admin);
  check('Mở đợt', r.status === 201, r.data?.code || ngan(r));
  dot = r.data;
} else check('Đợt đang mở, dùng tiếp', true, dot.code);

buoc('2. Thiết bị đo gửi số liệu: mưa tăng, mực nước vượt báo động II, đất ẩm, taluy nghiêng');
const thietBi = [];
const dangKy = async (stationId, ten) => {
  const id = `DT-${stationId}-${stamp}`.toUpperCase();
  const r = await call('POST', '/integrations/devices', { id, name: `${ten} (diễn tập)`, protocol: 'http', station_id: stationId, expected_interval_s: 600 }, admin);
  check(`Đăng ký thiết bị ${stationId}`, r.status === 201, r.status === 201 ? '' : ngan(r));
  thietBi.push(id);
  return { id, key: r.data?.api_key };
};
const guiChuoi = async (dev, values) => {
  let ok = 0;
  for (const [i, v] of values.entries()) {
    const r = await call('POST', '/ingest/readings', { device_id: dev.id, value: v, time: ago((values.length - 1 - i) * 0.5) }, null, { 'X-Device-Key': dev.key });
    if (r.status === 200 && r.data?.accepted === 1) ok += 1;
  }
  return ok;
};
const phieuCamBien = async () => ((await call('GET', '/sos', null, admin)).data || []).filter((t) => t.source === 'SENSOR');
const camBienTruoc = (await phieuCamBien()).length;
const nuoc = await dangKy('CB-WL-01', 'Thước nước');
const CUOI = 181.4;
check('Mực nước: 6 số đo được nhận', (await guiChuoi(nuoc, [178.9, 179.4, 180.1, 180.6, 181.1, CUOI])) === 6);
const mua = await dangKy('CB-RN-04', 'Đo mưa');
check('Lượng mưa: 6 số đo được nhận', (await guiChuoi(mua, [12, 18, 26, 31, 22, 15])) === 6);
const nghieng = await dangKy('CB-TL-02', 'Đo nghiêng');
check('Độ nghiêng: 4 số đo được nhận', (await guiChuoi(nghieng, [0.4, 0.9, 1.6, 2.4])) === 4);
const doAm = await dangKy('CB-SM-01', 'Độ ẩm đất');
check('Độ ẩm đất: 4 số đo được nhận', (await guiChuoi(doAm, [68, 76, 84, 91])) === 4);
let tramNuoc;
for (let i = 0; i < 12 && tramNuoc?.value !== CUOI; i += 1) {
  tramNuoc = ((await call('GET', '/stations?type=muc_nuoc', null, admin)).data || []).find((s) => s.id === 'CB-WL-01');
  if (tramNuoc?.value !== CUOI) await sleep(2500);
}
check('Trạm hiện đúng số đo mới nhất', tramNuoc?.value === CUOI, `${tramNuoc?.value} m`);
// Nghiêng, độ ẩm vượt báo động II: hệ thống tự khoanh vùng, tạo phiếu, soạn nháp cảnh báo. Mỗi trạm một lần trong khi vùng tự động
// còn hiệu lực (12 giờ) — chạy lại trong thời gian đó thì không có phiếu mới.
let camBien = await phieuCamBien();
for (let i = 0; i < 8 && dotMoi && camBien.length === camBienTruoc; i += 1) {
  await sleep(1500);
  camBien = await phieuCamBien();
}
const camBienMoi = camBien.length - camBienTruoc;
check('Cảm biến vượt ngưỡng: có phiếu tự động', camBien.length > 0, `thêm ${camBienMoi} phiếu lần này, tổng ${camBien.length}`);
const nhap = ((await call('GET', '/alerts/broadcasts', null, admin)).data || []).filter((b) => String(b.title).startsWith('[Tự động]'));
check('Cảm biến vượt ngưỡng: có nháp cảnh báo chờ người duyệt', nhap.length > 0, `${nhap.length} nháp`);

buoc('3. Lệnh cảnh báo: trực ban soạn, lãnh đạo duyệt bằng PIN');
const lenh = await call('POST', '/alerts/broadcasts', {
  title: `Cảnh báo ngập ven sông Bằng Giang (diễn tập ${stamp})`,
  message_body: 'Diễn tập: mực nước sông Bằng Giang vượt báo động II, người dân ven sông chú ý di chuyển tài sản, sẵn sàng sơ tán.',
  admin_codes: ['CB-THUCPHAN', 'CB-NUNGTRICAO'],
  channels: ['SMS', 'ZALO_OA', 'LOA'],
  severity: 'cam',
}, admin);
check('Soạn lệnh → chờ duyệt', lenh.data?.status === 'pending_approval', lenh.data?.code || ngan(lenh));
check('Sai PIN bị từ chối', (await call('POST', `/alerts/broadcasts/${lenh.data?.id}/approve`, { pin: '000000' }, chiHuy)).status === 403);
const duyet = await call('POST', `/alerts/broadcasts/${lenh.data?.id}/approve`, { pin: PIN }, chiHuy);
check('Lãnh đạo duyệt', duyet.status === 200, duyet.status === 200 ? `trạng thái ${duyet.data?.status}` : ngan(duyet));

buoc('4. Người dân đăng ký, gửi phản ánh; cán bộ duyệt và chuyển thành phiếu SOS');
const sdtDan = `0999${String(Date.now()).slice(-6)}`;
const dan = await call('POST', '/public/account/register', { full_name: 'Người dân diễn tập', phone: sdtDan, password: 'Nguoidan2026', consent: true });
check('Đăng ký tài khoản người dân', dan.status === 201, dan.status === 201 ? '' : ngan(dan));
const f = new FormData();
f.append('category', 'ngap');
f.append('description', `Diễn tập: nước ngập sâu trước cổng trường, 3 người cần hỗ trợ (${stamp})`);
f.append('lat', String(coBa.lat));
f.append('lon', String(coBa.lon));
f.append('reporter_name', 'Người dân diễn tập');
f.append('reporter_phone', sdtDan);
const pa = await call('POST', '/public/reports', f, dan.data?.token);
check('Gửi phản ánh', pa.status === 201, pa.data?.code || ngan(pa));
check('Duyệt phản ánh', (await call('POST', `/reports/${pa.data?.id}/moderate`, { action: 'approve', public_note: 'Đã cử lực lượng kiểm tra' }, admin)).status === 200);
const sosPa = await call('POST', `/reports/${pa.data?.id}/to-sos`, { incident_type: 'ngap_lut', priority: 2, trapped_count: 3 }, admin);
check('Chuyển thành phiếu SOS', sosPa.status === 200 && !!sosPa.data?.sos_id, sosPa.data?.sos_code || ngan(sosPa));
const phieu1 = { id: sosPa.data?.sos_id, code: sosPa.data?.sos_code };

buoc('5. Xã nhận tin sạt lở qua điện thoại, gửi yêu cầu chi viện lên tỉnh');
const satLo = await gan(-0.004, 0.005, (lat, lon) => call('POST', '/sos', {
  raw_message: 'Diễn tập: sạt lở taluy sau nhà, đất đá lấp lối ra, 1 hộ 4 người cần di dời gấp.',
  source: 'HOTLINE', reporter_phone: '0999 300 102', lat, lon, incident_type: 'sat_lo', priority: 2, trapped_count: 4,
  vulnerable: ['nguoi_gia'], address: 'Đường liên thôn, xã Cô Ba', external_id: `dien-tap-sat-lo-${stamp}`,
}, canBoXa));
check('Xã tạo phiếu sạt lở', satLo.status < 300, satLo.data?.code || ngan(satLo));
const chiVien = await gan(0.006, -0.008, (lat, lon) => call('POST', '/sos', {
  raw_message: `${TAG_CHI_VIEN} Diễn tập: lũ quét ven suối, 9 người mắc kẹt. Cần tỉnh chi viện xuồng, y tế.`,
  source: 'CAN_BO', reporter_name: 'Chỉ huy xã Cô Ba (diễn tập)', reporter_phone: '0999 300 101', lat, lon, incident_type: 'lu_quet',
  priority: 1, trapped_count: 9, vulnerable: ['nguoi_gia', 'tre_em'], address: 'Khu dân cư ven suối, xã Cô Ba', external_id: `dien-tap-chi-vien-${stamp}`,
}, canBoXa));
check('Xã xin chi viện', chiVien.status < 300, chiVien.data?.code || ngan(chiVien));

buoc('6. Điều động: gợi ý đội, phát lệnh, đội báo qua link, đội đến, cứu xong, trực ban đóng phiếu');
const goiY = await call('GET', `/sos/${phieu1.id}/match`, null, admin);
const doi = goiY.data?.forces?.[0];
check('Có đội được gợi ý', !!doi, doi ? `${doi.name} · ${goiY.data.forces.length} đội trong ${goiY.data.radius_km} km` : ngan(goiY));
if (doi) {
  const lenhDi = await call('POST', '/dispatch', { ticket_id: phieu1.id, force_id: doi.id, personnel: 3 }, admin);
  check('Phát lệnh điều động', lenhDi.status === 200 && lenhDi.data?.ticket?.status === 'thuc_thi', lenhDi.status === 200 ? `${lenhDi.data.route?.distance_km} km` : ngan(lenhDi));
  const maDoi = (lenhDi.data?.notification?.mission_url || '').split('#')[1] || '';
  const doiHdr = { 'X-Mission-Token': maDoi };
  check('Đội báo cần chi viện qua link', (await call('POST', '/mission/report', { kind: 'need_support', note: 'Diễn tập: cần thêm 1 xuồng' }, null, doiHdr)).status === 200);
  check('Trực ban ghi đội đã đến', (await call('POST', `/dispatch/${lenhDi.data?.order?.id}/arrived`, { note: 'Trưởng nhóm gọi báo (diễn tập)' }, admin)).status === 200);
  check('Đội báo đã cứu 3 người', (await call('POST', '/mission/report', { kind: 'rescued', people_safe: 3 }, null, doiHdr)).status === 200);
  check('Trực ban xác nhận, đóng phiếu', (await call('POST', `/sos/${phieu1.id}/resolve`, null, admin)).status === 200);
}

buoc('7. Vật tư và sơ tán');
const khoTinh = ((await call('GET', '/resources/warehouses', null, admin)).data || []).find((k) => k.code === 'K-TINH');
const xuat = await call('POST', `/resources/warehouses/${khoTinh?.id}/issue`, { item_code: 'MI_TOM', quantity: 20, destination: 'Xã Cô Ba (diễn tập)' }, admin);
check('Xuất kho tỉnh cho xã', xuat.status === 200, xuat.status === 200 ? '' : ngan(xuat));
const soTan = await call('PUT', `/evacuation/${XA}`, { planned_households: 38, evacuated_households: 21, planned_persons: 152, evacuated_persons: 84, source: 'Báo cáo UBND xã (diễn tập)' }, canBoXa);
check('Xã cập nhật tiến độ sơ tán', soTan.status === 200, soTan.status === 200 ? '' : ngan(soTan));
const diem = ((await call('GET', '/resources/evacuation-sites', null, admin)).data || []).find((d) => d.admin_code === XA || d.admin_name === coBa.name);
if (diem) check('Cập nhật số người ở điểm sơ tán', (await call('PATCH', `/resources/evacuation-sites/${diem.id}/occupancy`, { current_occupancy: 40 }, admin)).status === 200, diem.name);

buoc('8. Xã gửi hồ sơ dữ liệu, tỉnh duyệt');
const csv = `ma,ten,loai,suc_chua,dang_o,sdt_lien_he,vi_do,kinh_do,ma_xa\nDT-${stamp}-01,Nhà văn hóa thôn (diễn tập),nha_van_hoa,120,0,0999 300 103,${coBa.lat},${coBa.lon},${XA}\n`;
const hs = new FormData();
hs.set('name', 'diem_so_tan');
hs.set('note', 'Bổ sung điểm sơ tán (diễn tập)');
hs.set('file', new Blob([csv], { type: 'text/csv' }), 'diem-so-tan-co-ba.csv');
const gui = await call('POST', '/data-import/submissions', hs, canBoXa);
check('Xã gửi hồ sơ', gui.status === 201, gui.data?.code || ngan(gui));
check('Tỉnh duyệt hồ sơ', (await call('POST', `/data-import/submissions/${gui.data?.code}/approve`, {}, admin)).status === 200);

if (DUNG_GIUA) {
  console.log(`\nDừng giữa đợt ${dot?.code}: đợt còn mở, phiếu xin chi viện ${chiVien.data?.code} và phiếu sạt lở còn chờ. Mở giao diện để xem.`);
} else {
  buoc('9. Kết thúc: gỡ cảnh báo, kết thúc đợt, đọc báo cáo');
  check('Lãnh đạo kết thúc lệnh cảnh báo', (await call('POST', `/alerts/broadcasts/${lenh.data?.id}/end`, { pin: PIN, note: 'Diễn tập: nước đã rút' }, chiHuy)).status === 200);
  const ket = await call('POST', `/events/${dot?.code}/end`, { end_note: 'Diễn tập: mưa đã ngớt, nước rút dưới báo động I.' }, admin);
  check('Kết thúc đợt', ket.status === 200, ket.status === 200 ? '' : ngan(ket));
  const bc = await call('GET', `/events/${dot?.code}/summary`, null, admin);
  const b = bc.data || {};
  const mi = (b.supplies || []).find((s) => s.item_code === 'MI_TOM');
  const canPhieu = 3 + camBienMoi; // phản ánh, sạt lở, chi viện + phiếu tự động của cảm biến
  const dungSo = dotMoi ? b.sos?.total === canPhieu && b.sos?.rescued === 3 && b.dispatch?.orders === 1 : b.sos?.total >= canPhieu;
  check(`Báo cáo đợt: đủ ${canPhieu} phiếu, 3 người được cứu, 1 lệnh điều động`, dungSo, `${b.sos?.total} phiếu · cứu ${b.sos?.rescued} · ${b.dispatch?.orders} lệnh`);
  check('Báo cáo đợt: có lệnh cảnh báo', (b.alerts || []).some((a) => a.code === lenh.data?.code));
  check('Báo cáo đợt: xuất đúng 20 thùng mì tôm, không tính tồn kho nạp trước đợt', (dotMoi ? mi?.issued === 20 : mi?.issued >= 20) && !mi?.received, `xuất ${mi?.issued}, nhận ${mi?.received}`);
  check('Báo cáo đợt: có sơ tán xã Cô Ba', (b.evacuation || []).some((e) => e.code === XA));
}
for (const id of thietBi) await call('DELETE', `/integrations/devices/${id}`, null, admin);

console.log(failed ? `\n${failed} BƯỚC LỖI` : '\nDiễn tập xong, không có bước lỗi');
process.exit(failed ? 1 : 0);
