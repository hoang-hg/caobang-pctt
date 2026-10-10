import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../api/client';
import { useAreaQuery } from '../../api/hooks';
import { usePermission } from '../../rbac/usePermission';
import { EmptyState, ErrorState, Skeleton } from '../common/ui';
import { axisProps, Legend, useChartTheme } from './chartTheme';

const fmtTime = (t) => new Date(t).toLocaleString('vi-VN', { hour: '2-digit', day: '2-digit', month: '2-digit' });

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="card px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold">{fmtTime(d.t)}</div>
      <div>Kết hợp P50: <b className="font-mono">{d.p50} mm/h</b></div>
      <div className="text-muted">Khoảng P10–P90: {d.p10} – {d.p90} mm/h</div>
      {d.ecmwf != null && <div>ECMWF P50: <span className="font-mono">{d.ecmwf}</span> · GFS P50: <span className="font-mono">{d.gfs ?? '–'}</span></div>}
      {d.prob != null && <div>Xác suất mưa ≥ 5 mm/h: <b className="font-mono">{Math.round(d.prob * 100)}%</b></div>}
      {d.temp != null && <div className="text-muted">Nhiệt độ {d.temp}°C · gió giật {d.gust} km/h</div>}
    </div>
  );
}

/** Dự báo mưa 72 giờ theo xã: dải tin cậy P10–P90 (tổ hợp ECMWF + GFS), đường P50, P50 từng mô hình. */
export default function AreaForecastChart({ height = 250 }) {
  const c = useChartTheme();
  const areasQ = useAreaQuery('forecast-areas', '/forecast/areas', { hours: 72 }, { refetchInterval: 10 * 60_000 });
  const areas = useMemo(() => areasQ.data || [], [areasQ.data]);
  const canSystem = usePermission('integration', 'view');
  const [code, setCode] = useState('');
  useEffect(() => {
    if (areas.length && !areas.some((a) => a.code === code)) setCode(areas[0].code);
  }, [areas, code]);
  const { data, isError, refetch } = useQuery({
    queryKey: ['forecast-series', code],
    queryFn: () => api(`/forecast/areas/${code}`),
    enabled: !!code,
    refetchInterval: 10 * 60_000,
  });

  const rows = useMemo(() => {
    const blend = data?.series?.BLEND || [];
    const idx = (list) => Object.fromEntries((list || []).map((r) => [r.time, r.precip_p50]));
    const ec = idx(data?.series?.ECMWF_ENS);
    const gf = idx(data?.series?.GFS_ENS);
    return blend.map((r) => ({
      t: new Date(r.time).getTime(),
      band: [r.precip_p10, r.precip_p90],
      p10: r.precip_p10, p50: r.precip_p50, p90: r.precip_p90,
      ecmwf: ec[r.time], gfs: gf[r.time], prob: r.prob_heavy, temp: r.temp_c, gust: r.gust_kmh,
    }));
  }, [data]);

  if (!areasQ.data) {
    return areasQ.isError
      ? <ErrorState height={height} onRetry={areasQ.refetch}>Không tải được dự báo mưa theo xã</ErrorState>
      : <Skeleton height={height} />;
  }
  if (!areas.length) {
    return (
      <EmptyState height={height}>
        Chưa có dữ liệu dự báo mưa theo xã — nguồn dự báo Open-Meteo chưa chạy
        {canSystem ? <> · <Link to="/nguon-du-lieu" className="font-semibold text-accent hover:underline">Kiểm tra nguồn dữ liệu →</Link></> : ' (báo cấp tỉnh kiểm tra)'}
      </EmptyState>
    );
  }
  const sel = areas.find((a) => a.code === code);
  const series = data
    ? null
    : isError
      ? <ErrorState height={height} onRetry={refetch}>Không tải được dự báo của xã đã chọn</ErrorState>
      : <Skeleton height={height} />;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-1.5">
        <div className="flex items-center gap-2">
          <select
            className="input tap w-auto py-1 px-2.5 text-xs border border-line bg-panel2 font-semibold text-ink rounded-lg focus:border-accent"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-label="Chọn xã"
          >
            {areas.map((a) => (
              <option key={a.code} value={a.code}>
                {a.name} — {a.p50} mm (P90 {a.p90})
              </option>
            ))}
          </select>
        </div>
        {sel && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted">
              Tổng 72h: <b className="font-mono text-ink font-bold">{sel.p50} mm</b>
            </span>
            <span className="inline-flex items-center gap-1 rounded bg-accent/15 px-2 py-0.5 font-medium text-accent border border-accent/25">
              <span>Khoảng P10–P90:</span>
              <b className="font-mono font-bold">{sel.p10} – {sel.p90} mm</b>
            </span>
          </div>
        )}
      </div>
      <Legend items={[
        { label: 'Khoảng P10–P90', color: c.s1 },
        { label: 'Kết hợp P50', color: c.s1, line: true },
        { label: 'ECMWF P50', color: c.s2, dashed: true },
        { label: 'GFS P50', color: c.s3, dashed: true },
      ]} />
      {series || (
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={fmtTime} minTickGap={50} {...axisProps(c)} />
            <YAxis width={44} {...axisProps(c)} label={{ value: 'mm/h', angle: -90, position: 'insideLeft', fill: c.axis, fontSize: 10, dx: 14 }} />
            <Tooltip content={<Tip />} cursor={{ stroke: c.axis, strokeDasharray: '3 3' }} />
            <Area dataKey="band" stroke="none" fill={c.s1} fillOpacity={0.18} isAnimationActive={false} />
            <Line dataKey="p50" stroke={c.s1} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="ecmwf" stroke={c.s2} strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            <Line dataKey="gfs" stroke={c.s3} strokeWidth={1.5} strokeDasharray="2 3" dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
      <div className="mt-1 text-[11px] text-muted">
        Nguồn: Open-Meteo · ECMWF IFS ({data?.series?.ECMWF_ENS?.[0]?.members || 51} thành phần) + NOAA GEFS ({data?.series?.GFS_ENS?.[0]?.members || 31}) ·
        phát hành {sel?.issued_at ? new Date(sel.issued_at).toLocaleString('vi-VN') : '–'}
      </div>
    </div>
  );
}
