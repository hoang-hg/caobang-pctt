import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { GeoJSON, MapContainer, Marker, Polyline, Popup, Tooltip, ZoomControl, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import clsx from 'clsx';
import { Maximize2 } from 'lucide-react';
import { useAreaQuery } from '../../api/hooks';
import { useStore } from '../../app/store';
import { Legend } from '../charts/chartTheme';
import { ShowMore } from '../common/ui';
import { AreaFocus, BaseLayer, MapResize } from '../map/MapTools';
import { evacIcon, sosIcon } from '../map/icons';
import { INCIDENT, SOS_STATUS } from '../../utils/labels';
import { HAZARD_LEVEL, levelOf, occupancyLevel, risk, RISK, sosLevel } from '../../utils/risk';
import { hasActiveTeam } from '../../utils/sla';
import { int, time } from '../../utils/format';
import { useShowMore } from '../../utils/useShowMore';
import { durWords, ticketFacts } from './rescueFacts';

const CENTER = [22.75, 106.05];
const MAP_PAD = { topLeft: [14, 14], bottomRight: [14, 14] };
// Như Bản đồ giám sát: lộ trình an toàn xanh, qua vùng nguy hiểm cam; vùng ngập xanh dương, vùng sạt lở theo mức
const ROUTE = { safe: RISK[0].hex, unsafe: RISK[2].hex };
const FLOOD = '#2563eb';
const EVAC = '#166534';
// Biểu tượng dựng sẵn theo (mức, trạng thái): trang vẽ lại mỗi giây (đồng hồ SLA) — tạo biểu tượng mới mỗi lần làm Leaflet
// thay phần tử của điểm liên tục (nháy, mất cú chạm đang bấm)
const ICONS = new Map();
const cached = (key, make) => {
  if (!ICONS.has(key)) ICONS.set(key, make());
  return ICONS.get(key);
};

// Cụm phiếu SOS (tỉnh nhìn từ xa, biểu tượng 32 px chồng nhau): màu của phiếu khẩn nhất trong cụm (thang chung), số phiếu ở
// giữa; chạm → phóng to; cùng một chỗ → xoè ra
const PRIORITY_HEX = { 1: RISK[3].hex, 2: RISK[2].hex, 3: RISK[1].hex };
const clusterIcon = (cluster) => {
  const n = cluster.getChildCount();
  const top = Math.min(...cluster.getAllChildMarkers().map((m) => m.options.priority || 3));
  const size = n >= 10 ? 40 : 34;
  return L.divIcon({
    html: `<div title="Cụm ${n} phiếu SOS, khẩn nhất cấp ${top} — chạm để phóng to" style="width:${size}px;height:${size}px;border-radius:9999px;background:${PRIORITY_HEX[top]};color:${top === 1 ? '#fff' : '#111827'};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font:700 13px/1 sans-serif">${n}</div>`,
    className: 'map-icon sos-cluster',
    iconSize: [size, size],
  });
};

/** Vừa khung các phiếu đang mở — chỗ đang có việc, không phải cả tỉnh. Một lần cho mỗi vùng lọc: số liệu tải lại 20 giây / lần
 * không giật bản đồ khỏi chỗ người xem đang kéo tới. */
function FitTickets({ points, areaKey }) {
  const map = useMap();
  const done = useRef(null);
  useEffect(() => {
    if (!points.length || done.current === areaKey) return;
    done.current = areaKey;
    map.fitBounds(points, { padding: [28, 28], maxZoom: 13 });
  }, [map, points, areaKey]);
  return null;
}

function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lon], Math.max(map.getZoom(), 13), { duration: 0.6 });
  }, [target, map]);
  return null;
}

/** Đội có giờ dự kiến tới gần nhất lên đầu; quá giờ dự kiến trước cả; đã đến cuối. */
const teamRank = (t, now) => (t.dispatch_status === 'da_den' ? 2 : t.eta && new Date(t.eta).getTime() <= now ? 0 : 1);

