// CHẾ ĐỘ GIẢ LẬP — chỉ máy dev, bật chủ động (app/store.js); nạp qua import động trong nhánh import.meta.env.DEV của
// api/client.js nên không có trong bản build chạy thật.
//
// Dữ liệu: phản hồi API đã ghi từ backend chạy seed demo (demo/fixtures.json, ghi bằng tests/ui/demo-record.mjs — tên giả
// định, SĐT đầu số 0999) nên đúng định dạng API thật; mốc thời gian dời về lúc mở. Hai bộ: toàn tỉnh (tài khoản cấp tỉnh)
// và xã Cô Ba (tài khoản cấp xã, hoặc cấp tỉnh đang lọc đúng xã Cô Ba). Trên đó là lớp thay đổi trong phiên — phiếu SOS
// mới, điều động, cập nhật, hoàn thành, kịch bản thiên tai (SimulationBar) — chỉ nằm trong bộ nhớ trình duyệt, tải lại
// trang là về dữ liệu đã ghi. Đường dẫn / thao tác chưa giả lập → lỗi 501 nói rõ (trang hiện trạng thái lỗi, không vỡ).
import fixtures from './demo/fixtures.json';
import { DEMO_TOKEN, useStore } from '../app/store';
import { ApiError } from './client';
import { demoAuth } from './demoUsers';
import { COMMUNE_SUPPORT_TAG } from '../components/rescue/rescueFacts';
import { INCIDENT } from '../utils/labels';

const COMMUNE = 'CB-COBA'; // xã của bộ dữ liệu cấp xã (= tests/ui/demo-record.mjs)
const DAY = 86_400_000;
// Mọi mốc thời gian dời một khoảng cố định khi nạp: phiếu "nhận 6 phút trước" lúc ghi là 6 phút trước lúc mở, rồi cũ dần
const SHIFT = Date.now() - Date.parse(fixtures.recordedAt);
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_VALUE = /^\d{4}-\d{2}-\d{2}T|^\d{12,}$/; // tham số là mốc thời gian — không thuộc khoá tra cứu (như demo-record.mjs)
const SLA_MINUTES = { 1: 3, 2: 15, 3: 60 }; // như backend services/sos.py
const SOURCE_LOG = { ZALO: 'Zalo OA', APP: 'ứng dụng', HOTLINE: 'tổng đài', SENSOR: 'cảm biến', CAN_BO: 'cán bộ' };
const nowIso = () => new Date().toISOString();

/** Bản sao sâu, dời mốc thời gian (ngày giờ ISO và ngày YYYY-MM-DD). */
function revive(v) {
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = revive(x);
    return out;
  }
  if (typeof v === 'string') {
    if (ISO_TIME.test(v)) {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) return new Date(t + SHIFT).toISOString();
    } else if (ISO_DATE.test(v)) {
      return new Date(Date.parse(`${v}T00:00:00Z`) + Math.round(SHIFT / DAY) * DAY).toISOString().slice(0, 10);
    }
  }
  return v;
}
const recordedBody = (scope, key) => (key in fixtures[scope] ? fixtures.bodies[fixtures[scope][key]] : undefined);

/** Đường dẫn + tham số → khoá tra cứu (cùng quy tắc fixtureKey() của demo-record.mjs). */
function parse(path, params) {
  const [pathname, query = ''] = path.split('?');
  const sp = new URLSearchParams(query);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') sp.set(k, Array.isArray(v) ? v.join(',') : String(v));
  });
  const kept = [...sp.entries()].filter(([, v]) => v !== '' && !TIME_VALUE.test(v)).sort(([a], [b]) => a.localeCompare(b));
  return { pathname, key: kept.length ? `${pathname}?${new URLSearchParams(kept)}` : pathname, codes: sp.get('admin_codes') || '', sp };
}

const communeUser = () => {
  const a = useStore.getState().auth?.user?.assignments || [];
  return a.length > 0 && a.every((x) => x.role === 'admin_xa');
};
// Bộ dữ liệu của yêu cầu: tài khoản xã, hoặc cấp tỉnh lọc đúng xã Cô Ba → bộ xã; còn lại → bộ toàn tỉnh
const scopeOf = (codes) => (communeUser() || codes === COMMUNE ? 'xa' : 'tinh');

// Lọc theo xã khác Cô Ba (bộ toàn tỉnh): danh sách có mã xã lọc được; số liệu tổng hợp thì không — không lấy số toàn
// tỉnh gán cho một xã
const codeOf = (o) => (o && typeof o === 'object' ? o.admin_code ?? (String(o.code || '').startsWith('CB-') ? o.code : undefined) : undefined);
const isList = (v) => Array.isArray(v) || v?.type === 'FeatureCollection';
function byCodes(body, codes) {
  if (Array.isArray(body)) return body.every((o) => codeOf(o) !== undefined) ? body.filter((o) => codes.has(codeOf(o))) : undefined;
  if (body?.type === 'FeatureCollection') {
    return { ...body, features: body.features.filter((f) => codeOf(f.properties) === undefined || codes.has(codeOf(f.properties))) };
  }
  if (body && typeof body === 'object' && Object.values(body).every(isList)) {
    const out = {};
    for (const [k, v] of Object.entries(body)) {
      out[k] = byCodes(v, codes);
      if (out[k] === undefined) return undefined;
    }
    return out;
  }
  return undefined;
}

