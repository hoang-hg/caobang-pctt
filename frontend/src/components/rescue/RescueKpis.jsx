import clsx from 'clsx';
import { Clock, Home, LifeBuoy, Users } from 'lucide-react';
import StatCard, { Badge } from '../dashboard/StatCard';
import { ErrorState, Skeleton } from '../common/ui';
import { int, pct } from '../../utils/format';
import { occupancyLevel, risk } from '../../utils/risk';
import { durWords } from './rescueFacts';

const GRID = 'grid grid-cols-2 gap-2 lg:grid-cols-4 [&>*]:min-w-0';

/**
 * 4 ô chỉ số của Điều hành cứu hộ (lãnh đạo đọc trong vài giây), cùng kiểu ô của Tổng quan (StatCard gọn): phiếu đang mở
 * theo mức (Đỏ / Cam / Vàng) · quá hạn phản hồi (nhấp nháy khi có, kèm phiếu chờ lâu nhất) · số người cần cứu / đã cứu 48 giờ ·
 * tiến độ sơ tán và điểm sơ tán đầy. Tính từ cùng danh sách phiếu của bảng điều phối. Chạm ô → lọc bảng (`onGo`).
 * `chips` (máy tính ≥ 1280 px, bản vẽ desktop khung C): cùng 4 chỉ số thành hàng chip tròn "● số · việc · chi tiết" — vẫn là
 * nút, cùng tên đọc màn hình ("Quá hạn phản hồi: …").
 */
export default function RescueKpis({ ticketsQ, tickets, factsOf, evacQ, onGo, onEvac, chips = false }) {
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
  // Phiếu đóng không cần cứu (trùng, không xác minh được, tự an toàn) không tính là đã cứu
  const saved = tickets.filter((t) => t.status === 'hoan_thanh' && !t.close_reason).reduce((n, t) => n + (t.trapped_count || 0), 0);
  const ev = evacQ.data;
  const planned = ev?.progress.reduce((n, r) => n + r.planned_households, 0) || 0;
  const done = ev?.progress.reduce((n, r) => n + r.evacuated_households, 0) || 0;
  const full = ev?.sites.filter((s) => occupancyLevel(s.current_occupancy, s.capacity) === 3).length || 0;
  const near = ev?.sites.filter((s) => occupancyLevel(s.current_occupancy, s.capacity) === 2).length || 0;

  if (chips) {
    const chip = (key, level, label, body, onClick, hint) => (
      <button
        key={key}
        type="button"
        onClick={onClick}
        aria-label={label}
        title={hint}
        className="tap flex h-11 shrink-0 items-center gap-2 rounded-full border border-transparent bg-panel px-4 text-sm text-ink-2 shadow-[0_6px_20px_rgb(15_23_42/0.08)] transition-colors hover:border-accent/40 dark:border-line"
      >
        {level != null && <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', risk(level).fill)} aria-hidden="true" />}
        {body}
      </button>
    );
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2.5" role="group" aria-label="Chỉ số cứu hộ">
        {chip('mo', open.length ? (p1 ? 3 : p2 ? 2 : 1) : 0, `Phiếu đang mở: ${open.length} phiếu — Đỏ ${p1}, Cam ${p2}, Vàng ${p3}`,
          <span><b className="num text-ink">{int(open.length)}</b> phiếu đang mở{open.length > 0 && <span className="text-muted"> · Đỏ {p1} · Cam {p2}{p3 ? ` · Vàng ${p3}` : ''}</span>}</span>,
          () => onGo({}), 'Phiếu cứu hộ chưa xong, theo mức ưu tiên — chạm để xem bảng điều phối')}
        {chip('qua-han', overdue ? 3 : 0, `Quá hạn phản hồi: ${overdue} phiếu${longest ? ` — chờ lâu nhất ${durWords(longest.sec)} (${longest.code})` : ''}`,
          <span><b className={clsx('num', overdue ? 'text-danger' : 'text-ink')}>{int(overdue)} phiếu</b> quá hạn{longest && <span className="text-muted"> · lâu nhất {durWords(longest.sec)}</span>}</span>,
          () => onGo({ th: 'qua_han' }), 'Phiếu chờ nhận / chờ điều đội quá hạn của cấp (cấp 1: 3 phút, cấp 2: 15 phút, cấp 3: 60 phút) — chạm để lọc')}
        {chip('nguoi', null, `Người cần cứu: ${trapped} người — đã cứu xong 48 giờ qua ${saved} người`,
          <span><b className="num text-ink">{int(trapped)}</b> người cần cứu</span>,
          () => onGo({}, 'nhieu_nguoi'), `Số người mắc kẹt / cần hỗ trợ trên các phiếu đang mở; đã cứu xong 48 giờ qua: ${int(saved)} người`)}
        {chip('so-tan', !ev ? null : full ? 3 : near ? 2 : planned ? 0 : null, `Sơ tán an toàn: ${planned ? `${pct(done, planned)}% (${done}/${planned} hộ)` : 'chưa có số liệu'}`,
          <span>Sơ tán <b className="num text-ink">{planned ? `${pct(done, planned)}%` : '–'}</b>{(full || near) > 0 && <span className="text-muted"> · {full ? `${full} điểm đầy` : `${near} điểm sắp đầy`}</span>}</span>,
          onEvac, 'Số hộ đã sơ tán / phải sơ tán theo kế hoạch; điểm sơ tán đầy (≥ 100%) Đỏ, sắp đầy (trên 85%) Cam — chạm để xem')}
      </div>
    );
  }

  return (
    <div className={GRID} role="group" aria-label="Chỉ số cứu hộ">
      <StatCard
        compact
        footerRows
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
        footerRows
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
        footerRows
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
        footerRows
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
