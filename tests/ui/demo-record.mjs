#!/usr/bin/env node
// Ghi dữ liệu cho CHẾ ĐỘ GIẢ LẬP của giao diện (frontend/src/api/simulationEngine.js — chỉ máy dev, bật chủ động).
//
// Lấy từ chính backend chạy seed demo (backend/app/seed_data.py: tên giả định, SĐT đầu số 0999) nên đúng định dạng API
// thật. Các bước:
//   1. Dựng sẵn tình huống bằng API: mở đợt thiên tai, xã Cô Ba xin tỉnh chi viện, xã nhận tin sạt lở → tỉnh điều đội,
//      xã cập nhật sơ tán, xã gửi hồ sơ dữ liệu chờ duyệt, người dân gửi phản ánh.
//   2. Mở từng trang bằng trình duyệt với tài khoản tỉnh (chihuy) và xã (admin.coba), bấm qua các thẻ.
//   3. Lưu mọi phản hồi GET /api/v1 (trừ /public) → frontend/src/api/demo/fixtures.json.
//
// CHỈ chạy với backend localhost vừa seed mới (docker compose down -v rồi up): bước 1 ghi dữ liệu vào máy chủ đó.
//   API=http://localhost:8000 UI=http://localhost:5173 node demo-record.mjs
// (UI = Vite dev trỏ tới đúng backend đó.) Chạy lại khi API đổi định dạng — chế độ giả lập trả đúng những gì đã ghi.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const API = (process.env.API || 'http://localhost:8000').replace(/\/$/, '');
const UI = (process.env.UI || 'http://localhost:5173').replace(/\/$/, '');
for (const u of [API, UI]) {
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u)) {
    console.error(`Chỉ ghi từ máy dev (localhost), không dùng máy chủ thật: ${u}`);
    process.exit(1);
  }
}
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/src/api/demo/fixtures.json');
const SUPPORT_TAG = '[Xã xin chi viện]'; // = COMMUNE_SUPPORT_TAG (frontend/src/components/rescue/rescueFacts.js)
const ACCOUNTS = { tinh: ['chihuy', 'chihuy123'], xa: ['admin.coba', 'admincoba123'] };
const COMMUNE = 'CB-COBA';

// Trang + thẻ trên địa chỉ trang; thẻ không nằm trên địa chỉ (Nguồn dữ liệu, Phân quyền…) được bấm lần lượt
const PAGES = {
  tinh: [
    '/dashboard', '/dashboard?tab=sat_lo', '/dashboard?tab=cap_xa', '/dashboard?tab=he_thong',
    '/ban-do', '/cuu-ho', '/cuu-ho?xem=danh_sach', '/cuu-ho?ky=7n', '/cuu-ho?ky=30n',
    '/canh-bao', '/canh-bao?tab=lich_su', '/canh-bao?tab=danh_ba', '/canh-bao?tab=nhat_ky',
    '/nguon-luc', '/nguon-luc?tab=vat_tu', '/nguon-luc?tab=phuong_tien',
    '/dot-thien-tai', '/phan-anh', '/nhap-du-lieu', '/nguon-du-lieu', '/phan-quyen',
  ],
  xa: [
    '/dashboard', '/dashboard?tab=tong_hop', '/dashboard?tab=sat_lo', '/ban-do', '/cuu-ho', '/cuu-ho?xem=danh_sach',
    '/canh-bao', '/canh-bao?tab=lich_su', '/canh-bao?tab=danh_ba',
    '/nguon-luc', '/nguon-luc?tab=vat_tu', '/nguon-luc?tab=phuong_tien',
    '/dot-thien-tai', '/phan-anh', '/nhap-du-lieu',
  ],
};

/** Khoá tra cứu: đường dẫn + tham số đã sắp xếp, bỏ tham số là mốc thời gian (đổi mỗi lần gọi). Cùng quy tắc với
 * fixtureKey() trong simulationEngine.js. */
const TIME_VALUE = /^\d{4}-\d{2}-\d{2}T|^\d{12,}$/;
export function fixtureKey(pathname, searchParams) {
  const kept = [...searchParams.entries()].filter(([, v]) => v !== '' && !TIME_VALUE.test(v)).sort(([a], [b]) => a.localeCompare(b));
  return kept.length ? `${pathname}?${new URLSearchParams(kept)}` : pathname;
}

async function call(token, method, p, body) {
  const form = body instanceof FormData;
  const res = await fetch(`${API}/api/v1${p}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !form ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? (form ? body : JSON.stringify(body)) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${JSON.stringify(data?.detail ?? data).slice(0, 200)}`);
  return data;
}
const login = async ([username, password]) => (await call(null, 'POST', '/auth/login', { username, password })).token;
const step = async (name, fn) => {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.log(`  ✗ ${name}: ${e.message}`);
  }
};

