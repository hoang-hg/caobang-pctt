import { Clock, Home, LifeBuoy, Users } from 'lucide-react';
import StatCard, { Badge } from '../dashboard/StatCard';
import { ErrorState, Skeleton } from '../common/ui';
import { int, pct } from '../../utils/format';
import { occupancyLevel } from '../../utils/risk';
import { durWords } from './rescueFacts';

const GRID = 'grid grid-cols-2 gap-2 lg:grid-cols-4 [&>*]:min-w-0';

/**
 * 4 ô chỉ số của Điều hành cứu hộ (lãnh đạo đọc trong vài giây), cùng kiểu ô của Tổng quan (StatCard gọn): phiếu đang mở
 * theo mức (Đỏ / Cam / Vàng) · quá hạn phản hồi (nhấp nháy khi có, kèm phiếu chờ lâu nhất) · số người cần cứu / đã cứu 48 giờ ·
 * tiến độ sơ tán và điểm sơ tán đầy. Tính từ cùng danh sách phiếu của bảng điều phối. Chạm ô → lọc bảng (`onGo`).
 */
export default function RescueKpis({ ticketsQ, tickets, factsOf, evacQ, onGo, onEvac }) {
  if (!ticketsQ.data) {
    return ticketsQ.isError
      ? <ErrorState height={96} onRetry={ticketsQ.refetch}>Không tải được danh sách phiếu SOS</ErrorState>
      : <div className={GRID} role="group" aria-label="Chỉ số cứu hộ" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={96} />)}</div>;
  }
  const open = tickets.filter((t) => factsOf(t).open);
  const by = (p) => open.filter((t) => t.priority === p).length;
  const [p1, p2, p3] = [by(1), by(2), by(3)];
  const overdue = open.filter((t) => factsOf(t).overdue).length;
  const longest = open.reduce((m, t) => {
    const s = factsOf(t).sla;
    return s && (!m || s.waitedSec > m.sec) ? { sec: s.waitedSec, code: t.code } : m;
  }, null);
  const trapped = open.reduce((n, t) => n + (t.trapped_count || 0), 0);
  const saved = tickets.filter((t) => t.status === 'hoan_thanh').reduce((n, t) => n + (t.trapped_count || 0), 0);
  const ev = evacQ.data;
  const planned = ev?.progress.reduce((n, r) => n + r.planned_households, 0) || 0;
  const done = ev?.progress.reduce((n, r) => n + r.evacuated_households, 0) || 0;
  const full = ev?.sites.filter((s) => occupancyLevel(s.current_occupancy, s.capacity) === 3).length || 0;
  const near = ev?.sites.filter((s) => occupancyLevel(s.current_occupancy, s.capacity) === 2).length || 0;

  return (
    <div className={GRID} role="group" aria-label="Chỉ số cứu hộ">
      <StatCard
        compact
        icon={LifeBuoy}
        title="Phiếu đang mở"
        level={open.length ? (p1 ? 3 : p2 ? 2 : 1) : 0}
        badge={p1 > 0 && <Badge level={3}>{p1} cấp 1</Badge>}
        value={int(open.length)}
        unit="phiếu"
        footer={open.length ? `Đỏ ${p1} · Cam ${p2} · Vàng ${p3}` : 'Không có phiếu đang mở'}
        onClick={() => onGo({})}
        hint="Phiếu cứu hộ chưa xong, theo mức ưu tiên — chạm để xem bảng điều phối"
      />
      <StatCard
        compact
        icon={Clock}
        title="Quá hạn phản hồi"
        level={overdue ? 3 : 0}
        alert={overdue > 0}
        badge={overdue > 0 && <Badge level={3}>Quá hạn</Badge>}
        value={int(overdue)}
        unit="phiếu"
        footer={longest ? `Chờ lâu nhất ${durWords(longest.sec)} (${longest.code})` : 'Không có phiếu đang chờ'}
        onClick={() => onGo({ th: 'qua_han' })}
        hint="Phiếu chờ nhận / chờ điều đội quá hạn của cấp (cấp 1: 3 phút, cấp 2: 15 phút, cấp 3: 60 phút) — chạm để lọc"
      />
      <StatCard
        compact
        icon={Users}
        title="Người cần cứu"
        value={int(trapped)}
        unit="người"
        footer={`Đã cứu xong 48 giờ qua: ${int(saved)} người`}
        onClick={() => onGo({}, 'nhieu_nguoi')}
        hint="Số người mắc kẹt / cần hỗ trợ ghi trên các phiếu đang mở; đã cứu = phiếu hoàn thành trong 48 giờ qua"
      />
      <StatCard
        compact
        icon={Home}
        title="Sơ tán an toàn"
        level={!ev ? null : full ? 3 : near ? 2 : planned ? 0 : null}
        badge={!ev ? <Badge level={null}>{evacQ.isError ? 'Lỗi tải' : 'Đang tải'}</Badge>
          : full ? <Badge level={3}>{full} điểm đầy</Badge> : near ? <Badge level={2}>{near} sắp đầy</Badge> : null}
        value={planned ? `${pct(done, planned)}%` : '–'}
        unit={planned ? `${int(done)}/${int(planned)} hộ` : undefined}
        footer={!ev ? 'Chưa có số liệu sơ tán' : planned ? `${ev.sites.length} điểm sơ tán trong vùng` : 'Chưa có kế hoạch sơ tán'}
        onClick={onEvac}
        hint="Số hộ đã sơ tán / phải sơ tán theo kế hoạch; điểm sơ tán đầy (≥ 100%) Đỏ, sắp đầy (trên 85%) Cam — chạm để xem"
      />
    </div>
  );
}