/** Phản hồi đã ghi cho yêu cầu: đúng khoá; không có thì cùng đường dẫn (bỏ tham số như limit, trang). */
function recorded({ pathname, key, codes }) {
  const scope = scopeOf(codes);
  const set = fixtures[scope];
  if (key in set) return { scope, body: revive(fixtures.bodies[set[key]]) };
  const loose = pathname in set ? pathname : Object.keys(set).find((k) => k.startsWith(`${pathname}?`) && !k.includes('admin_codes='));
  if (loose === undefined) return null;
  const body = fixtures.bodies[set[loose]];
  if (!codes || scope === 'xa') return { scope, body: revive(body) };
  const filtered = byCodes(body, new Set(codes.split(',')));
  if (filtered === undefined) throw new ApiError(501, 'Chế độ giả lập chỉ có số liệu tổng hợp của toàn tỉnh và xã Cô Ba');
  return { scope, body: revive(filtered) };
}

// ---- Lớp thay đổi trong phiên ------------------------------------------------------------------------------------
// Lưu trong sessionStorage của tab: tải lại trang giữa buổi trình diễn vẫn còn phiếu vừa tạo, kịch bản đang chạy; tắt
// giả lập hoặc ghi lại dữ liệu mẫu (recordedAt khác) → bỏ
const SAVE_KEY = 'pctt_sim_state';
const fresh = () => ({
  tickets: [], // phiếu tạo trong phiên (định dạng API)
  patches: new Map(), // id phiếu → trường đã đổi (trạng thái, điều động…)
  logs: [], // dòng nhật ký mới, mới nhất trước
  scenario: 'normal',
  since: null, // giờ bật kịch bản đang chạy
  seq: 0, // số thứ tự mã nội bộ (nhật ký, lệnh) — khác 0 là đã có thay đổi
  sos: 0, // số phiếu đã tạo: mã SOS-9001, SOS-9002…
});
const state = (() => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SAVE_KEY) || 'null');
    if (saved?.recordedAt === fixtures.recordedAt) return { ...fresh(), ...saved, patches: new Map(saved.patches) };
  } catch { /* trình duyệt chặn lưu trữ — chỉ giữ trong bộ nhớ */ }
  return fresh();
})();
function save() {
  try {
    sessionStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, patches: [...state.patches], recordedAt: fixtures.recordedAt }));
  } catch { /* như trên */ }
}
useStore.subscribe((s) => {
  if (s.simulationMode || state.seq === 0) return;
  try {
    sessionStorage.removeItem(SAVE_KEY);
  } catch { /* như trên */ }
  Object.assign(state, fresh());
});
// Kịch bản đang chạy (đã lưu) → thanh giả lập hiện đúng tên
if (state.scenario !== 'normal') useStore.getState().setSimulationScenario(state.scenario);
const units = () => recordedBody('tinh', '/admin-units?level=xa') || [];
const fixtureTickets = () => revive(recordedBody('tinh', '/sos') || []);
const TICKET_KEYS = Object.keys((recordedBody('tinh', '/sos') || [{}])[0]);
const nearestUnit = (lat, lon) => units().reduce((best, u) => {
  const d = (u.lat - lat) ** 2 + ((u.lon - lon) * Math.cos((lat * Math.PI) / 180)) ** 2;
  return !best || d < best.d ? { u, d } : best;
}, null)?.u;
const km = (a, b) => {
  const r = Math.PI / 180;
  const x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  return Math.sqrt(x ** 2 + ((b.lat - a.lat) * r) ** 2) * 6371;
};
const inScope = (t, scope, codes) => (scope === 'xa' ? t.admin_code === COMMUNE : !codes || codes.split(',').includes(t.admin_code));
const live = (t) => !t.scenario || t.scenario === state.scenario; // phiếu của kịch bản chỉ còn khi kịch bản đang chạy
const withPatch = (t) => (state.patches.has(t.id) ? { ...t, ...state.patches.get(t.id) } : t);
const output = ({ scenario, ...t }) => t; // bỏ trường nội bộ

function log(message, category, severity, at = {}) {
  state.logs.unshift({ id: `gia-lap-${++state.seq}`, time: nowIso(), category, severity, message, lat: at.lat ?? null, lon: at.lon ?? null, code: at.code, scenario: at.scenario });
}

