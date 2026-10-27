import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Waves, AlertTriangle, ShieldCheck, ArrowDownRight, ArrowUpRight,
  Gauge, Compass, RefreshCw, Info, Droplets, MapPin, Zap,
  CheckCircle2, Search, SlidersHorizontal, Siren, Clock, PencilLine, ChevronDown
} from 'lucide-react';
import { api } from '../../api/client';
import { useAreaQuery } from '../../api/hooks';
import { BackButton, EmptyState, ErrorState, ShowMore, Skeleton } from '../../components/common/ui';
import { ReservoirHistory } from '../../components/charts/ReservoirOpsChart';
import ReservoirOperationModal from '../../components/common/ReservoirOperationModal';
import { usePermission } from '../../rbac/usePermission';
import { ago, time } from '../../utils/format';
import { useShowMore } from '../../utils/useShowMore';

const EMPTY = [];

const REFRESH_INTERVAL = 20_000;
const PAGE = 9; // thẻ hiện mỗi lần (3 hàng × 3 cột trên máy tính) — dữ liệu thật vài chục hồ không làm trang quá dài
// Xả lũ lớn → đang xả → chưa có số liệu (chưa biết) → chưa xả: mục khẩn luôn ở đầu, không bị ẩn sau "Xem thêm"
const STATUS_ORDER = { xa_khan_cap: 0, xa_dieu_tiet: 1, chua_co_so_lieu: 2, binh_thuong: 3 };

/**
 * Giám sát hồ chứa & cảnh báo xả lũ — dùng chung cho cổng công khai (toàn tỉnh) và tab Hồ chứa của Tổng quan (`areaScoped`:
 * theo bộ lọc địa phương / phạm vi được giao, thiết kế mục F.1 — cùng số với ô KPI). Chưa tải được thì nói rõ, KHÔNG hiện
 * "0 hồ xả lũ" / "TRỰC TIẾP" (khẳng định sai là an toàn). `showAll`: hiện đủ mọi thẻ, bỏ "Xem thêm" (Tổng quan đang chụp PDF).
 */
