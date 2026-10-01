// Kiểm thử tải (k6) — README.md mục 12. Chạy trong mạng docker của stack cần thử, gọi nginx (service "frontend"):
//   docker run --rm -u 0 -v "$PWD/tests/load:/out" caobang-pctt-backend python /out/make_photo.py   # ảnh 12 MP, 1 lần
//   docker run --rm --network <project>_default -v "$PWD/tests/load:/load" grafana/k6 run /load/load.js
// Tham số (-e TÊN=giá trị): ONLY=citizens|officials|reports · PEAK (người dân, mặc định 500) · OFFICIALS (60)
//   · REPORTS=1 (thêm người dân gửi phản ánh 1 ảnh/giây) · DUR (thời lượng kịch bản cán bộ / phản ánh, 120s)
// Cần stack có DEMO_MODE=true (tài khoản demo cho cán bộ). Mỗi người dùng ảo một IP riêng qua X-Forwarded-For
// (nginx tin proxy trong dải nội bộ) nên giới hạn tần suất vẫn hoạt động như thật.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE || 'http://frontend';
const ONLY = __ENV.ONLY || '';
const PEAK = Number(__ENV.PEAK || 500);
const DUR = __ENV.DUR || '120s';
const WITH_REPORTS = __ENV.REPORTS === '1' || ONLY === 'reports';
const PHOTO = WITH_REPORTS ? open('/load/photo.jpg', 'b') : null;

const all = {
  citizens: {
    executor: 'ramping-vus', exec: 'citizen', startVUs: 0, gracefulRampDown: '5s',
    stages: [{ duration: '30s', target: PEAK / 2 }, { duration: '30s', target: PEAK }, { duration: '60s', target: PEAK }],
  },
  officials: { executor: 'constant-vus', exec: 'official', vus: Number(__ENV.OFFICIALS || 60), duration: DUR },
  reports: {
    executor: 'constant-arrival-rate', exec: 'report', rate: 1, timeUnit: '1s', duration: DUR, preAllocatedVUs: 10, maxVUs: 60,
  },
};
const scenarios = {};
for (const [name, sc] of Object.entries(all)) {
  if (ONLY ? name === ONLY || (name === 'reports' && WITH_REPORTS) : name !== 'reports' || WITH_REPORTS) scenarios[name] = sc;
}

// Ngưỡng đạt: p95 người dân < 1 s (tra cứu vị trí < 1,5 s), cán bộ < 1,5 s, lỗi < 1%
const thresholds = {};
if (scenarios.citizens) {
  Object.assign(thresholds, {
    'http_req_failed{scenario:citizens}': ['rate<0.01'],
    'http_req_duration{scenario:citizens,kind:static}': ['p(95)<1000'],
    'http_req_duration{scenario:citizens,kind:api}': ['p(95)<1000'],
    'http_req_duration{scenario:citizens,kind:locate}': ['p(95)<1500'],
  });
}
if (scenarios.officials) {
  Object.assign(thresholds, {
    'http_req_failed{scenario:officials}': ['rate<0.01'],
    'http_req_duration{scenario:officials}': ['p(95)<1500'],
  });
}
if (scenarios.reports) {
  Object.assign(thresholds, {
    'http_req_failed{scenario:reports}': ['rate<0.05'],
    'http_req_duration{scenario:reports}': ['p(95)<5000'],
  });
}

