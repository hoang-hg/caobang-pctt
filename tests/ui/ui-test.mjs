#!/usr/bin/env node
// Kiểm thử giao diện bằng trình duyệt thật (Playwright / Chromium) trên khổ MÁY TÍNH và ĐIỆN THOẠI: bấm thử các màn hình
// chính như người dùng thật — cổng công khai (gửi phản ánh, tra cứu), màn hình cán bộ (mọi trang, điều động, duyệt phản
// ánh, nhập dữ liệu bằng form + chọn vị trí trên bản đồ), link nhiệm vụ của trưởng nhóm hiện trường (/nhiem-vu), công cụ
// bản đồ (tìm đường, khoanh vùng khi mất mạng / máy chủ lỗi). Mỗi bước bắt: lỗi JavaScript trên trang (màn hình trắng),
// API trả 5xx, trang tràn ngang trên điện thoại.
//
//   cd tests/ui && npm ci && npx playwright install chromium
//   node ui-test.mjs [http://localhost:8080]
// Biến môi trường:
//   UI_READONLY=1   chỉ xem (không gửi phản ánh / điều động / duyệt) — chạy được trên máy chủ thật trước go-live
//   UI_USER, UI_PASS  tài khoản cán bộ (mặc định admin / admin123 của dữ liệu mẫu). Tài khoản bắt buộc 2 lớp (Cấp 1–2 ở
//                     máy thật) không dùng được → máy thật: tạo 1 tài khoản Cấp 3 riêng để thử, khoá sau khi thử; bước
//                     ngoài quyền của Cấp 3 được ghi "bỏ qua"
//   UI_SHOTS=thư_mục  lưu ảnh chụp màn hình bước lỗi (CI tải lên làm artifact)
import fs from 'node:fs';
import { chromium, devices } from 'playwright';

const ROOT = (process.argv[2] || 'http://localhost:8080').replace(/\/$/, '');
const READONLY = process.env.UI_READONLY === '1';
const STAFF = { user: process.env.UI_USER || 'admin', pass: process.env.UI_PASS || 'admin123' };
const SHOTS = process.env.UI_SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

// Vị trí giả lập của điện thoại (nút "Lấy vị trí của tôi"): TP Cao Bằng
const GPS = { latitude: 22.6657, longitude: 106.2522 };
const VIEWPORTS = [
  { name: 'Máy tính', opts: { viewport: { width: 1366, height: 800 } } },
  { name: 'Điện thoại', opts: { ...devices['Pixel 7'] }, mobile: true },
];
const STAFF_PAGES = [
  ['/dashboard', 'Tổng quan'],
  ['/dashboard?tab=ho_chua', 'Tổng quan · hồ chứa & xả lũ'],
  ['/dashboard?tab=sat_lo', 'Tổng quan · sạt lở & đường đèo'],
  ['/dashboard?tab=cap_xa', 'Tổng quan · cấp xã/phường'],
  ['/dashboard?tab=he_thong', 'Tổng quan · hệ thống & dữ liệu'],
  ['/ban-do', 'Bản đồ giám sát'],
  ['/cuu-ho', 'Điều hành cứu hộ'],
  ['/phan-anh', 'Phản ánh người dân'],
  ['/nguon-luc', 'Vật tư & Lực lượng'],
  ['/canh-bao', 'Cảnh báo & Hotline'],
  ['/nguon-du-lieu', 'Nguồn dữ liệu & IoT'],
  ['/nhap-du-lieu', 'Nhập dữ liệu'],
  ['/phan-quyen', 'Phân quyền'],
];
const PUBLIC_TABS = [
  'Bản đồ & Cảnh báo', 'Hồ chứa & Xả lũ', 'Sạt trượt & Đường đèo', 'Tra cứu tiến độ', 'Mực nước sông suối',
  'Điểm sơ tán an toàn', 'Đường dây nóng', 'Cẩm nang an toàn',
];

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures += 1;
};
// Lỗi ngoài luồng (VD handler route chạy dở sau khi bước đã gỡ route) → ghi thành 1 kiểm tra lỗi rồi chạy tiếp, không làm
// dừng cả bộ kiểm thử giữa chừng (mất kết quả các bước sau)
process.on('unhandledRejection', (e) => check('Lỗi ngoài luồng của bộ kiểm thử', false, String(e?.message || e).split('\n')[0]));

/**
 * Handler route an toàn: bước kết thúc (`unroute`) đúng lúc một yêu cầu còn chạy dở trong handler (trang tự tải lại theo chu
 * kỳ) → Playwright đã trả yêu cầu đó theo mặc định, `fulfill` / `abort` ném "Route is already handled!" ngoài luồng và làm
 * dừng cả tiến trình (CI 11/10/2026, bước ô SOS nhấp nháy). Lỗi trong handler: yêu cầu chưa được trả → cho đi tiếp; đã trả
 * → bỏ qua.
 */
const safeRoute = (handler) => async (route, request) => {
  try {
    await handler(route, request);
  } catch {
    await route.continue().catch(() => {});
  }
};
const slug =(s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^\w]+/g, '-').slice(0, 80);

