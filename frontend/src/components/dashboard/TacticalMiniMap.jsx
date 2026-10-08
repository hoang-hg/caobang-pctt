import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleMarker, MapContainer, Pane, Popup, Tooltip, ZoomControl, useMap } from 'react-leaflet';
import clsx from 'clsx';
import { Crosshair, Maximize2 } from 'lucide-react';
import { useAreaQuery } from '../../api/hooks';
import { useStore } from '../../app/store';
import { useChartTheme } from '../charts/chartTheme';
import { AreaFocus, BaseLayer } from '../map/MapTools';
import { ALARM, INCIDENT, SOS_STATUS } from '../../utils/labels';
import { stationView } from '../../utils/stations';
import { num } from '../../utils/format';

const CENTER = [22.75, 106.05];
const LEVEL_NAME = ['', 'Vàng', 'Cam', 'Đỏ'];
const HAZARD_LEVEL = { do: 3, cam: 2, vang: 1 };
const FILTERS = [
  { id: 'all', label: 'Tất cả', min: 1 },
  { id: 'serious', label: 'Cam trở lên', min: 2 },
  { id: 'danger', label: 'Đỏ', min: 3 },
];

const coords = (f) => {
  const p = f.properties || {};
  const [lon, lat] = f.geometry?.coordinates || [];
  return { ...p, lat: p.lat ?? lat, lon: p.lon ?? lon };
};

/**
 * Điểm nóng lấy từ dữ liệu thật: trạm mực nước vượt báo động (số đo cũ vẫn giữ cấp đã vượt), phiếu SOS đang mở, điểm
 * sạt lở cấm đường / cảnh báo, hồ đang xả, điểm sự cố cán bộ đánh dấu. Mức 1–3 = Vàng / Cam / Đỏ.
 */
function buildHotspots(layers, k) {
  const out = [];
  for (const f of layers?.stations?.features || []) {
    const s = coords(f);
    if (s.type !== 'muc_nuoc') continue;
    const v = stationView(s);
    if (v.level) out.push({ id: `st-${s.id}`, kind: 'Mực nước', name: s.name, lat: s.lat, lon: s.lon, level: v.level, detail: `${v.value} · ${v.status}` });
  }
  for (const f of layers?.sos?.features || []) {
    const t = coords(f);
    out.push({
      id: `sos-${t.id}`,
      kind: 'SOS',
      name: `${t.code} · ${INCIDENT[t.incident_type] || 'Sự cố'}`,
      lat: t.lat,
      lon: t.lon,
      level: t.priority === 1 ? 3 : t.priority === 2 ? 2 : 1,
      detail: `${SOS_STATUS[t.status] || t.status}${t.trapped_count ? ` · ${t.trapped_count} người` : ''}${t.address ? ` · ${t.address}` : ''}`,
      to: '/cuu-ho',
    });
  }
  for (const p of k?.landslides?.points || []) {
    if (p.traffic_status !== 'cam_duong' && p.traffic_status !== 'canh_bao') continue;
    out.push({ id: `ls-${p.code}`, kind: 'Sạt lở', name: p.name, lat: p.lat, lon: p.lon, level: p.traffic_status === 'cam_duong' ? 3 : 2, detail: `${p.traffic_label} · ${p.road_name}` });
  }
  for (const r of k?.reservoirs?.reservoirs || []) {
    if (r.status_code !== 'xa_khan_cap' && r.status_code !== 'xa_dieu_tiet') continue;
    out.push({
      id: `hc-${r.id}`,
      kind: 'Hồ chứa',
      name: r.name,
      lat: r.lat,
      lon: r.lon,
      level: r.status_code === 'xa_khan_cap' ? 3 : 1,
      detail: `${r.status_label}${r.outflow_m3s != null ? ` · xả ${num(r.outflow_m3s)} m³/s` : ''}`,
    });
  }
  for (const f of layers?.hazard_points?.features || []) {
    const h = coords(f);
    out.push({ id: `hz-${h.id}`, kind: 'Sự cố', name: h.name, lat: h.lat, lon: h.lon, level: HAZARD_LEVEL[h.level] || 1, detail: h.description || '' });
  }
  return out.filter((h) => h.lat != null && h.lon != null).sort((a, b) => b.level - a.level);
}

/** Bay tới điểm được chọn trong danh sách bên cạnh. */
function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lon], Math.max(map.getZoom(), 12), { duration: 0.6 });
  }, [target, map]);
  return null;
}

/** Bản đồ điểm nóng thu nhỏ cho lãnh đạo: nền bản đồ chung của hệ thống (BaseLayer — tự lưu trữ / có ghi công), vùng
 * đang lọc (AreaFocus), điểm nóng từ /map/layers + KPI. Không có điểm nóng → nói rõ, không vẽ điểm minh hoạ. */
