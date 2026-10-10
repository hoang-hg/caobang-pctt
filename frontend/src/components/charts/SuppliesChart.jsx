import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { AlertCircle } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAreaQuery } from '../../api/hooks';
import { EmptyState, ErrorState, Skeleton } from '../common/ui';
import { axisProps, Legend, useChartTheme } from './chartTheme';

const CATS = [
  { key: 'luong_thuc', label: 'Lương thực' },
  { key: 'nuoc_uong', label: 'Nước uống' },
  { key: 'do_dung', label: 'Áo phao & đồ cứu sinh' },
];

// Cấp kho (resources.warehouses.level)
const LEVEL_LABEL = { tinh: 'Kho tỉnh', cum: 'Kho cụm', xa: 'Kho xã', da_chien: 'Kho dã chiến' };

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="card px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold">{row.name || label}</div>
      <div className="mb-1.5 text-[11px] text-muted">{LEVEL_LABEL[row.level] || row.level}</div>
      {CATS.map((ct) => (
        <div key={ct.key} className="flex gap-3 py-0.5">
          <span className="text-ink-2">{ct.label}</span>
          <span className={`ml-auto font-mono ${row[ct.key] < 20 ? 'font-bold text-danger' : ''}`}>
            {row[ct.key] == null ? 'chưa có' : `${row[ct.key]}%`}{' '}
            {row[`${ct.key}_thieu`] > 0 && <span className="text-muted">(thiếu {row[`${ct.key}_thieu`]}%)</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Cột chồng: phần màu = % hiện có so với định mức an toàn; phần xám = thiếu hụt → căn cứ điều phối giữa các kho.
 * Mặt hàng kho không có (không có dòng tồn kho / định mức) để trống — không tính là "cạn kiệt". */
export default function SuppliesChart({ height = 250 }) {
  const c = useChartTheme();
  const [levelFilter, setLevelFilter] = useState('all');
  const { data, isError, refetch } = useAreaQuery('supplies', '/dashboard/supplies', {}, { refetchInterval: 60_000 });

  const colors = [c.s1, c.s2, c.s3];

  const { rows, levels, criticalCount } = useMemo(() => {
    if (!data) return { rows: [], levels: [], criticalCount: 0 };
    const mapped = data.map((d) => ({
      ...d,
      short: d.name.replace('Kho cụm ', '').replace('Kho dự trữ PCTT tỉnh Cao Bằng', 'Kho tỉnh').replace('Kho dã chiến ', 'DC '),
    }));
    const filtered = levelFilter === 'all' ? mapped : mapped.filter((r) => r.level === levelFilter);
    const critical = filtered.reduce((n, d) => n + CATS.filter((ct) => d[ct.key] != null && d[ct.key] < 20).length, 0);
    return { rows: filtered, levels: [...new Set(mapped.map((d) => d.level))], criticalCount: critical };
  }, [data, levelFilter]);

  if (!data) {
    return isError ? <ErrorState height={height} onRetry={refetch}>Không tải được số liệu kho vật tư</ErrorState> : <Skeleton height={height} />;
  }
  if (!data.length) {
    return <EmptyState height={height}>Chưa có kho / tồn kho kèm định mức dự trữ trong vùng đang xem</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2">
        {levels.length > 1 ? (
          <div className="scroll-thin flex items-center gap-1 overflow-x-auto">
            {['all', ...levels].map((id) => (
              <button
                key={id}
                onClick={() => setLevelFilter(id)}
                className={clsx(
                  'tap whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold transition-all',
                  levelFilter === id ? 'bg-accent text-white shadow-sm' : 'bg-panel2/60 text-muted hover:bg-panel2 hover:text-ink',
                )}
              >
                {id === 'all' ? 'Tất cả kho' : LEVEL_LABEL[id] || id}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        {criticalCount > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-danger/25 bg-danger/10 px-2 py-0.5 text-[11px] font-semibold text-danger">
            <AlertCircle size={12} />
            <span>{criticalCount} mặt hàng dưới 20% định mức</span>
          </span>
        ) : (
          <span className="text-[11px] font-medium text-muted">Không mặt hàng nào dưới 20% định mức</span>
        )}
      </div>

      <Legend
        items={[
          ...CATS.map((ct, i) => ({ label: ct.label, color: colors[i] })),
          { label: 'Thiếu hụt so với định mức', color: c.shortage },
          { label: 'Ngưỡng cạn kiệt 20%', color: c.danger, dashed: true },
        ]}
      />

      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 24, left: -6 }} barGap={2} barCategoryGap="18%">
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="short" interval={0} angle={-25} textAnchor="end" height={64} {...axisProps(c)} />
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
