import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Area, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { api } from '../../api/client';
import { hourLabel } from '../../utils/format';
import { axisProps, ChartTooltip, Legend, useChartTheme } from './chartTheme';

/** Biểu đồ thủy văn: mực nước thực đo (liền) + dự báo (nét đứt) + vạch Báo động I/II/III.
 * Dự báo = bản tin KTTV do trực ban nhập (Dashboard → "Nhập bản tin dự báo"); chưa có bản tin → dự báo mô phỏng
 * (chỉ có khi bật bộ mô phỏng), không có cả hai → chỉ vẽ thực đo và ghi rõ chưa có bản tin. */
export default function Hydrograph({ stationId, height = 260, hours = 48, compact = false }) {
  const c = useChartTheme();
  const { data } = useQuery({
    queryKey: ['series', stationId, hours],
    queryFn: () => api(`/stations/${stationId}/series`, { params: { hours } }),
    enabled: !!stationId,
    refetchInterval: 60_000,
  });

  const { rows, thr, domain, fcLabel } = useMemo(() => {
    if (!data) return { rows: [], thr: {}, domain: [0, 1], fcLabel: null };
    const obs = data.observed.map((d) => ({ t: new Date(d.time).getTime(), obs: d.value }));
    const lastObs = obs[obs.length - 1];
    const kttv = data.forecast.filter((d) => d.model === 'KTTV');
    const source = kttv.length ? kttv : data.forecast.filter((d) => d.model === 'HEC-HMS');
    const fc = source.map((d) => ({ t: new Date(d.time).getTime(), fc: d.value }));
    const issued = kttv[0]?.issued_at && new Date(kttv[0].issued_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
    const label = kttv.length ? `Dự báo KTTV (phát hành ${issued})` : source.length ? 'Dự báo mô phỏng' : null;
    if (lastObs && fc.length) fc.unshift({ t: lastObs.t, fc: lastObs.obs }); // nối liền thực đo → dự báo
    const merged = [...obs, ...fc].sort((a, b) => a.t - b.t);
    const t = data.station.thresholds || {};
    const values = merged.flatMap((r) => [r.obs, r.fc]).filter((x) => x != null);
    const lo = Math.min(...values, t.bd1 ?? Infinity) - 0.4;
    const hi = Math.max(...values, t.bd3 ?? -Infinity) + 0.4;
    return { rows: merged, thr: t, domain: [Math.floor(lo * 2) / 2, Math.ceil(hi * 2) / 2], fcLabel: label };
  }, [data]);

  if (!data) return <div style={{ height }} className="animate-pulse rounded-lg bg-panel2" />;
  const now = Date.now();

  return (
    <div>
      {!compact && (
        <div className="mb-1">
          <Legend
            items={[
              { label: 'Thực đo', color: c.s1, line: true },
              fcLabel ? { label: fcLabel, color: c.s2, dashed: true } : { label: 'Chưa có bản tin dự báo', color: c.muted, dashed: true },
              { label: 'BĐ I', color: c.warn, line: true },
              { label: 'BĐ II', color: c.serious, line: true },
              { label: 'BĐ III', color: c.danger, line: true },
            ]}
          />
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={rows} margin={{ top: 8, right: compact ? 8 : 48, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          {/* Tô vùng giữa các mốc báo động */}
          {thr.bd1 != null && <ReferenceArea y1={thr.bd1} y2={thr.bd2} fill={c.warn} fillOpacity={0.08} ifOverflow="hidden" />}
          {thr.bd2 != null && <ReferenceArea y1={thr.bd2} y2={thr.bd3} fill={c.serious} fillOpacity={0.1} ifOverflow="hidden" />}
          {thr.bd3 != null && <ReferenceArea y1={thr.bd3} y2={domain[1]} fill={c.danger} fillOpacity={0.1} ifOverflow="hidden" />}
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={hourLabel} minTickGap={40} {...axisProps(c)} />
          <YAxis domain={domain} width={52} tickFormatter={(v) => v.toFixed(1)} {...axisProps(c)} />
          <Tooltip
            content={<ChartTooltip unit=" m" labelFormatter={(l) => new Date(l).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })} />}
            cursor={{ stroke: c.axis, strokeDasharray: '3 3' }}
          />
          <ReferenceLine x={now} stroke={c.muted} strokeDasharray="2 4" label={compact ? undefined : { value: 'Hiện tại', fill: c.muted, fontSize: 10, position: 'insideTopLeft' }} />
          {thr.bd1 != null && <ReferenceLine y={thr.bd1} stroke={c.warn} strokeWidth={1.5} label={compact ? undefined : { value: `BĐ I ${thr.bd1}`, fill: c.muted, fontSize: 10, position: 'right' }} />}
          {thr.bd2 != null && <ReferenceLine y={thr.bd2} stroke={c.serious} strokeWidth={1.5} label={compact ? undefined : { value: `BĐ II ${thr.bd2}`, fill: c.muted, fontSize: 10, position: 'right' }} />}
          {thr.bd3 != null && <ReferenceLine y={thr.bd3} stroke={c.danger} strokeWidth={1.5} label={compact ? undefined : { value: `BĐ III ${thr.bd3}`, fill: c.muted, fontSize: 10, position: 'right' }} />}
          <Area dataKey="obs" name="Thực đo" stroke={c.s1} strokeWidth={2} fill={c.s1} fillOpacity={0.12} dot={false} connectNulls isAnimationActive={false} />
          <Line dataKey="fc" name="Dự báo" stroke={c.s2} strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
