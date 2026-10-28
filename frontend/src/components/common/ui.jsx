import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import {
  AlertTriangle, ArrowLeft, ArrowUpDown, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Lightbulb, Loader2, MoveRight, RefreshCw, TrendingDown, TrendingUp, X,
} from 'lucide-react';
import { NO_DATA, RISK, risk } from '../../utils/risk';
import EmptyArt from './EmptyArt';

/** Ô số liệu gọn: `tone` = vạch màu bên trái theo mức (như StatCard) — chỉ Vàng / Cam / Đỏ; bình thường không vạch, nền giữ trắng. */
export function KpiCard({ label, value, unit, sub, tone, icon: Icon, blink, children }) {
  const toneCls = {
    danger: 'border-l-4 border-l-danger',
    serious: 'border-l-4 border-l-serious',
    warn: 'border-l-4 border-l-warn',
  }[tone];
  return (
    <div className={clsx('card flex flex-col gap-1 p-3', toneCls, blink && 'motion-safe:animate-blink-text')}>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-2">
        {/* Ô biểu tượng như ô chỉ số của Tổng quan (StatCard); lề âm — ô không cao thêm */}
        {Icon && (
          <span className="-my-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent" aria-hidden="true">
            <Icon size={14} />
          </span>
        )}
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="num text-2xl font-extrabold leading-tight tracking-tight text-ink">{value}</span>
        {unit && <span className="text-xs text-muted">{unit}</span>}
      </div>
      {sub && <div className="text-xs text-ink-2">{sub}</div>}
      {children}
    </div>
  );
}

/**
 * Nút chuyển chế độ xem (segmented control) dùng chung mọi trang: khung viền, mục đang chọn tô màu nhấn — chọn MỘT trong
 * vài cách xem cùng số liệu (không phải điều hướng giữa các trang con: dùng Tabs). `options`: [{ value, label, icon, hint
 * (chú thích khi rê chuột), short (nhãn ngắn trên điện thoại) }]; `label`: tên nhóm cho trình đọc màn hình. Nút cao 32 px,
 * 44 px trên màn cảm ứng (`touch`: luôn 44 px). Nhiều mục hơn bề ngang thì cuộn ngang trong khung.
 */
export function Segmented({ options, value, onChange, label, touch = false, className }) {
  return (
    <div role="group" aria-label={label} className={clsx('scroll-thin inline-flex max-w-full gap-0.5 overflow-x-auto rounded-xl border border-line bg-panel p-0.5 shadow-sm', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          title={o.hint}
          onClick={() => onChange(o.value)}
          className={clsx(
            'inline-flex shrink-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-colors',
            touch ? 'min-h-[44px]' : 'tap min-h-[32px]',
            value === o.value ? 'bg-accent text-white shadow-sm' : 'text-ink-2 hover:bg-panel2 hover:text-ink',
          )}
        >
          {o.icon && <o.icon size={14} className="shrink-0" aria-hidden="true" />}
          {o.short ? (
            <>
              <span className="sm:hidden">{o.short}</span>
              <span className="max-sm:hidden">{o.label}</span>
            </>
          ) : o.label}
        </button>
      ))}
    </div>
  );
}

/** Thanh tỉ lệ. `level` (0–3 / null, utils/risk.js) → màu theo thang rủi ro chung, null = Xám; không có `level` → `tone`. */
export function Progress({ value, tone = 'accent', level, className }) {
  const color = level !== undefined
    ? risk(level).fill
    : { accent: 'bg-accent', danger: 'bg-danger', warn: 'bg-warn', good: 'bg-good', serious: 'bg-serious' }[tone];
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
  const titleId = useId(); // tiêu đề là tên hộp thoại cho trình đọc màn hình
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
        aria-labelledby={titleId}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
          <h3 id={titleId} className="font-semibold">{title}</h3>
          <button type="button" className="touch-hit rounded p-1 text-muted hover:bg-panel2" onClick={onClose} aria-label="Đóng">
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

/**
 * Hỏi xác nhận trước thao tác khó quay lại (khoá tài khoản, đặt lại xác thực 2 lớp, cấp khoá mới, xoá thiết bị…): `title`
 * là câu hỏi, `children` nói rõ hậu quả bằng lời; nút xác nhận ghi đúng việc sẽ làm (`confirmLabel`), `danger` → nút đỏ;
 * `busy`: đang gửi (khoá nút). Thay window.confirm — hộp của trình duyệt không nói được hậu quả, khó đọc trên điện thoại.
 */
export function Confirm({ title, children, confirmLabel, cancelLabel = 'Huỷ', danger = false, busy = false, onConfirm, onClose }) {
  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={title}
      footer={(
        <>
          <button type="button" className="btn-ghost tap" disabled={busy} onClick={onClose}>{cancelLabel}</button>
          <button type="button" className={clsx(danger ? 'btn-danger' : 'btn-primary', 'tap')} disabled={busy} onClick={onConfirm}>
            {busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />} {confirmLabel}
          </button>
        </>
      )}
    >
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-ink-2">{children}</div>
    </Modal>
  );
}

