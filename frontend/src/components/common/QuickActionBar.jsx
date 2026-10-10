import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { PhoneCall, Siren } from 'lucide-react';

const BTN = 'relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-bold active:scale-95';

/**
 * Thanh thao tác nhanh dưới cùng màn hình hẹp (vùng ngón cái của cả hai tay). Khung giống nhau trên mọi trang: "Báo SOS" ở
 * GIỮA, nổi lên; "Gọi 112" ở mép phải, tách xa Báo SOS để không bấm nhầm. Ba ô còn lại tuỳ trang — `slots` = [trái 1, trái 2,
 * phải]: Dashboard "Mực nước · Bản đồ · Cứu hộ", Bản đồ "Lớp · Cảnh báo · Thời gian". Ô `null` (tài khoản không có quyền)
 * để trống, giữ nguyên vị trí các nút khác; `onSos` trống (không có quyền báo SOS) → ô giữa trống.
 * Ô: { key, label, icon, onClick | to, badge (số, đỏ), active (đang mở — nút bật / tắt) }. `className`: z-index + khổ ẩn
 * thanh (mặc định ẩn từ 640 px như Dashboard; trang Bản đồ tự quyết định khi nào vẽ thanh).
 */
export default function QuickActionBar({ slots = [], onSos, className = 'z-40 sm:hidden' }) {
  const cell = (s, i) => {
    if (!s) return <span key={`trong-${i}`} />;
    const Icon = s.icon;
    const cls = clsx(BTN, s.active ? 'bg-accent/15 text-accent' : 'text-ink');
    const inner = (
      <>
        <Icon size={18} className="text-accent" aria-hidden="true" /> {s.label}
        {s.badge > 0 && (
          <span className="absolute right-1 top-1 min-w-[18px] rounded-full bg-danger px-1 text-center text-[10px] leading-[18px] text-white">
            {s.badge > 99 ? '99+' : s.badge}
          </span>
        )}
      </>
    );
    return s.to ? (
      <Link key={s.key} to={s.to} className={cls}>{inner}</Link>
    ) : (
      <button key={s.key} type="button" onClick={s.onClick} className={cls} aria-pressed={s.active === undefined ? undefined : s.active}>
        {inner}
      </button>
    );
  };
  return (
    <nav
      className={clsx(
        'fixed inset-x-0 bottom-0 grid grid-cols-5 items-end gap-1 border-t border-line bg-panel/95 px-2 pb-[calc(0.375rem+env(safe-area-inset-bottom))] pt-1.5 shadow-2xl backdrop-blur print:hidden',
        className,
      )}
      aria-label="Thao tác nhanh"
    >
      {cell(slots[0], 0)}
      {cell(slots[1], 1)}
      {onSos ? (
        <button
          type="button"
          onClick={onSos}
          className={clsx(BTN, '-mt-5 min-h-[64px] bg-danger text-xs font-black text-white shadow-lg shadow-danger/30 ring-4 ring-panel')}
        >
          <Siren size={22} aria-hidden="true" /> Báo SOS
        </button>
      ) : <span />}
      {cell(slots[2], 2)}
      <a href="tel:112" className={clsx(BTN, 'text-danger')} title="Gọi điện khẩn cấp 112">
        <PhoneCall size={18} aria-hidden="true" /> Gọi 112
      </a>
    </nav>
  );
}