/** Theo dõi lỗi của trang: lỗi JavaScript không bắt (React sập → màn hình trắng) và API trả 5xx. */
function watch(page) {
  const problems = [];
  page.on('pageerror', (e) => problems.push(`lỗi JS: ${e.message.split('\n')[0]}`));
  page.on('response', (r) => {
    if (r.status() >= 500 && new URL(r.url()).pathname.startsWith('/api/')) {
      problems.push(`API ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
    }
  });
  return problems;
}

/** Một bước kiểm thử: đạt khi hàm không lỗi / hết giờ VÀ trang không phát sinh lỗi JS hay API 5xx trong lúc chạy. */
async function step(ctx, name, fn) {
  const { page, problems, vp } = ctx;
  const label = `[${vp.name}] ${name}`;
  problems.length = 0;
  const before = failures;
  // Đóng hộp thoại còn mở từ bước trước (bước lỗi giữa chừng) → không chặn thao tác của bước sau
  for (let i = 0; i < 3 && (await page.getByRole('dialog').count()); i += 1) await page.keyboard.press('Escape');
  try {
    const extra = await fn();
    await page.waitForTimeout(150); // lỗi phát sinh ngay sau thao tác cuối
    check(label, problems.length === 0, problems.length ? problems.slice(0, 3).join(' | ') : extra || '');
  } catch (e) {
    check(label, false, `${e.message.split('\n')[0]}${problems.length ? ' | ' + problems.slice(0, 2).join(' | ') : ''}`);
  }
  if (SHOTS && failures > before) {
    await page.screenshot({ path: `${SHOTS}/${slug(label)}.png` }).catch(() => {});
  }
}

/** Độ tràn ngang (px) của trang và của vùng nội dung <main> — khác 0 trên điện thoại = phải kéo ngang mới đọc hết.
 * Chrome điện thoại gặp nội dung rộng hơn màn hình thì THU NHỎ trang (innerWidth > screen.width) — khi đó
 * scrollWidth − innerWidth vẫn là 0, phải so thêm innerWidth với bề rộng màn hình (lỗi "Tôi đang ở đâu?" 10/2026). */
const overflowX = (page) => page.evaluate(() => {
  const main = document.querySelector('main');
  return Math.max(
    document.documentElement.scrollWidth - window.innerWidth,
    main ? main.scrollWidth - main.clientWidth : 0,
    window.innerWidth - screen.width,
  );
});

/** Hộp thoại: đo chính hộp thoại (vượt mép phải / nội dung phải cuộn ngang), không tính trang bên dưới. */
const dialogOverflowX = (dialog) => dialog.evaluate((el) => Math.max(
  el.getBoundingClientRect().right - window.innerWidth,
  ...[el, ...el.children].map((c) => c.scrollWidth - c.clientWidth),
));

async function expectNoOverflow(ctx, where, dialog = null) {
  if (!ctx.vp.mobile) return;
  const px = dialog ? await dialogOverflowX(dialog) : await overflowX(ctx.page);
  if (px > 2) throw new Error(`${where}: tràn ngang ${px}px trên điện thoại`);
}

/** Bản đồ phải thật sự có chỗ hiển thị: bố cục sai trên điện thoại có thể ép khung bản đồ còn 0px (vẫn "có" bản đồ). */
async function expectMapShown(page, where) {
  const h = await page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('.leaflet-container')]
    .map((el) => el.getBoundingClientRect().height)));
  if (h < 200) throw new Error(`${where}: khung bản đồ chỉ cao ${Math.round(h)}px`);
  return Math.round(h);
}

/** Chờ nội dung trang cán bộ tải xong (các trang tải lười — lazy chunk). */
const waitMain = (page) => page.waitForFunction(() => (document.querySelector('main')?.innerText || '').trim().length > 60,
  null, { timeout: 20_000 });

const visible = (loc) => loc.filter({ visible: true }).first();

// ================================================================ Cổng công khai (không đăng nhập)
async function publicPortal(ctx) {
  const { page, vp } = ctx;
  let trackCode = null;

  await step(ctx, 'Cổng công khai mở được, bản đồ hiển thị', async () => {
    const mapData = page.waitForResponse((r) => r.url().includes('/api/v1/public/map'), { timeout: 20_000 });
    await page.goto(`${ROOT}/cong-khai`);
    await page.locator('.leaflet-container').first().waitFor({ state: 'attached', timeout: 20_000 });
    await mapData;
    await page.waitForTimeout(1000); // vẽ điểm lên bản đồ
    const h = await expectMapShown(page, '/cong-khai');
    await expectNoOverflow(ctx, '/cong-khai');
    return `bản đồ cao ${h}px, ${await page.locator('.leaflet-marker-icon').count()} điểm`;
  });

  await step(ctx, 'Mở được mọi tab của cổng công khai', async () => {
    for (const tab of PUBLIC_TABS) {
      await visible(page.getByRole('button', { name: tab })).click();
      await page.waitForTimeout(400);
      await expectNoOverflow(ctx, `tab "${tab}"`);
    }
    await visible(page.getByRole('button', { name: 'Bản đồ & Cảnh báo' })).click();
    return `${PUBLIC_TABS.length} tab`;
  });

  await step(ctx, '"Tôi đang ở đâu?": kết quả theo vị trí, chỉ đường tới điểm sơ tán (điện thoại không tràn ngang)', async () => {
    await page.goto(`${ROOT}/cong-khai`);
    await page.getByRole('button', { name: /Tôi đang ở đâu/ }).first().click();
    const go = page.getByRole('button', { name: 'Chỉ đường', exact: true }).first();
    await go.waitFor({ timeout: 20_000 });
    await expectNoOverflow(ctx, '"Tôi đang ở đâu?"');
    await go.click(); // trước đây trên điện thoại khối cảnh báo đè lên nút → không bấm được
    await page.getByText(/Lộ trình sơ tán|Tuyến sơ tán|chim bay/).first().waitFor({ timeout: 20_000 });
    return 'chỉ đường được';
  });

  if (!READONLY) {
    // Gửi + theo dõi là một bước (nút "Theo dõi tiến độ" nằm trong hộp thoại gửi thành công)
    await step(ctx, 'Gửi phản ánh hiện trường (form + vị trí) → nhận mã tra cứu → theo dõi tiến độ', async () => {
      await visible(page.getByRole('button', { name: 'Gửi phản ánh' })).click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      await dialog.locator('textarea').fill(`Kiểm thử giao diện (${vp.name}): nước ngập qua đường liên thôn khoảng 30cm`);
      if (vp.mobile) {
        await dialog.getByRole('button', { name: 'Lấy vị trí của tôi' }).click(); // GPS giả lập của điện thoại
      } else {
        await dialog.locator('.leaflet-container').click(); // chấm vị trí giữa bản đồ (trong tỉnh)
      }
      await dialog.getByText(/Vị trí sự việc: \d+\.\d{4}, \d+\.\d{4}/).waitFor({ timeout: 10_000 });
      await expectNoOverflow(ctx, 'form gửi phản ánh', dialog);
      await dialog.getByRole('button', { name: 'Gửi phản ánh ngay' }).click();
      await dialog.getByText('Đã tiếp nhận phản ánh', { exact: true }).waitFor({ timeout: 20_000 });
      trackCode = (await dialog.innerText()).match(/PA-\d+-[A-Z]{6}/)?.[0];
      if (!trackCode) throw new Error('không thấy mã tra cứu PA-…-XXXXXX sau khi gửi');
      await page.getByRole('button', { name: 'Theo dõi tiến độ phiếu này' }).click();
      await page.getByText('Tiến độ xử lý điều hành tác chiến').waitFor({ timeout: 15_000 });
      await expectNoOverflow(ctx, 'kết quả tra cứu');
      return trackCode;
    });
  }

  await step(ctx, 'Tra cứu mã không tồn tại → báo không tìm thấy', async () => {
    await visible(page.getByRole('button', { name: 'Tra cứu tiến độ' })).click();
    await page.getByLabel('Mã phiếu').fill('PA-9999999');
    await page.getByLabel('Số điện thoại đã dùng khi gửi').fill('0900000000');
    await page.getByRole('button', { name: 'Tra cứu', exact: true }).click();
    await page.getByText('Không tìm thấy thông tin phù hợp').waitFor({ timeout: 10_000 });
  });

  await step(ctx, 'Bản nhẹ /ban-nhe (mạng yếu) mở được', async () => {
    const res = await page.goto(`${ROOT}/ban-nhe`);
    if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
    await page.getByText(/Cao Bằng/).first().waitFor();
    await expectNoOverflow(ctx, '/ban-nhe');
    return `${Math.round((await res.body()).length / 1024)} KB`;
  });
  return trackCode;
}

// ================================================================ Màn hình cán bộ
async function staff(ctx, trackCode) {
  const { page, vp } = ctx;
  let missionUrl = null; // link nhiệm vụ của lệnh vừa phát (bước điều động)

  await step(ctx, 'Đăng nhập cán bộ', async () => {
    await page.goto(`${ROOT}/dang-nhap`);
    await page.getByPlaceholder('Nhập tên đăng nhập hoặc email...').fill(STAFF.user);
    await page.getByPlaceholder('••••••••').fill(STAFF.pass);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    await waitMain(page);
  });

  for (const [path, label] of STAFF_PAGES) {
    await step(ctx, `Trang "${label}" (${path}) hiển thị đầy đủ`, async () => {
      await page.goto(`${ROOT}${path}`);
      await waitMain(page);
      await page.waitForTimeout(800); // biểu đồ / bản đồ vẽ xong
      if (path === '/ban-do') await expectMapShown(page, path);
      await expectNoOverflow(ctx, path);
    });
  }

  // Thiết kế B: bảng nổi không che bản đồ (điện thoại trước đây chỉ thấy 3%); điện thoại có thanh ngón cái Lớp · Cảnh báo ·
  // Báo SOS · Thời gian · Gọi 112, mỗi nút mở bảng trượt từ đáy; máy tính có bảng Cảnh báo khẩn cấp và chú giải
  await step(ctx, 'Bản đồ giám sát: bảng nổi không che bản đồ; thanh ngón cái (điện thoại) / bảng cảnh báo, chú giải (máy tính)', async () => {
    await page.goto(`${ROOT}/ban-do`);
    await page.locator('.leaflet-container').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    const free = await page.evaluate(() => {
      const m = document.querySelector('.leaflet-container').getBoundingClientRect();
      let ok = 0;
      let all = 0;
      for (let i = 0; i < 12; i += 1) {
        for (let j = 0; j < 12; j += 1) {
          const x = m.left + ((i + 0.5) * m.width) / 12;
          const y = m.top + ((j + 0.5) * m.height) / 12;
          if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
          all += 1;
          const el = document.elementFromPoint(x, y);
          if (el?.closest('.leaflet-container') && !el.closest('.leaflet-control')) ok += 1;
        }
      }
      return Math.round((100 * ok) / Math.max(all, 1));
    });
    if (free < (vp.mobile ? 80 : 50)) throw new Error(`bảng nổi che bản đồ: chỉ thấy ${free}%`);
    if (vp.mobile) {
      const bar = page.getByRole('navigation', { name: 'Thao tác nhanh' });
      await bar.getByRole('button', { name: /^Lớp/ }).click();
      await page.getByRole('region', { name: 'Lớp dữ liệu bản đồ' }).waitFor({ timeout: 5_000 });
      await page.keyboard.press('Escape');
    } else {
      await page.getByText('Cảnh báo khẩn cấp').first().waitFor({ timeout: 10_000 });
      await page.getByRole('button', { name: 'Chú giải' }).click();
      await page.getByText(/Thang màu rủi ro/).first().waitFor({ timeout: 5_000 });
      await page.getByRole('button', { name: 'Ẩn chú giải' }).click();
    }
    await expectNoOverflow(ctx, 'Bản đồ giám sát');
    return `bản đồ thấy ${free}%`;
  });

  if (vp.mobile) {
    await step(ctx, 'Menu điều hướng trên điện thoại mở / chuyển trang được', async () => {
      await page.goto(`${ROOT}/dashboard`);
      await waitMain(page);
      await page.getByRole('button', { name: 'Mở danh mục điều hướng' }).click();
      await visible(page.getByRole('link', { name: 'Điều hành cứu hộ' })).click();
      await page.waitForURL(/\/cuu-ho/);
      await waitMain(page);
    });
  }

  // Báo cáo nhanh trên Tổng quan tạo phiếu SOS thật (POST /sos) → chỉ mở, qua bước chọn địa điểm rồi huỷ, không gửi
  await step(ctx, 'Tổng quan: "Báo cáo nhanh" mở được, qua bước địa điểm, không tràn (không gửi)', async () => {
    await page.goto(`${ROOT}/dashboard`);
    await waitMain(page);
    // Điện thoại: nút nằm ở thanh thao tác dưới cùng ("Báo SOS", vùng ngón cái); máy tính: trên thanh chỉ huy
    const open = vp.mobile
      ? page.getByRole('navigation', { name: 'Thao tác nhanh' }).getByRole('button', { name: 'Báo SOS' })
      : visible(page.getByRole('button', { name: 'Báo cáo nhanh', exact: true }));
    if (!(await open.count())) return 'bỏ qua: tài khoản không có quyền tạo phiếu SOS';
    await open.click();
    const dialog = page.getByRole('dialog');
    // Bấm "Tiếp" khi chưa chọn → lỗi hiện ngay dưới ô (form không khoá nút mà không nói vì sao)
    await dialog.getByRole('button', { name: 'Tiếp', exact: true }).click();
    await dialog.getByText('Chọn loại sự cố').waitFor();
    await dialog.getByRole('button', { name: 'Sạt lở', exact: true }).click();
    await dialog.getByRole('button', { name: 'Tiếp', exact: true }).click(); // không lẫn với loại "Tiếp tế"
    await dialog.getByText('Xã / phường *').waitFor();
    await expectNoOverflow(ctx, 'hộp thoại Báo cáo nhanh', dialog);
    await dialog.getByRole('button', { name: 'Huỷ', exact: true }).click();
  });

  // Báo cáo văn bản (PDF định dạng chuẩn, thiết kế A): chỉ dựng PDF ở trình duyệt, không ghi gì lên máy chủ. Kiểm font tiếng
  // Việt được nhúng (chữ tìm / sao chép được) — cũng là kiểm nginx phục vụ tệp font và CSP không chặn tải font
  await step(ctx, 'Tổng quan: "Văn bản" — báo cáo PDF định dạng chuẩn qua 3 bước, nhúng font tiếng Việt', async () => {
    await page.goto(`${ROOT}/dashboard`);
    await waitMain(page);
    await page.getByRole('button', { name: 'Soạn báo cáo văn bản định dạng chuẩn (PDF)' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Tiếp', exact: true }).click();
    await dialog.getByRole('button', { name: 'Tiếp', exact: true }).click();
    await dialog.getByLabel(/Kèm phụ lục/).uncheck(); // không chụp màn hình → nhanh
    await expectNoOverflow(ctx, 'hộp thoại Báo cáo văn bản', dialog);
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      dialog.getByRole('button', { name: 'Xuất PDF', exact: true }).click(),
    ]);
    const buf = fs.readFileSync(await dl.path());
    const pdf = buf.toString('latin1');
    const pages = (pdf.match(/\/Type\s*\/Page[^s]/g) || []).length;
    if (!/\/FontFile2/.test(pdf) || !/Tinos/.test(pdf) || !/\/ToUnicode/.test(pdf)) {
      throw new Error('PDF không nhúng font tiếng Việt — chữ không tìm / sao chép được');
    }
    if (!pages) throw new Error('PDF không có trang nào');
    return `${pages} trang · ${Math.round(buf.length / 1024)} KB · ${dl.suggestedFilename()}`;
  });

  // Tab Hồ chứa / Sạt lở không tải được (giả lập mất kết nối tới 2 API này) → báo rõ, KHÔNG hiện "TRỰC TIẾP", "0 hồ xả",
  // "Không có hồ xả lũ lớn" hay "Không tìm thấy điểm nguy cơ…" (khẳng định sai là an toàn)
  await step(ctx, 'Tổng quan: tab Hồ chứa / Sạt lở không tải được → báo rõ, không khẳng định "an toàn"', async () => {
    const apis = ['**/api/v1/dashboard/reservoirs**', '**/api/v1/dashboard/landslides**'];
    for (const a of apis) await page.route(a, safeRoute((r) => r.abort('failed')));
    try {
      await page.goto(`${ROOT}/dashboard?tab=ho_chua`);
      await page.getByText('Không tải được số liệu hồ chứa').waitFor({ timeout: 25_000 });
      let text = await page.locator('main').innerText();
      if (/TRỰC TIẾP|Không có hồ xả lũ lớn/.test(text)) throw new Error('tab Hồ chứa vẫn khẳng định "an toàn" khi không tải được');
      await expectNoOverflow(ctx, 'tab Hồ chứa (lỗi)');
      await page.goto(`${ROOT}/dashboard?tab=sat_lo`);
      await page.getByText('Không tải được danh sách điểm đen sạt lở').waitFor({ timeout: 25_000 });
      text = await page.locator('main').innerText();
      if (/Không tìm thấy điểm nguy cơ/.test(text)) throw new Error('tab Sạt lở báo "không tìm thấy" khi không tải được');
    } finally {
      for (const a of apis) await page.unroute(a);
    }
  });

  // Bảng tác chiến có thẻ Hồ chứa (tìm / lọc / phân trang / xuất Excel như các thẻ khác); tab Hồ chứa hiện 9 thẻ rồi "Xem
  // thêm", hồ khẩn luôn ở đầu. Nhân bản danh sách hồ ngay trong trình duyệt (không ghi gì lên máy chủ) để luôn có > 9 thẻ
  await step(ctx, 'Tổng quan: bảng tác chiến có thẻ Hồ chứa; tab Hồ chứa hiện 9 thẻ + "Xem thêm", hồ khẩn lên đầu', async () => {
    await page.goto(`${ROOT}/dashboard`);
    await waitMain(page);
    const table = page.locator('section', { hasText: 'Bảng tác chiến theo chuyên đề' }).first();
    await table.getByRole('tablist', { name: 'Chuyên đề của bảng' }).getByRole('tab', { name: /Hồ chứa/ }).click();
    const rows = table.locator(vp.mobile ? 'ul[aria-label="Hồ chứa & xả lũ"] > li' : 'tbody tr');
    await rows.first().or(table.getByText('Chưa có hồ chứa trong vùng đang xem')).waitFor({ timeout: 20_000 });
    const inTable = await rows.count();
    if (!inTable) return 'bỏ qua: chưa có hồ chứa';
    if (!(await table.getByText(/Mực nước \/ MNDBT/i).count())) throw new Error('thẻ Hồ chứa thiếu cột Mực nước / MNDBT');
    const [xl] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      table.getByRole('button', { name: 'Excel', exact: true }).click(),
    ]);
    if (!/^bang-tac-chien-reservoirs-.*\.xlsx$/.test(xl.suggestedFilename())) throw new Error(`tệp Excel lạ: ${xl.suggestedFilename()}`);

    const RANK = { xa_khan_cap: 0, xa_dieu_tiet: 1, chua_co_so_lieu: 2, binh_thuong: 3 };
    const status = {};
    const api = '**/api/v1/dashboard/reservoirs**';
    await page.route(api, safeRoute(async (route) => {
      const res = await route.fetch();
      const json = await res.json();
      const base = json.reservoirs || [];
      const times = Math.ceil(10 / Math.max(base.length, 1));
      json.reservoirs = Array.from({ length: times }, (_, i) => base.map((r) => ({ ...r, id: `${r.id}-${i}`, name: `${r.name} · ${i + 1}` }))).flat();
      for (const r of json.reservoirs) status[r.name] = r.status_code;
      await route.fulfill({ response: res, json });
    }));
    try {
      await page.goto(`${ROOT}/dashboard?tab=ho_chua`);
      await page.getByText(/Đang hiện 9\/\d+ hồ/).waitFor({ timeout: 20_000 });
      const titles = (await page.locator('main h3').allInnerTexts()).map((t) => t.trim()).filter((t) => t in status);
      const rank = (n) => RANK[status[n]] ?? 2;
      const shown = titles.slice(0, 9).map(rank);
      const want = Object.keys(status).map(rank).sort((a, b) => a - b).slice(0, 9);
      if (shown.join() !== want.join()) throw new Error(`9 thẻ đầu chưa xếp hồ khẩn lên đầu: ${shown.join(',')} (cần ${want.join(',')})`);
      const more = page.getByRole('button', { name: /^Xem thêm \d+ hồ$/ });
      if (vp.mobile && (await more.evaluate((el) => el.getBoundingClientRect().height)) < 44) throw new Error('nút "Xem thêm" thấp hơn 44 px');
      await more.click();
      const total = Object.keys(status).length;
      await page.waitForFunction(([n, names]) => [...document.querySelectorAll('main h3')].filter((h) => names.includes(h.textContent.trim())).length >= Math.min(n, 18),
        [total, Object.keys(status)], { timeout: 10_000 });
      await expectNoOverflow(ctx, 'tab Hồ chứa (Xem thêm)');
      return `${inTable} hồ trong bảng · tab: 9/${total} → Xem thêm`;
    } finally {
      await page.unroute(api);
    }
  });

  // Thiết kế A.2: ô SOS nhấp nháy đỏ khi có phiếu chờ quá 15 phút chưa có lực lượng tiếp nhận — kể cả khi chưa phiếu nào
  // quá hạn theo cấp (cấp 3 hạn 60 phút). Sửa phản hồi KPI ngay trong trình duyệt để có đúng trường hợp đó
  await step(ctx, 'Tổng quan: ô SOS nhấp nháy khi có phiếu chờ quá 15 phút chưa có đội (chưa quá hạn theo cấp)', async () => {
    const kpis = '**/api/v1/dashboard/kpis**';
    await page.route(kpis, safeRoute(async (route) => {
      const res = await route.fetch();
      const json = await res.json();
      json.sos = { ...json.sos, overdue: 0, critical: 0, no_team_15m: 2 };
      await route.fulfill({ response: res, json });
    }));
    try {
      await page.goto(`${ROOT}/dashboard`);
      const tile = page.locator('[aria-label="Chỉ số nhanh"] > *').nth(2);
      await tile.getByText('2 chờ quá 15′').waitFor({ timeout: 20_000 });
      const st = await tile.evaluate((el) => ({ ring: el.className.includes('ring-danger'), blink: !!el.querySelector('[class*="animate-blink"]') }));
      if (!st.ring || !st.blink) throw new Error(`ô SOS chưa nhấp nháy đỏ: ${JSON.stringify(st)}`);
    } finally {
      await page.unroute(kpis);
    }
  });

  // Thiết kế A.3 "Hydrograph & Vận hành hồ chứa": dưới biểu đồ thủy văn của trạm có hồ trên cùng sông (bản trình diễn: trạm
  // Cao Bằng – sông Bằng Giang) có biểu đồ lưu lượng xả của các hồ đó, cùng trục thời gian (vạch "Hiện tại" thẳng hàng)
  await step(ctx, 'Tổng quan: biểu đồ thủy văn kèm vận hành hồ chứa cùng sông, cùng trục thời gian', async () => {
    await page.goto(`${ROOT}/dashboard`);
    await waitMain(page);
    if (!(await page.locator('[aria-label="Chọn trạm mực nước"]').count())) return 'bỏ qua: chưa có trạm mực nước';
    const sec = page.locator('section', { hasText: 'Thủy văn – mực nước' }).first();
    const title = sec.getByText(/Vận hành hồ chứa trên sông/);
    try {
      await title.waitFor({ timeout: 20_000 });
    } catch (e) {
      if (READONLY) return 'bỏ qua: trạm đầu không có hồ trên cùng sông';
      throw e;
    }
    const nowX = await sec.evaluate((el) => [...el.querySelectorAll('.recharts-wrapper')].map((wr) => {
      const line = [...wr.querySelectorAll('.recharts-reference-line line')].find((l) => l.getAttribute('x1') === l.getAttribute('x2'));
      return line ? Math.round(+line.getAttribute('x1') + wr.getBoundingClientRect().left) : null;
    }));
    if (nowX.length < 2 || nowX[0] == null || nowX[0] !== nowX[1]) throw new Error(`vạch "Hiện tại" lệch giữa 2 biểu đồ: ${nowX.join(' / ')}`);
    await expectNoOverflow(ctx, 'khối Thủy văn');
    return await title.innerText();
  });

  // Phân quyền 3 cấp: chọn Cấp quyết định phạm vi (Cấp 3 → 1 xã; Cấp 1–2 → toàn tỉnh) và ô PIN (chỉ Cấp 1–2). Không lưu.
  await step(ctx, 'Tạo tài khoản: Cấp 3 chọn 1 xã, không PIN; Cấp 2 toàn tỉnh, có PIN (không lưu)', async () => {
    await page.goto(`${ROOT}/phan-quyen`);
    await waitMain(page);
    const create = visible(page.getByRole('button', { name: 'Tạo tài khoản công vụ' }));
    await create.waitFor({ timeout: READONLY ? 5_000 : 15_000 }).catch((e) => { if (!READONLY) throw e; });
    if (READONLY && !(await create.count())) return 'bỏ qua: tài khoản không quản lý tài khoản (Cấp 3)';
    await create.click();
    const dialog = page.getByRole('dialog');
    const level = dialog.getByLabel('Cấp', { exact: true });
    // Danh sách cấp tải từ API sau khi hộp thoại mở (điện thoại chậm hơn) → chờ có lựa chọn Cấp 3 rồi mới đọc
    await level.locator('option', { hasText: 'Cấp 3 · Quản trị xã/phường' }).waitFor({ state: 'attached' });
    const levels = (await level.locator('option').allTextContents()).filter((o) => o.startsWith('Cấp'));
    // Cấp 1 (tài khoản mặc định của kiểm thử) thấy đủ 3 cấp; Cấp 2 chỉ thấy Cấp 3 (chỉ tạo cấp dưới mình)
    if (!levels.includes('Cấp 3 · Quản trị xã/phường') || (!READONLY && levels.length !== 3)) {
      throw new Error(`các cấp được tạo: ${levels.join(' | ')}`);
    }
    await level.selectOption({ label: 'Cấp 3 · Quản trị xã/phường' });
    const scope = dialog.getByLabel('Phạm vi', { exact: true });
    await scope.locator('option').nth(50).waitFor({ state: 'attached' }); // danh sách 56 xã cũng tải từ API
    const communes = await scope.locator('option').count();
    if (communes < 50) throw new Error(`chỉ có ${communes - 1} xã để chọn`);
    if (await dialog.getByText('PIN phê duyệt cảnh báo').count()) throw new Error('Cấp 3 không được có ô PIN');
    if (levels.includes('Cấp 2 · Quản trị tỉnh')) {
      await level.selectOption({ label: 'Cấp 2 · Quản trị tỉnh' });
      await dialog.getByText('Toàn tỉnh Cao Bằng').waitFor();
      await dialog.getByText('PIN phê duyệt cảnh báo').waitFor();
    }
    await expectNoOverflow(ctx, 'hộp thoại tạo tài khoản', dialog);
    await dialog.getByRole('button', { name: 'Huỷ' }).click();
    return `${levels.length} cấp, ${communes - 1} xã`;
  });

  await step(ctx, READONLY ? 'Mở hộp thoại điều động (không phát lệnh)' : 'Điều động: chọn lực lượng → phát lệnh → báo chưa gửi cho đội', async () => {
    await page.goto(`${ROOT}/cuu-ho`);
    await waitMain(page);
    const btn = visible(page.getByRole('button', { name: 'Điều phối' }));
    await btn.waitFor({ timeout: READONLY ? 5_000 : 15_000 }).catch((e) => { if (!READONLY) throw e; });
    if (READONLY && !(await btn.count())) return 'bỏ qua: không có phiếu chờ xử lý';
    await btn.click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText(/Lệnh điều động – SOS-/).waitFor();
    await dialog.getByRole('radio').first().waitFor({ timeout: 20_000 }); // danh sách lực lượng gần nhất
    await expectNoOverflow(ctx, 'hộp thoại điều động', dialog);
    if (READONLY) {
      await dialog.getByRole('button', { name: 'Huỷ' }).click();
      return 'chỉ xem';
    }
    await dialog.getByRole('radio').first().check();
    // Lệnh điều động 2 bước: Lực lượng → Vật tư & xác nhận (tóm tắt lệnh) → Phát lệnh
    await dialog.getByRole('button', { name: /^Tiếp/ }).click();
    await dialog.getByText('Tóm tắt lệnh — kiểm tra trước khi phát').waitFor({ timeout: 5_000 });
    await dialog.getByRole('button', { name: 'Phát lệnh khẩn cấp' }).click();
    await dialog.getByText(/Đã ghi lệnh điều động SOS-/).waitFor({ timeout: 20_000 });
    // Chưa tích hợp SMS / Push → phải nói rõ hệ thống CHƯA gửi tin cho đội
    const text = await dialog.innerText();
    if (!/chưa gửi tin cho đội|Đã gửi lệnh tới/.test(text)) throw new Error('không nêu trạng thái gửi lệnh cho đội');
    // Link nhiệm vụ cho trưởng nhóm: mã sau dấu # (không vào log máy chủ) — mở thử ở bước sau
    missionUrl = await dialog.getByLabel('Link nhiệm vụ').inputValue();
    if (!/\/nhiem-vu#[\w-]{20,}$/.test(missionUrl)) throw new Error(`link nhiệm vụ sai dạng: ${missionUrl}`);
    await expectNoOverflow(ctx, 'kết quả điều động', dialog);
    const km = text.match(/([\d.]+) km/)?.[1];
    await dialog.getByRole('button', { name: 'Đóng', exact: true }).last().click();
    return `${km} km`;
  });

  if (!READONLY) {
    await step(ctx, 'Link nhiệm vụ của trưởng nhóm: xem điểm SOS, chỉ đường → báo đã đến hiện trường', async () => {
      if (!missionUrl) throw new Error('bước điều động không cho link nhiệm vụ');
      // Theo địa chỉ đang thử (PUBLIC_BASE_URL của máy chủ có thể khác); trang không dùng phiên đăng nhập của cán bộ
      await page.goto(`${ROOT}/nhiem-vu#${missionUrl.split('#')[1]}`);
      await page.getByText('Lệnh cứu hộ khẩn').waitFor({ timeout: 20_000 });
      const maps = await page.getByRole('link', { name: 'Chỉ đường tới điểm SOS' }).getAttribute('href');
      if (!/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=[\d.]+,[\d.]+/.test(maps)) throw new Error(`link chỉ đường sai: ${maps}`);
      await expectNoOverflow(ctx, '/nhiem-vu');
      await page.getByRole('button', { name: 'Đã đến hiện trường' }).click();
      await page.getByText(/Đã báo đến hiện trường lúc/).waitFor({ timeout: 15_000 });
      return (await page.locator('header').first().innerText()).match(/SOS-\d+/)?.[0];
    });
  }

  await step(ctx, READONLY ? 'Mở hộp thoại duyệt phản ánh (không duyệt)' : 'Duyệt phản ánh: nội dung công khai đã che, vị trí làm tròn', async () => {
    await page.goto(`${ROOT}/phan-anh`);
    await waitMain(page);
    // Phản ánh vừa gửi ở bước cổng công khai (nếu có), không thì phản ánh chờ duyệt đầu tiên
    const code = trackCode?.replace(/-[A-Z]{6}$/, '');
    const card = code ? page.locator('.card', { hasText: code }).first() : page.locator('.card', { hasText: 'Chờ duyệt' }).first();
    const approve = visible(card.getByRole('button', { name: 'Duyệt công khai' }));
    await approve.waitFor({ timeout: READONLY ? 5_000 : 15_000 }).catch((e) => { if (!READONLY) throw e; });
    if (READONLY && !(await approve.count())) return 'bỏ qua: không có phản ánh chờ duyệt';
    await approve.click();
    const dialog = page.getByRole('dialog');
    const pub = dialog.getByLabel(/Nội dung công khai/);
    await pub.waitFor();
    if ((await pub.inputValue()).trim().length < 10) throw new Error('chưa gợi ý sẵn nội dung công khai');
    const exact = dialog.getByRole('checkbox', { name: /vị trí chính xác/ });
    if (await exact.isChecked()) throw new Error('"vị trí chính xác" không được chọn sẵn');
    await expectNoOverflow(ctx, 'hộp thoại duyệt', dialog);
    if (READONLY) {
      await dialog.getByRole('button', { name: 'Huỷ' }).click();
      return 'chỉ xem';
    }
    await dialog.getByRole('button', { name: 'Xác nhận' }).click();
    await dialog.waitFor({ state: 'detached', timeout: 15_000 });
    return code;
  });

  await step(ctx, 'Nhập dữ liệu bằng form: điền bản ghi, chọn vị trí trên bản đồ, kiểm tra', async () => {
    await page.goto(`${ROOT}/nhap-du-lieu`);
    await waitMain(page);
    const ds = visible(page.getByRole('navigation', { name: 'Loại dữ liệu' }).getByRole('button', { name: /Điểm nguy hiểm/ }));
    await ds.waitFor({ timeout: READONLY ? 5_000 : 15_000 }).catch((e) => { if (!READONLY) throw e; });
    if (READONLY && !(await ds.count())) return 'bỏ qua: tài khoản không nhập / gửi loại dữ liệu này';
    await ds.click();
    await page.getByRole('button', { name: 'Điền trực tiếp' }).click();
    const rec = page.locator('fieldset', { hasText: 'Bản ghi 1' });
    await rec.waitFor();
    // Điền theo ví dụ của từng trường (placeholder "VD …"); ô chọn → lựa chọn đầu tiên
    for (const input of await rec.locator('input[placeholder^="VD "]').all()) {
      const ex = (await input.getAttribute('placeholder')).slice(3);
      if (ex && !(await input.inputValue())) await input.fill(ex);
    }
    for (const sel of await rec.locator('select').all()) {
      if (!(await sel.inputValue())) {
        const values = await sel.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
        if (values.length) await sel.selectOption(values[0]);
      }
    }
    await rec.getByRole('button', { name: 'Chọn vị trí trên bản đồ' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('.leaflet-container').waitFor();
    await page.waitForTimeout(800); // bản đồ phóng tới xã đã chọn
    await dialog.locator('.leaflet-container').click();
    await dialog.getByRole('button', { name: 'Dùng vị trí này' }).click();
    await rec.getByText(/\d+\.\d{5}, \d+\.\d{5}/).waitFor();
    await expectNoOverflow(ctx, 'form nhập dữ liệu');
    await page.getByRole('button', { name: 'Kiểm tra dữ liệu' }).click();
    await page.getByText('Tổng dòng').waitFor({ timeout: 20_000 });
    return (await page.locator('main').innerText()).match(/Hợp lệ\s*(\d+)/)?.[0] || '';
  });
}

// ================================================================ Điện thoại nhỏ 360 px (Galaxy S8 / dòng A phổ thông)
// Màn hình hẹp nhất cán bộ hiện trường hay dùng: mọi thẻ của Tổng quan và form Báo cáo nhanh (mở từ thanh dưới cùng)
// không tràn ngang. Chỉ xem, không gửi gì.
const SMALL_PHONE = { name: 'Điện thoại 360px', opts: { ...devices['Galaxy S8'] }, mobile: true };
async function smallPhone(ctx) {
  const { page } = ctx;
  await step(ctx, 'Đăng nhập cán bộ', async () => {
    await page.goto(`${ROOT}/dang-nhap`);
    await page.getByPlaceholder('Nhập tên đăng nhập hoặc email...').fill(STAFF.user);
    await page.getByPlaceholder('••••••••').fill(STAFF.pass);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    await waitMain(page);
  });
  for (const [path, label] of STAFF_PAGES.filter(([p]) => p.startsWith('/dashboard'))) {
    await step(ctx, `Trang "${label}" không tràn ngang ở 360 px`, async () => {
      await page.goto(`${ROOT}${path}`);
      await waitMain(page);
      await page.waitForTimeout(800); // biểu đồ / bản đồ vẽ xong
      await expectNoOverflow(ctx, path);
    });
  }
  await step(ctx, 'Thanh dưới cùng: "Báo SOS" mở form 3 bước, không tràn ở 360 px (không gửi)', async () => {
    await page.goto(`${ROOT}/dashboard`);
    await waitMain(page);
    const sos = page.getByRole('navigation', { name: 'Thao tác nhanh' }).getByRole('button', { name: 'Báo SOS' });
    if (!(await sos.count())) return 'bỏ qua: tài khoản không có quyền tạo phiếu SOS';
    await sos.click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Sạt lở', exact: true }).click();
    await dialog.getByRole('button', { name: 'Tiếp', exact: true }).click();
    await dialog.getByText('Xã / phường *').waitFor();
    await expectNoOverflow(ctx, 'hộp thoại Báo cáo nhanh', dialog);
    await dialog.getByRole('button', { name: 'Huỷ', exact: true }).click();
  });
}

// ================================================================ Máy tính bảng / laptop nhỏ (640–1280 px)
// Thanh trên cùng không tràn ngang (trước 10/2026 tràn 7–185 px ở 640–1024 px, ô tìm kiếm bị ép mất) và luôn mở được bộ
// lọc xã/phường: từ 1024 px nằm trên thanh, hẹp hơn nằm trong menu ☰. Mở thẳng trang, không bấm gì trước → nhãn "Bấm để
// bật chuông SOS" còn hiện (trường hợp chật nhất). Chỉ xem.
const TABLET = { name: 'Máy tính bảng', opts: { viewport: { width: 820, height: 1180 }, hasTouch: true }, mobile: false };
async function tablet(ctx) {
  const { page } = ctx;
  await step(ctx, 'Đăng nhập cán bộ', async () => {
    await page.goto(`${ROOT}/dang-nhap`);
    await page.getByPlaceholder('Nhập tên đăng nhập hoặc email...').fill(STAFF.user);
    await page.getByPlaceholder('••••••••').fill(STAFF.pass);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  });
  for (const width of [640, 820, 1024, 1280]) {
    await step(ctx, `Tổng quan ${width} px: thanh trên cùng không tràn, mở được bộ lọc xã/phường`, async () => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${ROOT}/dashboard`);
      await waitMain(page);
      const px = await page.evaluate(() => {
        const header = document.querySelector('header');
        return Math.max(document.documentElement.scrollWidth - window.innerWidth, header.scrollWidth - header.clientWidth);
      });
      if (px > 2) throw new Error(`thanh trên cùng tràn ngang ${px}px`);
      const filter = page.locator('[title="Lọc dữ liệu theo địa phương"]');
      if (await visible(filter).count()) return 'bộ lọc trên thanh trên cùng';
      await page.getByRole('button', { name: /Mở danh mục điều hướng/ }).click();
      await visible(filter).waitFor({ timeout: 5_000 });
      await page.getByRole('button', { name: 'Đóng menu' }).first().click();
      return 'bộ lọc trong menu ☰';
    });
  }
}

// ================================================================ Màn hình đầu theo thiết bị (lãnh đạo nắm tình hình trong vài giây)
// Không cuộn vẫn thấy: dải tình huống, đủ 6 ô KPI (không bị thanh đáy che), bản đồ (laptop / iPad), "Việc chờ quyết định"
// (laptop). Chỉ <main> cuộn — trang không được dài ra ngoài khung (10/2026: caption ẩn của bảng làm cả ứng dụng trôi lên
// khi cuộn hết, lộ khoảng trắng). Chỉ xem.
const FIRST_SCREEN = { name: 'Màn hình đầu', opts: { viewport: { width: 1366, height: 768 } }, mobile: false };
const SCREENS = [
  ['Laptop 1366×768', 1366, 768, { map: true, decisions: true }],
  ['Laptop 1440×900', 1440, 900, { map: true, decisions: true }],
  ['iPad ngang 1180×820', 1180, 820, { map: true }],
  ['iPad dọc 820×1180', 820, 1180, { map: true }],
  ['Điện thoại 390×844', 390, 844, {}],
  ['Điện thoại 360×740', 360, 740, {}],
];
async function firstScreen(ctx) {
  const { page } = ctx;
  await step(ctx, 'Đăng nhập cán bộ', async () => {
    await page.goto(`${ROOT}/dang-nhap`);
    await page.getByPlaceholder('Nhập tên đăng nhập hoặc email...').fill(STAFF.user);
    await page.getByPlaceholder('••••••••').fill(STAFF.pass);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  });
  for (const [label, width, height, need] of SCREENS) {
    const parts = ['dải tình huống', '6 KPI', need.map && 'bản đồ', need.decisions && 'việc chờ quyết định'].filter(Boolean).join(', ');
    await step(ctx, `${label}: không cuộn vẫn thấy ${parts}; chỉ vùng nội dung cuộn`, async () => {
      await page.setViewportSize({ width, height });
      await page.goto(`${ROOT}/dashboard`);
      await waitMain(page);
      await page.locator('[aria-label="Chỉ số nhanh"] > *').nth(5).waitFor();
      await page.waitForTimeout(800); // bản đồ / biểu đồ vẽ xong
      const m = await page.evaluate(() => {
        const vh = window.innerHeight;
        const nav = document.querySelector('nav[aria-label="Thao tác nhanh"]');
        const navTop = nav && nav.getBoundingClientRect().height ? nav.getBoundingClientRect().top : vh; // thanh đáy che phần dưới
        const tiles = [...document.querySelectorAll('[aria-label="Chỉ số nhanh"] > *')];
        const map = document.querySelector('.leaflet-container');
        const dec = document.querySelector('[aria-label="Việc chờ quyết định"]');
        const strip = document.querySelector('[role="status"]');
        const main = document.querySelector('main');
        return {
          pageExtra: document.documentElement.scrollHeight - vh,
          wideBy: main ? main.scrollWidth - main.clientWidth : 0,
          tiles: tiles.length,
          kpiBottom: Math.round(Math.max(...tiles.map((t) => t.getBoundingClientRect().bottom))),
          visibleBottom: Math.round(navTop),
          mapVisible: map ? Math.round(Math.min(navTop, map.getBoundingClientRect().bottom) - map.getBoundingClientRect().top) : 0,
          decisionTop: dec ? Math.round(dec.getBoundingClientRect().top) : null,
          stripTop: strip ? Math.round(strip.getBoundingClientRect().top) : null,
          vh,
        };
      });
      const bad = [
        m.pageExtra > 1 && `cả trang dài thêm ${m.pageExtra}px ngoài khung (phải chỉ <main> cuộn)`,
        m.wideBy > 1 && `nội dung tràn ngang ${m.wideBy}px`,
        m.tiles !== 6 && `có ${m.tiles} ô KPI`,
        m.kpiBottom > m.visibleBottom && `ô KPI bị che / cắt (đáy ${m.kpiBottom}px > ${m.visibleBottom}px)`,
        need.map && m.mapVisible < 120 && `bản đồ chỉ thấy ${m.mapVisible}px`,
        need.decisions && (m.decisionTop == null || m.decisionTop > m.vh - 60) && `"Việc chờ quyết định" ở ${m.decisionTop}px`,
        (m.stripTop == null || m.stripTop > 200) && 'không thấy dải tình huống ở đầu trang',
      ].filter(Boolean);
      if (bad.length) throw new Error(bad.join('; '));
      return `KPI đáy ${m.kpiBottom}/${m.visibleBottom}px${need.map ? ` · bản đồ thấy ${m.mapVisible}px` : ''}`;
    });
  }
  // Màn hình lớn phòng điều hành: link ?trinh-chieu=1 (xoay vòng 15 giây — mức nhỏ nhất) → chỉ còn nội dung, nền tối,
  // tự sang chuyên đề kế tiếp; Esc trả lại thanh trên. Chỉ xem.
  await step(ctx, 'Chế độ trình chiếu: ẩn thanh trên / menu, nền tối, tự chuyển chuyên đề; Esc thoát', async () => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${ROOT}/dashboard?trinh-chieu=1&xoay=15`);
    await waitMain(page);
    await page.locator('[aria-label="Chỉ số nhanh"] > *').nth(5).waitFor();
    if (await page.locator('header').count()) throw new Error('vẫn còn thanh trên');
    if (!(await page.evaluate(() => document.documentElement.classList.contains('dark')))) throw new Error('chưa chuyển nền tối');
    await page.waitForURL(/tab=ho_chua/, { timeout: 25_000 });
    await page.keyboard.press('Escape');
    await page.locator('header').waitFor({ timeout: 5_000 });
    return 'tự sang Hồ chứa sau 15 giây';
  });
}

// ================================================================ Bản đồ cho người quản lý (trang B) — laptop, iPad, điện thoại
// 6 chỉ số "Tình hình" thấy ngay (2 cột trong bảng cảnh báo / 1 hàng / 1 hàng vuốt ngang ô 44 px); tab Điểm nóng đứng đầu,
// xếp Đỏ → Cam → Vàng; chế độ xem "Tình hình" bớt điểm trên bản đồ, "Tác nghiệp" trả lại như cũ; máy cảm ứng: mọi vùng chạm
// của trang ≥ 44 px (tính cả vùng chạm vô hình .touch-hit của đầu trang). Chỉ xem — chế độ xem chỉ lưu trên máy.
const MANAGER_DEVICES = [
  ['Laptop 1366×768', { viewport: { width: 1366, height: 768 } }, 'grid'],
  ['iPad ngang', devices['iPad Pro 11 landscape'], 'grid'],
  ['iPad dọc', devices['iPad Pro 11'], 'row'],
  ['Điện thoại 360', devices['Galaxy S8'], 'scroll'],
];
const HOT_LEVEL = { Đỏ: 3, Cam: 2, Vàng: 1 };
const LAYOUT_NAME = { grid: '2 cột trong bảng cảnh báo', row: '1 hàng 6 ô', scroll: '1 hàng vuốt ngang, ô 44 px' };

async function managerMap(ctx, layout) {
  const { page, vp } = ctx;
  const kpis = page.locator('section[aria-label^="Tình hình"]').first();
  const compact = layout !== 'grid';
  const markers = () => page.locator('.leaflet-marker-pane .leaflet-marker-icon').count();
  await step(ctx, `Mở Bản đồ: 6 chỉ số "Tình hình" (${LAYOUT_NAME[layout]}), không tràn ngang`, async () => {
    await page.goto(`${ROOT}/dang-nhap`);
    await page.getByPlaceholder('Nhập tên đăng nhập hoặc email...').fill(STAFF.user);
    await page.getByPlaceholder('••••••••').fill(STAFF.pass);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    await page.goto(`${ROOT}/ban-do`);
    await kpis.waitFor({ timeout: 20_000 });
    await page.locator('.leaflet-marker-pane .leaflet-marker-icon').first().waitFor({ timeout: 20_000 });
    await page.waitForTimeout(800);
    const r = await kpis.evaluate((s) => {
      const tiles = [...s.querySelectorAll('[title]')]; // ô chỉ số (nút hoặc ô chỉ hiện số) đều có title
      const box = tiles.map((t) => t.getBoundingClientRect());
      const strip = tiles[0]?.parentElement;
      return {
        n: tiles.length,
        cols: new Set(box.map((b) => Math.round(b.left))).size,
        rows: new Set(box.map((b) => Math.round(b.top))).size,
        minH: Math.round(Math.min(...box.map((b) => b.height))),
        scrolls: strip ? strip.scrollWidth > strip.clientWidth : false,
        first: tiles[0]?.innerText.replace(/\s+/g, ' ') || '',
      };
    });
    const bad = [
      r.n !== 6 && `có ${r.n} chỉ số`,
      layout === 'grid' && r.cols !== 2 && `${r.cols} cột`,
      layout === 'row' && r.rows !== 1 && `${r.rows} hàng`,
      layout === 'scroll' && (!r.scrolls || r.minH < 44) && `hàng không vuốt được hoặc ô thấp (${r.minH}px)`,
    ].filter(Boolean);
    if (bad.length) throw new Error(bad.join('; '));
    if (vp.mobile) await expectNoOverflow(ctx, 'Bản đồ (người quản lý)');
    return `ô đầu: ${r.first}`;
  });
  await step(ctx, 'Tab Điểm nóng đứng đầu, xếp Đỏ → Cam → Vàng; chế độ xem "Tình hình" bớt điểm, "Tác nghiệp" trả lại như cũ', async () => {
    const bar = page.getByRole('navigation', { name: 'Thao tác nhanh' });
    if (compact) await bar.getByRole('button', { name: /^Cảnh báo/ }).click();
    const tabs = await page.locator('button[aria-pressed]').filter({ hasText: /^(Điểm nóng|Phiếu SOS|Cảm biến) \(\d+\)$/ }).allInnerTexts();
    if (!/^Điểm nóng/.test(tabs[0] || '')) throw new Error(`tab đầu: ${tabs[0] || 'không có'}`);
    await page.getByRole('button', { name: /^Điểm nóng \(/ }).first().click();
    const levels = await page.locator('button[aria-label$="Xem trên bản đồ"]').filter({ has: page.locator('span.chip') })
      .evaluateAll((els, map) => els.map((e) => map[e.querySelector('span.chip').textContent.trim()] ?? 0), HOT_LEVEL);
    if (levels.some((x, i) => i > 0 && levels[i - 1] < x)) throw new Error(`điểm nóng không xếp theo mức: ${levels.join(',')}`);
    if (!levels.length) await page.getByText('Không có điểm nóng trong vùng đang xem').waitFor({ timeout: 5_000 });
    if (compact) await page.keyboard.press('Escape');
    // Chế độ xem: trên bản đồ (máy tính, iPad) — điện thoại trong bảng Lớp
    if (layout === 'scroll') await bar.getByRole('button', { name: /^Lớp/ }).click();
    const modes = page.getByRole('group', { name: 'Chế độ xem bản đồ' }).first();
    const before = await markers();
    await modes.getByRole('button', { name: 'Tình hình' }).click();
    await page.waitForTimeout(800);
    const situation = await markers();
    await modes.getByRole('button', { name: 'Tác nghiệp' }).click();
    await page.waitForTimeout(800);
    const back = await markers();
    if (layout === 'scroll') await page.keyboard.press('Escape');
    if (!(situation < before) || back < before - 2) throw new Error(`số điểm: ${before} → Tình hình ${situation} → Tác nghiệp ${back}`);
    return `${levels.length} điểm nóng đang hiện · ${before} → ${situation} → ${back} điểm trên bản đồ`;
  });
  if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) {
    await step(ctx, 'Màn cảm ứng: mọi vùng chạm của trang Bản đồ ≥ 44 px', async () => {
      const small = await smallTargets(page, { onScreen: true });
      if (small.length) throw new Error(`${small.length} vùng chạm < 44 px: ${small.slice(0, 5).map((s) => `${s.what} ${s.size}px`).join(', ')}`);
    });
  }
}

/**
 * Vùng chạm nhỏ hơn 44 px trên trang (máy cảm ứng): nút, liên kết, ô nhập / chọn, `summary` — tính cả vùng chạm vô hình
 * `.touch-hit` (::after). Bỏ điểm trên bản đồ, dòng ghi nguồn, popup, biểu đồ; ô chọn nằm trong nhãn thì nhãn là vùng chạm.
 * `onScreen`: chỉ phần đang thấy (bản đồ); không thì cả phần phải cuộn mới thấy (trang dài như Tổng quan).
 */
const smallTargets = (page, { onScreen = false } = {}) => page.evaluate((only) => {
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const on = !only || (r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && on;
  };
  return [...document.querySelectorAll('button, a[href], input, select, [role="button"], summary')]
    .filter((el) => shown(el) && !el.closest('.leaflet-marker-pane, .leaflet-control-attribution, .leaflet-popup, .recharts-wrapper')
      && !(el.type === 'checkbox' && el.closest('label')))
    .map((el) => {
      const r = el.getBoundingClientRect();
      let w = r.width;
      let h = r.height;
      const after = el.classList.contains('touch-hit') && getComputedStyle(el, '::after');
      if (after && after.content !== 'none') { w = Math.max(w, parseFloat(after.width) || 0); h = Math.max(h, parseFloat(after.height) || 0); }
      return { size: Math.round(el.type === 'range' ? h : Math.min(w, h)), what: (el.getAttribute('aria-label') || el.innerText || el.title || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 30) };
    })
    .filter((x) => x.size < 44);
}, onScreen);

// ================================================================ Tổng quan trên màn cảm ứng (iPad, điện thoại)
// Mọi vùng chạm của 5 tab ≥ 44 px (thanh công cụ, tab, bảng tác chiến, lọc, nhật ký, Hồ chứa, Sạt lở, Cấp xã, Hệ thống);
// điện thoại cảm ứng 360×740: vẫn thấy trọn 6 ô KPI dù nút cao hơn (phép đo "Màn hình đầu" chạy không cảm ứng). Chỉ xem.
const DASH_TOUCH = [
  ['iPad ngang', devices['iPad Pro 11 landscape']],
  ['Điện thoại 360', devices['Galaxy S8']],
];
const DASH_TABS = [['', 'Tổng hợp'], ['ho_chua', 'Hồ chứa'], ['sat_lo', 'Sạt lở'], ['cap_xa', 'Cấp xã'], ['he_thong', 'Hệ thống']];
async function dashTouch(ctx) {
  const { page } = ctx;
  await step(ctx, 'Tổng quan: mọi vùng chạm của 5 tab ≥ 44 px', async () => {
    await page.goto(`${ROOT}/dang-nhap`);
    await page.getByPlaceholder('Nhập tên đăng nhập hoặc email...').fill(STAFF.user);
    await page.getByPlaceholder('••••••••').fill(STAFF.pass);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    const bad = [];
    for (const [tab, name] of DASH_TABS) {
      await page.goto(`${ROOT}/dashboard${tab ? `?tab=${tab}` : ''}`);
      await waitMain(page);
      await page.waitForTimeout(1500);
      for (const s of await smallTargets(page)) bad.push(`${name}: ${s.what} ${s.size}px`);
    }
    if (bad.length) throw new Error(`${bad.length} vùng chạm < 44 px — ${bad.slice(0, 5).join(', ')}`);
  });
  if (ctx.vp.mobile) {
    await step(ctx, 'Tổng quan: điện thoại cảm ứng vẫn thấy trọn 6 ô KPI (không bị thanh đáy che)', async () => {
      await page.goto(`${ROOT}/dashboard`);
      await page.locator('[aria-label="Chỉ số nhanh"] > *').nth(5).waitFor();
      await page.waitForTimeout(800);
      const m = await page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="Thao tác nhanh"]');
        const navTop = nav && nav.getBoundingClientRect().height ? nav.getBoundingClientRect().top : innerHeight;
        const tiles = [...document.querySelectorAll('[aria-label="Chỉ số nhanh"] > *')];
        return { bottom: Math.round(Math.max(...tiles.map((t) => t.getBoundingClientRect().bottom))), visible: Math.round(navTop) };
      });
      if (m.bottom > m.visible) throw new Error(`ô KPI bị che: đáy ${m.bottom}px > ${m.visible}px`);
      return `KPI đáy ${m.bottom}/${m.visible}px`;
    });
  }
}