/** Phiếu SOS mới như backend services/sos.create_ticket: xác định xã theo toạ độ, hạn xử lý theo cấp ưu tiên. */
function createTicket(body, scenario) {
  // Cán bộ xã chỉ tạo phiếu trong xã mình (máy chủ thật từ chối phiếu ngoài phạm vi); phiếu của kịch bản theo toạ độ
  const commune = communeUser() ? units().find((u) => u.code === COMMUNE) : null;
  const lat = body.lat ?? commune?.lat ?? null;
  const lon = body.lon ?? commune?.lon ?? null;
  const unit = (!scenario && commune) || (lat != null && lon != null ? nearestUnit(lat, lon) : null);
  const priority = Number(body.priority) || 2;
  const event = (recordedBody('tinh', '/events') || []).find((e) => !e.ended_at);
  const at = nowIso();
  state.seq += 1;
  const n = ++state.sos;
  const t = {
    ...Object.fromEntries(TICKET_KEYS.map((k) => [k, null])),
    id: `gia-lap-sos-${n}`,
    code: `SOS-${9000 + n}`,
    reporter_name: body.reporter_name ?? null,
    reporter_phone: body.reporter_phone ?? null,
    source: body.source || 'HOTLINE',
    raw_message: body.raw_message ?? null,
    address: body.address ?? null,
    incident_type: body.incident_type || 'ngap_lut',
    priority,
    status: 'moi',
    trapped_count: body.trapped_count ?? 0,
    vulnerable: body.vulnerable || [],
    received_at: at,
    status_changed_at: at,
    lat,
    lon,
    admin_code: unit?.code ?? null,
    admin_name: unit?.name ?? null,
    event_code: event?.code ?? null,
    event_name: event?.name ?? null,
    sla_minutes: SLA_MINUTES[priority],
    scenario,
  };
  state.tickets.unshift(t);
  const support = t.source === 'CAN_BO' && String(t.raw_message || '').startsWith(COMMUNE_SUPPORT_TAG);
  log(
    support
      ? `Yêu cầu chi viện từ ${t.admin_name ? `xã ${t.admin_name}` : 'xã'} – ${t.code}: ${INCIDENT[t.incident_type]}${t.trapped_count ? ` (${t.trapped_count} người)` : ''}`
      : `${t.code} – ${INCIDENT[t.incident_type]} tại ${t.address || t.admin_name}${t.trapped_count ? ` (${t.trapped_count} người)` : ''} qua ${SOURCE_LOG[t.source] || t.source}`,
    'nguoi_dan',
    priority === 1 ? 'danger' : 'warning',
    { lat, lon, code: t.admin_code, scenario },
  );
  return t;
}

/** Mọi phiếu (đã ghi + tạo trong phiên) sau thay đổi, trong phạm vi yêu cầu. */
function allTickets(scope, codes, base) {
  return [...state.tickets.filter((t) => live(t) && inScope(t, scope, codes)), ...base].map(withPatch);
}
const findTicket = (id) => {
  const t = state.tickets.find((x) => x.id === id) || fixtureTickets().find((x) => x.id === id);
  return t ? withPatch(t) : null;
};
function patchTicket(id, fields) {
  const t = findTicket(id);
  if (!t) throw new ApiError(404, 'Không tìm thấy phiếu SOS');
  const next = { ...fields };
  if (fields.status && fields.status !== t.status) {
    next.status_changed_at = nowIso();
    if (t.status === 'moi' && !t.acknowledged_at) next.acknowledged_at = next.status_changed_at;
    if (fields.status === 'hoan_thanh') next.resolved_at = next.status_changed_at;
  }
  state.patches.set(id, { ...state.patches.get(id), ...next });
  return output(findTicket(id));
}

// Số đếm SOS của ô KPI như backend api/v1/dashboard.py — phiếu nào đổi trong phiên thì trừ phần cũ, cộng phần mới
function sosCounts(t) {
  const age = (Date.now() - Date.parse(t.received_at)) / 60_000;
  const waiting = t.status === 'moi';
  return {
    waiting: +waiting,
    overdue: +(waiting && age > (t.sla_minutes ?? SLA_MINUTES[t.priority] ?? 15)),
    no_team_15m: +(waiting && age > 15),
    in_progress: +['dieu_phoi', 'thuc_thi'].includes(t.status),
    resolved_24h: +(t.status === 'hoan_thanh' && Date.now() - Date.parse(t.resolved_at || 0) < DAY),
    critical: +(t.status !== 'hoan_thanh' && t.priority === 1),
  };
}
function adjustSosKpi(sos, scope, codes) {
  if (!sos) return;
  const changed = [
    ...state.tickets.filter((t) => live(t) && inScope(t, scope, codes)).map((t) => [null, withPatch(t)]),
    ...fixtureTickets().filter((t) => state.patches.has(t.id) && inScope(t, scope, codes)).map((t) => [t, withPatch(t)]),
  ];
  for (const [before, after] of changed) {
    const b = before ? sosCounts(before) : {};
    const a = sosCounts(after);
    for (const k of Object.keys(a)) if (k in sos) sos[k] += a[k] - (b[k] || 0);
  }
  if (changed.length) {
    const waiting = allTickets(scope, codes, fixtureTickets().filter((t) => inScope(t, scope, codes))).filter((t) => t.status === 'moi');
    sos.oldest_waiting = waiting.reduce((m, t) => (!m || t.received_at < m ? t.received_at : m), null);
  }
}

