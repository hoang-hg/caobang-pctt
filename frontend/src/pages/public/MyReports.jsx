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
 * "Phiếu của tôi" (Đ5): phản ánh người dân đã gửi khi đăng nhập, mới trước; "Xem tiến độ" tra cứu bằng mã + số điện thoại
 * của tài khoản (không phải nhập lại). Chưa đăng nhập → không hiện (tra cứu bằng mã như cũ ở ngay dưới).
 */
export default function MyReports({ onTrack }) {
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
        <p className="text-sm text-muted">Bạn chưa gửi phản ánh nào bằng tài khoản này. Phản ánh gửi khi đã đăng nhập sẽ hiện ở đây.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {items.map((r) => {
            const [label, cls] = STATUS[r.status] || [r.status, 'bg-panel2 text-muted'];
            return (
              <li key={r.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="num text-sm text-ink">{r.code}</b>
                    <span className={clsx('chip text-[11px] font-semibold', cls)}>{label}</span>
                  </div>
                  <p className="truncate text-xs text-muted">
                    {r.category_label}{r.admin_name ? ` · ${r.admin_name}` : ''} · {dateTime(r.created_at)}
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
