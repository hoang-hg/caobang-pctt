import {
  Boxes, Contact, FileSpreadsheet, Fuel, House, Layers, Map as MapIcon, Mountain, MountainSnow, Package, Radio, School,
  ShieldHalf, TriangleAlert, Truck, Warehouse, Waves,
} from 'lucide-react';

/**
 * Thẻ chọn loại dữ liệu (trang Nhập dữ liệu): hình + một câu đời thường thay cho mô tả kỹ thuật của máy chủ
 * (`ds.description` vẫn xem được ở "Lưu ý khi nhập loại này"); `noun`: một dòng trong tệp là gì ("mỗi dòng một điểm sơ tán").
 * Nhóm theo cơ sở dữ liệu điều hành (thiết kế mục G): nguồn lực · liên lạc · địa giới & vùng nguy hiểm · quan trắc.
 */
export const DATASET_CARD = {
  diem_so_tan: { icon: School, noun: 'điểm sơ tán', hint: 'Trường học, nhà văn hoá… đón dân khi sơ tán — người dân tra cứu được.' },
  kho: { icon: Warehouse, noun: 'kho', hint: 'Kho dự trữ vật tư cứu trợ của tỉnh, xã.' },
  ton_kho: { icon: Package, noun: 'vật tư trong kho', hint: 'Số lượng, định mức từng vật tư ở từng kho (nhập kho trước).' },
  luc_luong: { icon: ShieldHalf, noun: 'đơn vị', hint: 'Đội cứu hộ, dân quân, công an, biên phòng… và nơi đóng quân.' },
  phuong_tien: { icon: Truck, noun: 'phương tiện', hint: 'Xe, xuồng, máy móc cứu hộ của từng lực lượng.' },
  cay_xang: { icon: Fuel, noun: 'điểm cấp nhiên liệu', hint: 'Cây xăng, kho nhiên liệu cấp cho phương tiện cứu hộ.' },
  danh_ba: { icon: Contact, noun: 'người liên lạc', hint: 'Số điện thoại chỉ huy tỉnh → xã → thôn và đường dây nóng.' },
  xom: { icon: House, noun: 'xóm', hint: 'Tên xóm, tổ dân phố của từng xã — người dân chọn khi gửi phản ánh.' },
  diem_nguy_hiem: { icon: TriangleAlert, noun: 'điểm', hint: 'Điểm sạt lở, điểm đen giao thông, cầu đường hư hỏng.' },
  diem_den_sat_lo: { icon: MountainSnow, noun: 'điểm đen', hint: 'Đèo dốc, khu dân cư sườn đồi, ngầm tràn cần theo dõi lâu dài khi mưa lớn.' },
  vung_nguy_hiem: { icon: Mountain, noun: 'vùng', hint: 'Vùng có nguy cơ sạt lở, ngập, lũ quét theo bản đồ chính thức.' },
  ngap_kich_ban: { icon: Waves, noun: 'vùng ngập', hint: 'Vùng sẽ ngập khi mực nước ở một trạm lên tới Báo động I, II, III.' },
  ranh_gioi_xa: { icon: MapIcon, noun: 'xã', hint: 'Ranh giới chính thức, dân số, số hộ của 56 xã, phường.' },
  nhom_loc_nhanh: { icon: Layers, noun: 'nhóm', hint: 'Nhóm xã theo vùng thiên tai — dùng khi lọc địa bàn, chọn vùng nhận cảnh báo.' },
  tram_quan_trac: { icon: Radio, noun: 'trạm', hint: 'Trạm đo mưa, mực nước, cảm biến sạt lở và ngưỡng báo động.' },
};