async function setup() {
  const tinh = await login(ACCOUNTS.tinh);
  const xa = await login(ACCOUNTS.xa);
  if ((await call(tinh, 'GET', '/sos')).some((t) => String(t.raw_message || '').startsWith(SUPPORT_TAG))) {
    console.log('Tình huống đã có trên máy chủ này — bỏ qua bước dựng (muốn dựng lại: seed mới)');
    return;
  }
  const coba = (await call(tinh, 'GET', '/admin-units?level=xa')).find((u) => u.code === COMMUNE);
  // Toạ độ trong ranh giới xã: điểm đại diện của xã, lệch vài trăm mét; máy chủ báo ngoài xã thì dùng đúng điểm đại diện
  const near = async (dLat, dLon, send) => {
    try {
      return await send(coba.lat + dLat, coba.lon + dLon);
    } catch {
      return send(coba.lat, coba.lon);
    }
  };
  const ago = (h) => new Date(Date.now() - h * 3600_000).toISOString();
  await step('Mở đợt thiên tai (bắt đầu 2 ngày trước — phiếu, lệnh từ đó tự gắn vào đợt)', () => call(tinh, 'POST', '/events', {
    name: 'Mưa lũ diện rộng tháng 10/2026 (giả lập)',
    hazard: 'lu_lut',
    started_at: ago(48),
    note: 'Đợt dựng sẵn cho chế độ giả lập trên máy dev.',
  }));
  await step('Xã Cô Ba gửi yêu cầu chi viện lên tỉnh', () => near(0.006, -0.008, (lat, lon) => call(xa, 'POST', '/sos', {
    raw_message: `${SUPPORT_TAG} Lũ quét tại khu dân cư ven suối, cách trụ sở xã khoảng 3 km. 9 người mắc kẹt trên mái nhà. `
      + 'Cần tỉnh chi viện: Xuồng / ca nô, Y tế, sơ cứu. (Yêu cầu chi viện của Chỉ huy xã Cô Ba)',
    source: 'CAN_BO',
    reporter_name: 'Chỉ huy xã Cô Ba (giả lập)',
    reporter_phone: '0999 300 101',
    lat,
    lon,
    incident_type: 'lu_quet',
    priority: 1,
    trapped_count: 9,
    vulnerable: ['nguoi_gia', 'tre_em'],
    address: 'Khu dân cư ven suối, xã Cô Ba',
    external_id: 'gia-lap-chi-vien-coba',
  })));
  let landslide = null;
  await step('Xã nhận tin sạt lở qua điện thoại', async () => {
    landslide = await near(-0.004, 0.005, (lat, lon) => call(xa, 'POST', '/sos', {
      raw_message: 'Sạt lở taluy sau nhà, đất đá lấp lối ra, 1 hộ 4 người cần di dời gấp.',
      source: 'HOTLINE',
      reporter_phone: '0999 300 102',
      lat,
      lon,
      incident_type: 'sat_lo',
      priority: 2,
      trapped_count: 4,
      vulnerable: ['nguoi_gia'],
      address: 'Đường liên thôn, xã Cô Ba',
      external_id: 'gia-lap-sat-lo-coba',
    }));
  });
  await step('Tỉnh điều đội tới điểm sạt lở ở xã Cô Ba', async () => {
    const forces = await call(tinh, 'GET', '/resources/forces');
    const force = forces.find((f) => f.org_type === 'quan_su' && f.personnel_ready >= 6) || forces.find((f) => f.personnel_ready >= 6);
    await call(tinh, 'POST', '/dispatch', { ticket_id: landslide.id, force_id: force.id, personnel: 6 });
  });
  await step('Xã cập nhật tiến độ sơ tán', () => call(xa, 'PUT', `/evacuation/${COMMUNE}`, {
    planned_households: 38,
    evacuated_households: 21,
    planned_persons: 152,
    evacuated_persons: 84,
    source: 'Báo cáo UBND xã (giả lập)',
  }));
  await step('Xã gửi hồ sơ điểm sơ tán chờ tỉnh duyệt', () => {
    const csv = `ma,ten,loai,suc_chua,dang_o,sdt_lien_he,vi_do,kinh_do,ma_xa\nDST-COBA-01,Nhà văn hóa xã Cô Ba,nha_van_hoa,120,0,0999 300 103,${coba.lat},${coba.lon},${COMMUNE}\n`;
    const form = new FormData();
    form.set('name', 'diem_so_tan');
    form.set('note', 'Bổ sung điểm sơ tán (giả lập)');
    form.set('file', new Blob([csv], { type: 'text/csv' }), 'diem-so-tan-co-ba.csv');
    return call(xa, 'POST', '/data-import/submissions', form);
  });
  const reports = [
    ['sat_lo', 'Taluy sau trường học có vết nứt mới dài khoảng 10 m, đất đá lăn xuống đường.', 0.003, 0.004, 'Đường vào trường, xã Cô Ba'],
    ['ngap_ung', 'Nước suối dâng tràn qua ngầm, xe máy không qua được, có người đứng chờ hai bên.', -0.005, -0.003, 'Ngầm tràn liên thôn, xã Cô Ba'],
  ];
  const cats = new Set((await call(null, 'GET', '/public/report-categories')).map((c) => c.code));
  for (const [i, [cat, text, dLat, dLon, address]] of reports.entries()) {
    await step(`Người dân gửi phản ánh ${i + 1}`, () => {
      const form = new FormData();
      form.set('category', cats.has(cat) ? cat : [...cats][0]);
      form.set('description', text);
      form.set('lat', String(coba.lat + dLat));
      form.set('lon', String(coba.lon + dLon));
      form.set('address', address);
      form.set('reporter_phone', `0999 300 20${i + 1}`);
      return call(null, 'POST', '/public/reports', form);
    });
  }
}