// ================================================================ Công cụ bản đồ: tìm đường, khoanh vùng (trang B — G7)
// Lỗi giả lập bằng route của Playwright (mất mạng, máy chủ 500, trả chậm) — chỉ đọc, không ghi dữ liệu.
const MAP_TOOL_DEVICES = [
  ['Laptop 1366×768', { viewport: { width: 1366, height: 768 } }, false],
  ['Điện thoại 360', devices['Galaxy S8'], true],
];
const ROUTE_TOOL = 'Tìm đường an toàn A → B (tránh vùng nguy hiểm)';
const POLYGON_TOOL = 'Khoanh vùng nguy cơ (đa giác)';

/**
 * Ba đỉnh tam giác (đỉnh cách tâm `k` ô lưới 10 px) ở chỗ trống của bản đồ — không trúng biểu tượng, bảng nổi, nút; ưu tiên
 * tâm nằm trong ranh giới xã (lớp ranh giới là path SVG), gần giữa bản đồ. Dò lưới MỘT lần (elementFromPoint mỗi ô) rồi tra
 * bảng — dò lại từng điểm cho mọi ứng viên tốn hàng trăm nghìn lượt, làm sập trang bản dev.
 */
const freeTriangle = (page, k) => page.evaluate((half) => {
  const G = 10;
  const box = document.querySelector('.leaflet-container').getBoundingClientRect();
  const W = Math.floor(box.width / G);
  const H = Math.floor(box.height / G);
  const cell = []; // 0 = vướng, 1 = trống, 2 = trống và trong ranh giới xã
  for (let j = 0; j < H; j += 1) {
    for (let i = 0; i < W; i += 1) {
      const e = document.elementFromPoint(box.left + i * G + G / 2, box.top + j * G + G / 2);
      const free = !!e?.closest('.leaflet-container')
        && !e.closest('.leaflet-marker-icon, .leaflet-control, .leaflet-popup, .card, button, section, nav, [role="status"], .sos-pulse');
      cell.push(free ? (e.tagName.toLowerCase() === 'path' ? 2 : 1) : 0);
    }
  }
  const at = (i, j) => (i >= 0 && j >= 0 && i < W && j < H ? cell[j * W + i] : 0);
  for (let m = 3; m >= 0; m -= 1) { // cả vùng ±m ô quanh mỗi điểm phải trống; bản đồ quá dày thì nới dần
    const ok = (i, j) => [-m, 0, m].every((di) => [-m, 0, m].every((dj) => at(i + di, j + dj) > 0));
    let best = null;
    for (let j = half; j < H - half; j += 1) {
      for (let i = half; i < W - half; i += 1) {
        const pts = [[i - half, j - half], [i + half, j - half], [i, j + half], [i, j], [i - half / 2, j], [i + half / 2, j]];
        if (pts.every(([a, b]) => ok(Math.round(a), Math.round(b)))) {
          const score = (at(i, j) === 2 ? 0 : 1e6) + Math.hypot(i - W / 2, j - H / 2);
          if (!best || score < best.score) best = { i, j, score };
        }
      }
    }
    if (best) {
      const px = (i, j) => [box.left + i * G + G / 2, box.top + j * G + G / 2];
      return [px(best.i - half, best.j - half), px(best.i + half, best.j - half), px(best.i, best.j + half)];
    }
  }
  throw new Error('bản đồ không còn chỗ trống để bấm');
}, k);

