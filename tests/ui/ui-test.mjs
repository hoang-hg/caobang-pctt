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
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} kiểm tra giao diện THẤT BẠI` : '\nTất cả kiểm tra giao diện đạt');
process.exitCode = failures ? 1 : 0;
