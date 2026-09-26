import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAreaQuery } from '../../api/hooks';
import { axisProps, Legend, useChartTheme } from './chartTheme';

const CATS = [
  { key: 'luong_thuc', label: 'Lương thực' },
  { key: 'nuoc_uong', label: 'Nước uống' },
  { key: 'do_dung', label: 'Áo phao & đồ cứu sinh' },
];

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="card px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold">{row.name || label}</div>
      {CATS.map((ct) => (
        <div key={ct.key} className="flex gap-3">
          <span className="text-ink-2">{ct.label}</span>
          <span className={`ml-auto font-mono ${row[ct.key] < 20 ? 'text-danger font-semibold' : ''}`}>
            {row[ct.key] ?? '–'}% {row[`${ct.key}_thieu`] > 0 && <span className="text-muted">(thiếu {row[`${ct.key}_thieu`]}%)</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Cột chồng: phần màu = % hiện có so với định mức an toàn; phần xám = thiếu hụt → căn cứ điều phối liên vùng. */
export default function SuppliesChart({ height = 250 }) {
  const c = useChartTheme();
  const { data } = useAreaQuery('supplies', '/dashboard/supplies', {}, { refetchInterval: 60_000 });
  if (!data) return <div style={{ height }} className="animate-pulse rounded-lg bg-panel2" />;
  const colors = [c.s1, c.s2, c.s3];
  const rows = data.map((d) => ({ ...d, short: d.name.replace('Kho cụm ', '').replace('Kho dự trữ PCTT tỉnh Cao Bằng', 'Kho tỉnh').replace('Kho dã chiến ', 'DC ') }));

  return (
    <div>
      <Legend items={[...CATS.map((ct, i) => ({ label: ct.label, color: colors[i] })), { label: 'Thiếu hụt so với định mức', color: c.shortage }, { label: 'Ngưỡng cạn kiệt 20%', color: c.danger, dashed: true }]} />
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="18%">
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="short" interval={0} angle={-30} textAnchor="end" height={62} {...axisProps(c)} />
          <YAxis domain={[0, 100]} ticks={[0, 20, 50, 100]} tickFormatter={(v) => `${v}%`} width={44} {...axisProps(c)} />
          <ReferenceLine y={20} stroke={c.danger} strokeDasharray="4 3" />
          <Tooltip content={<Tip />} cursor={{ fill: c.grid, opacity: 0.35 }} />
          {CATS.map((ct, i) => [
            <Bar key={ct.key} dataKey={ct.key} stackId={ct.key} fill={colors[i]} stroke={c.panel} strokeWidth={1} isAnimationActive={false} />,
            <Bar key={`${ct.key}_thieu`} dataKey={`${ct.key}_thieu`} stackId={ct.key} fill={c.shortage} stroke={c.panel} strokeWidth={1} radius={[3, 3, 0, 0]} isAnimationActive={false} />,
          ])}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
