import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { ArrowLeft, X } from 'lucide-react';

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

const openDialogs = []; // hộp thoại đang mở theo thứ tự mở — cái mở sau cùng ở cuối

/**
 * Esc đóng hộp thoại. Hộp thoại lồng nhau → chỉ đóng cái mở sau cùng. Bỏ qua Esc khi đang gõ bằng bộ gõ (Unikey /
 * bàn phím tiếng Việt trên điện thoại): lúc đó Esc chỉ huỷ ký tự đang ghép.
 */
export function useEscapeToClose(open, onClose) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose; // onClose thường là hàm viết tại chỗ — không đăng ký lại (sẽ đảo thứ tự hộp thoại)
  useEffect(() => {
    if (!open) return undefined;
    const id = Symbol('dialog');
    openDialogs.push(id);
    const onKeyDown = (e) => {
      if (e.key !== 'Escape' || e.isComposing || openDialogs[openDialogs.length - 1] !== id) return;
      onCloseRef.current?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      openDialogs.splice(openDialogs.indexOf(id), 1);
    };
  }, [open]);
}

/** Nút quay lại (VD các tab chuyên đề của cổng công khai → tab Bản đồ). */
export function BackButton({ onClick, children = 'Quay lại Bản đồ', className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'btn-ghost flex shrink-0 cursor-pointer items-center gap-1 rounded-xl border border-line bg-panel2/50 px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-panel2 hover:text-ink',
        className,
      )}
    >
      <ArrowLeft size={14} /> {children}
    </button>
  );
}

/** Hộp thoại — gắn thẳng vào <body> (portal): mở từ trong header (backdrop-blur tạo khung chứa cho `position: fixed`)
 * thì vẫn phủ toàn màn hình, không bị cắt trong dải header. */
export function Modal({ open, onClose, title, children, wide, footer }) {
  useEscapeToClose(open, onClose);
  if (!open) return null;
  return createPortal(
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
    </div>,
    document.body,
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="scroll-thin flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={clsx(
            'flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium',
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

export function Section({ title, right, children, className, bodyClass, id }) {
  return (
    <section id={id} className={clsx('card flex min-h-0 flex-col', className)}>
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
