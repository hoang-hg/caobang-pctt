import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { risk } from '../../utils/risk';

/**
 * Thẻ chỉ số của Dashboard. `level` theo thang màu rủi ro chung (utils/risk.js): 0–3 = Xanh / Vàng / Cam / Đỏ (vạch màu
 * bên trái + màu biểu tượng; nền giữ trắng — cả hàng thẻ tô hồng thì mắt không còn tìm ra ô thật sự gấp); `null` = chưa có dữ liệu (viền nét đứt, biểu tượng xám — không tô xanh như "bình
 * thường"); bỏ trống = chỉ số không mang mức rủi ro (sơ tán, lực lượng). `alert` = cần xử lý ngay: viền đỏ đậm, chỉ nhãn
 * góc nhấp nháy (cả thẻ nhấp nháy thì không đọc được số) — tắt khi hệ điều hành bật "giảm chuyển động".
 *
 * `compact`: ô gọn của hàng KPI (lãnh đạo đọc trong vài giây, vừa 2 cột ở màn 360 px): tiêu đề · số lớn · nhãn mức ·
 * một dòng ngữ cảnh. `onClick` → cả ô là nút; `to` → cả ô là liên kết (khi đó KHÔNG đặt nút / liên kết khác bên trong).
 * `aside`: thông tin phụ cạnh nhãn mức của ô gọn (VD mũi tên xu hướng) — không nhấp nháy theo `alert`.
 * `trend`: mũi tên xu hướng ở góc phải hàng tiêu đề (TrendTag) — ô gọn không cần thêm một hàng nhãn.
 * Số đổi (số liệu mới về) → số hiện lên nhẹ một lần (tắt khi hệ điều hành bật "giảm chuyển động").
 * `footerRows`: chân ô gọn là vài dòng ngắn, mỗi dòng tự cắt phần chữ thừa — bỏ giới hạn 1–2 dòng của câu ngữ cảnh thường.
 */
export default function StatCard({
  icon: Icon, title, badge, aside, trend, value, unit, footer, footerRows = false, level, alert, className, children, compact = false,
  onClick, to, hint,
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
        level != null && clsx('border-l-4', scale.edge),
        level === null && 'border-dashed',
        alert && 'ring-2 ring-danger',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-ink-2">
        <span className={clsx('flex min-w-0 items-center gap-1.5', compact && 'text-[13px] [.kpi-lon_&]:text-lg')}>
          {Icon && <Icon size={15} className={clsx('shrink-0', scale ? scale.text : 'text-accent')} aria-hidden="true" />}
          <span className="truncate">{title}</span>
        </span>
        {!compact && badgeEl}
        {trend && <span className="min-w-0 shrink-0 text-[11px] [.kpi-lon_&]:text-sm">{trend}</span>}
      </div>
      {value !== undefined && (
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span
            key={value}
            className={clsx('num font-extrabold leading-none tracking-tight text-ink motion-safe:animate-tick', compact ? 'text-[26px] sm:text-[28px] [.kpi-lon_&]:text-5xl' : 'text-2xl lg:text-3xl')}
          >
            {value}
          </span>
          {unit && <span className={clsx('font-medium text-muted', compact ? 'truncate text-xs' : 'text-sm')}>{unit}</span>}
        </div>
      )}
      {/* Ô gọn: nhãn mức nằm hàng riêng dưới số (góc phải của ô 2 cột trên điện thoại không đủ chỗ) */}
      {compact && (badgeEl || aside) && (
        <div className="flex min-w-0 items-center gap-1.5">
          {badgeEl}
          {aside}
        </div>
      )}
      {children}
      {footer && (
        <div
          className={clsx(
            'text-ink-2',
            compact
              ? clsx('text-[13px] leading-snug [.kpi-lon_&]:text-lg', !footerRows && 'line-clamp-1 sm:line-clamp-2')
              : 'border-t border-line/60 pt-1.5 text-xs',
          )}
        >
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
