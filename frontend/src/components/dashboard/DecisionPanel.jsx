import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { ChevronRight, ClipboardCheck } from 'lucide-react';
import { useNavBadges } from '../layout/Sidebar';
import { usePermission } from '../../rbac/usePermission';
import { int } from '../../utils/format';
import { RISK } from '../../utils/risk';
import { ErrorState, Skeleton } from '../common/ui';

const COUNT = 'chip min-w-[2.25rem] justify-center px-2 py-0.5 font-mono text-xs font-black';

/**
 * "Việc chờ quyết định" của lãnh đạo / trực ban: chỉ những việc tài khoản này làm được, mỗi dòng mở thẳng trang xử lý.
 * Số liệu DÙNG LẠI của thanh menu (useNavBadges — cùng khoá truy vấn, không gọi thêm API) và KPI SOS đã có: lệnh cảnh báo
 * chờ bạn phê duyệt (quyền alert.approve + đã cấp PIN), SOS quá hạn / chờ tiếp nhận (sos.view), hồ sơ dữ liệu xã chờ duyệt
 * (data.import toàn tỉnh), phản ánh người dân chờ duyệt (report.view). Không ghi vào báo cáo PDF (việc riêng của người xem).
 * Chưa tải được KPI (máy chủ lỗi / đang tải) → KHÔNG nói "không có việc nào" khi thực ra chưa biết.
 */
export default function DecisionPanel({ k, kState, className }) {
  const badges = useNavBadges();
  const canSos = usePermission('sos', 'view');
  const sos = k?.sos || {};
  const rows = [
    badges.alerts > 0 && { to: '/canh-bao', n: badges.alerts, text: 'lệnh cảnh báo chờ bạn phê duyệt', cls: 'bg-accent text-white' },
    canSos && sos.overdue > 0 && { to: '/cuu-ho', n: sos.overdue, text: 'phiếu SOS quá hạn phản hồi', cls: RISK[3].chip },
    canSos && !(sos.overdue > 0) && sos.waiting > 0 && { to: '/cuu-ho', n: sos.waiting, text: 'phiếu SOS chờ tiếp nhận', cls: 'bg-accent text-white' },
    badges.submissions > 0 && { to: '/nhap-du-lieu', n: badges.submissions, text: 'hồ sơ dữ liệu xã chờ duyệt', cls: 'bg-accent text-white' },
    badges.reports > 0 && { to: '/phan-anh', n: badges.reports, text: 'phản ánh người dân chờ duyệt', cls: 'bg-accent text-white' },
  ].filter(Boolean);

  return (
    <section className={clsx('card flex flex-col gap-2 p-3 no-print', className)} aria-label="Việc chờ quyết định">
      <h2 className="card-title">
        <ClipboardCheck size={15} className="text-accent" aria-hidden="true" /> Việc chờ quyết định
      </h2>
      {!rows.length && !k ? (
        kState?.error
          ? <ErrorState onRetry={kState.refetch} className="!py-3">Không tải được — chưa biết việc nào đang chờ</ErrorState>
          : <Skeleton height={56} />
      ) : rows.length ? (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <li key={r.to + r.text}>
              <Link to={r.to} className="flex min-h-[44px] items-center gap-2.5 rounded-lg border border-line px-2.5 py-1.5 transition-colors hover:bg-panel2">
                <span className={clsx(COUNT, r.cls)}>{int(r.n)}</span>
                <span className="min-w-0 flex-1 text-xs font-semibold leading-snug text-ink">{r.text}</span>
                <ChevronRight size={15} className="shrink-0 text-muted" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-line px-3 py-2.5 text-xs text-muted">Không có việc nào đang chờ bạn quyết định.</p>
      )}
    </section>
  );
}