/**
 * Hàng thẻ chuyển nội dung. Mỗi thẻ: { value, label, short (nhãn ngắn dưới 640 px — nhãn dài tràn khỏi màn 360 px), icon,
 * count, alert: { level, text } (chấm màu mức nặng nhất bên trong thẻ, thang rủi ro chung) }. Màn cảm ứng: cao ≥ 44 px.
 * `fit`: dưới 640 px các thẻ chia đều bề ngang, nhãn trên / số đếm dưới, bỏ biểu tượng — 3 thẻ vừa màn 360 px, không phải
 * kéo ngang tìm thẻ thứ ba. `label`: tên của hàng thẻ cho trình đọc màn hình.
 */
export function Tabs({ tabs, value, onChange, fit = false, label }) {
  return (
    <div className="scroll-thin flex gap-1 overflow-x-auto border-b border-line" role={label ? 'group' : undefined} aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          aria-pressed={value === t.value}
          className={clsx(
            'tap flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium',
            fit && 'max-sm:min-w-0 max-sm:flex-1 max-sm:flex-col max-sm:gap-0.5 max-sm:px-1 max-sm:py-1.5',
            value === t.value ? 'border-accent font-semibold text-accent' : 'border-transparent text-muted hover:text-ink',
          )}
        >
          {t.icon && <t.icon size={16} className={clsx('shrink-0', fit && 'max-sm:hidden')} aria-hidden="true" />}
          {t.short ? (
            <>
              <span className="sm:hidden">{t.short}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </>
          ) : t.label}
          {(t.count != null || t.alert) && (
            <span className="flex items-center gap-1.5">
              {t.count != null && <span className="rounded-full bg-panel2 px-1.5 text-[11px]">{t.count}</span>}
              {t.alert && (
                <span role="img" className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', risk(t.alert.level).fill)} title={t.alert.text} aria-label={t.alert.text} />
              )}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * Khung một khối nội dung. `collapsible`: tiêu đề thành nút mở / thu gọn (`open`, `onToggle` do nơi gọi giữ). Khi thu gọn
 * nội dung chỉ bị ẩn, KHÔNG gỡ khỏi trang — truy vấn số liệu bên trong vẫn chạy như cũ. `hint`: nút "?" (Hint) cạnh tiêu đề
 * — đặt ngoài nút thu gọn (không lồng nút trong nút).
 */
export function Section({ title, hint, right, children, className, bodyClass, id, collapsible = false, open = true, onToggle }) {
  return (
    <section id={id} className={clsx('card flex min-h-0 flex-col', className)}>
      <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {collapsible ? (
            <h2 className="card-title min-w-0 flex-1">
              <button type="button" className="tap flex min-h-[40px] w-full items-center gap-1.5 text-left" aria-expanded={open} onClick={onToggle}>
                <ChevronDown size={15} className={clsx('shrink-0 transition-transform', !open && '-rotate-90')} aria-hidden="true" />
                {title}
              </button>
            </h2>
          ) : (
            <h2 className="card-title min-w-0">{title}</h2>
          )}
          {hint}
        </div>
        {right}
      </div>
      <div className={clsx('min-h-0 flex-1 px-4 pb-3', bodyClass, collapsible && !open && 'hidden')}>{children}</div>
    </section>
  );
}

/** Trống (dạng gọn trong danh sách / bảng). `art`: hình nét đơn phía trên (EmptyArt) — cho khối lớn; danh sách nhỏ bỏ trống. */
export const Empty = ({ art, children = 'Không có dữ liệu trong vùng đang lọc' }) => (
  <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted">
    {art && <EmptyArt name={art} className="h-16 w-24 text-muted" />}
    {children}
  </div>
);

/* ---- Ba trạng thái của một khối số liệu: đang tải · lỗi · trống (cùng khung, cùng chiều cao → trang không nhảy) ---- */

/** Đang tải: khung xám nhấp nháy đúng chiều cao nội dung sắp hiện. */
export const Skeleton = ({ height, className }) => (
  <div style={height ? { height } : undefined} className={clsx('motion-safe:animate-pulse rounded-lg bg-panel2', className)} role="status" aria-label="Đang tải" />
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

/** Trống: hệ thống tải được nhưng chưa có dữ liệu — nói cần nhập gì / ở đâu. `art`: hình nét đơn (EmptyArt: phieu, hop-thu,
 * ban-do, tim, mat-mang, loi, canh-bao, du-lieu) phía trên câu chữ; `icon` (lucide): biểu tượng nét mảnh thay hình — dùng
 * cho khối lớn; danh sách nhỏ, hộp chọn thì bỏ trống. Không đặt hình trong ô màu. */
export const EmptyState = ({ height, className, icon: Icon, art, children }) => (
  <div
    style={height ? { height } : undefined}
    className={clsx('flex items-center justify-center rounded-lg border border-dashed border-line px-4 py-5 text-center text-xs text-muted', className)}
  >
    <div className="flex flex-col items-center gap-2">
      {art ? <EmptyArt name={art} className="h-16 w-24 text-muted" /> : Icon && <Icon size={30} strokeWidth={1.4} className="text-muted/70" aria-hidden="true" />}
      <div className="max-w-md text-[13px] leading-snug">{children}</div>
    </div>
  </div>
);

/**
 * Nút "?" nhỏ cạnh thuật ngữ chuyên môn: bấm → một câu giải thích nổi ngay dưới nút (đặt theo vị trí nút, không tràn khỏi
 * màn hình 360 px); bấm ra ngoài / Esc / cuộn trang thì đóng. Vùng chạm 44 px trên màn cảm ứng (.touch-hit). `label`:
 * thuật ngữ được giải thích (đọc cho trình đọc màn hình: "Giải thích: …"). Không đặt bên trong nút / liên kết khác.
 */
export function Hint({ label, children, className }) {
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const pop = useRef(null);
  const id = useId();
  useEffect(() => {
    if (!pos) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      if (e.type === 'mousedown' && (btn.current?.contains(e.target) || pop.current?.contains(e.target))) return;
      setPos(null);
    };
    const main = document.querySelector('main');
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    window.addEventListener('resize', close);
    main?.addEventListener('scroll', close, { passive: true });
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
      window.removeEventListener('resize', close);
      main?.removeEventListener('scroll', close);
    };
  }, [pos]);
  const toggle = (e) => {
    e.stopPropagation();
    if (pos) return setPos(null);
    const r = btn.current.getBoundingClientRect();
    const width = Math.min(288, window.innerWidth - 16);
    return setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left - 16, window.innerWidth - width - 8)), width });
  };
  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={toggle}
        aria-expanded={!!pos}
        aria-controls={pos ? id : undefined}
        aria-label={`Giải thích: ${label}`}
        title={`Giải thích: ${label}`}
        className={clsx(
          'touch-hit inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line text-[11px] font-bold leading-none text-muted hover:border-accent hover:text-accent no-print',
          pos && 'border-accent text-accent',
          className,
        )}
      >
        ?
      </button>
      {pos && createPortal(
        <div
          ref={pop}
          id={id}
          role="note"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
          className="fixed z-[1600] rounded-lg border border-line bg-panel px-3 py-2 text-left text-[13px] font-normal leading-snug text-ink shadow-lg motion-safe:animate-enter"
        >
          <b className="mb-0.5 block text-xs font-semibold text-muted">{label}</b>
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}

const tipsKey = (id) => `pctt_goi_y_${id}`;
const tipsSeen = (id) => { try { return localStorage.getItem(tipsKey(id)) === '1'; } catch { return false; } };

/**
 * Gợi ý 3 bước lần đầu mở một màn hình: "Bắt đầu từ đâu" cho người mới, không phải đọc hướng dẫn. Bấm "Đã hiểu" → không
 * hiện lại trên máy này (localStorage, khoá theo `id` của màn). `steps`: 2–4 câu ngắn, mỗi câu một việc; `more`: liên kết
 * đứng trước nút "Đã hiểu" (VD tới trang Hướng dẫn xử lý — RoleTips). Gợi ý theo vai trò: dùng RoleTips.
 */
export function PageTips({ id, title = 'Bắt đầu từ đâu?', steps, more, className }) {
  const [open, setOpen] = useState(() => !tipsSeen(id));
  const [collapsed, setCollapsed] = useState(true); // gập sẵn một dòng — mở khi cần (bớt chữ thường trực trên mọi trang)
  if (!open) return null;
  const done = () => {
    try { localStorage.setItem(tipsKey(id), '1'); } catch { /* chế độ riêng tư: chỉ ẩn lần này */ }
    setOpen(false);
  };
  return (
    <section aria-label="Gợi ý cho người mới" data-mau-chuyen="" className={clsx('card flex flex-col gap-2 border-accent/25 bg-gradient-to-r from-accent/[0.07] via-accent/[0.02] to-transparent px-3 py-2.5 no-print sm:flex-row sm:items-center sm:gap-4', className)}>
      <div className="flex shrink-0 items-center justify-between gap-2">
        <b className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="icon-tile h-8 w-8 max-sm:hidden" aria-hidden="true"><Lightbulb size={16} /></span>
          {title}
        </b>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="btn-ghost tap inline-flex items-center gap-1 px-2 py-0.5 text-xs text-muted hover:text-ink md:hidden"
          title={collapsed ? 'Mở rộng hướng dẫn' : 'Thu gọn hướng dẫn'}
        >
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          <span className="text-[11px]">{collapsed ? 'Mở' : 'Gập'}</span>
        </button>
      </div>
      {!collapsed && (
        <ol className="grid min-w-0 flex-1 gap-1.5 text-[13px] leading-snug text-ink-2 md:grid-cols-3 md:gap-3">
          {steps.map((s, i) => (
            <li key={s} className="flex min-w-0 gap-2">
              <span className="num w-4 shrink-0 font-bold text-accent">{i + 1}.</span>
              <span className="min-w-0">{s}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 self-end sm:self-center">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="btn-ghost tap hidden items-center gap-1 px-2 py-1 text-xs text-muted hover:text-ink md:inline-flex"
          title={collapsed ? 'Mở rộng hướng dẫn' : 'Thu gọn hướng dẫn'}
        >
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          <span>{collapsed ? 'Mở rộng' : 'Thu gọn'}</span>
        </button>
        {more}
        <button type="button" onClick={done} className="btn-secondary tap px-3 py-1 text-xs">
          <Check size={14} aria-hidden="true" /> Đã hiểu
        </button>
      </div>
    </section>
  );
}

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
 * Mũi tên xu hướng + chữ ngắn (VD "0,12 m/giờ"); `textClass`: ẩn / hiện phần chữ theo bề rộng (ô hẹp chỉ còn mũi tên).
 * dir: 'len' | 'xuong' | 'on_dinh'. Lên = cam (rủi ro tăng); xuống = xanh
 * dương (KHÔNG xanh lá — đang xuống chưa chắc đã an toàn); ổn định = xám. `label` đọc cho trình đọc màn hình (role="img").
 */
export function TrendTag({ dir, text, label, className, textClass }) {
  if (!dir) return null;
  const Icon = dir === 'len' ? TrendingUp : dir === 'xuong' ? TrendingDown : MoveRight;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={clsx(
        'num inline-flex items-center gap-0.5 whitespace-nowrap font-semibold',
        dir === 'len' ? 'text-serious' : dir === 'xuong' ? 'text-accent' : 'text-muted',
        className,
      )}
    >
      <Icon size={12} className="shrink-0" aria-hidden="true" />
      {textClass ? <span className={textClass}>{text}</span> : text}
    </span>
  );
}

/** Nút "Xem thêm" của danh sách hiện dần (utils/useShowMore): còn mục ẩn thì hiện "Đang hiện a/b", "Xem thêm", "Xem tất cả". */
export function ShowMore({ list, step, noun }) {
  const rest = list.total - list.shown;
  if (rest <= 0) return null;
  const btn = 'btn-ghost min-h-[44px] px-3 text-xs sm:min-h-[36px] [@media(pointer:coarse)]:!min-h-[44px]'; // iPad: vẫn 44 px
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
      <span className="text-muted">Đang hiện {list.shown}/{list.total} {noun}</span>
      <button type="button" className={btn} onClick={list.more}>Xem thêm {Math.min(step, rest)} {noun}</button>
      {rest > step && <button type="button" className={btn} onClick={list.all}>Xem tất cả {list.total}</button>}
    </div>
  );
}

/**
 * Thanh phân trang dưới danh sách (utils/usePaged): "a–b / tổng", số dòng mỗi trang, trang trước / sau. Nút ≥ 44 px trên màn
 * cảm ứng. Danh sách vừa một trang và không đổi cỡ trang được → chỉ hiện số dòng.
 */
export function Pager({ paged, size, sizes = [10, 20, 50], onSize, noun, className }) {
  const nav = 'btn-ghost tap-sq h-9 w-9 p-0';
  return (
    <div className={clsx('flex flex-wrap items-center justify-between gap-2 text-xs text-muted no-print', className)}>
      <span>
        {paged.total > paged.to - paged.from + 1 ? <><b className="font-mono text-ink">{paged.from}–{paged.to}</b> / </> : null}
        <b className="font-mono text-ink">{paged.total}</b> {noun}
      </span>
      {paged.total > Math.min(...sizes) && (
        <div className="flex items-center gap-2">
          {onSize && (
            <select className="input tap min-h-[36px] w-auto py-0.5 text-xs" value={size} onChange={(e) => onSize(Number(e.target.value))} aria-label="Số dòng mỗi trang">
              {sizes.map((n) => <option key={n} value={n}>{n} / trang</option>)}
            </select>
          )}
          <button type="button" className={nav} onClick={() => paged.setPage(paged.page - 1)} disabled={paged.page <= 1} aria-label="Trang trước">
            <ChevronLeft size={15} />
          </button>
          <span className="font-mono" aria-live="polite">{paged.page}/{paged.pages}</span>
          <button type="button" className={nav} onClick={() => paged.setPage(paged.page + 1)} disabled={paged.page >= paged.pages} aria-label="Trang sau">
            <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

/** Tiêu đề cột bấm được để xếp (bảng máy tính) — chọn cùng cách xếp với ô "Xếp" của thanh lọc; `dir`: chiều của cách xếp đó. */
export function SortTh({ k, dir = 'ascending', sort, onSort, pdf, children, className }) {
  if (!k || pdf) return <th scope="col" className={className}>{children}</th>;
  return (
    <th scope="col" className={className} aria-sort={sort === k ? dir : undefined}>
      <button type="button" className="tap inline-flex items-center gap-1 hover:text-ink" onClick={() => onSort(k)} title="Xếp theo cột này">
        {children}
        <ArrowUpDown size={11} className={sort === k ? 'text-accent' : 'opacity-40'} aria-hidden="true" />
      </button>
    </th>
  );
}

export const StatusDot = ({ cls }) => <span className={clsx('inline-block h-2 w-2 shrink-0 rounded-full', cls)} />;

/**
 * Các bước của form nhiều bước (đầu hộp thoại): bấm để quay lại bước đã qua, không nhảy cóc tới bước chưa điền. `done[i]`:
 * bước i đã điền đủ (dấu ✓). Nút ≥ 44 px trên màn cảm ứng.
 */
export function StepChips({ steps, step, onStep, done = [], disabled }) {
  // Thanh tiến trình nối liền: số trong vòng tròn (đang làm: màu nhấn chữ trắng; đã xong: xanh lá nhạt, dấu tích; chưa tới:
  // xám), vạch nối giữa các bước tô xanh khi đã qua. Bấm bước đã qua để quay lại (bước chưa tới bị khoá như trước)
  return (
    <ol className="mb-3 flex min-w-0 items-center gap-1 text-xs" aria-label="Các bước">
      {steps.map((s, i) => (
        <li key={s} className={clsx('flex min-w-0 items-center gap-1', i < steps.length - 1 && 'flex-1')}>
          <button
            type="button"
            disabled={i > step || disabled}
            onClick={() => onStep(i)}
            aria-current={i === step ? 'step' : undefined}
            className={clsx(
              'tap flex min-h-[32px] min-w-0 items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 font-semibold transition-colors',
              i === step ? 'bg-accent/10 text-accent' : i < step ? 'text-good hover:bg-good/10' : 'text-muted',
            )}
          >
            <span
              className={clsx(
                'num flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                i === step ? 'bg-accent text-white shadow-sm' : i < step ? 'bg-good/15 text-good' : 'bg-panel2 text-muted ring-1 ring-inset ring-line',
              )}
              aria-hidden="true"
            >
              {i < step && done[i] ? <Check size={12} /> : i + 1}
            </span>
            <span className="truncate">{s}</span>
            <span className="sr-only">{i < step ? ' (đã xong)' : i === step ? ' (đang làm)' : ''}</span>
          </button>
          {i < steps.length - 1 && (
            <span className={clsx('h-0.5 min-w-3 flex-1 rounded-full', i < step ? 'bg-good/50' : 'bg-line')} aria-hidden="true" />
          )}
        </li>
      ))}
    </ol>
  );
}

/** Lỗi của một ô nhập, hiện ngay dưới ô (ô đặt aria-invalid + aria-describedby trỏ tới `id`). Dùng chung mọi form. */
export const FieldError = ({ id, children }) => (children ? (
  <p id={id} className="flex items-center gap-1 text-[11px] font-semibold text-danger">
    <AlertTriangle size={12} className="shrink-0" aria-hidden="true" /> {children}
  </p>
) : null);
