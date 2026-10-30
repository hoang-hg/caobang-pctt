import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { Camera, ChevronRight, CircleCheckBig, FileUp, HandHelping, Maximize2, Megaphone, Minimize2, Siren } from 'lucide-react';
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
 * `stacked`: danh sách dọc ở mọi cỡ màn (cột trái của Tổng quan màn lớn ≥ 1680 px — cạnh bản đồ lớn). `heroLayout`: nút mở
 * rộng / thu gọn khối này so với bản đồ (màn lớn). Laptop / máy tính bảng (640 – 1679 px): DecisionStrip trong khối đầu trang.
 */
function useDecisionRows(k) {
  const badges = useNavBadges();
  const canSos = usePermission('sos', 'view');
  const { data: tickets = [] } = useAreaQuery('sos', '/sos', {}, { refetchInterval: 20_000, enabled: canSos });
  const communeRequests = tickets.filter((t) => isCommuneSupport(t) && t.status !== 'hoan_thanh').length;
  const sos = k?.sos || {};
  const rows = [
    canSos && communeRequests > 0 && {
      key: 'chi-vien', to: '/cuu-ho?th=xa_chi_vien', n: communeRequests, level: 3, text: 'xã/phường xin chi viện', action: 'Điều động', icon: HandHelping,
    },
    badges.alerts > 0 && { key: 'canh-bao', to: '/canh-bao', n: badges.alerts, text: 'lệnh cảnh báo chờ duyệt', action: 'Duyệt lệnh', icon: Megaphone },
    canSos && sos.overdue > 0 && { key: 'sos-qua-han', to: '/cuu-ho', n: sos.overdue, level: 3, text: 'phiếu SOS quá hạn', action: 'Điều động', icon: Siren },
    canSos && !(sos.overdue > 0) && sos.waiting > 0 && {
      key: 'sos-cho', to: '/cuu-ho', n: sos.waiting, level: sos.no_team_15m > 0 ? 3 : undefined, text: 'phiếu SOS chờ nhận', action: 'Điều động', icon: Siren,
    },
    badges.submissions > 0 && { key: 'ho-so', to: '/nhap-du-lieu', n: badges.submissions, text: 'hồ sơ của xã chờ duyệt', action: 'Duyệt hồ sơ', icon: FileUp },
    badges.reports > 0 && { key: 'phan-anh', to: '/phan-anh', n: badges.reports, text: 'phản ánh của dân chờ duyệt', action: 'Duyệt', icon: Camera },
  ].filter(Boolean);
  // Dòng có từ lần vẽ đầu thì không trượt vào — chỉ việc MỚI phát sinh khi đang xem
  const fresh = useNewKeys(rows.map((r) => r.key), !!k);
  const total = rows.reduce((n, r) => n + r.n, 0);
  return { rows, fresh, total };
}

const HINT = 'Những việc đang chờ chính bạn xử lý. Bấm vào từng việc để mở đúng nơi làm việc đó; xong việc thì việc tự mất khỏi đây.';

/**
 * "Việc chờ quyết định" nằm TRONG khối đầu trang Tổng quan (diện mạo B — một khối dẫn đầu; 640 – 1679 px): một hàng nút
 * việc trên nền xanh đêm — số · việc · thao tác. Cùng dữ liệu, cùng quy tắc với DecisionPanel (chỉ Đỏ cho việc khẩn).
 */
