export const INCIDENT = {
  ngap_lut: 'Ngập lụt', sat_lo: 'Sạt lở', lu_quet: 'Lũ quét', sap_nha: 'Sập nhà', cap_cuu: 'Cấp cứu', tiep_te: 'Tiếp tế',
};
export const PRIORITY = {
  1: { label: 'Cấp 1 · Khẩn cấp sinh tử', short: 'Đỏ', cls: 'bg-danger text-white', tone: 'danger' },
  2: { label: 'Cấp 2 · Nguy hiểm', short: 'Cam', cls: 'bg-serious text-white', tone: 'serious' },
  3: { label: 'Cấp 3 · Hỗ trợ', short: 'Vàng', cls: 'bg-warn text-black', tone: 'warn' },
};
export const SOS_STATUS = { moi: 'Chờ xử lý', dieu_phoi: 'Đang điều phối', thuc_thi: 'Đang thực thi', hoan_thanh: 'Hoàn thành' };
export const SOURCE = { ZALO: 'Zalo OA', APP: 'Ứng dụng', HOTLINE: 'Tổng đài', SENSOR: 'Cảm biến IoT', CAN_BO: 'Cán bộ' };
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
  do: { label: 'Rất cao', cls: 'bg-danger text-white', color: 'rgb(208 59 59)' },
  cam: { label: 'Cao', cls: 'bg-serious text-white', color: 'rgb(236 131 90)' },
  vang: { label: 'Trung bình', cls: 'bg-warn text-black', color: 'rgb(250 178 25)' },
  an_toan: { label: 'Thấp', cls: 'bg-good text-white', color: 'rgb(12 163 12)' },
};
export const CATEGORY = { luong_thuc: 'Lương thực', nuoc_uong: 'Nước uống', y_te: 'Y tế', do_dung: 'Đồ dùng cứu sinh' };
export const CHANNEL = {
  SMS: 'SMS Brandname', CELL_BROADCAST: 'Cell Broadcast', ZALO_OA: 'Zalo OA', PUSH: 'Push (Critical)', LOA: 'Loa thông minh',
};
export const BROADCAST_STATUS = {
  pending_approval: { label: 'Chờ phê duyệt', cls: 'bg-warn text-black' },
  sending: { label: 'Đang phát', cls: 'bg-accent text-white' },
  sent: { label: 'Đã phát', cls: 'bg-good text-white' },
  rejected: { label: 'Từ chối', cls: 'bg-panel2 text-muted' },
  draft: { label: 'Nháp', cls: 'bg-panel2 text-muted' },
};
export const ROLE = { admin: 'Quản trị', maker: 'Trực ban (soạn lệnh)', checker: 'Lãnh đạo (phê duyệt)', viewer: 'Chỉ xem' };

export const alarmLevel = (value, thr = {}) => {
  let lv = 0;
  ['bd1', 'bd2', 'bd3'].forEach((k, i) => { if (thr[k] != null && value >= thr[k]) lv = i + 1; });
  return lv;
};
export const ALARM = [
  { label: 'Dưới BĐ I', cls: 'bg-good text-white', color: 'rgb(12 163 12)' },
  { label: 'Trên BĐ I', cls: 'bg-warn text-black', color: 'rgb(250 178 25)' },
  { label: 'Trên BĐ II', cls: 'bg-serious text-white', color: 'rgb(236 131 90)' },
  { label: 'Trên BĐ III', cls: 'bg-danger text-white', color: 'rgb(208 59 59)' },
];