async function crawl(browser, scope) {
  const [username, password] = ACCOUNTS[scope];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh' });
  const page = await ctx.newPage();
  const got = new Map();
  const pending = new Set();
  page.on('response', (res) => {
    const u = new URL(res.url());
    if (res.request().method() !== 'GET' || !u.pathname.startsWith('/api/v1/') || u.pathname.startsWith('/api/v1/public/')) return;
    if (!res.ok() || !String(res.headers()['content-type']).includes('application/json')) return;
    const job = res.json().then((body) => got.set(fixtureKey(u.pathname.slice('/api/v1'.length), u.searchParams), body)).catch(() => {});
    pending.add(job);
    job.finally(() => pending.delete(job));
  });
  const settle = async () => {
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(800);
  };
  await page.goto(`${UI}/dang-nhap`);
  await page.getByPlaceholder('Nhập tên đăng nhập hoặc email...').fill(username);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  await settle();
  const visit = async (url) => {
    await page.goto(UI + url);
    await settle();
    // Thẻ con không nằm trên địa chỉ trang (components/common/ui.jsx Tabs)
    const tabs = page.locator('main div.border-b.overflow-x-auto > button[aria-pressed="false"]');
    for (let i = 0, n = await tabs.count(); i < n; i += 1) {
      await tabs.nth(i).click().catch(() => {});
      await settle();
    }
    // Tổng quan: biểu đồ chỉ tải khi chọn chuyên đề (mặc định chỉ "Mực nước") → bấm từng chuyên đề; bảng số liệu chi tiết
    // thu gọn sẵn → mở ra, bấm từng thẻ (phiếu SOS, kho chỉ tải khi mở)
    const segs = page.getByRole('group', { name: 'Chuyên đề biểu đồ' }).getByRole('button');
    for (let i = 0, n = await segs.count(); i < n; i += 1) {
      await segs.nth(i).click().catch(() => {});
      await settle();
    }
    const table = page.getByRole('button', { name: 'Mở bảng số liệu' });
    if (await table.count()) {
      await table.click().catch(() => {});
      await settle();
      const tableTabs = page.getByRole('tablist', { name: 'Chuyên đề của bảng' }).getByRole('tab');
      for (let i = 0, n = await tableTabs.count(); i < n; i += 1) {
        await tableTabs.nth(i).click().catch(() => {});
        await settle();
      }
    }
  };
  for (const url of PAGES[scope]) await visit(url);
  // Đợt thiên tai, hồ sơ dữ liệu: mở từng mục (báo cáo đợt, chi tiết hồ sơ)
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem('pctt_auth') || 'null')?.token);
  for (const ev of await call(token, 'GET', '/events')) await visit(`/dot-thien-tai?dot=${encodeURIComponent(ev.code)}`);
  const subs = await call(token, 'GET', '/data-import/submissions');
  for (const s of (subs.items || subs).slice(0, 3)) await visit(`/nhap-du-lieu?ho-so=${encodeURIComponent(s.code || s.id)}`);
  // Gọi thẳng trong trang những gì chỉ tải khi bấm: biểu đồ trạm (bấm trạm trên bản đồ: 24 giờ; biểu đồ thủy văn: 48
  // giờ), dự báo mưa theo xã, hộp chọn địa bàn (tình hình từng xã), sổ kho, thanh thời gian bản đồ (−12 … +24 giờ,
  // components/map/MapPanels.jsx TimeControl), gợi ý lực lượng khi điều động từng phiếu SOS
  const stations = await call(token, 'GET', '/stations');
  const tickets = scope === 'tinh' ? await call(token, 'GET', '/sos') : [];
  // Dự báo mưa 3 ngày: chuỗi của từng xã (hộp chọn xã của biểu đồ) — rỗng khi máy ghi không tới được Open-Meteo
  const areas = await call(token, 'GET', '/forecast/areas?hours=72').catch(() => []);
  const offsets = Array.from({ length: 37 }, (_, i) => i - 12).filter((h) => h !== 0);
  const extra = [
    ...stations.map((s) => `/stations/${encodeURIComponent(s.id)}/series?hours=24`),
    ...stations.filter((s) => s.type === 'muc_nuoc').map((s) => `/stations/${encodeURIComponent(s.id)}/series?hours=48`),
    `/forecast/areas/${COMMUNE}`,
    ...areas.map((a) => `/forecast/areas/${encodeURIComponent(a.code)}`),
    '/dashboard/communes',
    '/resources/items',
    '/resources/inventory-moves?limit=5000',
    ...offsets.map((h) => `/map/timeline?offset_h=${h}`),
    ...tickets.filter((t) => t.status !== 'hoan_thanh').map((t) => `/sos/${t.id}/match`),
  ];
  await page.evaluate(async ({ urls, tk }) => {
    for (const u of urls) await fetch(`/api/v1${u}`, { headers: { Authorization: `Bearer ${tk}` } }).catch(() => {});
  }, { urls: extra, tk: token });
  await settle();
  await Promise.all([...pending]);
  await ctx.close();
  return got;
}