function TeamRow({ t, now, onPick }) {
  const arrived = t.dispatch_status === 'da_den';
  const etaSec = t.eta ? (new Date(t.eta).getTime() - now) / 1000 : null;
  const late = !arrived && etaSec != null && etaSec <= 0;
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(t)}
        className="tap flex w-full items-center gap-2 rounded-md border border-line/60 px-2 py-1.5 text-left text-xs hover:bg-panel2"
        aria-label={`${t.force_name || 'Lực lượng'} đến ${t.code}: ${arrived ? 'đã đến' : late ? 'quá giờ dự kiến' : etaSec != null ? `còn ${durWords(etaSec)}` : 'chưa có giờ dự kiến'} — xem trên bản đồ`}
      >
        <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', risk(sosLevel(t.priority)).fill)} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-ink">{t.force_name || 'Lực lượng'} → {t.code}</span>
          <span className="block truncate text-muted">{INCIDENT[t.incident_type] || t.incident_type}{t.admin_name ? ` · ${t.admin_name}` : ''}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className={clsx('block font-semibold', arrived ? 'text-good' : late ? 'text-danger' : 'text-ink')}>
            {arrived ? (t.arrived_at ? `Đã đến lúc ${time(t.arrived_at)}` : 'Đã đến') : etaSec == null ? 'Chưa có giờ dự kiến' : late ? 'Quá giờ dự kiến' : `còn ${durWords(etaSec)}`}
          </span>
          {t.route_safe === false && !arrived && <span className="block text-[10px] font-semibold text-serious">qua vùng nguy hiểm</span>}
        </span>
      </button>
    </li>
  );
}

const SosMarker = memo(function SosMarker({ t, onOpen }) {
  const x = ticketFacts(t);
  return (
    <Marker
      position={[t.lat, t.lon]}
      title={t.code}
      priority={t.priority}
      icon={cached(`sos-${t.priority}-${t.status === 'moi'}`, () => sosIcon(t.priority, t.status))}
      zIndexOffset={1000}
    >
      <Popup autoPan={true}>
        <div className="flex min-w-[200px] flex-col gap-1 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <b className="text-sm">{t.code}</b>
            <span className={clsx('chip', risk(sosLevel(t.priority)).chip)}>Cấp {t.priority}</span>
            {x.overdue && <span className="chip bg-danger text-white">Quá hạn</span>}
          </div>
          <div>{INCIDENT[t.incident_type] || t.incident_type}{t.trapped_count ? ` · ${t.trapped_count} người` : ''}</div>
          {t.address && <div className="text-muted line-clamp-1">{t.address}</div>}
          <div>
            {SOS_STATUS[t.status] || t.status}
            {x.sla ? ` · chờ ${durWords(x.sla.waitedSec)}` : ''}
            {t.force_name && hasActiveTeam(t) ? ` · ${t.force_name}` : ''}
          </div>
          <button type="button" className="btn-primary tap mt-1 min-h-[32px] justify-center text-xs" onClick={() => onOpen(t)}>Xem phiếu trên bảng</button>
        </div>
      </Popup>
    </Marker>
  );
});

/**
 * Bản đồ cứu hộ (thiết kế D.2 cột "Đội đang đến" + D.4): phiếu SOS đang mở (biểu tượng như Bản đồ giám sát, màu
 * theo mức), lộ trình đội đang đi tới phiếu (xanh; qua vùng nguy hiểm: cam), vùng nguy cơ đang hiệu lực (gồm vùng khoanh tự
 * động từ trạm quan trắc), điểm sơ tán (viền theo mức chứa). Dưới bản đồ: đội đang trên đường, còn bao lâu tới nơi (quá giờ dự kiến lên
 * đầu, đã đến cuối) — chạm để bay tới. Vị trí đội là lộ trình đã giao từ nơi đóng quân, KHÔNG theo dõi GPS điện thoại. Màn cảm ứng: một
 * ngón tay cuộn trang, hai ngón kéo / phóng bản đồ (bản đồ không "nuốt" thao tác cuộn).
 */
