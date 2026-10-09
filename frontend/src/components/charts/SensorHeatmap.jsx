import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Compass, Droplets } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAreaQuery } from '../../api/hooks';
import { dateTime, hourLabel, num } from '../../utils/format';
import { alarmLevel } from '../../utils/labels';
import { risk } from '../../utils/risk';
import { STALE_MS } from '../../utils/stations';
import { EmptyState, ErrorState, RiskLegend, Skeleton } from '../common/ui';
import { axisProps, ChartTooltip, useChartTheme } from './chartTheme';

const HOURS = 48;
const HOUR = 3_600_000;
const ROMAN = ['', 'I', 'II', 'III'];
const KIND = {
  do_nghieng: { icon: Compass, label: 'Độ nghiêng taluy', prefix: /^Cảm biến nghiêng\s+/i },
  do_am_dat: { icon: Droplets, label: 'Độ ẩm đất', prefix: /^Độ ẩm đất\s+/i },
};

/** Mức của một giá trị theo ngưỡng BĐ I–III khai báo cho cảm biến; chưa khai báo ngưỡng → null (xám, không tô xanh). */
const sensorLevel = (v, thr) => (v == null || thr?.bd1 == null ? null : alarmLevel(v, thr));
const unitOf = (s) => (s.unit === 'độ' ? '°' : ` ${s.unit || ''}`);
const fmt = (v, s) => `${num(v, 2)}${unitOf(s)}`;
const capitalize = (t) => t.charAt(0).toUpperCase() + t.slice(1);
// Điện thoại: 24 giờ gần nhất (ô ~7 px, 48 ô chỉ còn 3,5 px); từ sm: đủ 48 giờ. Biểu đồ chuỗi thời gian luôn đủ 48 giờ
const COLS = 'grid-cols-[repeat(24,minmax(0,1fr))] sm:grid-cols-[repeat(48,minmax(0,1fr))]';
const phoneHidden = (i) => i < HOURS - 24 && 'hidden sm:block';

/**
 * Heatmap chuỗi thời gian của cảm biến cảnh báo sớm sạt lở (thiết kế A: "Scatter hoặc Heatmap chuỗi thời gian … độ ẩm đất
 * hoặc biến dạng bề mặt … phân loại Đỏ / Cam / Vàng"): mỗi hàng một cảm biến (độ nghiêng taluy, độ ẩm đất), mỗi ô một giờ
 * trong 48 giờ qua = giá trị LỚN NHẤT trong giờ, màu theo ngưỡng BĐ I / II / III của chính cảm biến đó (Vàng / Cam / Đỏ);
 * giờ không có số đo = ô xám. Chọn một hàng → chuỗi thời gian của cảm biến đó kèm vạch ngưỡng.
 */
