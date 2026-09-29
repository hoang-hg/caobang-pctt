#!/usr/bin/env node
// Kiểm thử luồng xã/phường GỬI dữ liệu → cấp tỉnh PHÊ DUYỆT (quyền data.submit / data.import) — cần stack DEMO_MODE=true.
//   node tests/e2e/submission-test.mjs [http://localhost:8000] [http://localhost:8025 (Mailpit)]
// Phạm vi xã, dữ liệu chờ duyệt không hiện ở đâu, xem thay đổi cũ → mới, duyệt / từ chối / rút, không ghi đè dữ liệu xã khác.
const ROOT = process.argv[2] || 'http://localhost:8000';
const MAILPIT = process.argv[3] || 'http://localhost:8025';
const BASE = ROOT + '/api/v1';

async function call(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let data = raw;
  try { data = JSON.parse(raw); } catch { /* CSV / HTML */ }
  return { status: res.status, data };
}
let failed = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failed++;
};
const login = async (u, p) => (await call('POST', '/auth/login', { username: u, password: p })).data?.token;
const form = (fields, filename, content) => {
  const f = new FormData();
  Object.entries(fields).forEach(([k, v]) => f.append(k, v));
  f.append('file', new Blob([content]), filename);
  return f;
};
const validate = (name, csv, token, mode = 'upsert') => call('POST', `/data-import/datasets/${name}/validate`, form({ mode }, `${name}.csv`, csv), token);
const submit = (name, csv, token, extra = {}) => call('POST', '/data-import/submissions', form({ name, mode: 'upsert', ...extra }, `${name}.csv`, csv), token);
const publicSites = async () => (await call('GET', `/public/map?_=${Date.now()}`)).data?.evacuation_sites || [];

const xa = await login('admin.coba', 'admincoba123'); // quản trị xã Cô Ba (BAOLAC/CB-COBA)
const xaKhac = await login('admin.cathan', 'admincathan123'); // quản trị xã Ca Thành
const tinh = await login('admin.tinh', 'admintinh123'); // quản trị tỉnh — duyệt
const xem = await login('xem', 'xem123');
check('Đăng nhập xã, tỉnh', !!xa && !!xaKhac && !!tinh);
const stamp = Date.now().toString(36).toUpperCase();
const units = (await call('GET', '/admin-units?level=xa', null, tinh)).data || [];
const at = (code) => {
  const u = units.find((x) => x.code === code);
  return u?.lat != null ? [u.lat, u.lon] : [(u.bbox[1] + u.bbox[3]) / 2, (u.bbox[0] + u.bbox[2]) / 2];
};
const [cbLat, cbLon] = at('CB-COBA');
const [tpLat, tpLon] = at('CB-THUCPHAN');

// ---- Quyền & danh mục của xã
check('Tài khoản quan sát không vào được nhập / gửi dữ liệu → 403', (await call('GET', '/data-import/datasets', null, xem)).status === 403);
const list = (await call('GET', '/data-import/datasets', null, xa)).data || [];
check('Xã chỉ thấy loại dữ liệu được gửi (không có hồ chứa, trạm, ranh giới)',
  list.length === 9 && !list.some((d) => ['ho_chua', 'tram_quan_trac', 'ranh_gioi_xa', 'cay_xang'].includes(d.name)), list.map((d) => d.name).join(','));
check('Form của xã: kho chỉ chọn được cấp "xa"', JSON.stringify(list.find((d) => d.name === 'kho')?.fields.find((f) => f.name === 'cap')?.choices) === '["xa"]');
const tpl = await call('GET', '/data-import/datasets/diem_so_tan/template', null, xa);
check('Tệp mẫu của xã điền sẵn mã xã mình', tpl.status === 200 && String(tpl.data).includes('CB-COBA'));
check('Xã không kiểm tra / gửi được hồ chứa → 403', (await validate('ho_chua', 'ma,ten\nHO-X,Hồ\n', xa)).status === 403);
check('Xã không nhập thẳng được → 403',
  (await call('POST', '/data-import/datasets/diem_so_tan/apply', form({ mode: 'upsert' }, 'a.csv', 'ma\n'), xa)).status === 403);

// ---- Kiểm tra phạm vi xã
const HEAD = 'ma,ten,loai,suc_chua,vi_do,kinh_do,ma_xa';
const outside = await validate('diem_so_tan',
  `${HEAD}\nSUB-${stamp}-1,Nhà văn hoá thử,nha_van_hoa,120,${cbLat},${cbLon},\nSUB-${stamp}-2,Ngoài xã,khac,50,${tpLat},${tpLon},\nSUB-${stamp}-3,Ghi xã khác,khac,50,${cbLat},${cbLon},CB-CATHANH\n`, xa);