export default function TacticalMiniMap({ k, className }) {
  const { data: layers } = useAreaQuery('map-layers', '/map/layers', {}, { refetchInterval: 30_000 });
  const { data: area } = useAreaQuery('area', '/admin-units/area', {}, { staleTime: Infinity });
  const filtered = useStore((s) => s.filter.codes.length > 0);
  const c = useChartTheme(); // màu nhấn theo giao diện sáng / tối (Leaflet cần mã màu cụ thể, không đọc được biến CSS)
  const [level, setLevel] = useState('all');
  const [target, setTarget] = useState(null);

  const hotspots = useMemo(() => buildHotspots(layers, k), [layers, k]);
  const min = FILTERS.find((f) => f.id === level).min;
  const shown = hotspots.filter((h) => h.level >= min);
  const count = (m) => hotspots.filter((h) => h.level >= m).length;

  return (
    <section className={clsx('card flex flex-col gap-2 p-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="card-title">
          <Crosshair size={15} className="text-accent" /> Điểm nóng trên bản đồ
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setLevel(f.id)}
              aria-pressed={level === f.id}
              className={clsx(
                'rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
                level === f.id ? 'border-accent bg-accent text-white' : 'border-line bg-panel2/60 text-ink-2 hover:text-ink',
              )}
            >
              {f.label} ({count(f.min)})
            </button>
          ))}
          <Link to="/ban-do" className="btn-ghost px-2 py-0.5 text-[11px]">
            <Maximize2 size={12} /> Bản đồ đầy đủ
          </Link>
        </div>
      </div>

      <div className="grid gap-2 lg:grid-cols-[1fr_260px] [&>*]:min-w-0">
        {/* isolate: các lớp Leaflet (z-index tới 1000) không đè dải báo động dính trên cùng khi cuộn */}
        <div className="relative isolate z-0 h-[260px] overflow-hidden rounded-lg border border-line sm:h-[320px]">
          <MapContainer center={CENTER} zoom={8} zoomControl={false} scrollWheelZoom={false} className="h-full w-full">
            <BaseLayer basemap="auto" />
            <ZoomControl position="bottomright" />
            <AreaFocus area={area} filtered={filtered} />
            <FlyTo target={target} />
            {shown.map((h) => {
              const isSelected = target && target.lat === h.lat && target.lon === h.lon;
              return (
                <CircleMarker
                  key={h.id}
                  center={[h.lat, h.lon]}
                  radius={isSelected ? 11 : h.level === 3 ? 9 : 7}
                  pathOptions={{
                    color: isSelected ? c.s1 : '#ffffff',
                    weight: isSelected ? 3 : 2,
                    fillColor: ALARM[h.level].color,
                    fillOpacity: 0.95,
                  }}
                  eventHandlers={{
                    click: () => setTarget({ lat: h.lat, lon: h.lon, at: Date.now() }),
                  }}
                >
                  <Tooltip direction="top">{h.kind}: {h.name}</Tooltip>
                  <Popup>
                    <div className="text-xs">
                      <b>{h.name}</b>
                      <div>{h.kind} · mức {LEVEL_NAME[h.level]}</div>
                      {h.detail && <div>{h.detail}</div>}
                      {h.to && <Link to={h.to} className="font-semibold">Mở Điều hành cứu hộ →</Link>}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
            {/* Vòng đánh dấu điểm đang chọn: pane riêng DƯỚI lớp điểm (overlayPane 400) — Leaflet nối hình mới vào cuối
                SVG nên vẽ chung pane sẽ đè lên điểm; interactive=false để bấm vào điểm vẫn mở được popup */}
            <Pane name="diem-chon" style={{ zIndex: 390 }}>
              {target && (
                <>
                  <CircleMarker
                    center={[target.lat, target.lon]}
                    radius={26}
                    interactive={false}
                    pathOptions={{ color: c.s1, weight: 2, fillColor: c.s1, fillOpacity: 0.2, dashArray: '4, 4' }}
                  />
                  <CircleMarker
                    center={[target.lat, target.lon]}
                    radius={16}
                    interactive={false}
                    pathOptions={{ color: '#ffffff', weight: 2, fillColor: c.s1, fillOpacity: 0.45 }}
                  />
                </>
              )}
            </Pane>
          </MapContainer>
          {!hotspots.length && (
            <div className="pointer-events-none absolute inset-x-2 top-2 z-[500] rounded-lg bg-panel/90 px-3 py-2 text-center text-xs text-ink-2 shadow">
              Chưa ghi nhận điểm nóng (trạm vượt báo động, SOS đang mở, sạt lở cấm đường, hồ xả, sự cố) trong vùng đang xem
            </div>
          )}
        </div>

        <ul className="scroll-thin flex max-h-[320px] flex-col gap-1 overflow-y-auto pr-1 print:max-h-none print:overflow-visible">
          {shown.slice(0, 30).map((h) => {
            const isTarget = target && target.lat === h.lat && target.lon === h.lon;
            return (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => setTarget({ lat: h.lat, lon: h.lon, at: Date.now() })}
                  className={clsx(
                    'flex w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition',
                    isTarget ? 'border-accent bg-accent/15 ring-1 ring-accent' : 'border-line/60 hover:bg-panel2',
                  )}
                >
                  <span className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ALARM[h.level].color }} />
                  <span className="min-w-0">
                    <span className={clsx('block truncate', isTarget ? 'font-bold text-accent' : 'font-semibold text-ink')}>{h.name}</span>
                    <span className="block truncate text-muted">{h.kind}{h.detail ? ` · ${h.detail}` : ''}</span>
                  </span>
                </button>
              </li>
            );
          })}
          {!shown.length && <li className="py-6 text-center text-xs text-muted">Không có điểm nóng ở mức đã chọn</li>}
          {shown.length > 30 && <li className="text-center text-[11px] text-muted">… và {shown.length - 30} điểm khác — xem bản đồ đầy đủ</li>}
        </ul>
      </div>
    </section>
  );
}
