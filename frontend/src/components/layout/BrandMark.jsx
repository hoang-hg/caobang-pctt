import clsx from 'clsx';
import { ShieldAlert } from 'lucide-react';

/**
 * Biểu trưng hệ thống: khiên xanh (thanh trên, Đăng nhập, trang tài khoản) — màu đỏ chỉ dành cho báo động, quyết định
 * 23/10/2026 (docs/ke-hoach-lam-moi-giao-dien.md mục 12). Một chỗ vẽ để các trang không lệch nhau.
 * data-mau-chuyen: màu chuyển đã duyệt — ui-test bỏ qua.
 */
export default function BrandMark({ size = 40, className }) {
  return (
    <div
      data-mau-chuyen=""
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={clsx(
        'flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#3B82F6] to-[#1E40AF] text-white shadow-sm ring-1 ring-inset ring-white/20',
        className,
      )}
    >
      <ShieldAlert size={Math.round(size * 0.55)} />
    </div>
  );
}

/** Biểu trưng + tên đầy đủ hai dòng (Đăng nhập, trang tài khoản) — màu chữ theo khối cha. */
export function BrandLockup({ className }) {
  return (
    <div className={clsx('flex items-center gap-3', className)}>
      <BrandMark />
      <div className="leading-tight">
        <div className="font-bold">BCH PCTT & TKCN tỉnh Cao Bằng</div>
        <div className="text-sm opacity-80">Hệ thống điều hành phòng chống thiên tai</div>
      </div>
    </div>
  );
}
