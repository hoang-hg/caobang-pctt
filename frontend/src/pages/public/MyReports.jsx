import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ClipboardList, Search } from 'lucide-react';
import { citizenApi } from '../../api/citizen';
import { useCitizen } from '../../app/citizenSession';
import { ErrorState, Skeleton } from '../../components/common/ui';
import { dateTime } from '../../utils/format';

const STATUS = {
  cho_duyet: ['Chờ cán bộ xác minh', 'bg-warn/20 text-ink'],
  da_duyet: ['Đã xác minh, đang công khai', 'bg-good/15 text-good'],
  da_xu_ly: ['Đã xử lý', 'bg-accent/10 text-accent'],
  tu_choi: ['Không công khai', 'bg-panel2 text-muted'],
};

/**
 * "Phiếu của tôi" (Đ5): yêu cầu người dân đã gửi khi đăng nhập, mới trước, mỗi phiếu MỘT nhãn tiến độ do máy chủ tính
 * (progress_label — phiếu đã thành phiếu cứu hộ theo tiến độ phiếu SOS; phiếu cứu hộ còn mở tô đỏ); "Xem tiến độ" tra cứu bằng
 * mã + số điện thoại của tài khoản (không phải nhập lại). Chưa đăng nhập → không hiện (tra cứu bằng mã như cũ ở ngay dưới).
 */
// `compact` (cột trái của Tra cứu phiếu trên máy tính — bản vẽ khung N10): mỗi phiếu là một nút gọn (mã · tiến độ, loại · giờ
// gửi), phiếu đang xem (`active`) viền nhấn
export default function MyReports({ onTrack, compact = false, active = '' }) {
  const session = useCitizen((s) => s.session);
  const ready = !!session && !session.account.must_change_password;
  const q = useQuery({
    queryKey: ['my-reports', session?.account?.id],
    queryFn: () => citizenApi('/public/account/reports'),
    enabled: ready,
    refetchInterval: 60_000,
  });
  if (!ready) return null;
  const items = q.data || [];
  if (compact) {
    return (
      <section className="mt-2 flex flex-col gap-2" aria-label="Phiếu của tôi">
        <h3 className="text-xs font-bold text-ink-2">Phiếu của tôi</h3>
        {q.isLoading ? <Skeleton height={72} /> : q.isError && !q.data ? (
          <ErrorState onRetry={() => q.refetch()}>Không tải được danh sách phiếu của bạn</ErrorState>
        ) : !items.length ? (
          <p className="text-[13px] text-muted">Bạn chưa gửi yêu cầu nào bằng tài khoản này.</p>
        ) : (
          <ul className="scroll-thin flex max-h-[22rem] flex-col gap-2 overflow-y-auto">
            {items.map((r) => {
              const [label] = STATUS[r.status] || [r.status];
              // Mã tra cứu có đuôi (PA-1001-KXMPQR) vẫn là phiếu PA-1001
              const on = !!active && [r.code, r.sos_code].some((c) => c && (active === c || active.startsWith(`${c}-`)));
              return (
                <li key={r.code}>
                  <button
                    type="button"
                    onClick={() => onTrack(r.code, session.account.phone)}
                    aria-current={on ? 'true' : undefined}
                    className={clsx('tap w-full rounded-[14px] border-2 px-3.5 py-2.5 text-left transition-colors', on ? 'border-accent bg-accent/5' : 'border-transparent bg-panel2 hover:border-line')}
                  >
                    <span className="block text-sm text-ink">
                      <b className="num">{r.code}</b>{' '}
                      <span className={clsx('text-[13px]', r.rescue_open ? 'font-semibold text-danger' : 'text-muted')}>({r.progress_label || label})</span>
                    </span>
                    <span className="block truncate text-xs text-muted">{r.category_label} · gửi {dateTime(r.created_at)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  }
  return (
    <section className="card flex flex-col gap-3 p-4" aria-label="Phiếu của tôi">
      <h2 className="flex items-center gap-2 text-base font-bold text-ink">
        <ClipboardList size={18} className="text-accent" aria-hidden="true" /> Phiếu của tôi
      </h2>
      {q.isLoading ? (
        <Skeleton height={96} />
      ) : q.isError && !q.data ? (
        <ErrorState onRetry={() => q.refetch()}>Không tải được danh sách phiếu của bạn</ErrorState>
      ) : !items.length ? (
        <p className="text-sm text-muted">Bạn chưa gửi yêu cầu nào bằng tài khoản này. Yêu cầu gửi khi đã đăng nhập sẽ hiện ở đây.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {items.map((r) => {
            const [label, cls] = STATUS[r.status] || [r.status, 'bg-panel2 text-muted'];
            return (
              <li key={r.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="num text-sm text-ink">{r.code}</b>
                    <span className={clsx('chip text-[11px] font-semibold', r.rescue_open ? 'bg-danger/15 text-danger' : cls)}>
                      {r.progress_label || label}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted">
                    {r.category_label}{r.sos_code ? ` · phiếu cứu hộ ${r.sos_code}` : ''}{r.admin_name ? ` · ${r.admin_name}` : ''} · {dateTime(r.created_at)}
                  </p>
                </div>
                <button type="button" className="btn-secondary tap shrink-0 px-3 text-xs" onClick={() => onTrack(r.code, session.account.phone)}>
                  <Search size={14} aria-hidden="true" /> Xem tiến độ
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
