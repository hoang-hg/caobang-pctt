import { num } from '../../utils/format';
import { LEVEL } from '../../utils/labels';
import { rainLevel } from '../../utils/risk';

const SEVERITY_BY_LEVEL = { 3: 'do', 2: 'cam', 1: 'vang' };

/**
 * Mức của một xã/phường trong hộp chọn địa bàn (thiết kế F) từ một dòng /dashboard/communes — đúng ngưỡng thang rủi ro chung
 * như nơi khác của hệ thống:
 * - SOS quá hạn phản hồi / SOS cấp 1 chưa xong → Đỏ (như ô SOS của Tổng quan, Điểm nóng của Bản đồ); SOS khác chưa xong → Vàng;
 * - cảnh báo đang hiệu lực: Rất cao Đỏ · Cao Cam · Trung bình Vàng; vùng nguy hiểm còn hiệu lực theo mức của vùng;
 * - trạm vượt báo động I / II / III → Vàng / Cam / Đỏ; mưa dự báo 24 giờ tới từ 50 / 100 / 200 mm → Vàng / Cam / Đỏ (rainLevel).
 * Trả { level 0–3, reasons: [{ level, text }] nặng → nhẹ } — KHÔNG phải cấp độ rủi ro thiên tai chính thức.
 */
export function communeStatus(r) {
  if (!r) return null;
  const reasons = [];
  const add = (level, text) => {
    if (level > 0) reasons.push({ level, text });
  };
  if (r.sos_overdue) add(3, `${r.sos_overdue} SOS quá hạn`);
  if (r.sos_critical) add(3, `${r.sos_critical} SOS cấp 1`);
  if (r.sos_open && !r.sos_overdue && !r.sos_critical) add(1, `${r.sos_open} SOS chưa xong`);
  if (r.alert_level) add(r.alert_level, `${r.alerts > 1 ? `${r.alerts} cảnh báo` : 'cảnh báo'} ${LEVEL[SEVERITY_BY_LEVEL[r.alert_level]].label}`);
  if (r.hazard_level) add(r.hazard_level, `${r.hazards} vùng nguy hiểm`);
  if (r.station_level) add(r.station_level, `${r.stations_alarm} trạm vượt ngưỡng`);
  add(rainLevel(r.rain_24h) || 0, `mưa 24 giờ tới ${num(r.rain_24h, 0)} mm`);
  reasons.sort((a, b) => b.level - a.level);
  return { level: reasons[0]?.level || 0, reasons };
}

/** Bảng mã xã → tình hình (communeStatus) từ kết quả /dashboard/communes. */
export const statusByCode = (rows) => new Map((rows || []).map((r) => [r.code, communeStatus(r)]));