async function mapTools(ctx, phone) {
  const { page } = ctx;
  const tap = ([x, y]) => (phone ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  const pick = async (label) => {
    if (phone) await page.getByRole('button', { name: 'Công cụ', exact: true }).click();
    await visible(page.locator(`button[title="${label}"]`)).click();
    await page.waitForTimeout(300);
    // Bản đồ đứng yên (bay tới vùng đang lọc xong) rồi mới chọn điểm bấm
    await page.waitForFunction(() => !document.querySelector('.leaflet-zoom-anim, .leaflet-pan-anim'), null, { timeout: 10_000 });
  };
  const hint = visible(page.locator('div.card[role="status"]').filter({ hasText: 'Đang dùng: Dò đường an toàn' }));
  const card = visible(page.locator('div.card').filter({ hasText: 'Phân tích vùng khoanh' }));
  // Lỗi giả lập là chủ ý → bỏ khỏi danh sách "API 5xx" mà bước kiểm thử bắt
  const forget = () => ctx.problems.splice(0, ctx.problems.length, ...ctx.problems.filter((x) => !/\/map\/(route|area-stats)/.test(x)));
  const fake = (j) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(j) });

  await step(ctx, 'Đăng nhập, mở Bản đồ', async () => {
    await page.goto(`${ROOT}/dang-nhap`);
    await page.getByPlaceholder('Nhập tên đăng nhập hoặc email...').fill(STAFF.user);
    await page.getByPlaceholder('••••••••').fill(STAFF.pass);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    await page.goto(`${ROOT}/ban-do`);
    await page.locator('.leaflet-marker-pane .leaflet-marker-icon').first().waitFor({ timeout: 20_000 });
    await page.waitForTimeout(800);
    // Khối này kiểm tra công cụ, không kiểm tra biểu tượng: bản đồ dày điểm (SOS nhấp nháy lan rộng, mức thu phóng khác nhau
    // giữa máy) làm cú bấm chọn điểm A / B có lúc trúng biểu tượng → mở popup (CI 11/10/2026). Biểu tượng dữ liệu không nhận
    // bấm trong khối này; điểm vẽ, con trỏ vẽ của leaflet-draw vẫn nhận.
    await page.addStyleTag({
      content: '.leaflet-marker-icon:not(.leaflet-mouse-marker):not(.leaflet-editing-icon) { pointer-events: none !important; }',
    });
  });

  await step(ctx, 'Tìm đường: mất mạng / máy chủ lỗi → báo lỗi + Thử lại; có mạng → có lộ trình; chọn lại A khi đang tìm → bỏ kết quả cũ', async () => {
    let mode = 'abort';
    await page.route('**/api/v1/map/route', safeRoute(async (route) => {
      if (mode === 'abort') return route.abort('internetdisconnected');
      if (mode === '500') return route.fulfill({ status: 500, body: 'Internal Server Error' });
      if (mode === 'slow') {
        await new Promise((r) => { setTimeout(r, 1500); });
        return route.fulfill(fake({ distance_km: 9.9, duration_min: 9, safe: true, roads: ['GIẢ LẬP'], offroad_km: 0, warnings: [], hazards: [], geometry: { type: 'LineString', coordinates: [[106.2, 22.6], [106.3, 22.7]] } }));
      }
      return route.continue();
    }));
    try {
      await pick(ROUTE_TOOL);
      const pts = await freeTriangle(page, phone ? 4 : 6);
      await tap(pts[0]);
      await page.waitForTimeout(200);
      await tap(pts[1]);
      await hint.getByText('Không tìm được lộ trình: mất kết nối mạng').waitFor({ timeout: 8_000 });
      mode = '500';
      await hint.getByRole('button', { name: 'Thử lại' }).click();
      await hint.getByText(/máy chủ đang lỗi \(mã 500\)/).waitFor({ timeout: 8_000 });
      mode = 'real';
      await hint.getByRole('button', { name: 'Thử lại' }).click();
      await hint.getByText(/Lộ trình:/).waitFor({ timeout: 15_000 });
      mode = 'slow';
      await tap(pts[2]); // đã đủ A, B → bấm tiếp là chọn lại A
      await page.waitForTimeout(200);
      await tap(pts[0]);
      await hint.getByText('Đang tìm lộ trình an toàn…').waitFor({ timeout: 3_000 });
      await tap(pts[1]); // chọn lại A khi lượt trước còn đang tìm
      await page.waitForTimeout(2_000);
      const txt = (await hint.innerText()).replace(/\s+/g, ' ');
      if (!/Chạm chọn điểm A/.test(txt) || /9\.9 km/.test(txt)) throw new Error(`kết quả lượt cũ vẫn hiện: ${txt.slice(0, 90)}`);
      await hint.getByRole('button', { name: 'Tắt công cụ' }).click();
    } finally {
      await page.unroute('**/api/v1/map/route');
      forget();
    }
  });

  await step(ctx, 'Khoanh vùng: chú thích tiếng Việt; mất mạng / máy chủ lỗi → báo lỗi + Thử lại; ghi xã trong vùng; 20 xã không tràn; đóng khi đang tính không mở lại', async () => {
    let mode = 'abort';
    const codes = await page.evaluate(async () => (await (await fetch('/api/v1/admin-units/geojson')).json()).features.map((f) => f.properties.code));
    await page.route('**/api/v1/map/area-stats', safeRoute(async (route) => {
      if (mode === 'abort') return route.abort('internetdisconnected');
      if (mode === '500') return route.fulfill({ status: 500, body: 'Internal Server Error' });
      if (mode === 'many') {
        return route.fulfill(fake({ population: 1234, households: 300, subscribers: 1012, area_km2: 900, sos_open: 0, forces: 2, evac_free: 50, hazard_zones: 1, admin_codes: codes.slice(0, 20) }));
      }
      if (mode === 'slow') await new Promise((r) => { setTimeout(r, 1500); });
      return route.continue();
    }));
    // Vẽ đa giác 3 đỉnh; trả chú thích leaflet-draw lúc sắp khép vùng và bảng kết quả cũ đã đóng khi chọn công cụ chưa
    const draw = async () => {
      const hadCard = (await card.count()) > 0;
      await pick(POLYGON_TOOL);
      const oldClosed = !hadCard || (await card.count()) === 0;
      const pts = await freeTriangle(page, phone ? 4 : 6);
      for (const [i, pt] of pts.entries()) {
        const hit = await page.evaluate(([x, y]) => {
          const e = document.elementFromPoint(x, y);
          return `${e?.tagName}.${String(e?.getAttribute('class') || '').split(' ').slice(0, 2).join('.')}`;
        }, pt);
        await tap(pt);
        await page.waitForTimeout(250);
        const n = await page.locator('.leaflet-editing-icon').count();
        if (n !== i + 1) throw new Error(`cú bấm thứ ${i + 1} (${pt.map(Math.round)}) không thêm điểm vẽ — trúng ${hit}, có ${n} điểm`);
      }
      if (!phone) await page.mouse.move(pts[0][0] + 3, pts[0][1] + 3);
      await page.waitForTimeout(200);
      const tip = (await page.locator('.leaflet-draw-tooltip').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      await tap(pts[0]); // bấm lại điểm đầu → khép vùng
      return { tip, oldClosed };
    };
    try {
      const { tip } = await draw();
      if (!/Chạm điểm đầu để khép vùng/.test(tip) || !/(km²|ha|m²)/.test(tip)) throw new Error(`chú thích khi vẽ: "${tip}"`);
      await card.getByText('Không tính được số liệu vùng khoanh: mất kết nối mạng').waitFor({ timeout: 8_000 });
      mode = '500';
      await card.getByRole('button', { name: 'Thử lại' }).click();
      await card.getByText(/máy chủ đang lỗi \(mã 500\)/).waitFor({ timeout: 8_000 });
      mode = 'real';
      await card.getByRole('button', { name: 'Thử lại' }).click();
      await card.getByText('Dân số (ước tính):').waitFor({ timeout: 15_000 });
      const units = ((await card.innerText()).replace(/\s+/g, ' ').match(/(Xã \/ phường trong vùng \(\d+\)|Vùng nhỏ, thuộc|Vùng khoanh nằm ngoài)[^S]*/) || [])[0];
      if (!units) throw new Error('bảng kết quả không ghi xã / phường trong vùng');
      // Xuất Excel số liệu vùng khoanh + danh sách xã (gửi kèm văn bản chỉ đạo)
      const [xl] = await Promise.all([
        page.waitForEvent('download', { timeout: 30_000 }),
        card.getByRole('button', { name: /^Xuất Excel/ }).click(),
      ]);
      if (!/^vung-khoanh-.*\.xlsx$/.test(xl.suggestedFilename())) throw new Error(`tệp Excel lạ: ${xl.suggestedFilename()}`);
      // Khoanh vùng mới → đóng kết quả cũ; 20 xã, mở hết danh sách → bảng không tràn, nút "Soạn cảnh báo" vẫn trong màn
      mode = 'many';
      const again = await draw();
      if (!again.oldClosed) throw new Error('chọn khoanh vùng mới nhưng bảng kết quả cũ vẫn mở');
      await card.getByText('Xã / phường trong vùng (20)').waitFor({ timeout: 8_000 });
      await card.getByRole('button', { name: '+14 xã / phường' }).click();
      const limit = phone ? (await page.getByRole('navigation', { name: 'Thao tác nhanh' }).boundingBox()).y : page.viewportSize().height;
      const box = await card.boundingBox();
      if (box.y + box.height > limit + 1) throw new Error(`bảng kết quả tràn: đáy ${Math.round(box.y + box.height)} > ${Math.round(limit)}px`);
      const alert = card.getByRole('button', { name: 'Soạn cảnh báo sơ tán vùng này' });
      if (await alert.count()) {
        await alert.scrollIntoViewIfNeeded();
        const ab = await alert.boundingBox();
        if (ab.y + ab.height > limit + 1) throw new Error('nút "Soạn cảnh báo sơ tán" bị che');
      }
      // Đóng bảng khi đang tính → kết quả về muộn không mở lại bảng
      mode = 'slow';
      await draw();
      await card.getByRole('button', { name: 'Đóng phân tích vùng' }).click();
      await page.waitForTimeout(2_200);
      if (await card.count()) throw new Error('đóng bảng khi đang tính, kết quả về muộn mở lại bảng');
      if (phone) await expectNoOverflow(ctx, 'Bản đồ (khoanh vùng)');
      return `${units.trim()} · chú thích "${tip}"`;
    } finally {
      await page.unroute('**/api/v1/map/area-stats');
      forget();
    }
  });
}

