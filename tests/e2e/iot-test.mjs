// Kiểm thử cổng tiếp nhận IoT + nguồn dữ liệu (cần stack đang chạy, gồm broker MQTT).
//   node tests/e2e/iot-test.mjs [http://localhost:8000]
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
const xa = (await call('POST', '/auth/login', { username: 'admin.coba', password: 'admincoba123' })).data.token; // Cấp 3
const A = auth(admin);

check('Quản trị xã không xem được nguồn dữ liệu → 403', (await call('GET', '/integrations/sources', null, auth(xa))).status === 403);
const sources = (await call('GET', '/integrations/sources', null, A)).data;
const om = sources.find((s) => s.code === 'OPEN_METEO_ENS');
check('Dự báo theo xã: khung giờ sai (hours=0, offset_h âm) → 422',
  (await call('GET', '/forecast/areas?hours=0', null, A)).status === 422 && (await call('GET', '/forecast/areas?offset_h=-1', null, A)).status === 422);
if (om?.status === 'ok') {
  check('Nguồn Open-Meteo đồng bộ thành công', true, JSON.stringify(om?.stats?.members));
  const models = (await call('GET', '/forecast/models', null, A)).data;
  check('Có dự báo theo xã ECMWF/GFS/BLEND', ['BLEND', 'ECMWF_ENS', 'GFS_ENS'].every((m) => models.some((x) => x.model === m && x.units === 56)));
  const areas = (await call('GET', '/forecast/areas?hours=72', null, A)).data;
  check('Tổng mưa 72h theo 56 xã (P10 ≤ P50 ≤ P90)', areas.length === 56 && areas.every((a) => a.p10 <= a.p50 && a.p50 <= a.p90),
    `nhiều nhất ${areas[0].name}: ${areas[0].p50} mm (P90 ${areas[0].p90})`);
  const series = (await call('GET', `/forecast/areas/${areas[0].code}`, null, A)).data;
  check('Chuỗi dự báo theo giờ của 1 xã', series.series.BLEND?.length >= 48);
  // Khung giờ dời được (thanh thời gian bản đồ): 0–12h + 12–24h = 24h từng xã; khung 1 giờ ở +6h = đúng 1 mốc giờ 5–6 giờ tới
  const [a24, a12, b12, h6] = await Promise.all(['?hours=24', '?hours=12', '?hours=12&offset_h=12', '?hours=1&offset_h=5']
    .map(async (q) => (await call('GET', `/forecast/areas${q}`, null, A)).data));
  const p50 = (rows) => Object.fromEntries(rows.map((r) => [r.code, r.p50]));
  const [m12a, m12b] = [p50(a12), p50(b12)];
  check('Mưa dự báo: 2 khung 12 giờ liền nhau cộng lại = tổng 24 giờ (từng xã)',
    a24.length === 56 && a24.every((r) => Math.abs((m12a[r.code] ?? 0) + (m12b[r.code] ?? 0) - r.p50) <= 0.15));
  const lead = Date.parse(h6[0]?.window_to) - Date.now();
  check('Mưa dự báo khung 1 giờ (+6h): đúng 1 mốc giờ, trong khoảng 5–6 giờ tới',
    h6.length === 56 && h6.every((r) => r.window_from === r.window_to) && lead > 5 * 3600e3 - 60e3 && lead <= 6 * 3600e3 + 60e3,
    `${h6[0]?.window_to} · ${Math.round(lead / 60e3)} phút tới`);
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
// danh sách trạm cache theo khung 5 giây (như kiểm tra MQTT bên dưới) → chờ tới ~10 giây
let wl;
for (let i = 0; i < 10 && wl?.value !== 184.5; i += 1) {
  if (i) await sleep(1000);
  wl = (await call('GET', '/stations?type=muc_nuoc', null, A)).data.find((s) => s.id === 'CB-WL-02');
}
check('Giá trị mực nước sau quy đổi', wl?.value === 184.5, String(wl?.value));
const ttn = await call('POST', '/ingest/lorawan', {
  end_device_ids: { dev_eui: LORA_ID }, uplink_message: { decoded_payload: { level_cm: 460 }, received_at: new Date().toISOString() },
}, auth(ltok));
check('LoRaWAN TTN v3', ttn.data?.accepted === 1);
check('ChirpStack event khác "up" được bỏ qua', (await call('POST', '/ingest/lorawan?event=join', { deviceInfo: { devEui: LORA_ID } }, auth(ltok))).data?.ignored === 'join');

// MQTT (publish qua container broker)
try {
  execSync(`docker exec caobang-pctt-mqtt mosquitto_pub -t caobang/pctt/${MQTT_ID}/readings -m "{\\"value\\": 1.35}"`, { stdio: 'ignore' });
  // danh sách trạm cache theo khung 5 giây (số đo là sự kiện tần suất cao, không làm mới cache ngay) → chờ tới ~10 giây
  let tl;
  for (let i = 0; i < 10 && tl?.value !== 1.35; i += 1) {
    await sleep(1000);
    tl = (await call('GET', '/stations?type=do_nghieng', null, A)).data.find((s) => s.id === 'CB-TL-02');
  }
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

// /stations cho Tổng quan: số đo ~1 giờ trước (mũi tên xu hướng), mức báo động kế tiếp và lúc dự báo chạm mức đó
const water = (await call('GET', '/stations?type=muc_nuoc', null, A)).data;
const FIELDS = ['prev_value', 'prev_time', 'next_level', 'next_threshold', 'eta_time', 'eta_model'];
check('/stations: trạm mực nước có trường xu hướng & dự báo', water.length > 0 && water.every((s) => FIELDS.every((f) => f in s)));
const gapMin = (s) => (new Date(s.time) - new Date(s.prev_time)) / 60_000;
check('/stations: có số đo trước để tính xu hướng, cách số đo mới nhất 45–90 phút',
  water.some((s) => s.prev_value != null) && water.every((s) => s.prev_time == null || (gapMin(s) >= 45 && gapMin(s) <= 90)),
  water.map((s) => `${s.id} ${s.prev_time ? Math.round(gapMin(s)) : '–'}′`).join(', '));
const nextOf = (s) => [1, 2, 3].find((lv) => s.thresholds?.[`bd${lv}`] != null && s.thresholds[`bd${lv}`] > s.value) ?? null;
check('/stations: mức kế tiếp = ngưỡng thấp nhất trên số đo hiện tại',
  water.every((s) => s.value == null || (s.next_level === nextOf(s) && (s.next_level == null || s.next_threshold === s.thresholds[`bd${s.next_level}`]))),
  water.map((s) => `${s.id} ${s.value}→${s.next_level ?? '–'}`).join(', '));
// Bản tin KTTV chạm mức kế tiếp → eta_time = điểm dự báo đầu tiên ≥ ngưỡng, eta_model = KTTV; gỡ bản tin → hết KTTV.
// Chỉ thử trên trạm CHƯA có bản tin KTTV (chạy trên stack dev không xoá bản tin người dùng đã nhập)
let target = null;
// (bỏ CB-WL-02 — vừa nhận số đo LoRaWAN ở trên; bỏ trạm sát ngưỡng — nước lên qua ngưỡng giữa chừng thì mức kế tiếp đổi)
for (const s of water.filter((x) => x.id !== 'CB-WL-02' && x.next_level != null && x.value != null && x.next_threshold - x.value > 0.1)) {
  const sr = (await call('GET', `/stations/${s.id}/series?hours=1`, null, A)).data;
  if (!sr.forecast.some((f) => f.model === 'KTTV')) { target = s; break; }
}
if (target) {
  const t0 = Date.now();
  const points = [1, 2, 3, 4, 5, 6].map((h) => ({
    time: new Date(Math.floor((t0 + h * 3600e3) / 60_000) * 60_000).toISOString(),
    value: Math.round((target.value + ((target.next_threshold + 0.3 - target.value) * h) / 6) * 1000) / 1000,
  }));
  const firstHit = points.find((p) => p.value >= target.next_threshold);
  const put = await call('PUT', `/stations/${target.id}/forecast`, { points, source: 'Kiểm thử E2E' }, A);
  let row;
  for (let i = 0; i < 10 && row?.eta_model !== 'KTTV'; i += 1) {
    if (i) await sleep(1000);
    row = (await call('GET', '/stations?type=muc_nuoc', null, A)).data.find((s) => s.id === target.id);
  }
  check(`Bản tin KTTV chạm BĐ ${target.next_level} → /stations báo giờ chạm theo bản tin (${target.id})`,
    put.status === 200 && row?.eta_model === 'KTTV' && new Date(row.eta_time).getTime() === new Date(firstHit.time).getTime(),
    `${put.status} ${row?.eta_time} ${row?.eta_model} (chờ ${firstHit.time})`);
  const del = await call('DELETE', `/stations/${target.id}/forecast`, null, A);
  for (let i = 0; i < 10 && row?.eta_model === 'KTTV'; i += 1) {
    if (i) await sleep(1000);
    row = (await call('GET', '/stations?type=muc_nuoc', null, A)).data.find((s) => s.id === target.id);
  }
  check('Gỡ bản tin KTTV → giờ chạm không còn theo bản tin', del.status === 204 && row?.eta_model !== 'KTTV', `${row?.eta_model}`);
} else {
  check('Có trạm mực nước dưới BĐ III, chưa có bản tin KTTV để thử giờ chạm', false);
}

// Dọn dẹp: xoá thiết bị → trạm trở lại mô phỏng
for (const id of [HTTP_ID, MQTT_ID, LORA_ID]) await call('DELETE', `/integrations/devices/${id}`, null, A);
const after = (await call('GET', '/stations', null, A)).data;
check('Xoá thiết bị → trạm trở lại mô phỏng', ['CB-RN-03', 'CB-TL-02', 'CB-WL-02'].every((id) => after.find((s) => s.id === id)?.source === 'simulator'));

console.log(failures ? `\n${failures} kiểm tra THẤT BẠI` : '\nTất cả kiểm tra IoT & nguồn dữ liệu đạt');
process.exit(failures ? 1 : 0);
