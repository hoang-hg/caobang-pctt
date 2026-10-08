import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Area, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { api } from '../../api/client';
import { dateTime, hourLabel, num } from '../../utils/format';
import { alarmLevel, ALARM } from '../../utils/labels';
import { axisProps, ChartTooltip, Legend, useChartTheme } from './chartTheme';

// Số đo theo giờ (time_bucket 60 phút): giờ gần nhất cũ hơn 2 giờ → trạm không còn gửi số đo, không hiện như "hiện tại"
const STALE_BUCKET_MS = 2 * 3600e3;
const bdLabel = (name, v) => `${name} (${v != null ? `${num(v, 2)} m` : 'chưa khai báo'})`;

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

  const { rows, thr, domain, fcLabel, latest } = useMemo(() => {
    if (!data) return { rows: [], thr: {}, domain: [0, 1], fcLabel: null, latest: null };
    const obs = data.observed.map((d) => ({ t: new Date(d.time).getTime(), obs: d.value }));
    const lastObs = obs[obs.length - 1];
    const kttv = data.forecast.filter((d) => d.model === 'KTTV');
    const source = kttv.length ? kttv : data.forecast.filter((d) => d.model === 'HEC-HMS');
    const fc = source.map((d) => ({ t: new Date(d.time).getTime(), fc: d.value }));
    const issued = kttv[0]?.issued_at && new Date(kttv[0].issued_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
    // Đường "HEC-HMS" chỉ do bộ mô phỏng sinh (hệ thống không chạy mô hình thuỷ văn) → luôn ghi "mô phỏng"
    const label = kttv.length ? `Dự báo KTTV (phát hành ${issued})` : source.length ? 'Dự báo mô phỏng' : null;
    if (lastObs && fc.length) fc.unshift({ t: lastObs.t, fc: lastObs.obs }); // nối liền thực đo → dự báo
    const merged = [...obs, ...fc].sort((a, b) => a.t - b.t);
    const t = data.station.thresholds || {};
    const values = merged.flatMap((r) => [r.obs, r.fc]).filter((x) => x != null);
    const lo = Math.min(...values, t.bd1 ?? Infinity) - 0.4;
    const hi = Math.max(...values, t.bd3 ?? -Infinity) + 0.4;
    return {
      rows: merged,
      thr: t,
      domain: [Math.floor(lo * 2) / 2, Math.ceil(hi * 2) / 2],
      fcLabel: label,
      latest: lastObs?.obs != null
        ? { value: lastObs.obs, t: lastObs.t, level: alarmLevel(lastObs.obs, t), stale: Date.now() - lastObs.t > STALE_BUCKET_MS }
        : null,
    };
  }, [data]);

  if (!data) return <div style={{ height }} className="animate-pulse rounded-lg bg-panel2" />;
  if (!rows.length) {
    // Chỉ dùng ngưỡng ĐÃ khai báo — trạm mới nhập có thể mới có 1–2 ngưỡng (README 2.4: được để trống tạm)
    const declared = [['BĐ I', thr.bd1], ['BĐ II', thr.bd2], ['BĐ III', thr.bd3]].filter(([, v]) => v != null);
    if (!declared.length) {
      return (
        <div style={{ height }} className="flex items-center justify-center rounded-lg border border-dashed border-line px-4 text-center text-xs text-muted">
          {data.station?.name || 'Trạm'} chưa có số đo trong {hours} giờ qua và chưa có bản tin dự báo
        </div>
      );
    }
    const nowT = Date.now();
    const emptyRows = [-24, -12, 0, 12, 24].map((h) => ({ t: nowT + h * 3600e3 }));
    const lo = Math.min(...declared.map(([, v]) => v)) - 1;
    const hi = Math.max(...declared.map(([, v]) => v)) + 1;
    return (
      <div className="flex flex-col gap-1.5">
        {!compact && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-1.5">
            <Legend
              items={[
                { label: 'Thực đo (chưa có)', color: c.muted, line: true },
                { label: 'Dự báo (chưa có)', color: c.muted, dashed: true },
                { label: bdLabel('BĐ I', thr.bd1), color: c.warn, line: true },
                { label: bdLabel('BĐ II', thr.bd2), color: c.serious, line: true },
                { label: bdLabel('BĐ III', thr.bd3), color: c.danger, line: true },
              ]}
            />
            <span className="chip bg-panel2 text-[10px] text-muted">Chờ tín hiệu trạm đo</span>
          </div>
        )}
        <div className="relative">
          <ResponsiveContainer width="100%" height={height}>
            <ComposedChart data={emptyRows} margin={{ top: 8, right: compact ? 8 : 48, bottom: 0, left: -12 }}>
              <CartesianGrid stroke={c.grid} vertical={false} />
              <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={hourLabel} {...axisProps(c)} />
              <YAxis domain={[Math.floor(lo), Math.ceil(hi)]} tickFormatter={(v) => num(v, 1)} {...axisProps(c)} unit=" m" width={44} />
              {thr.bd1 != null && <ReferenceLine y={thr.bd1} stroke={c.warn} strokeWidth={1.5} label={compact ? undefined : { value: `BĐ I ${num(thr.bd1, 2)} m`, fill: c.warn, position: 'right', fontSize: 10 }} />}
              {thr.bd2 != null && <ReferenceLine y={thr.bd2} stroke={c.serious} strokeWidth={1.5} label={compact ? undefined : { value: `BĐ II ${num(thr.bd2, 2)} m`, fill: c.serious, position: 'right', fontSize: 10 }} />}
              {thr.bd3 != null && <ReferenceLine y={thr.bd3} stroke={c.danger} strokeWidth={1.5} label={compact ? undefined : { value: `BĐ III ${num(thr.bd3, 2)} m`, fill: c.danger, position: 'right', fontSize: 10 }} />}
            </ComposedChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
            <div className="rounded-lg border border-line bg-panel/90 px-3 py-2 text-center text-xs text-muted shadow backdrop-blur">
              {data.station?.name || 'Trạm'} chưa có số đo trong {hours} giờ qua · Đã khai báo{' '}
              {declared.map(([name]) => name).join(', ')}
              {declared.length < 3 && ' (chưa đủ 3 ngưỡng báo động)'}
            </div>
          </div>
        </div>
      </div>
    );
  }
  const now = Date.now();

  return (
    <div className="flex flex-col gap-1.5">
      {!compact && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-1.5">
          <Legend
            items={[
              { label: 'Thực đo', color: c.s1, line: true },
              fcLabel ? { label: fcLabel, color: c.s2, dashed: true } : { label: 'Chưa có bản tin dự báo', color: c.muted, dashed: true },
              { label: bdLabel('BĐ I', thr.bd1), color: c.warn, line: true },
              { label: bdLabel('BĐ II', thr.bd2), color: c.serious, line: true },
              { label: bdLabel('BĐ III', thr.bd3), color: c.danger, line: true },
            ]}
          />
          {latest && (
            // Số đo cũ vẫn giữ cấp đã vượt (mất tín hiệu không xoá được nguy cơ đã biết) nhưng không gọi là "hiện tại"
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted">
                {latest.stale ? `Số đo cuối (${dateTime(latest.t)})` : `TB giờ ${hourLabel(latest.t)}`}:{' '}
                <b className={latest.stale ? 'font-mono text-muted' : 'font-mono text-sm text-ink'}>{num(latest.value, 2)} m</b>
              </span>
              <span
                className={`chip px-2 py-0 text-[10px] ${latest.stale && !latest.level ? 'bg-panel2 text-muted' : ALARM[latest.level].cls}`}
              >
                {latest.stale && !latest.level ? 'Mất tín hiệu' : `${ALARM[latest.level].label}${latest.stale ? ' (cũ)' : ''}`}
              </span>
            </div>
          )}
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={rows} margin={{ top: 8, right: compact ? 8 : 48, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="hydroObsGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={c.s1} stopOpacity={0.4} />
              <stop offset="95%" stopColor={c.s1} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={c.grid} vertical={false} />
          {/* Tô vùng giữa các mốc báo động */}
          {thr.bd1 != null && <ReferenceArea y1={thr.bd1} y2={thr.bd2} fill={c.warn} fillOpacity={0.08} ifOverflow="hidden" />}
          {thr.bd2 != null && <ReferenceArea y1={thr.bd2} y2={thr.bd3} fill={c.serious} fillOpacity={0.12} ifOverflow="hidden" />}
          {thr.bd3 != null && <ReferenceArea y1={thr.bd3} y2={domain[1]} fill={c.danger} fillOpacity={0.15} ifOverflow="hidden" />}
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={hourLabel} minTickGap={40} {...axisProps(c)} />
          <YAxis domain={domain} width={52} tickFormatter={(v) => v.toFixed(1)} {...axisProps(c)} />
          <Tooltip
            content={<ChartTooltip unit=" m" labelFormatter={(l) => new Date(l).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })} />}
            cursor={{ stroke: c.axis, strokeDasharray: '3 3' }}
          />
          <ReferenceLine x={now} stroke={c.muted} strokeDasharray="2 4" label={compact ? undefined : { value: 'Hiện tại', fill: c.muted, fontSize: 10, position: 'insideTopLeft' }} />
          {thr.bd1 != null && <ReferenceLine y={thr.bd1} stroke={c.warn} strokeWidth={1.5} label={compact ? undefined : { value: `BĐ I ${thr.bd1}`, fill: c.warn, fontSize: 10, position: 'right' }} />}
          {thr.bd2 != null && <ReferenceLine y={thr.bd2} stroke={c.serious} strokeWidth={1.5} label={compact ? undefined : { value: `BĐ II ${thr.bd2}`, fill: c.serious, fontSize: 10, position: 'right' }} />}
          {thr.bd3 != null && <ReferenceLine y={thr.bd3} stroke={c.danger} strokeWidth={1.8} label={compact ? undefined : { value: `BĐ III ${thr.bd3}`, fill: c.danger, fontSize: 10, position: 'right' }} />}
          <Area dataKey="obs" name="Thực đo" stroke={c.s1} strokeWidth={2.5} fill="url(#hydroObsGrad)" dot={false} connectNulls isAnimationActive={false} />
          <Line dataKey="fc" name="Dự báo" stroke={c.s2} strokeWidth={2.2} strokeDasharray="6 4" dot={false} connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

