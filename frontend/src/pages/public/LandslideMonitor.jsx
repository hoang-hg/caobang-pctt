import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  AlertTriangle, ShieldAlert, Compass, RefreshCw, CloudRain,
  MapPin, Search, SlidersHorizontal, CheckCircle2, AlertOctagon,
  Ban, ShieldCheck, Navigation, Gauge, Mountain, Milestone, Truck
} from 'lucide-react';
import { api } from '../../api/client';

const EMPTY = [];

const REFRESH_INTERVAL = 20_000;

/** Độ nghiêng taluy lớn nhất trong các điểm đen có cảm biến, VD "+1.2° (Đèo Mẻ Pia)". */
export const maxTiltText = (points = []) => {
  const top = points.filter((p) => p.tilt_info).sort((a, b) => b.tilt_info.current_tilt_deg - a.tilt_info.current_tilt_deg)[0];
  return top ? `+${top.tilt_info.current_tilt_deg}° (${top.name})` : '–';
};

export default function LandslideMonitor({ onSelectOnMap }) {
  const [corridorFilter, setCorridorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['pub-landslides'],
    queryFn: () => api('/public/landslides'),
    refetchInterval: REFRESH_INTERVAL,
  });

  const points = data?.points || EMPTY; // mảng cố định: useMemo bên dưới không tính lại mỗi lần vẽ khi chưa có dữ liệu
  const corridors = data?.corridors || [];

  const filteredPoints = useMemo(() => {
    return points.filter((p) => {
      if (corridorFilter !== 'all' && p.corridor !== corridorFilter) return false;
      if (statusFilter !== 'all' && p.traffic_status !== statusFilter) return false;
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = p.name.toLowerCase().includes(q);
        const matchAdmin = (p.admin_name || '').toLowerCase().includes(q);
        const matchRoad = (p.road_name || '').toLowerCase().includes(q);
        const matchDesc = (p.description || '').toLowerCase().includes(q);
        if (!matchName && !matchAdmin && !matchRoad && !matchDesc) return false;
      }
      return true;
    });
  }, [points, corridorFilter, statusFilter, categoryFilter, searchQuery]);

  const blockedCount = data?.blocked_count || 0;
  const warningCount = data?.warning_count || 0;
  const safeCount = data?.safe_count || 0;
  const totalCount = data?.total_points || 0;

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* 1. Header & Live Indicator */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-panel p-4 sm:p-5 rounded-2xl border border-line shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-600 to-red-600 text-white shadow-md shadow-amber-600/30">
            <Mountain size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-ink">
                Bản Đồ Điểm Đen Sạt Trượt & Trạng Thái Đường Đèo
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-good/15 text-good border border-good/30 animate-pulse">
                <span className="h-1.5 w-1.5 rounded-full bg-good" />
                TRỰC TIẾP
              </span>
            </div>
            <p className="text-xs text-muted mt-0.5">
              Giám sát nguy cơ sạt lở đất đá, ngập ngầm tràn, chia cắt giao thông đèo dốc và cảm biến dịch chuyển taluy
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5"
            title="Làm mới số liệu ngay"
          >
            <RefreshCw size={13} className={clsx(isFetching && 'animate-spin text-accent')} />
            <span>{isFetching ? 'Đang cập nhật…' : 'Cập nhật ngay'}</span>
          </button>
        </div>
      </div>

      {/* 2. Cảnh báo cấm đường khẩn cấp (nếu có điểm tắc đường / cấm xe) */}
      {blockedCount > 0 && (
        <div className="rounded-2xl p-4 sm:p-5 border border-red-500/50 bg-gradient-to-r from-red-600/95 to-rose-700/95 text-white shadow-lg shadow-red-500/20">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-white/20 rounded-xl text-white shrink-0 mt-0.5 animate-bounce">
              <Ban size={24} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-sm uppercase tracking-wider bg-white text-danger px-2.5 py-0.5 rounded-md">
                  Cấm Lưu Thông Khẩn Cấp
                </span>
                <span className="text-xs font-semibold text-white/90">
                  Đang có {blockedCount} vị trí đường đèo / ngầm tràn bị chia cắt hoàn toàn!
                </span>
              </div>
              <p className="text-xs sm:text-sm text-white/95 mt-1.5 leading-relaxed">
                Bị chia cắt: <b>{points.filter((p) => p.traffic_status === 'cam_duong').map((p) => p.name).join(', ')}</b>.
                Không cố vượt qua; tuân thủ biển báo, chốt chặn của lực lượng chức năng và dùng “Chỉ đường an toàn” để tìm tuyến tránh.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 3. Thẻ thống kê tổng quan (4 Metric Cards) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Tổng số điểm đen */}
        <div className="card p-4 flex flex-col justify-between border-l-4 border-l-sky-500">
          <div className="flex items-center justify-between text-muted text-xs">
            <span>Tổng điểm đen theo dõi</span>
            <div className="h-8 w-8 rounded-lg bg-sky-500/10 text-sky-600 flex items-center justify-center font-bold">
              <Milestone size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-ink">{totalCount}</span>
            <span className="text-xs text-muted">vị trí trọng điểm</span>
          </div>
          <div className="text-[11px] text-muted mt-2 border-t border-line/60 pt-1.5">
            Bao gồm đường đèo, ngầm tràn & sườn đồi
          </div>
        </div>

        {/* Card 2: Cấm lưu thông / Tắc đường */}
        <div className={clsx(
          'card p-4 flex flex-col justify-between border-l-4',
          blockedCount > 0 ? 'border-l-red-500 bg-danger/5 ring-1 ring-danger/30' : 'border-l-good'
        )}>
          <div className="flex items-center justify-between text-muted text-xs">
            <span>Tắc đường / Cấm phương tiện</span>
            <div className={clsx(
              'h-8 w-8 rounded-lg flex items-center justify-center font-bold',
              blockedCount > 0 ? 'bg-danger/15 text-danger animate-pulse' : 'bg-good/10 text-good'
            )}>
              <Ban size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={clsx('text-2xl font-black font-mono', blockedCount > 0 ? 'text-danger' : 'text-good')}>
              {blockedCount}
            </span>
            <span className="text-xs text-muted">điểm cấm tuyệt đối</span>
          </div>
          <div className={clsx('text-[11px] font-medium mt-2 border-t border-line/60 pt-1.5', blockedCount > 0 ? 'text-danger font-bold' : 'text-good')}>
            {blockedCount > 0 ? 'Theo vùng nguy hiểm đang hiệu lực' : 'Không có điểm ách tắc'}
          </div>
        </div>

        {/* Card 3: Cảnh báo đá lăn / Nguy cơ cao */}
        <div className="card p-4 flex flex-col justify-between border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between text-muted text-xs">
            <span>Cảnh báo nguy hiểm / Đá lăn</span>
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
              <AlertTriangle size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-amber-600">{warningCount}</span>
            <span className="text-xs text-muted">vị trí cần cảnh giác</span>
          </div>
          <div className="text-[11px] text-amber-600 font-medium mt-2 border-t border-line/60 pt-1.5">
            Hạn chế phương tiện lưu thông ban đêm
          </div>
        </div>

        {/* Card 4: Lưu thông an toàn */}
        <div className="card p-4 flex flex-col justify-between border-l-4 border-l-good">
          <div className="flex items-center justify-between text-muted text-xs">
            <span>Đoạn đèo lưu thông bình thường</span>
            <div className="h-8 w-8 rounded-lg bg-good/10 text-good flex items-center justify-center font-bold">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-good">{safeCount}</span>
            <span className="text-xs text-muted">cung đèo thông suốt</span>
          </div>
          <div className="text-[11px] text-muted mt-2 border-t border-line/60 pt-1.5">
            Được lực lượng duy tu tuần tra liên tục
          </div>
        </div>
      </div>

      {/* 4. Bộ lọc đa chiều (Tuyến đường / Phân loại / Trạng thái) */}
      <div className="card p-3 sm:p-4 bg-panel2/40 border border-line space-y-3">
        {/* Hàng 1: Tuyến đường */}
        <div className="flex items-center gap-1.5 overflow-x-auto scroll-thin pb-1">
          <span className="text-xs font-semibold text-muted shrink-0 mr-1 flex items-center gap-1">
            <SlidersHorizontal size={13} /> Tuyến đường:
          </span>
          <button
            onClick={() => setCorridorFilter('all')}
            className={clsx(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0',
              corridorFilter === 'all'
                ? 'bg-accent text-white shadow-sm font-bold'
                : 'bg-panel text-ink hover:bg-panel2 border border-line'
            )}
          >
            Tất cả các tuyến ({points.length})
          </button>
          {corridors.map((c) => (
            <button
              key={c.name}
              onClick={() => setCorridorFilter(c.name)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0',
                corridorFilter === c.name
                  ? 'bg-accent text-white shadow-sm font-bold'
                  : 'bg-panel text-ink hover:bg-panel2 border border-line'
              )}
            >
              {c.name} ({c.count})
            </button>
          ))}
        </div>

        {/* Hàng 2: Bộ lọc nhanh & Tìm kiếm */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-line/60">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted">Trạng thái:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input py-1 text-xs w-auto font-medium"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="cam_duong">⛔ Cấm lưu thông / Tắc đường</option>
              <option value="canh_bao">⚠️ Cảnh báo / Hạn chế xe</option>
              <option value="thong_suot">✅ Lưu thông bình thường</option>
            </select>

            <span className="text-xs text-muted ml-1">Loại hình:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="input py-1 text-xs w-auto font-medium"
            >
              <option value="all">Mọi loại hình</option>
              <option value="deo_doc">Đường đèo dốc huyết mạch</option>
              <option value="khu_dan_cu">Khu dân cư sườn đồi</option>
              <option value="ngam_tran">Ngầm tràn & Suối lũ quét</option>
            </select>
          </div>

          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Tìm tên đèo, xã, tuyến đường…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-8 py-1.5 text-xs w-full"
            />
          </div>
        </div>
      </div>

      {/* 5. Danh sách thẻ chi tiết từng điểm đen sạt trượt */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredPoints.map((p) => {
          const isBlocked = p.traffic_status === 'cam_duong';
          const isWarning = p.traffic_status === 'canh_bao';
          const isSafe = p.traffic_status === 'thong_suot';

          return (
            <div
              key={p.code}
              className={clsx(
                'card flex flex-col justify-between overflow-hidden transition-all duration-200 hover:shadow-lg',
                isBlocked
                  ? 'border-red-500/80 bg-gradient-to-b from-red-500/5 to-transparent ring-1 ring-red-500/40'
                  : isWarning
                  ? 'border-amber-500/60 bg-gradient-to-b from-amber-500/5 to-transparent'
                  : 'border-line hover:border-accent/60'
              )}
            >
              {/* Header Thẻ */}
              <div className="p-4 pb-3 border-b border-line/60">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-mono font-bold text-muted bg-panel2 px-1.5 py-0.5 rounded">
                        {p.code}
                      </span>
                      <span className="chip bg-sky-500/10 text-sky-600 text-[10px] font-bold">
                        {p.road_name.split('(')[0].trim()}
                      </span>
                      <span className="chip bg-panel2 text-muted text-[10px]">
                        {p.category_label}
                      </span>
                    </div>

                    <h3 className="font-bold text-base text-ink mt-1.5 truncate" title={p.name}>
                      {p.name}
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs text-muted mt-0.5">
                      <MapPin size={12} className="shrink-0 text-accent" />
                      <span className="truncate">{p.admin_name}</span>
                    </div>
                  </div>

                  {/* Status Chip */}
                  <span
                    className={clsx(
                      'chip text-xs font-bold shrink-0 px-2.5 py-1',
                      isBlocked
                        ? 'bg-danger text-white shadow-sm shadow-danger/30 animate-pulse'
                        : isWarning
                        ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30'
                        : 'bg-good/15 text-good border-good/30'
                    )}
                  >
                    {isBlocked && <Ban size={12} />}
                    {isWarning && <AlertTriangle size={12} />}
                    {isSafe && <CheckCircle2 size={12} />}
                    {p.traffic_label}
                  </span>
                </div>
              </div>

              {/* Body: Hiện trạng địa chất & Số liệu đo đạc */}
              <div className="p-4 space-y-3 flex-1">
                {/* 1. Mô tả hiện trạng địa chất */}
                <div className="text-xs text-ink-2 leading-relaxed bg-panel2/50 p-2.5 rounded-xl border border-line/50">
                  <b className="text-ink flex items-center gap-1 mb-1">
                    <AlertOctagon size={13} className={clsx(isBlocked ? 'text-danger' : 'text-amber-600')} />
                    Hiện trạng địa chất & sạt lở:
                  </b>
                  <p className="text-[11px] opacity-95">{p.description}</p>
                </div>

                {/* 2. Lực lượng ứng trực & hành động */}
                <div className="text-xs text-ink-2 bg-panel2/30 p-2.5 rounded-xl border border-line/40">
                  <b className="text-ink flex items-center gap-1 mb-1">
                    <ShieldCheck size={13} className="text-good" /> Lực lượng đang xử lý:
                  </b>
                  <p className="text-[11px] text-muted">{p.response_action}</p>
                </div>

                {/* 3. Lộ trình phân luồng tránh sạt lở (nếu bị cấm đường) */}
                {p.bypass_route && (
                  <div
                    className={clsx(
                      'p-2.5 rounded-xl text-xs border leading-relaxed',
                      isBlocked
                        ? 'bg-danger/10 border-danger/30 text-danger'
                        : 'bg-accent/5 border-accent/20 text-ink-2'
                    )}
                  >
                    <b className="flex items-center gap-1 mb-0.5">
                      <Navigation size={12} className="shrink-0" /> Phương án lưu thông / đường tránh:
                    </b>
                    <p className="text-[11px] opacity-95">{p.bypass_route}</p>
                  </div>
                )}

                {/* 4. Số liệu trạm đo mưa & cảm biến công nghệ */}
                <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-line/60">
                  {/* Trạm mưa */}
                  {p.rain_info ? (
                    <div className="p-2 rounded-lg bg-panel2/50 border border-line/40">
                      <div className="text-[10px] text-muted flex items-center gap-1">
                        <CloudRain size={11} className="text-accent" /> Mưa 24h qua:
                      </div>
                      <div className="font-mono text-xs font-bold text-ink mt-0.5">
                        {p.rain_info.rain_24h_mm} mm
                      </div>
                      <div className="text-[10px] text-muted truncate" title={p.rain_info.station_name}>
                        {p.rain_info.station_name.split('–')[0].replace('Trạm đo mưa', '').trim()}
                      </div>
                    </div>
                  ) : (
                    <div className="p-2 rounded-lg bg-panel2/30 border border-line/40 text-[10px] text-muted">
                      Trạm mưa: Đang đo
                    </div>
                  )}

                  {/* Cảm biến nghiêng hoặc độ ẩm đất */}
                  {p.tilt_info ? (
                    <div className="p-2 rounded-lg bg-panel2/50 border border-line/40">
                      <div className="text-[10px] text-muted flex items-center gap-1">
                        <Gauge size={11} className={clsx(p.tilt_info.tilt_level === 'nguy_hiem' ? 'text-danger' : 'text-amber-600')} /> Độ nghiêng taluy:
                      </div>
                      <div className={clsx('font-mono text-xs font-bold mt-0.5', p.tilt_info.tilt_level === 'nguy_hiem' ? 'text-danger' : 'text-ink')}>
                        +{p.tilt_info.current_tilt_deg}°
                      </div>
                      <div className="text-[10px] text-muted">
                        Ngưỡng BĐ3: {p.tilt_info.alarm_threshold}°
                      </div>
                    </div>
                  ) : p.soil_info ? (
                    <div className="p-2 rounded-lg bg-panel2/50 border border-line/40">
                      <div className="text-[10px] text-muted flex items-center gap-1">
                        <Gauge size={11} className="text-amber-600" /> Độ ẩm đất:
                      </div>
                      <div className="font-mono text-xs font-bold text-ink mt-0.5">
                        {p.soil_info.moisture_pct}%
                      </div>
                      <div className="text-[10px] text-muted truncate" title={p.soil_info.status_text}>
                        {p.soil_info.status_text}
                      </div>
                    </div>
                  ) : (
                    <div className="p-2 rounded-lg bg-panel2/30 border border-line/40 text-[10px] text-muted">
                      Đo đạc: Trực ban địa phương
                    </div>
                  )}
                </div>
              </div>

              {/* Footer Thẻ & Hành động */}
              <div className="p-3 bg-panel2/40 border-t border-line/60 flex items-center justify-between text-xs">
                <span className="text-[11px] text-muted flex items-center gap-1">
                  <Truck size={12} /> Tuyến: {p.road_name.split('(')[0].trim()}
                </span>
                {onSelectOnMap && (
                  <button
                    onClick={() => onSelectOnMap(p)}
                    className="btn-ghost text-xs px-2.5 py-1 text-accent flex items-center gap-1 hover:bg-accent/10 hover:border-accent/40"
                  >
                    <Compass size={13} /> Xem trên bản đồ
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredPoints.length === 0 && (
        <div className="card p-12 text-center text-muted text-sm space-y-2">
          <Mountain size={36} className="mx-auto text-muted/60" />
          <p className="font-medium text-ink">Không tìm thấy điểm nguy cơ phù hợp với bộ lọc</p>
          <p className="text-xs">Vui lòng chọn lại tuyến đường hoặc xóa từ khóa tìm kiếm</p>
          <button
            onClick={() => {
              setCorridorFilter('all');
              setStatusFilter('all');
              setCategoryFilter('all');
              setSearchQuery('');
            }}
            className="btn-ghost text-xs mt-2"
          >
            Đặt lại bộ lọc
          </button>
        </div>
      )}

      {/* 6. Hướng dẫn kỹ năng vượt đèo an toàn trong mùa mưa lũ */}
      <div className="card p-4 sm:p-5 border-l-4 border-l-amber-500 space-y-3">
        <h3 className="font-bold text-sm text-ink flex items-center gap-2">
          <ShieldAlert size={18} className="text-amber-600" />
          Kỹ Năng Lái Xe An Toàn Qua Vùng Núi & Đèo Dốc Mùa Mưa Bão
        </h3>
        <div className="grid gap-3 sm:grid-cols-3 text-xs leading-relaxed text-ink-2">
          <div className="p-3 rounded-xl bg-panel2/60 border border-line/60">
            <b className="text-danger flex items-center gap-1 mb-1">
              1. Tuyệt đối không dừng đỗ dưới vách đá
            </b>
            <p className="text-muted">
              Khi mưa lớn hoặc sương mù dày, không bao giờ dừng xe dưới chân vách đá dựng đứng taluy dương. Nếu cần nghỉ ngơi, hãy tìm khu vực bằng phẳng, cách xa mép vực và xa chân núi.
            </p>
          </div>
          <div className="p-3 rounded-xl bg-panel2/60 border border-line/60">
            <b className="text-amber-600 flex items-center gap-1 mb-1">
              2. Hạ kính nghe ngóng tiếng động lạ
            </b>
            <p className="text-muted">
              Khi đi qua các cung đèo hiểm trở (Khau Cốc Chà, Mẻ Pia, Ca Thành), hãy hạ nhẹ kính lái để lắng nghe tiếng ầm ầm từ trên núi, tiếng cành cây gãy hoặc quan sát dòng nước bùn chảy xiết từ trên sườn đồi.
            </p>
          </div>
          <div className="p-3 rounded-xl bg-panel2/60 border border-line/60">
            <b className="text-good flex items-center gap-1 mb-1">
              3. Không cố vượt ngầm tràn nước xiết
            </b>
            <p className="text-muted">
              Khi nước đã ngập mặt ngầm tràn từ 20 cm trở lên hoặc dòng chảy đục ngầu cuốn xiết, lực đẩy Ac-si-met có thể nhấc bổng ô tô và xe máy cuốn xuống vực. Hãy dừng xe chờ nước rút hoặc đi đường tránh.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
