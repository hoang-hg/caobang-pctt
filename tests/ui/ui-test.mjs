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
  ['/nguon-du-lieu', 'Nguồn dữ liệu & thiết bị đo'],
  ['/nhap-du-lieu', 'Nhập dữ liệu'],
  ['/phan-quyen', 'Phân quyền'],
  ['/huong-dan', 'Hướng dẫn xử lý'],
];
// Cổng người dân: menu 5 nhóm (docs/ke-hoach-lam-moi-giao-dien.md 6.1) — [nhóm, trang con]; đủ 8 màn như trước
const PUBLIC_TABS = [
  ['Bản đồ cảnh báo'], ['Hồ chứa & sông', 'Hồ chứa & xả lũ'], ['Hồ chứa & sông', 'Mực nước sông suối'], ['Đèo dốc & sạt lở'],
  ['Sơ tán & đường dây nóng', 'Điểm sơ tán an toàn'], ['Sơ tán & đường dây nóng', 'Đường dây nóng'], ['Tra cứu phiếu'], ['Cẩm nang an toàn'],
];
// Mở một màn của cổng: điện thoại mở menu ≡ trước; nhóm có 2 màn thì chọn tiếp trang con (hàng dưới menu). Tên nhóm đứng
// đầu, sau có thể là số đếm ("Hồ chứa & sông 6 hồ xả") — không khớp nhầm nút "Tra cứu phiếu đã gửi"
async function openPublic(page, [group, sub]) {
  const menu = page.getByRole('button', { name: 'Mở menu cổng người dân' });
  if (await menu.isVisible()) await menu.click();
  const esc = group.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await visible(page.getByRole('button', { name: new RegExp(`^${esc}( \\d.*)?$`) })).click();
  if (sub) await visible(page.getByRole('button', { name: sub, exact: true })).click();
}

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
/**
 * Dấu hiệu giao diện "làm cho có" (docs/ke-hoach-lam-moi-giao-dien.md mục 1.3) trên trang đang mở: chữ IN HOA (CSS
 * `text-transform: uppercase`) cho chữ thường dài ≥ 4 ký tự — mã viết hoa sẵn (SOS-1001) không tính; màu chuyển trang trí
 * (`background-image: …gradient`) — trừ dải màu chú giải đánh dấu `data-thang-mau`. Trả danh sách mô tả, rỗng = đạt.
 */
const designFlaws = (page) => page.evaluate(() => {
  const out = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (!el.getClientRects().length) continue;
    const cs = getComputedStyle(el);
    if (cs.textTransform === 'uppercase') {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
      if (own.length >= 4 && own !== own.toUpperCase()) out.add(`chữ IN HOA "${own.slice(0, 30)}"`);
    }
    if (cs.backgroundImage.includes('gradient') && !el.closest('[data-thang-mau]')) {
      out.add(`màu chuyển ở <${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 50)}">`);
    }
  }
  return [...out];
});
const expectNoDesignFlaws = async (page, where) => {
  const flaws = await designFlaws(page);
  if (flaws.length) throw new Error(`${where}: ${flaws.slice(0, 4).join('; ')}${flaws.length > 4 ? ` … (+${flaws.length - 4})` : ''}`);
};

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
      await openPublic(page, tab);
      await page.waitForTimeout(400);
      await expectNoOverflow(ctx, `màn "${tab.join(' › ')}"`);
    }
    await openPublic(page, ['Bản đồ cảnh báo']);
    return `${PUBLIC_TABS.length} tab`;
  });

  if (!vp.mobile) {
    await step(ctx, 'Cổng công khai, trang đăng nhập: không chữ IN HOA, không màu chuyển trang trí (mọi tab)', async () => {
      await page.goto(`${ROOT}/cong-khai`);
      await page.locator('.leaflet-container').first().waitFor({ state: 'attached', timeout: 20_000 });
      for (const tab of PUBLIC_TABS) {
        await openPublic(page, tab);
        await page.waitForTimeout(500);
        await expectNoDesignFlaws(page, `màn "${tab.join(' › ')}"`);
      }
      await page.goto(`${ROOT}/dang-nhap`);
      await page.getByPlaceholder('Nhập tên đăng nhập hoặc email...').waitFor();
      await expectNoDesignFlaws(page, '/dang-nhap');
      return `${PUBLIC_TABS.length} tab + đăng nhập`;
    });
  }

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
      // Tài khoản người dân (Đ5): bắt buộc đăng nhập → đăng ký ngay trong hộp thoại (có dòng Gọi 112), xong thì hiện biểu mẫu
      const regTab = dialog.getByRole('button', { name: 'Đăng ký tài khoản' });
      if (await regTab.isVisible().catch(() => false)) {
        if (!(await dialog.getByRole('link', { name: /Gọi ngay 112/ }).isVisible())) throw new Error('khung đăng nhập thiếu "Gọi ngay 112"');
        await regTab.click();
        await dialog.getByLabel('Họ tên', { exact: true }).fill(`Người dân thử (${vp.name})`);
        await dialog.getByLabel('Số điện thoại', { exact: true }).fill(`0999${String(Date.now()).slice(-6)}`);
        await dialog.getByLabel('Mật khẩu', { exact: true }).fill('Nguoidan2026');
        await dialog.getByRole('checkbox').check();
        await dialog.getByRole('button', { name: 'Đăng ký', exact: true }).click();
        await dialog.locator('textarea').waitFor({ timeout: 15_000 });
      }
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
    await openPublic(page, ['Tra cứu phiếu']);
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
    await step(ctx, `Trang "${label}" (${path}) hiển thị đầy đủ${vp.mobile ? '' : ', không chữ IN HOA, màu chuyển'}`, async () => {
      await page.goto(`${ROOT}${path}`);
      await waitMain(page);
      await page.waitForTimeout(800); // biểu đồ / bản đồ vẽ xong
      if (path === '/ban-do') await expectMapShown(page, path);
      await expectNoOverflow(ctx, path);
      if (!vp.mobile) await expectNoDesignFlaws(page, path);
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
    // Menu "Xuất" của đầu trang (PageHeader) → Báo cáo văn bản
    await page.getByRole('button', { name: 'Xuất', exact: true }).click();
    await page.getByRole('menuitem', { name: /Báo cáo văn bản/ }).click();
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
      if (/trực tiếp|Không có hồ xả lũ lớn/i.test(text)) throw new Error('tab Hồ chứa vẫn khẳng định "an toàn" khi không tải được');
      await expectNoOverflow(ctx, 'tab Hồ chứa (lỗi)');
      await page.goto(`${ROOT}/dashboard?tab=sat_lo`);
      await page.getByText('Không tải được danh sách điểm đen sạt lở').waitFor({ timeout: 25_000 });
      text = await page.locator('main').innerText();
      if (/Không tìm thấy điểm nguy cơ/.test(text)) throw new Error('tab Sạt lở báo "không tìm thấy" khi không tải được');
    } finally {
      for (const a of apis) await page.unroute(a);
    }
  });

  // Bảng số liệu chi tiết có thẻ Hồ chứa (tìm / lọc / phân trang / xuất Excel như các thẻ khác); tab Hồ chứa hiện 9 thẻ rồi "Xem
  // thêm", hồ khẩn luôn ở đầu. Nhân bản danh sách hồ ngay trong trình duyệt (không ghi gì lên máy chủ) để luôn có > 9 thẻ
  await step(ctx, 'Tổng quan: bảng số liệu chi tiết có thẻ Hồ chứa; tab Hồ chứa hiện 9 thẻ + "Xem thêm", hồ khẩn lên đầu', async () => {
    await page.goto(`${ROOT}/dashboard`);
    await waitMain(page);
    // Bảng số liệu thu gọn sẵn dưới Tổng quan — mở ra trước
    const opener = page.getByRole('button', { name: 'Mở bảng số liệu' });
    if (await opener.count()) await opener.click();
    const table = page.locator('section', { hasText: 'Bảng số liệu chi tiết' }).first();
    await table.getByRole('tablist', { name: 'Chuyên đề của bảng' }).getByRole('tab', { name: /Hồ chứa/ }).click();
    const rows = table.locator(vp.mobile ? 'ul[aria-label="Hồ chứa & xả lũ"] > li' : 'tbody tr');
    await rows.first().or(table.getByText('Chưa có hồ chứa trong vùng đang xem')).waitFor({ timeout: 20_000 });
    const inTable = await rows.count();
    if (!inTable) return 'bỏ qua: chưa có hồ chứa';
    if (!(await table.getByText(/Mực nước \/ mức bình thường/i).count())) throw new Error('thẻ Hồ chứa thiếu cột Mực nước / mức bình thường');
    const [xl] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      table.getByRole('button', { name: 'Excel', exact: true }).click(),
    ]);
    if (!/^bang-so-lieu-reservoirs-.*\.xlsx$/.test(xl.suggestedFilename())) throw new Error(`tệp Excel lạ: ${xl.suggestedFilename()}`);

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

  // Thiết kế A.2: ô SOS báo đỏ (viền đỏ, CHỈ nhãn nhấp nháy) khi có phiếu chờ quá 15 phút chưa có lực lượng tiếp nhận — kể cả
  // khi chưa phiếu nào quá hạn theo cấp (cấp 3 hạn 60 phút). Sửa phản hồi KPI ngay trong trình duyệt để có đúng trường hợp đó
  await step(ctx, 'Tổng quan: ô SOS báo đỏ, nhãn nhấp nháy khi có phiếu chờ quá 15 phút chưa có đội (chưa quá hạn theo cấp)', async () => {
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
      // Nhãn đặt ở hàng tiêu đề (ô rộng) hoặc cạnh số (ô hẹp) — chỉ một chỗ hiện tuỳ bề rộng
      await tile.getByText('2 chờ quá 15 phút').filter({ visible: true }).first().waitFor({ timeout: 20_000 });
      const st = await tile.evaluate((el) => ({
        ring: el.className.includes('ring-danger'),
        blink: !!el.querySelector('[class*="animate-blink"]'),
        wholeTile: /animate-blink/.test(el.className),
      }));
      if (!st.ring || !st.blink || st.wholeTile) throw new Error(`ô SOS chưa báo đỏ đúng cách (viền đỏ, chỉ nhãn nhấp nháy): ${JSON.stringify(st)}`);
    } finally {
      await page.unroute(kpis);
    }
  });

  // Thiết kế A — trả lời trong 5 giây "chỗ nào nguy hiểm nhất, việc gì chờ tôi": câu tóm tắt bằng lời (không khẳng định "an
  // toàn"), "Việc chờ quyết định" là khối nội dung đầu tiên (điện thoại: ngay sau 6 ô chỉ số), gợi ý 3 bước lần đầu (tắt
  // được, nhớ trên máy), nút "?" giải thích thuật ngữ, nhật ký lọc bằng nút chữ, không còn thuật ngữ tiếng Anh / viết tắt
  // trên màn. Chỉ xem — "Đã hiểu" chỉ ghi localStorage của trình duyệt kiểm thử
  await step(ctx, 'Tổng quan: câu tóm tắt, "Việc chờ quyết định" lên đầu, gợi ý 3 bước, nút "?", nhật ký lọc bằng chữ, không thuật ngữ tiếng Anh', async () => {
    await page.goto(`${ROOT}/dashboard`);
    await waitMain(page);
    const summary = page.getByRole('status', { name: 'Tóm tắt tình hình' });
    await summary.waitFor({ timeout: 20_000 });
    const sentence = (await summary.innerText()).replace(/\s+/g, ' ').trim();
    if (/an toàn|bình thường/i.test(sentence)) throw new Error(`câu tóm tắt khẳng định "an toàn": ${sentence}`);

    await page.locator('[aria-label="Chỉ số nhanh"] > *').nth(5).waitFor();
    const dec = page.locator('[aria-label="Việc chờ quyết định"]');
    if (await dec.count()) {
      const [d, kpi] = await Promise.all([dec.boundingBox(), page.locator('[aria-label="Chỉ số nhanh"]').boundingBox()]);
      if (vp.mobile ? d.y < kpi.y : d.y > kpi.y) throw new Error(`"Việc chờ quyết định" ${vp.mobile ? 'phải ngay sau' : 'phải đứng trước'} 6 ô chỉ số`);
    }

    // Gợi ý 3 bước: hiện lần đầu, "Đã hiểu" → tải lại không hiện nữa
    const tips = page.getByRole('region', { name: 'Gợi ý cho người mới' });
    if (await tips.count()) {
      const n = await tips.locator('li').count();
      if (n !== 3) throw new Error(`gợi ý có ${n} bước (cần 3)`);
      await tips.getByRole('button', { name: 'Đã hiểu' }).click();
      await page.reload();
      await waitMain(page);
      await summary.waitFor({ timeout: 20_000 });
      if (await tips.count()) throw new Error('bấm "Đã hiểu" rồi tải lại vẫn hiện gợi ý');
    }

    // Nút "?" → một câu giải thích; Esc đóng
    const help = page.getByRole('button', { name: /^Giải thích: Mức báo động/ }).filter({ visible: true }).first();
    await help.click();
    const note = page.getByRole('note');
    await note.getByText(/Báo động III/).waitFor({ timeout: 5_000 });
    await expectNoOverflow(ctx, 'giải thích "?"');
    await page.keyboard.press('Escape');
    await note.waitFor({ state: 'detached', timeout: 5_000 });

    // Nhật ký: nút chữ "Hồ chứa" → chỉ còn sự kiện hồ chứa (hoặc câu "không có sự kiện")
    const filters = page.getByRole('group', { name: 'Lọc nhật ký theo loại' });
    const names = (await filters.getByRole('button').allInnerTexts()).map((t) => t.trim());
    for (const want of ['Tất cả', 'Cứu hộ', 'Hồ chứa', 'Cảnh báo', 'Người dân']) {
      if (!names.includes(want)) throw new Error(`nhật ký thiếu nút lọc "${want}" (có: ${names.join(', ')})`);
    }
    await filters.getByRole('button', { name: 'Hồ chứa', exact: true }).click();
    const log = page.locator('ol[aria-label="Các sự kiện, mới nhất trên cùng"]');
    const kinds = await log.locator('> li').evaluateAll((lis) => lis.map((li) => li.innerText.split('\n').slice(0, 3).join(' ')));
    const off = kinds.filter((t) => !/Hồ chứa|Không có sự kiện/.test(t));
    if (off.length) throw new Error(`lọc "Hồ chứa" còn sự kiện loại khác: ${off[0]}`);
    await filters.getByRole('button', { name: 'Tất cả', exact: true }).click();

    // Mọi biểu đồ (chuyên đề "Tất cả"): tiêu đề là câu kết luận; không còn tiếng Anh / viết tắt trên màn (bỏ nội dung nhật
    // ký — câu do máy chủ ghi — và bản đồ)
    await page.getByRole('group', { name: 'Chuyên đề biểu đồ' }).getByRole('button', { name: 'Tất cả' }).click();
    await page.waitForTimeout(2_000);
    const jargon = await page.evaluate(() => {
      const main = document.querySelector('main').cloneNode(true);
      main.querySelectorAll('ol[aria-label^="Các sự kiện"], .leaflet-container, option').forEach((el) => el.remove());
      const text = main.textContent.replace(/\s+/g, ' ');
      const re = /\b(Dashboard|KPI|SLA|ETA|QPF|Nowcast|P10|P50|P90|Maker|Checker|HEC-HMS|ECMWF|GFS|NOAA|TOC|TB|realtime|Realtime)\b|BĐ\s|[Tt]ác chiến|\d+\s?h(?!\p{L})|mm\/h(?!\p{L})/gu;
      return [...new Set(text.match(re) || [])];
    });
    if (jargon.length) throw new Error(`còn thuật ngữ tiếng Anh / viết tắt trên màn: ${jargon.join(', ')}`);
    await expectNoOverflow(ctx, 'Tổng quan — mọi biểu đồ');
    return sentence.slice(0, 120);
  });

  // Thiết kế A.3 "Hydrograph & Vận hành hồ chứa": dưới biểu đồ thủy văn của trạm có hồ trên cùng sông (bản trình diễn: trạm
  // Cao Bằng – sông Bằng Giang) có biểu đồ lưu lượng xả của các hồ đó, cùng trục thời gian (vạch "Hiện tại" thẳng hàng)
  await step(ctx, 'Tổng quan: biểu đồ thủy văn kèm vận hành hồ chứa cùng sông, cùng trục thời gian', async () => {
    await page.goto(`${ROOT}/dashboard`);
    await waitMain(page);
    if (!(await page.locator('[aria-label="Chọn trạm mực nước"]').count())) return 'bỏ qua: chưa có trạm mực nước';
    // Tiêu đề khối là câu kết luận (đổi theo trạm) — tìm khối theo bộ chọn trạm bên trong
    const sec = page.locator('section', { has: page.locator('[aria-label="Chọn trạm mực nước"]') }).first();
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

  // Phân quyền 3 cấp (thiết kế G): mỗi cấp giải thích bằng lời; tạo tài khoản từng bước — Cấp 3 chọn đúng 1 xã, không có ô
  // mã PIN; Cấp 2 toàn tỉnh, có ô mã PIN; mật khẩu yếu không sang bước sau; "Xem lại" nói rõ việc sẽ xảy ra. Không lưu.
  await step(ctx, 'Tạo tài khoản 4 bước: 3 cấp giải thích bằng lời; Cấp 3 chọn 1 xã, không PIN; Cấp 2 toàn tỉnh, có PIN; Xem lại nói rõ (không lưu)', async () => {
    await page.goto(`${ROOT}/phan-quyen`);
    await waitMain(page);
    const create = visible(page.getByRole('button', { name: 'Tạo tài khoản công vụ' }));
    await create.waitFor({ timeout: READONLY ? 5_000 : 15_000 }).catch((e) => { if (!READONLY) throw e; });
    if (READONLY && !(await create.count())) return 'bỏ qua: tài khoản không quản lý tài khoản (Cấp 3)';
    const tiers = page.getByRole('region', { name: '3 cấp tài khoản' });
    for (const t of ['Quản trị hệ thống', 'Quản trị tỉnh', 'Quản trị xã/phường']) {
      if (!(await tiers.getByRole('heading', { name: new RegExp(`^${t.replace('/', '\\/')}`) }).count())) throw new Error(`thiếu ô giải thích cấp "${t}"`);
    }
    if ((await tiers.getByText('Dành cho:').count()) < 3 || (await tiers.getByText('Làm được:').count()) < 3) throw new Error('mỗi cấp phải có "Dành cho" và "Làm được"');
    await create.click();
    const dialog = page.getByRole('dialog');
    const xa = dialog.getByRole('radio', { name: /Quản trị xã\/phường/ });
    await xa.waitFor(); // các cấp tải từ API sau khi hộp thoại mở (điện thoại chậm hơn)
    const levels = await dialog.getByRole('radio').count();
    // Cấp 1 (tài khoản mặc định của kiểm thử) thấy đủ 3 cấp; Cấp 2 chỉ thấy Cấp 3 (chỉ tạo cấp dưới mình)
    if (!READONLY && levels !== 3) throw new Error(`${levels} cấp được tạo`);
    await xa.check();
    const scope = dialog.getByLabel('Xã/phường phụ trách');
    await scope.locator('option').nth(50).waitFor({ state: 'attached' }); // danh sách 56 xã cũng tải từ API
    const communes = await scope.locator('option').count();
    if (communes < 50) throw new Error(`chỉ có ${communes - 1} xã để chọn`);
    const next = dialog.getByRole('button', { name: /^Tiếp/ });
    if (await next.isEnabled()) throw new Error('chưa chọn xã mà đã sang bước sau được');
    await scope.selectOption({ index: 1 });
    await next.click();
    await dialog.getByLabel('Họ và tên cán bộ').fill('Cán bộ kiểm thử');
    await next.click();
    if (await dialog.getByLabel(/Mã PIN duyệt cảnh báo/).count()) throw new Error('Cấp 3 không được có ô mã PIN');
    await dialog.getByLabel('Tên đăng nhập').fill('kiemthu.giaodien');
    await dialog.getByLabel('Mật khẩu ban đầu').fill('abc');
    if (await next.isEnabled()) throw new Error('mật khẩu yếu mà vẫn sang bước sau được');
    await dialog.getByLabel('Mật khẩu ban đầu').fill('Kiemthu2026');
    await next.click();
    const review = await dialog.innerText();
    if (!/kiemthu\.giaodien/.test(review) || !/lần đầu phải đổi/.test(review)) throw new Error('bước "Xem lại" không nói rõ tài khoản và việc đổi mật khẩu');
    if (!(await dialog.getByRole('button', { name: 'Tạo tài khoản' }).isEnabled())) throw new Error('đủ thông tin mà chưa bấm tạo được');
    await expectNoOverflow(ctx, 'hộp thoại tạo tài khoản', dialog);
    if (levels === 3) {
      await dialog.getByRole('button', { name: /Cấp & địa bàn/ }).click(); // về bước 1
      await dialog.getByRole('radio', { name: /Quản trị tỉnh/ }).check();
      await dialog.getByText('Toàn tỉnh Cao Bằng').waitFor();
      await next.click();
      await next.click();
      await dialog.getByLabel(/Mã PIN duyệt cảnh báo/).waitFor();
    }
    await dialog.getByRole('button', { name: 'Đóng' }).click();
    return `${levels} cấp, ${communes - 1} xã`;
  });

  await step(ctx, READONLY ? 'Mở hộp thoại điều động (không phát lệnh)' : 'Điều động: chọn lực lượng → phát lệnh → báo chưa gửi cho đội', async () => {
    await page.goto(`${ROOT}/cuu-ho`);
    await waitMain(page);
    const btn = visible(page.getByRole('button', { name: 'Điều đội', exact: true }));
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
    // Lệnh điều động 3 bước: Chọn đội → Vật tư mang theo → Xác nhận (tóm tắt lệnh) → Phát lệnh
    await dialog.getByRole('button', { name: /^Tiếp: vật tư/ }).click();
    await dialog.getByRole('button', { name: /^Tiếp: xác nhận/ }).click();
    await dialog.getByText('Tóm tắt lệnh — kiểm tra trước khi phát').waitFor({ timeout: 5_000 });
    await dialog.getByRole('button', { name: 'Phát lệnh điều động' }).click();
    await dialog.getByText(/Đã ghi lệnh điều động SOS-/).waitFor({ timeout: 20_000 });
    // Chưa tích hợp SMS / Push → phải nói rõ hệ thống CHƯA gửi tin cho đội
    const text = await dialog.innerText();
    if (!/chưa gửi tin cho đội|Đã gửi lệnh tới/.test(text)) throw new Error('không nêu trạng thái gửi lệnh cho đội');
    if (!(await dialog.getByRole('button', { name: 'Sao chép lệnh gửi Zalo' }).count())) throw new Error('thiếu nút "Sao chép lệnh gửi Zalo"');
    if (/\bETA\b/.test(text)) throw new Error('kết quả điều động còn chữ "ETA"');
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

  await step(ctx, 'Nhập dữ liệu bằng form: chọn loại bằng thẻ, điền bản ghi, chọn vị trí trên bản đồ, kiểm tra', async () => {
    await page.goto(`${ROOT}/nhap-du-lieu`);
    await waitMain(page);
    const ds = visible(page.getByRole('navigation', { name: 'Loại dữ liệu' }).getByRole('button', { name: /^Điểm nguy hiểm/ }));
    await ds.waitFor({ timeout: READONLY ? 5_000 : 15_000 }).catch((e) => { if (!READONLY) throw e; });
    if (READONLY && !(await ds.count())) return 'bỏ qua: tài khoản không nhập / gửi loại dữ liệu này';
    await ds.click();
    await page.getByRole('button', { name: /^Điền trực tiếp/ }).click();
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
    const verdict = page.getByText(/^(Không có lỗi\.|Còn \d+ lỗi)/).first();
    await verdict.waitFor({ timeout: 20_000 });
    return await verdict.innerText();
  });

  // Thiết kế G — nhập như điền biểu mẫu: tệp mẫu có sẵn dòng ví dụ; chọn tệp là máy kiểm tra ngay; lỗi theo dòng bằng lời kèm
  // cách sửa; nhắc dòng ví dụ còn sót; còn lỗi thì không có nút ghi. Chỉ gửi /validate — không ghi gì.
  await step(ctx, 'Nhập dữ liệu bằng tệp: tệp mẫu có dòng ví dụ; chọn tệp là kiểm tra ngay; lỗi theo dòng kèm cách sửa; chưa ghi gì', async () => {
    await page.goto(`${ROOT}/nhap-du-lieu`);
    await waitMain(page);
    const ds = visible(page.getByRole('navigation', { name: 'Loại dữ liệu' }).getByRole('button', { name: /^Điểm sơ tán/ }));
    await ds.waitFor({ timeout: READONLY ? 5_000 : 15_000 }).catch((e) => { if (!READONLY) throw e; });
    if (READONLY && !(await ds.count())) return 'bỏ qua: tài khoản không nhập / gửi điểm sơ tán';
    await ds.click();
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15_000 }), page.getByRole('button', { name: 'Tải mẫu Excel' }).click()]);
    const tpl = fs.readFileSync(await dl.path(), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
    if (tpl.length < 2) throw new Error('tệp mẫu không có dòng ví dụ');
    const head = tpl[0].split(',');
    const row = (o) => head.map((h) => o[h] ?? '').join(',');
    const csv = [
      tpl[0],
      tpl[1], // dòng 2: còn nguyên dòng ví dụ
      row({ ma: 'KT-ST-02', ten: 'Nhà văn hoá kiểm thử', loai: 'nha_van_hoa', vi_do: '22.6660', kinh_do: '106.2530' }), // dòng 3: thiếu sức chứa
      row({ ma: 'KT-ST-03', ten: 'Trụ sở kiểm thử', loai: 'truong', suc_chua: '120', vi_do: '22.6670', kinh_do: '106.2540' }), // dòng 4: loại sai
    ].join('\r\n');
    await page.locator('input[type="file"]').setInputFiles({ name: 'diem-so-tan-kiem-thu.csv', mimeType: 'text/csv', buffer: Buffer.from(`\uFEFF${csv}`) });
    await page.getByText(/^Còn \d+ lỗi/).first().waitFor({ timeout: 20_000 });
    const errors = page.getByRole('list', { name: 'Lỗi cần sửa' });
    const text = await errors.innerText();
    if (!/Dòng 3[^\n]*Sức chứa/.test(text)) throw new Error('không báo "Dòng 3 · Sức chứa"');
    if (!/Dòng 4[^\n]*Loại/.test(text) || !/Cách sửa: Ghi đúng một trong: Trường học/.test(text)) throw new Error('lỗi "Loại" ở dòng 4 không kèm cách sửa bằng chữ');
    if ((await errors.getByText(/^Cách sửa:/).count()) < 2) throw new Error('lỗi không kèm "Cách sửa"');
    if (!/Dòng 2: Còn nguyên dòng ví dụ/.test(await page.locator('main').innerText())) throw new Error('không nhắc dòng ví dụ còn sót');
    if (await page.getByRole('button', { name: /^(Ghi vào hệ thống|Gửi tỉnh duyệt)$/ }).count()) throw new Error('còn lỗi mà đã có nút ghi');
    await page.getByText('Chưa có gì được ghi vào hệ thống').first().waitFor();
    await expectNoOverflow(ctx, 'kết quả kiểm tra tệp');
    return `${await errors.locator(':scope > li').count()} lỗi theo dòng, kèm cách sửa`;
  });

  // Hồ sơ xã gửi: "Duyệt" / "Trả lại" — trả lại phải ghi lý do (chạm chọn nhanh lý do hay gặp). Không bấm duyệt / trả lại.
  await step(ctx, 'Hồ sơ xã gửi: nút "Duyệt" và "Trả lại"; trả lại phải có lý do, chọn nhanh được (không bấm)', async () => {
    await page.goto(`${ROOT}/nhap-du-lieu?tab=ho-so`);
    await waitMain(page);
    const first = page.getByRole('list', { name: 'Danh sách hồ sơ' }).getByRole('button').first();
    if (!(await first.waitFor({ timeout: 8_000 }).then(() => true, () => false))) return 'bỏ qua: không có hồ sơ chờ duyệt';
    await first.click();
    const back = page.getByRole('button', { name: 'Trả lại', exact: true });
    if (!(await back.waitFor({ timeout: 10_000 }).then(() => true, () => false))) return 'bỏ qua: tài khoản không duyệt hồ sơ này';
    await page.getByRole('button', { name: 'Duyệt', exact: true }).waitFor();
    await back.click();
    const confirmBack = page.getByRole('button', { name: 'Trả lại hồ sơ' });
    if (await confirmBack.isEnabled()) throw new Error('chưa ghi lý do mà đã trả lại được');
    await page.getByRole('group', { name: 'Lý do hay gặp' }).getByRole('button').first().click();
    if (!(await confirmBack.isEnabled())) throw new Error('đã chọn lý do mà chưa trả lại được');
    await expectNoOverflow(ctx, 'hồ sơ xã gửi');
    await page.getByRole('button', { name: 'Quay lại', exact: true }).click();
    return 'trả lại phải có lý do';
  });

  // Nguồn dữ liệu (thiết kế G): mỗi nguồn MỘT câu trạng thái bằng lời; khoá, địa chỉ máy chủ, câu lệnh gửi thử chỉ thấy khi mở
  // "Nâng cao"
  await step(ctx, 'Nguồn dữ liệu: mỗi nguồn một câu trạng thái; khoá, câu lệnh kỹ thuật chỉ hiện khi mở "Nâng cao"', async () => {
    await page.goto(`${ROOT}/nguon-du-lieu`);
    await waitMain(page);
    const list = page.getByRole('list', { name: 'Các nguồn dữ liệu' });
    if (!(await list.waitFor({ timeout: 10_000 }).then(() => true, () => false))) return 'bỏ qua: tài khoản không xem nguồn dữ liệu';
    const items = list.locator(':scope > li');
    const n = await items.count();
    for (let i = 0; i < n; i += 1) {
      const line = (await items.nth(i).locator('[data-trang-thai]').innerText()).trim();
      if (line.length < 10) throw new Error(`nguồn thứ ${i + 1} không có câu trạng thái`);
    }
    const tech = (main) => ['curl ', 'X-Device-Key', 'Bearer', 'mosquitto_pub'].filter((w) => main.includes(w));
    const hidden = tech(await page.locator('main').innerText());
    if (hidden.length) throw new Error(`chữ kỹ thuật lộ ra ngoài "Nâng cao": ${hidden.join(', ')}`);
    const push = items.filter({ hasText: 'Cổng nhận số đo' }).first();
    if (await push.count()) {
      await push.getByText('Nâng cao — dành cho kỹ thuật viên').click();
      if (!tech(await push.innerText()).length) throw new Error('mở "Nâng cao" mà không thấy câu lệnh gửi thử');
    }
    await expectNoOverflow(ctx, '/nguon-du-lieu');
    return `${n} nguồn, mỗi nguồn một câu trạng thái`;
  });

  // Phân quyền: "Khoá" hỏi lại bằng câu nói rõ hậu quả (bị đăng xuất ngay trên mọi máy). Bấm Huỷ — không khoá.
  await step(ctx, 'Phân quyền: "Khoá" hỏi lại, nói rõ hậu quả (Huỷ — không khoá)', async () => {
    await page.goto(`${ROOT}/phan-quyen`);
    await waitMain(page);
    const lock = visible(page.getByRole('button', { name: 'Khoá', exact: true }));
    if (!(await lock.waitFor({ timeout: 10_000 }).then(() => true, () => false))) return 'bỏ qua: không có tài khoản cấp dưới để khoá';
    await lock.click();
    const dialog = page.getByRole('dialog', { name: /^Khoá tài khoản của / });
    await dialog.waitFor();
    if (!/đăng xuất ngay trên mọi máy/.test(await dialog.innerText())) throw new Error('hộp hỏi lại không nói rõ hậu quả');
    await dialog.getByRole('button', { name: 'Huỷ' }).click();
    await dialog.waitFor({ state: 'detached' });
    return 'hỏi lại trước khi khoá';
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
// Thanh trên cùng không tràn ngang (trước 10/2026 tràn 7–185 px ở 640–1024 px, ô tìm kiếm bị ép mất) và bộ lọc xã/phường
// luôn nằm trên thanh (trước đây dưới 1024 px nằm trong menu ☰). Mở thẳng trang, không bấm gì trước → nhãn "Bấm để bật
// chuông SOS" còn hiện (trường hợp chật nhất). Chỉ xem.
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
      const filter = page.locator('header [title="Lọc dữ liệu theo địa phương"]');
      if (!(await filter.isVisible())) throw new Error('không thấy bộ lọc xã/phường trên thanh trên cùng');
      await filter.click();
      const dlg = page.getByRole('dialog', { name: /Chọn địa bàn/ });
      await dlg.waitFor({ timeout: 5_000 });
      await page.keyboard.press('Escape');
      await dlg.waitFor({ state: 'hidden', timeout: 5_000 });
      return `bộ lọc trên thanh (${(await filter.innerText()).trim()})`;
    });
  }
}

