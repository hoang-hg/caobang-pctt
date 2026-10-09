import clsx from 'clsx';
import { Waves } from 'lucide-react';
import { ALARM } from '../../utils/labels';
import { NO_DATA, risk } from '../../utils/risk';
import { stationView } from '../../utils/stations';
import { num } from '../../utils/format';
import StatCard, { Badge } from './StatCard';

export const ROMAN = ['', 'I', 'II', 'III'];

/**
 * Tình trạng một trạm mực nước (dữ liệu `/stations`: số đo mới nhất trong 2 giờ qua). Không có số đo, mất tín hiệu
 * (cũ hơn 60 phút) hoặc chưa khai báo ngưỡng → `level` null (xám), không bao giờ "Dưới BĐ I". Số đo cũ đã vượt báo
 * động vẫn giữ cấp đó (mất tín hiệu không xoá được nguy cơ đã biết) — quy tắc của utils/stations.stationView.
 */
export function riverState(s) {
  if (s.value == null) return { level: null, value: null, noData: true, stale: false, label: 'Không có số đo', cls: NO_DATA.chip };
  const value = Number(s.value);
  if (s.thresholds?.bd1 == null) {
    return { level: null, value, noData: false, stale: false, label: 'Chưa khai báo ngưỡng', cls: NO_DATA.chip };
  }
  const view = stationView(s);
  const stale = view.marker === '?';
  if (view.level == null) return { level: null, value, noData: false, stale, label: 'Mất tín hiệu', cls: NO_DATA.chip };
  return { level: view.level, value, noData: false, stale, label: `${ALARM[view.level].label}${stale ? ' (cũ)' : ''}`, cls: risk(view.level).chip };
}

/** "Trạm thủy văn Cao Bằng (sông Bằng Giang)" → "Cao Bằng". */
const shortName = (s) => s.name.replace(/^Trạm\s+(thủy|thuỷ)\s+văn\s+/i, '').replace(/\s*\(.*\)\s*$/, '');

/** Thẻ "Mực nước sông": mọi trạm mực nước trong vùng (kể cả trạm chưa có số đo — hiện xám), bấm trạm → biểu đồ. */
export default function RiverKpi({ stations, selectedId, onSelect }) {
  const rows = stations.map((s) => ({ s, st: riverState(s) }));
  const fresh = rows.filter((r) => !r.st.noData && !r.st.stale).length;
  const known = rows.filter((r) => r.st.level != null);
  const worst = known.reduce((m, r) => Math.max(m, r.st.level), 0);
  const level = known.length ? worst : null;
  let badge = <Badge level={worst}>{ALARM[worst].label}</Badge>;
  if (!rows.length) badge = <Badge level={null}>Chưa có trạm</Badge>;
  else if (!known.length) badge = <Badge level={null}>Chưa đánh giá được</Badge>;

  return (
    <StatCard
      icon={Waves}
      title="Mực nước sông"
      badge={badge}
      level={level}
      alert={level === 3}
      footer={
        rows.length
          ? `${fresh}/${rows.length} trạm có số đo trong 60 phút qua · bấm trạm để xem biểu đồ`
          : 'Chưa có trạm mực nước trong vùng đang xem'
      }
    >
      {rows.length > 0 && (
        <ul className="scroll-thin flex max-h-44 flex-col gap-0.5 overflow-y-auto pr-1 print:max-h-none print:overflow-visible">
          {rows.map(({ s, st }) => {
            const t = s.thresholds || {};
            const lo = t.bd1 != null ? t.bd1 - 2 : null;
            const hi = t.bd3 != null ? t.bd3 + 1 : null;
            const bar = st.level != null && !st.stale && lo != null && hi > lo
              ? Math.max(4, Math.min(100, ((st.value - lo) / (hi - lo)) * 100))
              : null;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onSelect?.(s.id)}
                  aria-pressed={selectedId === s.id}
                  title={s.name}
                  className={clsx('flex min-h-[40px] w-full flex-col justify-center gap-0.5 rounded-md px-1.5 py-1 text-left hover:bg-panel2', selectedId === s.id && 'bg-panel2')}
                >
                  <span className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate font-medium text-ink-2">
                      {s.river ? `S. ${s.river}` : shortName(s)}
                      {s.river && <span className="text-muted"> · {shortName(s)}</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 font-mono">
                      <b className={st.level == null ? 'text-muted' : 'text-ink'}>{st.value == null ? '–' : `${num(st.value, 2)} m`}</b>
                      <span className={clsx('chip px-1.5 py-0 text-[9px]', st.cls)}>{st.label}</span>
                    </span>
                  </span>
                  {bar != null && (
                    <span className="h-1.5 w-full overflow-hidden rounded-full bg-panel2">
                      <span className={clsx('block h-full rounded-full', risk(st.level).fill)} style={{ width: `${bar}%` }} />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </StatCard>
  );
}
