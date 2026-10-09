import { RISK } from './risk';

export const INCIDENT = {
  ngap_lut: 'Ngập lụt', sat_lo: 'Sạt lở', lu_quet: 'Lũ quét', sap_nha: 'Sập nhà', cap_cuu: 'Cấp cứu', tiep_te: 'Tiếp tế',
};
// Màu của PRIORITY / LEVEL / ALARM lấy từ thang màu rủi ro chung (utils/risk.js) — không viết màu riêng ở đây
export const PRIORITY = {
  1: { label: 'Cấp 1 · Khẩn cấp sinh tử', short: 'Đỏ', cls: RISK[3].chip, tone: 'danger' },
  2: { label: 'Cấp 2 · Nguy hiểm', short: 'Cam', cls: RISK[2].chip, tone: 'serious' },
  3: { label: 'Cấp 3 · Hỗ trợ', short: 'Vàng', cls: RISK[1].chip, tone: 'warn' },
};
export const SOS_STATUS = { moi: 'Chờ xử lý', dieu_phoi: 'Đang điều phối', thuc_thi: 'Đang thực thi', hoan_thanh: 'Hoàn thành' };
export const SOURCE = { ZALO: 'Zalo OA', APP: 'Ứng dụng', HOTLINE: 'Tổng đài', SENSOR: 'Cảm biến IoT', CAN_BO: 'Cán bộ' };
// Báo cáo của trưởng nhóm từ link nhiệm vụ (trang /nhiem-vu)
export const FIELD_REPORT = { arrived: 'Đã đến hiện trường', rescued: 'Đã cứu an toàn', need_support: 'Cần chi viện' };
export const VULNERABLE = { nguoi_gia: 'Người già', tre_em: 'Trẻ em', thuong_nang: 'Thương nặng', thai_phu: 'Thai phụ' };
export const FORCE_TYPE = {
  quan_su: 'Quân sự', cong_an: 'Công an', bien_phong: 'Biên phòng', dan_quan: 'Dân quân', tinh_nguyen: 'Tình nguyện', y_te: 'Y tế',
};
export const SKILL = {
  lai_xuong: 'Lái xuồng', boi_lan: 'Bơi lặn', lan: 'Lặn', cuu_ho_sat_lo: 'Cứu hộ sạt lở', cuu_ho_vung_nui: 'Cứu hộ vùng núi',
  so_cuu: 'Sơ cứu', y_te: 'Cấp cứu y tế', cho_nghiep_vu: 'Chó nghiệp vụ',
};
export const VEHICLE = {
  xuong: 'Xuồng cao tốc', ca_no: 'Ca nô', ghe: 'Ghe dân sự', xe_loi_nuoc: 'Xe lội nước', xe_boc_thep: 'Xe bọc thép',
  xe_tai: 'Xe tải gầm cao', may_xuc: 'Máy xúc', may_ui: 'Máy ủi', xe_cuu_thuong: 'Xe cứu thương',
  may_phat_dien: 'Máy phát điện', may_cua: 'Máy cưa', flycam: 'Flycam', bts_luu_dong: 'BTS lưu động',
};
export const VEHICLE_CAT = { duong_thuy: 'Đường thủy', duong_bo: 'Đường bộ', thiet_bi: 'Thiết bị chuyên dụng' };
export const RES_STATUS = {
  san_sang: { label: 'Sẵn sàng', dot: 'bg-good' },
  nhiem_vu: { label: 'Đang nhiệm vụ', dot: 'bg-warn' },
  bao_duong: { label: 'Bảo dưỡng / hỏng', dot: 'bg-danger' },
};
export const STATION_TYPE = { luong_mua: 'Đo mưa', muc_nuoc: 'Mực nước', do_nghieng: 'Độ nghiêng đất', do_am_dat: 'Độ ẩm đất' };
export const LEVEL = {
  do: { label: 'Rất cao', cls: RISK[3].chip, color: RISK[3].hex },
  cam: { label: 'Cao', cls: RISK[2].chip, color: RISK[2].hex },
  vang: { label: 'Trung bình', cls: RISK[1].chip, color: RISK[1].hex },
  an_toan: { label: 'Thấp', cls: RISK[0].chip, color: RISK[0].hex },
};
export const CATEGORY = { luong_thuc: 'Lương thực', nuoc_uong: 'Nước uống', y_te: 'Y tế', do_dung: 'Đồ dùng cứu sinh' };
export const CHANNEL = {
  SMS: 'SMS Brandname', CELL_BROADCAST: 'Cell Broadcast', ZALO_OA: 'Zalo OA', PUSH: 'Push (Critical)', LOA: 'Loa thông minh',
};
export const BROADCAST_STATUS = {
  pending_approval: { label: 'Chờ phê duyệt', cls: 'bg-warn text-black' },
  sending: { label: 'Đang phát', cls: 'bg-accent text-white' },
  sent: { label: 'Đã phát', cls: 'bg-good text-white' },
  // Đã duyệt nhưng kênh SMS / Zalo / Cell Broadcast chưa tích hợp → chỉ công bố trên cổng công khai & bản nhẹ
  published: { label: 'Đã công bố trên cổng', cls: 'bg-accent/15 text-accent' },
  rejected: { label: 'Từ chối', cls: 'bg-panel2 text-muted' },
  draft: { label: 'Nháp', cls: 'bg-panel2 text-muted' },
};
// Phản ánh của người dân (community.citizen_reports)
export const REPORT_STATUS = {
  cho_duyet: { label: 'Chờ duyệt', cls: 'bg-warn text-black' },
  da_duyet: { label: 'Đã duyệt', cls: 'bg-good text-white' },
  da_xu_ly: { label: 'Đã xử lý', cls: 'bg-panel2 text-ink' },
  tu_choi: { label: 'Từ chối', cls: 'bg-danger text-white' },
};
// Hồ sơ dữ liệu xã/phường gửi chờ cấp tỉnh phê duyệt (operations.data_submissions)
export const SUBMISSION_STATUS = {
  cho_duyet: { label: 'Chờ duyệt', cls: 'bg-warn text-black' },
  da_duyet: { label: 'Đã duyệt', cls: 'bg-good text-white' },
  tu_choi: { label: 'Từ chối', cls: 'bg-danger text-white' },
  da_rut: { label: 'Đã rút', cls: 'bg-panel2 text-muted' },
};

