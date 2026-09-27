#!/usr/bin/env node
// Kiểm thử nhập dữ liệu chính thức (CSV / GeoJSON) qua /api/v1/data-import — cần stack DEMO_MODE=true.
//   node tests/e2e/import-test.mjs [http://localhost:8000]
// Chạy SAU các bộ kiểm thử khác: có bước "thay toàn bộ" điểm cấp nhiên liệu (xoá dữ liệu mẫu của bảng đó).
const ROOT = process.argv[2] || 'http://localhost:8000';
const BASE = ROOT + '/api/v1';

async function call(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let data = null;
  try { data = JSON.parse(raw); } catch { data = raw; }
  return { status: res.status, data, headers: res.headers };
}
let failed = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failed++;
};
const login = async (u, p) => (await call('POST', '/auth/login', { username: u, password: p })).data?.token;
const upload = (name, step, filename, content, token, mode = 'upsert') => {
  const f = new FormData();
  f.append('file', new Blob([content]), filename);
  f.append('mode', mode);
  return call('POST', `/data-import/datasets/${name}/${step}`, f, token);
};

const admin = await login('admin', 'admin123');
const xem = await login('xem', 'xem123');
const stamp = Date.now().toString(36).toUpperCase();

// ---- Quyền & danh mục
check('Tài khoản quan sát không có quyền nhập dữ liệu → 403', (await call('GET', '/data-import/datasets', null, xem)).status === 403);
const list = await call('GET', '/data-import/datasets', null, admin);
check('Danh mục loại dữ liệu', list.status === 200 && list.data.some((d) => d.name === 'diem_so_tan' && d.replaceable),
  `${list.data?.length} loại`);
const tpl = await fetch(`${BASE}/data-import/datasets/diem_so_tan/template`, { headers: { Authorization: `Bearer ${admin}` } });
const tplBytes = new Uint8Array(await tpl.arrayBuffer());
check('Tệp mẫu CSV có BOM + tiêu đề cột', tpl.status === 200 && tplBytes[0] === 0xef &&
  new TextDecoder().decode(tplBytes).includes('ma,ten,loai,suc_chua'));

// ---- Kiểm tra: báo lỗi theo dòng, không ghi gì
const bad = `Mã,Tên,Loại,Sức chứa,Vĩ độ,Kinh độ\nDST-${stamp}-1,Trường tốt,Trường học,300,22.6657,106.2522\n` +
  `DST-${stamp}-2,Bệnh viện,benh_vien,100,22.66,106.25\nDST-${stamp}-3,Ngoài tỉnh,khac,50,21.03,105.85\n`;
const v1 = await upload('diem_so_tan', 'validate', 'diem.csv', bad, admin);
const errRows = [...new Set((v1.data?.errors || []).map((e) => e.row))].sort();
check('Kiểm tra tệp lỗi → báo đúng dòng 3 (loại sai), dòng 4 (ngoài tỉnh)', v1.status === 200 && v1.data.ok === false &&
  JSON.stringify(errRows) === '[3,4]', JSON.stringify(v1.data?.errors?.map((e) => [e.row, e.field])));
const a1 = await upload('diem_so_tan', 'apply', 'diem.csv', bad, admin);
check('Nhập tệp còn lỗi → 422, không ghi gì', a1.status === 422 && a1.data?.report?.ok === false);
const mapBefore = await call('GET', '/public/map');
check('Chưa có bản ghi nào từ tệp lỗi', !mapBefore.data.evacuation_sites.some((e) => e.name === 'Trường tốt'));

// ---- Nhập hợp lệ → hiện trên cổng công khai; nhập lại = cập nhật, không nhân đôi
const good = (cap) => `ma,ten,loai,suc_chua,sdt_lien_he,vi_do,kinh_do\n` +
  `DST-${stamp}-A,Điểm sơ tán thử A ${stamp},truong_hoc,${cap},0206 3852 000,22.6657,106.2522\n` +
  `DST-${stamp}-B,Điểm sơ tán thử B ${stamp},nha_van_hoa,${cap},,22.905,105.775\n`;
