import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { ChevronDown, Download, Loader2 } from 'lucide-react';

/**
 * Menu "Xuất" của đầu trang (PageHeader): gom các cách xuất / in (PDF, văn bản, Excel…) vào MỘT nút — hàng thao tác chỉ
 * còn việc chính. `items`: [{ key, label, hint (dòng phụ), icon, onClick, disabled, busy (đang xuất — nút hiện vòng quay) }].
 * Bàn phím: mở là con trỏ ở mục đầu, ↑ ↓ chuyển mục, Esc đóng và trả con trỏ về nút.
 */
// `up`: menu mở lên trên (nút ở đáy khối — cột Tình hình của Tổng quan); `buttonClass`: thay kiểu nút (nền tối)
// `floating`: menu gắn vào body, định vị theo nút — nút nằm trong khối có thanh cuộn thì menu không bị cắt theo khối
export default function ExportMenu({ items, label = 'Xuất', title = 'Xuất báo cáo, bảng số liệu', className, up = false, buttonClass, floating = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const menuRef = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!open || !floating) return;
    const r = ref.current.getBoundingClientRect();
    const width = Math.min(416, window.innerWidth - 24);
    setPos({ left: Math.max(12, Math.min(r.left, window.innerWidth - width - 12)), bottom: window.innerHeight - r.top + 6, width });
  }, [open, floating]);
  const busy = items.some((it) => it.busy);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (!ref.current?.contains(e.target) && !menuRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    (menuRef.current || ref.current)?.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [open]);

  const onKeyDown = (e) => {
    if (!open) return;
    if (e.key === 'Escape') {
      setOpen(false);
      ref.current?.querySelector('button')?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const list = [...(menuRef.current || ref.current).querySelectorAll('[role="menuitem"]:not(:disabled)')];
      const i = list.indexOf(document.activeElement);
      list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus();
    }
  };

  const menu = (
        <div
          ref={menuRef}
          role="menu"
          aria-label={title}
          onKeyDown={onKeyDown}
          style={floating ? { position: 'fixed', zIndex: 1600, left: pos?.left, bottom: pos?.bottom, width: pos?.width, visibility: pos ? 'visible' : 'hidden' } : undefined}
          className={clsx('card p-1.5 shadow-xl', !floating && 'absolute z-[1100] w-72 max-w-[calc(100vw-1.5rem)]', !floating && (up ? 'bottom-full left-0 mb-1.5' : 'right-0 top-full mt-1.5'))}>
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              disabled={it.disabled || it.busy}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className="tap flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-panel2 focus-visible:bg-panel2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <it.icon size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{it.label}</span>
                {it.hint && <span className="block text-xs text-muted">{it.hint}</span>}
              </span>
            </button>
          ))}
        </div>
  );

  return (
    <div ref={ref} className={clsx('relative', className)} onKeyDown={onKeyDown}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        className={buttonClass || 'btn-secondary tap-sq h-9 min-w-[36px] px-2.5'}
      >
        {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
        <span className="max-sm:sr-only">{label}</span>
        <ChevronDown size={13} className={clsx('transition-transform max-sm:hidden', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (floating ? createPortal(menu, document.body) : menu)}
    </div>
  );
}