// ================================================================ Lớp & popup của bản đồ (trang B — G5)
const MAP_LAYER_DEVICES = [
  ['Laptop 1366×768', { viewport: { width: 1366, height: 768 } }, false],
  ['Điện thoại 360', devices['Galaxy S8'], true],
];
const TRIANGLE_PATH = 'svg path[d^="M15 2.5"]'; // tam giác điểm đen (icons.js blackspotIcon)
const TRIANGLE = `.leaflet-marker-icon ${TRIANGLE_PATH}`;

/**
 * Chờ bản đồ đứng yên: vị trí khung (transform của pane bản đồ, proxy thu phóng) không đổi qua 5 lần dò liên tiếp (~0,5 s).
 * Ranh giới vùng tải xong sau các điểm → bản đồ còn bay tới vùng đang lọc (0,8 s); bấm lúc đó thì popup bị kéo đi.
 */
const mapIdle = (page) => page.waitForFunction(() => {
  const t = [...document.querySelectorAll('.leaflet-map-pane, .leaflet-proxy')].map((e) => e.style.transform).join('|');
  if (window.mapIdleT === t) window.mapIdleN = (window.mapIdleN || 0) + 1;
  else { window.mapIdleT = t; window.mapIdleN = 0; }
  return window.mapIdleN >= 5;
}, null, { polling: 100, timeout: 15_000 });
const HAZARD_GLYPH = 'm21.73 18-8-14'; // hình cảnh báo trong ô vuông điểm nguy hiểm (icons.js hazardIcon)