// ================================================================ Màn hình đầu theo thiết bị (lãnh đạo nắm tình hình trong vài giây)
// Không cuộn vẫn thấy: dải tình huống, đủ 6 ô KPI (không bị thanh đáy che), bản đồ (laptop / iPad), "Việc chờ quyết định"
// (laptop). Chỉ <main> cuộn — trang không được dài ra ngoài khung (10/2026: caption ẩn của bảng làm cả ứng dụng trôi lên
// khi cuộn hết, lộ khoảng trắng). Chỉ xem.
const FIRST_SCREEN = { name: 'Màn hình đầu', opts: { viewport: { width: 1366, height: 768 } }, mobile: false };
const SCREENS = [
  // Màn lớn phòng điều hành (≥ 1680 px): 2 cột — việc chờ + 6 ô số bên trái, bản đồ bên phải (docs/ke-hoach-lam-moi-giao-dien.md 6.3)
  ['Màn lớn 1920×1080', 1920, 1080, { map: true, decisions: true, twoCol: true }],
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
    const parts = ['dải tình huống', '6 KPI', need.map && 'bản đồ', need.decisions && 'việc chờ quyết định', need.twoCol && 'bản đồ cạnh việc chờ'].filter(Boolean).join(', ');
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
        // Thanh trạng thái dưới cùng (màn rộng, đủ cao): vùng nội dung kết thúc ở mép trên của thanh
        const bar = document.querySelector('footer[aria-label="Thanh trạng thái"]');
        const barTop = bar && bar.getBoundingClientRect().height ? bar.getBoundingClientRect().top : vh;
        const tiles = [...document.querySelectorAll('[aria-label="Chỉ số nhanh"] > *')];
        const map = document.querySelector('.leaflet-container');
        const dec = document.querySelector('[aria-label="Việc chờ quyết định"]');
        const strip = document.querySelector('main [role="status"]');
        const main = document.querySelector('main');
        return {
          pageExtra: document.documentElement.scrollHeight - vh,
          wideBy: main ? main.scrollWidth - main.clientWidth : 0,
          tiles: tiles.length,
          kpiBottom: Math.round(Math.max(...tiles.map((t) => t.getBoundingClientRect().bottom))),
          visibleBottom: Math.round(Math.min(navTop, barTop)),
          mapVisible: map ? Math.round(Math.min(navTop, barTop, map.getBoundingClientRect().bottom) - map.getBoundingClientRect().top) : 0,
          decisionTop: dec ? Math.round(dec.getBoundingClientRect().top) : null,
          mapLeft: map ? Math.round(map.getBoundingClientRect().left) : null,
          decisionRight: dec ? Math.round(dec.getBoundingClientRect().right) : null,
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
        need.twoCol && !(m.mapLeft > m.decisionRight) && `bản đồ không nằm cạnh "Việc chờ quyết định" (bản đồ từ ${m.mapLeft}px, việc chờ tới ${m.decisionRight}px)`,
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
// xếp Đỏ → Cam → Vàng; chế độ xem "Xem tình hình" bớt điểm trên bản đồ, "Điều hành" trả lại như cũ; thanh thời gian: mốc chữ,
// nút Phát chạy từng giờ (laptop, iPad ngang); máy cảm ứng: mọi vùng chạm
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
  await step(ctx, 'Tab Điểm nóng đứng đầu, xếp Đỏ → Cam → Vàng; chế độ "Xem tình hình" bớt điểm, "Điều hành" trả lại như cũ, có câu giải thích', async () => {
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
    await modes.getByRole('button', { name: 'Xem tình hình', exact: true }).click();
    await page.waitForTimeout(800);
    const situation = await markers();
    await modes.getByRole('button', { name: 'Điều hành', exact: true }).click();
    await page.waitForTimeout(800);
    const back = await markers();
    // Câu giải thích chế độ đang chọn ngay dưới nút (Điều hành: kèm mẹo kéo – thả đội vào điểm cầu cứu)
    if (!(await page.getByText(/để điều đội/).first().isVisible())) throw new Error('thiếu câu giải thích chế độ "Điều hành"');
    if (layout === 'scroll') await page.keyboard.press('Escape');
    if (!(situation < before) || back < before - 2) throw new Error(`số điểm: ${before} → Xem tình hình ${situation} → Điều hành ${back}`);
    return `${levels.length} điểm nóng đang hiện · ${before} → ${situation} → ${back} điểm trên bản đồ`;
  });
  if (layout === 'grid') {
    await step(ctx, 'Thanh thời gian: mốc "12 giờ trước · Bây giờ · 24 giờ tới", nút Phát chạy từng giờ, chọn "Bây giờ" thì dừng', async () => {
      const now = page.getByRole('status', { name: 'Thời điểm đang xem' });
      if (!/Bây giờ/.test(await now.innerText())) throw new Error(`mở bản đồ không ở "Bây giờ": ${await now.innerText()}`);
      await page.getByText('12 giờ trước', { exact: true }).first().waitFor({ timeout: 5_000 });
      await page.getByText('24 giờ tới', { exact: true }).first().waitFor({ timeout: 5_000 });
      await page.getByRole('button', { name: /^Phát/ }).click();
      await page.waitForFunction(() => /\d+ giờ tới/.test(document.querySelector('[aria-label="Thời điểm đang xem"]')?.innerText || ''), null, { timeout: 6_000 });
      const playing = (await now.innerText()).replace(/\s+/g, ' ');
      if (!(await page.getByText(/Đổi theo giờ:/).first().isVisible())) throw new Error('đang xem giờ khác nhưng không nói lớp nào đổi theo giờ');
      await page.getByRole('button', { name: 'Bây giờ', exact: true }).click();
      await page.waitForTimeout(2_000);
      const after = (await now.innerText()).replace(/\s+/g, ' ');
      if (!/^Bây giờ/.test(after)) throw new Error(`chọn "Bây giờ" nhưng thanh vẫn chạy: ${after}`);
      return `Phát → ${playing} · dừng ở ${after}`;
    });
  }
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
  // Tìm theo vai trò + nhãn (không theo lớp CSS — lớp nổi đổi kiểu không làm hỏng bài)
  const hint = visible(page.locator('[role="status"]').filter({ hasText: 'Đang dùng: Dò đường an toàn' }));
  const card = visible(page.getByRole('region', { name: 'Phân tích vùng khoanh' }));
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
      const gates = t.match(/Cửa xả đang mở (\d+)\/\d+/)?.[1];
      const flow = t.match(/Đang xả ([\d.,]+) m³\/s/)?.[1];
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
    else if (!(await page.getByRole('checkbox', { name: /Xuồng, xe, máy xúc/ }).count())) {
      await visible(page.getByRole('button', { name: /Lớp dữ liệu/ })).click();
    }
    const box = page.getByRole('checkbox', { name: /Xuồng, xe, máy xúc/ });
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

/**
 * Sổ xuất – nhập kho (DB7) ở thẻ Kho vật tư — chỉ xem: "Sổ xuất – nhập" trên thẻ kho mở khối sổ đã lọc sẵn đúng kho; mọi dòng
 * đang hiện thuộc kho đó; Excel tải được; không tràn ngang; cảm ứng: vùng chạm của khối ≥ 44 px.
 */
async function inventoryLedger(ctx) {
  const { page } = ctx;
  await step(ctx, 'Sổ xuất – nhập kho: mở từ thẻ kho (lọc sẵn đúng kho), dòng đúng kho, Excel, không tràn, vùng chạm ≥ 44 px', async () => {
    await page.goto(`${ROOT}/nguon-luc?tab=vat_tu`);
    const link = page.getByRole('button', { name: /^Sổ xuất – nhập của / }).first();
    await link.waitFor({ timeout: 20_000 });
    const wh = (await link.getAttribute('aria-label')).replace('Sổ xuất – nhập của ', '');
    if (await page.locator('#so-kho [aria-label="Khoảng thời gian của sổ kho"]').count()) throw new Error('khối sổ kho mở sẵn — phải thu gọn, chưa tải');
    await link.click();
    const sec = page.locator('#so-kho');
    await sec.getByText(/dòng sổ/).first().waitFor({ timeout: 15_000 });
    await sec.getByRole('button', { name: new RegExp(`Bỏ lọc Kho: ${wh.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).waitFor({ timeout: 5_000 });
    const items = sec.locator('tbody tr, ul[aria-label="Sổ xuất – nhập kho"] > li');
    const n = await items.count();
    const wrong = (await items.allInnerTexts()).filter((t) => !t.includes(wh));
    if (wrong.length) throw new Error(`${wrong.length}/${n} dòng không thuộc ${wh}`);
    if (n) {
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15_000 }), sec.getByRole('button', { name: /Excel/ }).click()]);
      if (!/^so-xuat-nhap-kho-.*\.xlsx$/.test(download.suggestedFilename())) throw new Error(`tên tệp Excel: ${download.suggestedFilename()}`);
    }
    await expectNoOverflow(ctx, 'sổ xuất – nhập kho');
    if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) {
      const bad = await sec.evaluate((el) => [...el.querySelectorAll('button, input, select')]
        .filter((e) => e.getBoundingClientRect().width > 0)
        .map((e) => ({ s: Math.round(Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height)), t: (e.getAttribute('aria-label') || e.innerText || '').slice(0, 24) }))
        .filter((x) => x.s < 44));
      if (bad.length) throw new Error(`${bad.length} vùng chạm < 44 px — ${bad.slice(0, 4).map((x) => `${x.t} ${x.s}px`).join(', ')}`);
    }
    return `${wh}: ${n} dòng`;
  });
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

  // Chỉnh giao diện cho người mới (thiết kế C): mở trang thấy ngay "Cần bổ sung / cần sửa" — mỗi kho thiếu một câu + một nút
  await step(ctx, '"Cần bổ sung / cần sửa": mỗi việc một câu + một nút, đứng trên các thẻ danh mục', async () => {
    const n = Number((await kpis.getByRole('button', { name: /Kho cạn kiệt/ }).innerText()).match(/(\d+)\s*kho dưới/)?.[1] ?? 0);
    if (!n) return 'không có kho cạn kiệt';
    const todo = page.getByRole('list', { name: 'Việc cần bổ sung, sửa chữa' });
    await todo.waitFor({ timeout: 10_000 });
    const lines = await todo.locator(':scope > li').allInnerTexts();
    const low = lines.filter((t) => /định mức — cần bổ sung/.test(t));
    if (!low.length) throw new Error('khối không có dòng kho thiếu hàng');
    if (!lines.every((t) => /Nhập kho|Xuất kho|Báo tình trạng|Xem/.test(t))) throw new Error('có việc không kèm nút xử lý');
    const [a, b] = await Promise.all([todo.boundingBox(), tabs.boundingBox()]);
    if (a.y > b.y) throw new Error('khối "Cần bổ sung / cần sửa" nằm dưới các thẻ danh mục');
    await expectNoOverflow(ctx, 'khối cần bổ sung');
    return `${lines.length} việc đang hiện, ${low.length} kho thiếu hàng`;
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

  if (!vp.mobile) {
    // Laptop, iPad: khối biểu đồ mở sẵn (điện thoại mặc định thu gọn để danh sách lên trước)
    await step(ctx, 'Biểu đồ cho lãnh đạo: quân số theo loại lực lượng, phương tiện theo nhóm, phân bổ kho có Y tế, "Theo mặt hàng" thiếu nhất lên đầu', async () => {
      await page.goto(`${ROOT}/nguon-luc`);
      await page.getByRole('img', { name: /^Quân số theo loại lực lượng/ }).waitFor({ timeout: 20_000 });
      await page.goto(`${ROOT}/nguon-luc?tab=phuong_tien`);
      await page.getByRole('img', { name: /^Phương tiện theo nhóm/ }).waitFor({ timeout: 20_000 });
      await page.goto(`${ROOT}/nguon-luc?tab=vat_tu`);
      await page.locator('main').getByText('Y tế', { exact: true }).first().waitFor({ timeout: 20_000 });
      await page.getByRole('group', { name: 'Cách xem dự trữ' }).getByRole('button', { name: 'Theo mặt hàng' }).click();
      const list = page.getByRole('list', { name: 'Tồn kho theo mặt hàng' });
      await list.waitFor();
      const pcts = (await list.locator(':scope > li').allInnerTexts()).map((t) => Number(t.match(/(\d+)%/)?.[1])).filter((x) => !Number.isNaN(x));
      if (!pcts.length || pcts.some((x, i) => i && pcts[i - 1] > x)) throw new Error(`"Theo mặt hàng" chưa xếp thiếu nhất lên đầu: ${pcts.slice(0, 6)}`);
      return `${pcts.length} mặt hàng, thấp nhất ${pcts[0]}%`;
    });
  }

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

// ================================================================ Điều hành cứu hộ (trang D) — laptop, iPad dọc, điện thoại 360
// Dải khẩn trên cùng, 4 ô chỉ số; ô "Quá hạn phản hồi" → đúng các phiếu quá hạn, Quay lại trả bộ lọc cũ; bảng điều phối: đủ 4 cột
// trên laptop, thẻ chọn cột vừa màn trên điện thoại / iPad; "Danh sách": phân trang, xếp, Excel (laptop thêm PDF); không tải
// được phiếu → nói rõ, không ghi "không có phiếu"; mất mạng → nút ghi tắt; cảm ứng: vùng chạm ≥ 44 px; tài khoản phường: chỉ
// phiếu trong phường, không có nút Điều đội. Form (sơ tán, tiếp nhận, sửa phiếu, huỷ lệnh) chỉ mở, kiểm tra lỗi, đóng; thanh
// thao tác nhanh (điện thoại); bản đồ tác chiến & diễn biến 48 giờ, kỳ tra cứu 7 / 30 ngày. Chỉ xem — không chuyển trạng
// thái, không điều động, không ghi số liệu.
const RESCUE_DEVICES = RESOURCE_DEVICES;

async function rescuePage(ctx) {
  const { page, vp } = ctx;
  const strip = page.getByRole('status', { name: 'Thông tin khẩn cứu hộ' });
  const kpis = page.getByRole('group', { name: 'Chỉ số cứu hộ' });
  const cards = page.locator('main article[aria-label^="SOS-"]');
  const touch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  const wide = await page.evaluate(() => innerWidth >= 1280);

  await step(ctx, 'Mở Điều hành cứu hộ: dải khẩn trên cùng, 4 ô chỉ số, bảng điều phối (laptop 4 cột / thẻ chọn cột vừa màn)', async () => {
    await loginAs(page, STAFF);
    await page.goto(`${ROOT}/cuu-ho`);
    await kpis.getByRole('button').first().waitFor({ timeout: 20_000 });
    await strip.waitFor({ timeout: 20_000 });
    const m = await page.evaluate(() => {
      const box = (sel) => document.querySelector(sel)?.getBoundingClientRect();
      const tabs = [...document.querySelectorAll('[aria-label="Cột của bảng điều phối"] > button')].map((b) => b.getBoundingClientRect());
      return {
        stripAbove: box('[aria-label="Thông tin khẩn cứu hộ"]').top < box('[aria-label="Chỉ số cứu hộ"]').top,
        kpi: document.querySelectorAll('[aria-label="Chỉ số cứu hộ"] > button').length,
        columns: document.querySelectorAll('main section[aria-label*=" phiếu"]').length,
        tabs: tabs.length,
        tabsOut: tabs.filter((t) => t.right > innerWidth + 1 || t.left < -1).length,
      };
    });
    if (!m.stripAbove) throw new Error('dải thông tin khẩn không nằm trên cùng');
    if (m.kpi !== 4) throw new Error(`có ${m.kpi} ô chỉ số (cần 4, bấm được)`);
    if (wide ? m.columns !== 4 : m.tabs !== 4 || m.tabsOut) throw new Error(`laptop ${m.columns} cột / ${m.tabs} thẻ cột, ${m.tabsOut} thẻ tràn màn`);
    // Lời đời thường: không còn thuật ngữ tiếng Anh / chữ "tác chiến" trên trang (thiết kế D, chỉnh giao diện cho người mới)
    const jargon = (await page.locator('main').innerText()).match(/\b(SLA|ETA|KPI)\b|[Tt]ác chiến/);
    if (jargon) throw new Error(`trang còn thuật ngữ "${jargon[0]}"`);
    await expectNoOverflow(ctx, '/cuu-ho');
    return wide ? '4 cột' : '4 thẻ cột';
  });

  await step(ctx, 'Chạm ô "Quá hạn phản hồi" → chỉ phiếu quá hạn; Quay lại trả bộ lọc cũ', async () => {
    const tile = kpis.getByRole('button', { name: /Quá hạn phản hồi/ });
    const n = Number((await tile.innerText()).match(/(\d+)\s*phiếu/)?.[1] ?? 0);
    const before = page.url();
    await tile.click();
    await page.waitForURL(/th=qua_han/);
    if (n > 0) {
      await cards.first().waitFor({ timeout: 10_000 });
      const labels = await cards.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
      if (!labels.every((l) => /quá hạn phản hồi/.test(l))) throw new Error('có phiếu không quá hạn trong danh sách đã lọc');
      if (wide && labels.length !== n) throw new Error(`ô ghi ${n} phiếu quá hạn, bảng hiện ${labels.length}`);
    } else {
      await page.getByText(/Không có phiếu khớp bộ lọc/).first().waitFor({ timeout: 5_000 });
    }
    await page.goBack();
    await page.waitForURL((u) => u.toString() === before, { timeout: 5_000 });
    return `${n} phiếu quá hạn`;
  });

  await step(ctx, 'Danh sách: phân trang, xếp "chờ lâu nhất", Excel (và PDF trên laptop) mọi phiếu đang lọc', async () => {
    await page.getByRole('group', { name: 'Cách xem phiếu' }).getByRole('button', { name: 'Danh sách' }).click();
    await page.waitForURL(/xem=danh_sach/);
    await cards.first().or(page.locator('main table tbody tr').first()).waitFor({ timeout: 10_000 });
    const sortBox = page.getByLabel('Sắp xếp');
    if (!(await sortBox.isVisible())) await page.getByRole('button', { name: /^Bộ lọc/ }).click();
    await sortBox.selectOption('cho_lau');
    const [xlsx] = await Promise.all([page.waitForEvent('download', { timeout: 20_000 }), page.getByRole('button', { name: 'Excel', exact: true }).click()]);
    if (!/^phieu-sos-.*\.xlsx$/.test(xlsx.suggestedFilename())) throw new Error(`tên tệp Excel: ${xlsx.suggestedFilename()}`);
    let note = xlsx.suggestedFilename();
    if (wide) {
      const [pdfFile] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.getByRole('button', { name: 'PDF', exact: true }).click()]);
      if (!/^phieu-sos-.*\.pdf$/.test(pdfFile.suggestedFilename())) throw new Error(`tên tệp PDF: ${pdfFile.suggestedFilename()}`);
      note += ` · ${pdfFile.suggestedFilename()}`;
    }
    await expectNoOverflow(ctx, '/cuu-ho?xem=danh_sach');
    return note;
  });

  await step(ctx, 'Không tải được phiếu → báo rõ (không ghi "không có phiếu"); mất mạng → dải báo, nút Điều đội tắt', async () => {
    await page.route('**/api/v1/sos', safeRoute((r) => (r.request().method() === 'GET' ? r.abort('failed') : r.continue())));
    await page.route('**/api/v1/sos?**', safeRoute((r) => r.abort('failed')));
    try {
      await page.goto(`${ROOT}/cuu-ho`);
      await page.getByText(/Không tải được danh sách phiếu SOS/).first().waitFor({ timeout: 20_000 });
      if (await page.getByText(/Không có phiếu mới báo/).count()) throw new Error('lỗi tải nhưng vẫn ghi "không có phiếu"');
    } finally {
      await page.unroute('**/api/v1/sos');
      await page.unroute('**/api/v1/sos?**');
    }
    await page.goto(`${ROOT}/cuu-ho`);
    const btn = page.getByRole('button', { name: 'Điều đội', exact: true }).first();
    const hasDispatch = await btn.waitFor({ timeout: 15_000 }).then(() => true, () => false);
    await page.context().setOffline(true);
    try {
      await page.getByText('Mất kết nối mạng').waitFor({ timeout: 5_000 });
      if (hasDispatch && !(await btn.isDisabled())) throw new Error('mất mạng nhưng nút Điều đội vẫn bấm được');
    } finally {
      await page.context().setOffline(false);
    }
    return hasDispatch ? 'nút Điều đội tắt khi mất mạng' : 'không có phiếu chờ điều đội';
  });

  if (touch) {
    await step(ctx, 'Màn cảm ứng: mọi vùng chạm của bảng điều phối và danh sách ≥ 44 px', async () => {
      const bad = [];
      for (const path of ['/cuu-ho', '/cuu-ho?xem=danh_sach']) {
        await page.goto(`${ROOT}${path}`);
        await kpis.getByRole('button').first().waitFor({ timeout: 20_000 });
        await page.waitForTimeout(800);
        for (const s of await smallTargets(page)) bad.push(`${path}: ${s.what} ${s.size}px`);
      }
      if (bad.length) throw new Error(`${bad.length} vùng chạm < 44 px — ${bad.slice(0, 5).join(', ')}`);
    });
  }
}

/**
 * Form của trang D — chỉ mở, kiểm tra lỗi, đóng (không ghi dữ liệu): sơ tán 2 bước, tiếp nhận 2 bước, sửa phiếu, huỷ lệnh;
 * điện thoại: thanh thao tác nhanh (phiếu chờ, thực thi, sơ tán tắt khi mất mạng; nội dung cuối trang không bị thanh che).
 */
async function rescueForms(ctx) {
  const { page, vp } = ctx;
  const dlg = page.getByRole('dialog');
  const bar = page.getByRole('navigation', { name: 'Thao tác nhanh' });
  const touch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  const open = async (path = '/cuu-ho') => {
    await page.goto(`${ROOT}${path}`);
    await page.getByRole('group', { name: 'Chỉ số cứu hộ' }).getByRole('button').first().waitFor({ timeout: 20_000 });
  };
  const noSmall = async (where) => {
    if (!touch) return;
    const bad = await smallTargets(page);
    if (bad.length) throw new Error(`${where}: ${bad.length} vùng chạm < 44 px — ${bad.slice(0, 5).map((s) => `${s.what} ${s.size}px`).join(', ')}`);
  };

  await step(ctx, 'Form "Cập nhật sơ tán" 2 bước: chạm chọn xã (tìm không dấu) → số liệu; lỗi ngay dưới ô; bấm Lưu khi thiếu → con trỏ về ô lỗi', async () => {
    await open();
    if (!(await page.getByRole('button', { name: '+ Cập nhật xã' }).count())) return 'tài khoản không có quyền cập nhật sơ tán';
    const opener = vp.mobile ? bar.getByRole('button', { name: /Sơ tán/ }) : page.getByRole('button', { name: '+ Cập nhật xã' });
    await opener.click();
    await dlg.waitFor();
    await dlg.getByLabel('Tìm xã / phường').fill(norm(WARD.name));
    const items = dlg.getByRole('list', { name: 'Chọn xã / phường' }).getByRole('button');
    await items.first().waitFor({ timeout: 5_000 });
    const names = await items.allInnerTexts();
    if (!names.every((t) => norm(t).includes(norm(WARD.name)))) throw new Error(`tìm "${norm(WARD.name)}" ra: ${names.join(' | ')}`);
    await noSmall('bước chọn xã');
    await items.first().click();
    const planned = dlg.getByLabel(/Hộ phải sơ tán/);
    await planned.fill('9999999');
    const err1 = (await dlg.locator('#loi-so-tan-planned_households').innerText().catch(() => '')).trim();
    if (!err1 || (await planned.getAttribute('aria-invalid')) !== 'true') throw new Error('số hộ quá lớn không báo lỗi ngay dưới ô');
    await planned.fill('10');
    await dlg.getByLabel(/Nhân khẩu đã sơ tán/).fill('');
    await dlg.getByRole('button', { name: /Lưu số liệu/ }).click();
    await dlg.locator('#loi-so-tan-evacuated_persons').waitFor({ timeout: 3_000 });
    const focus = await page.evaluate(() => ({ id: document.activeElement?.id, bad: document.activeElement?.getAttribute('aria-invalid') }));
    if (focus.bad !== 'true') throw new Error(`bấm Lưu khi thiếu số: con trỏ ở "${focus.id}", không về ô lỗi`);
    await expectNoOverflow(ctx, 'form sơ tán', dlg);
    await noSmall('bước số liệu');
    await dlg.getByRole('button', { name: 'Huỷ', exact: true }).click();
    await dlg.waitFor({ state: 'hidden' });
    return err1;
  });

  await step(ctx, 'Nhận tin báo 2 bước: SĐT sai báo ngay khi gõ; nội dung ngắn báo khi bấm "Tự điền"; bước 2: mức ưu tiên kèm hạn phản hồi bằng lời, số người −/+', async () => {
    const box = page.locator('section').filter({ has: page.getByRole('heading', { name: /Nhận tin báo cứu hộ/ }) }).first();
    if (!(await box.count())) return 'tài khoản không có quyền tạo phiếu SOS';
    await box.scrollIntoViewIfNeeded();
    const phoneBox = box.getByLabel(/SĐT người báo tin/);
    await phoneBox.fill('12345');
    if ((await phoneBox.getAttribute('aria-invalid')) !== 'true') throw new Error('SĐT sai không báo ngay khi gõ');
    await phoneBox.fill('0912 345 678');
    const text = box.getByLabel(/Nội dung tin cầu cứu/);
    await text.fill('ngập');
    await box.getByRole('button', { name: /Tự điền & kiểm tra/ }).click();
    await box.locator('#loi-noi-dung-tiep-nhan').waitFor({ timeout: 3_000 });
    if (READONLY) return 'chỉ xem: không gọi bóc tách';
    await text.fill('Nước ngập đến mái nhà ở xóm Pác Bó, 5 người có 1 cụ già');
    await box.getByRole('button', { name: /Tự điền & kiểm tra/ }).click();
    await box.getByRole('button', { name: 'Tạo phiếu', exact: true }).waitFor({ timeout: 15_000 });
    const step2 = await box.innerText();
    if (!/phản hồi trong 3 phút/.test(step2)) throw new Error('mức ưu tiên không ghi hạn phản hồi bằng lời');
    if (/SLA|mô hình AI/.test(step2)) throw new Error('bước 2 còn chữ "SLA" / "mô hình AI"');
    const picked = (await box.getByRole('radio', { checked: true }).allInnerTexts()).map((s) => s.replace(/\s+/g, ' '));
    if (!(await box.getByRole('button', { name: 'Thêm 1', exact: true }).count())) throw new Error('bước 2 không có nút −/+ số người');
    await noSmall('tiếp nhận bước 2');
    await box.getByRole('button', { name: 'Quay lại' }).click();
    return picked.join(' · ') || 'bóc tách chưa chọn mức';
  });

  await step(ctx, 'Sửa phiếu: Lưu khi chưa đổi gì → nói rõ; Huỷ lệnh thiếu lý do → báo dưới ô, con trỏ về ô lý do', async () => {
    await open();
    const notes = [];
    const edit = visible(page.getByRole('button', { name: /^Sửa phiếu SOS-/ }));
    if (await edit.count()) {
      await edit.click();
      await dlg.waitFor();
      await dlg.getByRole('button', { name: 'Lưu', exact: true }).click();
      await dlg.getByText(/Chưa thay đổi gì/).waitFor({ timeout: 3_000 });
      await expectNoOverflow(ctx, 'form sửa phiếu', dlg);
      await noSmall('form sửa phiếu');
      await dlg.getByRole('button', { name: 'Huỷ', exact: true }).click();
      await dlg.waitFor({ state: 'hidden' });
      notes.push('sửa phiếu');
    }
    // Lệnh điều động đang chạy ở cột "Đang thực thi" (bảng hẹp: thẻ cột trên địa chỉ trang)
    await open('/cuu-ho?cot=thuc_thi');
    const cancel = visible(page.getByRole('button', { name: /Huỷ lệnh/ }));
    if (await cancel.count()) {
      await cancel.click();
      await dlg.waitFor();
      await dlg.getByRole('button', { name: 'Huỷ lệnh', exact: true }).click();
      await dlg.locator('#loi-ly-do-huy').waitFor({ timeout: 3_000 });
      const focused = await page.evaluate(() => document.activeElement?.id);
      if (focused !== 'ly-do-huy') throw new Error(`con trỏ ở "${focused}", không về ô lý do`);
      await expectNoOverflow(ctx, 'form huỷ lệnh', dlg);
      await noSmall('form huỷ lệnh');
      await dlg.getByRole('button', { name: 'Đóng', exact: true }).last().click();
      await dlg.waitFor({ state: 'hidden' });
      notes.push('huỷ lệnh');
    }
    return notes.length ? notes.join(', ') : 'không có phiếu để sửa / lệnh để huỷ';
  });

  if (vp.mobile) {
    await step(ctx, 'Thanh thao tác nhanh: "Mới báo" (số = phiếu chưa ai nhận) → cột Mới báo; "Đang đến" → cột Đội đang đến; cuối trang không bị thanh che; mất mạng → "Sơ tán" tắt', async () => {
      await open('/cuu-ho?cot=hoan_thanh');
      await bar.waitFor();
      const waitBtn = bar.getByRole('button', { name: /Mới báo/ });
      await waitBtn.click();
      await page.waitForURL((u) => !new URL(u).searchParams.get('cot'));
      const tab = page.locator('[aria-label="Cột của bảng điều phối"] > [aria-pressed="true"]');
      const [tabText, badgeText] = [await tab.innerText(), await waitBtn.innerText()];
      if (!/Mới báo/.test(tabText)) throw new Error(`đang mở cột "${tabText}", không phải cột Mới báo`);
      const badge = Number(badgeText.match(/\d+/)?.[0] ?? 0);
      const inTab = Number(tabText.match(/\d+/)?.[0] ?? 0);
      if (badge !== Math.min(inTab, 99)) throw new Error(`thanh ghi ${badge} phiếu chờ, cột Mới báo có ${inTab}`);
      await bar.getByRole('button', { name: /Đang đến/ }).click();
      await page.waitForURL(/cot=thuc_thi/);
      const covered = await page.evaluate(() => {
        const m = document.querySelector('main');
        m.scrollTo(0, m.scrollHeight);
        const last = [...m.querySelectorAll('section')].pop()?.getBoundingClientRect();
        const nav = document.querySelector('nav[aria-label="Thao tác nhanh"]').getBoundingClientRect();
        return last ? Math.round(last.bottom - nav.top) : 0;
      });
      if (covered > 1) throw new Error(`thanh thao tác che ${covered}px cuối trang`);
      const canEvac = await page.getByRole('button', { name: '+ Cập nhật xã' }).count();
      await page.context().setOffline(true);
      try {
        await page.getByText('Mất kết nối mạng').waitFor({ timeout: 5_000 });
        if (canEvac && !(await bar.getByRole('button', { name: /Sơ tán/ }).isDisabled())) throw new Error('mất mạng nhưng ô "Sơ tán" (ghi số liệu) vẫn bấm được');
      } finally {
        await page.context().setOffline(false);
      }
      return `${badge} phiếu chờ`;
    });
  }
}

/**
 * Bản đồ cứu hộ & diễn biến 48 giờ (cho lãnh đạo) — chỉ xem: thu gọn sẵn trên mọi thiết bị (bảng điều phối lên trước,
 * chưa dựng bản đồ); mở ra: mọi phiếu đang mở có toạ độ đều lên bản đồ (điểm lẻ + số trong các cụm); biểu đồ + thời gian xử lý; chạm điểm →
 * "Xem phiếu trên bảng" mở đúng phiếu; laptop: lớp lộ trình / vùng nguy cơ không tải được → nói rõ, điểm SOS vẫn hiện.
 */
async function rescueOverview(ctx) {
  const { page, vp } = ctx;
  const touch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  const toggle = page.getByRole('button', { name: /Bản đồ cứu hộ & diễn biến 48 giờ/ });
  const section = page.locator('main section').filter({ has: toggle });
  const open = async () => {
    await page.goto(`${ROOT}/cuu-ho`);
    await page.getByRole('group', { name: 'Chỉ số cứu hộ' }).getByRole('button').first().waitFor({ timeout: 20_000 });
    await toggle.waitFor();
  };
  // Điểm SOS trên bản đồ: điểm lẻ + số ghi trên các cụm (đợi gom cụm xong)
  const mapCount = () => section.evaluate((sec) => ({
    single: sec.querySelectorAll('.leaflet-marker-icon[title^="SOS-"]').length,
    clusters: sec.querySelectorAll('.sos-cluster').length,
    inClusters: [...sec.querySelectorAll('.sos-cluster')].reduce((m, el) => m + Number(el.textContent.trim() || 0), 0),
  }));

  await step(ctx, 'Bản đồ cứu hộ & diễn biến 48 giờ: thu gọn sẵn (bảng điều phối lên trước); mở ra: mọi phiếu đang mở lên bản đồ; biểu đồ + thời gian xử lý', async () => {
    await open();
    if ((await toggle.getAttribute('aria-expanded')) !== 'false') throw new Error('khối bản đồ & biểu đồ không thu gọn sẵn (bảng điều phối phải lên trước)');
    if (await section.locator('.leaflet-container').count()) throw new Error('thu gọn nhưng vẫn dựng bản đồ (tải lớp bản đồ thừa)');
    await toggle.click();
    await section.locator('.leaflet-container').waitFor({ timeout: 10_000 });
    await page.waitForTimeout(1500);
    const head = await section.getByRole('heading', { name: /phiếu đang mở/ }).innerText();
    const openCount = Number(head.match(/(\d+) phiếu đang mở/)?.[1] ?? -1);
    const m = await mapCount();
    if (m.single + m.inClusters !== openCount) throw new Error(`bản đồ có ${m.single} điểm + ${m.inClusters} trong ${m.clusters} cụm, tiêu đề ghi ${openCount} phiếu đang mở`);
    const chart = section.locator('[role="img"][aria-label^="Phiếu SOS nhận trong 48 giờ"]');
    const empty = section.getByText('Chưa có phiếu SOS nào nhận trong 48 giờ qua');
    await chart.or(empty).first().waitFor({ timeout: 5_000 });
    let note = `${openCount} phiếu trên bản đồ (${m.clusters} cụm)`;
    if (await chart.count()) {
      if ((await section.locator('dl > div').count()) !== 3) throw new Error('thiếu 3 ô thời gian xử lý (tiếp nhận, có đội đi, đội đến nơi)');
      note += ` · ${(await chart.getAttribute('aria-label')).match(/(\d+) phiếu/)?.[1]} phiếu 48 giờ`;
    }
    await expectNoOverflow(ctx, '/cuu-ho (bản đồ & diễn biến)');
    if (touch) {
      const bad = await smallTargets(page);
      if (bad.length) throw new Error(`${bad.length} vùng chạm < 44 px — ${bad.slice(0, 5).map((s) => `${s.what} ${s.size}px`).join(', ')}`);
    }
    return note;
  });

  await step(ctx, 'Chạm điểm SOS trên bản đồ → "Xem phiếu trên bảng" mở đúng phiếu (ô tìm ghi mã phiếu)', async () => {
    if (!(await section.locator('.leaflet-container').count())) await open();
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await section.locator('.leaflet-container').waitFor({ timeout: 10_000 });
    // Chỉ cụm / điểm nằm trọn trong khung (Leaflet giữ cả điểm sát mép ngoài khung); kích hoạt bằng sự kiện click — không
    // phụ thuộc toạ độ màn hình (bấm theo toạ độ trúng điểm ngoài khung thì rơi ra phần khác của trang)
    // Chọn và bấm trong CÙNG một lần chạy JS: cụm vừa tách / gom lại làm danh sách điểm đổi giữa hai lệnh riêng
    const tapInside = (sel) => section.evaluate((sec, s) => {
      const box = sec.querySelector('.leaflet-container').getBoundingClientRect();
      const el = [...sec.querySelectorAll(s)].find((m) => {
        const r = m.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        return x > box.left + 4 && x < box.right - 4 && y > box.top + 4 && y < box.bottom - 4;
      });
      if (!el) return null;
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return el.getAttribute('title') || 'cụm';
    }, sel);
    const SOS = '.leaflet-marker-icon[title^="SOS-"]';
    let code = await tapInside(SOS);
    for (let i = 0; i < 6 && !code; i += 1) {
      if (!(await tapInside('.sos-cluster'))) break;
      await page.waitForTimeout(900);
      code = await tapInside(SOS);
    }
    if (!code) throw new Error('không chạm được điểm SOS nào trong khung bản đồ (cụm không tách ra)');
    const btn = page.locator('.leaflet-popup', { hasText: code }).getByRole('button', { name: 'Xem phiếu trên bảng' });
    await btn.waitFor({ timeout: 5_000 });
    await btn.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await btn.click();
    await page.waitForFunction((c) => document.querySelector('input[aria-label="Tìm trong danh sách"]')?.value === c, code, { timeout: 5_000 });
    await visible(page.locator(`main article[aria-label^="${code} "]`).or(page.locator('main table tbody tr', { hasText: code }))).waitFor({ timeout: 5_000 });
    return code;
  });

  await step(ctx, 'Danh sách: kỳ tra cứu 7 / 30 ngày (phiếu đang mở + đã xong trong kỳ) cho báo cáo tuần, tháng; kỳ nằm trên địa chỉ trang', async () => {
    await page.goto(`${ROOT}/cuu-ho?xem=danh_sach`);
    const group = page.getByRole('group', { name: /Kỳ tra cứu/ });
    await group.waitFor({ timeout: 20_000 });
    const excel = page.getByRole('button', { name: 'Excel', exact: true });
    // Số phiếu của Danh sách (không lọc): ghi trên nút Excel "Xuất Excel N phiếu đang lọc"
    const shown = async () => Number((await excel.getAttribute('title'))?.match(/(\d+)/)?.[1] ?? -1);
    const rowsOrEmpty = page.locator('main article[aria-label^="SOS-"], main table tbody tr').or(page.getByText(/Không có phiếu SOS nào trong/));
    await visible(rowsOrEmpty).waitFor({ timeout: 15_000 });
    const h48 = await shown();
    await group.getByRole('button', { name: '30 ngày' }).click();
    await page.waitForURL(/ky=30n/);
    let h30 = -1;
    for (let i = 0; i < 30; i += 1) {
      await page.waitForTimeout(500);
      h30 = await shown();
      if (h30 >= h48 && (await page.locator('main [aria-label="Đang tải"]').count()) === 0) break;
    }
    if (h30 < h48) throw new Error(`30 ngày (${h30} phiếu) ít hơn 48 giờ (${h48})`);
    await page.reload();
    await group.getByRole('button', { name: '30 ngày', pressed: true }).waitFor({ timeout: 20_000 });
    await page.getByRole('group', { name: 'Cách xem phiếu' }).getByRole('button', { name: 'Bảng điều phối' }).click();
    if (await group.count()) throw new Error('Bảng điều phối vẫn hiện chọn kỳ (bảng luôn theo 48 giờ)');
    return `48 giờ ${h48} → 30 ngày ${h30} phiếu`;
  });

  if (!vp.mobile && !touch) {
    await step(ctx, 'Lớp lộ trình / vùng nguy cơ không tải được → báo rõ, Thử lại; điểm SOS vẫn hiện', async () => {
      await page.route('**/api/v1/map/layers**', safeRoute((r) => r.abort('failed')));
      try {
        await open();
        if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
        await section.getByText(/Không tải được lộ trình đội, vùng nguy cơ, điểm sơ tán/).waitFor({ timeout: 30_000 });
        if (!(await section.getByRole('button', { name: 'Thử lại' }).count())) throw new Error('thiếu nút Thử lại');
        await page.waitForTimeout(1000);
        const m = await mapCount();
        const head = await section.getByRole('heading', { name: /phiếu đang mở/ }).innerText();
        const openCount = Number(head.match(/(\d+) phiếu đang mở/)?.[1] ?? -1);
        if (m.single + m.inClusters !== openCount) throw new Error(`lớp bản đồ lỗi: còn ${m.single + m.inClusters}/${openCount} điểm SOS`);
        return `${openCount} điểm SOS vẫn hiện`;
      } finally {
        await page.unroute('**/api/v1/map/layers**');
      }
    });
  }
}

/** Tài khoản phường: chỉ phiếu cứu hộ trong phường, không có nút "Điều đội" (quyền dispatch.create) — có "Nhận phiếu" nếu có phiếu mới. */
async function rescueWard(ctx) {
  const { page } = ctx;
  let signedIn = false;
  await step(ctx, `Điều hành cứu hộ — tài khoản phường ${WARD.name}: chỉ phiếu trong phường, không có nút Điều đội`, async () => {
    try {
      await loginAs(page, WARD);
    } catch (e) {
      if (READONLY) return `bỏ qua: không đăng nhập được ${WARD.user}`;
      throw e;
    }
    signedIn = true;
    await page.goto(`${ROOT}/cuu-ho`);
    await page.getByRole('group', { name: 'Chỉ số cứu hộ' }).getByRole('button').first().waitFor({ timeout: 20_000 });
    await page.waitForTimeout(1200);
    const head = await page.locator('main').innerText();
    if (!head.includes(WARD.name) || /Toàn tỉnh Cao Bằng ·/.test(head)) throw new Error('tiêu đề không phải phường của tài khoản');
    if (await page.getByRole('button', { name: 'Điều đội', exact: true }).count()) throw new Error('tài khoản phường thấy nút Điều đội');
    await expectNoOverflow(ctx, '/cuu-ho (phường)');
    return `${await page.locator('main article[aria-label^="SOS-"]').count()} phiếu đang hiện`;
  });
  if (!signedIn) return;
  await step(ctx, `Tài khoản phường ${WARD.name}: "Sơ tán" trên thanh thao tác mở thẳng số liệu của phường (không qua bước chọn xã)`, async () => {
    if (!(await page.getByRole('button', { name: '+ Cập nhật xã' }).count())) return 'tài khoản không có quyền cập nhật sơ tán';
    await page.getByRole('navigation', { name: 'Thao tác nhanh' }).getByRole('button', { name: /Sơ tán/ }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel(/Hộ phải sơ tán/).waitFor({ timeout: 5_000 });
    if (!(await dlg.innerText()).includes(WARD.name)) throw new Error('form không ghi tên phường của tài khoản');
    if (await dlg.getByRole('list', { name: 'Chọn xã / phường' }).count()) throw new Error('tài khoản một phường vẫn phải chọn xã');
    await expectNoOverflow(ctx, 'form sơ tán (phường)', dlg);
    await dlg.getByRole('button', { name: 'Huỷ', exact: true }).click();
  });
}

// ================================================================ Trang chủ tài khoản cấp xã / phường — laptop, điện thoại
// Tài khoản một phường (WARD): Tổng quan mở thẳng thẻ phường mình (thẻ đầu mang tên phường), không có ô chọn xã; 4 ô chỉ số
// của xã (phiếu SOS, sơ tán, cảnh báo, mưa dự báo — không phải 6 ô của tỉnh vốn trống khi xã không có trạm); "Gửi yêu cầu chi
// viện lên tỉnh" mở hộp thoại chi viện (không gửi); điện thoại: thanh dưới có "Chi viện" thay "Mực nước"; Bản đồ: nhãn
// "Tình hình · Phường …" — bản đồ bay tới phường, không mở ra cả tỉnh.
async function communeHome(ctx) {
  const { page, vp } = ctx;
  let signedIn = false;
  await step(ctx, `Trang chủ tài khoản phường ${WARD.name}: thẻ phường mình đứng đầu, 4 ô chỉ số của xã, không có ô chọn xã`, async () => {
    try {
      await loginAs(page, WARD);
    } catch (e) {
      if (READONLY) return `bỏ qua: không đăng nhập được ${WARD.user}`;
      throw e;
    }
    signedIn = true;
    await page.goto(`${ROOT}/dashboard`);
    const kpis = page.getByRole('group', { name: 'Chỉ số của xã' });
    await kpis.waitFor({ timeout: 20_000 });
    const first = page.getByRole('tablist', { name: 'Nội dung tổng quan' }).getByRole('tab').first();
    if (!(await first.innerText()).includes(WARD.name)) throw new Error(`thẻ đầu không phải phường của tài khoản: "${await first.innerText()}"`);
    if ((await first.getAttribute('aria-selected')) !== 'true') throw new Error('thẻ phường không được chọn sẵn');
    const tiles = await kpis.locator(':scope > *').count();
    if (tiles !== 4) throw new Error(`có ${tiles} ô chỉ số của xã (cần 4)`);
    if (await page.getByLabel('Chọn xã/phường').count()) throw new Error('tài khoản một phường vẫn có ô chọn xã');
    await expectNoOverflow(ctx, 'trang chủ phường');
    return `${tiles} ô chỉ số`;
  });
  if (!signedIn) return;
  await step(ctx, `Tài khoản phường ${WARD.name}: "Gửi yêu cầu chi viện lên tỉnh" mở hộp thoại chi viện (không gửi)${vp.mobile ? '; thanh dưới có "Chi viện"' : ''}`, async () => {
    await page.getByRole('button', { name: 'Gửi yêu cầu chi viện lên tỉnh' }).click();
    const dlg = page.getByRole('dialog', { name: 'Gửi yêu cầu chi viện lên tỉnh' });
    await dlg.waitFor({ timeout: 5_000 });
    await expectNoOverflow(ctx, 'hộp thoại chi viện', dlg);
    await dlg.getByRole('button', { name: 'Huỷ', exact: true }).click();
    if (vp.mobile) {
      const bar = page.getByRole('navigation', { name: 'Thao tác nhanh' });
      if (!(await bar.getByRole('button', { name: /Chi viện/ }).count())) throw new Error('thanh dưới không có nút "Chi viện"');
      if (await bar.getByRole('button', { name: /Mực nước/ }).count()) throw new Error('thanh dưới vẫn có "Mực nước"');
    }
  });
  await step(ctx, `Bản đồ — tài khoản phường ${WARD.name}: nhãn "Tình hình · Phường ${WARD.name}", không ghi Toàn tỉnh`, async () => {
    await page.goto(`${ROOT}/ban-do`);
    const box = page.locator('[aria-label^="Tình hình · "]').first();
    await box.waitFor({ state: 'attached', timeout: 20_000 });
    const label = await box.getAttribute('aria-label');
    if (!label.includes(WARD.name) || /Toàn tỉnh/.test(label)) throw new Error(`nhãn "${label}"`);
    return label;
  });
}

// ================================================================ Cảnh báo khẩn cấp & Hotline (trang E) — laptop, iPad dọc, điện thoại
// Dải thông tin khẩn nằm trên 4 ô chỉ số, 4 thẻ vừa màn (điện thoại nhãn ngắn); ô "Chờ phê duyệt" → đúng khối, đúng số lệnh;
// Lịch sử lệnh: lọc trạng thái trên địa chỉ trang, Excel (laptop thêm PDF); Danh bạ: tìm không dấu, nút gọi, Excel; Nhật
// ký pháp lý: khoảng ngày, lọc nhóm, khoảng tuỳ chọn sai báo dưới ô; không tải được danh sách lệnh → nói rõ, không ghi
// "không có lệnh chờ duyệt"; mất mạng → nút Phê duyệt tắt; cảm ứng: vùng chạm ≥ 44 px; tài khoản phường: tiêu đề phường,
// không có form soạn, không có nhật ký pháp lý. Chỉ xem — không soạn, không duyệt, không gọi tổng đài.
const ALERT_DEVICES = RESOURCE_DEVICES;

async function alertsPage(ctx) {
  const { page, vp } = ctx;
  const kpis = page.getByRole('group', { name: 'Chỉ số cảnh báo' });
  const touch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  const wide = await page.evaluate(() => innerWidth >= 1024);
  const open = async (path = '/canh-bao') => {
    await page.goto(`${ROOT}${path}`);
    await kpis.getByRole('button').first().waitFor({ timeout: 20_000 });
  };

  await step(ctx, 'Mở Cảnh báo khẩn cấp: dải thông tin khẩn trên cùng, 4 ô chỉ số, các thẻ vừa màn; không tràn ngang', async () => {
    await loginAs(page, STAFF);
    await open();
    const m = await page.evaluate(() => {
      const box = (sel) => document.querySelector(sel)?.getBoundingClientRect();
      const tabs = [...document.querySelectorAll('[aria-label="Phần của trang Cảnh báo"] > button')].map((b) => b.getBoundingClientRect());
      return {
        stripAbove: (box('[aria-label="Thông tin khẩn cảnh báo"]')?.top ?? Infinity) < box('[aria-label="Chỉ số cảnh báo"]').top,
        kpi: document.querySelectorAll('[aria-label="Chỉ số cảnh báo"] > button').length,
        tabs: tabs.length,
        tabsOut: tabs.filter((t) => t.right > innerWidth + 1 || t.left < -1).length,
      };
    });
    if (!m.stripAbove) throw new Error('dải thông tin khẩn không nằm trên ô chỉ số');
    if (m.kpi !== 4) throw new Error(`có ${m.kpi} ô chỉ số (cần 4, bấm được)`);
    if (m.tabs < 3 || m.tabsOut) throw new Error(`${m.tabs} thẻ, ${m.tabsOut} thẻ tràn màn`);
    await expectNoOverflow(ctx, '/canh-bao');
    return `${m.tabs} thẻ`;
  });

  await step(ctx, 'Chạm ô "Chờ phê duyệt" → khối chờ duyệt, đúng số lệnh ghi trên ô', async () => {
    const tile = kpis.getByRole('button', { name: /Chờ phê duyệt/ });
    const n = Number((await tile.innerText()).match(/(\d+)\s*lệnh/)?.[1] ?? -1);
    await tile.click();
    const sec = page.locator('#cho-duyet');
    await sec.waitFor({ timeout: 5_000 });
    await page.waitForTimeout(900);
    const inView = await sec.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
    if (!inView) throw new Error('không cuộn tới khối "Chờ phê duyệt"');
    const cards = await sec.locator('article').count();
    if (cards !== n) throw new Error(`ô ghi ${n} lệnh, khối có ${cards} thẻ`);
    return `${n} lệnh chờ duyệt`;
  });

  await step(ctx, 'Lịch sử lệnh: lọc "Đang hiệu lực" (trên địa chỉ trang), Excel (và PDF trên laptop) mọi lệnh đang lọc', async () => {
    const live = Number((await kpis.getByRole('button', { name: /Đang hiệu lực/ }).innerText()).match(/(\d+)\s*cảnh báo/)?.[1] ?? -1);
    await page.goto(`${ROOT}/canh-bao?tab=lich_su`);
    const rows = page.locator('main table tbody tr').or(page.locator('main article[aria-label^="CB-"]'));
    await rows.first().or(page.getByText(/Chưa có lệnh cảnh báo nào/)).waitFor({ timeout: 20_000 });
    const box = page.getByLabel('Trạng thái', { exact: true });
    if (!(await box.isVisible())) await page.getByRole('button', { name: /^Bộ lọc/ }).click();
    await box.selectOption('hieu_luc');
    await page.waitForURL(/tt=hieu_luc/);
    await page.waitForTimeout(400);
    const shown = await rows.count();
    if (shown !== Math.min(live, wide ? 20 : 10)) throw new Error(`lọc "Đang hiệu lực" ra ${shown} lệnh, ô chỉ số ghi ${live}`);
    let note = `${shown} đang hiệu lực`;
    if (shown) {
      const [xlsx] = await Promise.all([page.waitForEvent('download', { timeout: 20_000 }), page.getByRole('button', { name: 'Excel', exact: true }).click()]);
      if (!/^lenh-canh-bao-.*\.xlsx$/.test(xlsx.suggestedFilename())) throw new Error(`tên tệp Excel: ${xlsx.suggestedFilename()}`);
      note += ` · ${xlsx.suggestedFilename()}`;
      if (wide) {
        const [pdfFile] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.getByRole('button', { name: 'PDF', exact: true }).click()]);
        if (!/^lenh-canh-bao-.*\.pdf$/.test(pdfFile.suggestedFilename())) throw new Error(`tên tệp PDF: ${pdfFile.suggestedFilename()}`);
      }
    }
    await expectNoOverflow(ctx, '/canh-bao?tab=lich_su');
    return note;
  });

  await step(ctx, 'Danh bạ: tìm không dấu ra đúng cán bộ, có nút gọi; Excel danh bạ đang lọc', async () => {
    await page.goto(`${ROOT}/canh-bao?tab=danh_ba`);
    const search = page.getByLabel('Tìm trong danh sách');
    await search.waitFor({ timeout: 20_000 });
    await page.getByText(/cán bộ · \d+ đang trực/).waitFor({ timeout: 20_000 });
    await search.fill('truong ban');
    const call = page.locator('main a[href^="tel:"][aria-label^="Gọi "]');
    await call.first().waitFor({ timeout: 5_000 });
    const names = await page.locator('main a[aria-label^="Gọi "]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')).filter((l) => !/^Gọi \d+ —/.test(l)));
    if (!names.length) throw new Error('tìm "truong ban" không ra cán bộ nào');
    const [xlsx] = await Promise.all([page.waitForEvent('download', { timeout: 20_000 }), page.getByRole('button', { name: 'Excel', exact: true }).click()]);
    if (!/^danh-ba-khan-cap-.*\.xlsx$/.test(xlsx.suggestedFilename())) throw new Error(`tên tệp Excel: ${xlsx.suggestedFilename()}`);
    await expectNoOverflow(ctx, '/canh-bao?tab=danh_ba');
    return `${names.length} cán bộ khớp · ${xlsx.suggestedFilename()}`;
  });

  await step(ctx, 'Nhật ký pháp lý: khoảng 24 giờ, lọc nhóm "Tài khoản & bảo mật"; khoảng tuỳ chọn ngược → báo dưới ô', async () => {
    await page.goto(`${ROOT}/canh-bao?tab=nhat_ky&ky=1n`);
    await page.getByText(/thao tác 24 giờ qua/).waitFor({ timeout: 20_000 });
    const group = page.getByLabel('Nhóm thao tác');
    if (!(await group.isVisible())) await page.getByRole('button', { name: /^Bộ lọc/ }).click();
    await group.selectOption('tai_khoan');
    await page.waitForTimeout(300);
    const texts = await page.locator('main table tbody tr td:nth-child(3), main ol[aria-label^="Nhật ký pháp lý"] [data-thao-tac]').allInnerTexts();
    if (!texts.length || !texts.every((t) => /Đăng nhập|mật khẩu|2 lớp|tài khoản/i.test(t))) throw new Error(`nhóm "Tài khoản & bảo mật" ra: ${texts.slice(0, 3).join(' | ')}`);
    await page.getByRole('button', { name: 'Tuỳ chọn' }).click();
    await page.getByLabel('Từ ngày').fill('2026-10-10');
    await page.getByLabel('Đến ngày').fill('2026-10-01');
    await page.getByText('Chọn ngày bắt đầu không sau ngày kết thúc').waitFor({ timeout: 3_000 });
    await expectNoOverflow(ctx, '/canh-bao?tab=nhat_ky');
    return `${texts.length} thao tác tài khoản`;
  });

  await step(ctx, 'Không tải được danh sách lệnh → báo rõ (không ghi "không có lệnh chờ duyệt"); mất mạng → dải báo, nút Duyệt bằng PIN tắt', async () => {
    await page.route('**/api/v1/alerts/broadcasts**', safeRoute((r) => r.abort('failed')));
    try {
      await page.goto(`${ROOT}/canh-bao`);
      await page.getByText(/Không tải được danh sách lệnh cảnh báo — không có nghĩa là không có lệnh chờ duyệt/).waitFor({ timeout: 30_000 });
      if (await page.getByText('Không có lệnh chờ duyệt', { exact: true }).count()) throw new Error('lỗi tải nhưng vẫn ghi "không có lệnh chờ duyệt"');
    } finally {
      await page.unroute('**/api/v1/alerts/broadcasts**');
    }
    await open();
    const btn = page.getByRole('button', { name: 'Duyệt bằng PIN', exact: true }).first();
    const has = await btn.waitFor({ timeout: 10_000 }).then(() => true, () => false);
    await page.context().setOffline(true);
    try {
      await page.getByText('Mất kết nối mạng').waitFor({ timeout: 5_000 });
      if (has && !(await btn.isDisabled())) throw new Error('mất mạng nhưng nút Duyệt bằng PIN vẫn bấm được');
    } finally {
      await page.context().setOffline(false);
    }
    return has ? 'nút Phê duyệt tắt khi mất mạng' : 'không có lệnh tài khoản này được duyệt';
  });

  if (touch) {
    await step(ctx, 'Màn cảm ứng: mọi vùng chạm của các thẻ trang Cảnh báo ≥ 44 px', async () => {
      const bad = [];
      for (const path of ['/canh-bao', '/canh-bao?tab=lich_su', '/canh-bao?tab=danh_ba', '/canh-bao?tab=nhat_ky']) {
        await open(path);
        await page.waitForTimeout(1500);
        for (const s of await smallTargets(page)) bad.push(`${path}: ${s.what} ${s.size}px`);
      }
      if (bad.length) throw new Error(`${bad.length} vùng chạm < 44 px — ${bad.slice(0, 5).join(', ')}`);
    });
  }
}

/**
 * Form của trang Cảnh báo (chỉ mở, kiểm tra lỗi, đóng — KHÔNG gửi lệnh, không duyệt): soạn lệnh 3 bước, ký duyệt / từ chối,
 * gia hạn / kết thúc; điện thoại: thanh thao tác nhanh. Sai PIN thật chỉ thử trên máy thử (UI_READONLY tắt) — máy thật
 * ghi nhật ký và khoá PIN sau 5 lần sai.
 */
async function alertsForms(ctx) {
  const { page, vp } = ctx;
  const dlg = page.getByRole('dialog');
  const touch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  const composer = page.locator('#soan-canh-bao');
  const open = async (path = '/canh-bao') => {
    await page.goto(`${ROOT}${path}`);
    await page.getByRole('group', { name: 'Chỉ số cảnh báo' }).getByRole('button').first().waitFor({ timeout: 20_000 });
  };
  const noSmall = async (where) => {
    if (!touch) return;
    const bad = await smallTargets(page);
    if (bad.length) throw new Error(`${where}: ${bad.length} vùng chạm < 44 px — ${bad.slice(0, 5).map((s) => `${s.what} ${s.size}px`).join(', ')}`);
  };

  await step(ctx, 'Soạn lệnh 3 bước: Tiếp khi trống → lỗi dưới ô + con trỏ; mẫu tin: tham số số sai → báo; chưa chọn vùng → báo; chọn xã → ước tính người nhận; bước 3 xem lại (không gửi)', async () => {
    await open();
    if (!(await composer.count())) return 'tài khoản không có quyền soạn lệnh';
    await composer.scrollIntoViewIfNeeded();
    await composer.getByRole('button', { name: /^Tiếp/ }).click();
    await composer.getByText(/Ghi tiêu đề lệnh/).waitFor({ timeout: 3_000 });
    const focus = await page.evaluate(() => document.activeElement?.getAttribute('aria-invalid'));
    if (focus !== 'true') throw new Error('bấm Tiếp khi thiếu nội dung: con trỏ không về ô lỗi');
    // Mẫu tin có tham số số (lưu lượng / lượng mưa…): nhập chữ → báo ngay
    const numeric = composer.getByRole('radio', { name: /xả lũ|lũ quét|mưa/i }).first();
    let note = 'tự soạn';
    if (await numeric.count()) {
      await numeric.click();
      const num = composer.getByLabel(/Lưu lượng|Lượng mưa|Mực nước|Số giờ/).first();
      if (await num.count()) {
        await num.fill('nhiều');
        await composer.getByText('Chỉ nhập số (VD 1200 hoặc 12,5)').first().waitFor({ timeout: 3_000 });
        note = 'tham số số báo lỗi';
      }
      await composer.getByRole('radio', { name: 'Tự soạn' }).click();
    }
    await composer.getByLabel('Tiêu đề lệnh *').fill('Kiểm thử giao diện — không gửi');
    await composer.getByLabel('Nội dung tin *').fill('Kiểm thử giao diện: nội dung cảnh báo mẫu, không gửi đi.');
    await composer.getByRole('button', { name: /^Tiếp/ }).click();
    await composer.getByRole('button', { name: /^Tiếp/ }).click();
    await composer.getByText(/Chọn ít nhất 1 xã\/phường/).waitFor({ timeout: 3_000 });
    await composer.getByLabel('Tìm xã / phường nhận tin').fill(norm(WARD.name));
    await composer.getByRole('checkbox', { name: new RegExp(WARD.name) }).first().click();
    await composer.getByText(/hộ dân/).waitFor({ timeout: 10_000 });
    await expectNoOverflow(ctx, 'form soạn lệnh (bước 2)');
    await noSmall('form soạn lệnh (bước 2)');
    await composer.getByRole('button', { name: /^Tiếp/ }).click();
    await composer.getByText('Xem lại trước khi gửi').waitFor({ timeout: 3_000 });
    if (!(await composer.getByText(new RegExp(`1 xã/phường — ${WARD.name}`)).count())) throw new Error('bước xem lại không ghi vùng đã chọn');
    await noSmall('form soạn lệnh (bước 3)');
    return note;
  });

  await step(ctx, 'Ký duyệt: PIN sai định dạng → báo dưới ô; sai PIN (máy chủ) → báo dưới ô, hộp thoại vẫn mở; Trả lại thiếu lý do → báo; thẻ lệnh có nút Trả lại, xem trước tin', async () => {
    await open();
    const btn = visible(page.getByRole('button', { name: 'Duyệt bằng PIN', exact: true }));
    if (!(await btn.count())) return 'không có lệnh tài khoản này được duyệt';
    await btn.click();
    await dlg.waitFor();
    await dlg.getByRole('button', { name: /Ký duyệt & phát/ }).click();
    await dlg.getByText('Nhập mã PIN 4–8 chữ số').waitFor({ timeout: 3_000 });
    let note = 'PIN trống báo dưới ô';
    if (!READONLY) {
      await dlg.getByLabel(/Mã PIN ký duyệt/).fill('9999');
      await dlg.getByRole('button', { name: /Ký duyệt & phát/ }).click();
      await dlg.locator('#loi-pin').getByText(/PIN/).waitFor({ timeout: 10_000 });
      if (!(await dlg.isVisible())) throw new Error('sai PIN nhưng hộp thoại đã đóng');
      note += ' · sai PIN báo dưới ô';
    }
    await dlg.getByRole('radio', { name: /Trả lại/ }).click();
    await dlg.getByRole('button', { name: /Trả lại lệnh/ }).click();
    await dlg.getByText(/Ghi lý do trả lại/).waitFor({ timeout: 3_000 });
    await expectNoOverflow(ctx, 'hộp thoại ký duyệt', dlg);
    await noSmall('hộp thoại ký duyệt');
    await dlg.getByRole('button', { name: 'Đóng', exact: true }).last().click();
    await dlg.waitFor({ state: 'hidden' });
    // Nút "Trả lại" ngay trên thẻ lệnh → hộp thoại chọn sẵn Trả lại (lãnh đạo không phải chuyển thêm một lần)
    await visible(page.getByRole('button', { name: 'Trả lại', exact: true })).click();
    await dlg.waitFor();
    if ((await dlg.getByRole('radio', { name: /Trả lại/ }).getAttribute('aria-checked')) !== 'true') throw new Error('bấm "Trả lại" trên thẻ nhưng hộp thoại không chọn sẵn Trả lại');
    await dlg.getByRole('button', { name: 'Đóng', exact: true }).last().click();
    await dlg.waitFor({ state: 'hidden' });
    return `${note} · nút Trả lại chọn sẵn`;
  });

  await step(ctx, 'Kết thúc cảnh báo: thiếu lý do / PIN → báo dưới ô, chọn nhanh lý do điền được; Gia hạn: chọn thời gian bằng chip', async () => {
    await open();
    const end = visible(page.getByRole('button', { name: /^Kết thúc$/ }));
    if (!(await end.count())) return 'không có cảnh báo tài khoản này quản lý';
    await end.click();
    await dlg.waitFor();
    await dlg.getByRole('button', { name: /Kết thúc cảnh báo/ }).click();
    await dlg.getByText(/Ghi lý do \/ thông báo kết thúc/).waitFor({ timeout: 3_000 });
    await dlg.getByRole('button', { name: 'Hết nguy cơ sạt lở' }).click();
    if ((await dlg.getByLabel(/Lý do \/ thông báo kết thúc/).inputValue()) !== 'Hết nguy cơ sạt lở') throw new Error('chip lý do không điền vào ô');
    await dlg.getByRole('button', { name: /Kết thúc cảnh báo/ }).click();
    await dlg.getByText('Nhập mã PIN 4–8 chữ số').waitFor({ timeout: 3_000 });
    await noSmall('hộp thoại kết thúc');
    await dlg.getByRole('button', { name: 'Huỷ', exact: true }).click();
    await dlg.waitFor({ state: 'hidden' });
    await visible(page.getByRole('button', { name: /^Gia hạn$/ })).click();
    await dlg.waitFor();
    await dlg.getByRole('radio', { name: '12 giờ' }).click();
    await dlg.getByRole('button', { name: 'Gia hạn 12 giờ' }).waitFor({ timeout: 3_000 });
    await dlg.getByRole('button', { name: 'Huỷ', exact: true }).click();
    await dlg.waitFor({ state: 'hidden' });
    return 'lý do / PIN báo dưới ô';
  });

  if (vp.mobile) {
    await step(ctx, 'Thanh thao tác nhanh: "Chờ duyệt" (số = lệnh chờ) → khối chờ duyệt; "Soạn lệnh" → form; "Danh bạ" → thẻ danh bạ; cuối trang không bị che', async () => {
      await open();
      const bar = page.getByRole('navigation', { name: 'Thao tác nhanh' });
      await bar.waitFor();
      const kpi = Number((await page.getByRole('group', { name: 'Chỉ số cảnh báo' }).getByRole('button', { name: /Chờ phê duyệt/ }).innerText()).match(/(\d+)\s*lệnh/)?.[1] ?? 0);
      const wait = bar.getByRole('button', { name: /Chờ duyệt/ });
      if (await wait.count()) {
        const badge = Number((await wait.innerText()).match(/\d+/)?.[0] ?? 0);
        if (badge !== kpi) throw new Error(`thanh ghi ${badge} lệnh chờ, ô chỉ số ghi ${kpi}`);
        await wait.click();
        await page.waitForTimeout(900);
        const inView = await page.locator('#cho-duyet').evaluate((el) => { const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
        if (!inView) throw new Error('"Chờ duyệt" không cuộn tới khối chờ duyệt');
      }
      const compose = bar.getByRole('button', { name: /Soạn lệnh/ });
      if (await compose.count()) {
        await compose.click();
        await page.waitForTimeout(900);
        const inView = await page.locator('#soan-canh-bao').evaluate((el) => { const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
        if (!inView) throw new Error('"Soạn lệnh" không cuộn tới form soạn');
      }
      await bar.getByRole('button', { name: /Danh bạ/ }).click();
      await page.waitForURL(/tab=danh_ba/);
      const covered = await page.evaluate(() => {
        const m = document.querySelector('main');
        m.scrollTo(0, m.scrollHeight);
        const last = [...m.querySelectorAll('section')].pop()?.getBoundingClientRect();
        const nav = document.querySelector('nav[aria-label="Thao tác nhanh"]').getBoundingClientRect();
        return last ? Math.round(last.bottom - nav.top) : 0;
      });
      if (covered > 1) throw new Error(`thanh thao tác che ${covered}px cuối trang`);
      return `${kpi} lệnh chờ`;
    });
  }
}

/**
 * Bản đồ vùng cảnh báo & chuyển giao (cho lãnh đạo) — chỉ xem: thu gọn sẵn trên mọi thiết bị (lệnh chờ duyệt, soạn lệnh lên
 * trước; không dựng bản đồ khi chưa mở); số xã tô màu trên bản đồ bằng số xã ghi ở tiêu đề; biểu đồ chuyển giao theo kênh (hoặc nói rõ kênh chưa tích hợp).
 */
async function alertsOverview(ctx) {
  const { page } = ctx;
  const touch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  const toggle = page.getByRole('button', { name: /Bản đồ vùng cảnh báo & chuyển giao/ });
  const section = page.locator('main section').filter({ has: toggle });
  await step(ctx, 'Bản đồ vùng cảnh báo & chuyển giao: thu gọn sẵn (lệnh chờ duyệt lên trước); mở ra: số xã tô màu = số xã ghi ở tiêu đề; biểu đồ chuyển giao theo kênh', async () => {
    await page.goto(`${ROOT}/canh-bao`);
    await toggle.waitFor({ timeout: 20_000 });
    if ((await toggle.getAttribute('aria-expanded')) !== 'false') throw new Error('khối bản đồ & chuyển giao không thu gọn sẵn');
    if (await section.locator('.leaflet-container').count()) throw new Error('thu gọn nhưng vẫn dựng bản đồ');
    await toggle.click();
    await section.locator('.leaflet-container').waitFor({ timeout: 15_000 });
    const head = await section.getByRole('heading', { name: /Vùng đang có cảnh báo/ }).innerText();
    const n = Number(head.match(/(\d+) xã\/phường/)?.[1] ?? -1);
    let filled = -1;
    for (let i = 0; i < 30; i += 1) {
      filled = await section.evaluate((el) => [...el.querySelectorAll('.leaflet-overlay-pane path')].filter((p) => Number(p.getAttribute('fill-opacity')) > 0.3).length);
      if (filled === n) break;
      await page.waitForTimeout(500);
    }
    if (filled !== n) throw new Error(`tiêu đề ghi ${n} xã, bản đồ tô ${filled} xã`);
    const chart = section.locator('[role="img"][aria-label^="Tỉ lệ đã nhận theo kênh"]');
    const note = section.getByText(/chưa có số liệu chuyển giao|Không có cảnh báo đang hiệu lực|Chưa có số liệu giao nhận/).first();
    await chart.or(note).first().waitFor({ timeout: 5_000 });
    await expectNoOverflow(ctx, '/canh-bao (bản đồ & chuyển giao)');
    if (touch) {
      const bad = await smallTargets(page);
      if (bad.length) throw new Error(`${bad.length} vùng chạm < 44 px — ${bad.slice(0, 5).map((s) => `${s.what} ${s.size}px`).join(', ')}`);
    }
    const summary = `${n} xã tô màu · ${(await chart.count()) ? (await chart.getAttribute('aria-label')).replace('Tỉ lệ đã nhận theo kênh: ', '') : 'kênh chưa tích hợp'}`;
    // Chỉ ở thẻ Phát cảnh báo — thẻ tra cứu (Danh bạ…) không bị đẩy xuống dưới khối bản đồ
    await page.goto(`${ROOT}/canh-bao?tab=danh_ba`);
    await page.getByPlaceholder('Tìm tên, chức vụ, đơn vị, SĐT, tần số…').waitFor({ timeout: 20_000 });
    if (await toggle.count()) throw new Error('thẻ Danh bạ vẫn hiện khối bản đồ & chuyển giao');
    return summary;
  });
}

/** Tài khoản phường: tiêu đề phường, không soạn lệnh, không có nhật ký pháp lý (quyền audit.view); danh bạ có cấp tỉnh. */
async function alertsWard(ctx) {
  const { page } = ctx;
  await step(ctx, `Cảnh báo — tài khoản phường ${WARD.name}: tiêu đề phường, không có form soạn lệnh, không có nhật ký pháp lý`, async () => {
    try {
      await loginAs(page, WARD);
    } catch (e) {
      if (READONLY) return `bỏ qua: không đăng nhập được ${WARD.user}`;
      throw e;
    }
    await page.goto(`${ROOT}/canh-bao`);
    await page.getByRole('group', { name: 'Chỉ số cảnh báo' }).getByRole('button').first().waitFor({ timeout: 20_000 });
    const head = await page.locator('main .facts').first().innerText(); // dòng ngữ cảnh dưới tiêu đề (PageHeader)
    if (!head.includes(WARD.name)) throw new Error(`tiêu đề không phải phường của tài khoản: ${head}`);
    if (await page.getByText(/Soạn lệnh cảnh báo/i).count()) throw new Error('tài khoản phường thấy form soạn lệnh');
    if (await page.locator('[aria-label="Phần của trang Cảnh báo"] > button', { hasText: /Nhật ký/ }).count()) throw new Error('tài khoản phường thấy thẻ Nhật ký pháp lý');
    await page.goto(`${ROOT}/canh-bao?tab=nhat_ky`);
    await page.waitForTimeout(1500);
    if (await page.getByRole('group', { name: 'Khoảng thời gian' }).count()) throw new Error('mở được nhật ký pháp lý bằng địa chỉ trang');
    await expectNoOverflow(ctx, '/canh-bao (phường)');
  });
}

// ================================================================ Bộ lọc địa phương (trang F)
// Nút chọn địa bàn trên thanh trên cùng ở MỌI cỡ màn (trước đây dưới 1024 px nằm trong menu ☰); hộp chọn: không tràn, vùng
// chạm ≥ 44 px (cảm ứng), tìm không dấu, báo không khớp, Esc đóng + trả con trỏ về nút; chọn phường → nhớ qua tải lại; Bản đồ
// phủ mờ ngoài vùng, viền màu nhấn — không đỏ (Đỏ chỉ là mức Khẩn cấp); bỏ lọc về Toàn tỉnh. Chỉ ghi localStorage của trình
// duyệt thử.
const AREA_DEVICES = RESOURCE_DEVICES;
const AREA_LINE = /^#(2a78d6|3987e5)$/i; // màu nhấn sáng / tối (AREA_STYLE trong MapTools.jsx)
async function areaFilter(ctx) {
  const { page, vp } = ctx;
  const trig = page.locator('header button[title="Lọc dữ liệu theo địa phương"]');
  const dlg = page.getByRole('dialog', { name: /Chọn địa bàn/ });
  const search = dlg.getByPlaceholder('Tìm xã / phường trong tỉnh...');
  await step(ctx, 'Bộ lọc địa phương: nút trên thanh trên cùng, hộp chọn không tràn, vùng chạm ≥ 44 px, tìm không dấu, báo không khớp, Esc đóng', async () => {
    await loginAs(page, STAFF);
    const touch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
    if (!(await trig.isVisible())) throw new Error('không thấy nút chọn địa bàn trên thanh trên cùng');
    if (await trig.getAttribute('aria-expanded') !== 'false') throw new Error('nút chọn địa bàn thiếu aria-expanded');
    await trig.click();
    await dlg.getByRole('button', { name: /^Phường / }).first().waitFor({ timeout: 15_000 });
    const n = await dlg.getByRole('button', { name: /^(Phường|Xã) / }).count();
    if (n < 2) throw new Error(`hộp chọn chỉ có ${n} xã/phường`);
    await expectNoOverflow(ctx, 'hộp chọn địa bàn', dlg);
    if (touch) {
      const bad = await dlg.evaluate((el) => [...el.querySelectorAll('button, input')].map((b) => {
        const r = b.getBoundingClientRect();
        let w = r.width;
        let h = r.height;
        const a = b.classList.contains('touch-hit') && getComputedStyle(b, '::after');
        if (a && a.content !== 'none') { w = Math.max(w, parseFloat(a.width) || 0); h = Math.max(h, parseFloat(a.height) || 0); }
        return { s: Math.round(Math.min(w, h)), t: (b.getAttribute('aria-label') || b.innerText || b.placeholder || '').slice(0, 24) };
      }).filter((x) => x.s > 0 && x.s < 44));
      if (bad.length) throw new Error(`${bad.length} vùng chạm < 44 px — ${bad.slice(0, 4).map((x) => `${x.t} ${x.s}px`).join(', ')}`);
    }
    await search.fill('thuc phan');
    const hits = await dlg.getByRole('button', { name: /^(Phường|Xã) / }).allInnerTexts();
    if (hits.length !== 1 || !/Thục Phán/.test(hits[0])) throw new Error(`tìm "thuc phan" ra ${JSON.stringify(hits)}`);
    await search.fill('zzqqxx');
    await dlg.getByText(/Không có xã\/phường nào khớp/).waitFor({ timeout: 3_000 });
    await page.keyboard.press('Escape');
    await dlg.waitFor({ state: 'hidden', timeout: 3_000 });
    if (!(await trig.evaluate((el) => el === document.activeElement))) throw new Error('Esc đóng nhưng con trỏ không về nút chọn địa bàn');
    return `${n} xã/phường · ${touch ? 'cảm ứng' : 'chuột'}`;
  });

  await step(ctx, 'Bộ lọc địa phương: chọn phường → nút đổi tên, nhớ qua tải lại; Bản đồ phủ mờ ngoài vùng, viền màu nhấn (không đỏ); bỏ lọc về Toàn tỉnh', async () => {
    await trig.click();
    await dlg.getByRole('button', { name: new RegExp(`^Phường ${WARD.name}`) }).click(); // không khớp dòng "Cần chú ý: Phường …"
    await dlg.waitFor({ state: 'hidden', timeout: 3_000 });
    if (!(await trig.innerText()).includes(WARD.name)) throw new Error(`chọn xong nút ghi "${await trig.innerText()}"`);
    await page.goto(`${ROOT}/ban-do`);
    await page.locator('.leaflet-container').first().waitFor({ timeout: 20_000 });
    if (!(await trig.innerText()).includes(WARD.name)) throw new Error('tải lại trang mất bộ lọc');
    let strokes = [];
    for (let i = 0; i < 20 && !strokes.some((c) => AREA_LINE.test(c)); i += 1) {
      await page.waitForTimeout(500);
      // viền vùng đang xem nằm ở pane riêng "vien-vung" (MapTools AreaFocus), không trong overlay-pane
      strokes = await page.evaluate(() => [...document.querySelectorAll('.leaflet-map-pane path[fill="none"]')].map((p) => p.getAttribute('stroke')));
    }
    if (!strokes.some((c) => AREA_LINE.test(c))) throw new Error(`không thấy viền vùng màu nhấn (${[...new Set(strokes)].slice(0, 4).join(', ')})`);
    if (strokes.some((c) => /^#ef4444$/i.test(c))) throw new Error('viền vùng đang xem vẫn màu đỏ');
    await trig.click();
    await dlg.getByRole('button', { name: /Toàn tỉnh Cao Bằng/ }).click();
    await dlg.waitFor({ state: 'hidden', timeout: 3_000 });
    if (!/Toàn tỉnh/.test(await trig.innerText())) throw new Error(`bỏ lọc xong nút ghi "${await trig.innerText()}"`);
    if (await page.evaluate(() => localStorage.getItem('pctt_filter'))) throw new Error('bỏ lọc nhưng vẫn nhớ bộ lọc cũ');
  });

  // Thẻ "Cấp xã" của Tổng quan tự chọn sẵn xã đầu tiên: chỉ trong phiên — tải lại sang trang khác phải về Toàn tỉnh, không để
  // một xã người dùng không chọn bám theo mọi trang
  await step(ctx, 'Bộ lọc địa phương: xã do thẻ "Cấp xã" tự chọn sẵn không được nhớ qua tải lại', async () => {
    await page.goto(`${ROOT}/dashboard?tab=cap_xa`);
    await page.waitForFunction(() => !/Toàn tỉnh/.test(document.querySelector('header button[title="Lọc dữ liệu theo địa phương"]')?.innerText || 'Toàn tỉnh'), null, { timeout: 15_000 });
    const auto = (await trig.innerText()).trim();
    await page.goto(`${ROOT}/cuu-ho`);
    await waitMain(page);
    if (!/Toàn tỉnh/.test(await trig.innerText())) throw new Error(`tải lại vẫn lọc "${(await trig.innerText()).trim()}" do thẻ Cấp xã tự chọn`);
    return `tự chọn ${auto} → tải lại: Toàn tỉnh`;
  });
  // Lãnh đạo: tình hình từng xã ngay trong hộp chọn (thang rủi ro chung) — "Cần chú ý" (Đỏ / Cam) đầu hộp, xếp nặng → nhẹ, có
  // lý do; mỗi ô xã có chấm màu; chạm một xã cần chú ý → lọc theo xã đó
  await step(ctx, 'Bộ lọc địa phương — tình hình từng xã: chấm màu mọi xã, "Cần chú ý" xếp Đỏ → Cam kèm lý do, chạm → lọc theo xã đó; vùng chạm ≥ 44 px', async () => {
    await trig.click();
    await dlg.getByText(/Cần chú ý ·|Không xã\/phường nào ở mức Đỏ \/ Cam/).first().waitFor({ timeout: 15_000 });
    const chips = await dlg.evaluate((el) => [...el.querySelectorAll('button[aria-label]')]
      .filter((b) => /^(Phường|Xã) /.test(b.getAttribute('aria-label')))
      .map((b) => ({ dot: !!b.querySelector('span.rounded-full'), label: b.getAttribute('aria-label') })));
    const noDot = chips.filter((c) => !c.dot);
    if (noDot.length) throw new Error(`${noDot.length}/${chips.length} xã thiếu chấm màu (VD ${noDot[0].label})`);
    const rows = await dlg.evaluate((el) => [...el.querySelectorAll('button[aria-label^="Cần chú ý:"]')].map((b) => b.getAttribute('aria-label')));
    const rank = { Đỏ: 3, Cam: 2 };
    const levels = rows.map((r) => rank[r.match(/ — (Đỏ|Cam): /)?.[1]] || 0);
    if (levels.some((lv) => !lv)) throw new Error(`dòng "Cần chú ý" không phải Đỏ / Cam hoặc thiếu lý do: ${rows.find((r, i) => !levels[i])}`);
    if (levels.some((lv, i) => i && lv > levels[i - 1])) throw new Error(`"Cần chú ý" không xếp nặng → nhẹ: ${levels.join(',')}`);
    if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) {
      const bad = await dlg.evaluate((el) => [...el.querySelectorAll('button, input')].map((b) => {
        const r = b.getBoundingClientRect();
        let w = r.width;
        let h = r.height;
        const a = b.classList.contains('touch-hit') && getComputedStyle(b, '::after');
        if (a && a.content !== 'none') { w = Math.max(w, parseFloat(a.width) || 0); h = Math.max(h, parseFloat(a.height) || 0); }
        return { s: Math.round(Math.min(w, h)), t: (b.getAttribute('aria-label') || b.innerText || '').slice(0, 24) };
      }).filter((x) => x.s > 0 && x.s < 44));
      if (bad.length) throw new Error(`${bad.length} vùng chạm < 44 px — ${bad.slice(0, 4).map((x) => `${x.t} ${x.s}px`).join(', ')}`);
    }
    if (!rows.length) {
      await page.keyboard.press('Escape');
      return `${chips.length} xã có chấm màu · không xã nào Đỏ / Cam`;
    }
    const name = rows[0].match(/^Cần chú ý: (?:Phường|Xã) (.+?) — /)[1];
    await dlg.locator('button[aria-label^="Cần chú ý:"]').first().click();
    await dlg.waitFor({ state: 'hidden', timeout: 3_000 });
    if (!(await trig.innerText()).includes(name)) throw new Error(`chạm "${name}" nhưng nút địa bàn ghi "${await trig.innerText()}"`);
    await trig.click();
    await dlg.getByRole('button', { name: /Toàn tỉnh Cao Bằng/ }).click();
    return `${chips.length} xã có chấm màu · ${rows.length} dòng cần chú ý đang hiện · chạm "${name}" → lọc`;
  });

  // Người mới: đổi sang một xã rồi về toàn tỉnh trong 3 chạm — nút "Về toàn tỉnh" ngay cạnh nút địa bàn (mọi cỡ màn); hộp chọn
  // có "Chọn gần đây" (chọn lại một chạm)
  await step(ctx, 'Đổi sang một phường rồi "Về toàn tỉnh" trong 3 chạm; "Chọn gần đây" chọn lại một chạm', async () => {
    const back = page.locator('header').getByRole('button', { name: 'Về toàn tỉnh', exact: true });
    if (await back.count()) throw new Error('chưa lọc mà đã có nút "Về toàn tỉnh"');
    await trig.click(); // chạm 1
    await dlg.getByRole('button', { name: new RegExp(`^Phường ${WARD.name}`) }).click(); // chạm 2
    await dlg.waitFor({ state: 'hidden', timeout: 3_000 });
    if (!(await trig.innerText()).includes(WARD.name)) throw new Error('chọn phường nhưng nút địa bàn không đổi');
    await back.click(); // chạm 3
    await page.waitForFunction(() => /Toàn tỉnh/.test(document.querySelector('header button[title="Lọc dữ liệu theo địa phương"]')?.innerText || ''), null, { timeout: 5_000 });
    if (await back.count()) throw new Error('đã về toàn tỉnh nhưng nút "Về toàn tỉnh" vẫn còn');
    await trig.click();
    await dlg.getByRole('button', { name: `Chọn lại: Phường ${WARD.name}` }).click();
    await dlg.waitFor({ state: 'hidden', timeout: 3_000 });
    if (!(await trig.innerText()).includes(WARD.name)) throw new Error('"Chọn gần đây" không chọn lại được phường');
    await back.click();
    await page.waitForFunction(() => /Toàn tỉnh/.test(document.querySelector('header button[title="Lọc dữ liệu theo địa phương"]')?.innerText || ''), null, { timeout: 5_000 });
    return 'chọn phường → Về toàn tỉnh: 3 chạm · Chọn gần đây: 1 chạm';
  });

  // Sáng / Tối (thiết kế F.2–F.3): Theo máy · Sáng · Tối trong menu tài khoản; đổi tức thì, nhớ qua tải lại (áp trước khi nạp
  // trang — không nháy), chọn lại "Theo máy" thì theo hệ điều hành; nút nhanh trên thanh báo trạng thái (aria-pressed)
  await step(ctx, 'Giao diện Theo máy / Sáng / Tối (menu tài khoản): đổi tức thì, nhớ qua tải lại, "Theo máy" theo hệ điều hành; nút nhanh có aria-pressed', async () => {
    const menu = page.getByRole('button', { name: /^Tài khoản:/ });
    const group = page.getByRole('group', { name: 'Giao diện' });
    const isDark = () => page.evaluate(() => document.documentElement.classList.contains('dark'));
    await menu.click();
    await group.waitFor({ timeout: 5_000 });
    if (await group.getByRole('button', { name: /Theo máy/ }).getAttribute('aria-pressed') !== 'true') throw new Error('máy mới chưa chọn gì nhưng "Theo máy" không được chọn');
    await group.getByRole('button', { name: /Tối/ }).click();
    if (!(await isDark())) throw new Error('chọn Tối nhưng giao diện chưa tối');
    // nút nhanh: thanh trạng thái dưới cùng (máy tính) hoặc thanh trên (máy tính bảng) — mọi bản cùng báo một trạng thái
    if (await page.locator('button[aria-label="Nền tối"]').first().getAttribute('aria-pressed') !== 'true') throw new Error('nút nhanh không báo đang nền tối');
    await page.reload();
    if (!(await isDark())) throw new Error('tải lại mất lựa chọn Tối');
    await menu.click();
    await group.getByRole('button', { name: /Theo máy/ }).click();
    const system = await page.evaluate(() => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    if ((await isDark()) !== (system === 'dark')) throw new Error(`chọn Theo máy nhưng giao diện không theo máy (${system})`);
    if (await page.evaluate(() => localStorage.getItem('pctt_theme'))) throw new Error('chọn Theo máy nhưng vẫn nhớ lựa chọn cũ');
    if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) {
      const bad = await group.evaluate((el) => [...el.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().height < 44).length);
      if (bad) throw new Error(`${bad} nút Giao diện < 44 px`);
    }
    await menu.click(); // đóng menu tài khoản
    return `máy: ${system}`;
  });

  // Thiết kế F: chữ đọc rõ ở cả hai nền — mọi màu chữ (chính, phụ, mờ, nhấn, cảnh báo) ≥ 4,5 : 1 trên nền trang, ô, ô phụ;
  // chữ trắng trên nút màu nhấn ≥ 4,5 : 1. Đọc biến màu thật của trang (index.css), không phải số chép lại
  await step(ctx, 'Tương phản chữ ≥ 4,5 : 1 ở nền Sáng và Tối (chữ chính, phụ, mờ, nhấn, cảnh báo; chữ trắng trên nút nhấn)', async () => {
    const bad = await page.evaluate(() => {
      const root = document.documentElement;
      const had = root.classList.contains('dark');
      const lum = ([r, g, b]) => {
        const f1 = (c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f1(r) + 0.7152 * f1(g) + 0.0722 * f1(b);
      };
      const ratio = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const out = [];
      for (const dark of [false, true]) {
        root.classList.toggle('dark', dark);
        const cs = getComputedStyle(root);
        const v = (n) => cs.getPropertyValue(n).trim().split(/\s+/).map(Number);
        for (const fg of ['--ink', '--ink-2', '--muted', '--accent-text', '--danger-text', '--serious-text', '--warn-text', '--good-text']) {
          for (const bg of ['--bg', '--panel', '--panel-2']) {
            const r = ratio(v(fg), v(bg));
            if (!(r >= 4.5)) out.push(`${dark ? 'Tối' : 'Sáng'} ${fg} trên ${bg}: ${r.toFixed(2)}`);
          }
        }
        const w = ratio([255, 255, 255], v('--accent'));
        if (!(w >= 4.5)) out.push(`${dark ? 'Tối' : 'Sáng'} chữ trắng trên nút màu nhấn: ${w.toFixed(2)}`);
      }
      root.classList.toggle('dark', had);
      return out;
    });
    if (bad.length) throw new Error(bad.slice(0, 6).join('; '));
    return '8 màu chữ × 3 nền × 2 giao diện đạt';
  });
}

/** Tài khoản phường: nút ghi tên phường của mình; hộp chọn chỉ có phường đó (phạm vi được giao). */
async function areaFilterWard(ctx) {
  const { page } = ctx;
  await step(ctx, 'Bộ lọc địa phương — tài khoản phường: nút ghi tên phường, hộp chọn chỉ có phường được giao', async () => {
    await loginAs(page, WARD);
    const trig = page.locator('header button[title="Lọc dữ liệu theo địa phương"]');
    await page.waitForFunction((name) => document.querySelector('header button[title="Lọc dữ liệu theo địa phương"]')?.innerText.includes(name), WARD.name, { timeout: 15_000 });
    await trig.click();
    const dlg = page.getByRole('dialog', { name: /Chọn địa bàn/ });
    await dlg.getByRole('button', { name: /^(Phường|Xã) / }).first().waitFor({ timeout: 15_000 });
    const units = await dlg.getByRole('button', { name: /^(Phường|Xã) / }).allInnerTexts();
    if (units.length !== 1 || !units[0].includes(WARD.name)) throw new Error(`hộp chọn có ${JSON.stringify(units)}`);
    // Tình hình từng xã cũng theo phạm vi: "Cần chú ý" (nếu có) chỉ có phường của mình
    await dlg.getByText(/Cần chú ý ·|Không xã\/phường nào ở mức Đỏ \/ Cam/).first().waitFor({ timeout: 15_000 });
    const hot = await dlg.locator('button[aria-label^="Cần chú ý:"]').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')));
    if (hot.some((h) => !h.includes(WARD.name))) throw new Error(`"Cần chú ý" có xã ngoài phạm vi: ${hot.join(' | ')}`);
    await page.keyboard.press('Escape');
    return (await trig.innerText()).trim();
  });
}

// ================================================================ Tìm kiếm toàn năng (trang F)
// Từ 768 px: ô tìm trên thanh trên cùng (phím "/"); điện thoại: nút kính lúp → hộp tìm (trước đây điện thoại không tìm được).
// Gợi ý cách gõ, tìm không dấu, không thấy → gợi ý, máy chủ lỗi → báo + Thử lại, mất mạng → báo rồi tự tìm khi có mạng; chọn
// phường → lọc cả hệ thống + Bản đồ; "Tìm gần đây"; mã SOS → mở đúng phiếu ở Cứu hộ (bỏ lọc địa bàn nếu phiếu ở xã khác).
// Chỉ xem (bộ lọc, tìm gần đây ghi ở bộ nhớ trình duyệt thử).
async function omniSearch(ctx) {
  const { page, vp } = ctx;
  const input = page.getByRole('combobox', { name: 'Tìm kiếm toàn năng' });
  const wide = () => page.evaluate(() => innerWidth >= 768);
  const openSearch = async () => {
    if (await wide()) await page.keyboard.press('/');
    else {
      await page.getByRole('button', { name: 'Tìm kiếm toàn năng' }).click();
      await page.getByRole('dialog', { name: 'Tìm kiếm' }).waitFor({ timeout: 5_000 });
    }
    await input.waitFor({ timeout: 5_000 });
  };
  const panel = () => (vp.mobile ? page.getByRole('dialog', { name: 'Tìm kiếm' }) : page.locator('header'));
  const options = page.getByRole('listbox', { name: 'Kết quả tìm kiếm' }).getByRole('option');

  await step(ctx, 'Tìm kiếm toàn năng: ô tìm (phím "/") / nút kính lúp trên điện thoại — gợi ý cách gõ, tìm không dấu, không thấy, máy chủ lỗi (Thử lại), mất mạng báo rõ; vùng chạm ≥ 44 px', async () => {
    await loginAs(page, STAFF);
    await openSearch();
    if (!(await input.evaluate((el) => el === document.activeElement))) throw new Error('mở tìm kiếm nhưng con trỏ không ở ô tìm');
    await panel().getByText(/Gõ ít nhất 2 ký tự/).waitFor({ timeout: 3_000 });
    await input.fill('thuc phan');
    await page.getByRole('option', { name: new RegExp(`Phường ${WARD.name}.*Lọc theo phường`) }).waitFor({ timeout: 10_000 });
    if (await input.getAttribute('aria-expanded') !== 'true') throw new Error('ô tìm thiếu aria-expanded khi có kết quả');
    await input.fill('qqzzxxkk');
    await panel().getByText(/Không thấy “qqzzxxkk”/).waitFor({ timeout: 10_000 });
    // Máy chủ không trả lời (cắt kết nối — trả 5xx thì bước kiểm thử tự coi là lỗi API) → nói rõ, Thử lại tìm lại được
    await page.route('**/api/v1/search**', (r) => r.abort('connectionrefused'));
    await input.fill('bao lac');
    await panel().getByText('Không tìm được — máy chủ không trả lời').waitFor({ timeout: 10_000 });
    await page.unroute('**/api/v1/search**');
    await panel().getByRole('button', { name: 'Thử lại' }).click();
    await page.getByRole('option', { name: /Bảo Lạc/ }).first().waitFor({ timeout: 10_000 });
    // Mất mạng → báo, có mạng lại tự tìm
    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await input.fill('bao lam');
    await panel().getByText(/Mất mạng — chưa tìm được/).waitFor({ timeout: 5_000 });
    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.getByRole('option', { name: /Bảo Lâm/ }).first().waitFor({ timeout: 10_000 });
    if (vp.mobile) await expectNoOverflow(ctx, 'hộp tìm kiếm', page.getByRole('dialog', { name: 'Tìm kiếm' }));
    if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) {
      const bad = await page.evaluate(() => [...document.querySelectorAll('[role="option"], [role="dialog"] button, [role="dialog"] input, header button')]
        .filter((el) => el.getBoundingClientRect().width > 0)
        .map((el) => {
          const r = el.getBoundingClientRect();
          let w = r.width;
          let h = r.height;
          const a = el.classList.contains('touch-hit') && getComputedStyle(el, '::after');
          if (a && a.content !== 'none') { w = Math.max(w, parseFloat(a.width) || 0); h = Math.max(h, parseFloat(a.height) || 0); }
          return { s: Math.round(Math.min(w, h)), t: (el.getAttribute('aria-label') || el.innerText || '').slice(0, 24) };
        })
        .filter((x) => x.s < 44));
      if (bad.length) throw new Error(`${bad.length} vùng chạm < 44 px — ${bad.slice(0, 4).map((x) => `${x.t} ${x.s}px`).join(', ')}`);
    }
    return `${await options.count()} kết quả "bao lam"`;
  });

  await step(ctx, 'Tìm kiếm toàn năng: chọn phường → lọc cả hệ thống + Bản đồ; "Tìm gần đây"; mã SOS → mở đúng phiếu ở Cứu hộ, bỏ lọc nếu phiếu ở xã khác', async () => {
    // Mỗi bước bắt đầu bằng đóng hộp thoại còn mở — điện thoại: mở lại hộp tìm
    if (!(await input.isVisible())) await openSearch();
    await input.fill('thuc phan');
    await page.getByRole('option', { name: new RegExp(`Phường ${WARD.name}`) }).click();
    await page.waitForURL(/\/ban-do/, { timeout: 10_000 });
    const trig = page.locator('header button[title="Lọc dữ liệu theo địa phương"]');
    if (!(await trig.innerText()).includes(WARD.name)) throw new Error(`chọn phường xong, nút địa bàn ghi "${await trig.innerText()}"`);
    await openSearch();
    await page.getByRole('listbox', { name: 'Tìm gần đây' }).getByRole('option', { name: new RegExp(WARD.name) }).waitFor({ timeout: 3_000 });
    await input.fill('SOS-');
    const sos = page.getByRole('option', { name: /Mở phiếu/ }).first();
    if (!(await sos.waitFor({ timeout: 10_000 }).then(() => true, () => false))) {
      await page.keyboard.press('Escape');
      return 'bỏ qua mã SOS: chưa có phiếu nào';
    }
    const code = (await sos.innerText()).match(/SOS-\d+/)?.[0];
    await sos.click();
    await page.waitForURL(/\/cuu-ho/, { timeout: 10_000 });
    const box = page.getByRole('textbox', { name: 'Tìm trong danh sách' });
    await page.waitForFunction((c) => [...document.querySelectorAll('input[aria-label="Tìm trong danh sách"]')].some((el) => el.value === c), code, { timeout: 15_000 });
    if (/phieu=/.test(page.url())) throw new Error('địa chỉ còn ?phieu= — nút Quay lại sẽ mở lại phiếu');
    const shown = await page.locator('main').getByText(code, { exact: false }).count();
    if (!shown) throw new Error(`mở Cứu hộ nhưng không thấy phiếu ${code}`);
    return `${code} → ${new URL(page.url()).search || '(cột Chờ xử lý)'} · ô tìm "${await box.first().inputValue()}" · địa bàn "${(await trig.innerText()).trim()}"`;
  });
}

// ================================================================ Đợt thiên tai & báo cáo (DB5) — laptop, iPad dọc, điện thoại 360
// Danh sách đợt (đang diễn ra lên đầu) → báo cáo: 6 ô chỉ số, 2 biểu đồ (SOS theo ngày, diễn biến sơ tán), 5 bảng (SOS theo
// xã, vật tư, sơ tán, cảnh báo, vùng nguy hiểm), Excel; dưới 1024 px (điện thoại, iPad dọc): danh sách trước, chạm mở báo cáo,
// "Tất cả đợt" quay lại. Form mở đợt 2 bước: Tiếp khi trống → lỗi dưới ô, con trỏ về ô Tên đợt; chưa chọn xã → báo; tìm xã
// không dấu. Máy thử (không UI_READONLY; laptop + điện thoại): mở đợt ở phường Thục Phán → báo cáo của đợt mới, kết thúc ngay →
// "Đã kết thúc" (đợt chỉ mở vài giây, ở 1 phường). Cảm ứng: vùng chạm ≥ 44 px; không tràn ngang. Tài khoản phường: không có
// nút mở đợt, chỉ thấy đợt toàn tỉnh / có phường mình.
const EVENT_DEVICES = RESOURCE_DEVICES;
const REPORT_TABLES = ['Phiếu SOS theo xã/phường', 'Vật tư đã cấp (sổ xuất – nhập kho)', 'Sơ tán — số cao nhất trong đợt',
  'Lệnh cảnh báo trong đợt', 'Vùng nguy hiểm khoanh trong đợt'];
const formErrors = (dialog) => dialog.locator('[id^="loi-dot-"]').allInnerTexts().then((a) => a.map((t) => t.trim()).filter(Boolean));

async function expectTouchTargets(page, where) {
  if (!(await page.evaluate(() => matchMedia('(pointer: coarse)').matches))) return;
  const bad = await smallTargets(page);
  if (bad.length) throw new Error(`${where}: ${bad.length} vùng chạm < 44 px — ${bad.slice(0, 4).map((s) => `${s.what} ${s.size}px`).join(', ')}`);
}

async function eventsPage(ctx, { create }) {
  const { page } = ctx;
  await step(ctx, 'Đợt thiên tai: danh sách → báo cáo (6 ô chỉ số, 2 biểu đồ, 5 bảng), Excel, không tràn, vùng chạm ≥ 44 px', async () => {
    await loginAs(page, STAFF);
    await page.goto(`${ROOT}/dot-thien-tai`);
    const list = page.getByRole('list', { name: 'Các đợt thiên tai' });
    const empty = page.getByText('Chưa có đợt thiên tai nào');
    await list.or(empty).first().waitFor({ timeout: 20_000 });
    if (!(await list.count())) {
      await expectNoOverflow(ctx, 'trang đợt thiên tai (chưa có đợt)');
      return 'chưa có đợt nào — báo "Chưa có đợt thiên tai nào"';
    }
    const live = await list.getByRole('button').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label').endsWith('đang diễn ra')));
    if (live.indexOf(false) !== -1 && live.lastIndexOf(true) > live.indexOf(false)) throw new Error('đợt đang diễn ra không nằm trên đầu danh sách');
    const kpis = page.getByRole('group', { name: 'Chỉ số của đợt' });
    // Dưới 1024 px (điện thoại, iPad dọc): danh sách trước, chạm mở báo cáo; máy tính: danh sách bên trái, báo cáo bên phải
    const narrow = await page.evaluate(() => innerWidth < 1024);
    if (narrow) {
      if (await kpis.count()) throw new Error('màn hẹp: chưa chạm đợt nào đã hiện báo cáo (phải là danh sách trước)');
      await expectTouchTargets(page, 'danh sách đợt');
      await list.getByRole('button').first().click();
    }
    await kpis.waitFor({ timeout: 20_000 });
    const k = await kpis.locator(':scope > *').count();
    if (k !== 6) throw new Error(`${k} ô chỉ số (cần 6)`);
    for (const t of REPORT_TABLES) await page.getByRole('region', { name: t }).waitFor({ timeout: 5_000 });
    for (const h of ['Phiếu SOS theo ngày', 'Diễn biến sơ tán']) await page.getByRole('heading', { name: h, exact: true }).waitFor({ timeout: 5_000 });
    const code = (await page.locator('main h2').first().locator('xpath=..').innerText()).match(/DT-\d{4}-\d{3}/)?.[0];
    const first = (await list.count()) ? await list.getByRole('button').first().getAttribute('aria-label') : null;
    if (first && !first.startsWith(code)) throw new Error(`báo cáo ${code} nhưng đợt đầu danh sách là ${first}`);
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15_000 }), page.getByRole('button', { name: /^Excel$/ }).click()]);
    if (!/^bao-cao-DT-\d{4}-\d{3}-.*\.xlsx$/.test(download.suggestedFilename())) throw new Error(`tên tệp Excel: ${download.suggestedFilename()}`);
    await expectNoOverflow(ctx, `báo cáo ${code}`);
    await expectTouchTargets(page, `báo cáo ${code}`);
    if (narrow) {
      if (!/[?&]dot=DT-/.test(page.url())) throw new Error('màn hẹp: mở báo cáo nhưng địa chỉ không có ?dot= (Quay lại không về danh sách)');
      await page.getByRole('button', { name: 'Tất cả đợt' }).click();
      await list.waitFor({ timeout: 5_000 });
      if (await kpis.count()) throw new Error('"Tất cả đợt" không trả về danh sách');
    }
    return `${(await page.locator('main [aria-label="Các đợt thiên tai"] > li').count())} đợt · báo cáo ${code} · ${download.suggestedFilename()}`;
  });

  await step(ctx, READONLY || !create ? 'Mở đợt thiên tai: form 2 bước, lỗi ngay dưới ô (không ghi)' : 'Mở đợt thiên tai ở 1 phường → báo cáo đợt mới → kết thúc đợt', async () => {
    if (!(await page.getByRole('list', { name: 'Các đợt thiên tai' }).or(page.getByText('Chưa có đợt thiên tai nào')).count())) await page.goto(`${ROOT}/dot-thien-tai`);
    const btn = page.getByRole('button', { name: /^Mở đợt/ }).first();
    await btn.waitFor({ timeout: READONLY ? 5_000 : 15_000 }).catch((e) => { if (!READONLY) throw e; });
    if (READONLY && !(await btn.count())) return 'bỏ qua: tài khoản không có quyền mở đợt (event.manage)';
    await btn.click();
    const dlg = page.getByRole('dialog', { name: 'Mở đợt thiên tai' });
    await dlg.waitFor();
    await dlg.getByRole('button', { name: /^Tiếp/ }).click();
    const e1 = await formErrors(dlg);
    if (e1.length < 2) throw new Error(`Tiếp khi trống: ${e1.length} lỗi — cần báo thiếu tên và loại thiên tai`);
    const focus = await page.evaluate(() => document.activeElement?.id);
    if (focus !== 'dot-ten') throw new Error(`con trỏ ở "${focus || '?'}", không về ô Tên đợt`);
    await dlg.getByLabel('Tên đợt *').fill('Thử giao diện: mưa lớn (kiểm thử tự động)');
    await dlg.getByRole('radio', { name: /Mưa lớn/ }).click();
    await expectNoOverflow(ctx, 'form mở đợt bước 1', dlg);
    await expectTouchTargets(page, 'form mở đợt bước 1');
    await dlg.getByRole('button', { name: /^Tiếp/ }).click();
    await dlg.getByRole('radio', { name: 'Chọn xã/phường' }).click();
    await dlg.getByRole('button', { name: /Mở đợt$/ }).click();
    const e2 = await formErrors(dlg);
    if (!e2.length) throw new Error('chưa chọn xã/phường mà bấm Mở đợt không báo lỗi');
    await dlg.getByPlaceholder('Tìm xã / phường…').fill('thuc phan');
    const found = dlg.getByRole('group', { name: 'Xã/phường trong vùng ảnh hưởng' }).getByRole('checkbox');
    if ((await found.count()) !== 1) throw new Error(`tìm "thuc phan" ra ${await found.count()} xã/phường (cần đúng 1)`);
    await found.first().click();
    if ((await found.first().getAttribute('aria-checked')) !== 'true') throw new Error('chạm Phường Thục Phán không chọn được');
    if (await formErrors(dlg).then((a) => a.length)) throw new Error('đã chọn xã mà lỗi "chưa chọn vùng" vẫn còn');
    await expectNoOverflow(ctx, 'form mở đợt bước 2', dlg);
    await expectTouchTargets(page, 'form mở đợt bước 2');
    if (READONLY || !create) {
      await dlg.getByRole('button', { name: 'Huỷ', exact: true }).click();
      await dlg.waitFor({ state: 'hidden', timeout: 5_000 });
      return `lỗi bước 1: ${e1.join(' / ')} · bước 2: ${e2.join(' / ')}`;
    }
    await dlg.getByRole('button', { name: /Mở đợt$/ }).click();
    await dlg.waitFor({ state: 'hidden', timeout: 15_000 });
    await page.waitForURL(/[?&]dot=DT-\d{4}-\d{3}/, { timeout: 10_000 });
    const code = new URL(page.url()).searchParams.get('dot');
    await page.getByRole('group', { name: 'Chỉ số của đợt' }).waitFor({ timeout: 20_000 });
    const head = page.locator('main h2').first().locator('xpath=..');
    if (!(await head.innerText()).includes('Đang diễn ra')) throw new Error(`báo cáo ${code} không ghi "Đang diễn ra"`);
    await page.getByRole('button', { name: 'Kết thúc đợt', exact: true }).click();
    const end = page.getByRole('dialog', { name: `Kết thúc đợt ${code}` });
    await end.waitFor();
    await end.getByRole('button', { name: 'Mưa đã ngớt, nước rút dưới báo động I' }).click();
    if (!(await end.locator('#dot-ket-thuc-ghi-chu').inputValue()).includes('nước rút')) throw new Error('chip lý do không điền vào ô ghi chú');
    await expectTouchTargets(page, 'hộp thoại kết thúc đợt');
    await end.getByRole('button', { name: 'Kết thúc đợt', exact: true }).click();
    await end.waitFor({ state: 'hidden', timeout: 15_000 });
    await head.getByText('Đã kết thúc').waitFor({ timeout: 10_000 });
    if (await page.getByRole('button', { name: 'Kết thúc đợt', exact: true }).count()) throw new Error('đợt đã kết thúc vẫn còn nút "Kết thúc đợt"');
    return `${code}: mở → báo cáo → đã kết thúc`;
  });
}

async function eventsWard(ctx) {
  const { page } = ctx;
  await step(ctx, `Đợt thiên tai — tài khoản phường (${WARD.name}): không có nút mở đợt, chỉ thấy đợt toàn tỉnh / có phường mình`, async () => {
    try {
      await loginAs(page, WARD);
    } catch (e) {
      if (READONLY) return `bỏ qua: không đăng nhập được ${WARD.user}`;
      throw e;
    }
    await page.goto(`${ROOT}/dot-thien-tai`);
    const list = page.getByRole('list', { name: 'Các đợt thiên tai' });
    await list.or(page.getByText('Chưa có đợt thiên tai nào')).first().waitFor({ timeout: 20_000 });
    if (await page.getByRole('button', { name: /^Mở đợt/ }).count()) throw new Error('tài khoản phường thấy nút "Mở đợt"');
    const areas = await list.getByRole('button').evaluateAll((bs) => bs.map((b) => b.innerText));
    const wrong = areas.filter((t) => !/Toàn tỉnh|\d+ xã\/phường/.test(t) && !t.includes(WARD.name));
    if (wrong.length) throw new Error(`${wrong.length} đợt ngoài phạm vi: ${wrong[0].replace(/\s+/g, ' ').slice(0, 80)}`);
    if (areas.length) {
      await list.getByRole('button').first().click();
      await page.getByRole('group', { name: 'Chỉ số của đợt' }).waitFor({ timeout: 20_000 });
      if (await page.getByRole('button', { name: 'Kết thúc đợt', exact: true }).or(page.getByRole('button', { name: 'Sửa', exact: true })).count()) {
        throw new Error('tài khoản phường thấy nút Sửa / Kết thúc đợt');
      }
    }
    await expectNoOverflow(ctx, 'đợt thiên tai (tài khoản phường)');
    return `${areas.length} đợt trong phạm vi`;
  });
}

/**
 * Hướng dẫn xử lý theo vai trò — chỉ xem: tài khoản Quản trị hệ thống mở ra đúng hướng dẫn của mình, chạm "Bạn đang gặp việc
 * gì?" → cuộn tới đúng tình huống, nút dưới tình huống mở thẳng màn hình xử lý, đổi sang hướng dẫn cấp xã; tài khoản phường
 * thấy hướng dẫn cấp xã, gợi ý đầu trang Cứu hộ là câu của cấp xã, có liên kết tới hướng dẫn đầy đủ. Không tràn ngang.
 */
const GUIDE_DEVICES = [
  ['Laptop', { viewport: { width: 1366, height: 800 } }, false],
  ['Điện thoại 360', devices['Galaxy S8'], true],
];

async function guidePage(ctx) {
  const { page } = ctx;
  await step(ctx, 'Hướng dẫn xử lý (Quản trị hệ thống): đúng vai trò, chạm tình huống → cuộn tới các bước, nút mở thẳng màn hình', async () => {
    await loginAs(page, STAFF);
    await page.goto(`${ROOT}/huong-dan`);
    await waitMain(page);
    await page.getByRole('heading', { name: 'Bạn đang gặp việc gì?' }).waitFor();
    const roles = page.getByRole('group', { name: 'Hướng dẫn cho' });
    const pressed = await roles.locator('[aria-pressed="true"]').innerText();
    if (!/Quản trị/.test(pressed)) throw new Error(`tài khoản quản trị mở ra hướng dẫn "${pressed}"`);
    const cards = page.locator('main article');
    const n = await cards.count();
    if (n < 4) throw new Error(`chỉ có ${n} tình huống`);
    for (let i = 0; i < n; i += 1) {
      const card = cards.nth(i);
      if (await card.locator('ol > li').count() < 3) throw new Error(`tình huống thứ ${i + 1} ít hơn 3 bước`);
      if (!(await card.getByRole('link').count())) throw new Error(`tình huống thứ ${i + 1} không có nút mở màn hình xử lý`);
    }
    await expectNoOverflow(ctx, 'hướng dẫn xử lý');

    // Chạm một tình huống → thẻ của nó vào tầm nhìn
    await page.getByRole('button', { name: /Trạm đo, nguồn dự báo không gửi số liệu/ }).click();
    const target = page.locator('article', { has: page.getByRole('heading', { name: 'Trạm đo, nguồn dự báo không gửi số liệu' }) });
    await page.waitForFunction((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.top < window.innerHeight * 0.6;
    }, await target.elementHandle(), { timeout: 5_000 });
    await target.getByRole('link', { name: /Mở Nguồn dữ liệu/ }).click();
    await page.waitForURL(/\/nguon-du-lieu/, { timeout: 10_000 });

    // Xem hướng dẫn của vai trò khác
    await page.goto(`${ROOT}/huong-dan`);
    await waitMain(page);
    await roles.getByRole('button', { name: /Cấp xã|Cán bộ cấp xã/ }).click();
    await page.waitForURL(/vai=xa/);
    await page.getByRole('heading', { name: 'Xã cần tỉnh chi viện' }).waitFor();
    return `${n} tình huống`;
  });

  await step(ctx, `Hướng dẫn xử lý (tài khoản phường ${WARD.name}): hướng dẫn cấp xã, gợi ý đầu trang Cứu hộ theo cấp xã`, async () => {
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await loginAs(page, WARD);
    await page.goto(`${ROOT}/cuu-ho`);
    await waitMain(page);
    const tips = page.getByRole('region', { name: 'Gợi ý cho người mới' });
    await tips.waitFor({ timeout: 15_000 });
    if (!/phiếu cứu hộ của xã mình/.test(await tips.innerText())) throw new Error('gợi ý ở trang Cứu hộ không phải câu của cấp xã');
    await tips.getByRole('link', { name: 'Hướng dẫn đầy đủ' }).click();
    await page.waitForURL(/\/huong-dan\?vai=xa/);
    await page.getByRole('heading', { name: 'Người dân báo gặp nạn' }).waitFor();
    const pressed = await page.getByRole('group', { name: 'Hướng dẫn cho' }).locator('[aria-pressed="true"]').innerText();
    if (!/xã/.test(pressed)) throw new Error(`tài khoản phường mở ra hướng dẫn "${pressed}"`);
    await expectNoOverflow(ctx, 'hướng dẫn xử lý (tài khoản phường)');
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
  for (const [label, opts, phone] of RESCUE_DEVICES) {
    const dctx = await browser.newContext({ ...opts, locale: 'vi-VN', acceptDownloads: true });
    dctx.setDefaultTimeout(15_000);
    const dPage = await dctx.newPage();
    const vpD = { name: `Điều hành cứu hộ · ${label}`, mobile: phone };
    const rctxD = { page: dPage, vp: vpD, problems: watch(dPage) };
    await rescuePage(rctxD);
    await rescueForms(rctxD);
    await rescueOverview(rctxD);
    await dctx.close();
    if (phone) {
      const wctx = await browser.newContext({ ...opts, locale: 'vi-VN' });
      wctx.setDefaultTimeout(15_000);
      const wPage = await wctx.newPage();
      await rescueWard({ page: wPage, vp: vpD, problems: watch(wPage) });
      await wctx.close();
    }
  }
  for (const [label, opts, phone] of GUIDE_DEVICES) {
    const gctx = await browser.newContext({ ...opts, locale: 'vi-VN' });
    gctx.setDefaultTimeout(15_000);
    const gPage = await gctx.newPage();
    await guidePage({ page: gPage, vp: { name: `Hướng dẫn xử lý · ${label}`, mobile: phone }, problems: watch(gPage) });
    await gctx.close();
  }
  for (const [label, opts, phone] of RESOURCE_DEVICES.filter(([, , phone], i) => phone || i === 0)) {
    const cctx = await browser.newContext({ ...opts, locale: 'vi-VN' });
    cctx.setDefaultTimeout(15_000);
    const cPage = await cctx.newPage();
    await communeHome({ page: cPage, vp: { name: `Trang chủ cấp xã · ${label}`, mobile: phone }, problems: watch(cPage) });
    await cctx.close();
  }
  for (const [label, opts, phone] of AREA_DEVICES) {
    const fctx = await browser.newContext({ ...opts, locale: 'vi-VN' });
    fctx.setDefaultTimeout(15_000);
    const fPage = await fctx.newPage();
    const vpF = { name: `Bộ lọc địa phương · ${label}`, mobile: phone };
    await areaFilter({ page: fPage, vp: vpF, problems: watch(fPage) });
    await fctx.close();
    const sctx = await browser.newContext({ ...opts, locale: 'vi-VN' });
    sctx.setDefaultTimeout(15_000);
    const sPage = await sctx.newPage();
    await omniSearch({ page: sPage, vp: { name: `Tìm kiếm toàn năng · ${label}`, mobile: phone }, problems: watch(sPage) });
    await sctx.close();
    if (phone) {
      const wctx = await browser.newContext({ ...opts, locale: 'vi-VN' });
      wctx.setDefaultTimeout(15_000);
      const wPage = await wctx.newPage();
      await areaFilterWard({ page: wPage, vp: vpF, problems: watch(wPage) });
      await wctx.close();
    }
  }
  for (const [label, opts, phone] of ALERT_DEVICES) {
    const actx = await browser.newContext({ ...opts, locale: 'vi-VN', acceptDownloads: true });
    actx.setDefaultTimeout(15_000);
    const aPage = await actx.newPage();
    const vpA = { name: `Cảnh báo khẩn cấp · ${label}`, mobile: phone };
    const actxA = { page: aPage, vp: vpA, problems: watch(aPage) };
    await alertsPage(actxA);
    await alertsForms(actxA);
    await alertsOverview(actxA);
    await actx.close();
    if (phone) {
      const wctx = await browser.newContext({ ...opts, locale: 'vi-VN' });
      wctx.setDefaultTimeout(15_000);
      const wPage = await wctx.newPage();
      await alertsWard({ page: wPage, vp: vpA, problems: watch(wPage) });
      await wctx.close();
    }
  }
  for (const [label, opts, phone] of RESOURCE_DEVICES) {
    const rctx = await browser.newContext({ ...opts, locale: 'vi-VN', acceptDownloads: true });
    rctx.setDefaultTimeout(15_000);
    const rPage = await rctx.newPage();
    const vpR = { name: `Vật tư & Lực lượng · ${label}`, mobile: phone };
    await resourcesPage({ page: rPage, vp: vpR, problems: watch(rPage) });
    await inventoryLedger({ page: rPage, vp: vpR, problems: watch(rPage) });
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
  // Đợt thiên tai — chạy cuối: đợt mở thử (laptop, điện thoại) chỉ ở 1 phường và kết thúc ngay; đặt cuối để bước lỗi giữa
  // chừng (đợt còn mở) không gắn phiếu / dòng sổ kho của các bước khác vào đợt
  for (const [label, opts, phone] of EVENT_DEVICES) {
    const ectx = await browser.newContext({ ...opts, locale: 'vi-VN', acceptDownloads: true });
    ectx.setDefaultTimeout(15_000);
    const ePage = await ectx.newPage();
    const vpE = { name: `Đợt thiên tai · ${label}`, mobile: phone };
    await eventsPage({ page: ePage, vp: vpE, problems: watch(ePage) }, { create: phone || label.startsWith('Laptop') });
    await ectx.close();
    if (phone) {
      const wctx = await browser.newContext({ ...opts, locale: 'vi-VN' });
      wctx.setDefaultTimeout(15_000);
      const wPage = await wctx.newPage();
      await eventsWard({ page: wPage, vp: vpE, problems: watch(wPage) });
      await wctx.close();
    }
  }
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} kiểm tra giao diện THẤT BẠI` : '\nTất cả kiểm tra giao diện đạt');
process.exitCode = failures ? 1 : 0;
