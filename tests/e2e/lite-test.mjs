// Kiểm thử bản nhẹ /ban-nhe, service worker và manifest (PWA) — chạy qua nginx của frontend (cần service frontend).
//   node tests/e2e/lite-test.mjs [http://localhost:8080]
// Cần DEMO_MODE=true (tài khoản trucban / chihuy để phát 1 cảnh báo thử).
const ROOT = process.argv[2] || 'http://localhost:8080';
const API = ROOT + '/api/v1';
let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures += 1;
};
async function call(method, path, body, token) {
  const res = await fetch(API + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const login = async (u, p) => (await call('POST', '/auth/login', { username: u, password: p })).data?.token;
const page = async (query = '') => {
  const res = await fetch(`${ROOT}/ban-nhe${query}`);
  return { status: res.status, headers: res.headers, html: await res.text() };
};

// ---------------------------------------------------------------- Bản nhẹ toàn tỉnh
const all = await page();
const bytes = Buffer.byteLength(all.html);
check('/ban-nhe trả HTML', all.status === 200 && all.headers.get('content-type')?.startsWith('text/html'));
check('Dưới 50 KB, không JavaScript / ảnh', bytes < 50_000 && !/<script|<img|<link/i.test(all.html), `${bytes} byte`);
check('Có nút gọi 112 và đường dây nóng', all.html.includes('href="tel:112"') && all.html.includes('Đường dây nóng'));
const codes = [...all.html.matchAll(/<option value="(CB-[^"]+)"/g)].map((m) => m[1]);
check('Chọn được 56 xã / phường', codes.length === 56, `${codes.length}`);
check('nginx cache trang bản nhẹ', (await page()).headers.get('x-cache-status') === 'HIT');
const gz = await fetch(`${ROOT}/ban-nhe`, { headers: { 'Accept-Encoding': 'gzip' } });
check('Nén gzip khi truyền', gz.headers.get('content-encoding') === 'gzip');

// ---------------------------------------------------------------- Theo xã
const code = codes.includes('CB-THUCPHAN') ? 'CB-THUCPHAN' : codes[0];
const one = await page(`?xa=${code}`);
check('Trang theo xã: chọn sẵn xã, có mức nguy cơ + điểm sơ tán',
  one.html.includes(`value="${code}" selected`) && /Nguy cơ|NGUY CƠ/.test(one.html) && one.html.includes('Điểm sơ tán tại'));
const longest = [...codes].sort((a, b) => b.length - a.length).slice(0, 3);
const longPages = await Promise.all(longest.map((c) => page(`?xa=${c}`)));
check('Mã xã dài nhất vẫn mở được', longPages.every((p, i) => p.status === 200 && p.html.includes(`value="${longest[i]}" selected`)),
  longest.join(', '));
const bad = await page('?xa=%3Cscript%3E');
check('Mã xã lạ → trang toàn tỉnh, không phản chiếu đầu vào', bad.status === 200 && !bad.html.includes('<script') && !bad.html.includes(' selected>'));

// ---------------------------------------------------------------- Cảnh báo mới hiện ngay
const maker = await login('trucban', 'trucban123');
const checker = await login('chihuy', 'chihuy123');
const title = `Thử bản nhẹ ${Date.now()}`;
const br = await call('POST', '/alerts/broadcasts', {
  title, message_body: 'Nội dung thử nghiệm hiển thị trên trang bản nhẹ cho mạng yếu', admin_codes: [code],
  channels: ['SMS'], severity: 'do',
}, maker);
const ap = await call('POST', `/alerts/broadcasts/${br.data?.id}/approve`, { pin: '2468' }, checker);
check('Phát cảnh báo thử', ap.status === 200, br.data?.code);
// tham số lạ để bỏ qua cache 10 giây của nginx; cache Redis đã bị xoá khi phê duyệt
const fresh = await page(`?xa=${code}&t=${Date.now()}`);
check('Cảnh báo vừa phát hiện ngay trên bản nhẹ của xã', fresh.html.includes(title));
check('Cảnh báo mức đỏ → nguy cơ cao', fresh.html.includes('NGUY CƠ CAO'));

// ---------------------------------------------------------------- Service worker & manifest
const sw = await fetch(`${ROOT}/sw.js`);
const swText = await sw.text();
check('sw.js không cache dài', sw.status === 200 && /no-cache/.test(sw.headers.get('cache-control') || ''), sw.headers.get('cache-control'));
const precache = JSON.parse(swText.match(/const PRECACHE = (\[.*?\]);/)?.[1] || '[]');
check('sw.js có danh sách lưu sẵn + phiên bản', precache.length > 5 && !swText.includes('__VERSION__'), `${precache.length} tệp`);
check('Không lưu sẵn API / trang cán bộ', precache.every((p) => p === '/index.html' || /^\/(assets\/|[\w-]+\.(svg|png|webmanifest))/.test(p)));
const missing = [];
for (const p of precache) if ((await fetch(ROOT + p)).status !== 200) missing.push(p);
check('Mọi tệp lưu sẵn tồn tại', missing.length === 0, missing.join(', '));
check('Lưu sẵn chunk cổng công khai', precache.some((p) => /\/assets\/PublicPortal-[\w-]+\.js$/.test(p)));
const manifest = await (await fetch(`${ROOT}/manifest.webmanifest`)).json().catch(() => null);
check('manifest hợp lệ', manifest?.start_url === '/' && manifest?.icons?.some((i) => i.sizes === '512x512'));
const index = await (await fetch(`${ROOT}/`)).text();
check('index.html gắn manifest', index.includes('rel="manifest"'));

console.log(failures ? `\n${failures} kiểm thử LỖI` : '\nTất cả kiểm thử bản nhẹ / PWA đều PASS');
process.exit(failures ? 1 : 0);