export default function ReservoirMonitor({ onSelectOnMap, onBackToMap, areaScoped = false, showAll = false }) {
  const [basinFilter, setBasinFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Chỉ một trong hai truy vấn chạy: màn hình điều hành theo vùng đang xem, cổng công khai toàn tỉnh
  const scopedQ = useAreaQuery('reservoirs', '/dashboard/reservoirs', {}, { refetchInterval: REFRESH_INTERVAL, enabled: areaScoped });
  const publicQ = useQuery({
    queryKey: ['pub-reservoirs'],
    queryFn: () => api('/public/reservoirs'),
    refetchInterval: REFRESH_INTERVAL,
    enabled: !areaScoped,
  });
  const { data, isFetching, isError, refetch, dataUpdatedAt } = areaScoped ? scopedQ : publicQ;

  const reservoirs = data?.reservoirs || EMPTY; // mảng cố định: useMemo bên dưới không tính lại mỗi lần vẽ khi chưa có dữ liệu
  const basins = data?.basins || [];

  const filteredReservoirs = useMemo(() => {
    return reservoirs.filter((r) => {
      if (basinFilter !== 'all' && r.river !== basinFilter) return false;
      if (statusFilter !== 'all' && r.status_code !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = r.name.toLowerCase().includes(q);
        const matchAdmin = (r.admin_name || '').toLowerCase().includes(q);
        const matchRiver = (r.river || '').toLowerCase().includes(q);
        if (!matchName && !matchAdmin && !matchRiver) return false;
      }
      return true;
    }).sort((a, b) => (STATUS_ORDER[a.status_code] ?? 2) - (STATUS_ORDER[b.status_code] ?? 2));
  }, [reservoirs, basinFilter, statusFilter, searchQuery]);
  const shownRes = useShowMore(filteredReservoirs, PAGE, `${basinFilter}|${statusFilter}|${searchQuery}`, showAll);

  const uniqueBasins = useMemo(() => {
    const set = new Set();
    reservoirs.forEach((r) => {
      if (r.river) set.add(r.river);
    });
    return Array.from(set);
  }, [reservoirs]);

  const emergencyCount = data?.emergency_count || 0;
  const spillCount = data?.spill_count || 0;
  const total = data?.total_reservoirs || 0;
  const noDataCount = data?.no_data_count || 0;
  const staleCount = data?.stale_count || 0;
  // Không hồ nào có số liệu vận hành → không được hiện "TRỰC TIẾP" / "Các hồ chưa mở xả tràn" (khẳng định sai là an toàn)
  const noOperatingData = total > 0 && noDataCount === total;
  const canUpdate = usePermission('monitoring', 'update', '*');
  const [editing, setEditing] = useState(null);
  const [historyOf, setHistoryOf] = useState(null); // hồ đang mở "Diễn biến vận hành 48 giờ" (chỉ màn hình điều hành)
  const totalInflow = data?.total_inflow_m3s || 0;
  const totalOutflow = data?.total_outflow_m3s || 0;
  const flowBalance = totalOutflow - totalInflow;
  // Sông có hồ đang xả lũ lớn — dải cảnh báo nêu đúng các sông này (trước đây viết cứng "sông Bằng Giang và sông Gâm").
  // Tên đã có "Sông" / "Suối" (VD "Suối Khuổi Lái") thì giữ nguyên, không thành "sông Suối …"
  const emergencyRivers = [...new Set(reservoirs.filter((r) => r.status_code === 'xa_khan_cap').map((r) => r.river).filter(Boolean))]
    .map((n) => (/^(sông|suối)\s/i.test(n) ? n : `sông ${n}`));
  const riverList = emergencyRivers.length > 1
    ? `${emergencyRivers.slice(0, -1).join(', ')} và ${emergencyRivers[emergencyRivers.length - 1]}`
    : emergencyRivers[0];

  const header = (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-panel p-4 sm:p-5 rounded-2xl border border-line shadow-sm">
      <div>
        <div className="flex items-center gap-2.5">
          <Waves size={26} className="shrink-0 text-accent" aria-hidden="true" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-ink">
                Giám sát hồ chứa & cảnh báo xả lũ tỉnh Cao Bằng
              </h1>
              {!data ? null : isError ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-panel2 text-muted border border-dashed border-line" title="Lần tải lại gần nhất bị lỗi — đang hiện số liệu đã tải trước đó">
                  <Clock size={11} /> Chưa cập nhật được · số liệu lúc {time(dataUpdatedAt)}
                </span>
              ) : noOperatingData ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-panel2 text-muted border border-line">
                  <Clock size={11} /> Chưa có số liệu vận hành
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-good/15 text-good border border-good/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-good" />
                  Trực tiếp
                </span>
              )}
              {staleCount > 0 && (
                <span className="chip border border-dashed border-line bg-panel2 text-ink-2 text-[11px] font-bold" title="Số liệu vận hành cũ hơn 6 giờ">
                  {staleCount} hồ số liệu cũ
                </span>
              )}
            </div>
            <p className="text-xs text-muted mt-0.5">
              Theo dõi thời gian thực mực nước, lưu lượng về hồ, lưu lượng xả và thông tin an toàn hạ du các lưu vực sông
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 self-start md:self-auto">
        {onBackToMap && <BackButton onClick={onBackToMap} />}
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn-ghost tap text-xs px-3 py-1.5 flex items-center gap-1.5"
          title="Làm mới số liệu ngay"
        >
          <RefreshCw size={13} className={clsx(isFetching && 'animate-spin text-accent')} />
          <span>{isFetching ? 'Đang cập nhật…' : 'Cập nhật ngay'}</span>
        </button>
      </div>
    </div>
  );

  if (!data) {
    return (
      <div className="space-y-5">
        {header}
        {isError ? (
          <ErrorState onRetry={refetch}>Không tải được số liệu hồ chứa — chưa biết tình trạng xả lũ</ErrorState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={118} />)}
          </div>
        )}
      </div>
    );
  }
  if (!total) {
    return (
      <div className="space-y-5">
        {header}
        <EmptyState>
          {areaScoped ? 'Không có hồ chứa nào trong vùng đang xem.' : 'Chưa có danh mục hồ chứa.'} Danh mục hồ chứa (thủy điện, thủy lợi)
          nhập ở trang Nhập dữ liệu, loại "Hồ chứa".
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {header}

      {/* 2. Cảnh báo khẩn cấp hạ du (nếu có hồ xả lũ lớn hoặc đang xả lớn) */}
      {emergencyCount > 0 && (
        <div className="rounded-2xl p-4 sm:p-5 border border-danger/60 bg-danger text-white shadow-lg shadow-danger/20">
          <div className="flex items-start gap-3">
            <Siren size={26} className="mt-0.5 shrink-0 text-white" aria-hidden="true" />
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm bg-white text-[rgb(var(--danger))] px-2.5 py-0.5 rounded-md">
                  Cảnh báo xả lũ mức cao
                </span>
                <span className="text-xs font-semibold text-white/90">
                  Phát hiện {emergencyCount} hồ chứa đang mở từ một nửa số cửa xả tràn trở lên (xả lũ lớn).
                </span>
              </div>
              <p className="text-xs sm:text-sm text-white/95 mt-1.5 leading-relaxed">
                Người dân các xã hạ du lưu vực <b>{riverList}</b> cần khẩn trương thu dọn máy móc,
                neo đậu tàu thuyền bè chắc chắn, di chuyển gia súc và nông sản khỏi các bãi soi, bãi bồi ven sông.
                Tuyệt đối không đi thuyền vớt củi, không tắm lội và chú ý biển báo nguy hiểm tại các ngầm tràn!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 3. Thẻ thống kê tổng quan (4 Metric Cards) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Tổng số hồ */}
        <div className="card p-4 flex flex-col justify-between border-l-4 border-l-accent">
          <div className="flex items-center justify-between text-muted text-xs">
            <span>Tổng số hồ theo dõi</span>
            <div className="h-8 w-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center font-bold">
              <Gauge size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-ink">{data?.total_reservoirs ?? '–'}</span>
            <span className="text-xs text-muted">công trình (thủy điện & thủy lợi)</span>
          </div>
          <div className="text-[11px] text-muted mt-2 border-t border-line/60 pt-1.5">
            Phục vụ điều tiết lũ & cấp nước
          </div>
        </div>

        {/* Card 2: Đang xả tràn */}
        <div className="card p-4 flex flex-col justify-between border-l-4 border-l-serious">
          <div className="flex items-center justify-between text-muted text-xs">
            <span>Đang mở cửa xả tràn</span>
            <div className="h-8 w-8 rounded-lg bg-serious/10 text-serious flex items-center justify-center font-bold">
              <Waves size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-serious">{spillCount}</span>
            <span className="text-xs text-muted">/ {data?.total_reservoirs ?? 0} hồ đang xả</span>
          </div>
          <div className="text-[11px] text-serious font-medium mt-2 border-t border-line/60 pt-1.5">
            {spillCount > 0
              ? 'Mở cửa xả đón lũ & bảo vệ an toàn đập'
              : noOperatingData
              ? 'Chưa có số liệu vận hành từ các hồ'
              : noDataCount > 0
              ? `Các hồ có số liệu chưa mở xả tràn (${noDataCount} hồ chưa có số liệu)`
              : 'Các hồ chưa mở xả tràn'}
          </div>
        </div>

        {/* Card 3: Xả lũ khẩn cấp */}
        <div className={clsx(
          'card p-4 flex flex-col justify-between border-l-4',
          emergencyCount > 0 ? 'border-l-danger bg-danger/5 ring-1 ring-danger/30' : noOperatingData ? 'border-l-line border-dashed' : 'border-l-good'
        )}>
          <div className="flex items-center justify-between text-muted text-xs">
            <span>Xả lũ lớn</span>
            <div className={clsx(
              'h-8 w-8 rounded-lg flex items-center justify-center font-bold',
              emergencyCount > 0 ? 'bg-danger/15 text-danger motion-safe:animate-pulse' : noOperatingData ? 'bg-panel2 text-muted' : 'bg-good/10 text-good'
            )}>
              <AlertTriangle size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={clsx('text-2xl font-black font-mono', emergencyCount > 0 ? 'text-danger' : noOperatingData ? 'text-muted' : 'text-good')}>
              {noOperatingData ? '–' : emergencyCount}
            </span>
            <span className="text-xs text-muted">hồ mức báo động đỏ</span>
          </div>
          <div className={clsx('text-[11px] font-medium mt-2 border-t border-line/60 pt-1.5', emergencyCount > 0 ? 'text-danger font-bold' : noOperatingData ? 'text-muted' : 'text-good')}>
            {emergencyCount > 0 ? 'Hạ du cần nâng cao cảnh giác tối đa'
              : noOperatingData ? 'Chưa có số liệu vận hành — chưa đánh giá được'
                : noDataCount > 0 ? `Không có hồ xả lũ lớn trong số hồ có số liệu (${noDataCount} hồ chưa có)` : 'Không có hồ xả lũ lớn'}
          </div>
        </div>

        {/* Card 4: Tổng lưu lượng xả về hạ du */}
        <div className="card p-4 flex flex-col justify-between border-l-4 border-l-accent">
          <div className="flex items-center justify-between text-muted text-xs">
            <span>Tổng lưu lượng xả về hạ du</span>
            <div className="h-8 w-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center font-bold">
              <Droplets size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-ink">
              {noOperatingData ? '–' : Math.round(totalOutflow).toLocaleString('vi-VN')}
            </span>
            <span className="text-xs text-muted">m³/s</span>
          </div>
          <div className="text-[11px] text-muted mt-2 border-t border-line/60 pt-1.5 flex items-center justify-between">
            <span>Nước về hồ: <b>{noOperatingData ? '–' : `${Math.round(totalInflow).toLocaleString('vi-VN')} m³/s`}</b></span>
            {!noOperatingData && (
              <span className={clsx('font-bold', flowBalance > 0 ? 'text-serious' : 'text-good')}>
                {flowBalance > 0 ? `+${Math.round(flowBalance)} m³/s` : `${Math.round(flowBalance)} m³/s`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 4. Bộ lọc theo lưu vực & Trạng thái */}
      <div className="card p-3 sm:p-4 bg-panel2/40 border border-line">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Lọc theo lưu vực */}
          <div className="flex items-center gap-1.5 overflow-x-auto scroll-thin pb-1 lg:pb-0">
            <span className="text-xs font-semibold text-muted shrink-0 mr-1 flex items-center gap-1">
              <SlidersHorizontal size={13} /> Lưu vực:
            </span>
            <button
              onClick={() => setBasinFilter('all')}
              className={clsx(
                'tap px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0',
                basinFilter === 'all'
                  ? 'bg-accent text-white shadow-sm font-bold'
                  : 'bg-panel text-ink hover:bg-panel2 border border-line'
              )}
            >
              Tất cả các sông ({reservoirs.length})
            </button>
            {uniqueBasins.map((b) => {
              const count = reservoirs.filter((r) => r.river === b).length;
              return (
                <button
                  key={b}
                  onClick={() => setBasinFilter(b)}
                  className={clsx(
                    'tap px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0',
                    basinFilter === b
                      ? 'bg-accent text-white shadow-sm font-bold'
                      : 'bg-panel text-ink hover:bg-panel2 border border-line'
                  )}
                >
                  Sông {b} ({count})
                </button>
              );
            })}
          </div>

          {/* Ô tìm kiếm & Lọc trạng thái */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <div className="relative min-w-0 flex-[1_1_10rem] sm:w-56">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                placeholder="Tìm tên hồ, sông, xã/phường…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input tap pl-8 py-1.5 text-xs w-full"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input tap py-1.5 text-xs w-auto flex-[1_1_auto] sm:flex-none font-medium"
            >
              <option value="all">Mọi trạng thái</option>
              <option value="xa_khan_cap">🔴 Xả lũ lớn</option>
              <option value="xa_dieu_tiet">🟠 Đang xả điều tiết</option>
              <option value="binh_thuong">🟢 Chưa xả tràn</option>
              <option value="chua_co_so_lieu">⚪ Chưa có số liệu vận hành</option>
            </select>
          </div>
        </div>

        {/* Tóm tắt nhanh dòng chảy lưu vực đã chọn */}
        {basinFilter !== 'all' && (
          <div className="mt-3 pt-2.5 border-t border-line/60 flex flex-wrap items-center gap-4 text-xs text-muted">
            {(() => {
              const basinData = basins.find((b) => b.name === basinFilter);
              if (!basinData) return null;
              return (
                <>
                  <span>
                    Tổng lưu lượng xả về sông {basinFilter}:{' '}
                    <b className="font-mono text-ink text-sm font-bold">{basinData.total_outflow} m³/s</b>
                  </span>
                  <span>·</span>
                  <span>
                    Nước đổ về các hồ:{' '}
                    <b className="font-mono text-ink font-bold">{basinData.total_inflow} m³/s</b>
                  </span>
                  <span>·</span>
                  <span>
                    Số hồ đang xả tràn:{' '}
                    <b className={clsx('font-bold', basinData.spilling_count > 0 ? 'text-serious' : 'text-good')}>
                      {basinData.spilling_count} / {basinData.reservoirs_count} hồ
                    </b>
                  </span>
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* 5. Danh sách thẻ chi tiết từng hồ chứa */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {shownRes.visible.map((r) => {
          const isEmergency = r.status_code === 'xa_khan_cap';
          const isSpilling = r.status_code === 'xa_dieu_tiet';
          const isNormal = r.status_code === 'binh_thuong';
          const noData = r.status_code === 'chua_co_so_lieu';

          const gatesTotal = r.spill_gates || 4;
          const gatesOpen = r.spill_gates_open || 0;

          return (
            <div
              key={r.id}
              className={clsx(
                'card flex flex-col justify-between overflow-hidden transition-all duration-200 hover:shadow-lg',
                isEmergency
                  ? 'border-danger/80 bg-danger/5 ring-1 ring-danger/40'
                  : isSpilling
                  ? 'border-serious/60 bg-serious/5'
                  : 'border-line hover:border-accent/60'
              )}
            >
              {/* Header Thẻ */}
              <div className="p-4 pb-3 border-b border-line/60">
                {/* Thẻ hẹp (điện thoại, lưới 3 cột) → chip trạng thái xuống dòng dưới tên, không ép tên chỉ còn "Đèo Kh…" */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-[1_1_12rem]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-mono font-bold text-muted bg-panel2 px-1.5 py-0.5 rounded">
                        {r.id}
                      </span>
                      {r.capacity_mw > 0 ? (
                        <span className="chip bg-accent/10 text-accent text-[10px] font-bold">
                          <Zap size={10} /> {r.capacity_mw} MW
                        </span>
                      ) : (
                        <span className="chip bg-good/10 text-good text-[10px] font-bold">
                          Hồ Thủy Lợi
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-base text-ink mt-1 truncate" title={r.name}>
                      {r.name}
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs text-muted mt-0.5">
                      <MapPin size={12} className="shrink-0 text-accent" />
                      <span className="truncate">Sông {r.river} · {r.admin_name}</span>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <span
                    className={clsx(
                      'chip text-xs font-bold shrink-0 max-w-full px-2.5 py-1',
                      isEmergency
                        ? 'bg-danger text-white shadow-sm shadow-danger/30 motion-safe:animate-pulse'
                        : isSpilling
                        ? 'bg-serious text-black shadow-sm shadow-serious/30'
                        : noData
                        ? 'bg-panel2 text-muted border-line'
                        : 'bg-good/15 text-good border-good/30'
                    )}
                  >
                    {isEmergency && <AlertTriangle size={12} />}
                    {isSpilling && <Waves size={12} />}
                    {isNormal && <CheckCircle2 size={12} />}
                    {noData && <Clock size={12} />}
                    {r.status_label}
                  </span>
                </div>
              </div>

              {/* Body: Thước đo mực nước & Lưu lượng */}
              <div className="p-4 space-y-3.5 flex-1">
                {noData && (
                  <div className="rounded-xl border border-dashed border-line bg-panel2/50 p-3 text-xs text-ink-2">
                    <div className="flex items-center gap-1.5 font-semibold text-ink">
                      <Clock size={13} className="text-muted" /> Chưa có báo cáo vận hành của hồ
                    </div>
                    <p className="mt-1 leading-relaxed">
                      Mực nước dâng bình thường: <b className="font-mono">{r.normal_level?.toFixed(2) ?? '–'} m</b> · {r.spill_gates || 0} cửa
                      xả tràn. Trạng thái xả lũ sẽ hiện khi đơn vị quản lý hồ báo số liệu.
                    </p>
                  </div>
                )}
                {!noData && (<>
                {/* 1. Mực nước hiện tại vs MNDBT */}
                <div>
                  <div className="flex items-baseline justify-between text-xs mb-1">
                    <span className="text-muted flex items-center gap-1">
                      <Gauge size={13} className="text-accent" /> Mực nước hiện tại / mực nước dâng bình thường:
                    </span>
                    <div className="font-mono">
                      <b className="text-sm text-ink">{r.current_level?.toFixed(2)}</b>
                      <span className="text-muted"> / {r.normal_level?.toFixed(2)} m</span>
                    </div>
                  </div>

                  {/* Thanh Gauge Mực nước */}
                  <div className="relative h-2.5 w-full bg-panel2 rounded-full overflow-hidden border border-line/60">
                    <div
                      className={clsx(
                        'h-full rounded-full transition-all duration-500',
                        isEmergency ? 'bg-danger' : isSpilling ? 'bg-serious' : 'bg-good'
                      )}
                      style={{ width: `${Math.min(100, Math.max(10, (r.current_level / r.normal_level) * 100))}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-[11px] text-muted mt-1">
                    <span>
                      Chênh lệch: <b className={clsx(r.level_diff >= 0 ? 'text-danger' : 'text-ink-2')}>
                        {r.level_diff >= 0 ? `+${r.level_diff} m` : `${r.level_diff} m`}
                      </b>
                    </span>
                    <span className="num" title="Tỉ số cao trình mực nước / mực nước dâng bình thường (không phải % dung tích)">Bằng {r.volume_pct}% mức dâng bình thường</span>
                  </div>
                </div>

                {/* 2. Visualizer Cửa Xả Tràn */}
                <div className="bg-panel2/60 rounded-xl p-2.5 border border-line/60">
                  <div className="flex items-center justify-between text-xs text-muted mb-2">
                    <span className="font-semibold text-ink-2">Trạng thái cửa xả tràn:</span>
                    <b className={clsx('font-mono font-bold', gatesOpen > 0 ? (isEmergency ? 'text-danger' : 'text-serious') : 'text-good')}>
                      {gatesOpen > 0 ? `Mở ${gatesOpen}/${gatesTotal} cửa` : `Đóng (0/${gatesTotal} cửa)`}
                    </b>
                  </div>

                  {/* Minh họa các ô cửa xả */}
                  <div className="grid grid-cols-5 gap-1.5">
                    {Array.from({ length: gatesTotal }).map((_, idx) => {
                      const isOpen = idx < gatesOpen;
                      return (
                        <div
                          key={idx}
                          className={clsx(
                            'flex flex-col items-center justify-center py-1.5 px-1 rounded-md text-[10px] font-bold transition-all border',
                            isOpen
                              ? isEmergency
                                ? 'bg-danger text-white border-danger shadow-sm motion-safe:animate-pulse'
                                : 'bg-serious text-black border-serious shadow-sm'
                              : 'bg-panel text-muted border-line/80'
                          )}
                          title={`Cửa xả số ${idx + 1}: ${isOpen ? 'Đang mở' : 'Đóng'}`}
                        >
                          <span>Cửa {idx + 1}</span>
                          <span className="text-[9px] font-normal opacity-90">{isOpen ? 'MỞ' : 'ĐÓNG'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Lưu lượng đến & Lưu lượng xả */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-panel2/50 border border-line/60">
                    <div className="text-[11px] text-muted flex items-center gap-1">
                      <ArrowDownRight size={13} className="text-accent" /> Nước về hồ (Inflow)
                    </div>
                    <div className="mt-1 flex items-baseline gap-1 font-mono">
                      <span className="text-base font-bold text-ink">{r.inflow_m3s}</span>
                      <span className="text-[11px] text-muted">m³/s</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-panel2/50 border border-line/60">
                    <div className="text-[11px] text-muted flex items-center gap-1">
                      <ArrowUpRight size={13} className={clsx(gatesOpen > 0 ? 'text-serious' : 'text-good')} />
                      Xả về hạ du (Outflow)
                    </div>
                    <div className="mt-1 flex items-baseline gap-1 font-mono">
                      <span className={clsx('text-base font-bold', isEmergency ? 'text-danger' : isSpilling ? 'text-serious' : 'text-ink')}>
                        {r.outflow_m3s}
                      </span>
                      <span className="text-[11px] text-muted">m³/s</span>
                    </div>
                  </div>
                </div>
                </>)}

                {/* 4. Khuyến nghị an toàn hạ du */}
                <div
                  className={clsx(
                    'p-2.5 rounded-xl text-xs leading-relaxed border',
                    isEmergency
                      ? 'bg-danger/10 border-danger/30 text-danger'
                      : isSpilling
                      ? 'bg-serious/10 border-serious/30 text-serious'
                      : 'bg-good/5 border-good/20 text-ink-2'
                  )}
                >
                  <div className="font-semibold mb-0.5 flex items-center gap-1">
                    <Info size={12} className="shrink-0" /> Khuyến nghị an toàn hạ du:
                  </div>
                  <p className="text-[11px] opacity-95">{r.downstream_warning}</p>
                </div>
              </div>

              {/* Diễn biến vận hành 48 giờ (màn hình điều hành — cần đăng nhập): mực nước so MNDBT, Q đến / Q xả */}
              {areaScoped && (
                <div className="border-t border-line/60">
                  <button
                    type="button"
                    aria-expanded={historyOf === r.id}
                    onClick={() => setHistoryOf(historyOf === r.id ? null : r.id)}
                    className="tap flex min-h-[40px] w-full items-center gap-1.5 px-3 text-left text-xs font-semibold text-ink-2 hover:bg-panel2/60"
                  >
                    <ChevronDown size={14} className={clsx('shrink-0 transition-transform', historyOf !== r.id && '-rotate-90')} aria-hidden="true" />
                    Diễn biến vận hành 48 giờ
                  </button>
                  {historyOf === r.id && (
                    <div className="px-3 pb-3">
                      <ReservoirHistory reservoir={r} />
                    </div>
                  )}
                </div>
              )}

              {/* Footer Thẻ & Hành động */}
              <div className="p-3 bg-panel2/40 border-t border-line/60 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-[11px] text-muted">
                  {r.updated_at ? <>Số liệu vận hành: {ago(r.updated_at)}</> : 'Chưa có số liệu vận hành'}
                  {r.stale && <span className="chip border border-dashed border-line bg-panel2 text-ink-2 text-[10px] font-bold">Số liệu cũ</span>}
                </span>
                {canUpdate && (
                  <button
                    type="button"
                    onClick={() => setEditing(r)}
                    className="btn-ghost tap text-xs px-2.5 py-1 flex items-center gap-1"
                    title="Nhập số liệu vận hành theo báo cáo của đơn vị quản lý hồ"
                  >
                    <PencilLine size={13} /> Cập nhật vận hành
                  </button>
                )}
                {onSelectOnMap && (
                  <button
                    onClick={() => onSelectOnMap(r)}
                    className="btn-ghost tap text-xs px-2.5 py-1 text-accent flex items-center gap-1 hover:bg-accent/10 hover:border-accent/40"
                  >
                    <Compass size={13} /> Xem bản đồ
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <ShowMore list={shownRes} step={PAGE} noun="hồ" />

      {editing && <ReservoirOperationModal reservoir={editing} onClose={() => setEditing(null)} />}

      {filteredReservoirs.length === 0 && (
        <div className="card p-12 text-center text-muted text-sm space-y-2">
          <Waves size={36} className="mx-auto text-muted/60" />
          <p className="font-medium text-ink">Không tìm thấy hồ chứa phù hợp với bộ lọc hiện tại</p>
          <p className="text-xs">Vui lòng chọn lại lưu vực sông hoặc xóa từ khóa tìm kiếm</p>
          <button
            onClick={() => {
              setBasinFilter('all');
              setStatusFilter('all');
              setSearchQuery('');
            }}
            className="btn-ghost text-xs mt-2"
          >
            Đặt lại bộ lọc
          </button>
        </div>
      )}

      {/* 6. Hướng dẫn & Quy chuẩn cảnh báo xả lũ cho nhân dân */}
      <div className="card p-4 sm:p-5 space-y-3">
        <h3 className="font-bold text-sm text-ink flex items-center gap-2">
          <ShieldCheck size={18} className="text-accent" />
          Quy chuẩn cảnh báo an toàn xả lũ tỉnh Cao Bằng
        </h3>
        <div className="grid gap-3 sm:grid-cols-3 text-xs leading-relaxed text-ink-2">
          <div className="p-3 rounded-xl bg-panel2/60 border border-line/60">
            <b className="text-good flex items-center gap-1 mb-1">
              🟢 Cấp 1: Vận hành bình thường
            </b>
            <p className="text-muted">
              Mực nước hồ nằm dưới mực nước dâng bình thường. Thủy điện phát điện qua tổ máy, chưa mở cửa xả tràn. Dòng chảy hạ du sông ổn định trong mùa kiệt hoặc đầu lũ.
            </p>
          </div>
          <div className="p-3 rounded-xl bg-panel2/60 border border-line/60">
            <b className="text-serious flex items-center gap-1 mb-1">
              🟠 Cấp 2: Mở xả tràn điều tiết đón lũ
            </b>
            <p className="text-muted">
              Mực nước hồ dâng gần hoặc chạm mực nước dâng bình thường. Mở từ 1 đến 2 cửa xả điều tiết. Đập phát còi hú cảnh báo trước 2 - 4 giờ để chính quyền và người dân hạ du chủ động.
            </p>
          </div>
          <div className="p-3 rounded-xl bg-panel2/60 border border-line/60">
            <b className="text-danger flex items-center gap-1 mb-1">
              🔴 Cấp 3: Xả lũ khẩn cấp bảo đảm an toàn đập
            </b>
            <p className="text-muted">
              Lũ lớn đổ về vượt quá dung tích đón lũ, đập mở từ 3 cửa xả tràn trở lên. Ban Chỉ huy PCTT tỉnh ban hành công điện khẩn cấp, kích hoạt phương án di dời người dân khỏi vùng trũng thấp.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
