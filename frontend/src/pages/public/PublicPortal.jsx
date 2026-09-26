import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Circle, CircleMarker, GeoJSON, MapContainer, Marker, Polyline, Popup, Tooltip, useMap } from 'react-leaflet';
import clsx from 'clsx';
import {
  ShieldAlert, LocateFixed, Megaphone, Phone, Home, CloudRain, Waves, Camera, LogIn, Moon, Sun, Navigation, AlertTriangle,
  CheckCircle2, Loader2, Share2,
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
  cao: { label: 'Nguy cơ CAO', cls: 'bg-danger text-white', icon: AlertTriangle },
  trung_binh: { label: 'Cần theo dõi', cls: 'bg-warn text-black', icon: AlertTriangle },
  thap: { label: 'Nguy cơ thấp', cls: 'bg-good text-white', icon: CheckCircle2 },
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
    <div id={`canh-bao-${a.code}`} className={clsx('rounded-lg border-l-4 p-3', SEV[a.severity] || SEV.vang, highlight && 'ring-2 ring-accent')}>
      <div className="flex items-start gap-2">
        <Megaphone size={16} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-snug">{a.title}</div>
          <div className="text-xs text-muted">{dateTime(a.issued_at)} · {a.areas.slice(0, 4).join(', ')}{a.areas.length > 4 ? ` và ${a.areas.length - 4} xã khác` : ''}</div>
        </div>
        <button className="text-muted hover:text-accent" onClick={share} title="Chia sẻ" aria-label="Chia sẻ cảnh báo"><Share2 size={15} /></button>
      </div>
      <p className="mt-1 text-sm">{a.message_body}</p>
    </div>
  );
}