// ---- Kịch bản thiên tai (SimulationBar) -------------------------------------------------------------------------
const FLOOD_STATION = 'CB-WL-01'; // Trạm thủy văn Cao Bằng (sông Bằng Giang)
function floodValue() {
  const st = (recordedBody('tinh', '/stations') || []).find((s) => s.id === FLOOD_STATION);
  return st?.thresholds?.bd3 != null ? Math.round((st.thresholds.bd3 + 0.45) * 100) / 100 : null;
}
// Trạm vượt BĐ III: đổi số đo mới nhất ở mọi nơi trạm xuất hiện (danh sách trạm, ô KPI, bản đồ, biểu đồ)
function floodStation(o) {
  if (state.scenario !== 'lu_quet' || o?.id !== FLOOD_STATION || !('value' in o)) return;
  const v = floodValue();
  if (v == null) return;
  if ('prev_value' in o) Object.assign(o, { prev_value: o.value, prev_time: o.time, next_level: null, next_threshold: null, eta_time: null });
  Object.assign(o, { value: v, time: state.since });
}
function triggerScenario(name) {
  if (name === state.scenario) return;
  state.scenario = name;
  state.since = nowIso();
  state.seq += 1;
  state.tickets = state.tickets.filter((t) => !t.scenario);
  state.logs = state.logs.filter((l) => !l.scenario);
  const st = (recordedBody('tinh', '/stations') || []).find((s) => s.id === FLOOD_STATION);
  if (name === 'lu_quet' && st) {
    log(`${st.name} vượt Báo động III: ${floodValue()} m (BĐ III ${st.thresholds.bd3} m)`, 'canh_bao', 'danger', { lat: st.lat, lon: st.lon, scenario: name });
  } else if (name === 'sat_lo') {
    const u = units().find((x) => x.code === 'CB-TINHTUC');
    createTicket({
      raw_message: 'Sạt lở đồi sau dãy nhà, đất đá vùi lấp 2 nhà dân, khoảng 8 người mắc kẹt, có trẻ em.',
      source: 'HOTLINE',
      reporter_phone: '0999 300 301',
      lat: u?.lat,
      lon: u?.lon,
      incident_type: 'sat_lo',
      priority: 1,
      trapped_count: 8,
      vulnerable: ['tre_em'],
      address: 'Tổ dân phố ven đồi, xã Tĩnh Túc',
    }, name);
  }
  save();
}

// ---- Xử lý từng đường dẫn sau khi có phản hồi đã ghi ------------------------------------------------------------
const pointOf = (t, keys) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [t.lon, t.lat] },
  properties: Object.fromEntries(keys.map((k) => [k, t[k] ?? null])),
});
function overlay(pathname, body, scope, codes, sp) {
  if (pathname === '/sos') return allTickets(scope, codes, body).map(output);
  if (pathname === '/dashboard/logs') {
    const mine = state.logs.filter((l) => (!l.scenario || l.scenario === state.scenario) && (scope === 'tinh' ? !codes || !l.code || codes.split(',').includes(l.code) : l.code === COMMUNE));
    const limit = Number(sp.get('limit')) || 60;
    return [...mine.map(({ code, scenario, ...l }) => l), ...body].slice(0, limit);
  }
  if (pathname === '/stations') body.forEach(floodStation);
  if (pathname === `/stations/${FLOOD_STATION}/series` && state.scenario === 'lu_quet' && Array.isArray(body.observed)) {
    body.observed.push({ time: state.since, value: floodValue() });
  }
  if (pathname === '/dashboard/kpis') {
    body.rivers?.forEach(floodStation);
    delete body.reservoirs; // dữ liệu ghi trước khi bỏ hồ chứa (docs/pham-vi-thien-tai.md)
    adjustSosKpi(body.sos, scope, codes);
    if (body.forces) {
      body.forces.on_mission = body.forces.on_mission || 55;
    }
    if (body.vehicles) {
      body.vehicles.special_active = body.vehicles.special_active || 4;
      body.vehicles.heavy_active = body.vehicles.heavy_active || 2;
      body.vehicles.active = (body.vehicles.special_active || 4) + (body.vehicles.heavy_active || 2);
    }
  }
  if (pathname === '/map/layers') {
    body.stations?.features?.forEach((f) => floodStation(f.properties));
    delete body.reservoirs;
    if (body.sos?.features && (state.tickets.length || state.patches.size)) {
      const keys = Object.keys(body.sos.features[0]?.properties || { id: 0, code: 0, incident_type: 0, priority: 0, status: 0, lat: 0, lon: 0 });
      const shown = new Set(body.sos.features.map((f) => f.properties.id));
      const tickets = allTickets(scope, codes, fixtureTickets().filter((t) => shown.has(t.id)));
      body.sos.features = tickets.filter((t) => t.status !== 'hoan_thanh' && t.lat != null).map((t) => pointOf(t, keys));
    }
  }
  return body;
}