export const DATASET_GROUPS = [
  { key: 'nguon_luc', title: 'Sơ tán, kho & lực lượng', names: ['diem_so_tan', 'kho', 'ton_kho', 'luc_luong', 'phuong_tien', 'cay_xang'] },
  { key: 'lien_lac', title: 'Danh bạ', names: ['danh_ba'] },
  { key: 'dia_ban', title: 'Địa bàn & vùng nguy hiểm', names: ['xom', 'diem_den_sat_lo', 'diem_nguy_hiem', 'vung_nguy_hiem', 'ngap_kich_ban', 'ranh_gioi_xa', 'nhom_loc_nhanh'] },
  { key: 'quan_trac', title: 'Trạm đo', names: ['tram_quan_trac'] },
];

/** Thẻ của một loại dữ liệu; loại máy chủ mới thêm (chưa có thẻ) → câu đầu của mô tả máy chủ. */
export const cardOf = (ds) => DATASET_CARD[ds?.name] || {
  icon: ds?.geometry === 'none' ? Boxes : FileSpreadsheet,
  noun: 'mục',
  hint: String(ds?.description || '').split(/(?<=\.)\s/)[0],
};

/**
 * Chữ tiếng Việt của giá trị chọn (cột loại, cấp, mức độ…). Viết đúng chữ này trong tệp cũng được: máy chủ bỏ dấu, đổi
 * khoảng trắng thành "_" trước khi so ("Nhà văn hoá" → nha_van_hoa) — giữ đúng quy tắc đó khi thêm chữ mới.
 */
const CHOICE = {
  xom: 'Xóm', to_dan_pho: 'Tổ dân phố', thon: 'Thôn', ban: 'Bản',
  ngap_lut: 'Ngập lụt', sat_lo: 'Sạt lở', tong_hop: 'Tổng hợp', ngap: 'Ngập', lu_quet: 'Lũ quét',
  truong_hoc: 'Trường học', nha_van_hoa: 'Nhà văn hoá', tru_so: 'Trụ sở', doanh_trai: 'Doanh trại', khac: 'Khác',
  do: 'Đỏ', cam: 'Cam', vang: 'Vàng',
  giao_thong: 'Giao thông', ha_tang: 'Hạ tầng',
  tinh: 'Tỉnh', cum: 'Cụm', xa: 'Xã', da_chien: 'Dã chiến',
  truc: 'Trực', san_sang: 'Sẵn sàng', bao_duong: 'Bảo dưỡng',
  luong_mua: 'Lượng mưa', muc_nuoc: 'Mực nước', do_nghieng: 'Độ nghiêng', do_am_dat: 'Độ ẩm đất',
  quan_su: 'Quân sự', cong_an: 'Công an', bien_phong: 'Biên phòng', dan_quan: 'Dân quân', tinh_nguyen: 'Tình nguyện', y_te: 'Y tế',
  xuong: 'Xuồng', ca_no: 'Ca nô', ghe: 'Ghe', xe_loi_nuoc: 'Xe lội nước', xe_boc_thep: 'Xe bọc thép', xe_tai: 'Xe tải',
  may_xuc: 'Máy xúc', may_ui: 'Máy ủi', xe_cuu_thuong: 'Xe cứu thương', may_phat_dien: 'Máy phát điện', may_cua: 'Máy cưa',
  flycam: 'Flycam', bts_luu_dong: 'BTS lưu động', duong_thuy: 'Đường thuỷ', duong_bo: 'Đường bộ', thiet_bi: 'Thiết bị',
};
// Cột trạng thái trực của danh bạ (truc / san_sang / vang): "vang" là Vắng, không phải mức Vàng
export const choiceLabel = (f, c) => (c === 'vang' && f?.choices?.includes('truc') ? 'Vắng' : CHOICE[c] || String(c).replaceAll('_', ' '));