const v2 = await upload('diem_so_tan', 'validate', 'diem.csv', good(300), admin);
check('Kiểm tra tệp hợp lệ: 2 bản ghi mới, tự xác định xã', v2.data?.ok && v2.data.creates === 2 &&
  v2.data.preview.every((p) => p.ma_xa), JSON.stringify(v2.data?.preview?.map((p) => p.ma_xa)));
const a2 = await upload('diem_so_tan', 'apply', 'diem.csv', good(300), admin);
check('Nhập → thêm 2', a2.status === 200 && a2.data.result.created === 2, JSON.stringify(a2.data?.result));
const mapAfter = await call('GET', '/public/map');
check('Điểm sơ tán mới hiện ngay trên cổng công khai',
  mapAfter.data.evacuation_sites.filter((e) => e.name.includes(stamp)).length === 2);
const a3 = await upload('diem_so_tan', 'apply', 'diem.csv', good(450), admin);
check('Nhập lại cùng mã → cập nhật 2, không thêm', a3.data?.result?.created === 0 && a3.data.result.updated === 2);
const map2 = await call('GET', '/public/map');
check('Sức chứa đã cập nhật, không trùng bản ghi',
  map2.data.evacuation_sites.filter((e) => e.name.includes(stamp)).every((e) => e.capacity === 450) &&
  map2.data.evacuation_sites.filter((e) => e.name.includes(stamp)).length === 2);

// ---- GeoJSON vùng nguy hiểm → cổng công khai + "Tôi đang ở đâu?"
const zone = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { ma: `VNH-${stamp}`, ten: `Vùng sạt lở thử ${stamp}`, loai: 'Sạt lở', muc_do: 'Đỏ' },
    geometry: { type: 'Polygon', coordinates: [[[106.30, 22.62], [106.31, 22.62], [106.31, 22.63], [106.30, 22.63], [106.30, 22.62]]] },
  }],
};
const a4 = await upload('vung_nguy_hiem', 'apply', 'vung.geojson', JSON.stringify(zone), admin);
check('Nhập vùng nguy hiểm GeoJSON', a4.status === 200 && a4.data.result.created === 1, JSON.stringify(a4.data?.detail || a4.data?.result));
const here = await call('GET', '/public/locate?lat=22.625&lon=106.305');
check('"Tôi đang ở đâu?" trong vùng vừa nhập → nguy cơ cao',
  here.data?.risk === 'cao' && here.data.hazards.some((h) => h.name.includes(stamp) && h.distance_m === 0), here.data?.risk);
const csvZone = await upload('vung_nguy_hiem', 'validate', 'vung.csv', 'ma,ten\nX,Y\n', admin);
check('Vùng nguy hiểm chỉ nhận GeoJSON → 422', csvZone.status === 422);

// ---- Tham chiếu & chỉ cập nhật
const inv = await upload('ton_kho', 'validate', 'ton_kho.csv', `ma_kho,ma_vat_tu,so_luong,dinh_muc\nKHO-KHONG-CO-${stamp},MI_TOM,10,5\n`, admin);
check('Tồn kho tham chiếu kho không tồn tại → lỗi', inv.data?.ok === false && inv.data.errors.some((e) => e.field === 'ma_kho'));
const commune = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: { ma: 'CB-KHONG-CO' }, geometry: zone.features[0].geometry }],
};
const vb = await upload('ranh_gioi_xa', 'validate', 'xa.geojson', JSON.stringify(commune), admin);
check('Ranh giới xã: mã chưa có → lỗi (chỉ cập nhật 56 xã đã có)', vb.data?.ok === false && vb.data.creates === 0);

