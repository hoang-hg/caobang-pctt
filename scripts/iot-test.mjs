// Kiểm thử cổng tiếp nhận IoT + nguồn dữ liệu (cần stack đang chạy, gồm broker MQTT).
//   node scripts/iot-test.mjs [http://localhost:8000]
// Tạo thiết bị thử, gửi số đo qua HTTP / batch / LoRaWAN / MQTT, kiểm tra từ chối số đo lỗi, rồi dọn dẹp.
import { execSync } from 'node:child_process';

const ROOT = process.argv[2] || 'http://localhost:8000';
const BASE = ROOT + '/api/v1';
let failures = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(method, path, body, headers = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures += 1;
};
const auth = (t) => ({ Authorization: `Bearer ${t}` });

const admin = (await call('POST', '/auth/login', { username: 'admin', password: 'admin123' })).data.token;
const xem = (await call('POST', '/auth/login', { username: 'xem', password: 'xem123' })).data.token;
const A = auth(admin);

check('Tài khoản quan sát không xem được nguồn dữ liệu → 403', (await call('GET', '/integrations/sources', null, auth(xem))).status === 403);
const sources = (await call('GET', '/integrations/sources', null, A)).data;
const om = sources.find((s) => s.code === 'OPEN_METEO_ENS');
if (om?.status === 'ok') {
  check('Nguồn Open-Meteo đồng bộ thành công', true, JSON.stringify(om?.stats?.members));
  const models = (await call('GET', '/forecast/models', null, A)).data;
  check('Có dự báo theo xã ECMWF/GFS/BLEND', ['BLEND', 'ECMWF_ENS', 'GFS_ENS'].every((m) => models.some((x) => x.model === m && x.units === 56)));
  const areas = (await call('GET', '/forecast/areas?hours=72', null, A)).data;
  check('Tổng mưa 72h theo 56 xã (P10 ≤ P50 ≤ P90)', areas.length === 56 && areas.every((a) => a.p10 <= a.p50 && a.p50 <= a.p90),
    `nhiều nhất ${areas[0].name}: ${areas[0].p50} mm (P90 ${areas[0].p90})`);
  const series = (await call('GET', `/forecast/areas/${areas[0].code}`, null, A)).data;
  check('Chuỗi dự báo theo giờ của 1 xã', series.series.BLEND?.length >= 48);
} else {
  console.log(`SKIP  Kiểm tra dự báo Open-Meteo (nguồn ${om?.status || 'không có'} — không có Internet hoặc OPEN_METEO_ENABLED=false)`);
}

// ---- Thiết bị thử
const suffix = Date.now().toString(36).slice(-4).toUpperCase();
const HTTP_ID = `TEST-RN-${suffix}`;
const MQTT_ID = `TEST-TL-${suffix}`;
const LORA_ID = `A84041000181${suffix.padStart(4, '0')}`;
const created = await call('POST', '/integrations/devices', { id: HTTP_ID, name: 'Cảm biến mưa thử', protocol: 'http', station_id: 'CB-RN-03', expected_interval_s: 60 }, A);
const key = created.data?.api_key;
check('Đăng ký thiết bị HTTP, nhận khoá 1 lần', created.status === 201 && key?.startsWith('cbk_'));
await call('POST', '/integrations/devices', { id: MQTT_ID, name: 'Cảm biến nghiêng thử', protocol: 'mqtt', station_id: 'CB-TL-02' }, A);
await call('POST', '/integrations/devices', { id: LORA_ID, name: 'Thước nước LoRa thử', protocol: 'lorawan', station_id: 'CB-WL-02', value_field: 'level_cm', scale: 0.01, offset_value: 180 }, A);

check('Sai khoá thiết bị → 401', (await call('POST', '/ingest/readings', { device_id: HTTP_ID, value: 3 }, { 'X-Device-Key': 'cbk_sai' })).status === 401);
check('Thiết bị chưa đăng ký → 404', (await call('POST', '/ingest/readings', { device_id: 'KHONG-CO', value: 3 }, { 'X-Device-Key': key })).status === 404);

const t0 = new Date(Date.now() - 20 * 60_000).toISOString();
const r1 = await call('POST', '/ingest/readings', {
  device_id: HTTP_ID,
  readings: [{ value: 12.5, time: t0 }, { value: 8.0 }, { value: -3 }, { value: 999 }],
}, { 'X-Device-Key': key });
check('HTTP: nhận 2 số đo, loại 2 số đo ngoài khoảng', r1.data?.accepted === 2 && r1.data?.rejected === 2, JSON.stringify(r1.data?.errors));
const r2 = await call('POST', '/ingest/readings', { device_id: HTTP_ID, value: 12.5, time: t0 }, { 'X-Device-Key': key });
check('HTTP: số đo trùng bị loại', r2.data?.accepted === 0 && r2.data?.rejected === 1);

