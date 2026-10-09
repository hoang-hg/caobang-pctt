import { useState } from 'react';
import clsx from 'clsx';
import {
  HelpCircle, ChevronDown, ChevronRight,
  X
} from 'lucide-react';
import { stationView } from '../../utils/stations';
import { landslideStatus } from '../../utils/labels';
import { levelOf, risk, TILT_LEVEL } from '../../utils/risk';

/** Biểu tượng theo loại điểm đang chọn — dùng chung cho thẻ chi tiết (chú giải) và thanh nổi trên bản đồ công khai. */
export const POINT_EMOJI = { rain: '🌧️', water: '💧', reservoir: '🏛️', landslide: '⚠️', evac: '🏠', report: '📸' };

/** Ô Chú thích các biểu tượng trên bản đồ & Tra cứu thông tin chi tiết */
export default function MapLegendBox({
  data,
  selectedPoint,
  onSelectPoint,
  onClosePoint,
  activeCategory,
  onToggleCategory,
  embedded = false,
}) {
  const [expandedCat, setExpandedCat] = useState(null);

  const toggleExpand = (catId) => {
    setExpandedCat((curr) => (curr === catId ? null : catId));
  };

  const rainStations = (data?.stations || []).filter((s) => s.type === 'luong_mua');
  const waterStations = (data?.stations || []).filter((s) => s.type === 'muc_nuoc');
  const reservoirs = data?.reservoirs || [];
  const landslides = data?.landslides || [];
  const evacSites = data?.evacuation_sites || [];
  const reports = data?.reports || [];

  const CATEGORIES = [
    {
      id: 'rain',
      title: 'Trạm đo lượng mưa',
      count: rainStations.length,
      iconColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      badge: '🌧️',
      summary: 'Quan trắc lượng mưa tự động thời gian thực (mm)',
      desc: 'Màu sắc biểu tượng thay đổi theo cường độ: Xanh lá (<20mm - Mưa nhỏ) → Vàng (20-50mm - Mưa vừa) → Cam (50-100mm - Mưa to) → Đỏ (>100mm - Mưa rất to).',
      items: rainStations.map((s) => {
        const view = stationView(s); // chưa có số đo / mất tín hiệu → không "Bình thường"
        return {
          id: s.id,
          name: s.name,
          sub: s.admin_name || 'Cao Bằng',
          value: view.value,
          status: view.status,
          statusColor: view.statusColor,
          lat: s.lat,
          lon: s.lon,
          type: 'rain',
          raw: s,
        };
      }),
    },
    {
      id: 'water',
      title: 'Trạm đo mực nước',
      count: waterStations.length,
      iconColor: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
      badge: '💧',
      summary: 'Cảm biến radar đo mực nước sông suối tự động',
      desc: 'Theo dõi mực nước sông Gâm, sông Bằng, sông Quây Sơn. Cảnh báo khi vượt mức Báo động I, Báo động II hoặc Báo động III.',
      items: waterStations.map((s) => {
        const view = stationView(s); // chưa có số đo / mất tín hiệu → không "An toàn"
        return {
          id: s.id,
          name: s.name,
          sub: s.admin_name || 'Cao Bằng',
          value: view.value,
          status: view.status,
          statusColor: view.statusColor,
          lat: s.lat,
          lon: s.lon,
          type: 'water',
          raw: s,
        };
      }),
    },
    {
      id: 'reservoirs',
      title: 'Hồ chứa & Xả lũ',
      count: reservoirs.length,
      iconColor: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
      badge: '🏛️',
      summary: 'Dung tích, cao trình & trạng thái mở cửa xả hồ đập',
      desc: `Giám sát ${reservoirs.length} hồ chứa thuỷ điện, thuỷ lợi theo số liệu vận hành (mực nước, cửa xả). Cảnh báo sớm cho người dân vùng hạ du khi hồ vận hành xả tràn.`,
      items: reservoirs.map((r) => ({
        id: r.id,
        name: r.name,
        sub: `${r.river ? `Sông ${r.river} · ` : ''}${r.admin_name}`,
        value: r.status_code === 'chua_co_so_lieu' ? 'Chưa có số liệu' : r.spill_gates_open > 0 ? `Mở ${r.spill_gates_open} cửa xả` : 'Đóng cửa xả',
        status: r.status_label,
        statusColor: r.status_code === 'xa_khan_cap' ? 'text-danger' : r.status_code === 'xa_dieu_tiet' ? 'text-serious' : r.status_code === 'chua_co_so_lieu' ? 'text-muted' : 'text-good',
        lat: r.lat,
        lon: r.lon,
        type: 'reservoir',
        raw: r,
      })),
    },
    {
      id: 'landslides',
      title: 'Điểm đen sạt trượt & Đèo dốc',
      count: landslides.length,
      iconColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
      badge: '⚠️',
      summary: 'Các vị trí sườn dốc đèo có nguy cơ sạt lở đất đá',
      desc: `Theo dõi ${landslides.length} điểm đèo dốc, taluy, ngầm tràn: trạng thái theo cảm biến và vùng cảnh báo sạt lở / lũ quét đang hiệu lực, kèm tuyến đường tránh.`,
      items: landslides.map((p) => ({
        id: p.code,
        name: p.name,
        sub: `${p.road_name} · ${p.admin_name}`,
        value: p.traffic_label,
        status: landslideStatus(p.traffic_status).short,
        statusColor: landslideStatus(p.traffic_status).cls,
        lat: p.lat,
        lon: p.lon,
        type: 'landslide',
        raw: p,
      })),
    },
    {
      id: 'evac',
      title: 'Điểm sơ tán an toàn',
      count: evacSites.length,
      iconColor: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
      badge: '🏠',
      summary: 'Nhà văn hóa, trường học chỉ định tránh trú thiên tai',
      desc: 'Vị trí an toàn cao ráo phục vụ sơ tán dân khẩn cấp, hiển thị số chỗ còn trống và liên hệ ban quản lý.',
      items: evacSites.map((e) => ({
        id: e.id,
        name: e.name,
        sub: e.admin_name,
        value: `Trống ${Math.max(0, e.capacity - e.current_occupancy)} chỗ`,
        status: `${e.capacity} người`,
        statusColor: 'text-good',
        lat: e.lat,
        lon: e.lon,
        type: 'evac',
        raw: e,
      })),
    },
    {
      id: 'reports',
      title: 'Phản ánh người dân',
      count: reports.length,
      iconColor: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
      badge: '📸',
      summary: 'Tin báo hiện trường có ảnh chụp đã xác minh',
      desc: 'Thông tin ngập úng, cây đổ, sạt taluy do người dân gửi qua Cổng thông tin đã được chính quyền địa phương xác thực.',
      items: reports.map((r) => ({
        id: r.id,
        name: r.category_label,
        sub: r.commune_name || 'Hiện trường',
        value: r.description,
        status: 'Đã xác minh',
        statusColor: 'text-good',
        lat: r.lat,
        lon: r.lon,
        type: 'report',
        raw: r,
      })),
    },
  ];

  const content = (
    <>
      {/* Tiêu đề Box (Chỉ hiện khi không nhúng) */}
      {!embedded && (
        <div className="flex items-center justify-between border-b border-line/60 pb-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <HelpCircle size={16} />
            </div>
            <div>
              <h2 className="font-bold text-sm text-ink leading-tight">Chú thích & Tra cứu biểu tượng</h2>
              <p className="text-[11px] text-muted">Nhấn vào từng mục để xem chi tiết điểm</p>
            </div>
          </div>
          <span className="chip bg-accent/10 text-accent text-[10px] font-bold">
            {CATEGORIES.reduce((s, c) => s + c.count, 0)} điểm
          </span>
        </div>
      )}

      {/* Thẻ Chi tiết điểm đang chọn (Nếu người dùng click vào 1 điểm trên bản đồ hoặc trong list) */}
      {selectedPoint && (
        <div className="rounded-xl border-2 border-accent/40 bg-accent/5 p-3 relative transition-all animate-fadeIn">
          <button
            type="button"
            onClick={onClosePoint}
            className="absolute top-2.5 right-2.5 text-muted hover:text-ink p-1 rounded-md hover:bg-panel2 transition-colors"
            title="Đóng chi tiết"
          >
            <X size={15} />
          </button>

          <div className="flex items-start gap-2 pr-6">
            <span className="text-xl shrink-0 mt-0.5">
              {POINT_EMOJI[selectedPoint.type] || '📍'}
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-accent">
                Chi tiết điểm đang chọn
              </span>
              <h3 className="font-bold text-sm text-ink leading-tight mt-0.5">{selectedPoint.name}</h3>
              <p className="text-xs text-muted mt-0.5">{selectedPoint.sub}</p>
            </div>
          </div>

          <div className="mt-2.5 pt-2 border-t border-line/60 space-y-1.5 text-xs">
            {selectedPoint.type === 'reservoir' && selectedPoint.raw && selectedPoint.raw.status_code === 'chua_co_so_lieu' && (
              <p className="text-[11px] bg-panel2 p-2 rounded text-ink-2 leading-relaxed">
                Chưa có số liệu vận hành (mực nước, cửa xả) từ đơn vị quản lý hồ. MNDBT {selectedPoint.raw.normal_level ?? '–'} m ·{' '}
                {selectedPoint.raw.spill_gates || 0} cửa xả tràn.
              </p>
            )}
            {selectedPoint.type === 'reservoir' && selectedPoint.raw && selectedPoint.raw.status_code !== 'chua_co_so_lieu' && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted">Mực nước hiện tại:</span>
                  <span className="font-bold text-ink">{selectedPoint.raw.current_level} m (MNDBT {selectedPoint.raw.normal_level} m)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Lưu lượng xả:</span>
                  <span className="font-bold text-danger">{selectedPoint.raw.outflow_m3s} m³/s</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Trạng thái xả:</span>
                  <span className="font-bold text-ink">{selectedPoint.raw.spill_gates_open > 0 ? `Đang mở ${selectedPoint.raw.spill_gates_open}/${selectedPoint.raw.spill_gates} cửa xả` : 'Đang đóng cửa xả'}</span>
                </div>
                {selectedPoint.raw.downstream_warning && (
                  <p className="text-[11px] bg-panel2 p-2 rounded text-ink-2 mt-1 leading-relaxed">
                    ⚠️ {selectedPoint.raw.downstream_warning}
                  </p>
                )}
              </>
            )}

            {selectedPoint.type === 'landslide' && selectedPoint.raw && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted">Tình trạng:</span>
                  <span className={clsx('font-bold', selectedPoint.statusColor)}>{selectedPoint.raw.traffic_label}</span>
                </div>
                {selectedPoint.raw.tilt_info && (
                  <div className="flex justify-between">
                    <span className="text-muted">Góc nghiêng taluy:</span>
                    <span className={clsx('font-bold', risk(levelOf(TILT_LEVEL, selectedPoint.raw.tilt_info.tilt_level)).text)}>+{selectedPoint.raw.tilt_info.current_tilt_deg}° (Ngưỡng {selectedPoint.raw.tilt_info.alarm_threshold}°)</span>
                  </div>
                )}
                {selectedPoint.raw.bypass_route && (
                  <div className="text-[11px] text-danger font-medium mt-1">
                    🛣️ Đường tránh đề xuất: {selectedPoint.raw.bypass_route}
                  </div>
                )}
                <p className="text-[11px] bg-panel2 p-2 rounded text-ink-2 mt-1 leading-relaxed">
                  {selectedPoint.raw.description}
                </p>
              </>
            )}

            {selectedPoint.type === 'rain' && selectedPoint.raw && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted">Lượng mưa đo được:</span>
                  <span className="font-mono font-bold text-base text-ink">{selectedPoint.value}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Đánh giá nguy cơ:</span>
                  <span className={clsx('font-bold', selectedPoint.statusColor)}>{selectedPoint.status}</span>
                </div>
              </>
            )}

            {selectedPoint.type === 'water' && selectedPoint.raw && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted">Mực nước quan trắc:</span>
                  <span className="font-mono font-bold text-base text-blue-600">{selectedPoint.value}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Cấp báo động:</span>
                  <span className={clsx('font-bold', selectedPoint.statusColor)}>{selectedPoint.status}</span>
                </div>
              </>
            )}

            {selectedPoint.type === 'evac' && selectedPoint.raw && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted">Khả năng tiếp nhận:</span>
                  <span className="font-bold text-good">{selectedPoint.value}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Tổng sức chứa:</span>
                  <span className="font-bold text-ink">{selectedPoint.raw.capacity} người</span>
                </div>
              </>
            )}

            {selectedPoint.type === 'report' && selectedPoint.raw && (
              <>
                <div className="text-xs text-ink leading-relaxed">
                  {selectedPoint.raw.description}
                </div>
                {selectedPoint.raw.photos?.[0] && (
                  <img
                    src={selectedPoint.raw.photos[0].thumb}
                    alt="Hiện trường"
                    className="mt-1.5 max-h-36 w-full object-cover rounded-lg border border-line"
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Hướng dẫn cụm số gom điểm */}
      <div className="flex items-center gap-2.5 p-2 rounded-xl bg-panel2/60 border border-line/60 text-[11px] text-muted leading-tight">
        <div className="relative flex h-6 w-6 shrink-0 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-sky-400/35 animate-ping" />
          <span className="relative flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-blue-600 text-white font-mono text-[10px] font-bold border border-white shadow-xs">
            28
          </span>
        </div>
        <span>
          <b className="text-ink font-semibold">Icon Radar phát sáng có số:</b> Cụm gom các trạm/điểm gần nhau. <b>Bấm vào số</b> để phóng to và xem từng điểm cụ thể.
        </span>
      </div>

      {/* Danh sách các loại Icon Chú thích */}
      <div className={clsx('flex flex-col gap-2 pr-1', !embedded && 'overflow-y-auto max-h-[50vh] scroll-thin')}>
        {CATEGORIES.map((cat) => {
          const isExpanded = expandedCat === cat.id;

          return (
            <div
              key={cat.id}
              className={clsx(
                'rounded-xl border transition-all overflow-hidden',
                isExpanded ? 'border-accent/40 bg-panel shadow-sm' : 'border-line/70 bg-panel2/40 hover:bg-panel2/80'
              )}
            >
              {/* Header của từng mục chú thích */}
              <button
                type="button"
                onClick={() => toggleExpand(cat.id)}
                className="w-full flex items-center justify-between p-2.5 text-left cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-lg shrink-0">{cat.badge}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-ink leading-tight truncate">{cat.title}</span>
                      <span className="chip bg-panel2 text-[10px] font-semibold px-1.5 py-0.2 text-muted">
                        {cat.count}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted truncate mt-0.5">{cat.summary}</p>
                  </div>
                </div>

                <div className="shrink-0 ml-2 text-muted">
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>
              </button>

              {/* Nội dung chi tiết khi nhấn vào ("Càng nhấn vào càng nhiều thông tin hơn") */}
              {isExpanded && (
                <div className="border-t border-line/50 p-2.5 bg-panel space-y-2 text-xs animate-fadeIn">
                  <p className="text-[11px] text-muted leading-relaxed bg-panel2/60 p-2 rounded-lg">
                    {cat.desc}
                  </p>

                  <div className="font-semibold text-[11px] text-ink flex items-center justify-between pt-1">
                    <span>Danh sách điểm quan sát ({cat.items.length}):</span>
                    <span className="text-[10px] text-muted italic">Nhấn vào điểm để xem trên bản đồ</span>
                  </div>

                  <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1 scroll-thin">
                    {cat.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelectPoint(item)}
                        className={clsx(
                          'w-full flex items-center justify-between p-1.5 rounded-lg text-left transition-all cursor-pointer',
                          selectedPoint?.id === item.id
                            ? 'bg-accent/10 border border-accent/30 text-accent font-bold'
                            : 'hover:bg-panel2/80 text-ink'
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-xs truncate">{item.name}</div>
                          <div className="text-[10px] text-muted truncate">{item.sub}</div>
                        </div>

                        <div className="text-right shrink-0 ml-2">
                          <div className="font-mono text-xs font-bold text-ink">{item.value}</div>
                          <div className={clsx('text-[10px] font-semibold', item.statusColor)}>
                            {item.status}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );

  if (embedded) {
    return <div className="flex flex-col gap-2.5">{content}</div>;
  }

  return (
    <section className="card p-3.5 flex flex-col gap-3 shadow-md border border-line bg-panel">
      {content}
    </section>
  );
}
