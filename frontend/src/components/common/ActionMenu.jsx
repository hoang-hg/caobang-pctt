import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { MoreHorizontal } from 'lucide-react';

/**
 * Nút "⋯" mở menu thao tác (bản vẽ desktop khung C13 — "Chuyển sang…" trên thẻ phiếu cứu hộ). Menu nổi trên trang (portal,
 * vị trí cố định theo nút) — không bị cột cuộn của bảng điều phối cắt mất. `items`: [{ key, label, hint, onClick, href,
 * disabled, danger, current }] — `{ header: 'Chuyển sang…' }` là dòng tiêu đề nhóm, `{ separator: true }` là vạch ngăn.
 * Bàn phím: mở là con trỏ ở mục đầu, ↑ ↓ chuyển mục, Esc đóng và trả con trỏ về nút; cuộn trang / đổi cỡ cửa sổ → đóng.
 */
export default function ActionMenu({ label, items, className, title }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  useLayoutEffect(() => {
    if (!open) return;
    const b = btnRef.current.getBoundingClientRect();
    const m = menuRef.current?.getBoundingClientRect();
    const w = m?.width || 300;
    const h = m?.height || 0;
    const left = Math.max(8, Math.min(b.right - w, window.innerWidth - w - 8));
    const below = b.bottom + 6 + h <= window.innerHeight - 8;
    setPos({ left, top: below ? b.bottom + 6 : Math.max(8, b.top - 6 - h) });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => {
      if (!menuRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener('mousedown', outside);
    document.addEventListener('touchstart', outside);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    menuRef.current?.querySelector('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('touchstart', outside);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open, pos]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
      btnRef.current?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const list = [...menuRef.current.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])')];
      const i = list.indexOf(document.activeElement);
      list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus();
    }
  };

  if (!items.some((it) => it.onClick || it.href)) return null;
  const itemCls = (it) => clsx(
    'tap flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-sm focus-visible:outline-none',
    it.disabled ? 'cursor-not-allowed text-muted' : clsx('hover:bg-panel2 focus-visible:bg-panel2', it.danger ? 'text-danger' : it.current ? 'bg-accent/10 font-semibold text-accent' : 'text-ink'),
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={title || label}
        className={clsx('tap-sq flex shrink-0 items-center justify-center rounded-lg text-muted hover:bg-panel2 hover:text-ink', className || 'h-8 w-8')}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}
          className="card fixed z-[1400] w-[300px] max-w-[calc(100vw-1rem)] p-2 shadow-[0_10px_30px_rgb(15_23_42/0.18)]"
        >
          {items.map((it, i) => {
            if (it.separator) return <div key={`s${i}`} className="my-1.5 h-px bg-line" role="separator" />;
            if (it.header) return <div key={`h${i}`} className="px-3 pb-1 pt-1.5 text-xs font-bold text-muted" role="presentation">{it.header}</div>;
            const body = (
              <>
                <span className="min-w-0 flex-1">{it.label}{it.hint && <span className="text-muted"> — {it.hint}</span>}</span>
              </>
            );
            if (it.href && !it.disabled) {
              return (
                <a key={it.key} role="menuitem" href={it.href} className={itemCls(it)} onClick={() => setOpen(false)}>
                  {body}
                </a>
              );
            }
            return (
              <button
                key={it.key}
                type="button"
                role="menuitem"
                aria-disabled={it.disabled || undefined}
                onClick={() => {
                  if (it.disabled) return;
                  setOpen(false);
                  it.onClick();
                }}
                className={itemCls(it)}
              >
                {body}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
