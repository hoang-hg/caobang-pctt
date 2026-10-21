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
      <div>Khả năng nhất: <b className="num">{d.p50} mm/giờ</b></div>
      <div className="text-muted">Khoảng có thể xảy ra: {d.p10} – {d.p90} mm/giờ</div>
      {d.ecmwf != null && <div>Mô hình châu Âu: <span className="num">{d.ecmwf}</span> · mô hình Mỹ: <span className="num">{d.gfs ?? '–'}</span></div>}
      {d.prob != null && <div>Khả năng mưa từ 5 mm/giờ: <b className="num">{Math.round(d.prob * 100)}%</b></div>}
      {d.temp != null && <div className="text-muted">Nhiệt độ {d.temp}°C · gió giật {d.gust} km/h</div>}
    </div>
  );
}

/** Dự báo mưa 3 ngày theo xã: vùng "khoảng có thể xảy ra" (phân vị 10–90 của tổ hợp ECMWF + GFS), đường "khả năng nhất"
 * (trung vị), trung vị từng mô hình (ghi "mô hình châu Âu / Mỹ" — tên mô hình chỉ ở nút "?" và dòng nguồn). */
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
        Chưa có dữ liệu dự báo mưa theo xã — nguồn dự báo thời tiết chưa chạy
        {canSystem ? <> · <Link to="/nguon-du-lieu" className="touch-hit font-semibold text-accent hover:underline">Kiểm tra nguồn dữ liệu →</Link></> : ' (báo cấp tỉnh kiểm tra)'}
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
        {/* Ô chọn rộng theo dòng dài nhất ("<xã> — khoảng … mm (có thể tới … mm)", dài ngắn theo số dự báo) → giới hạn trong
            khung, không đẩy trang tràn ngang ở 360 px */}
        <div className="flex min-w-0 max-w-full items-center gap-2">
          <select
            className="input tap w-auto max-w-full py-1 px-2.5 text-xs border border-line bg-panel2 font-semibold text-ink rounded-lg focus:border-accent"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-label="Chọn xã"
          >
            {areas.map((a) => (
              <option key={a.code} value={a.code}>
                {a.name} — khoảng {a.p50} mm (có thể tới {a.p90} mm)
              </option>
            ))}
          </select>
        </div>
        {sel && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted">
              Tổng 3 ngày: <b className="num font-bold text-ink">{sel.p50} mm</b> · có thể từ {sel.p10} đến {sel.p90} mm
            </span>
          </div>
        )}
      </div>
      <Legend items={[
        { label: 'Khoảng có thể xảy ra', color: c.s1 },
        { label: 'Khả năng nhất', color: c.s1, line: true },
        { label: 'Mô hình châu Âu', color: c.s2, dashed: true },
        { label: 'Mô hình Mỹ', color: c.s3, dashed: true },
      ]} />
      {series || (
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={fmtTime} minTickGap={50} {...axisProps(c)} />
            <YAxis width={44} {...axisProps(c)} label={{ value: 'mm/giờ', angle: -90, position: 'insideLeft', fill: c.axis, fontSize: 10, dx: 14 }} />
            <Tooltip content={<Tip />} cursor={{ stroke: c.axis, strokeDasharray: '3 3' }} />
            <Area dataKey="band" stroke="none" fill={c.s1} fillOpacity={0.18} isAnimationActive={false} />
            <Line dataKey="p50" stroke={c.s1} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="ecmwf" stroke={c.s2} strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            <Line dataKey="gfs" stroke={c.s3} strokeWidth={1.5} strokeDasharray="2 3" dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
      <div className="mt-1 text-xs text-muted">
        Dự báo phát hành {sel?.issued_at ? new Date(sel.issued_at).toLocaleString('vi-VN') : '–'} · tổ hợp {(data?.series?.ECMWF_ENS?.[0]?.members || 51) + (data?.series?.GFS_ENS?.[0]?.members || 31)} phương án dự báo quốc tế
      </div>
    </div>
  );
}