async function mapLayers(ctx, phone) {
  const { page } = ctx;
  let k = null;
  let layers0 = null; // /map/layers lúc mở trang (danh mục xe, đơn vị — không đổi theo bộ mô phỏng)
  // WebSocket thật của trang (đi qua máy chủ như thường) — giữ đường để chèn thêm một tin "log.new" giả lập (bước Diễn
  // biến), không phải ghi dữ liệu thật
  let socket = null;
  await page.routeWebSocket(/\/ws(\?|$)/, (ws) => {
    ws.connectToServer();
    socket = ws;
  });
  await step(ctx, 'Đăng nhập, mở Bản đồ', async () => {
    await page.goto(`${ROOT}/dang-nhap`);
    await page.getByPlaceholder('Nhập tên đăng nhập hoặc email...').fill(STAFF.user);
    await page.getByPlaceholder('••••••••').fill(STAFF.pass);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    const kpis = page.waitForResponse((r) => r.url().includes('/api/v1/dashboard/kpis') && r.ok(), { timeout: 20_000 });
    const mapData = page.waitForResponse((r) => r.url().includes('/api/v1/map/layers') && r.ok(), { timeout: 20_000 });
    await page.goto(`${ROOT}/ban-do`);
    k = await (await kpis).json();
    layers0 = await (await mapData).json();
    await page.locator('.leaflet-marker-pane .leaflet-marker-icon').first().waitFor({ timeout: 20_000 });
    await page.waitForTimeout(500);
    await mapIdle(page);
  });

  // Thiết kế B.2 "Điểm nóng sạt lở: icon tam giác cảnh báo… Đỏ = nguy cơ rất cao" — danh mục điểm đen cùng số với Tổng quan
  await step(ctx, 'Điểm đen sạt lở, đèo dốc: đủ điểm như Tổng quan, tam giác theo màu, popup có trạng thái giám sát; điểm đã nhập trùng chỗ không vẽ chồng', async () => {
    const want = k?.landslides?.points?.length ?? 0;
    const n = await page.locator(TRIANGLE).count();
    if (n !== want) throw new Error(`${n} tam giác, Tổng quan có ${want} điểm đen`);
    if (!want) return 'vùng đang xem không có điểm đen';
    // Điểm nguy hiểm đã nhập trùng chỗ đã gộp vào tam giác — không còn ô vuông cảnh báo ngay dưới tam giác
    const stacked = await page.locator(TRIANGLE).evaluateAll((paths, glyph) => paths.filter((pth) => {
      const icon = pth.closest('.leaflet-marker-icon');
      const r = icon.getBoundingClientRect();
      return document.elementsFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        .some((e) => e.classList.contains('leaflet-marker-icon') && e !== icon && e.innerHTML.includes(glyph));
    }).length, HAZARD_GLYPH);
    if (stacked) throw new Error(`${stacked} tam giác bị ô vuông điểm nguy hiểm vẽ chồng`);
    const icon = page.locator('.leaflet-marker-icon', { has: page.locator(TRIANGLE_PATH) }).first();
    await icon.dispatchEvent('click'); // biểu tượng SOS có thể nằm đè — mở popup trực tiếp
    const pop = visible(page.locator('.leaflet-popup-content'));
    await pop.getByText('Giám sát:').waitFor({ timeout: 5_000 });
    const text = (await pop.innerText()).replace(/\s+/g, ' ');
    if (phone) await expectNoOverflow(ctx, 'Bản đồ (popup điểm đen)');
    await page.locator('.leaflet-popup-close-button').first().dispatchEvent('click'); // Esc không đóng popup Leaflet
    return `${n} điểm · ${text.slice(0, 80)}`;
  });

  // Thiết kế B.1 "Bảng cảnh báo khẩn cấp: dòng thời gian cuộn liên tục (feed) các tín hiệu SOS… cảnh báo từ cảm biến"
  await step(ctx, 'Diễn biến: mới nhất trên cùng, lọc theo loại; sự kiện mới đến khi đang cuộn → "N mục mới", không nhảy; chạm mục → bay tới', async () => {
    if (phone) await page.getByRole('navigation', { name: 'Thao tác nhanh' }).getByRole('button', { name: /^Cảnh báo/ }).click();
    await visible(page.getByRole('button', { name: 'Diễn biến', exact: true })).click();
    const log = visible(page.getByRole('log', { name: 'Diễn biến, mới nhất trên cùng' }));
    await log.locator('li').first().waitFor({ timeout: 15_000 });
    const times = await log.locator('time').evaluateAll((els) => els.map((e) => Date.parse(e.getAttribute('datetime'))));
    if (times.some((t, i) => i > 0 && times[i - 1] < t)) throw new Error('diễn biến chưa xếp mới nhất trên cùng');
    const chips = visible(page.getByRole('group', { name: 'Lọc diễn biến theo loại' }));
    const warn = chips.getByRole('button', { name: /^Cảnh báo \d+$/ });
    const nWarn = Number((await warn.innerText()).match(/\d+/)[0]);
    await warn.click();
    const shown = await log.locator('li').count();
    if (shown !== Math.min(nWarn, 20)) throw new Error(`lọc "Cảnh báo": hiện ${shown} mục, chip ghi ${nWarn}`);
    await chips.getByRole('button', { name: /^Tất cả \d+$/ }).click();
    await page.waitForTimeout(300);
    if (!socket) throw new Error('trang chưa mở kết nối WebSocket');
    // Đang cuộn xem mục cũ (nếu danh sách đủ dài) thì một sự kiện mới đến
    const scrolled = await log.evaluate((el) => {
      const sc = el.closest('.overflow-y-auto');
      sc.scrollTop = 300;
      return sc.scrollTop;
    });
    await page.waitForTimeout(300);
    const msg = 'KIỂM THỬ: sự kiện giả lập qua WebSocket';
    socket.send(JSON.stringify({
      event: 'log.new',
      data: { id: 2 ** 31, time: new Date().toISOString(), category: 'canh_bao', severity: 'danger', message: msg, lat: 22.6657, lon: 106.2522 },
    }));
    if (scrolled > 40) {
      // bộ mô phỏng (bản trình diễn) có thể sinh thêm sự kiện thật trong lúc thử → "N mục mới", N ≥ 1
      const pill = page.getByRole('button', { name: /^\d+ mục mới$/ });
      await pill.waitFor({ timeout: 5_000 });
      const kept = await log.evaluate((el) => el.closest('.overflow-y-auto').scrollTop);
      if (kept < 100) throw new Error(`danh sách nhảy về đầu khi có mục mới (vị trí cuộn ${kept})`);
      await pill.click();
      await page.waitForFunction((el) => el.closest('.overflow-y-auto').scrollTop < 5, await log.elementHandle(), { timeout: 5_000 });
    }
    const item = log.locator('li', { hasText: msg }); // sự kiện thật đến sau có thể đứng trên — tìm theo nội dung
    await item.waitFor({ timeout: 5_000 });
    if (!(await item.getByText('mới', { exact: true }).count())) throw new Error('mục vừa đến chưa có nhãn "mới"');
    await item.getByRole('button').click();
    await page.locator('.leaflet-tooltip').filter({ hasText: msg.slice(0, 30) }).waitFor({ timeout: 5_000 });
    if (phone) await expectNoOverflow(ctx, 'Bản đồ (Diễn biến)');
    return `${times.length} mục · lọc "Cảnh báo" ${nWarn} · cuộn ${scrolled}px`;
  });

  // Thiết kế B.3 "popup: chi tiết, biểu đồ mini, nút hành động nhanh (VD gọi điện cho tài xế)"; B.2 "hồ chứa: hiển thị lưu
  // lượng nước đang xả (m³/s)"
  await step(ctx, 'Hồ chứa: nhãn lưu lượng xả trên biểu tượng; popup có biểu đồ 48 giờ, nút "Cập nhật vận hành" mở form, lọt khung bản đồ; xuồng – xe: nút gọi chỉ huy đơn vị', async () => {
    // Bước trước vừa bay tới một điểm (thu phóng 14) — tải lại để bắt đầu từ khung nhìn cả vùng, bản đồ đứng yên
    await page.reload();
    await page.locator('.leaflet-marker-pane .leaflet-marker-icon').first().waitFor({ timeout: 20_000 });
    await page.waitForTimeout(500);
    await mapIdle(page);
    // Nhãn dưới biểu tượng hồ đang mở cửa xả: "N cửa · X m³/s" — so với chính popup của hồ đó (cùng một bản số liệu; bộ
    // mô phỏng đổi cửa xả theo phút nên không so với lượt gọi API khác)
    const labels = await page.locator('.leaflet-marker-icon span').filter({ hasText: / cửa( · [\d.]+ m³\/s)?$/ }).allInnerTexts();
    const DAM = 'svg path[d="M5 21V7l7-4 7 4v14"]';
    const icon = labels.length
      ? page.locator('.leaflet-marker-icon', { has: page.locator('span', { hasText: / cửa/ }) }).first()
      : page.locator('.leaflet-marker-icon', { has: page.locator(DAM) }).first();
    if (!(await icon.count())) return 'vùng đang xem không có hồ chứa';
    const label = labels.length ? (await icon.locator('span', { hasText: / cửa/ }).innerText()).trim() : null;
    await icon.dispatchEvent('click');
    const pop = visible(page.locator('.leaflet-popup-content'));
    await pop.getByRole('button', { name: 'Mở tab Hồ chứa' }).waitFor({ timeout: 5_000 });
    if (label) {
      const t = (await pop.innerText()).replace(/\s+/g, ' ');
      const gates = t.match(/Cửa xả mở (\d+)\/\d+/)?.[1];
      const flow = t.match(/Lưu lượng xả ([\d.,]+) m³\/s/)?.[1];
      const [, lg, lf] = label.match(/^(\d+) cửa(?: · ([\d.]+) m³\/s)?$/) || [];
      const num = (x) => (x == null ? null : Math.round(Number(String(x).replace(/\./g, '').replace(',', '.'))));
      if (lg !== gates || (lf != null && num(lf) !== num(flow))) throw new Error(`nhãn "${label}" khác popup (cửa ${gates}, xả ${flow} m³/s)`);
    }
    const hasOps = !(await pop.getByText(/^Chưa có số liệu vận hành/).count());
    if (hasOps) {
      const more = pop.getByRole('button', { name: /^Xem diễn biến 48 giờ/ });
      if (await more.count()) await more.click(); // điện thoại: biểu đồ thu gọn sau nút
      await pop.getByText(/Mực nước hồ \(m\)|Chưa có số liệu vận hành trong 48 giờ qua/).first().waitFor({ timeout: 10_000 });
    }
    await mapIdle(page); // bản đồ tự kéo cho popup lọt khung
    const fit = await pop.evaluate((el) => {
      const p = el.closest('.leaflet-popup').getBoundingClientRect();
      const m = el.closest('.leaflet-container').getBoundingClientRect();
      return { top: Math.round(p.top - m.top), bottom: Math.round(m.bottom - p.bottom), left: Math.round(p.left - m.left), right: Math.round(m.right - p.right) };
    });
    if (Object.values(fit).some((v) => v < 0)) throw new Error(`popup hồ tràn ra ngoài bản đồ: ${JSON.stringify(fit)}`);
    const update = pop.getByRole('button', { name: 'Cập nhật vận hành' });
    await mapIdle(page);
    if (await update.count()) {
      await update.click();
      const dlg = page.getByRole('dialog').filter({ hasText: 'Cập nhật vận hành –' });
      await dlg.waitFor({ timeout: 5_000 });
      await dlg.getByRole('button', { name: 'Huỷ' }).click(); // chỉ mở form, không lưu
    }
    await page.locator('.leaflet-popup-close-button').first().dispatchEvent('click');
    // Xuồng – xe: bật lớp (tắt sẵn) → popup có nút gọi chỉ huy đơn vị quản lý phương tiện
    const vehicles = (layers0?.vehicles?.features || []).map((f) => f.properties);
    if (!vehicles.length) return `${labels.length} nhãn xả · popup hồ ${hasOps ? 'có' : 'chưa có'} số liệu · không có phương tiện`;
    if (phone) await page.getByRole('navigation', { name: 'Thao tác nhanh' }).getByRole('button', { name: /^Lớp/ }).click();
    else if (!(await page.getByRole('checkbox', { name: /Xuồng, xe, thiết bị/ }).count())) {
      await visible(page.getByRole('button', { name: /Lớp dữ liệu/ })).click();
    }
    const box = page.getByRole('checkbox', { name: /Xuồng, xe, thiết bị/ });
    if (!(await box.isChecked())) await box.check();
    if (phone) await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await mapIdle(page);
    const target = vehicles.find((v) => v.force_phone) || vehicles[0];
    const vIcon = page.locator('.leaflet-marker-icon').filter({ has: page.locator('svg') }).filter({
      has: page.locator('path[d^="M2 21c.6.5 1.2 1 2.5 1"], path[d^="M14 18V6a2 2 0 0 0-2-2H4"], path[d^="M14.7 6.3a1"], circle[r="3"]'),
    });
    if (!(await vIcon.count())) throw new Error('bật lớp Xuồng, xe nhưng không thấy biểu tượng phương tiện');
    // mở popup của đúng phương tiện có số chỉ huy (dò theo mã trong popup)
    let found = false;
    for (let i = 0; i < Math.min(await vIcon.count(), 40) && !found; i += 1) {
      await vIcon.nth(i).dispatchEvent('click');
      const vp = visible(page.locator('.leaflet-popup-content'));
      await vp.waitFor({ timeout: 3_000 }).catch(() => {});
      if (await vp.locator('b', { hasText: new RegExp(`^${target.code}$`) }).count()) { // đúng mã (CB-X01 ≠ CB-X010)
        found = true;
        const call = vp.getByRole('link', { name: 'Gọi chỉ huy đơn vị' });
        if (target.force_phone) {
          // popup đang hiện dần / canh bố cục (Leaflet ẩn tạm khi cập nhật) — chờ nút, không đếm ngay
          await call.waitFor({ timeout: 5_000 }).catch(() => { throw new Error(`popup ${target.code} thiếu nút "Gọi chỉ huy đơn vị"`); });
          const href = await call.getAttribute('href');
          if (href !== `tel:${target.force_phone.replace(/\s/g, '')}`) throw new Error(`nút gọi sai số: ${href}`);
        }
      }
    }
    if (!found) throw new Error(`không mở được popup phương tiện ${target.code}`);
    if (phone) await expectNoOverflow(ctx, 'Bản đồ (popup hồ, xe)');
    return `${labels.length} nhãn xả (${labels.slice(0, 2).join('; ')}) · popup hồ lọt khung ${JSON.stringify(fit)} · xe ${target.code}`;
  });
}