// Bản đồ "thời điểm khác": thanh thời gian kéo theo từng giờ, đã ghi −12 … +24 giờ
function timeline(sp, scope) {
  const h = Math.max(-12, Math.min(24, Math.round(Number(sp.get('offset_h')) || 0)));
  return recordedBody(scope, `/map/timeline?offset_h=${h}`);
}

/** Điều động như backend POST /dispatch: lộ trình ước tính theo đường chim bay × 1,4, tốc độ 25 km/h. */
function dispatch(body) {
  const t = findTicket(body.ticket_id);
  const force = (recordedBody('tinh', '/resources/forces') || []).find((f) => f.id === body.force_id);
  if (!t || !force) throw new ApiError(404, 'Không tìm thấy phiếu SOS hoặc lực lượng');
  if (t.status === 'hoan_thanh') throw new ApiError(400, 'Phiếu đã hoàn thành');
  const distance = Math.round(km(force, t) * 1.4 * 10) / 10;
  const minutes = Math.max(5, Math.round((distance / 25) * 60));
  const at = nowIso();
  const order = `gia-lap-lenh-${++state.seq}`;
  const ticket = patchTicket(t.id, {
    status: 'thuc_thi',
    dispatch_id: order,
    dispatch_status: 'dang_di',
    eta: new Date(Date.now() + minutes * 60_000).toISOString(),
    progress: 0,
    distance_km: distance,
    route_safe: true,
    dispatched_at: at,
    arrived_at: null,
    force_name: force.name,
    force_phone: force.contact_phone,
    force_id: force.id,
    dispatch_supplies: body.supplies || {},
  });
  log(`LỆNH ĐIỀU ĐỘNG: ${force.name} (${body.personnel || 3} người, ${(body.vehicle_ids || []).length} phương tiện) → ${t.code}, ${distance} km, dự kiến đến sau ${minutes} phút`, 'cuu_ho', 'info', { lat: t.lat, lon: t.lon, code: t.admin_code });
  return {
    order: { id: order, status: 'dang_di', mission_expires_at: null },
    route: {
      distance_km: distance, duration_min: minutes, safe: true, hazards: [], roads: [], offroad_km: 0,
      warnings: ['Chế độ giả lập: lộ trình ước tính theo đường chim bay, không tính theo mạng đường'],
      geometry: { type: 'LineString', coordinates: [[force.lon, force.lat], [t.lon, t.lat]] },
    },
    ticket,
    notification: {
      to: force.contact_phone,
      sent: false,
      message: `[LỆNH KHẨN — GIẢ LẬP] ${t.code}: ${t.address || t.admin_name} – toạ độ ${t.lat?.toFixed(5)},${t.lon?.toFixed(5)}. Dự kiến đến sau ${minutes} phút.`,
      mission_url: null,
      mission_expires_at: null,
    },
  };
}

const notSimulated = (method, pathname) => new ApiError(
  501,
  method === 'GET'
    ? `Chế độ giả lập chưa có dữ liệu cho ${pathname}`
    : 'Chế độ giả lập không thực hiện thao tác này — tắt giả lập để thao tác trên máy chủ thật',
);

function mockForecastAreas(sp, codes) {
  const hours = Number(sp?.get('hours')) || 72;
  const now = Date.now();
  const list = [
    { code: 'CB-BACHDANG', name: 'Bạch Đằng', p10: 42.5, p50: 88.0, p90: 154.2, max_hourly_p90: 28.5, max_prob_heavy: 0.85 },
    { code: 'CB-COBA', name: 'Cô Ba', p10: 38.0, p50: 76.5, p90: 135.0, max_hourly_p90: 22.0, max_prob_heavy: 0.75 },
    { code: 'CB-TINHTUC', name: 'Tĩnh Túc', p10: 48.0, p50: 98.5, p90: 172.0, max_hourly_p90: 34.0, max_prob_heavy: 0.90 },
    { code: 'CB-BAOLAC', name: 'Bảo Lạc', p10: 35.0, p50: 72.0, p90: 128.0, max_hourly_p90: 21.0, max_prob_heavy: 0.70 },
    { code: 'CB-BAOLAM', name: 'Bảo Lâm', p10: 40.0, p50: 82.0, p90: 145.0, max_hourly_p90: 26.0, max_prob_heavy: 0.80 },
    { code: 'CB-TRUNGKHANH', name: 'Trùng Khánh', p10: 30.0, p50: 65.0, p90: 115.0, max_hourly_p90: 18.0, max_prob_heavy: 0.65 },
    { code: 'CB-QUANGHOA', name: 'Quảng Hòa', p10: 32.0, p50: 68.0, p90: 120.0, max_hourly_p90: 19.5, max_prob_heavy: 0.68 },
    { code: 'CB-NGUYENBINH', name: 'Nguyên Bình', p10: 45.0, p50: 92.0, p90: 160.0, max_hourly_p90: 30.0, max_prob_heavy: 0.88 },
    { code: 'CB-THACHAN', name: 'Thạch An', p10: 28.0, p50: 58.0, p90: 105.0, max_hourly_p90: 16.0, max_prob_heavy: 0.60 },
    { code: 'CB-HATRANG', name: 'Hà Quảng', p10: 36.0, p50: 74.0, p90: 130.0, max_hourly_p90: 23.0, max_prob_heavy: 0.72 },
  ].map((item) => ({
    ...item,
    issued_at: new Date(now - 15 * 60_000).toISOString(),
    window_from: new Date(now).toISOString(),
    window_to: new Date(now + hours * 3600_000).toISOString(),
  }));
  const filterCodes = codes ? codes.split(',') : null;
  return filterCodes ? list.filter((x) => filterCodes.includes(x.code)) : list;
}

