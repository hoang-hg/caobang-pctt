import { Megaphone, Send, ShieldCheck, Users } from 'lucide-react';
import StatCard, { Badge } from '../dashboard/StatCard';
import { ErrorState, Skeleton } from '../common/ui';
import { int, pct } from '../../utils/format';
import { CHANNEL_SHORT, LONG_WAIT_MIN, SEVERITY_LEVEL, waitText } from './alertFacts';

const GRID = 'grid grid-cols-2 gap-2 lg:grid-cols-4 [&>*]:min-w-0';

/**
 * 4 ô chỉ số của Cảnh báo khẩn cấp (lãnh đạo đọc trong vài giây), cùng kiểu ô của Tổng quan: cảnh báo đang hiệu lực theo mức
 * nặng nhất · lệnh chờ phê duyệt (nhấp nháy khi chờ quá 10 phút) · người nhận tin trong vùng cảnh báo · chuyển giao theo
 * kênh — kênh chưa tích hợp thì nói thẳng "chỉ trên cổng công khai", không hiện tỉ lệ giả. Tính từ cùng danh sách lệnh của
 * dải khẩn. Chạm ô → cuộn tới khối tương ứng (`onGo`).
 */
export default function AlertKpis({ query, broadcasts, factsOf, onGo }) {
  if (!query.data) {
    return query.isError
      ? <ErrorState height={96} onRetry={query.refetch}>Không tải được danh sách lệnh cảnh báo</ErrorState>
      : <div className={GRID} role="group" aria-label="Chỉ số cảnh báo" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={96} />)}</div>;
  }
  const live = broadcasts.filter((b) => factsOf(b).live);
  const pending = broadcasts.filter((b) => factsOf(b).pending);
  const red = live.filter((b) => b.severity === 'do').length;
  const worst = live.reduce((m, b) => Math.max(m, SEVERITY_LEVEL[b.severity] || 0), 0);
  const longest = pending.reduce((m, b) => (!m || factsOf(b).waitedMin > m.min ? { min: factsOf(b).waitedMin, code: b.code } : m), null);
  const slow = longest && longest.min >= LONG_WAIT_MIN;
  const sum = (k) => live.reduce((n, b) => n + (b.audience?.[k] || 0), 0);
  const portal = live.filter((b) => factsOf(b).portalOnly).length;
  // Chuyển giao: cộng các kênh đã tích hợp của mọi cảnh báo đang hiệu lực
  const byCh = {};
  for (const b of live) {
    for (const [ch, v] of Object.entries(b.metrics || {})) {
      if (v?.integrated === false) continue;
      const c = (byCh[ch] ||= { target: 0, delivered: 0 });
      c.target += v.target || 0;
      c.delivered += v.delivered || 0;
    }
  }
  const tot = Object.values(byCh).reduce((m, c) => ({ target: m.target + c.target, delivered: m.delivered + c.delivered }), { target: 0, delivered: 0 });

  return (
    <div className={GRID} role="group" aria-label="Chỉ số cảnh báo">
      <StatCard
        compact
        icon={Megaphone}
        title="Đang hiệu lực"
        level={worst}
        badge={red > 0 && <Badge level={3}>{red} rất cao</Badge>}
        value={int(live.length)}
        unit="cảnh báo"
        footer={live.length ? `${int(sum('households'))} hộ trong vùng cảnh báo` : 'Không có cảnh báo đang hiệu lực'}
        onClick={() => onGo({ anchor: 'dang-hieu-luc' })}
        hint="Cảnh báo đã duyệt, còn hạn hiệu lực (đang hiện cho người dân), mức nặng nhất tô màu ô — chạm để xem"
      />
      <StatCard
        compact
        icon={ShieldCheck}
        title="Chờ phê duyệt"
        level={pending.length ? (slow || pending.some((b) => b.severity === 'do') ? 3 : 2) : 0}
        alert={!!slow}
        badge={slow && <Badge level={3}>Chờ lâu</Badge>}
        value={int(pending.length)}
        unit="lệnh"
        footer={longest ? `Chờ lâu nhất ${waitText(longest.min)} (${longest.code})` : 'Không có lệnh chờ duyệt'}
        onClick={() => onGo({ anchor: 'cho-duyet' })}
        hint={`Lệnh đã soạn, chờ lãnh đạo ký duyệt bằng PIN — tin chưa tới người dân; chờ quá ${LONG_WAIT_MIN} phút thì ô nhấp nháy`}
      />
      <StatCard
        compact
        icon={Users}
        title="Người nhận tin"
        value={int(sum('households'))}
        unit="hộ"
        footer={live.length ? `${int(sum('subscribers'))} thuê bao · ${int(sum('speakers'))} loa` : 'Chưa có vùng đang cảnh báo'}
        onClick={() => onGo({ anchor: 'dang-hieu-luc' })}
        hint="Cộng số hộ, thuê bao di động, loa phường / xã trong vùng của các cảnh báo đang hiệu lực (vùng chồng nhau có thể tính hai lần)"
      />
      {portal > 0 || !tot.target ? (
        <StatCard
          compact
          icon={Send}
          title="Chuyển giao"
          level={portal > 0 ? 1 : undefined}
          badge={portal > 0 && <Badge level={1}>Chưa tới điện thoại</Badge>}
          value={portal > 0 ? int(portal) : '—'}
          unit={portal > 0 ? 'chỉ trên cổng' : undefined}
          footer={portal > 0 ? 'Kênh SMS / Zalo / Cell Broadcast chưa tích hợp' : 'Không có cảnh báo đang phát'}
          onClick={() => onGo({ anchor: 'dang-hieu-luc' })}
          hint="Lệnh đã duyệt nhưng kênh gửi tin chưa nối cổng của nhà mạng / Zalo: tin chỉ được công bố trên cổng công khai và bản nhẹ"
        />
      ) : (
        <StatCard
          compact
          icon={Send}
          title="Chuyển giao"
          value={`${pct(tot.delivered, tot.target)}%`}
          unit="đã nhận"
          footer={Object.entries(byCh).map(([ch, c]) => `${CHANNEL_SHORT[ch] || ch} ${pct(c.delivered, c.target)}%`).join(' · ')}
          onClick={() => onGo({ anchor: 'dang-hieu-luc' })}
          hint="Tỉ lệ tin đã tới người nhận trên tổng số cần gửi, cộng mọi kênh của các cảnh báo đang hiệu lực"
        />
      )}
    </div>
  );
}
