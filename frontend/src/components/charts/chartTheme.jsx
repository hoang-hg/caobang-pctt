import { useMemo } from 'react';
import { useStore } from '../../app/store';
import { RISK } from '../../utils/risk';

/** Màu biểu đồ đọc từ biến CSS → đổi Sáng/Tối là đổi ngay, không tải lại trang. */
export function useChartTheme() {
  const theme = useStore((s) => s.theme);
  return useMemo(() => {
    const css = getComputedStyle(document.documentElement);
    const v = (n) => css.getPropertyValue(n).trim();
    const rgb = (n) => `rgb(${v(n)})`;
    return {
      theme,
      s1: v('--series-1'),
      s2: v('--series-2'),
      s3: v('--series-3'),
      grid: v('--chart-grid'),
      axis: v('--chart-axis'),
      shortage: v('--chart-shortage'),
      ink: rgb('--ink'),
      muted: rgb('--muted'),
      panel: rgb('--panel'),
      line: rgb('--line'),
      // Màu trạng thái cố định — thang màu rủi ro chung (utils/risk.js): chip, bản đồ và biểu đồ cùng một màu
      good: RISK[0].hex,
      warn: RISK[1].hex,
      serious: RISK[2].hex,
      danger: RISK[3].hex,
    };
  }, [theme]);
}

export const axisProps = (c) => ({
  stroke: c.axis,
  tick: { fill: c.axis, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: c.grid },
});

export function ChartTooltip({ active, payload, label, labelFormatter, unit = '', rows }) {
  if (!active || !payload?.length) return null;
  const items = rows ? rows(payload) : payload.filter((p) => p.value != null);
  return (
    <div className="card px-3.5 py-2.5 text-xs shadow-2xl backdrop-blur-xl bg-panel/95 border border-line/90 rounded-xl ring-1 ring-white/5">
      <div className="mb-1.5 font-bold text-ink border-b border-line/50 pb-1">{labelFormatter ? labelFormatter(label, payload) : label}</div>
      <div className="space-y-1">
        {items.map((p) => (
          <div key={p.name || p.dataKey} className="flex items-center gap-2 text-ink-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full shadow-sm" style={{ background: p.color || p.fill || p.stroke }} />
            <span className="font-medium">{p.name}</span>
            <span className="ml-auto pl-3 font-mono font-bold text-ink">
              {typeof p.value === 'number' ? p.value.toLocaleString('vi-VN', { maximumFractionDigits: 2 }) : p.value}
              {p.unit ?? unit}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          {it.dashed ? (
            <svg width="18" height="4"><line x1="0" y1="2" x2="18" y2="2" stroke={it.color} strokeWidth="2" strokeDasharray="4 3" /></svg>
          ) : it.line ? (
            <svg width="18" height="4"><line x1="0" y1="2" x2="18" y2="2" stroke={it.color} strokeWidth="2" /></svg>
          ) : (
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: it.color }} />
          )}
          {it.label}
        </span>
      ))}
    </div>
  );
}