export default function RescueMap({ tickets, now, onOpen }) {
  const layersQ = useAreaQuery('map-layers', '/map/layers', {}, { refetchInterval: 30_000 });
  const { data: area } = useAreaQuery('area', '/admin-units/area', {}, { staleTime: Infinity });
  const filterCodes = useStore((s) => s.filter.codes);
  const filtered = filterCodes.length > 0;
  const [coarse] = useState(() => window.matchMedia?.('(pointer: coarse)').matches ?? false);
  const [target, setTarget] = useState(null);
  const layers = layersQ.data;
  const open = useMemo(() => tickets.filter((t) => t.status !== 'hoan_thanh' && t.lat != null && t.lon != null), [tickets]);
  const markerElements = useMemo(() => open.map((t) => (
    <SosMarker key={t.id} t={t} onOpen={onOpen} />
  )), [open, onOpen]);
  const teams = tickets
    .filter((t) => t.status === 'thuc_thi' && hasActiveTeam(t))
    .sort((a, b) => teamRank(a, now) - teamRank(b, now) || new Date(a.eta || 0) - new Date(b.eta || 0));
  const shownTeams = useShowMore(teams, 4, 'doi');
  const routes = (layers?.routes?.features || []).filter((f) => f.geometry?.type === 'LineString');
  const zones = layers?.hazard_zones?.features || [];
  const sites = (layers?.evacuation_sites?.features || []).filter((f) => f.geometry?.coordinates?.[1] != null);
  const pick = (t) => setTarget({ lat: t.lat, lon: t.lon, at: Date.now() });
  const points = useMemo(() => open.map((t) => [t.lat, t.lon]), [open]);
  // Đã lỗi rồi đang tự tải lại: vẫn báo lỗi — React Query v5 đưa truy vấn chưa có dữ liệu về "đang tải" mỗi lần tải lại
  const layersFailed = !layers && (layersQ.isError || (layersQ.errorUpdateCount > 0 && layersQ.isFetching));

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">
          Bản đồ cứu hộ <span className="text-xs font-normal text-muted">· {open.length} phiếu đang mở · {teams.length} đội đang làm nhiệm vụ</span>
        </h3>
        <Link to="/ban-do" className="btn-ghost tap min-h-[32px] px-2.5 py-0.5 text-xs"><Maximize2 size={12} aria-hidden="true" /> Bản đồ đầy đủ</Link>
      </div>
      {/* isolate: lớp Leaflet (z-index tới 1000) không đè dải thông tin khẩn dính trên cùng khi cuộn */}
      <div className="relative isolate z-0 h-80 overflow-hidden rounded-lg border border-line xl:h-96">
        <MapContainer center={CENTER} zoom={8.8} zoomControl={false} zoomSnap={0.1} zoomDelta={0.5} scrollWheelZoom={false} dragging={!coarse} className="h-full w-full">
          <BaseLayer basemap="auto" />
          <ZoomControl position="bottomright" />
          <MapResize />
          <AreaFocus area={area} filtered={filtered} fly={!points.length} padding={MAP_PAD} />
          <FitTickets points={points} areaKey={filterCodes.join(',') || 'tinh'} />
          <FlyTo target={target} />
          {zones.map((f) => {
            const p = f.properties;
            const flood = p.type === 'ngap';
            const color = flood ? FLOOD : risk(levelOf(HAZARD_LEVEL, p.level) ?? 3).hex;
            return (
              <GeoJSON key={p.id} data={f} style={{ color, weight: flood ? 1 : 2, fillColor: color, fillOpacity: flood ? 0.25 : 0.18 }}>
                <Tooltip sticky>{p.name}{p.source === 'sensor' ? ' (khoanh tự động từ trạm quan trắc)' : ''}</Tooltip>
              </GeoJSON>
            );
          })}
          {routes.map((f) => {
            const p = f.properties;
            const etaSec = p.eta ? (new Date(p.eta).getTime() - now) / 1000 : null;
            return (
              <Polyline
                key={p.id}
                positions={f.geometry.coordinates.map(([x, y]) => [y, x])}
                pathOptions={{ color: p.route_safe === false ? ROUTE.unsafe : ROUTE.safe, weight: 4, dashArray: p.status === 'da_den' ? undefined : '10 6', opacity: 0.9 }}
              >
                <Tooltip sticky>
                  {p.force_name || 'Lực lượng'} → {p.ticket_code}
                  {p.status === 'da_den' ? ' · đã đến' : etaSec == null ? '' : etaSec > 0 ? ` · còn ${durWords(etaSec)}` : ' · quá giờ dự kiến'}
                  {p.route_safe === false ? ' · qua vùng nguy hiểm' : ''}
                </Tooltip>
              </Polyline>
            );
          })}
          {sites.map((f) => {
            const p = f.properties;
            return (
              <Marker key={p.id} position={[f.geometry.coordinates[1], f.geometry.coordinates[0]]} zIndexOffset={-1000} icon={cached(`evac-${occupancyLevel(p.current_occupancy, p.capacity)}`, () => evacIcon(p.capacity ? p.current_occupancy / p.capacity : null))}>
                <Popup>
                  <b>{p.name}</b>
                  <div>Điểm sơ tán · {int(p.current_occupancy)}/{int(p.capacity)} người</div>
                </Popup>
              </Marker>
            );
          })}
          <MarkerClusterGroup maxClusterRadius={40} spiderfyOnMaxZoom showCoverageOnHover={false} iconCreateFunction={clusterIcon}>
            {markerElements}
          </MarkerClusterGroup>
        </MapContainer>
        {/* Lớp lộ trình / vùng nguy cơ / điểm sơ tán chưa tải được: nói rõ (điểm SOS vẫn hiện — từ danh sách phiếu) */}
        {layersFailed && (
          <div role="alert" className="absolute inset-x-2 top-2 z-[500] flex flex-wrap items-center justify-center gap-2 rounded-lg border border-danger/40 bg-panel/95 px-3 py-2 text-center text-xs text-danger shadow">
            Không tải được lộ trình đội, vùng nguy cơ, điểm sơ tán{layersQ.isFetching ? ' — đang thử lại…' : ''}
            <button type="button" className="btn-ghost tap min-h-[32px] px-2 py-0.5 text-xs" onClick={() => layersQ.refetch()} disabled={layersQ.isFetching}>Thử lại</button>
          </div>
        )}
        {!layers && !layersFailed && (
          <div className="pointer-events-none absolute inset-x-2 top-2 z-[500] rounded-lg bg-panel/90 px-3 py-2 text-center text-xs text-muted shadow">Đang tải lộ trình đội, vùng nguy cơ…</div>
        )}
        {layers && !open.length && (
          <div className="pointer-events-none absolute inset-x-2 top-2 z-[500] rounded-lg bg-panel/90 px-3 py-2 text-center text-xs text-ink-2 shadow">
            Không có phiếu SOS đang mở trong vùng đang xem
          </div>
        )}
      </div>
      <Legend
        items={[
          { label: 'SOS cấp 1', color: RISK[3].hex },
          { label: 'Cấp 2', color: RISK[2].hex },
          { label: 'Cấp 3', color: RISK[1].hex },
          { label: 'Lộ trình đội', color: ROUTE.safe, dashed: true },
          { label: 'Qua vùng nguy hiểm', color: ROUTE.unsafe, dashed: true },
          { label: 'Điểm sơ tán', color: EVAC },
        ]}
      />
      {coarse && <p className="text-[11px] text-muted">Chạm biểu tượng để xem phiếu · hai ngón tay để kéo, phóng bản đồ</p>}
      <div>
        <h4 className="mb-1 text-xs font-semibold text-muted">Đội đang trên đường — còn bao lâu tới nơi</h4>
        {teams.length ? (
          <>
            <ul className="flex flex-col gap-1">
              {shownTeams.visible.map((t) => <TeamRow key={t.id} t={t} now={now} onPick={pick} />)}
            </ul>
            <ShowMore list={shownTeams} step={4} noun="đội" />
          </>
        ) : (
          <p className="text-xs text-muted">Chưa có đội nào đang trên đường tới điểm cứu hộ</p>
        )}
      </div>
    </div>
  );
}