/** Tên ngắn của một cột (bỏ phần giải thích trong ngoặc): "Mã xã/phường (trống = …)" → "Mã xã/phường". */
export const fieldLabel = (ds, name) => {
  if (!name) return '';
  if (name === 'vi_do') return 'Vĩ độ';
  if (name === 'kinh_do') return 'Kinh độ';
  if (name === 'geometry') return ds?.geometry === 'polygon' ? 'Vùng' : 'Vị trí';
  const f = ds?.fields.find((x) => x.name === name);
  return f ? f.label.replace(/\s*[(—].*$/, '') : name;
};

/** Cách ghi một cột trong tệp: bắt buộc / giá trị chọn / ví dụ. */
export const fieldRule = (f) => {
  if (f.choices.length) return `Một trong: ${f.choices.map((c) => choiceLabel(f, c)).join(', ')}`;
  if (f.kind === 'bool') return '"có" hoặc "không"';
  if (f.kind === 'date') return 'Ngày, VD 25/09/2026';
  if (f.kind === 'list') return `Nhiều giá trị cách nhau dấu ;${f.example ? ` — VD ${f.example}` : ''}`;
  return f.example ? `VD ${f.example}` : '';
};

/** Tên dòng trong báo lỗi: tệp CSV / Excel theo số dòng của Excel (dòng tiêu đề = 1); GeoJSON theo thứ tự; form theo bản ghi. */
export const rowLabel = (row, { viaForm, polygon, geojson } = {}) => {
  if (!row) return 'Cả tệp';
  if (viaForm) return `Bản ghi ${polygon ? row : row - 1}`;
  return geojson ? `Mục thứ ${row}` : `Dòng ${row}`;
};

/** Cách sửa một lỗi (câu ngắn) — bổ sung cho lời báo của máy chủ, null khi lời báo đã đủ rõ. */
export function fixFor(issue, ds, viaForm) {
  const m = issue.message || '';
  const f = ds?.fields.find((x) => x.name === issue.field);
  const ex = f?.example ? ` (VD ${f.example})` : '';
  if (/^Trùng mã/.test(m)) return 'Mỗi dòng một mã riêng: đổi mã hoặc xoá dòng trùng.';
  if (['vi_do', 'kinh_do', 'geometry'].includes(issue.field)) {
    if (ds?.geometry === 'polygon') {
      return viaForm ? 'Bấm "Vẽ vùng trên bản đồ" ở bản ghi này.' : 'Vẽ vùng bằng phần mềm bản đồ (QGIS…) rồi lưu dạng GeoJSON — hoặc chọn "Điền trực tiếp" để vẽ ngay trên bản đồ.';
    }
    return viaForm
      ? 'Bấm "Chọn vị trí trên bản đồ" ở bản ghi này.'
      : 'Ghi vĩ độ, kinh độ dạng số thập phân (VD 22.6657 và 106.2522). Lấy toạ độ: mở Google Maps, chạm giữ vào điểm.';
  }
  if (!f) return null;
  if (viaForm && (f.choices.length || f.kind === 'bool' || f.name === 'ma_xa')) return 'Chọn lại trong danh sách của ô này.';
  if (f.choices.length) return `Ghi đúng một trong: ${f.choices.map((c) => choiceLabel(f, c)).join(', ')}.`;
  if (/^Thiếu/.test(m)) return `Điền ô này${ex}.`;
  if (f.kind === 'int') return `Ghi số nguyên, không kèm chữ${ex}.`;
  if (f.kind === 'float') return `Ghi số, dấu chấm thập phân${ex}.`;
  if (f.kind === 'bool') return 'Ghi "có" hoặc "không".';
  if (f.kind === 'phone') return `Chỉ ghi chữ số của số điện thoại${ex}.`;
  return null;
}

/** Dòng còn nguyên giá trị ví dụ của tệp mẫu (mã + tên ví dụ) → nhắc xoá: người mới hay để sót dòng ví dụ. */
export const exampleRows = (ds, preview = []) => {
  const ma = ds?.fields.find((f) => f.name === 'ma')?.example;
  const ten = ds?.fields.find((f) => f.name === 'ten')?.example;
  if (!ma || !ten) return [];
  return preview.filter((r) => String(r.ma ?? '') === ma && String(r.ten ?? '') === ten).map((r) => r.dong);
};