/** Điểm đen sạt lở (services/landslides.py): nhãn ngắn + màu chữ theo traffic_status. "chua_co_du_lieu" (không cảm
 * biến / vùng nguy hiểm nào) → xám, KHÔNG xanh như "chưa ghi nhận nguy cơ". Màu theo thang rủi ro chung (utils/risk.js). */
export const landslideStatus = (s) =>
  ({
    cam_duong: { short: 'Cấm đường', cls: 'text-danger' },
    canh_bao: { short: 'Cảnh báo', cls: 'text-serious' },
    chua_co_du_lieu: { short: 'Chưa có dữ liệu', cls: 'text-muted' },
  })[s] || { short: 'Chưa ghi nhận', cls: 'text-good' };

/** Lệnh đã duyệt mà các kênh chưa nối cổng gửi tin thật (metrics[kênh].integrated === false). */
export const notIntegrated = (b) => Object.values(b?.metrics || {}).some((v) => v?.integrated === false);
export const broadcastStatus = (b) => {
  // Lệnh đã phát nhưng đã kết thúc / quá thời hạn hiệu lực → không còn hiện cho người dân
  if (b?.ended_at) return { label: 'Đã kết thúc', cls: 'bg-panel2 text-muted' };
  if ((b?.status === 'sent' || b?.status === 'sending') && b?.active === false) return { label: 'Hết hiệu lực', cls: 'bg-panel2 text-muted' };
  return BROADCAST_STATUS[notIntegrated(b) ? 'published' : b.status] || BROADCAST_STATUS.draft;
};
// Thời hạn hiệu lực chọn khi soạn cảnh báo (giờ)
export const ALERT_VALID_HOURS = [[6, '6 giờ'], [12, '12 giờ'], [24, '24 giờ'], [48, '48 giờ'], [72, '3 ngày']];
// Vật tư mang theo khi điều động (mã danh mục resources.items)
export const ITEM_NAME = {
  AO_PHAO: 'Áo phao', TUI_SO_CUU: 'Túi sơ cứu', DEN_PIN: 'Đèn pin', BAT_TRAI: 'Bạt che', THUOC_CO_BAN: 'Cơ số thuốc',
  MI_TOM: 'Mì tôm (thùng)', NUOC_CHAI: 'Nước (thùng)', CLORAMIN_B: 'Cloramin B (kg)',
};

export const ROLE = { admin: 'Quản trị', maker: 'Trực ban (soạn lệnh)', checker: 'Lãnh đạo (phê duyệt)', viewer: 'Chỉ xem' };

export const alarmLevel = (value, thr = {}) => {
  let lv = 0;
  ['bd1', 'bd2', 'bd3'].forEach((k, i) => { if (thr[k] != null && value >= thr[k]) lv = i + 1; });
  return lv;
};
export const ALARM = ['Dưới BĐ I', 'Trên BĐ I', 'Trên BĐ II', 'Trên BĐ III'].map((label, i) => ({
  label,
  cls: RISK[i].chip,
  color: RISK[i].hex,
}));
