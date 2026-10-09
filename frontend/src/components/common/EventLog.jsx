import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Activity, AlertTriangle, LifeBuoy, MessageCircle, Settings2, Siren, Search, X, ShieldAlert } from 'lucide-react';
import { useAreaQuery } from '../../api/hooks';
import { time } from '../../utils/format';
import { ErrorState, Skeleton } from './ui';

const CAT = {
  tat_ca: { label: 'Tất cả' },
  // van_hanh gồm cả hồ chứa, xuất/nhập kho, phương tiện, kết thúc sự cố, bản tin dự báo — không chỉ hồ chứa
  van_hanh: { icon: Settings2, label: 'Vận hành' },
  cuu_ho: { icon: LifeBuoy, label: 'Cứu hộ' },
  canh_bao: { icon: AlertTriangle, label: 'Cảnh báo' },
  nguoi_dan: { icon: MessageCircle, label: 'Người dân' },
  he_thong: { icon: Activity, label: 'Hệ thống' },
};

const SEV = {
  danger: 'border-l-danger bg-danger/10 text-ink shadow-sm shadow-danger/10',
  warning: 'border-l-warn bg-warn/10 text-ink',
  info: 'border-l-accent/50 bg-panel2/60 text-ink',
};

/**
 * Nhật ký sự kiện & luồng cảnh báo nâng cấp cho Trung tâm Điều hành Tác chiến. `preview` (số mục): chỉ HIỆN N sự kiện mới
 * nhất + nút "Xem tất cả" (iPad dọc / điện thoại) — chỉ cắt phần hiển thị, truy vấn (`limit`) giữ nguyên.
 */
export default function EventLog({ limit = 50, className, preview }) {
  const q = useAreaQuery('logs', '/dashboard/logs', { limit });
  const data = useMemo(() => q.data || [], [q.data]);
  const [showAll, setShowAll] = useState(false);
  const [selectedCat, setSelectedCat] = useState('tat_ca');
  const [search, setSearch] = useState('');
  const [onlyDanger, setOnlyDanger] = useState(false);

  const dangerCount = useMemo(() => data.filter((l) => l.severity === 'danger').length, [data]);

  const filtered = useMemo(() => {
    return data.filter((l) => {
      if (selectedCat !== 'tat_ca' && l.category !== selectedCat) return false;
      if (onlyDanger && l.severity !== 'danger') return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (l.message || '').toLowerCase().includes(q) || (l.category || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [data, selectedCat, onlyDanger, search]);

  return (
    <div className={clsx('flex flex-col h-full gap-2.5 print:h-auto', className)}>
      {/* Thanh tab lọc danh mục sự kiện */}
      <div className="flex items-center gap-1 overflow-x-auto scroll-thin pb-1 border-b border-line/70">
        {Object.entries(CAT).map(([key, item]) => {
          const active = selectedCat === key && !onlyDanger;
          const count = key === 'tat_ca' ? data.length : data.filter((d) => d.category === key).length;
          return (
            <button
              key={key}
              onClick={() => { setSelectedCat(key); setOnlyDanger(false); }}
              className={clsx(
                'flex min-h-[32px] items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all',
                active
                  ? 'bg-accent text-white shadow-sm shadow-accent/25'
                  : 'bg-panel2/70 text-muted hover:text-ink hover:bg-panel2'
              )}
            >
              {item.icon && <item.icon size={11} />}
              <span>{item.label}</span>
              <span className={clsx('text-[10px] px-1 rounded-full', active ? 'bg-white/20 text-white' : 'bg-line text-muted')}>
                {count}
              </span>
            </button>
          );
        })}

        {dangerCount > 0 && (
          <button
            onClick={() => setOnlyDanger(!onlyDanger)}
            className={clsx(
              'ml-auto flex min-h-[32px] items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all border',
              onlyDanger
                ? 'bg-danger text-white border-danger shadow-sm shadow-danger/25'
                : 'bg-danger/10 text-danger border-danger/30 hover:bg-danger/20'
            )}
            title="Chỉ hiển thị các cảnh báo mức nguy cấp"
          >
            <ShieldAlert size={12} className={onlyDanger ? 'motion-safe:animate-bounce' : ''} />
            <span>{dangerCount} khẩn</span>
          </button>
        )}
      </div>

      {/* Ô tìm kiếm nhanh nhật ký */}
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Lọc nhanh nhật ký (tên xã, sự cố, hồ xả...)"
          className="w-full min-h-[36px] pl-8 pr-7 py-1 text-xs rounded-lg border border-line bg-panel2/60 text-ink placeholder:text-muted focus:border-accent focus:outline-none"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted hover:text-ink"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Danh sách ticker sự kiện */}
      <ul className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2 scroll-thin print:max-h-none print:overflow-visible" aria-live="polite">
        {!q.data ? (
          // Chưa tải xong / lỗi tải: không nói "chưa có sự kiện" khi thực ra chưa biết
          <li>{q.isError ? <ErrorState onRetry={q.refetch}>Không tải được nhật ký sự kiện</ErrorState> : <Skeleton height={160} />}</li>
        ) : filtered.length === 0 ? (
          <li className="text-center py-8 text-xs text-muted italic">
            {data.length ? 'Không có sự kiện khớp bộ lọc' : 'Chưa có sự kiện nào trong vùng đang xem'}
          </li>
        ) : (
          (preview && !showAll ? filtered.slice(0, preview) : filtered).map((l) => {
            const cat = CAT[l.category] || CAT.he_thong;
            const Icon = l.severity === 'danger' ? Siren : cat.icon || Activity;
            const isDanger = l.severity === 'danger';
            return (
              <li
                key={l.id}
                className={clsx(
                  'rounded-lg border-l-4 px-3 py-2 transition-all hover:translate-x-0.5',
                  SEV[l.severity] || SEV.info,
                  isDanger && 'ring-1 ring-danger/20'
                )}
              >
                <div className="flex items-center justify-between gap-1 text-[11px] text-muted mb-1">
                  <div className="flex items-center gap-1.5 font-medium">
                    <Icon size={13} className={clsx(isDanger ? 'text-danger motion-safe:animate-pulse' : 'text-accent')} />
                    <span className="font-mono font-semibold text-ink">{time(l.time)}</span>
                    <span className="text-muted">· {cat.label}</span>
                  </div>
                  {isDanger && (
                    <span className="chip py-0 px-1.5 text-[9px] bg-danger text-white font-bold tracking-wider uppercase">
                      Khẩn cấp
                    </span>
                  )}
                  {l.severity === 'warning' && (
                    <span className="chip py-0 px-1.5 text-[9px] bg-warn text-black font-semibold">
                      Cảnh báo
                    </span>
                  )}
                </div>
                <div className={clsx('text-[12.5px] leading-snug', isDanger && 'font-semibold text-danger')}>
                  {l.message}
                </div>
              </li>
            );
          })
        )}
      </ul>
      {preview && !showAll && filtered.length > preview && (
        <button type="button" className="btn-ghost min-h-[40px] w-full justify-center text-xs font-semibold" onClick={() => setShowAll(true)}>
          Xem tất cả {filtered.length} sự kiện
        </button>
      )}
    </div>
  );
}