// ================================================================ Vật tư & Lực lượng (trang C) — laptop, iPad dọc, điện thoại 360
// Dải khẩn trên cùng (chạm → đúng danh sách đã lọc; Quay lại trả bộ lọc cũ), 4 ô chỉ số, 3 thẻ vừa màn 360 px; tìm không dấu,
// xếp, phân trang, Excel / PDF mọi dòng đang lọc; lỗi / trống / mất mạng báo rõ, nút ghi tắt khi mất mạng; màn cảm ứng: vùng
// chạm ≥ 44 px; tài khoản phường chỉ thấy phường mình, không có nút điều động. Chỉ xem — không xuất / nhập kho, không báo xe.
const RESOURCE_DEVICES = [
  ['Laptop 1366×768', { viewport: { width: 1366, height: 768 } }, false],
  ['iPad dọc', devices['iPad Pro 11'], false],
  ['Điện thoại 360', devices['Galaxy S8'], true],
];
const WARD = { user: process.env.UI_WARD_USER || 'admin.thucphan', pass: process.env.UI_WARD_PASS || 'adminthucphan123', name: 'Thục Phán' };
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd');

async function loginAs(page, who) {
  await page.goto(`${ROOT}/dang-nhap`);
  await page.getByPlaceholder('Nhập tên đăng nhập hoặc email...').fill(who.user);
  await page.getByPlaceholder('••••••••').fill(who.pass);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

async function resourcesPage(ctx) {
  const { page, vp } = ctx;
  const strip = page.getByRole('status', { name: 'Thông tin khẩn về nguồn lực' });
  const kpis = page.getByRole('group', { name: 'Chỉ số nguồn lực' });
  const tabs = page.getByRole('group', { name: 'Danh mục nguồn lực' });
  const tab = (name) => tabs.getByRole('button', { name: new RegExp(`^${name}`) });
  // Dòng đang hiện: bảng (laptop) hoặc thẻ (iPad dọc, điện thoại)
  const rows = page.locator('main table tbody tr, main ul[aria-label="Lực lượng cứu hộ"] > li, main ul[aria-label="Kho vật tư"] > li, main ul[aria-label="Phương tiện, trang thiết bị"] > li');
  const touch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  const wide = await page.evaluate(() => innerWidth >= 1024); // laptop: bảng, 20 dòng / trang; nhỏ hơn: thẻ, 10 dòng
  const size = wide ? 20 : 10;

  await step(ctx, 'Mở Vật tư & Lực lượng: dải khẩn trên cùng, 4 ô chỉ số, 3 thẻ vừa màn; không tràn ngang', async () => {
    await loginAs(page, STAFF);
    await page.goto(`${ROOT}/nguon-luc`);
    await kpis.getByRole('button').first().waitFor({ timeout: 20_000 });
    await strip.waitFor({ timeout: 20_000 });
    await rows.first().waitFor({ timeout: 20_000 });
    const m = await page.evaluate(() => {
      const box = (sel) => document.querySelector(sel)?.getBoundingClientRect();
      const tabBtns = [...document.querySelectorAll('[aria-label="Danh mục nguồn lực"] > button')].map((b) => b.getBoundingClientRect());
      return {
        stripAbove: box('[aria-label="Thông tin khẩn về nguồn lực"]').top < box('[aria-label="Chỉ số nguồn lực"]').top,
        kpi: document.querySelectorAll('[aria-label="Chỉ số nguồn lực"] > button').length,
        tabs: tabBtns.length,
        tabsOut: tabBtns.filter((t) => t.right > innerWidth + 1 || t.left < -1).length,
      };
    });
    if (!m.stripAbove) throw new Error('dải thông tin khẩn không nằm trên cùng');
    if (m.kpi !== 4) throw new Error(`có ${m.kpi} ô chỉ số (cần 4, bấm được)`);
    if (m.tabs !== 3 || m.tabsOut) throw new Error(`${m.tabs} thẻ, ${m.tabsOut} thẻ tràn khỏi màn hình`);
    await expectNoOverflow(ctx, '/nguon-luc');
    return (await strip.innerText()).replace(/\s+/g, ' ').slice(0, 80);
  });

  await step(ctx, 'Chạm ô chỉ số / dải khẩn → đúng danh sách đã lọc; Quay lại trả bộ lọc cũ', async () => {
    const tile = kpis.getByRole('button', { name: /Kho cạn kiệt/ });
    const n = Number((await tile.innerText()).match(/(\d+)\s*kho dưới/)?.[1] ?? 0);
    await tile.click();
    await page.waitForURL(/tab=vat_tu/);
    const cards = page.getByRole('list', { name: 'Kho vật tư' }).locator(':scope > li');
    await cards.first().waitFor({ timeout: 10_000 });
    if (n > 0) {
      if (!/tt=can_kiet/.test(page.url())) throw new Error(`ô "${n} kho dưới 20%" mở ${page.url()}`);
      const shown = await cards.count();
      if (shown !== Math.min(n, size)) throw new Error(`ô ghi ${n} kho, danh sách hiện ${shown}`);
      const texts = await cards.allInnerTexts();
      if (!texts.every((t) => /Cạn kiệt/.test(t))) throw new Error('có kho không cạn kiệt trong danh sách đã lọc');
    }
    const before = page.url();
    await kpis.getByRole('button', { name: /Xuồng/ }).click();
    await page.waitForURL(/tab=phuong_tien/);
    await rows.first().waitFor({ timeout: 10_000 }).catch(() => {});
    const boats = await rows.allInnerTexts();
    if (!/nhom=duong_thuy/.test(page.url()) || !boats.every((t) => /Đường thủy/.test(t) && /Sẵn sàng/.test(t))) {
      throw new Error(`ô Xuồng mở ${page.url()} — ${boats.length} dòng không đúng nhóm / tình trạng`);
    }
    await page.goBack();
    await page.waitForURL((u) => u.toString() === before, { timeout: 5_000 });
    // Mục đầu của dải khẩn (nếu có): mở đúng thẻ
    const chip = strip.locator('button[title$="mở danh sách đã lọc"]').first();
    let chipNote = 'dải khẩn không có mục';
    if (await chip.count()) {
      await chip.click();
      await page.waitForURL(/tab=/);
      chipNote = `mục khẩn → ${new URL(page.url()).search}`;
    }
    return `${n} kho cạn kiệt · ${boats.length} xuồng sẵn sàng · ${chipNote}`;
  });

  await step(ctx, 'Tìm không dấu, xếp, phân trang; Excel (và PDF trên laptop) xuất mọi dòng đang lọc', async () => {
    await page.goto(`${ROOT}/nguon-luc`);
    await rows.first().waitFor({ timeout: 20_000 });
    // Tìm theo một từ trong tên đơn vị đầu tiên, gõ không dấu
    const first = (await rows.first().innerText()).split('\n')[0];
    const word = norm(first).split(/[^a-z0-9]+/).find((w) => w.length >= 4) || norm(first).slice(0, 4);
    await page.getByLabel('Tìm trong danh sách').fill(word);
    await page.waitForTimeout(300);
    const found = await rows.allInnerTexts();
    if (!found.length || !found.some((t) => t.includes(first))) throw new Error(`tìm "${word}" không ra "${first}"`);
    await page.getByLabel('Xoá ô tìm').click();
    await tab('Phương tiện').click();
    await rows.first().waitFor();
    const pager = page.getByText(/^\d+–\d+$/).first();
    const total = await rows.count();
    let pageNote = `${total} dòng, 1 trang`;
    if (total === size && await page.getByRole('button', { name: 'Trang sau' }).isEnabled().catch(() => false)) {
      await page.getByRole('button', { name: 'Trang sau' }).click();
      await page.getByText(new RegExp(`^${size + 1}–\\d+$`)).first().waitFor({ timeout: 5_000 });
      pageNote = `trang 2: ${await rows.count()} dòng`;
    }
    const sortBox = page.getByLabel('Sắp xếp');
    if (!(await sortBox.isVisible())) await page.getByRole('button', { name: /^Bộ lọc/ }).click(); // điện thoại: ô xếp nằm trong khung Bộ lọc
    await sortBox.selectOption('nhien_lieu');
    await page.waitForTimeout(300);
    if (await pager.count() && !/^1–/.test(await pager.innerText())) throw new Error('đổi cách xếp không về trang 1');
    const fuel = (await rows.allInnerTexts()).map((t) => Number(t.match(/(\d+)%/)?.[1])).filter((x) => !Number.isNaN(x));
    if (fuel.some((x, i) => i && fuel[i - 1] > x)) throw new Error(`"Nhiên liệu thấp trước" xếp sai: ${fuel.slice(0, 6)}`);
    const [xlsx] = await Promise.all([page.waitForEvent('download', { timeout: 20_000 }), page.getByRole('button', { name: 'Excel', exact: true }).click()]);
    if (!/^phuong-tien-.*\.xlsx$/.test(xlsx.suggestedFilename())) throw new Error(`tên tệp Excel: ${xlsx.suggestedFilename()}`);
    let pdfNote = '';
    if (wide) {
      const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.getByRole('button', { name: 'PDF', exact: true }).click()]);
      if (!/^nguon-luc-phuong_tien-.*\.pdf$/.test(pdf.suggestedFilename())) throw new Error(`tên tệp PDF: ${pdf.suggestedFilename()}`);
      await page.waitForTimeout(300);
      if ((await rows.count()) > size) throw new Error('chụp PDF xong không trở lại phân trang');
      pdfNote = ` · ${pdf.suggestedFilename()}`;
    }
    await expectNoOverflow(ctx, 'thẻ Phương tiện');
    return `tìm "${word}" · ${pageNote} · ${xlsx.suggestedFilename()}${pdfNote}`;
  });

  await step(ctx, 'Lỗi tải / chưa có dữ liệu / mất mạng: báo rõ (Thử lại, chỗ nhập), nút ghi tắt khi mất mạng', async () => {
    // Mất kết nối tới máy chủ (abort — không phải 5xx thật, watch() không tính là lỗi API)
    await page.route('**/api/v1/resources/forces*', safeRoute((r) => r.abort('failed')));
    await page.goto(`${ROOT}/nguon-luc`);
    await page.getByText('Không tải được danh sách đơn vị').waitFor({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Thử lại' }).first().waitFor();
    await page.unroute('**/api/v1/resources/forces*');
    await page.route('**/api/v1/resources/vehicles*', safeRoute((r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })));
    await page.goto(`${ROOT}/nguon-luc?tab=phuong_tien`);
    await page.getByText(/Chưa có phương tiện, trang thiết bị trong vùng đang xem/).waitFor({ timeout: 20_000 });
    await page.unroute('**/api/v1/resources/vehicles*');
    await page.goto(`${ROOT}/nguon-luc?tab=vat_tu`);
    const issue = page.getByRole('button', { name: /Xuất kho/ }).first();
    await issue.waitFor({ timeout: 20_000 });
    await page.context().setOffline(true);
    try {
      await page.getByText('Mất kết nối mạng').waitFor({ timeout: 5_000 });
      if (!(await issue.isDisabled())) throw new Error('mất mạng nhưng nút Xuất kho vẫn bấm được');
    } finally {
      await page.context().setOffline(false);
    }
    await page.waitForTimeout(300);
    if (await issue.isDisabled()) throw new Error('có mạng lại nhưng nút Xuất kho vẫn tắt');
  });

  if (touch) {
    await step(ctx, 'Màn cảm ứng: mọi vùng chạm của 3 thẻ ≥ 44 px', async () => {
      const bad = [];
      for (const t of ['luc_luong', 'vat_tu', 'phuong_tien']) {
        await page.goto(`${ROOT}/nguon-luc?tab=${t}`);
        await rows.first().waitFor({ timeout: 20_000 });
        await page.waitForTimeout(800);
        for (const s of await smallTargets(page)) bad.push(`${t}: ${s.what} ${s.size}px`);
      }
      if (bad.length) throw new Error(`${bad.length} vùng chạm < 44 px — ${bad.slice(0, 5).join(', ')}`);
    });
  }
}