// ---- Thay toàn bộ (bảng lá: điểm cấp nhiên liệu)
const fuel = `ma,ten,xang_l,dau_l,suc_chua_l,vi_do,kinh_do\nCX-${stamp},Cây xăng thử,1000,2000,5000,22.6657,106.2522\n`;
const vr = await upload('cay_xang', 'validate', 'cay_xang.csv', fuel, admin, 'replace');
check('Thay toàn bộ: báo trước số bản ghi sẽ xoá', vr.data?.ok && vr.data.deletes >= 0, `xoá ${vr.data?.deletes}`);
const ar = await upload('cay_xang', 'apply', 'cay_xang.csv', fuel, admin, 'replace');
check('Thay toàn bộ: xoá đúng số đã báo, còn đúng 1 bản ghi', ar.data?.result?.deleted === vr.data.deletes &&
  ar.data.result.created === 1, JSON.stringify(ar.data?.result));
const noReplace = await upload('kho', 'validate', 'kho.csv', 'ma,ten,cap,vi_do,kinh_do\nK,Kho,tinh,22.66,106.25\n', admin, 'replace');
check('Kho vật tư không cho thay toàn bộ (có dữ liệu tham chiếu) → 422', noReplace.status === 422);

// ---- Mọi loại dữ liệu: nhập tệp mẫu 2 lần (lần 1 thêm, lần 2 cập nhật) — theo thứ tự phụ thuộc
const ORDER = ['kho', 'ton_kho', 'luc_luong', 'phuong_tien', 'diem_so_tan', 'vung_nguy_hiem', 'diem_nguy_hiem', 'danh_ba',
  'tram_quan_trac', 'ho_chua', 'cay_xang'];
check('Kiểm thử phủ mọi loại dữ liệu (trừ ranh giới xã, kiểm riêng)',
  list.data.filter((d) => d.name !== 'ranh_gioi_xa').every((d) => ORDER.includes(d.name)));
for (const name of ORDER) {
  const res = await fetch(`${BASE}/data-import/datasets/${name}/template`, { headers: { Authorization: `Bearer ${admin}` } });
  const filename = (res.headers.get('content-disposition') || '').match(/filename="([^"]+)"/)?.[1];
  const body = new Uint8Array(await res.arrayBuffer());
  const first = await upload(name, 'apply', filename, body, admin);
  const second = await upload(name, 'apply', filename, body, admin);
  const r1 = first.data?.result, r2 = second.data?.result;
  check(`Tệp mẫu ${name}: nhập được, nhập lại là cập nhật`,
    first.status === 200 && second.status === 200 && r1.created + r1.updated === 1 && r2.updated === 1 && r2.created === 0,
    JSON.stringify(first.data?.report?.errors?.slice(0, 2) || [r1, r2]));
}

// ---- Ranh giới xã: nhập lại chính ranh giới hiện có + dân số mới
const units = await call('GET', '/admin-units/geojson?level=xa', null, admin);
const feat = units.data?.features?.find((f) => f.properties?.code === 'CB-THUCPHAN');
const newPop = 20000 + Math.floor(Math.random() * 1000);
const boundary = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { ma: 'CB-THUCPHAN', dan_so: newPop }, geometry: feat?.geometry }] };
const ab = await upload('ranh_gioi_xa', 'apply', 'xa.geojson', JSON.stringify(boundary), admin);
const unitsAfter = await call('GET', '/admin-units?level=xa', null, admin);
check('Cập nhật ranh giới + dân số xã', ab.status === 200 && ab.data.result.updated === 1 &&
  unitsAfter.data.find((u) => u.code === 'CB-THUCPHAN')?.population === newPop, JSON.stringify(ab.data?.detail || ab.data?.result));

// ---- Nhật ký
const logs = await call('GET', '/dashboard/logs', null, admin);
check('Ghi nhật ký điều hành', JSON.stringify(logs.data).includes('Điểm sơ tán'));

console.log(failed ? `\n${failed} kiểm tra THẤT BẠI` : '\nTất cả kiểm tra nhập dữ liệu đạt');
process.exit(failed ? 1 : 0);
