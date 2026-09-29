import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Circle, GeoJSON, MapContainer, Marker, Pane, Polyline, Popup, Tooltip, useMap } from 'react-leaflet';
import clsx from 'clsx';
import {
  ShieldAlert, LocateFixed, Megaphone, Phone, Home, CloudRain, Waves, Camera, LogIn, Moon, Sun, Navigation, AlertTriangle,
  CheckCircle2, Loader2, Share2, BookOpen, HelpCircle, MapPin, ChevronRight, PhoneCall, Compass, Search,
  Droplets, Mountain, X, Zap, ArrowLeft
} from 'lucide-react';
import { api } from '../../api/client';
import { useUnitsGeo, useUnits, useProvinceArea } from '../../api/hooks';
import { useStore } from '../../app/store';
import { AdminBoundaries, BaseLayer, RAIN_BINS } from '../../components/map/MapTools';
import { evacIcon, hazardIcon, pinIcon, stationIcon, reservoirIcon } from '../../components/map/icons';
import { LEVEL } from '../../utils/labels';
import { ago, dateTime } from '../../utils/format';
import { stationView } from '../../utils/stations';
import L from 'leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import MapLegendBox, { POINT_EMOJI } from '../../components/map/MapLegendBox';
import { BackButton, useEscapeToClose } from '../../components/common/ui';
import TopLegendBar from '../../components/map/TopLegendBar';
import ReportForm from './ReportForm';
import TicketTracker from './TicketTracker';
import ReservoirMonitor from './ReservoirMonitor';
import LandslideMonitor, { maxTiltText } from './LandslideMonitor';
import NetworkBanner from './NetworkBanner';

const SOURCE_TAB_LABEL = { hochua: 'Quay lại Hồ chứa', satlo: 'Quay lại Sạt trượt', sotan: 'Quay lại Điểm sơ tán' };
const REFRESH = 60_000;
const pub = (path, params) => api(`/public${path}`, { params });
const PROVINCE_COLOR = '#dc2626'; // ranh giới tỉnh: một màu cố định
const RISK = {
  cao: { label: 'Nguy cơ CAO', cls: 'bg-danger text-white', icon: AlertTriangle, tip: 'Bạn đang nằm trong vùng có nguy cơ ngập lụt hoặc sạt lở đất. Hãy chủ động di dời tới điểm an toàn!' },
  trung_binh: { label: 'Cần theo dõi', cls: 'bg-warn text-black', icon: AlertTriangle, tip: 'Khu vực lân cận có nguy cơ hoặc dự báo mưa to. Cần chuẩn bị phương án phòng tránh.' },
  thap: { label: 'Nguy cơ thấp', cls: 'bg-good text-white', icon: CheckCircle2, tip: 'Vị trí hiện tại an toàn, lượng mưa dự báo trong ngưỡng an toàn.' },
};
const SEV = { do: 'border-danger bg-danger/10', cam: 'border-serious bg-serious/10', vang: 'border-warn bg-warn/10' };
const rainColor = (mm) => RAIN_BINS.find((b) => mm < b.max).color;

function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lon], target.zoom || 13, { duration: 0.8 });
  }, [target, map]);
  return null;
}

const createClusterCustomIcon = (cluster) => {
  const count = cluster.getChildCount();
  let size = 36;
  let fontSize = 13;
  let levelCls = 'cluster-radar-sm';
  if (count >= 30) {
    size = 46;
    fontSize = 15;
    levelCls = 'cluster-radar-lg';
  } else if (count >= 10) {
    size = 40;
    fontSize = 14;
    levelCls = 'cluster-radar-md';
  }

  return L.divIcon({
    html: `
      <div class="radar-cluster-wrapper" style="width:${size}px;height:${size}px;" title="Cụm ${count} điểm giám sát (Bấm để phóng to)">
        <div class="radar-pulse-ring"></div>
        <div class="radar-cluster-core ${levelCls}" style="width:${size}px;height:${size}px;font-size:${fontSize}px;">
          ${count}
        </div>
      </div>
    `,
    className: 'custom-cluster-icon',
    iconSize: L.point(size, size, true),
    iconAnchor: [size / 2, size / 2],
  });
};

