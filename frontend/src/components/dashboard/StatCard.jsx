import clsx from 'clsx';

const FRAME = {
  danger: 'border-danger/70 bg-danger/10',
  serious: 'border-serious/70 bg-serious/10',
  warn: 'border-warn/70 bg-warn/10',
  muted: 'border-dashed border-line',
};
const ICON = { danger: 'text-danger', serious: 'text-serious', warn: 'text-warn', good: 'text-good', muted: 'text-muted' };

/**
 * Thẻ chỉ số của Dashboard: tiêu đề + nhãn góc, số lớn, chân thẻ. `tone` theo số liệu thật; `muted` = chưa có dữ liệu
 * (viền nét đứt, số "–") — không tô xanh như "bình thường".
 */
export default function StatCard({ icon: Icon, title, badge, value, unit, footer, tone, blink, className, children }) {
  return (
    <div className={clsx('card flex min-w-0 flex-col justify-between gap-1 p-3', FRAME[tone] || 'border-line', blink && 'animate-blink', className)}>
      <div className="flex items-center justify-between gap-2 text-xs font-bold text-muted">
        <span className="flex min-w-0 items-center gap-1.5 uppercase tracking-wider">
          {Icon && <Icon size={15} className={clsx('shrink-0', ICON[tone] || 'text-accent')} />}
          <span className="truncate">{title}</span>
        </span>
        {badge}
      </div>
      {value !== undefined && (
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-2xl font-black tabular-nums tracking-tight text-ink lg:text-3xl">{value}</span>
          {unit && <span className="font-mono text-xs font-bold text-muted">{unit}</span>}
        </div>
      )}
      {children}
      {footer && <div className="border-t border-line/60 pt-1.5 text-xs text-ink-2">{footer}</div>}
    </div>
  );
}

/** Nhãn nhỏ ở góc thẻ. */
export const Badge = ({ className, children }) => (
  <span className={clsx('chip shrink-0 px-1.5 py-0 text-[10px] font-bold', className)}>{children}</span>
);
