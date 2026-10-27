/**
 * Phạm vi thiên tai hệ thống đang nhấn mạnh (quyết định 27/10/2026): Mưa lớn · Sạt lở, lũ quét · Ngập lụt.
 *
 * Bão / áp thấp nhiệt đới (lớp đường đi bão, nhập bản tin bão, mẫu tin "Bão"), loại đợt "Rét hại, sương muối" và "Khác":
 * ẨN khỏi giao diện — mã, API, dữ liệu đã lưu giữ nguyên; đổi cờ / danh sách dưới đây để bật lại.
 */
export const SHOW_STORM = false;

/** Loại đợt thiên tai được chọn khi tạo / sửa đợt (eventFacts.HAZARD vẫn đủ nhãn để hiện đợt cũ đã lưu). */
export const EVENT_HAZARD_CHOICES = ['mua_lon', 'sat_lo', 'lu_quet', 'lu_lut'];

/** Mẫu tin cảnh báo không hiện trong bước soạn lệnh (bảng mẫu tin trên máy chủ giữ nguyên). */
export const HIDDEN_TEMPLATE_CODES = new Set(SHOW_STORM ? [] : ['BAO_ATND']);
