import clsx from 'clsx';
import { risk } from '../../utils/risk';

/**
 * Thẻ chỉ số của Dashboard. `level` theo thang màu rủi ro chung (utils/risk.js): 0–3 = Xanh / Vàng / Cam / Đỏ (vạch màu
 * bên trái, nền nhạt từ Vàng trở lên); `null` = chưa có dữ liệu (viền nét đứt, biểu tượng xám — không tô xanh như "bình
 * thường"); bỏ trống = chỉ số không mang mức rủi ro (sơ tán, lực lượng). `alert` = cần xử lý ngay: viền đỏ đậm, chỉ nhãn
 * góc nhấp nháy (cả thẻ nhấp nháy thì không đọc được số) — tắt khi hệ điều hành bật "giảm chuyển động".
 */
export default function StatCard({ icon: Icon, title, badge, value, unit, footer, level, alert, className, children }) {
  const scale = level === undefined ? null : risk(level);
  return (
    <div
      className={clsx(
        'card flex min-w-0 flex-col justify-between gap-1 p-3',
        level != null && clsx('border-l-4', scale.edge, level > 0 && scale.soft),
        level === null && 'border-dashed',
        alert && 'ring-2 ring-danger',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs font-bold text-muted">
        <span className="flex min-w-0 items-center gap-1.5 uppercase tracking-wider">
          {Icon && <Icon size={15} className={clsx('shrink-0', scale ? scale.text : 'text-accent')} aria-hidden="true" />}
          <span className="truncate">{title}</span>
        </span>
        {badge && <span className={clsx('shrink-0', alert && 'motion-safe:animate-blink')}>{badge}</span>}
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

/** Nhãn nhỏ ở góc thẻ — `level` (0–3 / null) lấy màu chip của thang rủi ro chung; `className` để tuỳ biến khác. */
export const Badge = ({ level, className, children }) => (
  <span className={clsx('chip shrink-0 px-1.5 py-0 text-[10px] font-bold', level !== undefined && risk(level).chip, className)}>{children}</span>
);
