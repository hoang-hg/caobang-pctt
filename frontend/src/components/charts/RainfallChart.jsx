import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAreaQuery } from '../../api/hooks';
import { hourLabel } from '../../utils/format';
import { axisProps, ChartTooltip, Legend, useChartTheme } from './chartTheme';

/** Mưa theo giờ (cột) + mưa tích lũy (đường) — 2 biểu đồ chung trục thời gian, KHÔNG dùng 2 trục Y.
 *  Phần 3 giờ tới (QPF nowcast) vẽ nhạt/nét đứt. */
export default function RainfallChart({ height = 250 }) {
  const c = useChartTheme();
  const { data } = useAreaQuery('rainfall', '/dashboard/rainfall', {}, { refetchInterval: 60_000 });

  const rows = useMemo(() => {
    if (!data) return [];
    let acc = 0;
    const obs = data.observed.map((d) => {
      acc += d.mm;
      return { t: new Date(d.time).getTime(), mm: d.mm, max: d.max_mm, cum: Math.round(acc * 10) / 10, forecast: false };
    });
    let accF = acc;
    const fc = data.nowcast.map((d, i) => {
      accF += d.mm;
      return { t: new Date(d.time).getTime(), mm: d.mm, max: d.max_mm, cumF: Math.round(accF * 10) / 10, forecast: true, i };
    });
    if (obs.length && fc.length) obs[obs.length - 1].cumF = obs[obs.length - 1].cum;
    return [...obs, ...fc];
  }, [data]);

  if (!data) return <div style={{ height }} className="animate-pulse rounded-lg bg-panel2" />;
  const nowT = rows.find((r) => r.forecast)?.t;
  const total = rows.filter((r) => !r.forecast).at(-1)?.cum ?? 0;
  const tooltipLabel = (l) => new Date(l).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <Legend
          items={[
            { label: 'Mưa giờ – thực đo', color: c.s1 },
            { label: 'Nowcast QPF 3h', color: c.s2 },
            { label: 'Tích lũy', color: c.s1, line: true },
            { label: 'Tích lũy dự báo', color: c.s2, dashed: true },
          ]}
        />
        <span className="text-xs text-muted">
          Tổng 24h: <b className="font-mono text-ink">{total.toLocaleString('vi-VN')} mm</b>
        </span>
      </div>
      <ResponsiveContainer width="100%" height={height * 0.58}>
        <BarChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: -12 }} barCategoryGap={2}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="t" tickFormatter={hourLabel} minTickGap={40} {...axisProps(c)} />
          <YAxis width={44} {...axisProps(c)} label={{ value: 'mm/h', angle: -90, position: 'insideLeft', fill: c.axis, fontSize: 10, dx: 14 }} />
          <Tooltip
            cursor={{ fill: c.grid, opacity: 0.4 }}
            content={<ChartTooltip labelFormatter={(l, p) => `${tooltipLabel(l)}${p?.[0]?.payload?.forecast ? ' · dự báo' : ''}`} unit=" mm" />}
          />
          {nowT && <ReferenceLine x={nowT} stroke={c.muted} strokeDasharray="2 4" />}
          <Bar dataKey="mm" name="Mưa TB vùng" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.t} fill={r.forecast ? c.s2 : c.s1} fillOpacity={r.forecast ? 0.55 : 1} stroke={r.forecast ? c.s2 : 'none'} strokeDasharray={r.forecast ? '3 2' : undefined} />
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
