import clsx from 'clsx';
import { X } from 'lucide-react';

export function KpiCard({ label, value, unit, sub, tone, icon: Icon, blink, children }) {
  const toneCls = {
    danger: 'border-danger/70 bg-danger/10',
    serious: 'border-serious/70 bg-serious/10',
    warn: 'border-warn/70 bg-warn/10',
    good: 'border-line',
  }[tone] || 'border-line';
  return (
    <div className={clsx('card flex flex-col gap-1 p-3', toneCls, blink && 'animate-blink')}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
        {Icon && <Icon size={14} />}
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="font-mono text-2xl font-semibold tabular-nums text-ink">{value}</span>
        {unit && <span className="text-xs text-muted">{unit}</span>}
      </div>
      {sub && <div className="text-xs text-ink-2">{sub}</div>}
      {children}
    </div>
  );
}

export function Progress({ value, tone = 'accent', className }) {
  const color = { accent: 'bg-accent', danger: 'bg-danger', warn: 'bg-warn', good: 'bg-good', serious: 'bg-serious' }[tone];
  return (
    <div className={clsx('h-1.5 w-full overflow-hidden rounded-full bg-panel2', className)}>
      <div className={clsx('h-full rounded-full', color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1500] flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-12" onMouseDown={onClose}>
      <div
        className={clsx('card w-full shadow-2xl', wide ? 'max-w-4xl' : 'max-w-lg')}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="font-semibold">{title}</h3>
          <button className="rounded p-1 text-muted hover:bg-panel2" onClick={onClose} aria-label="Đóng">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-4 scroll-thin">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="flex gap-1 border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={clsx(
            '-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium',
            value === t.value ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink',
          )}
        >
          {t.icon && <t.icon size={16} />}
          {t.label}
          {t.count != null && <span className="rounded-full bg-panel2 px-1.5 text-[11px]">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Section({ title, right, children, className, bodyClass }) {
  return (
    <section className={clsx('card flex min-h-0 flex-col', className)}>
      <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-3">
        <h2 className="card-title">{title}</h2>
        {right}
      </div>
      <div className={clsx('min-h-0 flex-1 px-4 pb-3', bodyClass)}>{children}</div>
    </section>
  );
}

export const Empty = ({ children = 'Không có dữ liệu trong vùng đang lọc' }) => (
  <div className="py-8 text-center text-sm text-muted">{children}</div>
);

export const StatusDot = ({ cls }) => <span className={clsx('inline-block h-2 w-2 shrink-0 rounded-full', cls)} />;