export default function SensorHeatmap() {
  const c = useChartTheme();
  const { data, isError, refetch } = useAreaQuery('landslide-sensors', '/dashboard/landslide-sensors', { hours: HOURS }, { refetchInterval: 60_000 });
  const [picked, setPicked] = useState(null);

  const { rows, slots } = useMemo(() => {
    if (!data) return { rows: [], slots: [] };
    const end = Math.floor(Date.now() / HOUR) * HOUR; // giờ đang chạy
    const hourSlots = Array.from({ length: HOURS }, (_, i) => end - (HOURS - 1 - i) * HOUR);
    const list = data.sensors.map((s) => {
      const byHour = new Map(s.series.map((p) => [new Date(p.time).getTime(), p.max]));
      const cells = hourSlots.map((t) => {
        const v = byHour.get(t);
        return { t, v: v ?? null, level: v == null ? null : sensorLevel(v, s.thresholds) };
      });
      const stale = !s.time || Date.now() - new Date(s.time).getTime() > STALE_MS;
      const now = s.value == null ? null : sensorLevel(Number(s.value), s.thresholds);
      return {
        s,
        cells,
        now,
        stale,
        hot: cells.filter((x) => x.level >= 2).length, // số giờ ở mức Cam trở lên
        short: capitalize(s.name.replace(KIND[s.type]?.prefix || /^$/, '')),
        series: cells.filter((x) => x.v != null).map((x) => ({ t: x.t, v: x.v })),
      };
    });
    // Nặng nhất lên đầu: mức hiện tại → số giờ Cam / Đỏ
    list.sort((a, b) => (b.now ?? -1) - (a.now ?? -1) || b.hot - a.hot);
    return { rows: list, slots: hourSlots };
  }, [data]);

  if (!data) {
    return isError ? <ErrorState height={220} onRetry={refetch}>Không tải được số liệu cảm biến sạt lở</ErrorState> : <Skeleton height={220} />;
  }
  if (!rows.length) {
    return (
      <EmptyState height={140}>
        Chưa có cảm biến độ nghiêng / độ ẩm đất trong vùng đang xem — nhập danh mục trạm loại "Độ nghiêng đất" / "Độ ẩm đất"
        kèm ngưỡng BĐ I–III
      </EmptyState>
    );
  }
  const sel = rows.find((r) => r.s.id === picked) || rows[0];
  // Số đo cũ đã vượt ngưỡng vẫn tính (mất tín hiệu không xoá được nguy cơ đã biết — như utils/stations.stationView)
  const over = rows.filter((r) => r.now >= 1);
  const tick = (i) => i % 12 === 0 || i === HOURS - 1; // nhãn giờ mỗi 12 giờ + giờ hiện tại

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <p className="text-ink-2">
          {over.length ? (
            <>
              <b className={risk(over[0].now).text}>{over.length}/{rows.length} cảm biến đang vượt ngưỡng</b> — nặng nhất{' '}
              <b>{over[0].short}</b> {fmt(over[0].s.value, over[0].s)} ({risk(over[0].now).name}{over[0].stale ? ', số đo cũ' : ''})
            </>
          ) : (
            <>Chưa cảm biến nào vượt ngưỡng BĐ I ({rows.filter((r) => !r.stale).length}/{rows.length} cảm biến có số đo trong 60 phút qua)</>
          )}
        </p>
        <RiskLegend meaningClass="hidden xl:inline" />
      </div>

      <div role="list" aria-label={`Cảm biến sạt lở — mức theo từng giờ, ${HOURS} giờ qua`} className="flex flex-col gap-1">
        {rows.map((r) => {
          const K = KIND[r.s.type] || KIND.do_nghieng;
          const on = r === sel;
          // Nhãn / màu mức hiện tại: mất tín hiệu khi đang dưới ngưỡng → xám; đã vượt ngưỡng → giữ mức, ghi "(cũ)"
          const shown = r.stale && !r.now ? null : r.now;
          const nowLabel = r.s.value == null ? 'Không có số đo'
            : r.now == null ? 'Chưa khai báo ngưỡng'
              : r.stale ? (r.now ? `${risk(r.now).name} (cũ)` : 'Mất tín hiệu') : risk(r.now).name;
          return (
            <div key={r.s.id} role="listitem" className="grid grid-cols-[minmax(0,8.25rem)_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
              <button
                type="button"
                onClick={() => setPicked(r.s.id)}
                aria-pressed={on}
                aria-label={`${r.s.name}: ${r.s.value == null ? 'không có số đo' : fmt(r.s.value, r.s)}, ${nowLabel}${r.stale && r.s.time ? ` (số đo lúc ${dateTime(r.s.time)})` : ''}; ${r.hot} giờ ở mức Cam trở lên trong ${HOURS} giờ qua — xem chuỗi thời gian`}
                className={clsx(
                  'flex min-h-[44px] min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-left text-xs transition-colors',
                  on ? 'border-accent bg-accent/10 ring-1 ring-accent' : 'border-line bg-panel2/40 hover:bg-panel2',
                )}
              >
                <K.icon size={14} className={clsx('shrink-0', risk(shown).text)} aria-hidden="true" />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate font-semibold text-ink" title={r.s.name}>{r.short}</span>
                  <span className="flex min-w-0 items-center gap-1">
                    <b className={clsx('whitespace-nowrap font-mono', r.stale ? 'text-muted' : 'text-ink')}>{r.s.value == null ? '–' : fmt(r.s.value, r.s)}</b>
                    <span className={clsx('chip truncate px-1 py-0 text-[9px]', risk(shown).chip)}>{nowLabel}</span>
                  </span>
                </span>
              </button>
              {/* 48 ô giờ: ô xám = giờ không có số đo (không tô xanh khi không biết) */}
              <div className={clsx('grid h-7 gap-px overflow-hidden rounded', COLS)} aria-hidden="true">
                {r.cells.map((x, i) => (
                  <span
                    key={x.t}
                    className={clsx(x.v == null ? 'bg-panel2' : risk(x.level).fill, x.v != null && x.level === 0 && 'opacity-60', phoneHidden(i))}
                    title={`${r.short} · ${hourLabel(x.t)} ${new Date(x.t).getDate()}/${new Date(x.t).getMonth() + 1}: ${x.v == null ? 'không có số đo' : `${fmt(x.v, r.s)} — ${x.level == null ? 'chưa có ngưỡng' : risk(x.level).name}`}`}
                  />
                ))}
              </div>
            </div>
          );
        })}
        {/* Trục giờ dưới heatmap */}
        <div className="grid grid-cols-[minmax(0,8.25rem)_minmax(0,1fr)] gap-2 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]" aria-hidden="true">
          <span className="text-[10px] text-muted">Giờ</span>
          <div className={clsx('grid text-[10px] text-muted', COLS)}>
            {slots.map((t, i) => (
              <span key={t} className={clsx('relative h-3', phoneHidden(i))}>
                {tick(i) && <span className={clsx('absolute top-0 whitespace-nowrap', i === HOURS - 1 ? 'right-0' : 'left-0')}>{i === HOURS - 1 ? 'Giờ này' : hourLabel(t)}</span>}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Chuỗi thời gian của cảm biến đang chọn */}
      <div className="rounded-lg border border-line/70 p-2 sm:p-3">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs">
          <b className="text-ink">{sel.s.name}</b>
          <span className="text-muted">
            {KIND[sel.s.type]?.label} · {sel.s.admin_name || '–'} · ngưỡng{' '}
            {[1, 2, 3].map((lv) => sel.s.thresholds?.[`bd${lv}`] != null && (
              <span key={lv} className={clsx('font-mono', risk(lv).text)}> BĐ {ROMAN[lv]} {fmt(sel.s.thresholds[`bd${lv}`], sel.s)}</span>
            ))}
            {sel.s.thresholds?.bd1 == null && ' chưa khai báo'}
          </span>
        </div>
        {sel.series.length ? (
          <ResponsiveContainer width="100%" height={170}>
            <LineChart data={sel.series} margin={{ top: 6, right: 44, bottom: 0, left: -12 }}>
              <CartesianGrid stroke={c.grid} vertical={false} />
              <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={hourLabel} minTickGap={40} {...axisProps(c)} />
              <YAxis width={48} tickFormatter={(v) => num(v, sel.s.type === 'do_nghieng' ? 1 : 0)} domain={['auto', 'auto']} {...axisProps(c)} />
              <Tooltip content={<ChartTooltip unit={unitOf(sel.s)} labelFormatter={(l) => dateTime(l)} />} cursor={{ stroke: c.axis, strokeDasharray: '3 3' }} />
              {[1, 2, 3].map((lv) => sel.s.thresholds?.[`bd${lv}`] != null && (
                <ReferenceLine key={lv} y={sel.s.thresholds[`bd${lv}`]} stroke={[null, c.warn, c.serious, c.danger][lv]} strokeWidth={1.5} ifOverflow="extendDomain"
                  label={{ value: `BĐ ${ROMAN[lv]}`, fill: [null, c.warn, c.serious, c.danger][lv], fontSize: 10, position: 'right' }} />
              ))}
              <Line dataKey="v" name="Lớn nhất trong giờ" stroke={c.s1} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState height={120}>Cảm biến chưa có số đo trong {HOURS} giờ qua</EmptyState>
        )}
      </div>
      <p className="text-[11px] text-muted">
        Mỗi ô = giá trị lớn nhất trong giờ; ô xám = giờ không có số đo (điện thoại: 24 giờ gần nhất). Mức theo ngưỡng BĐ I / II / III
        khai báo cho từng cảm biến (Danh mục trạm) — chỉ báo kỹ thuật để theo dõi sớm, không phải cấp
        độ rủi ro thiên tai do cơ quan có thẩm quyền công bố.
      </p>
    </div>
  );
}
