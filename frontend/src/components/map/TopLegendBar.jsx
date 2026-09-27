import { useState } from 'react';
import clsx from 'clsx';
import { HelpCircle, ChevronDown, ChevronUp, X, MapPin, PhoneCall } from 'lucide-react';
import { alarmLevel } from '../../utils/labels';

/**
 * Thanh Chú thích Ký hiệu & Tra cứu Điểm Giám sát ở Đầu Trang
 * Giúp người dân vừa vào trang là hiểu ngay ý nghĩa các icon, cụm số radar và số lượng các điểm PCTT
 */
export default function TopLegendBar({
  data,
  onSelectPoint,
  onNavigateTab,
  onFocusMap,
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [selectedCat, setSelectedCat] = useState(null);

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
      shortTitle: 'Trạm mưa',
      count: rainStations.length,
      badge: '🌧️',
      color: 'emerald',
      tabId: 'bando',
      summary: 'Quan trắc lượng mưa tự động thời gian thực (mm)',
      desc: 'Màu sắc biểu tượng thay đổi theo lượng mưa: Xanh (<20mm) → Vàng (20-50mm) → Cam (50-100mm) → Đỏ (>100mm mưa rất to).',
      items: rainStations.map((s) => ({
        id: s.id,
        name: s.name,
        sub: s.admin_name || 'Cao Bằng',
        value: `${Math.round(s.value ?? 0)} mm`,
        status: (s.value ?? 0) >= 50 ? 'Mưa to' : 'Bình thường',
        statusColor: (s.value ?? 0) >= 100 ? 'text-danger' : (s.value ?? 0) >= 50 ? 'text-amber-500' : 'text-good',
        lat: s.lat,
        lon: s.lon,
        type: 'rain',
        raw: s,
      })),
    },
    {
      id: 'water',
      title: 'Trạm đo mực nước',
      shortTitle: 'Mực nước',
      count: waterStations.length,
      badge: '💧',
      color: 'blue',
      tabId: 'muanuoc',
      summary: 'Cảm biến radar đo mực nước sông suối tự động',
      desc: 'Theo dõi mực nước các sông chính trong tỉnh. Báo động khi vượt cấp BĐ I, BĐ II, BĐ III.',
      items: waterStations.map((s) => {
        const lv = alarmLevel(s.value ?? 0, s.thresholds);
        return {
          id: s.id,
          name: s.name,
          sub: s.admin_name || 'Cao Bằng',
          value: `${Number(s.value ?? 0).toFixed(1)} m`,
          status: lv === 3 ? 'BĐ III (Nguy hiểm)' : lv === 2 ? 'BĐ II' : lv === 1 ? 'BĐ I' : 'An toàn',
          statusColor: lv >= 2 ? 'text-danger' : lv === 1 ? 'text-amber-500' : 'text-good',
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
      shortTitle: 'Hồ chứa',
      count: reservoirs.length,
      badge: '🏛️',
      color: 'cyan',
      tabId: 'hochua',
      summary: 'Dung tích & trạng thái mở cửa xả hồ thủy điện/thủy lợi',
      desc: 'Cảnh báo sớm cho người dân vùng hạ du khi hồ thủy điện, thủy lợi mở cửa xả.',
      items: reservoirs.map((r) => ({
        id: r.id,
        name: r.name,
        sub: `${r.river ? `Sông ${r.river} · ` : ''}${r.admin_name}`,
        value: r.spill_gates_open > 0 ? `Đang mở ${r.spill_gates_open} cửa xả` : 'Đang đóng xả',
        status: r.status_label,
        statusColor: r.status_code === 'xa_khan_cap' ? 'text-danger' : r.status_code === 'xa_dieu_tiet' ? 'text-amber-500' : 'text-good',
        lat: r.lat,
        lon: r.lon,
        type: 'reservoir',
        raw: r,
      })),
    },
    {
      id: 'landslides',
      title: 'Điểm sạt trượt & Đèo',
      shortTitle: 'Sạt trượt',
      count: landslides.length,
      badge: '⚠️',
      color: 'amber',
      tabId: 'satlo',
      summary: 'Các vị trí sườn dốc đèo có nguy cơ sạt lở đất đá',
      desc: `Theo dõi ${landslides.length} điểm trọng yếu trên các tuyến đèo. Cảnh báo cấm đường và tuyến tránh.`,
      items: landslides.map((p) => ({
        id: p.code,
        name: p.name,
        sub: `${p.road_name} · ${p.admin_name}`,
        value: p.traffic_label,
        status: p.traffic_status === 'cam_duong' ? 'Cấm đường' : p.traffic_status === 'canh_bao' ? 'Cảnh báo' : 'Thông xe',
        statusColor: p.traffic_status === 'cam_duong' ? 'text-danger' : p.traffic_status === 'canh_bao' ? 'text-amber-500' : 'text-good',
        lat: p.lat,
        lon: p.lon,
        type: 'landslide',
        raw: p,
      })),
    },
    {
      id: 'evac',
      title: 'Điểm sơ tán an toàn',
      shortTitle: 'Điểm sơ tán',
      count: evacSites.length,
      badge: '🏠',
      color: 'emerald',
      tabId: 'sotan',
      summary: 'Nhà văn hóa, trường học chỉ định tránh trú thiên tai',
      desc: 'Vị trí an toàn cao ráo phục vụ sơ tán dân khẩn cấp, hiển thị số chỗ trống và khoảng cách di chuyển.',
      items: evacSites.map((e) => ({
        id: e.id,
        name: e.name,
        sub: e.admin_name,
        value: `Trống ${Math.max(0, e.capacity - e.current_occupancy)} chỗ`,
        status: `Sức chứa ${e.capacity} người`,
        statusColor: 'text-good',
        lat: e.lat,
        lon: e.lon,
        type: 'evac',
        phone: e.hotline, // số trực điểm sơ tán — công khai (README 9.1)
        raw: e,
      })),
    },
    {
      id: 'reports',
      title: 'Phản ánh người dân',
      shortTitle: 'Phản ánh',
      count: reports.length,
      badge: '📸',
      color: 'purple',
      tabId: 'bando',
      summary: 'Tin báo hiện trường có ảnh chụp đã xác minh',
      desc: 'Thông tin ngập úng, cây đổ, sạt taluy do người dân gửi đã được chính quyền địa phương xác thực.',
      items: reports.map((r) => ({
        id: r.id,
        name: r.category_label,
        sub: r.admin_name || 'Hiện trường',
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

  const totalPoints = CATEGORIES.reduce((s, c) => s + c.count, 0);
  const activeCategory = CATEGORIES.find((c) => c.id === selectedCat);

  const handleCardClick = (catId) => {
    setSelectedCat((curr) => (curr === catId ? null : catId));
  };

  const handleLocatePoint = (item) => {
    if (onSelectPoint) {
      onSelectPoint(item);
    }
    if (onFocusMap) {
      onFocusMap();
    }
  };

  return (
    <section className="card p-3 sm:p-4 bg-panel border-line shadow-xs transition-all">
      {/* Hàng Header: Tiêu đề + Hướng dẫn Icon Radar phát sáng + Nút Thu gọn/Mở rộng */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-2.5 border-b border-line/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/15 text-accent shrink-0">
              <HelpCircle size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-bold text-sm sm:text-base text-ink leading-tight">
                  Chú thích ký hiệu & Tra cứu {totalPoints} điểm giám sát
                </h2>
                <span className="chip bg-accent/10 text-accent text-[11px] font-bold px-2 py-0.5">
                  Toàn tỉnh Cao Bằng
                </span>
              </div>
              <p className="text-xs text-muted mt-0.5 hidden sm:block">
                Bấm vào từng loại ký hiệu bên dưới để xem danh sách trạm và vị trí trên bản đồ
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="lg:hidden p-1.5 rounded-lg text-muted hover:text-ink hover:bg-panel2 transition-colors ml-2"
            title={isOpen ? 'Thu gọn' : 'Mở rộng'}
          >
            {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>

        {/* Khối Giải thích Cụm Radar phát sáng có số */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-sky-500/10 border border-sky-500/25 text-xs text-ink leading-tight">
            <div className="relative flex h-6 w-6 shrink-0 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-sky-400/40 animate-ping" />
              <span className="relative flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-blue-600 text-white font-mono text-[10px] font-bold border border-white shadow-xs">
                28
              </span>
            </div>
            <div className="text-[11px] sm:text-xs">
              <b className="text-sky-700 dark:text-sky-300 font-semibold">Icon Radar có số:</b> Cụm gom các trạm/điểm gần nhau. <b className="text-ink">Bấm vào số</b> trên bản đồ để phóng to.
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="hidden lg:flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-muted hover:text-ink hover:bg-panel2 px-2.5 py-1.5 rounded-lg transition-colors font-medium"
          >
            <span>{isOpen ? 'Thu gọn' : 'Mở rộng'}</span>
            {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {/* Lưới 6 Thẻ Ký hiệu Bản đồ */}
      {isOpen && (
        <div className="pt-3 space-y-3 animate-in fade-in duration-200">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {CATEGORIES.map((cat) => {
              const isSelected = selectedCat === cat.id;

              return (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => handleCardClick(cat.id)}
                  aria-expanded={isSelected}
                  className={clsx(
                    'p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between group',
                    isSelected
                      ? 'border-accent bg-accent/10 shadow-sm ring-1 ring-accent'
                      : 'border-line/70 bg-panel2/40 hover:bg-panel2 hover:border-line hover:shadow-xs'
                  )}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-xl group-hover:scale-110 transition-transform shrink-0">
                      {cat.badge}
                    </span>
                    <span
                      className={clsx(
                        'chip font-mono text-[11px] font-bold px-1.5 py-0.5 rounded-md',
                        isSelected ? 'bg-accent text-white' : 'bg-panel border border-line text-ink'
                      )}
                    >
                      {cat.count}
                    </span>
                  </div>

                  <div className="mt-2 min-w-0">
                    <div className="font-bold text-xs text-ink truncate leading-tight">
                      {cat.title}
                    </div>
                    <div className="text-[10px] text-muted truncate mt-0.5">
                      {cat.summary}
                    </div>
                  </div>

                  <div className="mt-2 pt-1.5 border-t border-line/40 flex items-center justify-between text-[10px] text-accent font-medium">
                    <span>{isSelected ? 'Đang mở ▼' : 'Xem danh sách →'}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Khay Chi tiết Danh sách các điểm khi người dùng bấm vào 1 thẻ */}
          {activeCategory && (
            <div className="p-3 sm:p-4 rounded-xl border border-accent/30 bg-panel2/60 relative animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-line/60">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{activeCategory.badge}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm text-ink">{activeCategory.title}</h3>
                      <span className="chip bg-accent text-white text-[10px] font-bold px-2 py-0.2">
                        {activeCategory.count} điểm
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-0.5">{activeCategory.desc}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  {onNavigateTab && (
                    <button
                      type="button"
                      onClick={() => onNavigateTab(activeCategory.tabId)}
                      className="btn-ghost text-xs py-1 px-2.5 text-accent hover:bg-accent/10"
                    >
                      Xem chuyên đề đầy đủ →
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedCat(null)}
                    className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-panel transition-colors"
                    title="Đóng danh sách"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Danh sách các trạm/điểm dạng thẻ ngang hoặc lưới */}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-h-[320px] overflow-y-auto scroll-thin pt-2.5 pr-1">
                {activeCategory.items.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl border border-line bg-panel flex items-center justify-between gap-2.5 hover:border-accent hover:shadow-xs transition-all"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-xs text-ink truncate leading-tight">
                        {item.name}
                      </div>
                      <div className="text-[11px] text-muted truncate mt-0.5">{item.sub}</div>
                      <div className="flex items-center gap-2 mt-1 text-[11px]">
                        <b className="font-semibold text-ink">{item.value}</b>
                        <span>·</span>
                        <span className={clsx('font-medium', item.statusColor)}>{item.status}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.phone && (
                        <a
                          href={`tel:${item.phone.replace(/\s+/g, '')}`}
                          className="btn-ghost text-xs p-1.5 text-good border border-good/40 bg-good/10 hover:bg-good/20 rounded-lg flex items-center gap-1 font-semibold"
                          title={`Gọi số trực điểm sơ tán: ${item.phone}`}
                        >
                          <PhoneCall size={12} />
                          <span className="hidden sm:inline">Gọi</span>
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleLocatePoint(item)}
                        className="btn-ghost text-xs p-1.5 text-accent border border-accent/30 bg-accent/5 hover:bg-accent/15 rounded-lg flex items-center gap-1"
                        title="Xem vị trí điểm này trên bản đồ"
                      >
                        <MapPin size={13} />
                        <span className="hidden sm:inline">Bản đồ</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
