import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAreaQuery } from '../../api/hooks';
import { axisTimeLabel, dateTime, num } from '../../utils/format';
import { risk, RESERVOIR_LEVEL } from '../../utils/risk';
import { EmptyState, ErrorState, Skeleton } from '../common/ui';
import { axisProps, ChartTooltip, Legend, useChartTheme } from './chartTheme';

const HOURS = 48;
const PATH = '/dashboard/reservoir-operations';

/** Một màu cho mỗi hồ: màu chuỗi của theme trước, rồi các màu dễ phân biệt (không trùng thang rủi ro). */
const colorFor = (c, i) => [c.s1, c.s3, '#7c3aed', '#0d9488', '#be185d', '#64748b'][i % 6];
const tooltipTime = (l) => dateTime(l);

/**
 * Vận hành hồ chứa trên CÙNG SÔNG với trạm đang xem, đặt ngay dưới biểu đồ thủy văn (thiết kế A.3 "Hydrograph & Vận hành
 * hồ chứa"): lưu lượng xả từng hồ theo thời gian (bậc thang — đổi khi mở / đóng cửa xả), cùng trục thời gian (`xDomain`) và
 * con trỏ (`syncId`) với biểu đồ thủy văn → thấy hồ xả trước, nước sông lên sau. Không có hồ trên sông đó → không vẽ gì.
 * Số liệu: lịch sử vận hành (trực ban nhập theo báo cáo của hồ, nguồn tự động; bản trình diễn: bộ mô phỏng).
 */
export default function ReservoirOpsChart({ river, xDomain, xTicks, syncId, height = 150 }) {
  const c = useChartTheme();
  const q = useAreaQuery('reservoir-operations', PATH, { hours: HOURS, river }, { refetchInterval: 60_000, enabled: !!river });
  const { rows, list, hasData } = useMemo(() => {
    const res = q.data?.reservoirs || [];
    const byT = new Map();
    res.forEach((r) => r.series.forEach((p) => {
      const t = new Date(p.time).getTime();
      byT.set(t, { ...(byT.get(t) || { t }), [r.id]: p.outflow });
    }));
    return {
      rows: [...byT.values()].sort((a, b) => a.t - b.t),
      list: res,
      hasData: res.some((r) => r.series.length),
    };
  }, [q.data]);

  if (!river) return null;
  if (!q.data) {
    return q.isError
      ? <ErrorState height={80} onRetry={q.refetch}>Không tải được số liệu vận hành hồ chứa trên sông {river}</ErrorState>
      : <Skeleton height={height} />;
  }
  if (!list.length) return null; // không có hồ trên sông này trong vùng đang xem
  const now = Date.now();
  return (
    <div className="mt-2 flex flex-col gap-1 border-t border-line/60 pt-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-xs font-bold text-ink">Vận hành hồ chứa trên sông {river} — lưu lượng xả (m³/s)</h3>
        <Legend
          items={list.map((r, i) => ({
            label: `${r.name}${r.spill_gates ? ` · mở ${r.spill_gates_open ?? 0}/${r.spill_gates} cửa` : ''}`,
            color: colorFor(c, i),
            line: true,
          }))}
        />
      </div>
      {hasData ? (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={rows} syncId={syncId} syncMethod="value" margin={{ top: 6, right: 48, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={xDomain || ['dataMin', 'dataMax']}
              ticks={xTicks}
              allowDataOverflow
              tickFormatter={axisTimeLabel}
              minTickGap={40}
              {...axisProps(c)}
            />
            <YAxis width={52} tickFormatter={(v) => num(v, 0)} {...axisProps(c)} />
            <Tooltip content={<ChartTooltip unit=" m³/s" labelFormatter={tooltipTime} />} cursor={{ stroke: c.axis, strokeDasharray: '3 3' }} />
            <ReferenceLine x={now} stroke={c.muted} strokeDasharray="2 4" />
            {list.map((r, i) => (
              <Line
                key={r.id}
                dataKey={r.id}
                name={r.name}
                type="stepAfter"
                stroke={colorFor(c, i)}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <EmptyState height={70}>Chưa có số liệu vận hành của hồ trên sông {river} trong {HOURS} giờ qua</EmptyState>
      )}
    </div>
  );
}

/**
 * Diễn biến vận hành 48 giờ của MỘT hồ (thẻ hồ ở tab Hồ chứa của Tổng quan): mực nước so với MNDBT và Q đến / Q xả — hai
 * biểu đồ nhỏ cùng trục thời gian (không dùng 2 trục Y). Dùng chung truy vấn của cả vùng (một lượt gọi cho mọi thẻ).
 */
export function ReservoirHistory({ reservoir: r }) {
  const c = useChartTheme();
  const q = useAreaQuery('reservoir-operations', PATH, { hours: HOURS }, { refetchInterval: 60_000 });
  const series = useMemo(
    () => (q.data?.reservoirs.find((x) => x.id === r.id)?.series || []).map((p) => ({ ...p, t: new Date(p.time).getTime() })),
    [q.data, r.id],
  );
  if (!q.data) {
    return q.isError ? <ErrorState height={80} onRetry={q.refetch}>Không tải được diễn biến vận hành</ErrorState> : <Skeleton height={190} />;
  }
  if (!series.length) return <EmptyState height={70}>Chưa có số liệu vận hành trong {HOURS} giờ qua</EmptyState>;
  const domain = [series[0].t, Math.max(series[series.length - 1].t, Date.now())];
  const statusColor = risk(RESERVOIR_LEVEL[r.status_code] ?? null).hex;
  const syncId = `ho-${r.id}`;
  const x = (hide) => (
    <XAxis dataKey="t" type="number" scale="time" domain={domain} tickFormatter={axisTimeLabel} minTickGap={40} hide={hide} {...axisProps(c)} />
  );
  return (
    <div className="flex flex-col gap-1 text-[11px]">
      <div className="text-muted">Mực nước hồ (m) · MNDBT {num(r.normal_level, 2)} m</div>
      <ResponsiveContainer width="100%" height={90}>
        <LineChart data={series} syncId={syncId} syncMethod="value" margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          {x(true)}
          <YAxis width={50} domain={['auto', 'auto']} tickFormatter={(v) => num(v, 1)} {...axisProps(c)} />
          <Tooltip content={<ChartTooltip unit=" m" labelFormatter={tooltipTime} />} />
          {r.normal_level != null && <ReferenceLine y={r.normal_level} stroke={c.serious} strokeDasharray="4 3" ifOverflow="extendDomain" />}
          <Line dataKey="level" name="Mực nước" type="stepAfter" stroke={statusColor || c.s1} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap items-center justify-between gap-2 text-muted">
        <span>Lưu lượng (m³/s)</span>
        <Legend items={[{ label: 'Q đến', color: c.s3, line: true }, { label: 'Q xả', color: c.s1, line: true }]} />
      </div>
      <ResponsiveContainer width="100%" height={100}>
        <LineChart data={series} syncId={syncId} syncMethod="value" margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          {x(false)}
          <YAxis width={50} tickFormatter={(v) => num(v, 0)} {...axisProps(c)} />
          <Tooltip content={<ChartTooltip unit=" m³/s" labelFormatter={tooltipTime} />} />
          <Line dataKey="inflow" name="Q đến" type="stepAfter" stroke={c.s3} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          <Line dataKey="outflow" name="Q xả" type="stepAfter" stroke={c.s1} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