export const options = { scenarios, thresholds, discardResponseBodies: true, summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'] };

const ipOf = (n) => `100.${64 + ((n >> 16) & 63)}.${(n >> 8) & 255}.${n & 255}`; // dải CGNAT, không thuộc proxy tin cậy
const hdr = (extra = {}) => ({ 'X-Forwarded-For': ipOf(__VU), 'Accept-Encoding': 'gzip', ...extra });

// Toạ độ ngẫu nhiên QUANH các trung tâm xã (không rơi ra ngoài tỉnh như khi lấy ngẫu nhiên trong hình chữ nhật)
const CENTERS = [[22.748, 106.232], [22.95, 105.672], [22.605, 106.505], [22.845, 106.06], [22.905, 105.775],
  [22.85, 106.705], [22.752, 106.465], [22.722, 106.182], [22.82, 105.7], [22.61, 106.372], [22.585, 106.02], [22.662, 106.282],
  [22.8, 106.405], [22.69, 106.6], [22.625, 106.075], [22.815, 105.895], [22.676, 106.25], [22.64, 105.87]]; // tâm xã (seed)

let assets = null;
export function citizen() {
  const h = hdr();
  const idx = http.get(`${BASE}/`, { headers: h, tags: { kind: 'static' }, responseType: 'text' });
  if (!assets) assets = [...String(idx.body).matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  if (Math.random() < 0.3) {
    // người mới vào: tải JS/CSS ban đầu (người cũ đã có trong cache trình duyệt)
    http.batch(assets.map((a) => ['GET', `${BASE}${a}`, null, { headers: h, tags: { kind: 'static' } }]));
  }
  const api = ['overview', 'map', 'alerts', 'hotlines', 'forecast/areas?hours=24', 'reservoirs', 'landslides', 'reports', 'config'];
  const res = http.batch(api.map((p) => ['GET', `${BASE}/api/v1/public/${p}`, null, { headers: h, tags: { kind: 'api' } }]));
  check(res[0], { 'overview 200': (r) => r.status === 200 });
  const [clat, clon] = CENTERS[Math.floor(Math.random() * CENTERS.length)];
  const lat = (clat + (Math.random() - 0.5) * 0.02).toFixed(5);
  const lon = (clon + (Math.random() - 0.5) * 0.02).toFixed(5);
  const loc = http.get(`${BASE}/api/v1/public/locate?lat=${lat}&lon=${lon}`, { headers: h, tags: { kind: 'locate' } });
  check(loc, { 'locate 200': (r) => r.status === 200 });
  sleep(8 + Math.random() * 4);
}

// Tài khoản demo có quyền xem dashboard (monitoring.view + resource.view)
const ACCOUNTS = [['admin', 'admin123'], ['chihuy', 'chihuy123'], ['trucban', 'trucban123'], ['admin.tinh', 'admintinh123'],
  ['admin.coba', 'admincoba123'], ['canbo.coba', 'coba123']];
let token = null;
export function official() {
  if (!token) {
    sleep(Math.random() * 10); // đăng nhập rải rác
    const [u, p] = ACCOUNTS[__VU % ACCOUNTS.length];
    const r = http.post(`${BASE}/api/v1/auth/login`, JSON.stringify({ username: u, password: p }),
      { headers: hdr({ 'Content-Type': 'application/json' }), tags: { kind: 'login' }, responseType: 'text' });
    token = r.json('token');
  }
  const h = hdr({ Authorization: `Bearer ${token}` });
  const paths = ['/dashboard/kpis', '/stations', '/dashboard/rainfall', '/dashboard/landslide-risk', '/dashboard/supplies',
    '/dashboard/logs', '/sos', '/map/layers', '/resources/summary'];
  const res = http.batch(paths.map((p) => ['GET', `${BASE}/api/v1${p}`, null, { headers: h, tags: { kind: 'dashboard' } }]));
  check(res, { 'dashboard 200': (rs) => rs.every((r) => r.status === 200) });
  sleep(5);
}

export function report() {
  const n = Math.floor(Math.random() * 1e9);
  const body = {
    category: 'ngap',
    description: 'Nước ngập sâu qua đầu gối, cần hỗ trợ di dời người già',
    lat: '22.666', lon: '106.258',
    reporter_phone: `09${String(n).padStart(8, '0').slice(0, 8)}`,
    photos: http.file(PHOTO, 'anh.jpg', 'image/jpeg'),
  };
  const r = http.post(`${BASE}/api/v1/public/reports`, body,
    { headers: { 'X-Forwarded-For': ipOf(50000 + (n % 60000)) }, tags: { kind: 'report' }, timeout: '60s' });
  check(r, { 'report 201': (x) => x.status === 201 });
}
