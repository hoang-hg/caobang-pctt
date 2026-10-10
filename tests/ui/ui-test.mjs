#!/usr/bin/env node
// Kiểm thử giao diện bằng trình duyệt thật (Playwright / Chromium) trên khổ MÁY TÍNH và ĐIỆN THOẠI: bấm thử các màn hình
// chính như người dùng thật — cổng công khai (gửi phản ánh, tra cứu), màn hình cán bộ (mọi trang, điều động, duyệt phản
// ánh, nhập dữ liệu bằng form + chọn vị trí trên bản đồ), link nhiệm vụ của trưởng nhóm hiện trường (/nhiem-vu). Mỗi bước
// bắt: lỗi JavaScript trên trang (màn hình trắng), API
// trả 5xx, trang tràn ngang trên điện thoại.
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
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^\w]+/g, '-').slice(0, 80);

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
    for (const a of apis) await page.route(a, (r) => r.abort('failed'));
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
    await page.route(api, async (route) => {
      const res = await route.fetch();
      const json = await res.json();
      const base = json.reservoirs || [];
      const times = Math.ceil(10 / Math.max(base.length, 1));
      json.reservoirs = Array.from({ length: times }, (_, i) => base.map((r) => ({ ...r, id: `${r.id}-${i}`, name: `${r.name} · ${i + 1}` }))).flat();
      for (const r of json.reservoirs) status[r.name] = r.status_code;
      await route.fulfill({ response: res, json });
    });
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
    await page.route(kpis, async (route) => {
      const res = await route.fetch();
      const json = await res.json();
      json.sos = { ...json.sos, overdue: 0, critical: 0, no_team_15m: 2 };
      await route.fulfill({ response: res, json });
    });
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
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} kiểm tra giao diện THẤT BẠI` : '\nTất cả kiểm tra giao diện đạt');
process.exitCode = failures ? 1 : 0;
