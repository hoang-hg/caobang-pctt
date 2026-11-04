import { useQuery } from '@tanstack/react-query';
import { Camera, CloudRain, Home, MapPinned, Megaphone, Siren } from 'lucide-react';
import { api } from '../../api/client';
import { useAreaQuery } from '../../api/hooks';
import { usePermission } from '../../rbac/usePermission';
import { int, num, pct } from '../../utils/format';
import { HAZARD_LEVEL, levelOf, rainLevel } from '../../utils/risk';
import { slaState } from '../../utils/sla';
import { Skeleton } from '../common/ui';
import StatCard, { Badge } from './StatCard';

const GRID = 'grid grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-4 [&>*]:min-w-0';
const GRID_SIX = 'grid grid-cols-3 gap-2.5 [&>*]:min-w-0';

/**
 * Hàng chỉ số của MỘT xã (trang Cấp xã) — thay 6 ô của tỉnh (xã không có trạm đo thì ô mưa, mực nước chỉ hiện "–"): việc
 * xã phải theo dõi hằng ngày, đọc trong vài giây:
 * - Phiếu SOS đang mở trong xã (cấp 1, quá hạn phản hồi — cùng quy tắc utils/sla) → chạm cuộn tới danh sách phiếu;
 * - Sơ tán an toàn: hộ đã sơ tán / kế hoạch (chưa cập nhật → nói rõ) → chạm mở cập nhật (nếu có quyền);
 * - Cảnh báo đang hiệu lực có vùng nhận gồm xã này (mức nặng nhất) → Cảnh báo & Hotline;
 * - Mưa dự báo 72 giờ tới theo mô hình (tổ hợp ECMWF + GFS, trung vị P50 · khả năng cao P90) — có cả khi xã chưa có trạm.
 * Mỗi ô đọc API thật; truy vấn trùng khoá với các khối khác của trang (không gọi thêm).
 * `six` (cán bộ xã trên máy tính — bản vẽ khung A11): thêm Điểm sơ tán, Phản ánh chờ duyệt; 3 cột 2 hàng.
 */
