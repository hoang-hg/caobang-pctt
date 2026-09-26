import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Circle, CircleMarker, GeoJSON, MapContainer, Marker, Polyline, Popup, Tooltip, useMap } from 'react-leaflet';
import clsx from 'clsx';
import {
  ShieldAlert, LocateFixed, Megaphone, Phone, Home, CloudRain, Waves, Camera, LogIn, Moon, Sun, Navigation, AlertTriangle,
  CheckCircle2, Loader2, Share2, Info, BookOpen, ExternalLink, HelpCircle, MapPin, ChevronRight, PhoneCall, Compass
} from 'lucide-react';
import { api } from '../../api/client';
import { useUnitsGeo } from '../../api/hooks';
import { useStore } from '../../app/store';
import { BaseLayer, RAIN_BINS } from '../../components/map/MapTools';
import { evacIcon, hazardIcon, pinIcon, stationIcon } from '../../components/map/icons';
import { alarmLevel, LEVEL } from '../../utils/labels';
import { ago, dateTime } from '../../utils/format';
import ReportForm from './ReportForm';

const REFRESH = 60_000;
const pub = (path, params) => api(`/public${path}`, { params });
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

function PublicMap({ data, forecast, geo, me, route, target, layers }) {
  const byCode = useMemo(() => Object.fromEntries((forecast || []).map((a) => [a.code, a])), [forecast]);
  return (
    <MapContainer center={[22.75, 106.05]} zoom={8.5} zoomSnap={0.25} className="h-full w-full" scrollWheelZoom>
      <BaseLayer basemap="auto" />
      <FlyTo target={target} />
      {layers.forecast && geo && forecast?.length > 0 && (
        <GeoJSON
          key={`fc-${forecast.length}-${forecast[0]?.p50}`}
          data={{ ...geo, features: geo.features.filter((f) => byCode[f.properties.code]) }}
          style={(f) => ({ color: '#fff', weight: 0.8, fillColor: rainColor(byCode[f.properties.code].p50), fillOpacity: 0.55 })}
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
      {layers.hazard && data?.hazard_points.map((p, i) => (
        <Marker key={`h${i}`} position={[p.lat, p.lon]} icon={hazardIcon(p.type, p.level)}>
          <Popup><b>{p.name}</b><p className="text-xs">{p.description}</p></Popup>
        </Marker>
      ))}
      {layers.stations && data?.stations.filter((s) => s.type !== 'do_am_dat').map((s) => {
        const lv = alarmLevel(s.value ?? 0, s.thresholds);
        return (
          <Marker key={s.id} position={[s.lat, s.lon]} icon={stationIcon(s.type, lv, s.value == null ? undefined : s.type === 'luong_mua' ? Math.round(s.value) : s.value.toFixed(1))}>
            <Popup><b>{s.name}</b><div className="text-sm">{s.value ?? '–'} {s.unit}</div></Popup>
          </Marker>
        );
      })}
      {layers.evac && data?.evacuation_sites.map((e) => (
        <Marker key={e.id} position={[e.lat, e.lon]} icon={evacIcon(e.current_occupancy / e.capacity)}>
          <Popup><b>{e.name}</b><div className="text-sm">Còn trống: <b>{Math.max(0, e.capacity - e.current_occupancy)}</b>/{e.capacity} chỗ</div><div className="text-xs text-muted">{e.admin_name}</div></Popup>
        </Marker>
      ))}
      {layers.reports && data?.reports.map((r) => (
        <CircleMarker key={r.id} center={[r.lat, r.lon]} radius={8} pathOptions={{ color: '#fff', weight: 2, fillColor: '#7c3aed', fillOpacity: 0.9 }}>
          <Popup>
            <b>{r.category_label}</b> · <span className="text-xs text-muted">{ago(r.created_at)}</span>
            <p className="text-xs">{r.description}</p>
            {r.photos[0] && <img src={r.photos[0].thumb} alt={`Ảnh phản ánh ${r.code}`} className="mt-1 max-h-32 rounded" loading="lazy" />}
            {r.public_note && <p className="mt-1 text-xs text-good">Cán bộ: {r.public_note}</p>}
          </Popup>
        </CircleMarker>
      ))}
      {route && <Polyline positions={route.geometry.coordinates.map(([x, y]) => [y, x])} pathOptions={{ color: route.safe ? '#16a34a' : '#f97316', weight: 6, opacity: 0.85 }} />}
      {me && (
        <>
          <Circle center={[me.lat, me.lon]} radius={me.accuracy || 50} pathOptions={{ color: '#2563eb', weight: 1, fillOpacity: 0.1 }} />
          <Marker position={[me.lat, me.lon]} icon={pinIcon('●', '#2563eb')}><Tooltip permanent direction="top" offset={[0, -12]}>Bạn đang ở đây</Tooltip></Marker>
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
  const [activeTab, setActiveTab] = useState('bando'); // bando | muanuoc | sotan | hotlines | huongdan
  const [layers, setLayers] = useState({ forecast: true, hazard: true, stations: true, evac: true, reports: true });
  const [me, setMe] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locErr, setLocErr] = useState('');
  const [route, setRoute] = useState(null);
  const [target, setTarget] = useState(null);
  const [reporting, setReporting] = useState(false);
  const [showSosModal, setShowSosModal] = useState(false);

  const { data: overview } = useQuery({ queryKey: ['pub-overview'], queryFn: () => pub('/overview'), refetchInterval: REFRESH });
  const { data: map } = useQuery({ queryKey: ['pub-map'], queryFn: () => pub('/map'), refetchInterval: REFRESH });
  const { data: alerts = [] } = useQuery({ queryKey: ['pub-alerts'], queryFn: () => pub('/alerts'), refetchInterval: REFRESH });
  const { data: forecast } = useQuery({ queryKey: ['pub-forecast'], queryFn: () => pub('/forecast/areas', { hours: 24 }), refetchInterval: 10 * REFRESH });
  const { data: hotlines } = useQuery({ queryKey: ['pub-hotlines'], queryFn: () => pub('/hotlines'), staleTime: Infinity });
  const { data: geo } = useUnitsGeo();
  const { data: here } = useQuery({
    queryKey: ['pub-locate', me?.lat, me?.lon],
    queryFn: () => pub('/locate', { lat: me.lat, lon: me.lon }),
    enabled: !!me,
    retry: 0,
  });

  useEffect(() => {
    if (focusAlert && alerts.length) {
      setActiveTab('bando');
      document.getElementById(`canh-bao-${focusAlert}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focusAlert, alerts]);

  const locate = () => {
    setLocErr('');
    if (!navigator.geolocation) return setLocErr('Trình duyệt của bạn không hỗ trợ định vị GPS');
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
        setLocErr('Không lấy được vị trí. Hãy cho phép quyền truy cập vị trí trên trình duyệt của bạn.');
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
      window.scrollTo({ top: 350, behavior: 'smooth' });
    } catch {
      setLocErr('Không tìm được đường đi tới điểm sơ tán này. Hãy liên hệ trực ban xã/phường hoặc gọi 112.');
    }
  };

  const active = overview?.alerts?.active || 0;
  const worstRiver = overview?.rivers?.reduce((m, r) => Math.max(m, r.level), 0) || 0;

  return (
    <div className="min-h-full bg-bg text-ink pb-20 sm:pb-8">
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

        {/* 3 Thẻ hành động nhanh cho người dân */}
        <div className="grid gap-3 sm:grid-cols-3">
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
              <div className="text-xs text-muted mt-0.5">Kiểm tra nguy cơ ngập lụt, sạt lở và tìm nơi tránh trú an toàn gần nhất</div>
            </div>
          </div>

          {/* Nút 2: Gửi phản ánh hiện trường */}
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

          {/* Nút 3: Đường dây nóng cứu nạn */}
          <div
            onClick={() => setShowSosModal(true)}
            className="card p-4 flex flex-col justify-between cursor-pointer hover:border-amber-500 hover:shadow-md transition-all group border-l-4 border-l-amber-500"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 group-hover:scale-105 transition-transform">
                <Phone size={20} />
              </div>
              <span className="text-[11px] font-semibold text-amber-600 group-hover:underline">Xem danh bạ →</span>
            </div>
            <div className="mt-3">
              <div className="font-bold text-sm text-ink">Tổng đài cứu trợ & Đường dây nóng</div>
              <div className="text-xs text-muted mt-0.5">Số khẩn cấp 112, 114, 115 và trực ban PCTT tỉnh</div>
            </div>
          </div>
        </div>

        {/* Khối hiển thị kết quả Định vị khi người dân bấm kiểm tra */}
        {(locating || locErr || here) && (
          <section className="card p-4 bg-panel2/60 border-accent/40 shadow-sm animate-in fade-in duration-200">
            {locating && (
              <div className="flex items-center gap-2 py-3 text-sm text-accent">
                <Loader2 size={18} className="animate-spin" />
                <span>Đang kết nối GPS định vị và phân tích nguy cơ thiên tai tại toạ độ của bạn…</span>
              </div>
            )}
            {locErr && (
              <div className="flex items-center gap-2 text-sm text-danger py-2">
                <AlertTriangle size={18} />
                <span>{locErr}</span>
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
                          <button
                            className="btn-ghost text-xs px-3 py-1.5 text-accent border-accent/40 bg-accent/5 hover:bg-accent/15"
                            onClick={() => directions(s)}
                          >
                            <Navigation size={13} /> Chỉ đường
                          </button>
                        </div>
                      ))}
                      {!here.evacuation_sites.length && (
                        <div className="text-xs text-muted p-3 text-center bg-panel rounded-xl">
                          Chưa có điểm sơ tán tập trung được ghi nhận gần vị trí này. Vui lòng liên hệ Trực ban xã/phường để được hướng dẫn.
                        </div>
                      )}
                    </div>

                    {route && (
                      <div className="mt-3 p-2.5 rounded-xl bg-panel border border-line text-xs flex items-center gap-2">
                        <Compass size={16} className="text-accent shrink-0" />
                        <div>
                          Lộ trình sơ tán: <b>{route.distance_km} km</b> (~{route.duration_min} phút di chuyển). Trạng thái:{' '}
                          {route.safe ? (
                            <span className="font-bold text-good">Đường an toàn, không qua vùng nguy hiểm</span>
                          ) : (
                            <span className="font-bold text-danger">Có đi qua vùng nguy cơ, cần hết sức cẩn thận</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </section>
        )}

        {/* Thanh Điều hướng Tabs (Bản đồ / Mực nước / Điểm sơ tán / Hotline / Cẩm nang) */}
        <div className="flex border-b border-line gap-2 overflow-x-auto scroll-thin pb-1">
          {[
            { id: 'bando', label: 'Bản đồ & Cảnh báo', icon: Compass },
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
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-ink-2 hover:bg-panel2 hover:text-ink'
                )}
              >
                <Icon size={15} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* NỘI DUNG THEO TAB */}

        {/* TAB 1: BẢN ĐỒ & CẢNH BÁO */}
        {activeTab === 'bando' && (
          <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
            {/* Cột Bản đồ */}
            <section className="card overflow-hidden flex flex-col">
              {/* Lớp dữ liệu bản đồ */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-line bg-panel2/60 px-3 py-2 text-xs">
                <span className="font-semibold text-muted">Lớp hiển thị:</span>
                {[
                  ['forecast', 'Mưa 24h'],
                  ['hazard', 'Vùng ngập & điểm sạt lở'],
                  ['stations', 'Trạm đo mực nước'],
                  ['evac', 'Điểm sơ tán'],
                  ['reports', 'Phản ánh người dân'],
                ].map(([k, l]) => (
                  <label key={k} className="flex cursor-pointer items-center gap-1.5 select-none">
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

              {/* Khung bản đồ Leaflet */}
              <div className="h-[55vh] min-h-[380px] w-full">
                <PublicMap data={map} forecast={forecast} geo={geo} me={me} route={route} target={target} layers={layers} />
              </div>

              {/* Chú giải lượng mưa */}
              <div className="flex flex-wrap items-center gap-3 border-t border-line bg-panel2/40 px-3 py-2 text-[11px] text-muted">
                <span className="font-semibold text-ink">Thang mưa dự báo:</span>
                {RAIN_BINS.map((b) => (
                  <span key={b.label} className="flex items-center gap-1">
                    <span className="h-2.5 w-4 rounded-sm shadow-sm" style={{ background: b.color }} />
                    <span>{b.label}</span>
                  </span>
                ))}
              </div>
            </section>

            {/* Cột Cảnh báo & Tin chính thức */}
            <div className="flex flex-col gap-3">
              <section className="card p-3.5 flex flex-col max-h-[65vh]">
                <div className="flex items-center justify-between mb-2 pb-1 border-b border-line/60">
                  <h2 className="card-title text-sm">
                    <Megaphone size={16} className="text-danger" /> Cảnh báo chính thức
                  </h2>
                  <span className="chip bg-danger/10 text-danger text-[11px] font-bold">{alerts.length} bản tin</span>
                </div>

                <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto pr-1 scroll-thin">
                  {alerts.map((a) => (
                    <AlertCard key={a.code} a={a} highlight={a.code === focusAlert} />
                  ))}
                  {!alerts.length && (
                    <div className="text-sm text-muted p-4 text-center">
                      Không có bản tin cảnh báo khẩn cấp trong 7 ngày qua.
                    </div>
                  )}
                </div>
              </section>

              {/* Xã có mưa lớn nhất */}
              <section className="card p-3">
                <h3 className="card-title text-xs mb-2">
                  <CloudRain size={14} className="text-accent" /> Xã dự báo mưa to nhất 24h
                </h3>
                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto scroll-thin">
                  {(forecast || []).slice(0, 5).map((f) => (
                    <div key={f.code} className="flex items-center justify-between text-xs py-1 border-b border-line/40 last:border-0">
                      <span className="truncate flex-1">{f.name}</span>
                      <span className="font-mono font-semibold text-accent">{f.p50} mm</span>
                      <span className="text-[10px] text-muted ml-1.5">(tối đa {f.p90})</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}

        {/* TAB 2: MỰC NƯỚC SÔNG SUỐI */}
        {activeTab === 'muanuoc' && (
          <section className="card p-4 sm:p-6">
            <div className="mb-4">
              <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
                <Waves size={20} className="text-accent" /> Mực nước các lưu vực sông tại Cao Bằng
              </h2>
              <p className="text-xs text-muted mt-0.5">Số liệu trạm thủy văn tự động cập nhật liên tục</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(overview?.rivers || []).map((r) => {
                const badgeCls = ['bg-good text-white', 'bg-warn text-black', 'bg-serious text-white', 'bg-danger text-white'][r.level] || 'bg-good text-white';
                return (
                  <div key={r.name} className="card p-4 border border-line hover:shadow-md transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-sm text-ink">Sông {r.river}</span>
                      <span className={clsx('chip text-xs font-bold', badgeCls)}>{r.level_label}</span>
                    </div>
                    <div className="flex items-baseline gap-1 my-1">
                      <span className="font-mono text-2xl font-bold text-ink">{r.value}</span>
                      <span className="text-xs text-muted">mét</span>
                    </div>
                    <div className="text-xs text-muted mt-2 border-t border-line/60 pt-2 flex justify-between">
                      <span>Trạm quan trắc: {r.name}</span>
                      <span className="text-ink-2">{r.trend || 'Ổn định'}</span>
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
              <button onClick={locate} className="btn-primary text-xs self-start sm:self-auto">
                <LocateFixed size={14} /> Tìm điểm gần vị trí của tôi
              </button>
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

                    <div className="mt-4 pt-2 border-t border-line/60 flex items-center justify-between">
                      <button
                        className="btn-ghost text-xs w-full justify-center text-accent"
                        onClick={() => {
                          setTarget({ lat: site.lat, lon: site.lon, zoom: 14 });
                          setActiveTab('bando');
                          window.scrollTo({ top: 350, behavior: 'smooth' });
                        }}
                      >
                        <Navigation size={13} /> Xem trên bản đồ
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
            <div>
              <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
                <Phone size={20} className="text-danger" /> Đường dây nóng ứng phó thiên tai tỉnh Cao Bằng
              </h2>
              <p className="text-xs text-muted mt-0.5">Trực ban tác chiến 24/24. Khi gặp tình huống khẩn cấp nguy hiểm đến tính mạng, vui lòng gọi ngay!</p>
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
            <div>
              <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
                <BookOpen size={20} className="text-accent" /> Hướng dẫn kỹ năng an toàn khi xảy ra thiên tai
              </h2>
              <p className="text-xs text-muted mt-0.5">Những điều cần nhớ để bảo vệ an toàn cho bản thân và gia đình</p>
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
                  setTarget({ lat: r.lat, lon: r.lon, zoom: 14 });
                  setActiveTab('bando');
                  window.scrollTo({ top: 350, behavior: 'smooth' });
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
              <div className="col-span-full py-8 text-center text-xs text-muted">
                Chưa có phản ánh hiện trường nào trong 72 giờ qua.
              </div>
            )}
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-4 border-t border-line/60 pt-6 pb-4 text-center text-xs text-muted leading-relaxed">
          <div className="font-semibold text-ink">Ban Chỉ huy Phòng chống thiên tai & Tìm kiếm cứu nạn tỉnh Cao Bằng</div>
          <div>Cập nhật dữ liệu thời gian thực · Trực ban tác chiến: <a href="tel:112" className="text-danger font-bold hover:underline">112</a></div>
          <div className="text-[11px] mt-1 text-muted/80">Số liệu quan trắc phục vụ chỉ đạo điều hành và thông tin cảnh báo an toàn cho nhân dân</div>
        </footer>
      </main>

      {/* Modal Cứu nạn khẩn cấp */}
      {showSosModal && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="card w-full max-w-md p-5 shadow-2xl border-danger/40">
            <div className="flex items-center gap-3 text-danger pb-3 border-b border-line">
              <ShieldAlert size={28} />
              <div>
                <h3 className="text-base font-bold text-ink">Yêu Cầu Cứu Nạn Khẩn Cấp</h3>
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
              <button className="btn-ghost text-xs" onClick={() => setShowSosModal(false)}>
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
      {reporting && <ReportForm onClose={() => setReporting(false)} myLocation={me} />}
    </div>
  );
}
