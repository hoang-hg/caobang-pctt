import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { api } from '../../api/client';
import { axisTimeLabel, dateTime, hourLabel, num } from '../../utils/format';
import { alarmLevel, ALARM } from '../../utils/labels';
import { risk } from '../../utils/risk';
import { etaWhen, STALE_MS, trendProps, waterTrend } from '../../utils/stations';
import { EmptyState, ErrorState, Skeleton, TrendTag } from '../common/ui';
import { axisProps, ChartTooltip, Legend, useChartTheme } from './chartTheme';

// Số đo theo giờ (time_bucket 60 phút): giờ gần nhất cũ hơn 2 giờ → trạm không còn gửi số đo, không hiện như "hiện tại"
const STALE_BUCKET_MS = 2 * 3600e3;
const bdLabel = (name, v) => `${name} (${v != null ? `${num(v, 2)} m` : 'chưa khai báo'})`;
const ROMAN = ['', 'I', 'II', 'III'];

/**
 * Phần VƯỢT báo động của một đường (thiết kế A.3: "khu vực diện tích giữa đường hiện tại và vạch báo động được tô màu cảnh
 * báo tương ứng"): chèn điểm cắt chính xác nơi đường đi qua mỗi vạch (nội suy tuyến tính) rồi, với mỗi mức L, thêm khoảng
 * [vạch L, min(giá trị, vạch kế tiếp)] khi giá trị đã tới vạch L — vùng tô bám đúng đường. `key` = 'obs' | 'fc'; điểm cắt
 * chỉ mang `cut…` (không mang obs / fc) nên đường và chú thích khi rê chuột không đổi.
 */
function exceedance(points, key, levels, suffix) {
  const cut = `cut${suffix}`;
  const out = [];
  points.forEach((p, i) => {
    out.push(p);
    const q = points[i + 1];
    if (!q || p[key] == null || q[key] == null) return;
    levels
      .filter(({ v }) => (p[key] - v) * (q[key] - v) < 0)
      .map(({ v }) => ({ t: p.t + ((v - p[key]) / (q[key] - p[key])) * (q.t - p.t), [cut]: v }))
      .sort((a, b) => a.t - b.t)
      .forEach((x) => out.push(x));
  });
  return out.map((p) => {
    const v = p[key] ?? p[cut];
    if (v == null) return p;
    const bands = {};
    levels.forEach(({ lv, v: lo }, i) => {
      const hi = levels[i + 1]?.v;
      bands[`x${lv}${suffix}`] = v >= lo ? [lo, hi == null ? v : Math.min(v, hi)] : null;
    });
    return { ...p, ...bands };
  });
}

/**
 * Mức báo động kế tiếp trên số đo hiện tại và lúc đường dự báo (đúng đường đang vẽ) chạm mức đó — cùng cách backend
 * /stations tính eta_time. Không chạm trong khung dự báo → đỉnh dự báo. null: đã trên BĐ III, chưa khai báo ngưỡng
 * hoặc chưa có dự báo cho thời gian tới.
 */
function forecastNext(value, thr, ahead) {
  const level = [1, 2, 3].find((lv) => thr[`bd${lv}`] != null && thr[`bd${lv}`] > value);
  if (!level || !ahead.length) return null;
  const hit = ahead.find((d) => d.fc >= thr[`bd${level}`]);
  const peak = ahead.reduce((m, d) => (d.fc > m.fc ? d : m));
  return { level, hit, peak };
}

