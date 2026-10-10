import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { AlertTriangle, ArrowLeft, ChevronDown, MoveRight, RefreshCw, TrendingDown, TrendingUp, X } from 'lucide-react';
import { NO_DATA, RISK } from '../../utils/risk';

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
 * thì vẫn phủ toàn màn hình, không bị cắt trong dải header. Hộp thoại không cao quá màn hình: chỉ phần thân cuộn, hàng
 * nút (footer) luôn thấy — trước đây thân cao tới 75vh cộng tiêu đề + nút vượt màn 740 px, nút chính nằm dưới mép. */
export function Modal({ open, onClose, title, children, wide, footer }) {
  useEscapeToClose(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[1500] flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-12" onMouseDown={onClose}>
      <div
        className={clsx(
          'card flex max-h-[calc(100vh-4rem)] w-full flex-col shadow-2xl supports-[height:100dvh]:max-h-[calc(100dvh-4rem)]',
          wide ? 'max-w-4xl' : 'max-w-lg',
        )}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
          <h3 className="font-semibold">{title}</h3>
          <button className="rounded p-1 text-muted hover:bg-panel2" onClick={onClose} aria-label="Đóng">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 scroll-thin">{children}</div>
        {footer && <div className="flex shrink-0 justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
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

/**
 * Khung một khối nội dung. `collapsible`: tiêu đề thành nút mở / thu gọn (`open`, `onToggle` do nơi gọi giữ). Khi thu gọn
 * nội dung chỉ bị ẩn, KHÔNG gỡ khỏi trang — truy vấn số liệu bên trong vẫn chạy như cũ.
 */
export function Section({ title, right, children, className, bodyClass, id, collapsible = false, open = true, onToggle }) {
  return (
    <section id={id} className={clsx('card flex min-h-0 flex-col', className)}>
      <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-3">
        {collapsible ? (
          <h2 className="card-title min-w-0 flex-1">
            <button type="button" className="flex min-h-[40px] w-full items-center gap-1.5 text-left" aria-expanded={open} onClick={onToggle}>
              <ChevronDown size={15} className={clsx('shrink-0 transition-transform', !open && '-rotate-90')} aria-hidden="true" />
              {title}
            </button>
          </h2>
        ) : (
          <h2 className="card-title">{title}</h2>
        )}
        {right}
      </div>
      <div className={clsx('min-h-0 flex-1 px-4 pb-3', bodyClass, collapsible && !open && 'hidden')}>{children}</div>
    </section>
  );
}

export const Empty = ({ children = 'Không có dữ liệu trong vùng đang lọc' }) => (
  <div className="py-8 text-center text-sm text-muted">{children}</div>
);

/* ---- Ba trạng thái của một khối số liệu: đang tải · lỗi · trống (cùng khung, cùng chiều cao → trang không nhảy) ---- */

/** Đang tải: khung xám nhấp nháy đúng chiều cao nội dung sắp hiện. */
export const Skeleton = ({ height, className }) => (
  <div style={height ? { height } : undefined} className={clsx('animate-pulse rounded-lg bg-panel2', className)} role="status" aria-label="Đang tải" />
);

/** Lỗi tải: nói rõ KHÔNG tải được (không giả "chưa có dữ liệu"), có nút thử lại. */
export function ErrorState({ height, onRetry, className, children = 'Không tải được số liệu từ máy chủ' }) {
  return (
    <div
      role="alert"
      style={height ? { height } : undefined}
      className={clsx('flex flex-col items-center justify-center gap-2 rounded-lg border border-danger/40 bg-danger/5 px-4 py-5 text-center text-xs text-danger', className)}
    >
      <span className="flex items-center gap-1.5 font-semibold">
        <AlertTriangle size={14} className="shrink-0" /> {children}
      </span>
      {onRetry && (
        <button type="button" className="btn-ghost min-h-[36px] px-3 py-1 text-xs" onClick={() => onRetry()}>
          <RefreshCw size={12} /> Thử lại
        </button>
      )}
    </div>
  );
}

/** Trống: hệ thống tải được nhưng chưa có dữ liệu — nói cần nhập gì / ở đâu. */
export const EmptyState = ({ height, className, children }) => (
  <div
    style={height ? { height } : undefined}
    className={clsx('flex items-center justify-center rounded-lg border border-dashed border-line px-4 py-5 text-center text-xs text-muted', className)}
  >
    <div>{children}</div>
  </div>
);

/** Chú giải thang màu rủi ro dùng chung (utils/risk.js): Đỏ → Xanh, cộng Xám = chưa có dữ liệu. `meaningClass`: ẩn / hiện phần
 * nghĩa ("khẩn cấp", "theo dõi"…) theo bề rộng — nghĩa vẫn có ở title của từng mục. */
export function RiskLegend({ className, meaningClass }) {
  return (
    <div className={clsx('flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted', className)} aria-label="Thang màu rủi ro">
      {[...RISK].reverse().map((r) => (
        <span key={r.level} className="inline-flex items-center gap-1 whitespace-nowrap" title={`${r.name}: ${r.meaning.toLowerCase()}`}>
          <span className={clsx('inline-block h-2.5 w-2.5 rounded-sm', r.fill)} aria-hidden="true" />
          <b className="font-semibold text-ink-2">{r.name}</b> <span className={meaningClass}>{r.meaning.toLowerCase()}</span>
        </span>
      ))}
      <span className="inline-flex items-center gap-1 whitespace-nowrap" title={`${NO_DATA.name}: ${NO_DATA.meaning.toLowerCase()}`}>
        <span className="inline-block h-2.5 w-2.5 rounded-sm border border-dashed border-muted bg-panel2" aria-hidden="true" />
        <b className="font-semibold text-ink-2">{NO_DATA.name}</b> <span className={meaningClass}>{NO_DATA.meaning.toLowerCase()}</span>
      </span>
    </div>
  );
}

/**
 * Mũi tên xu hướng + chữ ngắn (VD "0,12 m/giờ"). dir: 'len' | 'xuong' | 'on_dinh'. Lên = cam (rủi ro tăng); xuống = xanh
 * dương (KHÔNG xanh lá — đang xuống chưa chắc đã an toàn); ổn định = xám. `label` đọc cho trình đọc màn hình (role="img").
 */
export function TrendTag({ dir, text, label, className }) {
  if (!dir) return null;
  const Icon = dir === 'len' ? TrendingUp : dir === 'xuong' ? TrendingDown : MoveRight;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex items-center gap-0.5 whitespace-nowrap font-mono font-semibold',
        dir === 'len' ? 'text-serious' : dir === 'xuong' ? 'text-accent' : 'text-muted',
        className,
      )}
    >
      <Icon size={12} className="shrink-0" aria-hidden="true" />
      {text}
    </span>
  );
}

