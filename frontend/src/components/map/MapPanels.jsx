import { Fragment, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Circle as CircleIcon, Clock, Compass, MapPin, Megaphone, PenTool, Route, Ruler, Search, Send, X } from 'lucide-react';
import { useEscapeToClose } from '../common/ui';
import { Can } from '../../rbac/usePermission';
import { ALARM, alarmLevel, INCIDENT, PRIORITY, STATION_TYPE } from '../../utils/labels';
import { ago, int } from '../../utils/format';
import { fmtVn } from '../../utils/bulletin';

/**
 * Các lớp của bản đồ giám sát (thiết kế B.2, 4 nhóm). `perm`: quyền xem cần có — API trả lớp rỗng khi thiếu quyền
 * (map_layers.py), giao diện ẩn hẳn lớp đó thay vì hiện "0 SOS" như thể không có sự cố.
 */
export const LAYER_GROUPS = [
  {
    title: 'Thủy văn & Khí tượng',
    items: [
      { key: 'stations', label: 'Trạm đo mưa, mực nước, cảm biến IoT' },
      { key: 'reservoirs', label: 'Hồ chứa & đập thủy điện' },
      { key: 'forecast', label: 'Mưa dự báo 24h theo xã (ECMWF + GFS)' },
      { key: 'radar', label: 'Radar mưa thời gian thực' },
      { key: 'storm', label: 'Quỹ đạo bão / áp thấp' },
    ],
  },
  {
    title: 'Cảnh báo & Vùng nguy hiểm',
    items: [
      { key: 'flood', label: 'Vùng ngập lụt' },
      { key: 'floodScenario', label: 'Vùng ngập theo kịch bản (BĐ I–III)' },
      { key: 'landslide', label: 'Vùng sạt lở / lũ quét' },
      { key: 'hazardPoints', label: 'Điểm nóng sạt lở, sự cố giao thông – hạ tầng' },
      { key: 'reports', label: 'Phản ánh của người dân (72 giờ)', perm: 'report' },
      { key: 'roads', label: 'Mạng đường & đoạn bị chặn' },
    ],
  },
  {
    title: 'Lực lượng & Vật tư',
    items: [
      { key: 'forces', label: 'Lực lượng cứu hộ', perm: 'resource' },
      { key: 'vehicles', label: 'Xuồng, xe, thiết bị', perm: 'resource' },
      { key: 'routes', label: 'Lộ trình đang điều động', perm: 'sos' },
      { key: 'warehouses', label: 'Kho vật tư', perm: 'resource' },
      { key: 'evac', label: 'Điểm sơ tán an toàn', perm: 'resource' },
      { key: 'cameras', label: 'Camera CCTV' },
    ],
  },
  { title: 'Yêu cầu cứu hộ', items: [{ key: 'sos', label: 'Điểm SOS từ người dân / cảm biến', perm: 'sos' }] },
  { title: 'Nền hành chính', items: [{ key: 'admin', label: 'Ranh giới xã/phường' }] },
];
export const LAYER_ORDER = LAYER_GROUPS.flatMap((g) => g.items.map((it) => it.key));

export const DEFAULT_LAYERS = {
  stations: true, reservoirs: true, forecast: false, radar: false, storm: false, flood: true, floodScenario: true, landslide: true, hazardPoints: true,
  reports: true, roads: false,
  forces: true, vehicles: false, routes: true, warehouses: true, evac: false, cameras: true, sos: true, admin: true,
};

/** Ghi chú khi lớp danh mục đang trống — chạy thật chưa nhập thì nói rõ, không để bản đồ im lặng như "không có gì". */
const EMPTY_NOTE = {
  stations: 'Chưa có trạm trong vùng đang xem (nhập loại "Trạm quan trắc")',
  reservoirs: 'Chưa có hồ chứa (nhập loại "Hồ chứa")',
  forces: 'Chưa có lực lượng (nhập loại "Lực lượng")',
  vehicles: 'Chưa có phương tiện (nhập loại "Phương tiện")',
  warehouses: 'Chưa có kho (nhập loại "Kho vật tư")',
  evac: 'Chưa có điểm sơ tán (nhập loại "Điểm sơ tán")',
  cameras: 'Chưa có camera nào được khai báo',
};
// Ghi chú cố định: lực lượng chưa gắn thiết bị định vị — vị trí là nơi đóng quân đã nhập, không phải GPS trực tiếp
const FIXED_NOTE = { forces: 'Vị trí đơn vị đã nhập — chưa gắn thiết bị định vị' };