console.log(`Ghi dữ liệu giả lập từ ${API} (giao diện ${UI})`);
console.log('1. Dựng tình huống');
await setup();
const browser = await chromium.launch();
const sets = {};
for (const scope of ['tinh', 'xa']) {
  console.log(`2. Mở các trang — tài khoản ${scope === 'tinh' ? 'cấp tỉnh' : 'cấp xã'}`);
  sets[scope] = await crawl(browser, scope);
  console.log(`   ${sets[scope].size} phản hồi`);
}
await browser.close();

// Làm gọn trước khi lưu: số thực quá 5 chữ số thập phân (toạ độ ~1 m) → 5; gợi ý khoá nguồn IoT (4 ký tự cuối khoá
// thật của máy đã ghi) → che hết; tên tài khoản seed đang đóng vai trong chế độ giả lập → đúng tên vai giả lập
// (frontend/src/api/demoUsers.js), nhật ký / phiếu khớp với người đang "đăng nhập"
const DEMO_NAMES = {
  'Hoàng Đức Chỉ': 'Lãnh đạo BCH tỉnh (giả lập)',
  'Nông Văn Trực': 'Trực ban tỉnh (giả lập)',
  'Lục Văn Xã': 'Chỉ huy xã Cô Ba (giả lập)',
};
const clean = (v, key) => {
  if (Array.isArray(v)) return v.map((x) => clean(x));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x, k)]));
  if (typeof v === 'number' && !Number.isInteger(v)) return Math.round(v * 1e5) / 1e5;
  if (typeof v === 'string') {
    if (key === 'secret_hint') return 'cbs_…(giả lập)';
    return Object.entries(DEMO_NAMES).reduce((s, [from, to]) => s.replaceAll(from, to), v);
  }
  return v;
};

// Dự báo mưa theo xã cần máy ghi tới được Open-Meteo. Lần ghi này không lấy được (danh sách rỗng / chuỗi trống) mà lần
// ghi trước có → giữ phản hồi của lần trước cho đúng khoá đó (chỉ dự báo; in ra để người chạy biết)
const KEEP = /^\/forecast\//;
const blank = (b) => (Array.isArray(b) ? !b.length : b?.series ? !Object.keys(b.series).length : false);
let prev = null;
try {
  prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
} catch { /* chưa có tệp cũ */ }
for (const scope of ['tinh', 'xa']) {
  for (const [key, i] of Object.entries(prev?.[scope] || {})) {
    const old = prev.bodies[i];
    if (KEEP.test(key) && !blank(old) && (!sets[scope].has(key) || blank(sets[scope].get(key)))) {
      sets[scope].set(key, old);
      console.log(`   giữ dự báo của lần ghi trước (${prev.recordedAt}): ${scope} ${key}`);
    }
  }
}

// Phản hồi giống hệt nhau (ranh giới xã, danh mục…) chỉ lưu một lần
const bodies = [];
const index = new Map();
const pack = (map) => Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, raw]) => {
  const body = clean(raw);
  const text = JSON.stringify(body);
  if (!index.has(text)) {
    index.set(text, bodies.length);
    bodies.push(body);
  }
  return [key, index.get(text)];
}));
const out = { recordedAt: new Date().toISOString(), tinh: pack(sets.tinh), xa: pack(sets.xa), bodies };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(out)}\n`);
console.log(`3. Đã ghi ${path.relative(process.cwd(), OUT)} — ${bodies.length} phản hồi khác nhau, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
