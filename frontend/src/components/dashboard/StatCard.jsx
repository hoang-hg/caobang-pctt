import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { risk } from '../../utils/risk';

/**
 * Thẻ chỉ số của Dashboard. `level` theo thang màu rủi ro chung (utils/risk.js): 0–3 = Xanh / Vàng / Cam / Đỏ (vạch màu
 * bên trái, nền nhạt từ Vàng trở lên); `null` = chưa có dữ liệu (viền nét đứt, biểu tượng xám — không tô xanh như "bình
 * thường"); bỏ trống = chỉ số không mang mức rủi ro (sơ tán, lực lượng). `alert` = cần xử lý ngay: viền đỏ đậm, chỉ nhãn
 * góc nhấp nháy (cả thẻ nhấp nháy thì không đọc được số) — tắt khi hệ điều hành bật "giảm chuyển động".
 *
 * `compact`: ô gọn của hàng KPI (lãnh đạo đọc trong vài giây, vừa 2 cột ở màn 360 px): tiêu đề · số lớn · nhãn mức ·
 * một dòng ngữ cảnh. `onClick` → cả ô là nút; `to` → cả ô là liên kết (khi đó KHÔNG đặt nút / liên kết khác bên trong).
 */
export default function StatCard({
  icon: Icon, title, badge, value, unit, footer, level, alert, className, children, compact = false, onClick, to, hint,
}) {
  const scale = level === undefined ? null : risk(level);
  const Tag = to ? Link : onClick ? 'button' : 'div';
  const tagProps = to ? { to } : onClick ? { type: 'button', onClick } : {};
  const badgeEl = badge && <span className={clsx('shrink-0', alert && 'motion-safe:animate-blink')}>{badge}</span>;
  return (
    <Tag
      {...tagProps}
      title={hint}
      className={clsx(
        // w-full: ô là <button> / <a> (tự co theo nội dung) nằm trong lớp bọc vẫn phải giãn hết cột
        'card flex w-full min-w-0 flex-col text-left',
        compact ? 'gap-1 p-2 sm:p-2.5' : 'justify-between gap-1 p-3',
        (to || onClick) && 'transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        level != null && clsx('border-l-4', scale.edge, level > 0 && scale.soft),
        level === null && 'border-dashed',
        alert && 'ring-2 ring-danger',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs font-bold text-muted">
        <span className={clsx('flex min-w-0 items-center gap-1.5 uppercase', compact ? 'text-[11px] tracking-wide [.kpi-lon_&]:text-xs' : 'tracking-wider')}>
          {Icon && <Icon size={15} className={clsx('shrink-0', scale ? scale.text : 'text-accent')} aria-hidden="true" />}
          <span className="truncate">{title}</span>
        </span>
        {!compact && badgeEl}
      </div>
      {value !== undefined && (
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className={clsx('font-mono font-black tabular-nums tracking-tight text-ink', compact ? 'text-xl leading-tight sm:text-2xl [.kpi-lon_&]:text-4xl' : 'text-2xl lg:text-3xl')}>
            {value}
          </span>
          {unit && <span className={clsx('font-mono font-bold text-muted', compact ? 'truncate text-[11px]' : 'text-xs')}>{unit}</span>}
        </div>
      )}
      {/* Ô gọn: nhãn mức nằm hàng riêng dưới số (góc phải của ô 2 cột trên điện thoại không đủ chỗ) */}
      {compact && badgeEl && <div className="flex min-w-0">{badgeEl}</div>}
      {children}
      {footer && (
        <div className={clsx('text-ink-2', compact ? 'line-clamp-1 text-[11px] leading-snug sm:line-clamp-2 [.kpi-lon_&]:text-xs' : 'border-t border-line/60 pt-1.5 text-xs')}>
          {footer}
        </div>
      )}
    </Tag>
  );
}

/** Nhãn nhỏ ở góc thẻ — `level` (0–3 / null) lấy màu chip của thang rủi ro chung; `className` để tuỳ biến khác. */
export const Badge = ({ level, className, children }) => (
  <span className={clsx('chip shrink-0 px-1.5 py-0 text-[10px] font-bold', level !== undefined && risk(level).chip, className)}>{children}</span>
);