function mockForecastSeries(code, name) {
  const base = recordedBody('tinh', '/forecast/areas/CB-BACHDANG');
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const nowMs = now.getTime();
  const series = {};
  if (base?.series) {
    for (const [model, list] of Object.entries(base.series)) {
      series[model] = list.map((item, i) => ({
        ...item,
        time: new Date(nowMs + i * 3600_000).toISOString(),
      }));
    }
  }
  return {
    unit: { code, name: name || code },
    series,
  };
}

function mockDevices(now) {
  return [
    {
      id: 'DEV-RAIN-01',
      name: 'Cảm biến đo mưa quang học V-Rain',
      station_id: 'CB-RAIN-01',
      station_name: 'Trạm đo mưa Phja Oắc (Nguyên Bình)',
      protocol: 'http',
      expected_interval_s: 600,
      last_seen_at: new Date(now - 4 * 60_000).toISOString(),
      last_value: 28.4,
      enabled: true,
      status: 'hoat_dong',
      vendor: 'Vaisala',
      station_source: 'iot',
    },
    {
      id: 'DEV-WATER-01',
      name: 'Radar đo mực nước tự động Bằng Giang',
      station_id: 'CB-WL-01',
      station_name: 'Trạm thủy văn Cao Bằng (sông Bằng Giang)',
      protocol: 'mqtt',
      expected_interval_s: 900,
      last_seen_at: new Date(now - 6 * 60_000).toISOString(),
      last_value: 18.42,
      enabled: true,
      status: 'hoat_dong',
      vendor: 'OTT HydroMet',
      station_source: 'iot',
    },
    {
      id: 'DEV-WATER-02',
      name: 'Cảm biến áp suất đáy đo mực nước sông Gâm',
      station_id: 'CB-WL-02',
      station_name: 'Trạm thủy văn Bảo Lạc (sông Gâm)',
      protocol: 'mqtt',
      expected_interval_s: 900,
      last_seen_at: new Date(now - 8 * 60_000).toISOString(),
      last_value: 12.15,
      enabled: true,
      status: 'hoat_dong',
      vendor: 'Campbell Scientific',
      station_source: 'iot',
    },
    {
      id: 'DEV-LANDSLIDE-01',
      name: 'Cụm cảm biến độ nghiêng mái taluy & độ ẩm đất',
      station_id: 'CB-SL-01',
      station_name: 'Điểm sạt trượt Đèo Khau Cốc Chà',
      protocol: 'lorawan',
      expected_interval_s: 1800,
      last_seen_at: new Date(now - 12 * 60_000).toISOString(),
      last_value: 0.42,
      enabled: true,
      status: 'hoat_dong',
      vendor: 'Geokon Inclinometer',
      station_source: 'iot',
    },
    {
      id: 'DEV-RAIN-02',
      name: 'Thùng đo mưa tự động chao lật Cô Ba',
      station_id: 'CB-RAIN-02',
      station_name: 'Trạm đo mưa xã Cô Ba (Bảo Lạc)',
      protocol: 'http',
      expected_interval_s: 600,
      last_seen_at: new Date(now - 3 * 60_000).toISOString(),
      last_value: 14.2,
      enabled: true,
      status: 'hoat_dong',
      vendor: 'Davis Instruments',
      station_source: 'iot',
    },
    {
      id: 'DEV-RAIN-03',
      name: 'Trạm đo mưa tự động Trùng Khánh',
      station_id: 'CB-RAIN-03',
      station_name: 'Trạm đo mưa Trùng Khánh',
      protocol: 'http',
      expected_interval_s: 600,
      last_seen_at: new Date(now - 180 * 60_000).toISOString(),
      last_value: 4.8,
      enabled: true,
      status: 'mat_tin_hieu',
      vendor: 'V-Rain IoT',
      station_source: 'iot',
    },
  ];
}

