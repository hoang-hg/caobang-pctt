/* Service worker của cổng công khai (README 9.4). Không import vào ứng dụng: plugin `serviceWorker` trong
 * vite.config.js điền VERSION / PRECACHE rồi xuất ra dist/sw.js; main.jsx chỉ đăng ký ở bản build.
 *
 * - Cài đặt: lưu sẵn index.html + các tệp cổng công khai cần khi mở lần đầu → lần sau mở được khi mất mạng.
 * - /assets/* (tên có mã băm, không bao giờ đổi): lấy từ bộ nhớ trước (cache-first).
 * - Trang (điều hướng) và API công khai trong PUBLIC_API: mạng trước; mạng lỗi, lỗi 5xx / 429 hoặc chậm quá TIMEOUT → bản
 *   đã lưu. Bản lưu của API mang header X-PCTT-Saved-At (thời điểm lưu) → giao diện báo "dữ liệu lưu lúc…".
 * - KHÔNG BAO GIỜ lưu: yêu cầu có Authorization (cán bộ), khác GET, khác origin, HTTP Range (/tiles/), API khác
 *   (tra cứu phiếu, vị trí người dân, đường đi…).
 */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const SHELL = `pctt-shell-${VERSION}`;
const DATA = 'pctt-data-v1'; // dữ liệu công khai, giữ qua các bản build
const PUBLIC_API =
  /^\/api\/v1\/public\/(overview|map|alerts|hotlines|forecast\/areas|reservoirs|landslides|config|report-categories)(\/[\w-]*)?$/;
// Danh sách xã, ranh giới xã / tỉnh (không cần đăng nhập) — cổng dùng cho chọn xã, lớp mưa, viền tỉnh
const PUBLIC_UNITS = /^\/api\/v1\/admin-units(\/(geojson|area))?$/;
const TIMEOUT = 6000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pctt-shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('authorization') || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  if (path.startsWith('/assets/')) {
    event.respondWith(cacheFirst(req));
  } else if (path === '/ban-nhe') {
    networkFirst(event, true, () => caches.match('/ban-nhe', { ignoreSearch: true }));
  } else if (PUBLIC_API.test(path) || PUBLIC_UNITS.test(path)) {
    networkFirst(event, true);
  } else if (req.mode === 'navigate' && !/^\/(api|tiles|ws|health)(\/|$)/.test(path)) {
    networkFirst(event, false, () => caches.match('/index.html'));
  }
});

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    const cache = await caches.open(SHELL);
    await cache.put(req, res.clone());
  }
  return res;
}

function networkFirst(event, store, fallback) {
  const req = event.request;
  const network = fetch(req);
  if (store) {
    event.waitUntil(
      network
        .then((res) => {
          // clone NGAY (đồng bộ): sau một await trang đã đọc body của res → clone() lỗi
          if (res.ok) return save(req, res.clone());
        })
        .catch(() => {}),
    );
  }
  const saved = async () => (await caches.match(req)) || (fallback && (await fallback()));
  event.respondWith(
    (async () => {
      try {
        const res = await withTimeout(network, TIMEOUT);
        // 5xx hoặc 429 (vượt giới hạn tần suất — lúc thiên tai nhiều người chung IP nhà mạng) → bản đã lưu nếu có
        return res.status < 500 && res.status !== 429 ? res : (await saved()) || res;
      } catch {
        return (await saved()) || network; // chưa có bản lưu → chờ tiếp mạng / báo lỗi mạng
      }
    })(),
  );
}

async function save(req, res) {
  const headers = new Headers(res.headers);
  headers.set('X-PCTT-Saved-At', new Date().toISOString());
  const body = await res.blob();
  const cache = await caches.open(DATA);
  await cache.put(req, new Response(body, { status: res.status, statusText: res.statusText, headers }));
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