const errRows = [...new Set((outside.data?.errors || []).map((e) => e.row))].sort();
check('Vị trí ngoài xã / mã xã khác → lỗi đúng dòng 3, 4', JSON.stringify(errRows) === '[3,4]', JSON.stringify(outside.data?.errors?.map((e) => [e.row, e.message])));
const kho = await validate('kho', `ma,ten,cap,vi_do,kinh_do\nKHO-${stamp},Kho thử,tinh,${cbLat},${cbLon}\n`, xa);
check('Xã gửi kho cấp tỉnh → lỗi cột cấp', kho.data?.errors?.some((e) => e.field === 'cap'), JSON.stringify(kho.data?.errors));

// Mã đã có của xã khác (tỉnh nhập thẳng ở Thục Phán) → xã Cô Ba không ghi đè được
const other = `SUB-${stamp}-TP`;
const direct = await call('POST', '/data-import/datasets/diem_so_tan/apply',
  form({ mode: 'upsert' }, 'tp.csv', `${HEAD}\n${other},Điểm của phường Thục Phán,truong_hoc,300,${tpLat},${tpLon},\n`), tinh);
check('Tỉnh nhập thẳng (không qua duyệt)', direct.status === 200 && direct.data?.result?.created === 1);
const steal = await validate('diem_so_tan', `${HEAD}\n${other},Chiếm mã,khac,10,${cbLat},${cbLon},\n`, xa);
check('Xã không ghi đè bản ghi đã có của xã khác', steal.data?.errors?.some((e) => /đã có và thuộc CB-THUCPHAN/.test(e.message)), JSON.stringify(steal.data?.errors));

// ---- Gửi → chờ duyệt: chưa hiện ở đâu
const A = `SUB-${stamp}-A`;
const B = `SUB-${stamp}-B`;
const good = (cap) => `${HEAD}\n${A},Nhà văn hoá xóm thử ${stamp},nha_van_hoa,${cap},${cbLat},${cbLon},\n${B},Trường tiểu học thử ${stamp},truong_hoc,200,${cbLat + 0.0003},${cbLon + 0.0003},CB-COBA\n`;
const s1 = await submit('diem_so_tan', good(300), xa, { note: 'Theo phương án 2026 của xã' });
check('Xã gửi hồ sơ → chờ duyệt', s1.status === 201 && s1.data?.status === 'cho_duyet' && /^HS-\d+$/.test(s1.data?.code), `${s1.status} ${s1.data?.code || JSON.stringify(s1.data).slice(0, 200)}`);
const code1 = s1.data?.code;
check('Dữ liệu chờ duyệt KHÔNG hiện trên cổng công khai', !(await publicSites()).some((e) => e.name.includes(stamp)));
check('Dữ liệu chờ duyệt KHÔNG hiện trên màn hình điều hành',
  !((await call('GET', '/resources/evacuation-sites', null, tinh)).data || []).some((e) => e.name.includes(stamp)));
check('Người gửi không có quyền duyệt → 403', (await call('POST', `/data-import/submissions/${code1}/approve`, {}, xa)).status === 403);
check('Xã khác không thấy hồ sơ của Cô Ba',
  !((await call('GET', '/data-import/submissions', null, xaKhac)).data?.items || []).some((s) => s.code === code1)
  && (await call('GET', `/data-import/submissions/${code1}`, null, xaKhac)).status === 404);
const mine = (await call('GET', '/data-import/submissions', null, xa)).data;
check('Người gửi thấy hồ sơ của mình', mine?.items?.some((s) => s.code === code1 && s.can_withdraw && !s.can_review));

// ---- Tỉnh xem thay đổi rồi duyệt
const queue = (await call('GET', '/data-import/submissions?status=cho_duyet', null, tinh)).data;
check('Tỉnh thấy hồ sơ trong hàng chờ duyệt', queue?.items?.some((s) => s.code === code1 && s.can_review) && queue.counts.cho_duyet >= 1);
const d1 = (await call('GET', `/data-import/submissions/${code1}`, null, tinh)).data;
check('Chi tiết: kiểm tra lại với dữ liệu hiện tại, 2 bản ghi thêm mới kèm vị trí',
  d1?.check?.ok && d1.changes?.creates?.length === 2 && d1.changes.creates.every((c) => c.lat && c.ma_xa === 'CB-COBA'), JSON.stringify(d1?.changes?.creates));
const ap = await call('POST', `/data-import/submissions/${code1}/approve`, { note: 'Đã đối chiếu phương án' }, tinh);
check('Tỉnh phê duyệt → ghi dữ liệu', ap.status === 200 && ap.data?.status === 'da_duyet' && ap.data?.result?.created === 2, JSON.stringify(ap.data?.result || ap.data));
check('Duyệt lần 2 → 409 (không ghi 2 lần)', (await call('POST', `/data-import/submissions/${code1}/approve`, {}, tinh)).status === 409);
check('Sau khi duyệt: hiện trên cổng công khai', (await publicSites()).filter((e) => e.name.includes(stamp)).length === 2);