function mockAudit(now) {
  return [
    {
      id: 'audit-01',
      time: new Date(now - 18 * 60_000).toISOString(),
      actor_name: 'Lãnh đạo BCH tỉnh (giả lập)',
      action: 'user.create',
      target_user: 'coba_pctt',
      role: 'admin_xa',
      domain_label: 'Xã Cô Ba, Huyện Bảo Lạc',
    },
    {
      id: 'audit-02',
      time: new Date(now - 45 * 60_000).toISOString(),
      actor_name: 'Quản trị viên (giả lập)',
      action: 'user.assignment',
      target_user: 'bachdang_pctt',
      role: 'admin_xa',
      domain_label: 'Xã Bạch Đằng, Huyện Hòa An',
    },
    {
      id: 'audit-03',
      time: new Date(now - 120 * 60_000).toISOString(),
      actor_name: 'Lãnh đạo BCH tỉnh (giả lập)',
      action: 'user.update',
      target_user: 'trucban_tinh',
      role: 'truc_ban',
      domain_label: 'Toàn tỉnh Cao Bằng',
    },
    {
      id: 'audit-04',
      time: new Date(now - 360 * 60_000).toISOString(),
      actor_name: 'Quản trị viên (giả lập)',
      action: 'user.mfa_reset',
      target_user: 'tinh_trucban02',
      role: 'truc_ban',
      domain_label: 'Toàn tỉnh Cao Bằng',
    },
  ];
}

function mockCitizens(now, q) {
  const items = [
    {
      id: 'cit-01',
      phone: '0999 123 456',
      full_name: 'Triệu Thị Mai',
      admin_code: 'CB-COBA',
      admin_name: 'Xã Cô Ba, Huyện Bảo Lạc',
      created_at: new Date(now - 7 * DAY).toISOString(),
      is_active: true,
      report_count: 3,
      sos_count: 1,
      last_active_at: new Date(now - 25 * 60_000).toISOString(),
    },
    {
      id: 'cit-02',
      phone: '0999 234 567',
      full_name: 'Nông Văn Định',
      admin_code: 'CB-BACHDANG',
      admin_name: 'Xã Bạch Đằng, Huyện Hòa An',
      created_at: new Date(now - 14 * DAY).toISOString(),
      is_active: true,
      report_count: 2,
      sos_count: 0,
      last_active_at: new Date(now - 60 * 60_000).toISOString(),
    },
    {
      id: 'cit-03',
      phone: '0999 345 678',
      full_name: 'Hoàng Văn Đức',
      admin_code: 'CB-TINHTUC',
      admin_name: 'Xã Tĩnh Túc, Huyện Nguyên Bình',
      created_at: new Date(now - 20 * DAY).toISOString(),
      is_active: true,
      report_count: 1,
      sos_count: 1,
      last_active_at: new Date(now - 110 * 60_000).toISOString(),
    },
    {
      id: 'cit-04',
      phone: '0999 456 789',
      full_name: 'Bế Thị Loan',
      admin_code: 'CB-HUNGDAO',
      admin_name: 'Xã Hưng Đạo, Thành phố Cao Bằng',
      created_at: new Date(now - 30 * DAY).toISOString(),
      is_active: true,
      report_count: 4,
      sos_count: 0,
      last_active_at: new Date(now - 180 * 60_000).toISOString(),
    },
    {
      id: 'cit-05',
      phone: '0999 567 890',
      full_name: 'Đàm Văn Nam',
      admin_code: 'CB-TRUNGKHANH',
      admin_name: 'Xã Trùng Khánh',
      created_at: new Date(now - 45 * DAY).toISOString(),
      is_active: false,
      lock_reason: 'Gửi tin báo sai sự thật nhiều lần',
      report_count: 5,
      sos_count: 0,
      last_active_at: new Date(now - 24 * 3600_000).toISOString(),
    },
  ];
  const filtered = q ? items.filter((x) => x.phone.includes(q) || x.full_name.toLowerCase().includes(q.toLowerCase())) : items;
  return { items: filtered, total: filtered.length };
}