const stations = (await call('GET', '/stations?type=luong_mua', null, A)).data;
const rn03 = stations.find((s) => s.id === 'CB-RN-03');
check('Trạm chuyển sang dữ liệu thật, giá trị mới nhất = số đo thiết bị', rn03?.source === 'iot' && rn03?.value === 8.0);

// Batch với token nguồn IOT_HTTP
const httpSrc = sources.find((s) => s.code === 'IOT_HTTP');
const tok = (await call('POST', `/integrations/sources/${httpSrc.id}/rotate-token`, null, A)).data.token;
check('Batch sai token → 401', (await call('POST', '/ingest/batch', [{ device_id: HTTP_ID, value: 1 }], auth('sai'))).status === 401);
const b = await call('POST', '/ingest/batch', [{ device_id: HTTP_ID, value: 4.2 }, { device_id: 'KHONG-CO', value: 1 }], auth(tok));
check('Batch nhiều thiết bị (1 nhận, 1 chưa đăng ký)', b.data?.accepted === 1 && b.data?.rejected === 1);

// LoRaWAN (ChirpStack v4)
const loraSrc = sources.find((s) => s.code === 'LORAWAN');
const ltok = (await call('POST', `/integrations/sources/${loraSrc.id}/rotate-token`, null, A)).data.token;
const up = await call('POST', '/ingest/lorawan?event=up', {
  deviceInfo: { devEui: LORA_ID.toLowerCase() }, time: new Date().toISOString(), object: { level_cm: 450 },
}, auth(ltok));
check('LoRaWAN ChirpStack: quy đổi 450 cm × 0,01 + 180 = 184,5 m', up.data?.accepted === 1, JSON.stringify(up.data));
const wl = (await call('GET', '/stations?type=muc_nuoc', null, A)).data.find((s) => s.id === 'CB-WL-02');
check('Giá trị mực nước sau quy đổi', wl?.value === 184.5, String(wl?.value));
const ttn = await call('POST', '/ingest/lorawan', {
  end_device_ids: { dev_eui: LORA_ID }, uplink_message: { decoded_payload: { level_cm: 460 }, received_at: new Date().toISOString() },
}, auth(ltok));
check('LoRaWAN TTN v3', ttn.data?.accepted === 1);
check('ChirpStack event khác "up" được bỏ qua', (await call('POST', '/ingest/lorawan?event=join', { deviceInfo: { devEui: LORA_ID } }, auth(ltok))).data?.ignored === 'join');

// MQTT (publish qua container broker)
try {
  execSync(`docker exec caobang-pctt-mqtt mosquitto_pub -t caobang/pctt/${MQTT_ID}/readings -m "{\\"value\\": 1.35}"`, { stdio: 'ignore' });
  await sleep(2500);
  const tl = (await call('GET', '/stations?type=do_nghieng', null, A)).data.find((s) => s.id === 'CB-TL-02');
  check('MQTT: cảm biến nghiêng nhận 1,35°', tl?.value === 1.35, String(tl?.value));
  const layers = (await call('GET', '/map/layers', null, A)).data;
  check('Vượt BĐ II qua MQTT → có vùng nguy cơ sạt lở tự động (cảm biến Mẻ Pia)',
    layers.hazard_zones.features.some((f) => f.properties.source === 'sensor' && f.properties.name.includes('Mẻ Pia')));
} catch (e) {
  check('MQTT publish qua docker', false, e.message);
}

const devs = (await call('GET', '/integrations/devices', null, A)).data;
check('Thiết bị HTTP trực tuyến', devs.find((d) => d.id === HTTP_ID)?.status === 'truc_tuyen');
const mon = (await call('GET', '/integrations/monitor', null, A)).data;
check('Giám sát kết nối: MQTT broker đã kết nối, có nhật ký tiếp nhận', mon.mqtt_connected && mon.log.length > 0);

// Dọn dẹp: xoá thiết bị → trạm trở lại mô phỏng
for (const id of [HTTP_ID, MQTT_ID, LORA_ID]) await call('DELETE', `/integrations/devices/${id}`, null, A);
const after = (await call('GET', '/stations', null, A)).data;
check('Xoá thiết bị → trạm trở lại mô phỏng', ['CB-RN-03', 'CB-TL-02', 'CB-WL-02'].every((id) => after.find((s) => s.id === id)?.source === 'simulator'));

console.log(failures ? `\n${failures} kiểm tra THẤT BẠI` : '\nTất cả kiểm tra IoT & nguồn dữ liệu đạt');
process.exit(failures ? 1 : 0);
