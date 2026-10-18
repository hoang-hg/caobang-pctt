import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { ChevronRight, CircleCheckBig } from 'lucide-react';
import { useNavBadges } from '../layout/Sidebar';
import { useAreaQuery } from '../../api/hooks';
import { isCommuneSupport } from '../rescue/rescueFacts';
import { usePermission } from '../../rbac/usePermission';
import { int } from '../../utils/format';
import { risk } from '../../utils/risk';
import { useNewKeys } from '../../utils/useNewKeys';
import { ErrorState, Hint, Skeleton } from '../common/ui';

/**
 * "Việc chờ quyết định" của lãnh đạo / trực ban — khối nổi bật đầu tiên của Tổng quan: mỗi dòng MỘT việc, con số lớn, câu
 * nói rõ việc gì, nút ghi đúng thao tác ("Duyệt lệnh", "Điều động"…) mở thẳng chỗ xử lý. Chỉ những việc tài khoản này làm
 * được. Số liệu DÙNG LẠI của thanh menu (useNavBadges — cùng khoá truy vấn, không gọi thêm API) và KPI SOS đã có: xã xin
 * chi viện, lệnh cảnh báo chờ bạn phê duyệt (quyền alert.approve + đã cấp PIN), SOS quá hạn / chờ (sos.view), hồ sơ dữ
 * liệu xã chờ duyệt (data.import toàn tỉnh), phản ánh người dân chờ duyệt (report.view). Số Đỏ chỉ cho việc thật sự khẩn
 * (xã xin chi viện, phiếu quá hạn). Việc mới xuất hiện → dòng trượt vào (một lần). Không ghi vào báo cáo PDF.
 * Chưa tải được KPI (máy chủ lỗi / đang tải) → KHÔNG nói "không có việc nào" khi thực ra chưa biết.
 */
export default function DecisionPanel({ k, kState, className }) {
  const badges = useNavBadges();
  const canSos = usePermission('sos', 'view');
  const { data: tickets = [] } = useAreaQuery('sos', '/sos', {}, { refetchInterval: 20_000, enabled: canSos });
  const communeRequests = tickets.filter((t) => isCommuneSupport(t) && t.status !== 'hoan_thanh').length;
  const sos = k?.sos || {};
  const rows = [
    canSos && communeRequests > 0 && {
      key: 'chi-vien', to: '/cuu-ho?th=xa_chi_vien', n: communeRequests, level: 3, text: 'xã/phường xin chi viện', action: 'Điều động',
    },
    badges.alerts > 0 && { key: 'canh-bao', to: '/canh-bao', n: badges.alerts, text: 'lệnh cảnh báo chờ duyệt', action: 'Duyệt lệnh' },
    canSos && sos.overdue > 0 && { key: 'sos-qua-han', to: '/cuu-ho', n: sos.overdue, level: 3, text: 'phiếu SOS quá hạn', action: 'Điều động' },
    canSos && !(sos.overdue > 0) && sos.waiting > 0 && {
      key: 'sos-cho', to: '/cuu-ho', n: sos.waiting, level: sos.no_team_15m > 0 ? 3 : undefined, text: 'phiếu SOS chờ nhận', action: 'Điều động',
    },
    badges.submissions > 0 && { key: 'ho-so', to: '/nhap-du-lieu', n: badges.submissions, text: 'hồ sơ của xã chờ duyệt', action: 'Duyệt hồ sơ' },
    badges.reports > 0 && { key: 'phan-anh', to: '/phan-anh', n: badges.reports, text: 'phản ánh của dân chờ duyệt', action: 'Duyệt' },
  ].filter(Boolean);
  // Dòng có từ lần vẽ đầu thì không trượt vào — chỉ việc MỚI phát sinh khi đang xem
  const fresh = useNewKeys(rows.map((r) => r.key), !!k);
  const total = rows.reduce((n, r) => n + r.n, 0);

  return (
    // Từ 640 px: tiêu đề bên trái, các việc thành MỘT hàng thẻ ngang bên phải — khối thấp, 6 ô chỉ số và bản đồ vẫn trong
    // màn hình đầu của laptop 1366 × 768. Điện thoại: danh sách dọc, mỗi dòng: số · việc · nút
    <section className={clsx('card flex flex-col gap-2 p-3 no-print sm:flex-row sm:items-stretch sm:gap-3', className)} aria-label="Việc chờ quyết định">
      <div className="flex items-center justify-between gap-2 sm:w-32 sm:shrink-0 sm:flex-col sm:items-start sm:justify-center sm:gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-base font-bold leading-tight text-ink">Việc chờ quyết định</h2>
          <Hint label="Việc chờ quyết định">
            Những việc đang chờ chính bạn xử lý. Bấm vào từng việc để mở đúng nơi làm việc đó; xong việc thì việc tự mất khỏi đây.
          </Hint>
        </div>
        {rows.length > 0 && <span className="num shrink-0 text-xs text-muted">{int(total)} việc</span>}
      </div>
      <div className="min-w-0 flex-1">
        {!rows.length && !k ? (
          kState?.error
            ? <ErrorState onRetry={kState.refetch} className="!py-3">Không tải được — chưa biết việc nào đang chờ</ErrorState>
            : <Skeleton height={56} />
        ) : rows.length ? (
          <ul className="flex flex-col divide-y divide-line sm:grid sm:auto-cols-fr sm:grid-flow-col sm:gap-2 sm:divide-y-0">
            {rows.map((r) => (
              <li key={r.key} className={clsx('min-w-0', fresh(r.key) && 'motion-safe:animate-enter')}>
                <Link
                  to={r.to}
                  className="group -mx-1 flex min-h-[46px] items-center gap-3 rounded-lg px-1 py-1 hover:bg-panel2 sm:mx-0 sm:h-full sm:gap-2.5 sm:border sm:border-line sm:px-2.5 sm:py-1.5 sm:hover:border-accent"
                >
                  <span className={clsx('num w-10 shrink-0 text-right text-[26px] font-extrabold leading-none sm:w-auto', r.level != null ? risk(r.level).text : 'text-ink')}>
                    {int(r.n)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-snug text-ink sm:text-[13px]">{r.text}</span>
                    <span className="hidden items-center text-xs font-semibold text-accent group-hover:underline sm:inline-flex">
                      {r.action} <ChevronRight size={13} aria-hidden="true" />
                    </span>
                  </span>
                  <span className="btn-secondary pointer-events-none shrink-0 px-2.5 py-1 text-xs font-semibold sm:hidden">
                    {r.action} <ChevronRight size={14} aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex h-full items-center gap-3 rounded-lg border border-dashed border-line px-3 py-2 text-sm text-ink-2">
            <CircleCheckBig size={26} strokeWidth={1.4} className="shrink-0 text-muted" aria-hidden="true" />
            <p className="leading-snug">
              Không có việc nào đang chờ bạn quyết định. Khi xã xin chi viện, có lệnh cảnh báo cần duyệt hay phiếu SOS quá hạn,
              việc sẽ hiện ở đây.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