/** Số đối tượng của từng lớp trong vùng đang xem (hiện cạnh tên lớp). */
export function layerCounts(data) {
  if (!data) return {};
  const zones = data.hazard_zones.features;
  return {
    stations: data.stations.features.length,
    reservoirs: data.reservoirs.features.length,
    flood: zones.filter((f) => f.properties.type === 'ngap').length,
    landslide: zones.filter((f) => f.properties.type !== 'ngap').length,
    hazardPoints: data.hazard_points.features.length,
    reports: data.reports?.features.length ?? 0,
    forces: data.forces.features.length,
    vehicles: data.vehicles.features.length,
    routes: data.routes.features.length,
    warehouses: data.warehouses.features.length,
    evac: data.evacuation_sites.features.length,
    cameras: data.cameras.features.length,
    sos: data.sos.features.length,
  };
}

/** Bảng bật / tắt lớp. `touch`: dòng cao ≥ 44 px (điện thoại, máy tính bảng). */
export function LayerList({ groups, layers, setLayers, unavailable, notes, counts, canStorm, onStorm, touch }) {
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.title} className="space-y-1">
          <div className="px-1 text-[11px] font-bold uppercase tracking-wider text-muted">{g.title}</div>
          <div className="space-y-0.5">
            {g.items.map(({ key, label }) => {
              const off = unavailable[key];
              const n = counts[key];
              const note = off || (n === 0 && EMPTY_NOTE[key]) || notes[key] || FIXED_NOTE[key];
              return (
                <Fragment key={key}>
                  <label
                    className={clsx(
                      'flex items-center gap-2.5 rounded-lg px-2 text-xs transition-colors',
                      touch ? 'min-h-[44px] py-1.5' : 'min-h-[32px] py-1',
                      off
                        ? 'cursor-not-allowed text-muted'
                        : layers[key] ? 'cursor-pointer bg-panel2 font-medium text-ink' : 'cursor-pointer text-ink-2 hover:bg-panel2/60',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={layers[key] && !off}
                      disabled={!!off}
                      onChange={(e) => setLayers((l) => ({ ...l, [key]: e.target.checked }))}
                      className={clsx('shrink-0 rounded accent-[rgb(var(--accent))]', touch && 'h-5 w-5')}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{label}</span>
                      {note && <span className={clsx('block text-[10px] font-normal', !off && 'text-muted')}>{note}</span>}
                    </span>
                    {n != null && !off && <span className="shrink-0 font-mono text-[11px] text-muted" title="Số đối tượng trong vùng đang xem">{n}</span>}
                  </label>
                  {key === 'storm' && canStorm && (
                    <button
                      type="button"
                      className={clsx('ml-8 text-[11px] font-medium text-accent hover:underline', touch && 'min-h-[40px]')}
                      onClick={onStorm}
                    >
                      Nhập / cập nhật bản tin bão
                    </button>
                  )}
                </Fragment>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Bảng Cảnh báo khẩn cấp (thiết kế B.1 — feed bên phải): phiếu SOS đang mở + trạm vượt báo động / mất tín hiệu. Tài khoản
 * không có quyền xem SOS chỉ thấy thẻ Cảm biến. Chạm một mục → bản đồ bay tới (`onFocus`).
 */
export function AlertsList({ tab, setTab, sos, sensorAlerts, silentStations, noDataCount, canSos, canDispatch, onFocus, onDispatch, touch }) {
  const [search, setSearch] = useState('');
  const active = canSos ? tab : 'sensors';
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sos;
    return sos.filter((s) => s.code?.toLowerCase().includes(q) || s.address?.toLowerCase().includes(q) || s.admin_name?.toLowerCase().includes(q));
  }, [sos, search]);
  const tabBtn = (id, label) => (
    <button
      key={id}
      type="button"
      className={clsx('flex-1 rounded-lg text-xs font-medium transition-colors', touch ? 'min-h-[44px]' : 'min-h-[30px]', active === id ? 'bg-accent text-white' : 'text-muted hover:bg-panel2')}
      onClick={() => setTab(id)}
      aria-pressed={active === id}
    >
      {label}
    </button>
  );
  const item = 'w-full rounded-xl border border-line text-left shadow-sm transition-all hover:border-accent';
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-line bg-panel2/40 px-3 py-2">
        <div className="flex gap-1">
          {canSos && tabBtn('sos', `Phiếu SOS (${sos.length})`)}
          {tabBtn('sensors', `Cảm biến (${sensorAlerts.length + silentStations.length})`)}
        </div>
        {active === 'sos' && (
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              className={clsx('input pl-7 text-xs', touch ? 'min-h-[44px]' : 'py-1')}
              placeholder="Tìm mã SOS, địa điểm..."
              aria-label="Tìm phiếu SOS"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
        {active === 'sos' && (
          <>
            {shown.map((s) => (
              <div key={s.id} className={item}>
                <button type="button" className="w-full rounded-xl p-2.5 text-left hover:bg-panel2/80" onClick={() => onFocus({ lat: s.lat, lon: s.lon, zoom: 15, label: s.code })}>
                  <div className="flex items-center gap-2">
                    <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', s.status === 'moi' && 'animate-blink', { 1: 'bg-danger', 2: 'bg-serious', 3: 'bg-warn' }[s.priority])} />
                    <b className="text-sm font-bold text-ink">{s.code}</b>
                    <span className="text-xs text-muted">{PRIORITY[s.priority]?.short || `Cấp ${s.priority}`}</span>
                    <span className="ml-auto text-[11px] text-muted">{ago(s.received_at)}</span>
                  </div>
                  <div className="mt-1 text-xs text-ink-2">
                    {INCIDENT[s.incident_type] || s.incident_type} · <b>{s.trapped_count} người</b> · <span className="text-muted">{s.address}</span>
                  </div>
                </button>
                {s.status === 'moi' && canDispatch && (
                  <button
                    type="button"
                    className={clsx('mx-1.5 mb-1.5 inline-flex items-center gap-1 rounded-lg px-2 text-[11px] font-bold text-danger hover:bg-danger/10', touch ? 'min-h-[40px]' : 'min-h-[26px]')}
                    onClick={() => onDispatch(s)}
                  >
                    <Send size={12} aria-hidden="true" /> Điều phối lực lượng
                  </button>
                )}
              </div>
            ))}
            {!shown.length && (
              <div className="py-8 text-center text-xs text-muted">
                {search ? 'Không tìm thấy phiếu phù hợp' : 'Không có phiếu SOS đang mở trong vùng đang xem'}
              </div>
            )}
          </>
        )}

        {active === 'sensors' && (
          <>
            {sensorAlerts.map((p) => {
              const lv = alarmLevel(p.value, p.thresholds);
              return (
                <button key={p.id} type="button" className={clsx(item, 'p-2.5 hover:bg-panel2/80')} onClick={() => onFocus({ lat: p.lat, lon: p.lon, zoom: 14, label: p.name })}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className={clsx('chip text-[10px] font-bold', ALARM[lv].cls)}>{ALARM[lv].label}</span>
                    <span className="text-muted">{STATION_TYPE[p.type]}</span>
                  </div>
                  <div className="truncate text-xs font-medium text-ink">{p.name}</div>
                  <div className="mt-0.5 font-mono text-xs font-bold text-accent">{p.value?.toFixed(2)} {p.unit}</div>
                </button>
              );
            })}
            {silentStations.length > 0 && (
              <div className="pt-1 text-[11px] font-bold uppercase tracking-wide text-muted">Mất tín hiệu ({silentStations.length})</div>
            )}
            {silentStations.map((p) => {
              const lv = alarmLevel(p.value, p.thresholds);
              return (
                <button
                  key={p.id}
                  type="button"
                  className="w-full rounded-xl border border-dashed border-line p-2.5 text-left transition-all hover:border-accent hover:bg-panel2/80"
                  onClick={() => onFocus({ lat: p.lat, lon: p.lon, zoom: 14, label: p.name })}
                >
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="chip bg-panel2 text-[10px] font-bold text-muted">Mất tín hiệu từ {fmtVn(p.time)}</span>
                    <span className="text-muted">{STATION_TYPE[p.type]}</span>
                  </div>
                  <div className="truncate text-xs font-medium text-ink">{p.name}</div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    Số đo cuối {p.value?.toFixed(2)} {p.unit}
                    {lv > 0 && <span className={clsx('chip ml-1 text-[10px]', ALARM[lv].cls)}>{ALARM[lv].label}</span>}
                  </div>
                </button>
              );
            })}
            {!sensorAlerts.length && !silentStations.length && (
              <div className="py-8 text-center text-xs text-muted">
                Không có trạm vượt báo động hoặc mất tín hiệu
                {noDataCount > 0 && <span className="mt-1 block">{noDataCount} trạm chưa có số đo — không coi là an toàn</span>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const QUICK_HOURS = [-12, -6, 0, 6, 12, 24];

/** Thanh thời gian (thiết kế B.1): −12 giờ (số đo đã qua) → +24 giờ (dự báo, quỹ đạo bão). */
export function TimeControl({ offset, setOffset, touch }) {
  const when = new Date(Date.now() + offset * 3600_000).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  return (
    <div>
      <div className="flex items-center gap-3">
        <Clock size={16} className="shrink-0 text-accent" aria-hidden="true" />
        <input
          type="range"
          min={-12}
          max={24}
          step={1}
          value={offset}
          onChange={(e) => setOffset(Number(e.target.value))}
          className={clsx('min-w-0 flex-1 accent-[rgb(var(--accent))]', touch && 'h-10')}
          aria-label="Thanh trượt thời gian"
          aria-valuetext={offset === 0 ? 'Hiện tại' : `${offset > 0 ? '+' : ''}${offset} giờ — ${when}`}
        />
        <div className="w-32 shrink-0 text-right text-xs">
          {offset === 0 ? (
            <>
              <b className="font-bold text-good">Hiện tại</b>
              <span className="block text-[11px] text-muted">thời gian thực</span>
            </>
          ) : (
            <>
              <b className="text-accent">{offset > 0 ? `+${offset}h · dự báo` : `${offset}h · đã qua`}</b>
              <span className="block text-[11px] text-muted">{when}</span>
            </>
          )}
        </div>
      </div>
      <div className="mt-1.5 grid grid-cols-6 gap-1 border-t border-line/50 pt-1.5">
        {QUICK_HOURS.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => setOffset(h)}
            aria-pressed={offset === h}
            className={clsx(
              'rounded-lg text-[11px] font-semibold',
              touch ? 'min-h-[44px]' : 'min-h-[26px]',
              offset === h ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-panel2',
            )}
          >
            {h === 0 ? 'Hiện tại' : `${h > 0 ? '+' : ''}${h}h`}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Công cụ bản đồ (thiết kế B.1, B.3): [mã, biểu tượng, mô tả, nhãn ngắn]. Đánh dấu sự cố chỉ cho tài khoản có quyền. */
export const toolList = (canIncident) => [
  ['measure', Ruler, 'Đo khoảng cách (km)', 'Đo khoảng cách'],
  ['route', Route, 'Tìm đường an toàn A → B (tránh vùng nguy hiểm)', 'Đường an toàn'],
  ['polygon', PenTool, 'Khoanh vùng nguy cơ (đa giác)', 'Khoanh đa giác'],
  ['circle', CircleIcon, 'Khoanh vùng tròn', 'Khoanh tròn'],
  ...(canIncident ? [['incident', MapPin, 'Đánh dấu điểm sự cố (cây đổ, đứt điện, sập cầu…)', 'Đánh dấu sự cố']] : []),
];

const TOOL_NAME = { measure: 'Thước đo', route: 'Dò đường an toàn', incident: 'Đánh dấu sự cố' };

/** Hướng dẫn công cụ đang dùng (và kết quả dò đường). */
export function ToolHint({ tool, routeInfo, onClose, className }) {
  return (
    <div className={clsx('card border border-accent/40 bg-panel/95 px-3.5 py-2 text-xs shadow-xl backdrop-blur-md', className)} role="status">
      <div className="mb-1 flex items-center justify-between gap-2 font-semibold text-accent">
        <span>Đang dùng: {TOOL_NAME[tool] || 'Khoanh vùng'}</span>
        <button type="button" onClick={onClose} className="-m-1 flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-panel2 hover:text-ink" aria-label="Tắt công cụ">
          <X size={14} />
        </button>
      </div>
      {tool === 'measure' && 'Chạm lên bản đồ để thêm các điểm đo khoảng cách. Bấm lại nút thước để xoá.'}
      {tool === 'route' && (routeInfo ? (
        <span>
          Lộ trình: <b>{routeInfo.distance_km} km</b> (~{routeInfo.duration_min}′) ·{' '}
          {routeInfo.safe
            ? <b className="text-good">Né vùng nguy hiểm đã ghi nhận</b>
            : <b className="text-danger">Đi qua vùng nguy hiểm{routeInfo.hazards?.length ? `: ${routeInfo.hazards.join(', ')}` : ''}</b>}
          {routeInfo.offroad_km >= 0.5 && <span className="text-warn"> · {routeInfo.offroad_km} km chưa có dữ liệu đường</span>}
          <br /><span className="text-muted">{routeInfo.roads.join(' → ')}</span>
          {routeInfo.warnings?.map((w) => <span key={w} className="block text-warn">⚠ {w}</span>)}
        </span>
      ) : (
        'Chạm chọn điểm A (vị trí lực lượng) rồi điểm B (nơi cần cứu hộ).'
      ))}
      {(tool === 'polygon' || tool === 'circle') && 'Vẽ vùng nguy cơ: hệ thống tự động đếm số hộ dân và chuẩn bị cảnh báo sơ tán.'}
      {tool === 'incident' && 'Chạm vào vị trí sự cố trên bản đồ để đánh dấu (hiện ngay trên cổng công khai).'}
    </div>
  );
}

/** Kết quả khoanh vùng: diện tích, dân số, số hộ… → soạn cảnh báo sơ tán (quyền alert.create, vẫn qua phê duyệt). */
export function DrawnStats({ drawn, onClose, onAlert, touch, className }) {
  return (
    <div className={clsx('card border border-line bg-panel/95 p-3.5 shadow-2xl backdrop-blur-md', className)}>
      <div className="mb-2 flex items-center justify-between border-b border-line pb-1.5 text-sm font-bold text-ink">
        <span>Phân tích vùng khoanh</span>
        <button type="button" onClick={onClose} className="-m-1 flex h-8 w-8 items-center justify-center rounded-lg hover:bg-panel2" aria-label="Đóng phân tích vùng">
          <X size={14} />
        </button>
      </div>
      {!drawn.stats ? (
        <div className="flex items-center gap-2 py-3 text-xs text-muted">
          <Compass size={14} className="animate-spin text-accent" aria-hidden="true" />
          <span>Đang tính toán không gian địa lý…</span>
        </div>
      ) : (
        <>
          <div className="my-1 grid grid-cols-2 gap-1 text-xs">
            <div className="text-muted">Diện tích:</div><b className="text-right font-mono">{int(drawn.stats.area_km2)} km²</b>
            <div className="text-muted">Dân số ước tính:</div><b className="text-right font-mono">{int(drawn.stats.population)} người</b>
            <div className="text-muted">Hộ gia đình:</div><b className="text-right font-mono">{int(drawn.stats.households)} hộ</b>
            <div className="text-muted">Thuê bao di động:</div><b className="text-right font-mono">{int(drawn.stats.subscribers)} TB</b>
            <div className="text-muted">SOS đang mở:</div><b className="text-right font-mono text-danger">{drawn.stats.sos_open}</b>
            <div className="text-muted">Chỗ trống sơ tán:</div><b className="text-right font-mono text-good">{int(drawn.stats.evac_free)}</b>
          </div>
          <Can I="alert" a="create">
            <button
              type="button"
              className={clsx('btn-danger mt-2 w-full justify-center text-xs font-semibold shadow-sm', touch ? 'min-h-[44px]' : 'py-2')}
              onClick={onAlert}
            >
              <Megaphone size={14} aria-hidden="true" /> Soạn cảnh báo sơ tán vùng này
            </button>
          </Can>
        </>
      )}
    </div>
  );
}

/** Bảng trượt từ đáy (điện thoại, máy tính bảng): một bảng mỗi lúc, bản đồ vẫn thấy phía trên; Esc / nút X để đóng. */
export function Sheet({ title, onClose, actions, children, bodyClass = 'scroll-thin overflow-y-auto p-3' }) {
  useEscapeToClose(true, onClose);
  return (
    <section className="absolute inset-x-0 bottom-0 z-[1100] flex max-h-[72%] flex-col rounded-t-2xl border-t border-line bg-panel shadow-2xl" aria-label={title}>
      <div className="mx-auto mt-1.5 h-1 w-10 shrink-0 rounded-full bg-line" aria-hidden="true" />
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line py-0.5 pl-3 pr-1">
        <b className="text-sm text-ink">{title}</b>
        <div className="flex items-center gap-1">
          {actions}
          <button type="button" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-panel2 hover:text-ink" onClick={onClose} aria-label={`Đóng ${title.toLowerCase()}`}>
            <X size={18} />
          </button>
        </div>
      </div>
      <div className={clsx('min-h-0 flex-1', bodyClass)}>{children}</div>
    </section>
  );
}
