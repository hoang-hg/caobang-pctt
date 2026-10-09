/** Phiếu SOS đã có đội đang đi / đã đến hiện trường. */
export const hasActiveTeam = (t) => t.dispatch_status === 'dang_di' || t.dispatch_status === 'da_den';

/** Đồng hồ SLA của phiếu: "Chờ xử lý" tính từ lúc nhận tin; "Đang điều phối" mà chưa có đội nào đang đi ("Chờ điều động")
 * tính từ lúc chuyển sang cột này / lúc huỷ lệnh trước — kéo sang "Đang điều phối" không dừng được đồng hồ khi chưa ai đi
 * cứu. Cùng quy tắc với KPI quá hạn của dashboard (backend app/services/sos.py OVERDUE_SQL) — dùng chung cho Điều hành cứu
 * hộ và Dashboard để hai nơi không lệch nhau. */
export function slaClock(t) {
  if (t.status === 'moi') return { label: 'Chờ', since: t.received_at };
  if (t.status === 'dieu_phoi' && !hasActiveTeam(t)) return { label: 'Chờ điều động', since: t.status_changed_at || t.acknowledged_at || t.received_at };
  return null;
}

export function slaState(t, now) {
  const clock = slaClock(t);
  if (!clock) return null;
  const waitedSec = (now - new Date(clock.since).getTime()) / 1000;
  return { ...clock, waitedSec, breached: waitedSec > t.sla_minutes * 60 };
}