/** Biểu đồ thủy văn: mực nước thực đo (liền) + dự báo (nét đứt) + vạch Báo động I/II/III.
 * Dự báo = bản tin KTTV do trực ban nhập (Dashboard → "Nhập bản tin dự báo"); chưa có bản tin → dự báo mô phỏng
 * (chỉ có khi bật bộ mô phỏng), không có cả hai → chỉ vẽ thực đo và ghi rõ chưa có bản tin.
 * `station` (tuỳ chọn): dòng /stations của trạm — đầu biểu đồ dùng SỐ ĐO MỚI NHẤT thay cho TB giờ, để mức báo động, xu hướng
 * và dự báo khớp với ô KPI / bộ chọn trạm cùng trang (TB giờ trễ hơn: trạm đã qua BĐ II mà TB giờ còn dưới).
 * `children(xDomain, xTicks)`: vẽ thêm bên dưới, cùng trục thời gian và mốc giờ (VD vận hành hồ chứa cùng sông); `syncId`: đồng bộ con trỏ. */
export default function Hydrograph({ stationId, height = 260, hours = 48, compact = false, station, syncId, children }) {
  const c = useChartTheme();
  const { data, isError, refetch } = useQuery({
    queryKey: ['series', stationId, hours],
    queryFn: () => api(`/stations/${stationId}/series`, { params: { hours } }),
    enabled: !!stationId,
    refetchInterval: 60_000,
  });

  const { rows, thr, levels, exceeded, domain, fcLabel, simulated, fcAhead, hourly, hourlyTrend } = useMemo(() => {
    if (!data) {
      return { rows: [], thr: {}, levels: [], exceeded: false, domain: [0, 1], fcLabel: null, simulated: false, fcAhead: [], hourly: null, hourlyTrend: null };
    }
    const obs = data.observed.map((d) => ({ t: new Date(d.time).getTime(), obs: d.value }));
    const lastObs = obs[obs.length - 1];
    const prevObs = obs[obs.length - 2];
    const kttv = data.forecast.filter((d) => d.model === 'KTTV');
    const source = kttv.length ? kttv : data.forecast.filter((d) => d.model === 'HEC-HMS');
    const fc = source.map((d) => ({ t: new Date(d.time).getTime(), fc: d.value }));
    const nowT = Date.now();
    const ahead = fc.filter((d) => d.t > nowT);
    const issued = kttv[0]?.issued_at && new Date(kttv[0].issued_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
    // Đường "HEC-HMS" chỉ do bộ mô phỏng sinh (hệ thống không chạy mô hình thuỷ văn) → luôn ghi "mô phỏng"
    const label = kttv.length ? `Dự báo KTTV (phát hành ${issued})` : source.length ? 'Dự báo mô phỏng' : null;
    if (lastObs && fc.length) fc.unshift({ t: lastObs.t, fc: lastObs.obs }); // nối liền thực đo → dự báo
    const t = data.station.thresholds || {};
    // Vạch đã khai báo, từ thấp lên cao — mỗi khoảng giữa hai vạch tô màu của vạch dưới (BĐ I vàng, II cam, III đỏ)
    const lv = [1, 2, 3].map((n) => ({ lv: n, v: t[`bd${n}`] })).filter((x) => x.v != null).sort((a, b) => a.v - b.v);
    const merged = [...exceedance(obs, 'obs', lv, 'o'), ...exceedance(fc, 'fc', lv, 'f')].sort((a, b) => a.t - b.t);
    const values = merged.flatMap((r) => [r.obs, r.fc]).filter((x) => x != null);
    const lo = Math.min(...values, t.bd1 ?? Infinity) - 0.4;
    const hi = Math.max(...values, t.bd3 ?? -Infinity) + 0.4;
    return {
      rows: merged,
      thr: t,
      levels: lv,
      // Có vùng vượt thật (dày hơn 0) — đường chỉ chạm vạch thì không thêm chú giải
      exceeded: merged.some((r) => lv.some(({ lv: n }) => ['o', 'f'].some((sx) => r[`x${n}${sx}`]?.[1] > r[`x${n}${sx}`]?.[0]))),
      domain: [Math.floor(lo * 2) / 2, Math.ceil(hi * 2) / 2],
      fcLabel: label,
      simulated: !kttv.length,
      fcAhead: ahead,
      hourly: lastObs?.obs != null
        ? { value: lastObs.obs, t: lastObs.t, level: alarmLevel(lastObs.obs, t), stale: nowT - lastObs.t > STALE_BUCKET_MS }
        : null,
      // Xu hướng giữa 2 giờ đo gần nhất (TB giờ) — số đo cũ không nói lên / xuống
      hourlyTrend: lastObs?.obs != null && prevObs?.obs != null ? waterTrend(lastObs.obs, lastObs.t, prevObs.obs, prevObs.t, STALE_BUCKET_MS) : null,
    };
  }, [data]);

  if (!data) {
    return isError ? <ErrorState height={height} onRetry={refetch}>Không tải được số đo của trạm</ErrorState> : <Skeleton height={height} />;
  }
  if (!rows.length) {
    // Chỉ dùng ngưỡng ĐÃ khai báo — trạm mới nhập có thể mới có 1–2 ngưỡng (README 2.4: được để trống tạm)
    const declared = [['BĐ I', thr.bd1], ['BĐ II', thr.bd2], ['BĐ III', thr.bd3]].filter(([, v]) => v != null);
    if (!declared.length) {
      return (
        <EmptyState height={height}>
          {data.station?.name || 'Trạm'} chưa có số đo trong {hours} giờ qua và chưa có bản tin dự báo
        </EmptyState>
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
  const xDomain = [rows[0].t, rows[rows.length - 1].t]; // dùng chung với biểu đồ vẽ thêm bên dưới (children)
  // Mốc giờ chẵn theo giờ của máy (mỗi 6 / 12 giờ) — hai biểu đồ cùng nhãn, dễ dóng thẳng
  const tickStep = (xDomain[1] - xDomain[0] > 60 * 3600e3 ? 12 : 6) * 3600e3;
  const tz = new Date().getTimezoneOffset() * 60e3;
  const xTicks = [];
  for (let t = Math.ceil((xDomain[0] - tz) / tickStep) * tickStep + tz; t <= xDomain[1]; t += tickStep) xTicks.push(t);
  const reading = station?.value != null && station.time ? { value: Number(station.value), t: new Date(station.time).getTime() } : null;
  const latest = reading ? { ...reading, raw: true, level: alarmLevel(reading.value, thr), stale: now - reading.t > STALE_MS } : hourly;
  const trend = reading ? waterTrend(station.value, station.time, station.prev_value, station.prev_time) : hourlyTrend;
  const next = latest ? forecastNext(latest.value, thr, fcAhead) : null;

  return (
    <div className="flex flex-col gap-1.5">
      {!compact && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-1.5">
          <Legend
            items={[
              { label: 'Thực đo', color: c.s1, line: true },
              fcLabel ? { label: fcLabel, color: c.s2, dashed: true } : { label: 'Chưa có bản tin dự báo', color: c.muted, dashed: true },
              ...(exceeded ? [{ label: 'Phần vượt báo động (tô theo mức; dự báo tô nhạt)', color: c.serious }] : []),
              { label: bdLabel('BĐ I', thr.bd1), color: c.warn, line: true },
              { label: bdLabel('BĐ II', thr.bd2), color: c.serious, line: true },
              { label: bdLabel('BĐ III', thr.bd3), color: c.danger, line: true },
            ]}
          />
          {latest && (
            // Số đo cũ vẫn giữ cấp đã vượt (mất tín hiệu không xoá được nguy cơ đã biết) nhưng không gọi là "hiện tại"
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted">
                {latest.stale ? `Số đo cuối (${dateTime(latest.t)})` : `${latest.raw ? 'Số đo' : 'TB giờ'} ${hourLabel(latest.t)}`}:{' '}
                <b className={latest.stale ? 'font-mono text-muted' : 'font-mono text-sm text-ink'}>{num(latest.value, 2)} m</b>
              </span>
              <TrendTag {...trendProps(trend)} />
              <span
                className={`chip px-2 py-0 text-[10px] ${latest.stale && !latest.level ? 'bg-panel2 text-muted' : ALARM[latest.level].cls}`}
              >
                {latest.stale && !latest.level ? 'Mất tín hiệu' : `${ALARM[latest.level].label}${latest.stale ? ' (cũ)' : ''}`}
              </span>
            </div>
          )}
          {next && (
            // Dự báo vượt mức kế tiếp: luôn kèm nguồn (bản tin KTTV / mô phỏng) — mô phỏng không được trông như bản tin
            <p className="w-full text-xs text-muted">
              {next.hit ? (
                <b className={risk(next.level).text}>
                  Dự báo vượt BĐ {ROMAN[next.level]} ({num(thr[`bd${next.level}`], 2)} m) lúc {etaWhen(next.hit.t)}
                </b>
              ) : (
                <>
                  Dự báo chưa chạm BĐ {ROMAN[next.level]} — cao nhất <b className="font-mono text-ink">{num(next.peak.fc, 2)} m</b> lúc {etaWhen(next.peak.t)}
                </>
              )}
              {simulated ? ' · theo dự báo mô phỏng, không phải bản tin KTTV' : ' · theo bản tin KTTV'}
            </p>
          )}
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={rows} syncId={syncId} syncMethod="value" margin={{ top: 8, right: compact ? 8 : 48, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          {/* Phần vượt báo động: thực đo tô đậm, dự báo tô nhạt — không hiện trong chú thích khi rê chuột */}
          {['o', 'f'].flatMap((sfx) => levels.map(({ lv }) => (
            <Area
              key={`${sfx}${lv}`}
              dataKey={`x${lv}${sfx}`}
              stroke="none"
              fill={[null, c.warn, c.serious, c.danger][lv]}
              fillOpacity={sfx === 'o' ? 0.42 : 0.18}
              connectNulls={false}
              tooltipType="none"
              legendType="none"
              isAnimationActive={false}
            />
          )))}
          <XAxis dataKey="t" type="number" scale="time" domain={xDomain} ticks={xTicks} tickFormatter={axisTimeLabel} minTickGap={40} {...axisProps(c)} />
          <YAxis domain={domain} width={52} tickFormatter={(v) => v.toFixed(1)} {...axisProps(c)} />
          <Tooltip
            content={<ChartTooltip unit=" m" labelFormatter={(l) => new Date(l).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })} />}
            cursor={{ stroke: c.axis, strokeDasharray: '3 3' }}
          />
          <ReferenceLine x={now} stroke={c.muted} strokeDasharray="2 4" label={compact ? undefined : { value: 'Hiện tại', fill: c.muted, fontSize: 10, position: 'insideTopLeft' }} />
          {thr.bd1 != null && <ReferenceLine y={thr.bd1} stroke={c.warn} strokeWidth={1.5} label={compact ? undefined : { value: `BĐ I ${thr.bd1}`, fill: c.warn, fontSize: 10, position: 'right' }} />}
          {thr.bd2 != null && <ReferenceLine y={thr.bd2} stroke={c.serious} strokeWidth={1.5} label={compact ? undefined : { value: `BĐ II ${thr.bd2}`, fill: c.serious, fontSize: 10, position: 'right' }} />}
          {thr.bd3 != null && <ReferenceLine y={thr.bd3} stroke={c.danger} strokeWidth={1.8} label={compact ? undefined : { value: `BĐ III ${thr.bd3}`, fill: c.danger, fontSize: 10, position: 'right' }} />}
          <Line dataKey="obs" name="Thực đo" stroke={c.s1} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
          <Line dataKey="fc" name="Dự báo" stroke={c.s2} strokeWidth={2.2} strokeDasharray="6 4" dot={false} connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      {typeof children === 'function' && children(xDomain, xTicks)}
    </div>
  );
}