export default function CommuneKpis({ code, sosQ, evacQ, canSos, onSos, onEvac, six = false }) {
  const canReports = usePermission('report', 'view');
  const reportsQ = useAreaQuery('reports', '/reports', { status: 'cho_duyet', limit: 1 }, { refetchInterval: 30_000, enabled: six && canReports });
  const pendingReports = reportsQ.data?.counts?.cho_duyet ?? 0;
  const sites = (evacQ.data?.sites || []).filter((s) => s.admin_code === code);
  const free = sites.reduce((n, s) => n + Math.max(0, (s.capacity || 0) - (s.current_occupancy || 0)), 0);
  // Cùng khoá với trang Cảnh báo (máy chủ tự lọc theo phạm vi tài khoản) — WebSocket 'broadcast.updated' làm mới cả hai
  const canAlert = usePermission('alert', 'view');
  const alertsQ = useQuery({ queryKey: ['broadcasts'], queryFn: () => api('/alerts/broadcasts'), refetchInterval: 60_000, enabled: canAlert });
  const forecastQ = useAreaQuery('forecast-areas', '/forecast/areas', { hours: 72 }, { refetchInterval: 10 * 60_000 });
  const now = Date.now();

  const open = (sosQ.data || []).filter((t) => t.admin_code === code && t.status !== 'hoan_thanh');
  const late = open.filter((t) => slaState(t, now)?.breached).length;
  const critical = open.filter((t) => t.priority === 1).length;

  const progress = evacQ.data?.progress?.find((p) => p.code === code);
  const active = (alertsQ.data || []).filter((b) => b.active && (b.target_admin_codes || []).includes(code));
  const worstAlert = Math.max(-1, ...active.map((b) => levelOf(HAZARD_LEVEL, b.severity) ?? 0));
  const fc = (forecastQ.data || []).find((a) => a.code === code);

  return (
    <div className={six ? GRID_SIX : GRID} role="group" aria-label="Chỉ số của xã">
      {canSos && (sosQ.isLoading ? <Skeleton height={112} /> : (
        <StatCard
          compact
          footerRows
          icon={Siren}
          title="Phiếu SOS đang mở"
          value={sosQ.isError && !sosQ.data ? '–' : open.length}
          unit="phiếu"
          level={open.length ? (late || critical ? 3 : 2) : 0}
          alert={late > 0}
          badge={late > 0 ? <Badge level={3}>{late} quá hạn</Badge> : critical > 0 ? <Badge level={3}>{critical} cấp 1</Badge> : null}
          footer={sosQ.isError && !sosQ.data ? 'Chưa tải được phiếu SOS' : open.length ? 'Chạm để xem danh sách phiếu của xã' : 'Không có phiếu đang mở trong xã'}
          onClick={onSos}
        />
      ))}

      {evacQ.isLoading ? <Skeleton height={112} /> : (
        <StatCard
          compact
          icon={Home}
          title="Sơ tán an toàn"
          value={progress ? `${pct(progress.evacuated_households, progress.planned_households)}%` : '–'}
          unit={progress ? 'kế hoạch' : undefined}
          footer={progress
            ? `${int(progress.evacuated_households)}/${int(progress.planned_households)} hộ · ${int(progress.evacuated_persons)}/${int(progress.planned_persons)} người`
            : 'Xã chưa cập nhật kế hoạch / tiến độ sơ tán'}
          footerRows
          onClick={onEvac}
        />
      )}

      {canAlert && (alertsQ.isLoading ? <Skeleton height={112} /> : (
        <StatCard
          compact
          footerRows
          icon={Megaphone}
          title="Cảnh báo đang hiệu lực"
          value={alertsQ.isError && !alertsQ.data ? '–' : active.length}
          unit="lệnh"
          level={active.length ? worstAlert : 0}
          footer={alertsQ.isError && !alertsQ.data ? 'Chưa tải được lệnh cảnh báo' : active[0]?.title || 'Không có cảnh báo cho xã'}
          to="/canh-bao"
        />
      ))}

      {forecastQ.isLoading ? <Skeleton height={112} /> : (
        <StatCard
          compact
          icon={CloudRain}
          title="Mưa dự báo 72 giờ"
          value={fc ? num(fc.p50, 0) : '–'}
          unit={fc ? 'mm' : undefined}
          level={fc ? rainLevel(fc.p90) : null}
          footer={fc
            ? `Khả năng cao tới ${num(fc.p90, 0)} mm${fc.max_prob_heavy ? ` · xác suất mưa to ${Math.round(fc.max_prob_heavy * 100)}%` : ''}`
            : 'Chưa có bản tin dự báo cho xã'}
          footerRows
        />
      )}

      {six && (evacQ.isLoading ? <Skeleton height={112} /> : (
        <StatCard
          compact
          footerRows
          icon={MapPinned}
          title="Điểm sơ tán"
          value={evacQ.isError && !evacQ.data ? '–' : sites.length}
          unit="điểm"
          footer={evacQ.isError && !evacQ.data ? 'Chưa tải được điểm sơ tán' : sites.length ? `còn ${int(free)} chỗ` : 'Chưa có điểm sơ tán trong dữ liệu'}
          onClick={onEvac}
        />
      ))}

      {six && canReports && (reportsQ.isLoading ? <Skeleton height={112} /> : (
        <StatCard
          compact
          footerRows
          icon={Camera}
          title="Phản ánh chờ duyệt"
          value={reportsQ.isError && !reportsQ.data ? '–' : pendingReports}
          footer={reportsQ.isError && !reportsQ.data ? 'Chưa tải được phản ánh' : 'của người dân trong xã'}
          to="/phan-anh"
        />
      ))}
    </div>
  );
}
