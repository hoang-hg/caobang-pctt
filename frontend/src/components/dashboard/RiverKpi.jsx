import clsx from 'clsx';
import { ALARM } from '../../utils/labels';
import { NO_DATA, risk } from '../../utils/risk';
import { etaWhen, forecastSource, stationView, trendProps, waterTrend } from '../../utils/stations';
import { num } from '../../utils/format';
import { TrendTag } from '../common/ui';

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

/** Xu hướng một trạm mực nước: số đo ~1 giờ trước (backend /stations prev_value / prev_time) → số đo mới nhất. */
export const riverTrend = (s) => waterTrend(s.value, s.time, s.prev_value, s.prev_time);

/**
 * Dự báo chạm mức báo động kế tiếp (backend next_level / eta_time / eta_model): bản tin KTTV nếu có, không thì đường mô
 * phỏng — `source` luôn đi kèm khi hiện, không để dự báo mô phỏng trông như bản tin chính thức.
 */
export function riverEta(s) {
  if (!s.eta_time || !s.next_level) return null;
  const kttv = s.eta_model === 'KTTV';
  return { level: s.next_level, t: new Date(s.eta_time).getTime(), when: etaWhen(s.eta_time), kttv, source: forecastSource(s.eta_model) };
}

/** "Trạm thủy văn Cao Bằng (sông Bằng Giang)" → "Cao Bằng". */
export const shortName = (s) => s.name.replace(/^Trạm\s+(thủy|thuỷ)\s+văn\s+/i, '').replace(/\s*\(.*\)\s*$/, '');
/** Tên ngắn kèm sông: "S. Bằng Giang · Cao Bằng". */
export const riverName = (s) => (s.river ? `S. ${s.river} · ${shortName(s)}` : shortName(s));

/**
 * Tóm tắt mực nước cho ô KPI: mức nặng nhất trong các trạm ĐÃ đánh giá được (không trạm nào đánh giá được → null, xám),
 * trạm nặng nhất, số trạm trên BĐ I, số trạm có số đo trong 60 phút qua, và dự báo đáng lo nhất (`next`: mức kế tiếp cao
 * nhất, cùng mức thì sớm nhất).
 */
export function riverSummary(stations) {
  const rows = stations.map((s) => ({ s, st: riverState(s), trend: riverTrend(s), eta: riverEta(s) }));
  const known = rows.filter((r) => r.st.level != null);
  const worst = known.reduce((m, r) => (!m || r.st.level > m.st.level ? r : m), null);
  return {
    rows,
    known: known.length,
    worst,
    level: worst ? worst.st.level : null,
    above: known.filter((r) => r.st.level >= 1).length,
    fresh: rows.filter((r) => !r.st.noData && !r.st.stale).length,
    next: rows.filter((r) => r.eta).sort((a, b) => b.eta.level - a.eta.level || a.eta.t - b.eta.t)[0] || null,
  };
}

/**
 * Chọn trạm cho biểu đồ thủy văn: mỗi trạm một nút (chấm màu theo mức, số đo, nhãn BĐ) trên MỘT hàng cuộn ngang — trước
 * đây là danh sách trong thẻ KPI "Mực nước sông" (thẻ cao, đẩy bản đồ xuống dưới màn hình đầu).
 */
export function StationPicker({ stations, selectedId, onSelect }) {
  if (!stations.length) return null;
  return (
    <div role="radiogroup" aria-label="Chọn trạm mực nước" className="scroll-thin -mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {stations.map((s) => {
        const st = riverState(s);
        const on = selectedId === s.id;
        return (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onSelect(s.id)}
            title={s.name}
            className={clsx(
              'flex min-h-[44px] shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1 text-left text-xs transition-colors',
              on ? 'border-accent bg-accent/10 ring-1 ring-accent' : 'border-line bg-panel2/40 hover:bg-panel2',
            )}
          >
            <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', risk(st.level).fill)} aria-hidden="true" />
            <span className="flex flex-col leading-tight">
              <span className={clsx('whitespace-nowrap font-semibold', on ? 'text-accent' : 'text-ink')}>{riverName(s)}</span>
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <b className={clsx('font-mono', st.level == null ? 'text-muted' : 'text-ink')}>{st.value == null ? '–' : `${num(st.value, 2)} m`}</b>
                <TrendTag {...trendProps(riverTrend(s))} className="text-[10px]" />
                <span className={clsx('chip px-1.5 py-0 text-[9px]', st.cls)}>{st.label}</span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