export function DecisionStrip({ k, kState, className }) {
  const { rows, fresh, total } = useDecisionRows(k);
  return (
    <section aria-label="Việc chờ quyết định" className={clsx('flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-white/10 pt-2 no-print', className)}>
      <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-ink-2">
        <h2 className="text-xs font-semibold">Việc chờ quyết định</h2>
        <Hint label="Việc chờ quyết định">{HINT}</Hint>
        {rows.length > 0 && <span className="num text-muted">· {int(total)} việc</span>}
      </span>
      {!rows.length && !k ? (
        kState?.error
          ? <span className="text-xs text-muted">Không tải được — chưa biết việc nào đang chờ</span>
          : <Skeleton height={32} className="w-64" />
      ) : rows.length ? (
        <ul className="flex min-w-0 flex-wrap gap-1.5">
          {rows.map((r) => (
            <li key={r.key} className={clsx('min-w-0', fresh(r.key) && 'motion-safe:animate-enter')}>
              <Link
                to={r.to}
                className={clsx(
                  'group tap flex items-center gap-2 rounded-full border px-3 py-1 text-[13px] transition-colors',
                  r.level === 3 ? 'border-danger/60 bg-danger/15 hover:bg-danger/25' : 'border-white/15 bg-white/[0.06] hover:bg-white/[0.12]',
                )}
              >
                <r.icon size={14} className={clsx('shrink-0', r.level === 3 ? 'text-danger' : 'text-accent')} aria-hidden="true" />
                <b className={clsx('num font-extrabold', r.level != null ? risk(r.level).text : 'text-ink')}>{int(r.n)}</b>
                <span className="text-ink">{r.text}</span>
                <span className={clsx('inline-flex items-center gap-0.5 text-xs font-semibold group-hover:underline', r.level === 3 ? 'text-danger' : 'text-accent')}>
                  {r.action} <ChevronRight size={13} aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <span className="flex items-center gap-1.5 text-xs text-ink-2">
          <CircleCheckBig size={14} className="shrink-0 text-muted" aria-hidden="true" /> Không có việc nào đang chờ bạn quyết định.
        </span>
      )}
    </section>
  );
}

export default function DecisionPanel({ k, kState, className, stacked = false, heroLayout, onSetHeroLayout }) {
  // Lớp chỉ áp từ 640 px khi xếp ngang; `stacked` giữ kiểu danh sách dọc của điện thoại
  const row = (cls) => (stacked ? null : cls);
  const { rows, fresh, total } = useDecisionRows(k);

  return (
    // Từ 640 px: tiêu đề bên trái, các việc thành MỘT hàng thẻ ngang bên phải — khối thấp, 6 ô chỉ số và bản đồ vẫn trong
    // màn hình đầu của laptop 1366 × 768. Điện thoại: danh sách dọc, mỗi dòng: số · việc · nút
    <section className={clsx('card flex flex-col gap-2 p-3 no-print', row('sm:flex-row sm:items-stretch sm:gap-3'), className)} aria-label="Việc chờ quyết định">
      <div className={clsx('flex items-center justify-between gap-2', row('sm:w-32 sm:shrink-0 sm:flex-col sm:items-start sm:justify-center sm:gap-1'))}>
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-base font-bold leading-tight text-ink">Việc chờ quyết định</h2>
          <Hint label="Việc chờ quyết định">{HINT}</Hint>
        </div>
        <div className="flex items-center gap-1.5">
          {rows.length > 0 && (
            <span className={clsx(
              'chip shrink-0 px-2 py-0.5 text-xs',
              rows.some((r) => r.level === 3) ? 'bg-danger/15 font-bold text-danger' : 'bg-accent/10 font-semibold text-accent',
            )}>
              {/* Hàng thẻ ngang (từ 640 px): cột tiêu đề hẹp 128 px — chữ gọn để các thẻ việc không bị ép xuống 3 dòng */}
              {int(total)} việc<span className={row('sm:hidden')}> cần xử lý</span>
            </span>
          )}
          {heroLayout && onSetHeroLayout && (
            <div className="-my-1 hidden shrink-0 items-center gap-1 sm:flex">
              {heroLayout === 'split' ? (
                <>
                  <button
                    type="button"
                    onClick={() => onSetHeroLayout('left_full')}
                    title="Mở rộng việc chờ & 6 chỉ số hết bề ngang (thu gọn bản đồ)"
                    className="btn-ghost tap p-1 text-muted hover:text-accent rounded-md"
                    aria-label="Mở rộng việc chờ và 6 chỉ số"
                  >
                    <Maximize2 size={13} />
                    <span className="text-[11px] font-semibold hidden 2xl:inline ml-0.5">Mở rộng</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetHeroLayout('right_full')}
                    title="Thu gọn việc chờ & 6 chỉ số (bản đồ mở rộng hết bề ngang)"
                    className="btn-ghost tap p-1 text-muted hover:text-accent rounded-md"
                    aria-label="Thu gọn việc chờ và 6 chỉ số"
                  >
                    <Minimize2 size={13} />
                    <span className="text-[11px] font-semibold hidden 2xl:inline ml-0.5">Thu gọn</span>
                  </button>
                </>
              ) : heroLayout === 'left_full' ? (
                <button
                  type="button"
                  onClick={() => onSetHeroLayout('split')}
                  title="Khôi phục hiển thị bản đồ điểm nóng bên cạnh"
                  className="btn-ghost tap flex items-center gap-1 border border-accent/40 bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent hover:bg-accent/20 rounded-md"
                >
                  <Minimize2 size={12} />
                  <span>Hiện lại bản đồ</span>
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        {!rows.length && !k ? (
          kState?.error
            ? <ErrorState onRetry={kState.refetch} className="!py-3">Không tải được — chưa biết việc nào đang chờ</ErrorState>
            : <Skeleton height={56} />
        ) : rows.length ? (
          <ul className={clsx('flex flex-col divide-y divide-line', row('sm:grid sm:auto-cols-fr sm:grid-flow-col sm:gap-2 sm:divide-y-0'))}>
            {rows.map((r) => (
              <li key={r.key} className={clsx('min-w-0', fresh(r.key) && 'motion-safe:animate-enter')}>
                <Link
                  to={r.to}
                  className={clsx(
                    'group -mx-1 flex min-h-[46px] items-center gap-3 rounded-xl px-1 py-1 transition duration-150 hover:bg-panel2',
                    row('sm:mx-0 sm:h-full sm:gap-2.5 sm:border sm:border-line sm:bg-panel sm:px-2.5 sm:py-1.5 sm:shadow-sm sm:hover:-translate-y-0.5 sm:hover:border-accent sm:hover:shadow-md'),
                    r.level === 3 && row('sm:border-danger/35 sm:bg-danger/[0.04] sm:hover:border-danger sm:hover:shadow-danger/10'),
                  )}
                >
                  {/* Ô biểu tượng loại việc (từ 640 px): việc khẩn — ô đỏ nhạt */}
                  <span className={clsx('icon-tile h-8 w-8 max-sm:hidden', r.level === 3 && 'bg-danger/10 text-danger ring-danger/20')} aria-hidden="true">
                    <r.icon size={16} />
                  </span>
                  <span className={clsx('num w-10 shrink-0 text-right text-[26px] font-extrabold leading-none', row('sm:w-auto'), r.level != null ? risk(r.level).text : 'text-ink')}>
                    {int(r.n)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={clsx('block text-sm font-medium leading-snug text-ink', row('sm:text-[13px]'), r.level === 3 && 'font-semibold text-danger')}>{r.text}</span>
                    {!stacked && (
                      <span className={clsx(
                        'hidden items-center gap-0.5 text-xs font-semibold sm:inline-flex',
                        r.level === 3 ? 'text-danger group-hover:underline' : 'text-accent group-hover:underline',
                      )}>
                        {r.action} <ChevronRight size={13} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                      </span>
                    )}
                  </span>
                  <span className={clsx(
                    'pointer-events-none shrink-0 px-2.5 py-1 text-xs font-semibold',
                    r.level === 3 ? 'btn-danger' : 'btn-secondary',
                    row('sm:hidden'),
                  )}>
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