/**
 * Thao tác hiện trường của trang C. Điện thoại: thanh dưới đáy Xuất kho · Nhập kho · Báo SOS · Báo xe · Gọi 112 → chọn kho /
 * phương tiện (tìm không dấu) → form 2 bước, lỗi hiện ngay khi nhập (vượt tồn, nhiên liệu ngoài 0–100, hạn đã qua, chưa đổi
 * gì) — không gửi. Laptop (trừ chế độ chỉ xem): xuất 1 đơn vị rồi nhập lại 1 — tồn kho trở về như cũ.
 */
async function resourcesField(ctx, phone) {
  const { page } = ctx;
  if (phone) {
    await step(ctx, 'Thanh đáy điện thoại: Xuất kho → chọn kho (tìm không dấu) → form 2 bước, vượt tồn báo ngay, xem trước tồn còn lại', async () => {
      await loginAs(page, STAFF);
      await page.goto(`${ROOT}/nguon-luc`);
      const bar = page.getByRole('navigation', { name: 'Thao tác nhanh' });
      await bar.getByRole('button', { name: 'Xuất kho' }).waitFor({ timeout: 20_000 });
      const labels = (await bar.innerText()).replace(/\s+/g, ' ');
      const missing = ['Xuất kho', 'Nhập kho', 'Báo SOS', 'Báo xe', 'Gọi 112'].filter((x) => !labels.includes(x));
      if (missing.length) throw new Error(`thanh đáy thiếu: ${missing.join(', ')}`);
      await bar.getByRole('button', { name: 'Xuất kho' }).click();
      let dialog = page.getByRole('dialog');
      await dialog.getByText('Xuất kho — chọn kho').waitFor();
      const picks = dialog.getByRole('list').locator(':scope > li');
      const n = await picks.count();
      if (n > 6) {
        const first = (await picks.first().locator('b').innerText()).trim();
        await dialog.getByLabel('Tìm trong danh sách chọn').fill(norm(first));
        await page.waitForTimeout(200);
        if (!(await picks.first().innerText()).includes(first)) throw new Error(`tìm không dấu "${norm(first)}" không ra ${first}`);
      }
      await picks.first().getByRole('button').click();
      dialog = page.getByRole('dialog');
      await dialog.getByRole('radiogroup', { name: 'Mặt hàng cần xuất' }).waitFor();
      await dialog.getByRole('button', { name: /^Tiếp/ }).click();
      await dialog.getByText('Chọn mặt hàng cần xuất').waitFor({ timeout: 3_000 });
      const item = dialog.getByRole('radio').filter({ hasNot: page.locator('[disabled]') }).first();
      const stock = Number(((await item.innerText()).match(/tồn ([\d.]+)/)?.[1] || '0').replace(/\./g, ''));
      await item.click();
      const qty = dialog.getByLabel(/Số lượng xuất/);
      await qty.fill(String(stock + 5));
      await dialog.getByText(/Vượt tồn kho — kho chỉ còn/).waitFor({ timeout: 3_000 });
      await qty.fill('1');
      await dialog.getByText(/Sau khi xuất, kho còn/).waitFor({ timeout: 3_000 });
      await expectNoOverflow(ctx, 'form xuất kho', dialog);
      await dialog.getByRole('button', { name: 'Huỷ' }).click();
      return `${n} kho · tồn ${stock}`;
    });

    await step(ctx, 'Thanh đáy: Báo xe — chip nhiên liệu, 150% báo lỗi, Lưu khi chưa đổi gì nói rõ; Nhập kho — hạn đã qua báo ngay', async () => {
      const bar = page.getByRole('navigation', { name: 'Thao tác nhanh' });
      await bar.getByRole('button', { name: 'Báo xe' }).click();
      let dialog = page.getByRole('dialog');
      await dialog.getByText('Báo tình trạng — chọn phương tiện').waitFor();
      await dialog.getByRole('list').locator(':scope > li').first().getByRole('button').click();
      dialog = page.getByRole('dialog');
      const fuel = dialog.getByLabel('Mức nhiên liệu (%)');
      await fuel.waitFor();
      const before = await fuel.inputValue();
      await dialog.getByRole('button', { name: '10%', exact: true }).click();
      await dialog.getByText(/không được gợi ý khi điều động/).first().waitFor({ timeout: 3_000 });
      await fuel.fill('150');
      await dialog.getByText(/số nguyên từ 0 đến 100/).waitFor({ timeout: 3_000 });
      await fuel.fill(before);
      await dialog.getByRole('button', { name: 'Lưu tình trạng' }).click();
      await dialog.getByText('Chưa thay đổi trạng thái hay mức nhiên liệu').waitFor({ timeout: 3_000 });
      await expectNoOverflow(ctx, 'form báo tình trạng xe', dialog);
      await dialog.getByRole('button', { name: 'Huỷ' }).click();
      await bar.getByRole('button', { name: 'Nhập kho' }).click();
      dialog = page.getByRole('dialog');
      await dialog.getByText('Nhập hàng — chọn kho').waitFor();
      await dialog.getByRole('list').locator(':scope > li').first().getByRole('button').click();
      dialog = page.getByRole('dialog');
      await dialog.getByRole('radio').first().click();
      await dialog.getByRole('button', { name: /^Nhập kho$|^Nhập \d/ }).click();
      await dialog.getByText('Nhập số lượng nhập thêm').waitFor({ timeout: 3_000 });
      await dialog.getByLabel('Hạn sử dụng của lô').fill('2020-01-01');
      await dialog.getByText(/Hạn dùng đã qua/).waitFor({ timeout: 3_000 });
      await expectNoOverflow(ctx, 'form nhập kho', dialog);
      await dialog.getByRole('button', { name: 'Huỷ' }).click();
    });
    return;
  }
  if (READONLY) return;
  await step(ctx, 'Xuất kho 1 đơn vị rồi nhập lại 1: tồn kho trên máy chủ giảm 1 rồi trở về như cũ', async () => {
    await loginAs(page, STAFF);
    await page.goto(`${ROOT}/nguon-luc?tab=vat_tu`);
    const card = page.getByRole('list', { name: 'Kho vật tư' }).locator(':scope > li').first();
    await card.waitFor({ timeout: 20_000 });
    const wname = (await card.innerText()).split('\n')[0];
    const stockOf = (item) => page.evaluate(async ([w, it]) => {
      const auth = JSON.parse(localStorage.getItem('pctt_auth') || '{}');
      const res = await fetch('/api/v1/resources/warehouses', { headers: { Authorization: `Bearer ${auth.token}` } });
      return (await res.json()).find((x) => x.name === w)?.items.find((i) => i.name === it)?.quantity;
    }, [wname, item]);
    await card.getByRole('button', { name: /Xuất kho/ }).click();
    let dialog = page.getByRole('dialog');
    const radio = dialog.getByRole('radio').filter({ hasNot: page.locator('[disabled]') }).first();
    await radio.waitFor();
    const item = (await radio.locator('b').first().innerText()).trim();
    const before = await stockOf(item);
    await radio.click();
    await dialog.getByLabel(/Số lượng xuất/).fill('1');
    await dialog.getByLabel('Nơi nhận').fill('Kiểm thử giao diện — nhập trả lại ngay');
    await dialog.getByRole('button', { name: /^Xuất 1 / }).click();
    await dialog.waitFor({ state: 'detached', timeout: 15_000 });
    const mid = await stockOf(item);
    if (mid !== before - 1) throw new Error(`xuất 1 ${item}: tồn ${before} → ${mid}`);
    await card.getByRole('button', { name: /Nhập hàng/ }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('radio', { name: new RegExp(item) }).first().click();
    await dialog.getByLabel(/Số lượng nhập thêm/).fill('1');
    await dialog.getByLabel('Nguồn hàng').fill('Kiểm thử giao diện — trả lại');
    await dialog.getByRole('button', { name: /^Nhập 1 / }).click();
    await dialog.waitFor({ state: 'detached', timeout: 15_000 });
    const after = await stockOf(item);
    if (after !== before) throw new Error(`nhập lại 1 ${item}: tồn ${mid} → ${after} (trước ${before})`);
    return `${wname} · ${item}: ${before} → ${mid} → ${after}`;
  });
}

/** Tài khoản phường (Cấp 3): tiêu đề là phường mình, chỉ đơn vị trong phường, không có nút điều động (quyền dispatch.create). */
async function resourcesWard(ctx) {
  const { page } = ctx;
  await step(ctx, `Tài khoản phường ${WARD.name}: chỉ thấy phường mình, không có nút Điều động`, async () => {
    try {
      await loginAs(page, WARD);
    } catch (e) {
      if (READONLY) return `bỏ qua: không đăng nhập được ${WARD.user}`;
      throw e;
    }
    await page.goto(`${ROOT}/nguon-luc`);
    await page.getByRole('group', { name: 'Chỉ số nguồn lực' }).getByRole('button').first().waitFor({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    const head = await page.locator('main').innerText();
    if (!head.includes(WARD.name) || /Toàn tỉnh Cao Bằng ·/.test(head)) throw new Error('tiêu đề không phải phường của tài khoản');
    if (await page.getByRole('button', { name: /Điều động/ }).count()) throw new Error('tài khoản phường thấy nút Điều động');
    await expectNoOverflow(ctx, '/nguon-luc (phường)');
    const units = await page.locator('main ul[aria-label="Lực lượng cứu hộ"] > li, main table tbody tr').count();
    return `${units} đơn vị trong phường`;
  });
}

// ================================================================
console.log(`Kiểm thử giao diện: ${ROOT}${READONLY ? ' (chỉ xem)' : ''}`);
const browser = await chromium.launch();
try {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ ...vp.opts, locale: 'vi-VN', geolocation: GPS, permissions: ['geolocation'] });
    context.setDefaultTimeout(15_000);
    const page = await context.newPage();
    const ctx = { page, vp, problems: watch(page) };
    const trackCode = await publicPortal(ctx);
    await staff(ctx, trackCode);
    await context.close();
  }
  const small = await browser.newContext({ ...SMALL_PHONE.opts, locale: 'vi-VN' });
  small.setDefaultTimeout(15_000);
  const smallPage = await small.newPage();
  await smallPhone({ page: smallPage, vp: SMALL_PHONE, problems: watch(smallPage) });
  await small.close();
  const tab = await browser.newContext({ ...TABLET.opts, locale: 'vi-VN' });
  tab.setDefaultTimeout(15_000);
  const tabPage = await tab.newPage();
  await tablet({ page: tabPage, vp: TABLET, problems: watch(tabPage) });
  await tab.close();
  const first = await browser.newContext({ ...FIRST_SCREEN.opts, locale: 'vi-VN' });
  first.setDefaultTimeout(15_000);
  const firstPage = await first.newPage();
  await firstScreen({ page: firstPage, vp: FIRST_SCREEN, problems: watch(firstPage) });
  await first.close();
  for (const [label, opts, layout] of MANAGER_DEVICES) {
    const mctx = await browser.newContext({ ...opts, locale: 'vi-VN' });
    mctx.setDefaultTimeout(15_000);
    const mPage = await mctx.newPage();
    await managerMap({ page: mPage, vp: { name: `Người quản lý · ${label}`, mobile: layout === 'scroll' }, problems: watch(mPage) }, layout);
    await mctx.close();
  }
  for (const [label, opts] of DASH_TOUCH) {
    const dctx = await browser.newContext({ ...opts, locale: 'vi-VN' });
    dctx.setDefaultTimeout(15_000);
    const dPage = await dctx.newPage();
    await dashTouch({ page: dPage, vp: { name: `Tổng quan cảm ứng · ${label}`, mobile: !!opts.isMobile && opts.viewport.width < 768 }, problems: watch(dPage) });
    await dctx.close();
  }
  for (const [label, opts, phone] of MAP_TOOL_DEVICES) {
    const tctx = await browser.newContext({ ...opts, locale: 'vi-VN' });
    tctx.setDefaultTimeout(15_000);
    const tPage = await tctx.newPage();
    await mapTools({ page: tPage, vp: { name: `Công cụ bản đồ · ${label}`, mobile: phone }, problems: watch(tPage) }, phone);
    await tctx.close();
  }
  for (const [label, opts, phone] of MAP_LAYER_DEVICES) {
    const lctx = await browser.newContext({ ...opts, locale: 'vi-VN' });
    lctx.setDefaultTimeout(15_000);
    const lPage = await lctx.newPage();
    await mapLayers({ page: lPage, vp: { name: `Lớp & popup bản đồ · ${label}`, mobile: phone }, problems: watch(lPage) }, phone);
    await lctx.close();
  }
  for (const [label, opts, phone] of RESOURCE_DEVICES) {
    const rctx = await browser.newContext({ ...opts, locale: 'vi-VN', acceptDownloads: true });
    rctx.setDefaultTimeout(15_000);
    const rPage = await rctx.newPage();
    const vpR = { name: `Vật tư & Lực lượng · ${label}`, mobile: phone };
    await resourcesPage({ page: rPage, vp: vpR, problems: watch(rPage) });
    await rctx.close();
    if (phone || label.startsWith('Laptop')) {
      const fctx = await browser.newContext({ ...opts, locale: 'vi-VN' });
      fctx.setDefaultTimeout(15_000);
      const fPage = await fctx.newPage();
      await resourcesField({ page: fPage, vp: { name: `Thao tác hiện trường · ${label}`, mobile: phone }, problems: watch(fPage) }, phone);
      await fctx.close();
    }
    if (phone) {
      const wctx = await browser.newContext({ ...opts, locale: 'vi-VN' });
      wctx.setDefaultTimeout(15_000);
      const wPage = await wctx.newPage();
      await resourcesWard({ page: wPage, vp: vpR, problems: watch(wPage) });
      await wctx.close();
    }
  }
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} kiểm tra giao diện THẤT BẠI` : '\nTất cả kiểm tra giao diện đạt');
process.exitCode = failures ? 1 : 0;
