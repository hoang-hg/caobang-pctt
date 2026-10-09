import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAreaQuery } from '../../api/hooks';
import { hourLabel, num } from '../../utils/format';
import { EmptyState, ErrorState, Skeleton } from '../common/ui';
import { axisProps, ChartTooltip, Legend, useChartTheme } from './chartTheme';

/** Mưa theo giờ (cột) + mưa tích lũy (đường) — 2 biểu đồ chung trục thời gian, KHÔNG dùng 2 trục Y.
 *  Phần 3 giờ tới vẽ nhạt / nét đứt: dự báo mô hình số (Open-Meteo) cho trạm mưa, KHÔNG phải nowcast radar. */
export default function RainfallChart({ height = 250 }) {
  const c = useChartTheme();
  const { data, isError, refetch } = useAreaQuery('rainfall', '/dashboard/rainfall', {}, { refetchInterval: 60_000 });

  const { rows, totalObs, totalFc, maxStation } = useMemo(() => {
    if (!data) return { rows: [], totalObs: 0, totalFc: 0, maxStation: null };
    let acc = 0;
    let maxS = null;
    const obs = data.observed.map((d) => {
      acc += d.mm;
      if (d.max_mm != null && (maxS == null || d.max_mm > maxS)) maxS = d.max_mm; // trạm mưa lớn nhất trong giờ
      return { t: new Date(d.time).getTime(), mm: d.mm, max: d.max_mm, cum: Math.round(acc * 10) / 10, forecast: false };
    });
    let accF = acc;
    let fcSum = 0;
    const fc = data.nowcast.map((d, i) => {
      accF += d.mm;
      fcSum += d.mm;
      return { t: new Date(d.time).getTime(), mm: d.mm, max: d.max_mm, cumF: Math.round(accF * 10) / 10, forecast: true, i };
    });
    if (obs.length && fc.length) obs[obs.length - 1].cumF = obs[obs.length - 1].cum;
    return {
      rows: [...obs, ...fc],
      totalObs: obs.length ? Math.round(acc * 10) / 10 : null,
      totalFc: Math.round(fcSum * 10) / 10,
      maxStation: maxS,
    };
  }, [data]);

  if (!data) {
    return isError ? <ErrorState height={height} onRetry={refetch}>Không tải được số đo mưa</ErrorState> : <Skeleton height={height} />;
  }
  if (!rows.length) {
    return (
      <EmptyState height={height}>
        Chưa có số đo mưa 24 giờ qua trong vùng đang xem (chưa có trạm đo mưa hoặc trạm chưa gửi số đo)
      </EmptyState>
    );
  }
  const nowT = rows.find((r) => r.forecast)?.t;
  const tooltipLabel = (l) => new Date(l).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-1.5">
        <Legend
          items={[
            { label: 'Mưa giờ – thực đo', color: c.s1 },
            { label: 'Dự báo mô hình 3 giờ tới', color: c.s2 },
            { label: 'Tích lũy', color: c.s1, line: true },
            { label: 'Tích lũy dự báo', color: c.s2, dashed: true },
          ]}
        />
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-muted">
            Tổng 24h: <b className="font-mono font-bold text-ink">{totalObs == null ? 'chưa có số đo' : `${num(totalObs, 1)} mm`}</b>
          </span>
          {maxStation > 0 && (
            <span className="hidden text-muted sm:inline">
              Giờ mưa lớn nhất (trạm): <b className="font-mono font-bold text-ink">{num(maxStation, 1)} mm</b>
            </span>
          )}
          {totalFc > 0 && (
            <span className="inline-flex items-center gap-1 rounded border border-line bg-panel2 px-2 py-0.5 font-medium text-ink-2">
              <span>3 giờ tới (mô hình):</span>
              <b className="font-mono font-bold">+{num(totalFc, 1)} mm</b>
            </span>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={height * 0.58}>
        <BarChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: -12 }} barCategoryGap={2}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="t" tickFormatter={hourLabel} minTickGap={40} {...axisProps(c)} />
          <YAxis width={44} {...axisProps(c)} label={{ value: 'mm/h', angle: -90, position: 'insideLeft', fill: c.axis, fontSize: 10, dx: 14 }} />
          <Tooltip
            cursor={{ fill: c.grid, opacity: 0.4 }}
            content={<ChartTooltip labelFormatter={(l, p) => `${tooltipLabel(l)}${p?.[0]?.payload?.forecast ? ' · dự báo mô hình' : ' · thực đo'}`} unit=" mm" />}
          />
          {nowT && <ReferenceLine x={nowT} stroke={c.muted} strokeDasharray="2 4" label={{ value: 'Hiện tại', fill: c.muted, fontSize: 10, position: 'top' }} />}
          <Bar dataKey="mm" name="Mưa TB các trạm" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell
                key={r.t}
                fill={r.forecast ? c.s2 : c.s1}
                fillOpacity={r.forecast ? 0.55 : 1}
                stroke={r.forecast ? c.s2 : 'none'}
                strokeDasharray={r.forecast ? '3 2' : undefined}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <ResponsiveContainer width="100%" height={height * 0.36}>
        <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="t" tickFormatter={hourLabel} minTickGap={40} {...axisProps(c)} hide />
          <YAxis width={44} {...axisProps(c)} label={{ value: 'mm', angle: -90, position: 'insideLeft', fill: c.axis, fontSize: 10, dx: 14 }} />
          <Tooltip content={<ChartTooltip labelFormatter={tooltipLabel} unit=" mm" />} cursor={{ stroke: c.axis, strokeDasharray: '3 3' }} />
          <Line dataKey="cum" name="Tích lũy" stroke={c.s1} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="cumF" name="Tích lũy dự báo" stroke={c.s2} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