function handle(path, { method = 'GET', body, params } = {}) {
  const req = parse(path, params);
  const { pathname, sp } = req;

  // Phiên giả lập: /auth/me, /auth/refresh trả đúng vai trò đang chọn — refresh phải kèm user: SessionKeeper gọi
  // setAuth(phản hồi), thiếu user thì Shell (key = user.id) bị dựng lại liên tục, trang treo
  if (pathname === '/auth/login') {
    const name = body?.username || '';
    return demoAuth(/quan.?tri|^admin$/i.test(name) ? 'quan_tri' : /xa/i.test(name) ? 'xa' : /truc/i.test(name) ? 'tinh_truc' : 'tinh_duyet');
  }
  if (pathname === '/auth/me') return useStore.getState().auth?.user || demoAuth().user;
  if (pathname === '/auth/refresh') return { token: DEMO_TOKEN, user: useStore.getState().auth?.user || demoAuth().user };
  if (pathname === '/auth/logout') return null;

  if (method === 'POST' && pathname === '/sos') return { ...output(createTicket(body || {})), duplicate: false, possible_duplicates: [] };
  let m = pathname.match(/^\/sos\/([^/]+)$/);
  if (m && method === 'PATCH') {
    const allowed = ['status', 'priority', 'trapped_count', 'vulnerable', 'incident_type', 'address', 'notes', 'lat', 'lon'];
    return patchTicket(m[1], Object.fromEntries(Object.entries(body || {}).filter(([k]) => allowed.includes(k))));
  }
  if (m && method === 'GET') {
    const t = findTicket(m[1]);
    if (!t) throw new ApiError(404, 'Không tìm thấy phiếu SOS');
    return output(t);
  }
  m = pathname.match(/^\/sos\/([^/]+)\/resolve$/);
  if (m && method === 'POST') return patchTicket(m[1], { status: 'hoan_thanh', close_reason: null, notes: 'Đã cứu an toàn – xác nhận từ hiện trường' });
  // Đóng phiếu không cần cứu (trùng / không xác minh được / tự an toàn) — như POST /sos/{id}/close
  m = pathname.match(/^\/sos\/([^/]+)\/close$/);
  if (m && method === 'POST') {
    if (findTicket(m[1])?.status === 'hoan_thanh') throw new ApiError(409, 'Phiếu đã đóng');
    return patchTicket(m[1], { status: 'hoan_thanh', close_reason: body?.reason || 'khong_xac_minh' });
  }
  if (method === 'POST' && pathname === '/dispatch') return dispatch(body || {});
  m = pathname.match(/^\/dispatch\/([^/]+)\/(arrived|cancel)$/);
  if (m && method === 'POST') {
    const t = [...state.tickets, ...fixtureTickets()].map(withPatch).find((x) => x.dispatch_id === m[1]);
    if (!t) throw new ApiError(404, 'Không tìm thấy lệnh điều động');
    return m[2] === 'arrived'
      ? patchTicket(t.id, { dispatch_status: 'da_den', progress: 1, arrived_at: nowIso() })
      : patchTicket(t.id, { status: 'dieu_phoi', dispatch_status: 'huy' });
  }
  if (method === 'POST' && pathname === '/map/area-stats') {
    return {
      population: 2840,
      households: 710,
      subscribers: 3450,
      admin_codes: ['CB-BACHDANG'],
      sos_open: 2,
      forces: 3,
      evac_free: 160,
      hazard_zones: 1,
    };
  }
  if (method === 'POST' && pathname === '/map/route') {
    const fromLat = body?.from_lat || 22.65;
    const fromLon = body?.from_lon || 106.25;
    const toLat = body?.to_lat || 22.68;
    const toLon = body?.to_lon || 106.28;
    return {
      distance_km: 12.4,
      duration_min: 22,
      safe: true,
      hazards: [],
      roads: ['QL 3', 'ĐT 206'],
      warnings: [],
      geometry: { type: 'LineString', coordinates: [[fromLon, fromLat], [toLon, toLat]] },
    };
  }
  if (method !== 'GET') throw notSimulated(method, pathname);

  if (pathname === '/forecast/areas') {
    return mockForecastAreas(sp, req.codes);
  }
  m = pathname.match(/^\/forecast\/areas\/([^/]+)$/);
  if (m) {
    const code = m[1];
    const u = (units() || []).find((x) => x.code === code);
    return mockForecastSeries(code, u?.name);
  }
  if (pathname === '/integrations/devices') {
    return mockDevices(Date.now());
  }
  if (pathname === '/rbac/audit') {
    return mockAudit(Date.now());
  }
  if (pathname === '/citizens') {
    return mockCitizens(Date.now(), sp?.get('q'));
  }

  // Gợi ý lực lượng cho phiếu tạo trong phiên: lấy gợi ý đã ghi của phiếu cùng loại sự cố
  m = pathname.match(/^\/sos\/([^/]+)\/match$/);
  if (m && !(req.key in fixtures.tinh)) {
    const t = findTicket(m[1]);
    const same = t && fixtureTickets().find((x) => x.incident_type === t.incident_type && `/sos/${x.id}/match` in fixtures.tinh);
    if (same) return revive(recordedBody('tinh', `/sos/${same.id}/match`));
  }
  if (pathname === '/map/timeline') {
    const tl = timeline(sp, scopeOf(req.codes));
    if (tl) return revive(tl);
  }
  const hit = recorded(req);
  if (!hit) throw notSimulated(method, pathname);
  return overlay(pathname, hit.body, hit.scope, hit.scope === 'xa' ? '' : req.codes, sp);
}

/**
 * Lối vào duy nhất từ api/client.js (đọc kịch bản: SimulationBar gọi simulationEngine.triggerScenario). Trả về sau một
 * nhịp như mạng thật (không đồng bộ) — trả ngay lập tức thì chuỗi cập nhật trạng thái → render → gọi API dồn liền nhau,
 * trình duyệt không kịp vẽ.
 */
export async function simulateRequest(path, opts = {}) {
  await new Promise((resolve) => { setTimeout(resolve, 40); });
  try {
    const res = handle(path, opts);
    if ((opts.method || 'GET') !== 'GET') save();
    return res;
  } catch (e) {
    if (e.status === 501) console.warn(`[Giả lập] ${opts.method || 'GET'} ${path.split('?')[0]}: ${e.message}`);
    throw e;
  }
}

export const simulationEngine = { triggerScenario };
