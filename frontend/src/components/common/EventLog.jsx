import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Activity, AlertTriangle, LifeBuoy, MessageCircle, Search, Settings2, X } from 'lucide-react';
import { useAreaQuery } from '../../api/hooks';
import { time } from '../../utils/format';
import { risk } from '../../utils/risk';
import { useNewKeys } from '../../utils/useNewKeys';
import { EmptyState, ErrorState, Skeleton } from './ui';

// Nút lọc (chữ, không đếm) — thiết kế A: Tất cả / Cứu hộ / Cảnh báo / Người dân (hệ thống không còn theo dõi hồ chứa); "Khẩn" giữ bộ lọc chỉ sự kiện
// khẩn cấp của bản trước
const FILTERS = [
  { id: 'tat_ca', label: 'Tất cả', match: () => true },
  { id: 'cuu_ho', label: 'Cứu hộ', match: (l) => l.category === 'cuu_ho' },
  { id: 'canh_bao', label: 'Cảnh báo', match: (l) => l.category === 'canh_bao' },
  { id: 'nguoi_dan', label: 'Người dân', match: (l) => l.category === 'nguoi_dan' },
  { id: 'khan', label: 'Khẩn', match: (l) => l.severity === 'danger' },
];

// Biểu tượng + tên loại của từng sự kiện (luôn kèm chữ)
const KIND = {
  cuu_ho: { icon: LifeBuoy, label: 'Cứu hộ' },
  canh_bao: { icon: AlertTriangle, label: 'Cảnh báo' },
  nguoi_dan: { icon: MessageCircle, label: 'Người dân' },
  van_hanh: { icon: Settings2, label: 'Vận hành' },
  he_thong: { icon: Activity, label: 'Hệ thống' },
};
const kindOf = (l) => KIND[l.category] || KIND.he_thong;
// Mức của sự kiện theo thang màu chung: khẩn → Đỏ, cảnh báo → Cam; tin thường không tô màu
const SEV_LEVEL = { danger: 3, warning: 2 };
// Câu do máy chủ ghi có thể viết tắt "BĐ II" — hiện đủ chữ cho người đọc (không sửa dữ liệu gốc)
const plain = (m) => (m || '').replace(/\bBĐ\s+(I{1,3})\b/g, 'Báo động $1');

/**
 * Nhật ký sự kiện dạng dòng thời gian: mỗi dòng = giờ · biểu tượng loại (kèm chữ) · một câu. Sự kiện khẩn: chấm Đỏ + chữ
 * đậm; cảnh báo: chấm Cam — không tô nền, không nhấp nháy. Sự kiện mới tới khi đang xem trượt vào đầu danh sách (một lần).
 * Lọc bằng nút chữ (Tất cả / Cứu hộ / Cảnh báo / Người dân), tìm nhanh theo chữ. `preview` (số mục): chỉ HIỆN N
 * sự kiện mới nhất + nút "Xem tất cả" (iPad dọc / điện thoại) — chỉ cắt phần hiển thị, truy vấn (`limit`) giữ nguyên.
 */
export default function EventLog({ limit = 50, className, preview }) {
  const q = useAreaQuery('logs', '/dashboard/logs', { limit });
  const data = useMemo(() => q.data || [], [q.data]);
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState('tat_ca');
  const [search, setSearch] = useState('');
  const isNew = useNewKeys(data.map((l) => l.id), !!q.data);

  const filtered = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter);
    const needle = search.trim().toLowerCase();
    return data.filter((l) => f.match(l) && (!needle || (l.message || '').toLowerCase().includes(needle)));
  }, [data, filter, search]);
  const shown = preview && !showAll ? filtered.slice(0, preview) : filtered;

  return (
    <div className={clsx('flex h-full flex-col gap-2 print:h-auto', className)}>
      <div className="scroll-thin -mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-0.5 no-print" role="group" aria-label="Lọc nhật ký theo loại">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={clsx(
              'tap min-h-[32px] shrink-0 whitespace-nowrap rounded-lg border px-2.5 text-[13px] font-medium',
              filter === f.id ? 'border-accent bg-accent/10 font-semibold text-accent' : 'border-transparent text-ink-2 hover:bg-panel2 hover:text-ink',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="relative no-print">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm trong nhật ký (tên xã, trạm, phiếu…)"
          aria-label="Tìm trong nhật ký"
          className="input tap min-h-[36px] py-1 pl-8 pr-8 text-[13px]"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="tap-sq absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-muted hover:text-ink"
            aria-label="Xoá chữ tìm"
          >
            <X size={13} aria-hidden="true" />
          </button>
        )}
      </div>

      <ol className="scroll-thin flex-1 overflow-y-auto pr-1 print:max-h-none print:overflow-visible" aria-live="polite" aria-label="Các sự kiện, mới nhất trên cùng">
        {!q.data ? (
          // Chưa tải xong / lỗi tải: không nói "chưa có sự kiện" khi thực ra chưa biết
          <li>{q.isError ? <ErrorState onRetry={q.refetch}>Không tải được nhật ký sự kiện</ErrorState> : <Skeleton height={160} />}</li>
        ) : !filtered.length ? (
          <li>
            <EmptyState icon={Activity}>
              {data.length ? 'Không có sự kiện nào thuộc loại / chữ đang lọc' : 'Chưa có sự kiện nào trong vùng đang xem. Khi có phiếu cứu hộ, vận hành hồ, phản ánh của dân… sự kiện sẽ hiện ở đây.'}
            </EmptyState>
          </li>
        ) : (
          shown.map((l, i) => {
            const kind = kindOf(l);
            const lv = SEV_LEVEL[l.severity];
            const last = i === shown.length - 1;
            return (
              <li key={l.id} className={clsx('relative flex gap-2.5 pb-3', isNew(l.id) && 'motion-safe:animate-enter')}>
                {/* Trục thời gian: chấm theo mức (tin thường: chấm rỗng), đường nối xuống sự kiện kế */}
                <span className="relative flex w-3 shrink-0 justify-center pt-1.5" aria-hidden="true">
                  <span className={clsx('z-[1] h-2.5 w-2.5 rounded-full', lv ? risk(lv).fill : 'border-2 border-line bg-panel')} />
                  {!last && <span className="absolute bottom-[-0.375rem] top-4 w-px bg-line" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    <time className="num font-semibold text-ink-2" dateTime={l.time}>{time(l.time)}</time>
                    <kind.icon size={13} className="shrink-0" aria-hidden="true" />
                    <span>{kind.label}</span>
                    {lv === 3 && <span className="font-semibold text-danger">· khẩn</span>}
                  </div>
                  <p className={clsx('mt-0.5 text-sm leading-snug', lv === 3 ? 'font-semibold text-ink' : 'text-ink-2')}>{plain(l.message)}</p>
                </div>
              </li>
            );
          })
        )}
      </ol>
      {preview && !showAll && filtered.length > preview && (
        <button type="button" className="btn-ghost tap min-h-[40px] w-full justify-center text-xs font-semibold no-print" onClick={() => setShowAll(true)}>
          Xem tất cả {filtered.length} sự kiện
        </button>
      )}
    </div>
  );
}