function PublicMap({ data, forecast, geo, me, route, target, layers, basemap = 'street', onSelectPoint, provinceArea }) {
  const byCode = useMemo(() => Object.fromEntries((forecast || []).map((a) => [a.code, a])), [forecast]);
  return (
    <MapContainer center={[22.75, 106.05]} zoom={8.5} zoomSnap={0.25} className="h-full w-full" scrollWheelZoom>
      <BaseLayer basemap={basemap} />
      <FlyTo target={target} />

      {/* Ranh giới xã/phường (luôn hiện) rồi ranh giới tỉnh trên cùng — pane riêng, không bị lớp tô màu che */}
      <AdminBoundaries geo={geo} basemap={basemap} interactive={false} />
      {provinceArea?.geometry && (
        <Pane name="ranh-gioi-tinh" style={{ zIndex: 430 }}>
          <GeoJSON
            key={`prov-casing-${basemap}`}
            data={provinceArea.geometry}
            style={{ color: basemap === 'satellite' ? '#000000' : '#ffffff', weight: 6, opacity: 0.9, fill: false }}
            interactive={false}
          />
          <GeoJSON
            key={`prov-line-${basemap}`} // vẽ lại cùng viền nền khi đổi nền → luôn nằm trên viền
            data={provinceArea.geometry}
            style={{ color: PROVINCE_COLOR, weight: 3.5, opacity: 1, fill: false, dashArray: '10 4' }}
            interactive={false}
          />
        </Pane>
      )}

      {layers.forecast && geo && forecast?.length > 0 && (
        <GeoJSON
          key={`fc-${forecast.length}-${forecast[0]?.p50}`}
          data={{ ...geo, features: geo.features.filter((f) => byCode[f.properties.code]) }}
          style={(f) => ({
            stroke: false, // đường biên xã do AdminBoundaries vẽ
            fillColor: rainColor(byCode[f.properties.code].p50),
            fillOpacity: 0.55,
          })}
          onEachFeature={(f, l) => {
            const a = byCode[f.properties.code];
            l.bindTooltip(`<b>${a.name}</b><br/>Mưa 24h tới: <b>${a.p50} mm</b> (có thể tới ${a.p90} mm)`, { sticky: true });
          }}
        />
      )}
      {layers.hazard && data?.hazard_zones.map((z, i) => (
        <GeoJSON key={`z${i}-${z.name}`} data={z.geom}
          style={{ color: z.type === 'ngap' ? '#1d4ed8' : LEVEL[z.level].color, weight: 1.5, fillColor: z.type === 'ngap' ? '#2563eb' : LEVEL[z.level].color, fillOpacity: 0.3 }}>
          <Tooltip sticky>{z.name}</Tooltip>
        </GeoJSON>
      ))}
      {layers.hazard && data?.blocked_roads.map((r, i) => (
        <GeoJSON key={`r${i}`} data={r.geom} style={{ color: '#ef4444', weight: 5, dashArray: '6 5' }}>
          <Tooltip sticky>{r.road_name} – đoạn đang nguy hiểm, hạn chế đi lại</Tooltip>
        </GeoJSON>
      ))}

      {/* Gom cụm điểm bằng MarkerClusterGroup để chống rối mắt */}
      <MarkerClusterGroup
        chunkedLoading
        iconCreateFunction={createClusterCustomIcon}
        maxClusterRadius={45}
        spiderfyOnMaxZoom={true}
        showCoverageOnHover={false}
      >
        {layers.hazard && data?.hazard_points.map((p, i) => (
          <Marker
            key={`h${i}`}
            position={[p.lat, p.lon]}
            icon={hazardIcon(p.type, p.level)}
            eventHandlers={{
              click: () => onSelectPoint?.({
                id: `hazard-${i}`,
                name: p.name,
                sub: p.description,
                type: 'landslide',
                raw: p,
              }),
            }}
          >
            <Popup><b>{p.name}</b><p className="text-xs">{p.description}</p></Popup>
          </Marker>
        ))}
        {layers.stations && data?.stations.filter((s) => s.type !== 'do_am_dat').map((s) => {
          // Chưa có số đo / mất tín hiệu → biểu tượng xám, không bao giờ hiện "An toàn"
          const view = stationView(s);
          return (
            <Marker
              key={s.id}
              position={[s.lat, s.lon]}
              icon={stationIcon(s.type, view.level, view.marker)}
              eventHandlers={{
                click: () => onSelectPoint?.({
                  id: s.id,
                  name: s.name,
                  sub: s.admin_name || 'Cao Bằng',
                  value: view.value,
                  status: view.status,
                  statusColor: view.statusColor,
                  type: s.type === 'luong_mua' ? 'rain' : 'water',
                  raw: s,
                }),
              }}
            >
              <Popup><b>{s.name}</b><div className="text-sm">{view.value}</div><div className={clsx('text-xs', view.statusColor)}>{view.status}</div></Popup>
            </Marker>
          );
        })}
        {layers.evac && data?.evacuation_sites.map((e) => (
          <Marker
            key={e.id}
            position={[e.lat, e.lon]}
            icon={evacIcon(e.current_occupancy / e.capacity)}
            eventHandlers={{
              click: () => onSelectPoint?.({
                id: e.id,
                name: e.name,
                sub: e.admin_name,
                value: `Trống ${Math.max(0, e.capacity - e.current_occupancy)} chỗ`,
                type: 'evac',
                raw: e,
              }),
            }}
          >
            <Popup><b>{e.name}</b><div className="text-sm">Còn trống: <b>{Math.max(0, e.capacity - e.current_occupancy)}</b>/{e.capacity} chỗ</div><div className="text-xs text-muted">{e.admin_name}</div></Popup>
          </Marker>
        ))}
        {layers.reservoirs && data?.reservoirs?.map((r) => (
          <Marker
            key={r.id}
            position={[r.lat, r.lon]}
            icon={reservoirIcon(r.spill_gates_open)}
            eventHandlers={{
              click: () => onSelectPoint?.({
                id: r.id,
                name: r.name,
                sub: `${r.river ? `Sông ${r.river} · ` : ''}${r.admin_name}`,
                type: 'reservoir',
                raw: r,
              }),
            }}
          >
            <Popup>
              <div className="space-y-1">
                <div className="font-bold text-sm text-ink">{r.name}</div>
                <div className="text-xs text-muted">Sông {r.river} · {r.admin_name}</div>
                <div className="text-xs pt-1 border-t border-line/60">
                  Trạng thái:{' '}
                  <b className={r.status_code === 'xa_khan_cap' ? 'text-danger font-bold' : r.status_code === 'xa_dieu_tiet' ? 'text-serious font-bold' : r.status_code === 'chua_co_so_lieu' ? 'text-muted font-bold' : 'text-good font-bold'}>
                    {r.status_label}
                  </b>
                </div>
                {r.status_code === 'chua_co_so_lieu' ? (
                  <div className="text-xs text-muted">Chưa có số liệu vận hành từ đơn vị quản lý hồ.</div>
                ) : (
                  <>
                    <div className="text-xs">
                      Mực nước: <b>{r.current_level} m</b> (MNDBT {r.normal_level} m, {r.level_diff >= 0 ? '+' : ''}{r.level_diff} m)
                    </div>
                    <div className="text-xs">
                      Lưu lượng xả: <b className="font-mono text-danger font-bold">{r.outflow_m3s} m³/s</b> (Nước về: {r.inflow_m3s} m³/s)
                    </div>
                  </>
                )}
                {r.spill_gates_open > 0 && (
                  <div className="text-xs text-serious font-semibold">
                    Mở {r.spill_gates_open}/{r.spill_gates} cửa xả tràn
                  </div>
                )}
                <p className="text-[11px] text-ink-2 bg-panel2 p-1.5 rounded mt-1 leading-snug">{r.downstream_warning}</p>
              </div>
            </Popup>
          </Marker>
        ))}
        {layers.landslides && data?.landslides?.map((p) => {
          const isBlocked = p.traffic_status === 'cam_duong';
          return (
            <Marker
              key={p.code}
              position={[p.lat, p.lon]}
              icon={hazardIcon(p.category === 'deo_doc' ? 'giao_thong' : 'sat_lo', p.risk_level)}
              eventHandlers={{
                click: () => onSelectPoint?.({
                  id: p.code,
                  name: p.name,
                  sub: `${p.road_name} · ${p.admin_name}`,
                  statusColor: isBlocked ? 'text-danger' : p.traffic_status === 'canh_bao' ? 'text-serious' : 'text-good',
                  type: 'landslide',
                  raw: p,
                }),
              }}
            >
              <Popup>
                <div className="space-y-1">
                  <div className="font-bold text-sm text-ink">{p.name}</div>
                  <div className="text-xs text-muted">{p.road_name} · {p.admin_name}</div>
                  <div className="text-xs pt-1 border-t border-line/60">
                    Tình trạng:{' '}
                    <b className={isBlocked ? 'text-danger font-bold' : p.traffic_status === 'canh_bao' ? 'text-serious font-bold' : 'text-good font-bold'}>
                      {p.traffic_label}
                    </b>
                  </div>
                  <p className="text-xs text-ink-2 bg-panel2 p-1.5 rounded mt-1 leading-snug">{p.description}</p>
                  {p.tilt_info && (
                    <div className="text-[11px] text-amber-600 font-semibold">
                      Độ nghiêng taluy: +{p.tilt_info.current_tilt_deg}° (Ngưỡng {p.tilt_info.alarm_threshold}°)
                    </div>
                  )}
                  {p.bypass_route && (
                    <div className="text-[11px] text-danger font-medium mt-1">
                      Đường tránh: {p.bypass_route}
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
        {layers.reports && data?.reports.map((r) => (
          <Marker
            key={r.id}
            position={[r.lat, r.lon]}
            icon={pinIcon('📸', '#7c3aed')}
            eventHandlers={{
              click: () => onSelectPoint?.({
                id: r.id,
                name: r.category_label,
                sub: r.commune_name || 'Hiện trường',
                type: 'report',
                raw: r,
              }),
            }}
          >
            <Popup>
              <b>{r.category_label}</b> · <span className="text-xs text-muted">{ago(r.created_at)}</span>
              <p className="text-xs">{r.description}</p>
              {r.photos[0] && <img src={r.photos[0].thumb} alt={`Ảnh phản ánh ${r.code}`} className="mt-1 max-h-32 rounded" loading="lazy" />}
              {r.public_note && <p className="mt-1 text-xs text-good">Cán bộ: {r.public_note}</p>}
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>

      {route && (
        <Polyline
          positions={route.geometry.coordinates.map(([x, y]) => [y, x])}
          pathOptions={
            route.roads?.length
              ? { color: route.safe ? '#16a34a' : '#f97316', weight: 6, opacity: 0.85 }
              : { color: '#64748b', weight: 4, opacity: 0.8, dashArray: '8 8' } // chưa có dữ liệu đường: chỉ là hướng chim bay
          }
        />
      )}
      {me && (
        <>
          {/* Chọn xã thủ công: điểm là trung tâm xã, không phải vị trí GPS → không vẽ vòng sai số, không ghi "Bạn đang ở đây" */}
          {!me.isManual && (
            <Circle center={[me.lat, me.lon]} radius={me.accuracy || 50} pathOptions={{ color: '#2563eb', weight: 1, fillOpacity: 0.1 }} />
          )}
          <Marker position={[me.lat, me.lon]} icon={pinIcon('●', '#2563eb')}>
            <Tooltip permanent direction="top" offset={[0, -12]}>{me.isManual ? `Trung tâm ${me.name}` : 'Bạn đang ở đây'}</Tooltip>
          </Marker>
        </>
      )}
    </MapContainer>
  );
}

function AlertCard({ a, highlight }) {
  const toast = useStore((s) => s.toast);
  const share = async () => {
    const url = `${window.location.origin}/api/v1/public/alerts/${a.code}/share`;
    try {
      if (navigator.share) await navigator.share({ title: a.title, text: a.message_body, url });
      else { await navigator.clipboard.writeText(url); toast({ title: 'Đã sao chép liên kết chia sẻ' }); }
    } catch { /* người dùng huỷ */ }
  };
  return (
    <div id={`canh-bao-${a.code}`} className={clsx('card p-3.5 border-l-4 transition-all hover:shadow-md', SEV[a.severity] || SEV.vang, highlight && 'ring-2 ring-accent')}>
      <div className="flex items-start gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-panel2 text-danger">
          <Megaphone size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold leading-snug text-ink">{a.title}</div>
          <div className="text-xs text-muted mt-0.5">{dateTime(a.issued_at)} · {a.areas.slice(0, 4).join(', ')}{a.areas.length > 4 ? ` và ${a.areas.length - 4} xã khác` : ''}</div>
        </div>
        <button className="btn-ghost p-1.5 text-muted hover:text-accent rounded-lg" onClick={share} title="Chia sẻ cảnh báo" aria-label="Chia sẻ cảnh báo">
          <Share2 size={15} />
        </button>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-2 bg-panel/70 p-2.5 rounded-lg border border-line/40">{a.message_body}</p>
    </div>
  );
}

export default function PublicPortal() {
  const { theme, toggleTheme, auth } = useStore();
  const [params] = useSearchParams();
  const focusAlert = params.get('canh-bao');
  const trackParam = params.get('tra-cuu') || '';
  const [activeTab, setActiveTab] = useState(trackParam ? 'tracuu' : 'bando'); // bando | tracuu | muanuoc | sotan | hotlines | huongdan
  const [mapSidebarTab, setMapSidebarTab] = useState(focusAlert ? 'alerts' : 'legend'); // legend | alerts | rain
  const scrolledToAlert = useRef(false);
  // Cuộn tới thanh tab (ngay trên bản đồ / nội dung tab) — theo phần tử, không theo số pixel cố định: khối phía trên
  // (kết quả định vị, chú thích ký hiệu) cao thấp khác nhau
  const tabsRef = useRef(null);
  const scrollToContent = () => tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const goToMap = () => {
    setActiveTab('bando');
    scrollToContent();
  };
  // SĐT chỉ giữ trong state (không đưa lên URL)
  const [track, setTrack] = useState({ code: trackParam, phone: '' });
  const [layers, setLayers] = useState({ forecast: true, hazard: true, stations: true, reservoirs: true, landslides: true, evac: true, reports: true });
  const [basemap, setBasemap] = useState('street');
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [me, setMe] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locErr, setLocErr] = useState('');
  const [route, setRoute] = useState(null);
  const [target, setTarget] = useState(null);
  const [reporting, setReporting] = useState(false);
  const [showSosModal, setShowSosModal] = useState(false);

  useEscapeToClose(showSosModal, () => setShowSosModal(false));

  const { data: overview } = useQuery({ queryKey: ['pub-overview'], queryFn: () => pub('/overview'), refetchInterval: REFRESH });
  const { data: map } = useQuery({ queryKey: ['pub-map'], queryFn: () => pub('/map'), refetchInterval: REFRESH });
  const { data: alerts = [] } = useQuery({ queryKey: ['pub-alerts'], queryFn: () => pub('/alerts'), refetchInterval: REFRESH });
  const { data: forecast } = useQuery({ queryKey: ['pub-forecast'], queryFn: () => pub('/forecast/areas', { hours: 24 }), refetchInterval: 10 * REFRESH });
  const { data: hotlines } = useQuery({ queryKey: ['pub-hotlines'], queryFn: () => pub('/hotlines'), staleTime: Infinity });
  const { data: geo } = useUnitsGeo();
  const { data: provinceArea } = useProvinceArea();
  const { data: units = [] } = useUnits();
  const [selectedCommuneCode, setSelectedCommuneCode] = useState('');

  const sortedUnits = useMemo(() => {
    return [...units].sort((a, b) => {
      const dist = (a.old_district || '').localeCompare(b.old_district || '', 'vi');
      if (dist !== 0) return dist;
      return (a.name || '').localeCompare(b.name || '', 'vi');
    });
  }, [units]);

  const handleSelectCommune = (code) => {
    const u = units.find((x) => x.code === code);
    if (!u) return;
    setSelectedCommuneCode(code);
    setMe({ lat: u.lat, lon: u.lon, name: u.name, accuracy: 100, isManual: true });
    setTarget({ lat: u.lat, lon: u.lon, zoom: 13.5 });
    setLocErr('');
    setRoute(null);
  };

  const { data: here } = useQuery({
    queryKey: ['pub-locate', me?.lat, me?.lon],
    queryFn: () => pub('/locate', { lat: me.lat, lon: me.lon }),
    enabled: !!me,
    retry: 0,
  });

  const totalPoints = useMemo(() => {
    if (!map) return 0;
    const rain = (map.stations || []).length;
    const res = (map.reservoirs || []).length;
    const ls = (map.landslides || []).length;
    const evac = (map.evacuation_sites || []).length;
    const rep = (map.reports || []).length;
    return rain + res + ls + evac + rep;
  }, [map]);

  const handleSelectPoint = (pt) => {
    setSelectedPoint(pt);
    setMapSidebarTab('legend');
    if (pt?.lat && pt?.lon) {
      setTarget({ lat: pt.lat, lon: pt.lon, zoom: 14.5 });
    }
  };

  // Link chia sẻ ?canh-bao=MÃ: mở tab cảnh báo, rồi cuộn tới thẻ sau khi tab đã hiển thị (1 lần, không cuộn lại mỗi lần làm mới)
  useEffect(() => {
    if (focusAlert && alerts.length) {
      setActiveTab('bando');
      setMapSidebarTab('alerts');
    }
  }, [focusAlert, alerts]);
  useEffect(() => {
    if (!focusAlert || scrolledToAlert.current || activeTab !== 'bando' || mapSidebarTab !== 'alerts') return;
    const card = document.getElementById(`canh-bao-${focusAlert}`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      scrolledToAlert.current = true;
    }
  }, [focusAlert, activeTab, mapSidebarTab, alerts]);

  useEffect(() => {
    if (trackParam) {
      setTrack((x) => ({ ...x, code: trackParam }));
      setActiveTab('tracuu');
    }
  }, [trackParam]);

  const locate = () => {
    setLocErr('');
    setSelectedCommuneCode('');
    if (!navigator.geolocation) {
      return setLocErr('Trình duyệt của bạn không hỗ trợ định vị GPS tự động. Bạn có thể chọn trực tiếp Xã/Phường dưới đây:');
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy };
        setMe(pos);
        setTarget({ ...pos, zoom: 13.5 });
        setLocating(false);
        setRoute(null);
      },
      () => {
        setLocating(false);
        setLocErr('Không lấy được vị trí GPS tự động (chưa cấp quyền hoặc thiết bị không hỗ trợ GPS). Bạn có thể chọn trực tiếp Xã/Phường bên dưới để tra cứu ngay:');
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const directions = async (site) => {
    try {
      const r = await pub('/route', { from_lat: me.lat, from_lon: me.lon, to_lat: site.lat, to_lon: site.lon });
      setRoute(r);
      setTarget({ lat: (me.lat + site.lat) / 2, lon: (me.lon + site.lon) / 2, zoom: 12 });
      setActiveTab('bando');
      scrollToContent();
    } catch {
      setLocErr('Không tìm được đường đi tới điểm sơ tán này. Hãy liên hệ trực ban xã/phường hoặc gọi 112.');
    }
  };

  const active = overview?.alerts?.active || 0;
  const worstRiver = overview?.rivers?.reduce((m, r) => Math.max(m, r.level), 0) || 0;

  return (
    <div className="min-h-full bg-bg text-ink pb-20 sm:pb-8">
      <NetworkBanner />
      {/* Thanh Header chính */}
      <header className="sticky top-0 z-[1100] border-b border-line bg-panel/95 backdrop-blur-md px-3 sm:px-6 py-2.5">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-600 to-red-700 text-white shadow-md shadow-red-600/30">
              <ShieldAlert size={22} />
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm sm:text-base font-bold text-ink">
                Cổng Cảnh Báo Thiên Tai Tỉnh Cao Bằng
              </div>
              <div className="truncate text-[11px] text-muted hidden sm:block">
                Ban Chỉ huy Phòng chống thiên tai & Tìm kiếm cứu nạn tỉnh Cao Bằng
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* <a> chứ không phải <Link>: /ban-nhe là trang máy chủ dựng (nginx → backend), không phải route của ứng dụng */}
            <a
              href="/ban-nhe"
              className="btn bg-amber-500/15 hover:bg-amber-500 text-amber-800 hover:text-white dark:text-amber-300 dark:hover:text-black border border-amber-500/35 text-xs px-2 sm:px-2.5 py-1.5 font-bold flex items-center gap-1.5 transition-all shadow-xs group"
              title="Chuyển sang bản chỉ có chữ (dưới 50 KB) khi mạng 2G/3G yếu"
            >
              <Zap size={14} className="text-amber-500 group-hover:text-current animate-pulse shrink-0" />
              <span>Bản nhẹ</span>
            </a>

            <a
              href="tel:112"
              className="btn bg-danger/10 text-danger hover:bg-danger hover:text-white border border-danger/30 text-xs px-2.5 py-1.5 font-bold"
              title="Gọi cứu nạn khẩn cấp 112"
            >
              <PhoneCall size={14} />
              <span>Gọi 112</span>
            </a>

            <button
              className="btn-danger hidden sm:inline-flex text-xs px-3 py-1.5"
              onClick={() => setReporting(true)}
            >
              <Camera size={14} />
              <span>Gửi phản ánh</span>
            </button>

            <button
              className="btn-ghost p-2"
              onClick={toggleTheme}
              aria-label="Đổi giao diện sáng/tối"
            >
              {theme === 'dark' ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-indigo-500" />}
            </button>

            <Link
              to={auth?.token ? '/dashboard' : '/dang-nhap'}
              className="btn-ghost text-xs px-2.5 py-1.5"
            >
              <LogIn size={14} />
              <span className="hidden md:inline">{auth?.token ? 'Vào Điều hành' : 'Cán bộ'}</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-4 p-3 sm:p-5">
        {/* Banner Tổng quan Tình hình Hiện tại */}
        <div
          className={clsx(
            'flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl p-4 sm:p-5 shadow-sm border transition-all',
            active
              ? overview?.alerts?.has_red
                ? 'bg-gradient-to-r from-red-600 to-rose-700 text-white border-red-500'
                : 'bg-gradient-to-r from-amber-600 to-orange-600 text-white border-amber-500'
              : 'bg-panel border-line text-ink'
          )}
        >
          <div className="flex items-start gap-3">
            <div className={clsx('p-2.5 rounded-xl shrink-0', active ? 'bg-white/20 text-white' : 'bg-good/15 text-good')}>
              {active ? <AlertTriangle size={26} /> : <CheckCircle2 size={26} />}
            </div>
            <div>
              <div className="text-base sm:text-lg font-bold">
                {active
                  ? `Đang có ${active} cảnh báo thiên tai khẩn cấp trên địa bàn tỉnh!`
                  : 'Thời tiết hiện tại ổn định – Chưa có cảnh báo khẩn cấp'}
              </div>
              <div className={clsx('text-xs sm:text-sm mt-1 leading-relaxed', active ? 'text-white/90' : 'text-muted')}>
                Mưa 24h qua: TB <b className="font-mono">{overview?.rain?.avg_24h ?? '–'} mm</b> (cao nhất <b className="font-mono">{overview?.rain?.max_24h ?? '–'} mm</b>) ·
                Dự báo 24h tới cao nhất <b className="font-mono">{overview?.forecast_24h?.max_24h ?? '–'} mm</b> tại <span className="underline decoration-dotted">{overview?.forecast_24h?.max_name || '–'}</span> ·
                Sông suối: <b>{['Dưới báo động', 'Trên Báo động I', 'Trên Báo động II', 'Trên Báo động III'][worstRiver]}</b>
                {overview?.reservoirs?.spill_count > 0 && (
                  <> · Hồ chứa: <b className="underline decoration-dotted">{overview?.reservoirs?.spill_count} hồ xả tràn ({Math.round(overview?.reservoirs?.total_outflow ?? 0)} m³/s)</b></>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
            <button
              onClick={() => setShowSosModal(true)}
              className={clsx(
                'btn px-4 py-2 font-bold shadow-md text-xs sm:text-sm',
                active ? 'bg-white text-danger hover:bg-white/90' : 'bg-danger text-white hover:brightness-110'
              )}
            >
              <PhoneCall size={16} /> Cần cứu hộ khẩn cấp
            </button>
          </div>
        </div>

        {/* Dải thông báo xả lũ khẩn cấp nếu có hồ đang xả */}
        {overview?.reservoirs?.spill_count > 0 && (
          <div
            onClick={() => {
              setActiveTab('hochua');
              scrollToContent();
            }}
            className="flex items-center justify-between gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs cursor-pointer hover:bg-amber-500/15 transition-all group"
          >
            <div className="flex items-center gap-2.5 text-amber-900 dark:text-amber-200">
              <span className="p-1.5 rounded-lg bg-amber-500 text-white shrink-0 animate-pulse">
                <Waves size={15} />
              </span>
              <div>
                <b className="font-bold">Thông báo xả lũ hồ chứa:</b> Đang có{' '}
                <b className="underline">{overview.reservoirs.spill_count} hồ thủy điện</b> mở cửa xả điều tiết (tổng xả{' '}
                <b className="font-mono font-bold">{Math.round(overview.reservoirs.total_outflow)} m³/s</b>) đổ về hạ du sông Bằng Giang và sông Gâm.
                {overview.reservoirs.emergency_count > 0 && (
                  <span className="ml-1 text-danger font-bold">
                    (Có {overview.reservoirs.emergency_count} hồ xả lũ lớn!)
                  </span>
                )}
              </div>
            </div>
            <span className="text-amber-600 font-semibold shrink-0 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
              Xem chi tiết <ChevronRight size={14} />
            </span>
          </div>
        )}

        {/* Dải thông báo tắc đường / cấm đèo dốc sạt lở */}
        {overview?.landslides?.blocked_count > 0 && (
          <div
            onClick={() => {
              setActiveTab('satlo');
              scrollToContent();
            }}
            className="flex items-center justify-between gap-3 p-3 rounded-xl bg-danger/10 border border-danger/30 text-xs cursor-pointer hover:bg-danger/15 transition-all group"
          >
            <div className="flex items-center gap-2.5 text-danger">
              <span className="p-1.5 rounded-lg bg-danger text-white shrink-0 animate-pulse">
                <Mountain size={15} />
              </span>
              <div>
                <b className="font-bold">Cảnh báo giao thông đèo dốc:</b> Đang có{' '}
                <b className="underline font-bold">{overview.landslides.blocked_count} vị trí đường đèo / ngầm tràn cấm lưu thông</b> do vùng sạt lở / lũ quét đang hiệu lực.
                {overview.landslides.warning_count > 0 && (
                  <span className="ml-1 text-ink-2">
                    (Có thêm {overview.landslides.warning_count} cung đèo cảnh báo đá lăn!)
                  </span>
                )}
              </div>
            </div>
            <span className="text-danger font-bold shrink-0 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
              Xem đường tránh <ChevronRight size={14} />
            </span>
          </div>
        )}

        {/* 4 Thẻ hành động nhanh cho người dân */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Nút 1: Kiểm tra vị trí an toàn */}
          <div
            onClick={locate}
            className="card p-4 flex flex-col justify-between cursor-pointer hover:border-accent hover:shadow-md transition-all group border-l-4 border-l-accent"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent group-hover:scale-105 transition-transform">
                <LocateFixed size={20} />
              </div>
              <span className="text-[11px] font-semibold text-accent group-hover:underline">Bấm để kiểm tra →</span>
            </div>
            <div className="mt-3">
              <div className="font-bold text-sm text-ink">Tôi đang ở đâu? Có an toàn không?</div>
              <div className="text-xs text-muted mt-0.5">Kiểm tra nguy cơ ngập lụt, sạt lở theo GPS hoặc chọn theo 56 xã/phường</div>
            </div>
          </div>

          {/* Nút 2: Tra cứu tiến độ cứu hộ / phản ánh */}
          <div
            onClick={() => {
              setActiveTab('tracuu');
              scrollToContent();
            }}
            className="card p-4 flex flex-col justify-between cursor-pointer hover:border-amber-500 hover:shadow-md transition-all group border-l-4 border-l-amber-500"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 group-hover:scale-105 transition-transform">
                <Search size={20} />
              </div>
              <span className="text-[11px] font-semibold text-amber-600 group-hover:underline">Tra cứu ngay →</span>
            </div>
            <div className="mt-3">
              <div className="font-bold text-sm text-ink">Tra cứu tiến độ cứu hộ & phản ánh</div>
              <div className="text-xs text-muted mt-0.5">Nhập mã phiếu (SOS-…, PA-…) và SĐT đã dùng khi gửi</div>
            </div>
          </div>

          {/* Nút 3: Gửi phản ánh hiện trường */}
          <div
            onClick={() => setReporting(true)}
            className="card p-4 flex flex-col justify-between cursor-pointer hover:border-danger hover:shadow-md transition-all group border-l-4 border-l-danger"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger/15 text-danger group-hover:scale-105 transition-transform">
                <Camera size={20} />
              </div>
              <span className="text-[11px] font-semibold text-danger group-hover:underline">Chụp & Gửi →</span>
            </div>
            <div className="mt-3">
              <div className="font-bold text-sm text-ink">Gửi phản ánh ngập lụt / sạt lở</div>
              <div className="text-xs text-muted mt-0.5">Chụp ảnh điểm ngập, tắc đèo, đất đá sạt trượt để báo BCH tỉnh</div>
            </div>
          </div>

          {/* Nút 4: Đường dây nóng cứu nạn */}
          <div
            onClick={() => setShowSosModal(true)}
            className="card p-4 flex flex-col justify-between cursor-pointer hover:border-red-500 hover:shadow-md transition-all group border-l-4 border-l-red-500"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/15 text-red-600 group-hover:scale-105 transition-transform">
                <Phone size={20} />
              </div>
              <span className="text-[11px] font-semibold text-red-600 group-hover:underline">Xem danh bạ →</span>
            </div>
            <div className="mt-3">
              <div className="font-bold text-sm text-ink">Tổng đài cứu trợ & Đường dây nóng</div>
              <div className="text-xs text-muted mt-0.5">Số khẩn cấp 112, 114, 115 và trực ban PCTT tỉnh</div>
            </div>
          </div>
        </div>

        {/* Khối hiển thị kết quả Định vị khi người dân bấm kiểm tra */}
        {(locating || locErr || here) && (
          <section className="card p-4 bg-panel2/60 border-accent/40 shadow-sm animate-in fade-in duration-200 relative">
            <button
              type="button"
              onClick={() => { setMe(null); setLocErr(''); setRoute(null); setSelectedCommuneCode(''); }}
              className="absolute top-3 right-3 px-2.5 py-1 rounded-lg text-xs font-semibold text-muted hover:text-danger hover:bg-danger/10 border border-line bg-panel shadow-xs transition-colors z-10 flex items-center gap-1 cursor-pointer"
              title="Đóng kết quả tra cứu vị trí"
            >
              <X size={14} />
              <span>Đóng tra cứu</span>
            </button>
            {locating && (
              <div className="flex items-center gap-2 py-3 text-sm text-accent">
                <Loader2 size={18} className="animate-spin" />
                <span>Đang kết nối GPS định vị và phân tích nguy cơ thiên tai tại toạ độ của bạn…</span>
              </div>
            )}
            {locErr && (
              <div className="py-2 space-y-3">
                <div className="flex items-center gap-2 text-sm text-danger">
                  <AlertTriangle size={18} className="shrink-0" />
                  <span>{locErr}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-panel p-3 rounded-xl border border-line">
                  <label className="text-xs font-semibold text-ink whitespace-nowrap">
                    Chọn Xã/Phường tra cứu trực tiếp:
                  </label>
                  <select
                    className="select text-xs py-2 px-3 flex-1 bg-panel2 border border-line rounded-lg text-ink"
                    value={selectedCommuneCode}
                    onChange={(e) => handleSelectCommune(e.target.value)}
                  >
                    <option value="">-- Danh sách 56 Xã/Phường tỉnh Cao Bằng --</option>
                    {sortedUnits.map((u) => (
                      <option key={u.code} value={u.code}>
                        {u.name} (Huyện/TP: {u.old_district})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {here && (() => {
              const R = RISK[here.risk] || RISK.thap;
              const RIcon = R.icon;
              return (
                <div className="grid gap-4 md:grid-cols-[1.1fr_1.3fr] items-start">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={clsx('chip px-3 py-1 text-xs font-bold', R.cls)}>
                        <RIcon size={14} /> {R.label}
                      </span>
                      <b className="text-base text-ink">{here.commune.name}</b>
                      <span className="text-xs text-muted">({here.commune.district})</span>
                      {me?.isManual && (
                        <span className="chip px-2 py-0.5 text-[11px] bg-accent/10 text-accent border border-accent/30 font-medium">
                          Đã chọn thủ công
                        </span>
                      )}
                    </div>

                    {/* Hộp chuyển nhanh xã khác hoặc định vị lại */}
                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      <span className="text-[11px] text-muted whitespace-nowrap">Xem xã khác:</span>
                      <select
                        className="select text-xs py-1 px-2.5 bg-panel border border-line rounded-lg text-ink max-w-[220px]"
                        value={selectedCommuneCode}
                        onChange={(e) => handleSelectCommune(e.target.value)}
                      >
                        <option value="">-- Đổi xã/phường khác --</option>
                        {sortedUnits.map((u) => (
                          <option key={u.code} value={u.code}>
                            {u.name} ({u.old_district})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={locate}
                        title="Bấm để định vị lại bằng GPS"
                        className="text-xs text-accent hover:underline flex items-center gap-1 shrink-0 ml-auto"
                      >
                        <LocateFixed size={13} /> GPS
                      </button>
                    </div>

                    <p className="text-sm text-ink-2 bg-panel p-3 rounded-xl border border-line leading-relaxed">
                      {here.advice || R.tip}
                    </p>

                    <div className="text-xs text-muted flex items-center gap-2">
                      <CloudRain size={14} className="text-accent" />
                      <span>Mưa dự báo 24h tới: <b className="text-ink font-mono">{here.forecast_24h?.p50 ?? '–'} mm</b> (có thể lên tới {here.forecast_24h?.p90 ?? '–'} mm)</span>
                    </div>

                    {here.hazards.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <div className="text-xs font-semibold text-danger uppercase tracking-wide">Cảnh báo điểm nguy cơ gần bạn:</div>
                        {here.hazards.slice(0, 3).map((h) => (
                          <div key={h.name} className="text-xs text-ink-2 flex items-center gap-1.5 bg-danger/10 px-2 py-1 rounded-lg">
                            <AlertTriangle size={12} className="text-danger shrink-0" />
                            <span>{h.name} — <b>{h.distance_m === 0 ? 'Bạn đang ở trong vùng này' : `cách ${h.distance_m} m`}</b></span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase text-muted flex items-center gap-1.5">
                      <Home size={14} className="text-good" />
                      <span>Điểm sơ tán an toàn gần nhất còn chỗ trống</span>
                    </div>

                    <div className="space-y-2">
                      {here.evacuation_sites.map((s) => (
                        <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel p-3 shadow-sm hover:border-good transition-colors">
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-sm text-ink truncate">{s.name}</div>
                            <div className="text-xs text-muted flex items-center gap-2 mt-0.5">
                              <span>Khoảng cách: <b className="font-mono text-ink">{s.distance_km} km</b></span>
                              <span>·</span>
                              <span>Còn <b className="text-good font-mono">{s.capacity - s.current_occupancy}</b>/{s.capacity} chỗ</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {s.hotline && (
                              <a
                                href={`tel:${s.hotline.replace(/\s+/g, '')}`}
                                className="btn-ghost text-xs px-2.5 py-1.5 text-good border border-good/40 bg-good/10 hover:bg-good/20 font-semibold flex items-center gap-1"
                                title={`Gọi số trực điểm sơ tán: ${s.hotline}`}
                              >
                                <PhoneCall size={13} />
                                <span>{s.hotline}</span>
                              </a>
                            )}
                            <button
                              className="btn-ghost text-xs px-3 py-1.5 text-accent border-accent/40 bg-accent/5 hover:bg-accent/15"
                              onClick={() => directions(s)}
                            >
                              <Navigation size={13} /> Chỉ đường
                            </button>
                          </div>
                        </div>
                      ))}
                      {!here.evacuation_sites.length && (
                        <div className="text-xs text-muted p-3 text-center bg-panel rounded-xl">
                          Chưa có điểm sơ tán tập trung được ghi nhận gần vị trí này. Vui lòng liên hệ Trực ban xã/phường để được hướng dẫn.
                        </div>
                      )}
                    </div>

                    {route && (
                      <div className="mt-3 p-3 rounded-xl bg-panel border border-accent/40 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-xs">
                        <div className="flex items-center gap-2">
                          <Compass size={16} className="text-accent shrink-0" />
                          <div>
                            Lộ trình sơ tán: <b>{route.distance_km} km</b> (~{route.duration_min} phút di chuyển). Trạng thái:{' '}
                            {!route.roads?.length ? (
                              <span className="font-bold text-amber-500">
                                Chưa có dữ liệu đường tại khu vực này — nét đứt chỉ là hướng chim bay, không phải đường đi. Hãy đi theo chỉ dẫn của cán bộ địa phương.
                              </span>
                            ) : route.safe ? (
                              // Chỉ khẳng định điều hệ thống biết: không cắt vùng nguy hiểm ĐÃ GHI NHẬN (không phải "an toàn")
                              <span className="font-bold text-good">Không đi qua vùng nguy hiểm đã được ghi nhận</span>
                            ) : (
                              <span className="font-bold text-danger">
                                Tuyến đi qua vùng nguy cơ{route.hazards?.length ? `: ${route.hazards.join(', ')}` : ''} — hết sức cẩn thận, hỏi cán bộ địa phương hoặc gọi 112
                              </span>
                            )}
                            {route.roads?.length > 0 && route.offroad_km >= 0.5 && (
                              <span className="block text-amber-600">
                                Có khoảng {route.offroad_km} km chưa có dữ liệu đường (đoạn nối tới / từ đường chính) — tự quan sát khi di chuyển, không đi qua suối, ngầm tràn đang ngập.
                              </span>
                            )}
                            {/* Trạm mực nước vượt báo động / mất tín hiệu, điểm nguy hiểm, mưa rất to quanh tuyến */}
                            {route.warnings?.length > 0 && (
                              <ul className="mt-1 list-inside list-disc text-amber-700 dark:text-amber-400">
                                {route.warnings.map((w) => <li key={w}>{w}</li>)}
                              </ul>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab('bando');
                              scrollToContent();
                            }}
                            className="btn-ghost text-xs px-2.5 py-1 text-accent border border-accent/40 bg-accent/5 hover:bg-accent/15 rounded-lg flex items-center gap-1 cursor-pointer font-medium"
                          >
                            <Navigation size={13} /> Xem bản đồ
                          </button>
                          <button
                            type="button"
                            onClick={() => setRoute(null)}
                            className="btn-ghost text-xs px-2.5 py-1 text-danger border border-danger/40 bg-danger/5 hover:bg-danger/15 rounded-lg flex items-center gap-1 font-semibold cursor-pointer"
                            title="Tắt hiển thị đường đi trên bản đồ"
                          >
                            <X size={13} /> Tắt đường đi
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Thanh chân trang đóng tra cứu */}
            <div className="mt-4 pt-3 border-t border-line/60 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-muted">Đang xem phân tích vị trí{here?.commune?.name ? `: ${here.commune.name}` : ''}.</span>
              <button
                type="button"
                onClick={() => { setMe(null); setLocErr(''); setRoute(null); setSelectedCommuneCode(''); }}
                className="px-3 py-1.5 rounded-lg bg-panel hover:bg-danger/10 text-muted hover:text-danger border border-line font-medium transition-colors flex items-center gap-1.5 cursor-pointer ml-auto"
              >
                <X size={14} /> Thoát tra cứu vị trí & trở về mặc định
              </button>
            </div>
          </section>
        )}

        {/* Khối Chú thích Ký hiệu & Tra cứu Điểm Giám sát ở Đầu Trang */}
        <TopLegendBar
          data={map}
          onSelectPoint={handleSelectPoint}
          onNavigateTab={(tabId) => {
            setActiveTab(tabId);
            scrollToContent();
          }}
          onFocusMap={() => {
            setActiveTab('bando');
            scrollToContent();
          }}
        />

        {/* Thanh Điều hướng Tabs (Bản đồ / Hồ chứa / Sạt trượt / Tra cứu tiến độ / Mực nước / Điểm sơ tán / Hotline / Cẩm nang) */}
        <div ref={tabsRef} className="flex scroll-mt-20 border-b border-line gap-1.5 sm:gap-2 overflow-x-auto scroll-thin pb-2 pt-1 scroll-smooth">
          {[
            { id: 'bando', label: 'Bản đồ & Cảnh báo', icon: Compass },
            {
              id: 'hochua',
              label: 'Hồ chứa & Xả lũ',
              icon: Droplets,
              badge: overview?.reservoirs?.spill_count ? `${overview.reservoirs.spill_count} hồ xả` : null,
              badgeCls: overview?.reservoirs?.emergency_count > 0 ? 'bg-danger text-white animate-pulse' : 'bg-amber-500 text-white',
            },
            {
              id: 'satlo',
              label: 'Sạt trượt & Đường đèo',
              icon: Mountain,
              badge: overview?.landslides?.blocked_count ? `${overview.landslides.blocked_count} điểm tắc` : null,
              badgeCls: 'bg-danger text-white animate-pulse',
            },
            { id: 'tracuu', label: 'Tra cứu tiến độ (SOS / Phản ánh)', icon: Search },
            { id: 'muanuoc', label: 'Mực nước sông suối', icon: Waves },
            { id: 'sotan', label: 'Điểm sơ tán an toàn', icon: Home },
            { id: 'hotlines', label: 'Đường dây nóng', icon: Phone },
            { id: 'huongdan', label: 'Cẩm nang an toàn', icon: BookOpen },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap',
                  active
                    ? 'bg-accent text-white shadow-sm font-bold'
                    : 'text-ink-2 hover:bg-panel2 hover:text-ink'
                )}
              >
                <Icon size={15} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className={clsx('px-1.5 py-0.5 rounded-full text-[10px] font-bold shadow-sm', tab.badgeCls || 'bg-amber-500 text-white')}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* NỘI DUNG THEO TAB */}

        {/* TAB 1: BẢN ĐỒ & CẢNH BÁO */}
        {activeTab === 'bando' && (
          <div className="space-y-4">
            {/* Khung Bản đồ & Bảng tác chiến: Cân đối chiều cao, không có khoảng trắng */}
            <div className="grid gap-4 lg:grid-cols-[1fr_390px] h-[520px] sm:h-[620px] lg:h-[700px] items-stretch">
              {/* Cột Bản đồ: Chiếm trọn h-full flex flex-col */}
              <section className="card overflow-hidden flex flex-col h-full border border-line shadow-sm">
                {/* Lớp dữ liệu bản đồ & Basemap switcher */}
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-panel2/60 px-3 py-2 text-xs shrink-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold text-muted">Lớp hiển thị:</span>
                    {[
                      ['forecast', 'Mưa 24h'],
                      ['hazard', 'Vùng ngập & sạt lở'],
                      ['stations', 'Trạm mực nước'],
                      ['reservoirs', 'Hồ chứa & Xả lũ'],
                      ['landslides', 'Điểm sạt trượt & Đèo'],
                      ['evac', 'Điểm sơ tán'],
                      ['reports', 'Phản ánh dân'],
                    ].map(([k, l]) => (
                      <label key={k} className="flex cursor-pointer items-center gap-1.5 select-none hover:text-ink">
                        <input
                          type="checkbox"
                          checked={layers[k]}
                          onChange={(e) => setLayers((x) => ({ ...x, [k]: e.target.checked }))}
                          className="rounded accent-[rgb(var(--accent))]"
                        />
                        <span>{l}</span>
                      </label>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Chế độ bản đồ nền */}
                    <div className="flex items-center gap-1 bg-panel border border-line rounded-lg p-0.5 shadow-xs">
                      {[
                        ['street', 'Địa lý'],
                        ['satellite', 'Vệ tinh'],
                        ['terrain', 'Địa hình'],
                      ].map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setBasemap(key)}
                          className={clsx(
                            'px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer',
                            basemap === key
                              ? 'bg-primary text-white shadow-xs'
                              : 'text-muted hover:text-ink hover:bg-panel2'
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Khung bản đồ Leaflet: Chiếm 100% diện tích flex-1 min-h-0 */}
                <div className="flex-1 w-full min-h-0 relative">
                  {/* Thanh điều khiển lộ trình, vị trí & điểm chọn nổi trên bản đồ — left-14: bên phải nút phóng to / thu nhỏ của Leaflet */}
                  {(route || me || selectedPoint) && (
                    <div className="absolute top-3 left-14 z-[1000] flex flex-wrap items-center gap-2 bg-panel/95 backdrop-blur-md border border-line shadow-lg px-3 py-1.5 rounded-xl text-xs max-w-[calc(100%-7rem)] animate-in fade-in">
                      {route ? (
                        <>
                          <div className="flex items-center gap-1.5 font-semibold text-ink truncate">
                            <Compass size={15} className="text-accent shrink-0" />
                            <span className="truncate">Tuyến sơ tán: <b className="text-accent">{route.distance_km} km</b> (~{route.duration_min} phút)</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setRoute(null)}
                            className="px-2.5 py-1 rounded-lg bg-danger/10 text-danger hover:bg-danger/20 font-bold text-[11px] transition-colors flex items-center gap-1 cursor-pointer shrink-0 ml-auto"
                            title="Tắt đường chỉ đường trên bản đồ"
                          >
                            <X size={13} /> Hủy chỉ đường
                          </button>
                        </>
                      ) : !selectedPoint ? (
                        <>
                          <div className="flex items-center gap-1.5 font-semibold text-ink truncate">
                            <MapPin size={15} className="text-primary shrink-0" />
                            <span className="truncate">Vị trí của bạn: <b>{me.name || here?.commune?.name || 'Đã chọn'}</b></span>
                          </div>
                          <button
                            type="button"
                            onClick={() => { setMe(null); setRoute(null); setSelectedCommuneCode(''); }}
                            className="px-2 py-0.5 rounded-lg bg-panel2 text-muted hover:text-danger hover:bg-danger/10 font-medium text-[11px] transition-colors flex items-center gap-1 cursor-pointer shrink-0 ml-auto"
                            title="Bỏ ghim vị trí này"
                          >
                            <X size={12} /> Bỏ ghim vị trí
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-1.5 font-semibold text-ink truncate">
                            <span className="text-sm shrink-0">{POINT_EMOJI[selectedPoint.type] || '📍'}</span>
                            <span className="truncate">Đang xem: <b>{selectedPoint.name}</b></span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 ml-auto">
                            {selectedPoint.sourceTab && (
                              <button
                                type="button"
                                onClick={() => {
                                  const targetTab = selectedPoint.sourceTab;
                                  setSelectedPoint(null);
                                  setActiveTab(targetTab);
                                  scrollToContent();
                                }}
                                className="px-2 py-0.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 font-semibold text-[11px] transition-colors cursor-pointer flex items-center gap-1"
                                title="Quay lại danh sách chuyên đề"
                              >
                                <ArrowLeft size={12} /> {SOURCE_TAB_LABEL[selectedPoint.sourceTab] || 'Quay lại chuyên đề'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setSelectedPoint(null)}
                              className="px-2 py-0.5 rounded-lg bg-panel2 text-muted hover:text-danger hover:bg-danger/10 font-medium text-[11px] transition-colors flex items-center gap-1 cursor-pointer"
                              title="Bỏ chọn điểm này"
                            >
                              <X size={12} /> Bỏ chọn
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <PublicMap
                    data={map}
                    forecast={forecast}
                    geo={geo}
                    me={me}
                    route={route}
                    target={target}
                    layers={layers}
                    basemap={basemap}
                    onSelectPoint={handleSelectPoint}
                    provinceArea={provinceArea}
                  />
                </div>

                {/* Chú giải lượng mưa chân bản đồ */}
                <div className="flex flex-wrap items-center gap-3 border-t border-line bg-panel2/40 px-3 py-2 text-[11px] text-muted shrink-0">
                  <span className="font-semibold text-ink">Thang mưa dự báo:</span>
                  {RAIN_BINS.map((b) => (
                    <span key={b.label} className="flex items-center gap-1">
                      <span className="h-2.5 w-4 rounded-sm shadow-sm" style={{ background: b.color }} />
                      <span>{b.label}</span>
                    </span>
                  ))}
                </div>
              </section>

              {/* Cột Bên Phải: Bảng điều hành đa năng 3 trong 1 */}
              <section className="card overflow-hidden flex flex-col h-full border border-line shadow-sm">
                {/* Header Tab chuyển đổi tinh gọn */}
                <div className="flex items-center border-b border-line bg-panel2/70 p-1.5 gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setMapSidebarTab('legend')}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer',
                      mapSidebarTab === 'legend'
                        ? 'bg-panel text-accent shadow-xs'
                        : 'text-muted hover:text-ink hover:bg-panel/50'
                    )}
                  >
                    <HelpCircle size={14} />
                    <span className="truncate">Chú thích</span>
                    <span className="chip text-[10px] py-0 px-1.5 bg-accent/10 text-accent font-mono">
                      {totalPoints}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMapSidebarTab('alerts')}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer relative',
                      mapSidebarTab === 'alerts'
                        ? 'bg-panel text-danger shadow-xs'
                        : 'text-muted hover:text-ink hover:bg-panel/50'
                    )}
                  >
                    <Megaphone size={14} className={alerts.length > 0 ? 'text-danger animate-pulse' : ''} />
                    <span className="truncate">Cảnh báo</span>
                    {alerts.length > 0 ? (
                      <span className="chip text-[10px] py-0 px-1.5 bg-danger text-white font-mono font-bold animate-pulse">
                        {alerts.length}
                      </span>
                    ) : (
                      <span className="chip text-[10px] py-0 px-1.5 bg-panel text-muted font-mono">0</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setMapSidebarTab('rain')}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer',
                      mapSidebarTab === 'rain'
                        ? 'bg-panel text-sky-600 shadow-xs'
                        : 'text-muted hover:text-ink hover:bg-panel/50'
                    )}
                  >
                    <CloudRain size={14} />
                    <span className="truncate">Mưa 24h</span>
                  </button>
                </div>

                {/* Nội dung Tab Cuộn Nội Bộ Mượt Mà (overflow-y-auto scroll-thin) */}
                <div className="flex-1 overflow-y-auto scroll-thin p-3 sm:p-3.5">
                  {/* TAB 1: CHÚ THÍCH & TRA CỨU ĐIỂM (EMBEDDED) */}
                  {mapSidebarTab === 'legend' && (
                    <MapLegendBox
                      data={map}
                      selectedPoint={selectedPoint}
                      onSelectPoint={handleSelectPoint}
                      onClosePoint={() => setSelectedPoint(null)}
                      embedded={true}
                    />
                  )}

                  {/* TAB 2: CẢNH BÁO CHÍNH THỨC */}
                  {mapSidebarTab === 'alerts' && (
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center justify-between pb-2 border-b border-line/60">
                        <div className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                          <Megaphone size={14} className="text-danger" />
                          <span>Bản tin chỉ đạo điều hành</span>
                        </div>
                        <span className="chip bg-danger/10 text-danger text-[11px] font-bold">
                          {alerts.length} bản tin
                        </span>
                      </div>

                      {alerts.map((a) => (
                        <AlertCard key={a.code} a={a} highlight={a.code === focusAlert} />
                      ))}

                      {!alerts.length && (
                        <div className="py-12 px-4 text-center">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-good/15 text-good mx-auto mb-3">
                            <CheckCircle2 size={24} />
                          </div>
                          <div className="font-bold text-sm text-ink">Tình hình an toàn</div>
                          <div className="text-xs text-muted mt-1 leading-relaxed max-w-xs mx-auto">
                            Không có bản tin cảnh báo khẩn cấp nào trong 7 ngày qua trên địa bàn tỉnh Cao Bằng.
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: XÃ CÓ MƯA LỚN NHẤT 24H */}
                  {mapSidebarTab === 'rain' && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between pb-2 border-b border-line/60">
                        <div className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                          <CloudRain size={14} className="text-accent" />
                          <span>Dự báo lượng mưa 24h tới</span>
                        </div>
                        <span className="text-[11px] text-muted">Mô hình khí tượng</span>
                      </div>

                      {/* Tóm tắt nhanh */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-panel2/60 p-2.5 rounded-xl border border-line/50">
                          <div className="text-[11px] text-muted">Mưa TB toàn tỉnh:</div>
                          <div className="font-mono text-base font-bold text-accent mt-0.5">
                            {overview?.rain?.avg_24h ?? '–'} mm
                          </div>
                        </div>
                        <div className="bg-panel2/60 p-2.5 rounded-xl border border-line/50">
                          <div className="text-[11px] text-muted">Dự báo cao nhất:</div>
                          <div className="font-mono text-base font-bold text-danger mt-0.5">
                            {overview?.forecast_24h?.max_24h ?? '–'} mm
                          </div>
                          <div className="text-[10px] text-muted truncate">{overview?.forecast_24h?.max_name || ''}</div>
                        </div>
                      </div>

                      {/* Danh sách các xã mưa nhiều nhất */}
                      <div className="space-y-1.5 mt-1">
                        <div className="text-[11px] font-bold text-ink">Xã dự báo mưa nhiều nhất:</div>
                        {(forecast || []).slice(0, 10).map((f, idx) => {
                          const maxPossible = Math.max(50, overview?.forecast_24h?.max_24h || 50);
                          const pctWidth = Math.min(100, Math.round(((f.p50 || 0) / maxPossible) * 100));
                          return (
                            <div
                              key={f.code || idx}
                              className="p-2 rounded-xl bg-panel2/40 border border-line/40 hover:bg-panel2/80 transition-colors"
                            >
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="font-semibold text-ink truncate flex-1">{f.name}</span>
                                <span className="font-mono font-bold text-accent ml-2">{f.p50} mm</span>
                                <span className="text-[10px] text-muted ml-1">(tối đa {f.p90})</span>
                              </div>
                              <div className="h-1.5 w-full bg-panel rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-sky-400 to-blue-600 transition-all"
                                  style={{ width: `${Math.max(5, pctWidth)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* 2 Bảng Chuyên Đề Nổi Bật: Lũ/Hồ Chứa & Sạt Lở/Đường Đèo */}
            <section className="space-y-2.5 pt-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                  <span>2 Chuyên đề trọng tâm tỉnh Cao Bằng</span>
                </h2>
                <span className="text-[11px] text-muted font-medium hidden sm:inline">
                  Tính từ cảm biến IoT và vùng cảnh báo đang hiệu lực
                </span>
              </div>

              <div className="grid gap-3.5 md:grid-cols-2">
                {/* Bảng Chuyên Đề 1: Lũ lụt & Xả lũ Hồ chứa */}
                <div
                  onClick={() => {
                    setActiveTab('hochua');
                    scrollToContent();
                  }}
                  className="card p-4 sm:p-5 border-l-4 border-l-sky-500 bg-gradient-to-br from-sky-500/10 via-panel to-panel hover:shadow-lg hover:border-sky-600 transition-all cursor-pointer group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/30 group-hover:scale-105 transition-transform">
                        <Waves size={24} />
                      </div>
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                          Chuyên đề 1
                        </span>
                        <h3 className="text-base font-bold text-ink group-hover:text-accent transition-colors">
                          Hồ Chứa Thủy Điện & Cảnh Báo Xả Lũ
                        </h3>
                      </div>
                    </div>
                    <span className="chip bg-sky-500/15 text-sky-600 text-xs font-bold shrink-0">
                      {overview?.reservoirs?.spill_count ?? '–'} hồ đang xả
                    </span>
                  </div>

                  <p className="mt-2.5 text-xs text-ink-2 leading-relaxed">
                    Theo dõi mực nước, lưu lượng về hồ và tổng xả về hạ du sông Bằng Giang và sông Gâm (Thủy điện Hòa Thuận, Bảo Lạc B, Bảo Lâm 1, Bạch Đằng...).
                  </p>

                  <div className="mt-3.5 grid grid-cols-2 gap-2 text-xs border-t border-line/60 pt-3">
                    <div className="bg-panel2/60 p-2 rounded-lg border border-line/40">
                      <span className="text-[11px] text-muted">Tổng lưu lượng xả:</span>
                      <div className="font-mono text-sm font-bold text-sky-600 mt-0.5">
                        {overview ? Math.round(overview.reservoirs?.total_outflow ?? 0).toLocaleString('vi-VN') : '–'} m³/s
                      </div>
                    </div>
                    <div className="bg-panel2/60 p-2 rounded-lg border border-line/40">
                      <span className="text-[11px] text-muted">Xả lũ lớn:</span>
                      <div className="font-mono text-sm font-bold text-danger mt-0.5">
                        {overview?.reservoirs?.emergency_count ?? '–'} hồ xả lũ lớn
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-sky-600 font-semibold group-hover:underline">
                    <span>Xem chi tiết từng cửa xả & hạ du</span>
                    <span className="group-hover:translate-x-1 transition-transform">Xem bảng chuyên đề →</span>
                  </div>
                </div>

                {/* Bảng Chuyên Đề 2: Sạt trượt & Đường đèo */}
                <div
                  onClick={() => {
                    setActiveTab('satlo');
                    scrollToContent();
                  }}
                  className="card p-4 sm:p-5 border-l-4 border-l-danger bg-gradient-to-br from-danger/10 via-panel to-panel hover:shadow-lg hover:border-red-600 transition-all cursor-pointer group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-red-600 to-rose-700 text-white shadow-md shadow-red-600/30 group-hover:scale-105 transition-transform">
                        <Mountain size={24} />
                      </div>
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-danger">
                          Chuyên đề 2
                        </span>
                        <h3 className="text-base font-bold text-ink group-hover:text-danger transition-colors">
                          Điểm Đen Sạt Trượt & Đường Đèo
                        </h3>
                      </div>
                    </div>
                    <span className="chip bg-danger/15 text-danger text-xs font-bold shrink-0 animate-pulse">
                      {overview?.landslides?.blocked_count ?? '–'} điểm chia cắt
                    </span>
                  </div>

                  <p className="mt-2.5 text-xs text-ink-2 leading-relaxed">
                    Theo dõi các điểm đen trên QL34, QL3, QL4A (Khau Cốc Chà, Mẻ Pia, Mã Phục, Ca Thành…) cùng cảm biến nghiêng taluy và độ ẩm đất.
                  </p>

                  <div className="mt-3.5 grid grid-cols-2 gap-2 text-xs border-t border-line/60 pt-3">
                    <div className="bg-panel2/60 p-2 rounded-lg border border-line/40">
                      <span className="text-[11px] text-muted">Cấm xe / Tắc nghẽn:</span>
                      <div className="font-mono text-sm font-bold text-danger mt-0.5">
                        {overview?.landslides?.blocked_count ?? '–'} vị trí chia cắt
                      </div>
                    </div>
                    <div className="bg-panel2/60 p-2 rounded-lg border border-line/40">
                      <span className="text-[11px] text-muted">Cảm biến nghiêng lớn nhất:</span>
                      <div className="font-mono text-sm font-bold text-amber-600 mt-0.5 truncate">
                        {maxTiltText(map?.landslides)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-danger font-semibold group-hover:underline">
                    <span>Xem vị trí điểm đen & lộ trình vòng tránh</span>
                    <span className="group-hover:translate-x-1 transition-transform">Xem bảng chuyên đề →</span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* TAB GIÁM SÁT HỒ CHỨA & CẢNH BÁO XẢ LŨ */}
        {activeTab === 'hochua' && (
          <ReservoirMonitor
            onBackToMap={goToMap}
            onSelectOnMap={(res) => {
              setSelectedPoint({
                id: res.id,
                name: res.name,
                sub: `${res.river ? `Sông ${res.river} · ` : ''}${res.admin_name}`,
                value: res.status_code === 'chua_co_so_lieu' ? 'Chưa có số liệu vận hành' : res.spill_gates_open > 0 ? `Mở ${res.spill_gates_open} cửa xả` : 'Đóng cửa xả',
                status: res.status_label,
                statusColor: res.status_code === 'xa_khan_cap' ? 'text-danger' : res.status_code === 'xa_dieu_tiet' ? 'text-amber-500' : res.status_code === 'chua_co_so_lieu' ? 'text-muted' : 'text-good',
                lat: res.lat,
                lon: res.lon,
                type: 'reservoir',
                raw: res,
                sourceTab: 'hochua',
              });
              setMapSidebarTab('legend');
              setTarget({ lat: res.lat, lon: res.lon, zoom: 13.5 });
              setActiveTab('bando');
              scrollToContent();
            }}
          />
        )}

        {/* TAB GIÁM SÁT ĐIỂM ĐEN SẠT TRƯỢT & ĐƯỜNG ĐÈO */}
        {activeTab === 'satlo' && (
          <LandslideMonitor
            onBackToMap={goToMap}
            onSelectOnMap={(pt) => {
              setSelectedPoint({
                id: pt.id,
                name: pt.name,
                sub: `${pt.road_name} · ${pt.admin_name}`,
                value: pt.traffic_label,
                status: pt.traffic_label,
                statusColor: pt.traffic_status === 'cam_duong' ? 'text-danger' : pt.traffic_status === 'canh_bao' ? 'text-amber-500' : 'text-good',
                lat: pt.lat,
                lon: pt.lon,
                type: 'landslide',
                raw: pt,
                sourceTab: 'satlo',
              });
              setMapSidebarTab('legend');
              setTarget({ lat: pt.lat, lon: pt.lon, zoom: 14 });
              setActiveTab('bando');
              scrollToContent();
            }}
          />
        )}

        {/* TAB TRA CỨU TIẾN ĐỘ CỨU HỘ & PHẢN ÁNH */}
        {activeTab === 'tracuu' && (
          <TicketTracker
            initialCode={track.code}
            initialPhone={track.phone}
            onQueryChange={setTrack}
            onBackToMap={goToMap}
          />
        )}

        {/* TAB 2: MỰC NƯỚC SÔNG SUỐI */}
        {activeTab === 'muanuoc' && (
          <section className="card p-4 sm:p-6">
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
                  <Waves size={20} className="text-accent" /> Mực nước các lưu vực sông tại Cao Bằng
                </h2>
                <p className="text-xs text-muted mt-0.5">Số liệu trạm thủy văn tự động cập nhật liên tục</p>
              </div>
              <BackButton onClick={goToMap} className="self-start sm:self-auto" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(overview?.rivers || []).map((r) => {
                // level null = chưa có số liệu / mất tín hiệu (máy chủ tính) → xám, không "Dưới báo động"
                const badgeCls = r.level == null ? 'bg-panel2 text-muted' : ['bg-good text-white', 'bg-warn text-black', 'bg-serious text-white', 'bg-danger text-white'][r.level];
                return (
                  <div key={r.name} className="card p-4 border border-line hover:shadow-md transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-sm text-ink">Sông {r.river}</span>
                      <span className={clsx('chip text-xs font-bold', badgeCls)}>{r.level_label}</span>
                    </div>
                    <div className="flex items-baseline gap-1 my-1">
                      <span className={clsx('font-mono text-2xl font-bold', r.stale ? 'text-muted' : 'text-ink')}>{r.value ?? '–'}</span>
                      {r.value != null && <span className="text-xs text-muted">mét</span>}
                    </div>
                    <div className="text-xs text-muted mt-2 border-t border-line/60 pt-2 flex justify-between gap-2">
                      <span>Trạm quan trắc: {r.name}</span>
                      <span className={r.stale ? 'text-serious' : 'text-ink-2'}>{r.time ? `Số đo lúc ${dateTime(r.time)}` : 'Chưa có số đo'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* TAB 3: ĐIỂM SƠ TÁN AN TOÀN */}
        {activeTab === 'sotan' && (
          <section className="card p-4 sm:p-6">
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
                  <Home size={20} className="text-good" /> Danh sách điểm sơ tán tránh trú bão lũ
                </h2>
                <p className="text-xs text-muted mt-0.5">Các địa điểm kiên cố (nhà văn hóa, trường học, trạm y tế) được chuẩn bị sẵn lương thực, nước sạch</p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <BackButton onClick={goToMap} />
                <button onClick={locate} className="btn-primary text-xs">
                  <LocateFixed size={14} /> Tìm điểm gần tôi
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(map?.evacuation_sites || []).map((site) => {
                const free = Math.max(0, site.capacity - site.current_occupancy);
                const pct = Math.round((site.current_occupancy / site.capacity) * 100);
                return (
                  <div key={site.id} className="card p-4 flex flex-col justify-between border hover:shadow-md transition-all">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <b className="text-sm text-ink leading-snug">{site.name}</b>
                        <span className={clsx('chip text-[11px] shrink-0', free > 0 ? 'bg-good/15 text-good' : 'bg-danger/15 text-danger')}>
                          {free > 0 ? `Còn ${free} chỗ` : 'Hết chỗ'}
                        </span>
                      </div>
                      <div className="text-xs text-muted mt-1 flex items-center gap-1">
                        <MapPin size={12} /> {site.admin_name}
                      </div>
                      <div className="mt-3">
                        <div className="flex justify-between text-xs text-muted mb-1">
                          <span>Sức chứa:</span>
                          <span className="font-mono">{site.current_occupancy} / {site.capacity} ({pct}%)</span>
                        </div>
                        <div className="h-1.5 w-full bg-panel2 rounded-full overflow-hidden">
                          <div className={clsx('h-full rounded-full', pct > 90 ? 'bg-danger' : pct > 70 ? 'bg-warn' : 'bg-good')} style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-2 border-t border-line/60 flex items-center justify-between gap-2">
                      {site.hotline && (
                        <a
                          href={`tel:${site.hotline.replace(/\s+/g, '')}`}
                          className="btn-ghost text-xs flex-1 justify-center text-good border border-good/40 bg-good/10 hover:bg-good/20 font-semibold py-1.5 flex items-center gap-1.5"
                          title="Gọi số trực điểm sơ tán"
                        >
                          <PhoneCall size={13} />
                          <span>Gọi {site.hotline}</span>
                        </a>
                      )}
                      <button
                        className="btn-ghost text-xs flex-1 justify-center text-accent py-1.5 flex items-center gap-1.5"
                        onClick={() => {
                          setSelectedPoint({
                            id: site.id,
                            name: site.name,
                            sub: site.admin_name,
                            value: `Còn ${Math.max(0, site.capacity - site.current_occupancy)}/${site.capacity} chỗ`,
                            status: site.current_occupancy >= site.capacity ? 'Hết chỗ' : 'Còn chỗ',
                            statusColor: site.current_occupancy >= site.capacity ? 'text-danger' : 'text-good',
                            lat: site.lat,
                            lon: site.lon,
                            type: 'evac',
                            raw: site,
                            sourceTab: 'sotan',
                          });
                          setMapSidebarTab('legend');
                          setTarget({ lat: site.lat, lon: site.lon, zoom: 14 });
                          setActiveTab('bando');
                          scrollToContent();
                        }}
                      >
                        <Navigation size={13} /> Xem bản đồ
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* TAB 4: ĐƯỜNG DÂY NÓNG */}
        {activeTab === 'hotlines' && (
          <section className="card p-4 sm:p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
                  <Phone size={20} className="text-danger" /> Đường dây nóng ứng phó thiên tai tỉnh Cao Bằng
                </h2>
                <p className="text-xs text-muted mt-0.5">Trực ban tác chiến 24/24. Khi gặp tình huống khẩn cấp nguy hiểm đến tính mạng, vui lòng gọi ngay!</p>
              </div>
              <BackButton onClick={goToMap} className="self-start sm:self-auto" />
            </div>

            {/* Số khẩn cấp quốc gia */}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-muted mb-3">Tổng đài cứu hộ cứu nạn khẩn cấp</div>
              <div className="grid gap-3 sm:grid-cols-3">
                {(hotlines?.national || [
                  { number: '112', name: 'Yêu cầu cứu nạn & cứu hộ khẩn cấp' },
                  { number: '114', name: 'Cứu hỏa & Cứu nạn sự cố' },
                  { number: '115', name: 'Cấp cứu y tế' },
                ]).map((h) => (
                  <a
                    key={h.number}
                    href={`tel:${h.number}`}
                    className="card p-4 flex items-center gap-4 hover:border-danger hover:shadow-md transition-all group"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/10 text-danger group-hover:bg-danger group-hover:text-white transition-colors">
                      <PhoneCall size={22} />
                    </div>
                    <div>
                      <div className="font-mono text-2xl font-black text-danger tracking-wide">{h.number}</div>
                      <div className="text-xs text-muted leading-tight mt-0.5">{h.name}</div>
                    </div>
                  </a>
                ))}
              </div>
            </div>

            {/* Đường dây trực ban BCH tỉnh */}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-muted mb-3">Đường dây trực ban PCTT & TKCN tỉnh</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(hotlines?.province || []).map((p) => (
                  <a
                    key={p.phone}
                    href={`tel:${p.phone.replace(/\s/g, '')}`}
                    className="flex items-center justify-between p-3 rounded-xl border border-line bg-panel hover:border-accent hover:bg-panel2 transition-colors"
                  >
                    <span className="text-sm font-medium text-ink">{p.org}</span>
                    <b className="font-mono text-xs text-accent">{p.phone}</b>
                  </a>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* TAB 5: CẨM NANG AN TOÀN */}
        {activeTab === 'huongdan' && (
          <section className="card p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
                  <BookOpen size={20} className="text-accent" /> Hướng dẫn kỹ năng an toàn khi xảy ra thiên tai
                </h2>
                <p className="text-xs text-muted mt-0.5">Những điều cần nhớ để bảo vệ an toàn cho bản thân và gia đình</p>
              </div>
              <BackButton onClick={goToMap} className="self-start sm:self-auto" />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="card p-4 border-l-4 border-l-danger">
                <h3 className="font-bold text-sm text-danger mb-2">1. Khi có nguy cơ sạt lở đất / lũ quét</h3>
                <ul className="text-xs space-y-1.5 text-ink-2 list-disc list-inside">
                  <li>Quan sát các dấu hiệu: vết nứt trên đồi, cây nghiêng, nước suối đổi màu đục ngầu, có tiếng ầm ầm từ trên núi.</li>
                  <li>Di chuyển ngay lập tức lên các vị trí cao hơn, tránh xa chân núi taluy dương và khe suối hẹp.</li>
                  <li>Không cố gắng vượt qua suối tràn hoặc ngầm tràn khi nước đang chảy xiết.</li>
                </ul>
              </div>

              <div className="card p-4 border-l-4 border-l-accent">
                <h3 className="font-bold text-sm text-accent mb-2">2. Khi nước lũ ngập sâu</h3>
                <ul className="text-xs space-y-1.5 text-ink-2 list-disc list-inside">
                  <li>Ngắt toàn bộ cầu dao điện và đóng khóa gas trong nhà để phòng ngừa chập cháy, giật điện.</li>
                  <li>Kê cao tài sản quý giá, lương thực, thực phẩm lên tầng 2 hoặc gác xép.</li>
                  <li>Mặc áo phao hoặc chuẩn bị các vật nổi (can nhựa, săm xe) cho trẻ nhỏ và người già.</li>
                  <li>Không bơi lội hoặc chèo thuyền ra vùng nước xiết bắt cá hay vớt củi.</li>
                </ul>
              </div>

              <div className="card p-4 border-l-4 border-l-good">
                <h3 className="font-bold text-sm text-good mb-2">3. Chuẩn bị túi khẩn cấp gia đình</h3>
                <ul className="text-xs space-y-1.5 text-ink-2 list-disc list-inside">
                  <li>Giấy tờ tùy thân (CCCD, sổ hộ khẩu, sổ đỏ) bọc trong túi nilon kín chống nước.</li>
                  <li>Đèn pin, pin dự phòng, radio FM nhỏ để nghe bản tin chỉ đạo của tỉnh.</li>
                  <li>Nước uống đóng chai, bánh gạo, lương khô dự trữ đủ dùng trong 3 - 5 ngày.</li>
                  <li>Thuốc men thiết yếu: bông băng, sát trùng, thuốc hạ sốt, thuốc tiêu hóa.</li>
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* Phần phản ánh hiện trường đã được xác minh */}
        <section className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="card-title text-sm">
              <Camera size={15} className="text-accent" /> Phản ánh hiện trường đã được xác minh
            </h3>
            <button className="btn-ghost text-xs px-2.5 py-1 text-danger" onClick={() => setReporting(true)}>
              + Gửi phản ánh của bạn
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {(map?.reports || []).slice(0, 8).map((r) => (
              <div
                key={r.id}
                onClick={() => {
                  setSelectedPoint({
                    id: r.id,
                    name: r.category_label,
                    sub: r.address || '',
                    value: r.description,
                    status: r.status === 'da_xu_ly' ? 'Đã xử lý' : 'Đã xác minh',
                    statusColor: 'text-good',
                    lat: r.lat,
                    lon: r.lon,
                    type: 'report',
                    raw: r,
                  });
                  setMapSidebarTab('legend');
                  setTarget({ lat: r.lat, lon: r.lon, zoom: 14 });
                  setActiveTab('bando');
                  scrollToContent();
                }}
                className="card p-2.5 cursor-pointer hover:border-accent hover:shadow transition-all flex flex-col justify-between"
              >
                {r.photos[0] ? (
                  <img src={r.photos[0].thumb} alt="" className="h-32 w-full rounded-lg object-cover mb-2" loading="lazy" />
                ) : (
                  <div className="h-32 w-full rounded-lg bg-panel2 flex items-center justify-center text-muted mb-2">
                    <Camera size={24} />
                  </div>
                )}
                <div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-accent">{r.category_label}</span>
                    <span className="text-[11px] text-muted">{ago(r.created_at)}</span>
                  </div>
                  <p className="text-xs line-clamp-2 mt-1 text-ink-2">{r.description}</p>
                  {r.public_note && (
                    <div className="text-[11px] text-good mt-1 font-medium bg-good/10 px-2 py-0.5 rounded">
                      Cán bộ: {r.public_note}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {!map?.reports?.length && (
              <div className="col-span-full p-4 rounded-2xl bg-good/5 border border-good/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-good/15 text-good">
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-ink">Địa bàn tỉnh ổn định – Chưa có phản ánh sự cố khẩn cấp</div>
                    <div className="text-[11px] text-muted mt-0.5">Không ghi nhận ách tắc, sạt lở hoặc ngập úng trong 72 giờ qua. Nếu phát hiện sự cố trên đường, bà con vui lòng chụp ảnh gửi để BCH tỉnh hỗ trợ xử lý kịp thời.</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setReporting(true)}
                  className="btn bg-danger/10 text-danger hover:bg-danger hover:text-white border border-danger/30 text-xs px-3 py-1.5 font-bold shrink-0 transition-colors"
                >
                  <Camera size={13} /> Gửi phản ánh hiện trường
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-4 border-t border-line/60 pt-6 pb-4 text-center text-xs text-muted leading-relaxed">
          <div className="font-semibold text-ink">Ban Chỉ huy Phòng chống thiên tai & Tìm kiếm cứu nạn tỉnh Cao Bằng</div>
          <div>Cập nhật dữ liệu thời gian thực · Trực ban tác chiến: <a href="tel:112" className="text-danger font-bold hover:underline">112</a></div>
          <div>Mạng yếu? Dùng <a href="/ban-nhe" className="text-accent font-semibold hover:underline">bản nhẹ</a> (chỉ chữ, dưới 50 KB)</div>
          <div className="text-[11px] mt-1 text-muted/80">Số liệu quan trắc phục vụ chỉ đạo điều hành và thông tin cảnh báo an toàn cho nhân dân</div>
        </footer>
      </main>

      {/* Modal Cứu nạn khẩn cấp */}
      {showSosModal && (
        <div
          className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150 cursor-pointer"
          onMouseDown={() => setShowSosModal(false)}
        >
          <div
            className="card w-full max-w-md p-5 shadow-2xl border-danger/40 cursor-default relative"
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sos-modal-title"
          >
            <button
              type="button"
              onClick={() => setShowSosModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-muted hover:text-ink hover:bg-panel2 transition-colors cursor-pointer"
              title="Đóng hộp thoại"
            >
              <X size={18} />
            </button>
            <div className="flex items-center gap-3 text-danger pb-3 border-b border-line pr-8">
              <ShieldAlert size={28} />
              <div>
                <h3 id="sos-modal-title" className="text-base font-bold text-ink">Yêu Cầu Cứu Nạn Khẩn Cấp</h3>
                <p className="text-xs text-muted">Bạn đang trong tình huống nguy hiểm cần hỗ trợ ngay?</p>
              </div>
            </div>

            <div className="py-4 space-y-3">
              <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-xs text-danger leading-relaxed">
                Khi bị cô lập, mắc kẹt do ngập lụt, sạt lở hoặc nguy hiểm đến tính mạng, vui lòng <b>bấm gọi ngay 112</b> để kết nối tới lực lượng cứu nạn tỉnh Cao Bằng.
              </div>

              <div className="grid gap-2">
                <a
                  href="tel:112"
                  className="btn bg-danger text-white py-3 text-center text-base font-bold justify-center shadow-lg shadow-danger/30 hover:brightness-110"
                >
                  <PhoneCall size={18} /> GỌI 112 (CỨU HỘ KHẨN CẤP)
                </a>
                <a
                  href="tel:114"
                  className="btn-ghost py-2.5 justify-center text-sm font-semibold"
                >
                  <Phone size={16} /> Gọi 114 (Cứu nạn - PCCC)
                </a>
                <a
                  href="tel:115"
                  className="btn-ghost py-2.5 justify-center text-sm font-semibold"
                >
                  <Phone size={16} /> Gọi 115 (Cấp cứu Y tế)
                </a>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-line pt-3">
              <button className="btn-ghost text-xs cursor-pointer" onClick={() => setShowSosModal(false)}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Thanh Bar Nổi Mobile Cố định ở đáy màn hình */}
      <div className="fixed bottom-0 inset-x-0 z-[1050] bg-panel/95 backdrop-blur-md border-t border-line p-2 sm:hidden flex items-center gap-2 shadow-2xl">
        <a
          href="tel:112"
          className="btn bg-danger text-white text-xs font-bold flex-1 py-2 justify-center shadow-sm"
        >
          <PhoneCall size={14} /> Cứu nạn 112
        </a>
        <button
          onClick={locate}
          className="btn-primary text-xs flex-1 py-2 justify-center"
        >
          <LocateFixed size={14} /> Vị trí của tôi
        </button>
        <button
          onClick={() => setReporting(true)}
          className="btn-ghost p-2"
          title="Gửi phản ánh"
          aria-label="Gửi phản ánh"
        >
          <Camera size={16} />
        </button>
      </div>

      {/* Form Gửi phản ánh hiện trường */}
      {reporting && (
        <ReportForm
          onClose={() => setReporting(false)}
          myLocation={me}
          onTrack={(code, phone) => {
            setTrack({ code, phone: phone || '' });
            setActiveTab('tracuu');
            scrollToContent();
          }}
        />
      )}
    </div>
  );
}