export default function PublicPortal() {
  const { theme, toggleTheme, auth } = useStore();
  const [params] = useSearchParams();
  const focusAlert = params.get('canh-bao');
  const [layers, setLayers] = useState({ forecast: true, hazard: true, stations: true, evac: true, reports: true });
  const [me, setMe] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locErr, setLocErr] = useState('');
  const [route, setRoute] = useState(null);
  const [target, setTarget] = useState(null);
  const [reporting, setReporting] = useState(false);

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
    if (focusAlert && alerts.length) document.getElementById(`canh-bao-${focusAlert}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusAlert, alerts]);

  const locate = () => {
    setLocErr('');
    if (!navigator.geolocation) return setLocErr('Trình duyệt không hỗ trợ định vị');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy };
        setMe(pos);
        setTarget({ ...pos, zoom: 13 });
        setLocating(false);
        setRoute(null);
      },
      () => { setLocating(false); setLocErr('Không lấy được vị trí — hãy cho phép quyền định vị cho trang web'); },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const directions = async (site) => {
    setRoute(await pub('/route', { from_lat: me.lat, from_lon: me.lon, to_lat: site.lat, to_lon: site.lon }));
    setTarget({ lat: (me.lat + site.lat) / 2, lon: (me.lon + site.lon) / 2, zoom: 11.5 });
  };

  const active = overview?.alerts?.active || 0;
  const worstRiver = overview?.rivers?.reduce((m, r) => Math.max(m, r.level), 0) || 0;

  return (
    <div className="min-h-full bg-bg">
      {/* Thanh đầu trang */}
      <header className="sticky top-0 z-[1100] flex items-center gap-2 border-b border-line bg-panel/95 px-3 py-2 backdrop-blur">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger text-white"><ShieldAlert size={20} /></div>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-bold">Cảnh báo thiên tai tỉnh Cao Bằng</div>
          <div className="truncate text-[11px] text-muted">Ban Chỉ huy PCTT & TKCN tỉnh · thông tin chính thức</div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button className="btn-danger hidden sm:inline-flex" onClick={() => setReporting(true)}><Camera size={15} /> Gửi phản ánh</button>
          <button className="btn-ghost px-2" onClick={toggleTheme} aria-label="Đổi giao diện sáng/tối">{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
          <Link to={auth?.token ? '/dashboard' : '/dang-nhap'} className="btn-ghost px-2 text-xs"><LogIn size={14} /> <span className="hidden sm:inline">{auth?.token ? 'Vào điều hành' : 'Cán bộ đăng nhập'}</span></Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-3 p-3">
        {/* Dải trạng thái */}
        <div className={clsx('flex flex-wrap items-center gap-3 rounded-xl p-3', active ? (overview?.alerts?.has_red ? 'bg-danger text-white' : 'bg-serious text-white') : 'bg-good/15 text-ink')}>
          {active ? <AlertTriangle size={22} /> : <CheckCircle2 size={22} className="text-good" />}
          <div className="min-w-0 flex-1">
            <div className="font-bold">{active ? `Đang có ${active} cảnh báo thiên tai trong 48 giờ qua` : 'Hiện chưa có cảnh báo khẩn cấp'}</div>
            <div className="text-xs opacity-90">
              Mưa 24h qua: TB {overview?.rain?.avg_24h ?? '–'} mm, cao nhất {overview?.rain?.max_24h ?? '–'} mm ·
              Dự báo 24h tới cao nhất {overview?.forecast_24h?.max_24h ?? '–'} mm ({overview?.forecast_24h?.max_name || '–'}) ·
              Sông: {['dưới báo động', 'trên báo động I', 'trên báo động II', 'trên báo động III'][worstRiver]}
            </div>
          </div>
          <a href="tel:112" className="btn bg-white/90 font-bold text-danger"><Phone size={15} /> Gọi 112</a>
        </div>

        {/* Tôi đang ở đâu */}
        <section className="card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" onClick={locate} disabled={locating}>
              {locating ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} />} Tôi đang ở đâu? Có nguy hiểm không?
            </button>
            <button className="btn-danger sm:hidden" onClick={() => setReporting(true)}><Camera size={15} /> Gửi phản ánh</button>
            {locErr && <span className="text-sm text-danger">{locErr}</span>}
          </div>
          {here && (() => {
            const R = RISK[here.risk];
            return (
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1.2fr]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={clsx('chip px-3 py-1 text-sm', R.cls)}><R.icon size={14} /> {R.label}</span>
                    <b>{here.commune.name}</b><span className="text-xs text-muted">({here.commune.district})</span>
                  </div>
                  <p className="mt-2 text-sm">{here.advice}</p>
                  <div className="mt-2 text-xs text-muted">Mưa dự báo 24h tới: <b className="text-ink">{here.forecast_24h?.p50 ?? '–'} mm</b> (có thể tới {here.forecast_24h?.p90 ?? '–'} mm)</div>
                  {here.hazards.slice(0, 3).map((h) => (
                    <div key={h.name} className="mt-1 text-xs"><AlertTriangle size={11} className="mr-1 inline text-danger" />{h.name} — {h.distance_m === 0 ? 'bạn đang ở trong vùng này' : `cách ${h.distance_m} m`}</div>
                  ))}
                  {here.alerts.map((a) => <div key={a.code} className="mt-1 text-xs font-semibold text-danger">⚠ {a.title}</div>)}
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase text-muted">Điểm sơ tán gần nhất còn chỗ</div>
                  {here.evacuation_sites.map((s) => (
                    <div key={s.id} className="mb-1 flex items-center gap-2 rounded-lg border border-line p-2 text-sm">
                      <Home size={15} className="shrink-0 text-good" />
                      <span className="min-w-0 flex-1"><b>{s.name}</b><span className="block text-xs text-muted">{s.distance_km} km · còn {s.capacity - s.current_occupancy} chỗ</span></span>
                      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => directions(s)}><Navigation size={12} /> Chỉ đường</button>
                    </div>
                  ))}
                  {route && <div className="text-xs">Lộ trình {route.distance_km} km · ~{route.duration_min} phút · {route.safe ? <span className="text-good">tránh được vùng nguy hiểm</span> : <span className="text-danger">buộc đi qua vùng nguy hiểm — hết sức thận trọng</span>}</div>}
                </div>
              </div>
            );
          })()}
        </section>

        <div className="grid gap-3 lg:grid-cols-[1fr_380px]">
          {/* Bản đồ */}
          <section className="card overflow-hidden">
            <div className="flex flex-wrap gap-x-3 gap-y-1 border-b border-line px-3 py-2 text-xs">
              {[['forecast', 'Mưa dự báo 24h'], ['hazard', 'Vùng nguy hiểm, đường cấm'], ['stations', 'Trạm đo mưa / mực nước'], ['evac', 'Điểm sơ tán'], ['reports', 'Phản ánh người dân']].map(([k, l]) => (
                <label key={k} className="flex cursor-pointer items-center gap-1">
                  <input type="checkbox" checked={layers[k]} onChange={(e) => setLayers((x) => ({ ...x, [k]: e.target.checked }))} /> {l}
                </label>
              ))}
            </div>
            <div className="h-[60vh] min-h-[380px]">
              <PublicMap data={map} forecast={forecast} geo={geo} me={me} route={route} target={target} layers={layers} />
            </div>
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-[11px] text-muted">
              Mưa 24h tới: {RAIN_BINS.map((b) => <span key={b.label} className="flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm" style={{ background: b.color }} />{b.label}</span>)}
            </div>
          </section>

          {/* Cột phải */}
          <div className="flex flex-col gap-3">
            <section className="card p-3">
              <h2 className="card-title mb-2">Cảnh báo chính thức</h2>
              <div className="flex max-h-[45vh] flex-col gap-2 overflow-y-auto scroll-thin">
                {alerts.map((a) => <AlertCard key={a.code} a={a} highlight={a.code === focusAlert} />)}
                {!alerts.length && <div className="text-sm text-muted">Không có cảnh báo trong 7 ngày qua.</div>}
              </div>
            </section>
            <section className="card p-3">
              <h2 className="card-title mb-2 flex items-center gap-1"><Waves size={14} /> Mực nước sông</h2>
              {overview?.rivers?.map((r) => (
                <div key={r.name} className="flex items-center justify-between border-b border-line/50 py-1 text-sm last:border-0">
                  <span>Sông {r.river}</span>
                  <span className="flex items-center gap-2"><b className="font-mono">{r.value} m</b>
                    <span className={clsx('chip', ['bg-good text-white', 'bg-warn text-black', 'bg-serious text-white', 'bg-danger text-white'][r.level])}>{r.level_label}</span></span>
                </div>
              ))}
            </section>
            <section className="card p-3">
              <h2 className="card-title mb-2 flex items-center gap-1"><Phone size={14} /> Đường dây nóng</h2>
              <div className="grid grid-cols-2 gap-2">
                {hotlines?.national.map((h) => (
                  <a key={h.number} href={`tel:${h.number}`} className="flex items-center gap-2 rounded-lg border border-line p-2 hover:border-danger">
                    <b className="font-mono text-lg text-danger">{h.number}</b><span className="text-[11px] leading-tight text-muted">{h.name}</span>
                  </a>
                ))}
              </div>
              {hotlines?.province.map((p) => (
                <a key={p.phone} href={`tel:${p.phone.replace(/\s/g, '')}`} className="mt-2 block text-xs text-accent">{p.org}: {p.phone}</a>
              ))}
            </section>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <section className="card p-3">
            <h2 className="card-title mb-2 flex items-center gap-1"><CloudRain size={14} /> Xã có mưa lớn nhất 24 giờ tới</h2>
            {(forecast || []).slice(0, 8).map((f) => (
              <button key={f.code} className="flex w-full items-center gap-2 border-b border-line/50 py-1 text-left text-sm last:border-0 hover:text-accent"
                onClick={() => { const u = geo?.features.find((x) => x.properties.code === f.code); if (u) { const c = u.geometry.coordinates.flat(3); setTarget({ lat: c[1], lon: c[0], zoom: 11 }); } }}>
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: rainColor(f.p50) }} />
                <span className="flex-1">{f.name}</span>
                <b className="font-mono">{f.p50} mm</b><span className="w-24 text-right text-xs text-muted">tối đa {f.p90}</span>
              </button>
            ))}
            <p className="mt-2 text-[11px] text-muted">Dự báo tổ hợp ECMWF + NOAA GFS (Open-Meteo), cập nhật mỗi 3 giờ.</p>
          </section>
          <section className="card p-3">
            <h2 className="card-title mb-2 flex items-center gap-1"><Camera size={14} /> Phản ánh hiện trường đã xác minh</h2>
            <div className="flex max-h-80 flex-col gap-2 overflow-y-auto scroll-thin">
              {(map?.reports || []).slice(0, 12).map((r) => (
                <button key={r.id} className="flex gap-2 rounded-lg border border-line p-2 text-left hover:border-accent" onClick={() => setTarget({ lat: r.lat, lon: r.lon, zoom: 14 })}>
                  {r.photos[0] ? <img src={r.photos[0].thumb} alt="" className="h-14 w-14 shrink-0 rounded object-cover" loading="lazy" /> : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-panel2"><Camera size={18} className="text-muted" /></div>}
                  <span className="min-w-0 text-sm"><b>{r.category_label}</b> · <span className="text-xs text-muted">{r.admin_name} · {ago(r.created_at)}</span>
                    <span className="line-clamp-2 block text-xs">{r.description}</span>
                    {r.public_note && <span className="block text-xs text-good">{r.public_note}</span>}</span>
                </button>
              ))}
              {!map?.reports?.length && <div className="text-sm text-muted">Chưa có phản ánh được xác minh trong 72 giờ qua.</div>}
            </div>
          </section>
        </div>

        <footer className="py-4 text-center text-[11px] text-muted">
          Ban Chỉ huy Phòng chống thiên tai & Tìm kiếm cứu nạn tỉnh Cao Bằng · Số liệu cập nhật {overview?.generated_at ? dateTime(overview.generated_at) : '–'}.
          Khi gặp nguy hiểm đến tính mạng hãy gọi ngay <a href="tel:112" className="font-bold text-danger">112</a>.
        </footer>
      </main>

      {reporting && <ReportForm onClose={() => setReporting(false)} myLocation={me} />}
    </div>
  );
}
