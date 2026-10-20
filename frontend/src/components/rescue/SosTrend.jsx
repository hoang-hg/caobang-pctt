import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axisProps, Legend, useChartTheme } from '../charts/chartTheme';
import { EmptyState, ErrorState, Skeleton } from '../common/ui';
import { dur, responseStats, sosTrend, TREND_STEP } from './rescueFacts';

const hh = (ms) => `${String(new Date(ms).getHours()).padStart(2, '0')}h`;
const dm = (ms) => {
  const d = new Date(ms);
  return `${d.getDate()}/${d.getMonth() + 1}`;
};

/** Hộp chú thích một cột: khung giờ, số phiếu từng mức, tổng. Chữ màu chữ; ô màu bên cạnh mang nhận diện mức. */
function Tip({ active, payload, parts }) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  return (
    <div className="card px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-ink">{dm(b.start)} · {hh(b.start)}–{hh(b.start + TREND_STEP * 3600_000)}</div>
      {parts.map((p) => (
        <div key={p.key} className="flex items-center gap-2 py-0.5 text-ink-2">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} aria-hidden="true" />
          {p.label}
          <span className="ml-auto pl-3 font-mono font-semibold text-ink">{b[p.key]}</span>
        </div>
      ))}
      <div className="mt-1 border-t border-line/60 pt-1 text-muted">Tổng {b.total} phiếu</div>
    </div>
  );
}

/**
 * Diễn biến 48 giờ cho lãnh đạo (thiết kế D — nắm tình hình nhanh): phiếu SOS nhận theo khung 3 giờ, cột chồng theo mức ưu
 * tiên (một trục; Cấp 1 Đỏ ở đáy cho dễ so; màu thang rủi ro chung, luôn kèm chú giải + hộp chú thích; chỉ ghi số trên cột
 * cao nhất) và thời gian xử lý trung vị: tiếp nhận, có đội đi, đội đến nơi + tỉ lệ tiếp nhận trong SLA. Cùng danh sách phiếu
 * với bảng điều phối. Đang tải / lỗi / chưa có phiếu nói rõ.
 */
export default function SosTrend({ query, tickets, now }) {
  const c = useChartTheme();
  if (query.isLoading) return <Skeleton height={280} />;
  if (query.isError && !query.data) return <ErrorState height={200} onRetry={query.refetch}>Không tải được phiếu SOS — chưa vẽ được diễn biến</ErrorState>;
  const data = sosTrend(tickets, now);
  const s = responseStats(tickets, now);
  const total = data.reduce((m, b) => m + b.total, 0);
  if (!total) return <EmptyState height={160}>Chưa có phiếu SOS nào nhận trong 48 giờ qua trong vùng đang xem</EmptyState>;
  const parts = [
    { key: 'p1', label: 'Cấp 1 · Đỏ', color: c.danger },
    { key: 'p2', label: 'Cấp 2 · Cam', color: c.serious },
    { key: 'p3', label: 'Cấp 3 · Vàng', color: c.warn },
  ];
  const peak = data.reduce((best, b, i) => (b.total > data[best].total ? i : best), 0);
  const sum = (k) => data.reduce((m, b) => m + b[k], 0);
  // Mốc trục: 0h (ghi ngày) và 12h — 4 mốc vừa màn 360 px
  const ticks = data.filter((b) => new Date(b.start).getHours() % 12 === 0).map((b) => b.start);
  const label = `Phiếu SOS nhận trong 48 giờ: ${total} phiếu — cấp 1 ${sum('p1')}, cấp 2 ${sum('p2')}, cấp 3 ${sum('p3')}; nhiều nhất ${data[peak].total} phiếu lúc ${hh(data[peak].start)} ngày ${dm(data[peak].start)}`;
  const cells = [
    ['Nhận phiếu', s.ack, s.ackN, 'từ lúc báo tới lúc nhận'],
    ['Có đội đi', s.disp, s.dispN, 'từ lúc báo tới lúc điều đội'],
    ['Đội đến nơi', s.reach, s.reachN, 'từ lúc điều tới lúc đến'],
  ];
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold text-ink">Phiếu cứu hộ nhận 48 giờ qua <span className="num">({total})</span></h3>
        {/* Số từng mức ngay trên chú giải: Vàng và Cam của thang chung gần nhau (kiểm định màu ΔE 13,6) — không đọc số chỉ bằng màu */}
        <Legend items={parts.map((p) => ({ label: `${p.label}: ${sum(p.key)}`, color: p.color }))} />
      </div>
      <div role="img" aria-label={label}>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} margin={{ top: 16, right: 4, bottom: 0, left: -18 }} barCategoryGap="18%">
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis dataKey="start" ticks={ticks} interval={0} tickFormatter={(ms) => (new Date(ms).getHours() === 0 ? dm(ms) : hh(ms))} {...axisProps(c)} />
            <YAxis allowDecimals={false} width={40} {...axisProps(c)} />
            <Tooltip content={<Tip parts={parts} />} cursor={{ fill: c.grid, opacity: 0.35 }} />
            {parts.map((p, i) => (
              <Bar
                key={p.key}
                dataKey={p.key}
                name={p.label}
                stackId="sos"
                fill={p.color}
                stroke={c.panel}
                strokeWidth={2}
                radius={i === parts.length - 1 ? [4, 4, 0, 0] : 0}
                isAnimationActive={false}
              >
                {i === parts.length - 1 && (
                  <LabelList
                    dataKey="total"
                    content={({ x, y, width, index }) => (index === peak ? (
                      <text x={x + width / 2} y={y - 4} textAnchor="middle" fontSize={11} fill={c.ink}>{data[index].total}</text>
                    ) : null)}
                  />
                )}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <h3 className="mt-1 text-sm font-semibold text-ink">Thời gian xử lý <span className="text-xs font-normal text-muted">(một nửa số phiếu nhanh hơn mức này)</span></h3>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {cells.map(([name, v, n, hint]) => (
          <div key={name} className="rounded-lg bg-panel2/60 px-1.5 py-2">
            <dt className="text-[11px] font-medium text-ink-2">{name}</dt>
            <dd className="num text-base font-bold leading-tight text-ink">{dur(v)}</dd>
            <dd className="text-[10px] leading-tight text-muted">{hint} · {n} phiếu</dd>
          </div>
        ))}
      </dl>
      {s.slaPct != null && (
        <p className="text-xs text-ink-2">
          Nhận phiếu đúng hạn: <b className="num text-ink">{s.slaPct}%</b> ({s.inSla}/{s.inSla + s.late} phiếu)
          {s.late > 0 && <b className="text-danger"> · {s.late} phiếu nhận trễ / còn chờ quá hạn</b>}
        </p>
      )}
    </div>
  );
}
