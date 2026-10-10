import { pct } from '../../utils/format';
import { LANDSLIDE_LEVEL, levelOf, rainLevel } from '../../utils/risk';

/*
 * Mức rủi ro / số chính của các ô chỉ số nhanh — dùng chung dải KPI ở Tổng quan (KpiStrip) và bảng "Tình hình" của Bản đồ
 * giám sát (MapKpis), để hai nơi luôn cùng số, cùng màu. Đầu vào là các mục của /dashboard/kpis.
 */

/** Mưa 24 giờ: mức theo mưa lớn nhất cục bộ (thang 50 / 100 / 200 mm). */
export function rainFacts(rain) {
  const known = rain?.avg_24h != null;
  return { known, level: known ? rainLevel(rain.max_24h) : null };
}

/**
 * SOS chờ xử lý. Đỏ nhấp nháy (thiết kế A.2): quá hạn phản hồi theo cấp, HOẶC chờ quá 15 phút chưa có lực lượng tiếp nhận
 * (mọi cấp); còn phiếu cấp 1 chưa xong cũng Đỏ; chỉ có phiếu mới → Vàng.
 */
export function sosFacts(sos = {}) {
  const late = sos.overdue > 0 || sos.no_team_15m > 0;
  return { late, level: late || sos.critical > 0 ? 3 : sos.waiting > 0 ? 1 : 0 };
}

/** Sơ tán: % hộ đã sơ tán so với kế hoạch (chưa có kế hoạch → null). */
export function evacFacts(ev = {}) {
  const planned = ev.planned_households || 0;
  return { planned, pct: planned ? pct(ev.evacuated_households, planned) : null };
}

/** Lực lượng / phương tiện: đã có dữ liệu chưa. */
export function resourceFacts(fo = {}, ve = {}) {
  return { has: fo.units > 0 || ve.special_total > 0 || ve.heavy_total > 0 };
}

/** Hồ chứa (xả khẩn cấp Đỏ, đang xả Cam) và sạt lở (cấm đường, cảnh báo); mức chung = mức nặng hơn của hai bên. */
export function topicFacts(rs = {}, ls = {}) {
  const rsLv = !rs.total ? null : rs.emergency_count ? 3 : rs.spill_count ? 2 : 0;
  const lsLv = !ls.total ? null : ls.blocked_count ? levelOf(LANDSLIDE_LEVEL, 'cam_duong') : ls.warning_count ? levelOf(LANDSLIDE_LEVEL, 'canh_bao') : 0;
  return { rsLv, lsLv, level: rsLv == null && lsLv == null ? null : Math.max(rsLv ?? 0, lsLv ?? 0) };
}