// ---- Hồ sơ sửa: người duyệt thấy giá trị cũ → mới; từ chối thì dữ liệu giữ nguyên
const s2 = await submit('diem_so_tan', good(450), xa);
const d2 = (await call('GET', `/data-import/submissions/${s2.data?.code}`, null, tinh)).data;
const diff = d2?.changes?.updates?.find((u) => u.ma === A)?.changes?.find((c) => c.field === 'suc_chua');
check('Chi tiết hồ sơ sửa: sức chứa 300 → 450', diff?.old === 300 && diff?.new === 450, JSON.stringify(d2?.changes?.updates));
check('Từ chối phải có lý do → 422', (await call('POST', `/data-import/submissions/${s2.data?.code}/reject`, { reason: '' }, tinh)).status === 422);
const rj = await call('POST', `/data-import/submissions/${s2.data?.code}/reject`, { reason: 'Sức chứa chưa khớp biên bản kiểm tra' }, tinh);
check('Tỉnh từ chối kèm lý do', rj.status === 200 && rj.data?.status === 'tu_choi' && rj.data?.review_note.includes('biên bản'));
check('Từ chối → dữ liệu giữ nguyên', (await publicSites()).find((e) => e.name.includes(`Nhà văn hoá xóm thử ${stamp}`))?.capacity === 300);

// ---- Rút hồ sơ
const s3 = await submit('diem_so_tan', good(500), xa);
const wd = await call('POST', `/data-import/submissions/${s3.data?.code}/withdraw`, null, xa);
check('Người gửi rút hồ sơ đang chờ', wd.status === 200 && wd.data?.status === 'da_rut');
check('Hồ sơ đã rút không duyệt được → 409', (await call('POST', `/data-import/submissions/${s3.data?.code}/approve`, {}, tinh)).status === 409);

// ---- Danh bạ cấp xã: sau khi duyệt, cán bộ xã thấy trong danh bạ của xã mình (gán đúng xã)
const C = `DB-${stamp}`;
const s4 = await submit('danh_ba', `ma,cap,co_quan,ho_ten,chuc_vu,sdt,ma_xa\n${C},xa,UBND xã Cô Ba,Người Thử ${stamp},Chủ tịch UBND xã,0912 345 001,CB-COBA\n`, xa);
check('Xã gửi danh bạ cấp xã', s4.status === 201, JSON.stringify(s4.data).slice(0, 200));
await call('POST', `/data-import/submissions/${s4.data?.code}/approve`, {}, tinh);
const contacts = JSON.stringify((await call('GET', '/alerts/contacts', null, xa)).data || []);
check('Danh bạ xã đã duyệt hiện cho cán bộ xã (gán đúng xã)', contacts.includes(`Người Thử ${stamp}`));
const provinceContact = await validate('danh_ba', `ma,cap,co_quan,ho_ten,chuc_vu,sdt\nDBT-${stamp},tinh,BCH tỉnh,Thử,Trưởng ban,0912 345 002\n`, xa);
check('Xã không gửi được danh bạ cấp tỉnh', provinceContact.data?.errors?.some((e) => e.field === 'cap'));

// ---- Email: tỉnh được báo có hồ sơ, người gửi nhận kết quả
try {
  const msgs = (await (await fetch(`${MAILPIT}/api/v1/messages?limit=200`)).json()).messages || [];
  check('Email báo tỉnh có hồ sơ chờ duyệt', msgs.some((m) => m.Subject.includes(code1) && m.Subject.includes('chờ phê duyệt') &&
    m.To.some((t) => t.Address === 'admin.tinh@caobang-pctt.local')));
  check('Email báo xã kết quả phê duyệt', msgs.some((m) => m.Subject.includes(code1) && m.Subject.includes('đã được phê duyệt') &&
    m.To.some((t) => t.Address === 'admin.coba@caobang-pctt.local')));
} catch {
  console.log('SKIP  Email (không kết nối được Mailpit)');
}

const logs = JSON.stringify((await call('GET', '/dashboard/logs?limit=300', null, tinh)).data || []);
check('Nhật ký điều hành ghi gửi & duyệt hồ sơ', logs.includes(`gửi hồ sơ ${code1}`) && logs.includes(`duyệt hồ sơ ${code1}`));

console.log(failed ? `\n${failed} kiểm tra THẤT BẠI` : '\nTất cả kiểm tra gửi – duyệt dữ liệu đạt');
process.exitCode = failed ? 1 : 0;