/** Nút "Xem thêm" của danh sách hiện dần (utils/useShowMore): còn mục ẩn thì hiện "Đang hiện a/b", "Xem thêm", "Xem tất cả". */
export function ShowMore({ list, step, noun }) {
  const rest = list.total - list.shown;
  if (rest <= 0) return null;
  const btn = 'btn-ghost min-h-[44px] px-3 text-xs sm:min-h-[36px]';
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
      <span className="text-muted">Đang hiện {list.shown}/{list.total} {noun}</span>
      <button type="button" className={btn} onClick={list.more}>Xem thêm {Math.min(step, rest)} {noun}</button>
      {rest > step && <button type="button" className={btn} onClick={list.all}>Xem tất cả {list.total}</button>}
    </div>
  );
}

export const StatusDot = ({ cls }) => <span className={clsx('inline-block h-2 w-2 shrink-0 rounded-full', cls)} />;

/** Lỗi của một ô nhập, hiện ngay dưới ô (ô đặt aria-invalid + aria-describedby trỏ tới `id`). Dùng chung mọi form. */
export const FieldError = ({ id, children }) => (children ? (
  <p id={id} className="flex items-center gap-1 text-[11px] font-semibold text-danger">
    <AlertTriangle size={12} className="shrink-0" aria-hidden="true" /> {children}
  </p>
) : null);
