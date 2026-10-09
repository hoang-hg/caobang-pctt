import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GeoJSON, Marker, Pane, Polygon, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from './leafletGlobal';
import 'leaflet-draw';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { pinIcon, COLORS } from './icons';

// Bản đồ nền tự lưu trữ trên máy chủ tỉnh (deploy/fetch-basemap.sh → data/tiles, nginx phục vụ /tiles/): vector
// OpenStreetMap vùng Cao Bằng và các tỉnh lân cận, không phụ thuộc Google / CARTO, chạy được khi mất kết nối quốc tế.
// Nền có `local` dùng tệp này khi máy chủ có; không có (máy dev chưa tải) → nguồn ngoài `url` bên dưới.
const LOCAL_TILES = '/tiles/caobang.pmtiles';
// Zoom ≤ 6 (toàn quốc, Biển Đông) luôn dùng nền ngoài — Google tiếng Việt thể hiện đúng Hoàng Sa, Trường Sa; ô zoom
// thấp của tệp tự lưu trữ (dữ liệu OSM) phủ cả Biển Đông nên không được hiện.
const LOCAL_MIN_ZOOM = 7;

export const BASEMAPS = {
  street: {
    label: 'Bản đồ Địa lý',
    local: 'light',
    url: 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=vi&gl=vn',
    subdomains: ['0', '1', '2', '3'],
    attr: '© Google Maps',
    maxZoom: 20,
  },
  satellite: {
    label: 'Vệ tinh',
    url: 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&hl=vi&gl=vn',
    subdomains: ['0', '1', '2', '3'],
    attr: '© Google Maps',
    maxZoom: 20,
  },
  terrain: {
    label: 'Địa hình',
    url: 'https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}&hl=vi&gl=vn',
    subdomains: ['0', '1', '2', '3'],
    attr: '© Google Maps',
    maxZoom: 20,
  },
  dark: {
    label: 'Chế độ ban đêm',
    local: 'dark',
    url: 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=vi&gl=vn',
    subdomains: ['0', '1', '2', '3'],
    attr: '© Google Maps',
    maxZoom: 20,
    className: 'map-tiles-dark',
  },
};

/**
 * Tệp bản đồ nền tự lưu trữ: { archive, bounds, maxZoom } đọc từ phần đầu tệp (1 yêu cầu Range ~16 KB); null nếu
 * máy chủ không có (máy dev Vite trả index.html → sai định dạng); undefined khi đang kiểm tra.
 */
function useLocalBasemap() {
  const { data } = useQuery({
    queryKey: ['local-basemap'],
    queryFn: async () => {
      try {
        const { PMTiles } = await import('pmtiles');
        const archive = new PMTiles(LOCAL_TILES);
        const h = await archive.getHeader();
        return { archive, bounds: L.latLngBounds([h.minLat, h.minLon], [h.maxLat, h.maxLon]), maxZoom: h.maxZoom };
      } catch {
        return null;
      }
    },
    staleTime: Infinity,
    gcTime: Infinity,
    structuralSharing: false,
    retry: 0,
  });
  return data;
}

/**
 * Lớp nền vector PMTiles, vẽ trên trình duyệt (thư viện tải lười, không nằm trong gói tải lần đầu). Khung nhìn ra
 * ngoài vùng phủ của tệp hoặc zoom < LOCAL_MIN_ZOOM → hiện thêm nền ngoài `fallback` bên dưới, không để trống.
 */
function LocalBaseLayer({ source, flavor, fallback }) {
  const map = useMap();
  const covered = () => map.getZoom() >= LOCAL_MIN_ZOOM && source.bounds.contains(map.getBounds());
  const [inside, setInside] = useState(covered);
  useMapEvents({ moveend: () => setInside(covered()) });
  useEffect(() => {
    let layer;
    let cancelled = false;
    import('protomaps-leaflet').then(({ leafletLayer }) => {
      if (cancelled) return;
      layer = leafletLayer({
        url: source.archive,
        flavor,
        lang: 'vi',
        maxDataZoom: source.maxZoom,
        bounds: source.bounds,
        minZoom: LOCAL_MIN_ZOOM,
        maxZoom: 20,
        zIndex: 2, // trên nền ngoài (zIndex 1)
      });
      layer.addTo(map);
    });
    return () => {
      cancelled = true;
      if (layer) map.removeLayer(layer);
    };
  }, [map, source, flavor]);
  return inside ? null : fallback;
}

/** Nền bản đồ: Địa lý / Ban đêm ưu tiên bản đồ tự lưu trữ; Vệ tinh / Địa hình là nguồn ngoài (README §6.9). */
export function BaseLayer({ basemap }) {
  const map = useMap();
  const theme = useStore((s) => s.theme);
  const local = useLocalBasemap();
  const key = basemap === 'auto' ? (theme === 'dark' ? 'dark' : 'street') : basemap;
  const b = BASEMAPS[key] || BASEMAPS.street;
  const maxZoom = b.maxZoom || 20;
  // Đặt maxZoom cho bản đồ trước khi các lớp khác được thêm (layout effect chạy trước effect thêm lớp của
  // react-leaflet): cụm điểm (markercluster) báo lỗi nếu bản đồ chưa có maxZoom, mà nền tự lưu trữ nạp sau.
  useLayoutEffect(() => {
    map.setMaxZoom(maxZoom);
  }, [map, maxZoom]);
  const external = (
    <>
      <TileLayer
        key={key}
        url={b.url}
        subdomains={b.subdomains || ['0', '1', '2', '3']}
        attribution={b.attr}
        maxZoom={b.maxZoom || 20}
        className={b.className}
      />
      {b.labels && <TileLayer key={`${key}-labels`} url={b.labels} maxZoom={b.maxZoom || 19} zIndex={350} />}
    </>
  );
  if (!b.local) return external;
  if (local === undefined) return null; // chờ kiểm tra xong, tránh tải nền ngoài rồi lại đổi
  if (!local) return external;
  return <LocalBaseLayer key={b.local} source={local} flavor={b.local} fallback={external} />;
}

/** Radar mưa thời gian thực (RainViewer, ảnh mờ opacity). */
export function RadarLayer() {
  const { data } = useQuery({
    queryKey: ['rainviewer'],
    queryFn: async () => (await fetch('https://api.rainviewer.com/public/weather-maps.json')).json(),
    staleTime: 5 * 60_000,
    retry: 0,
  });
  const frame = data?.radar?.past?.at(-1);
  if (!frame || !data?.host) return null;
  return (
    <TileLayer
      url={`${data.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`}
      opacity={0.55}
      zIndex={400}
      tileSize={256}
      maxNativeZoom={7}
      maxZoom={18}
      attribution="Radar © RainViewer"
    />
  );
}

/** Zoom vừa khít vùng đang lọc + phủ lớp mờ ngoài ranh giới. */
export function AreaFocus({ area, filtered, padding = {} }) {
  const map = useMap();
  useEffect(() => {
    if (!area?.bbox) return;
    const [x1, y1, x2, y2] = area.bbox;
    map.flyToBounds([[y1, x1], [y2, x2]], {
      paddingTopLeft: padding.topLeft || [30, 30],
      paddingBottomRight: padding.bottomRight || [30, 30],
      duration: 0.8,
    });
  }, [area?.bbox?.join(','), map]); // eslint-disable-line react-hooks/exhaustive-deps

  const rings = useMemo(() => {
    if (!area?.geometry) return null;
    const g = area.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    return polys.map((p) => p[0].map(([x, y]) => [y, x]));
  }, [area]);
  if (!rings) return null;
  const world = [[-89, -179], [-89, 179], [89, 179], [89, -179]];
  return (
    <>
      <Polygon positions={[world, ...rings]} pathOptions={{ stroke: false, fillColor: '#0b1220', fillOpacity: filtered ? 0.45 : 0.25 }} interactive={false} />
      <Polygon positions={rings} pathOptions={{ color: '#ef4444', weight: 2, fill: false, dashArray: filtered ? undefined : '6 4' }} interactive={false} />
    </>
  );
}

export function FocusHandler() {
  const map = useMap();
  const focus = useStore((s) => s.focus);
  const [marker, setMarker] = useState(null);
  useEffect(() => {
    if (!focus) return;
    map.flyTo([focus.lat, focus.lon], focus.zoom || 14, { duration: 0.8 });
    setMarker(focus);
    const id = setTimeout(() => setMarker(null), 8000);
    return () => clearTimeout(id);
  }, [focus, map]);
  if (!marker) return null;
  return (
    <Marker position={[marker.lat, marker.lon]} icon={pinIcon('◎', COLORS.do)}>
      <Tooltip permanent direction="top" offset={[0, -12]}>{marker.label}</Tooltip>
    </Marker>
  );
}

/**
 * Ranh giới xã/phường: nét liền + viền nền tương phản bên dưới → rõ trên nền sáng, tối, vệ tinh và trên lớp tô màu mưa.
 * Vẽ trong pane riêng (trên lớp tô màu, dưới điểm đánh dấu) nên không bị che dù dữ liệu tải về theo thứ tự nào.
 * `basemap` như BaseLayer ('auto' theo theme); `interactive` = tooltip tên xã khi rê chuột lên đường biên.
 */
export function AdminBoundaries({ geo, basemap = 'auto', interactive = true }) {
  const theme = useStore((s) => s.theme);
  if (!geo) return null;
  const dark = basemap === 'satellite' || basemap === 'dark' || (basemap === 'auto' && theme === 'dark');
  const tone = dark ? 'dark' : 'light';
  return (
    <Pane name="ranh-gioi-xa" style={{ zIndex: 420 }}>
      <GeoJSON
        key={`halo-${tone}`}
        data={geo}
        interactive={false}
        style={{ color: dark ? '#0f172a' : '#ffffff', weight: 3.5, opacity: dark ? 0.55 : 0.8, fill: false }}
      />
      <GeoJSON
        key={`line-${tone}-${interactive}`}
        data={geo}
        interactive={interactive}
        style={{ color: dark ? '#f8fafc' : '#1e293b', weight: 1.5, opacity: 0.9, fill: false }}
        onEachFeature={
          interactive
            ? (f, layer) =>
                layer.bindTooltip(`${f.properties.unit_type === 'phuong' ? 'Phường' : 'Xã'} ${f.properties.name}`, { sticky: true })
            : undefined
        }
      />
    </Pane>
  );
}

/** Công cụ khoanh vùng (đa giác / vòng tròn) bằng leaflet-draw. */
export function DrawTool({ mode, onDrawn }) {
  const map = useMap();
  const groupRef = useRef(null);
  useEffect(() => {
    groupRef.current = L.featureGroup().addTo(map);
    const created = (e) => {
      groupRef.current.clearLayers();
      groupRef.current.addLayer(e.layer);
      let geojson;
      if (e.layerType === 'circle') {
        const c = e.layer.getLatLng();
        const r = e.layer.getRadius();
        const pts = [];
        for (let i = 0; i <= 48; i++) {
          const a = (i / 48) * 2 * Math.PI;
          pts.push([c.lng + (r / (111320 * Math.cos((c.lat * Math.PI) / 180))) * Math.cos(a), c.lat + (r / 110540) * Math.sin(a)]);
        }
        geojson = { type: 'Polygon', coordinates: [pts] };
      } else {
        geojson = e.layer.toGeoJSON().geometry;
      }
      onDrawn(geojson);
    };
    map.on(L.Draw.Event.CREATED, created);
    return () => {
      map.off(L.Draw.Event.CREATED, created);
      groupRef.current.remove();
    };
  }, [map, onDrawn]);

  useEffect(() => {
    if (!mode) return undefined;
    const shape = { shapeOptions: { color: '#ef4444', weight: 2, fillOpacity: 0.15 } };
    const handler = mode === 'circle' ? new L.Draw.Circle(map, shape) : new L.Draw.Polygon(map, { ...shape, allowIntersection: false, showArea: true });
    handler.enable();
    return () => handler.disable();
  }, [mode, map]);

  useEffect(() => {
    if (mode === 'clear') groupRef.current?.clearLayers();
  }, [mode]);
  return null;
}

/** Thước đo khoảng cách: click để thêm điểm. */
export function MeasureTool({ active }) {
  const [pts, setPts] = useState([]);
  useEffect(() => {
    if (!active) setPts([]);
  }, [active]);
  useMapEvents({
    click(e) {
      if (active) setPts((p) => [...p, e.latlng]);
    },
  });
  if (!pts.length) return null;
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += pts[i - 1].distanceTo(pts[i]);
  return (
    <>
      <Polyline positions={pts} pathOptions={{ color: '#f59e0b', weight: 3, dashArray: '6 4' }} />
      {pts.map((p, i) => (
        <Marker key={i} position={p} icon={pinIcon(i + 1, '#f59e0b')}>
          {i === pts.length - 1 && <Tooltip permanent direction="right" offset={[10, 0]}>{(d / 1000).toFixed(2)} km</Tooltip>}
        </Marker>
      ))}
    </>
  );
}

/** Tìm đường an toàn: chọn điểm A (lực lượng) và B (cần cứu hộ). */
export function RouteTool({ active, onResult }) {
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);
  const [route, setRoute] = useState(null);
  useEffect(() => {
    if (!active) {
      setA(null);
      setB(null);
      setRoute(null);
    }
  }, [active]);
  useMapEvents({
    async click(e) {
      if (!active) return;
      if (!a || (a && b)) {
        setA(e.latlng);
        setB(null);
        setRoute(null);
        onResult(null);
        return;
      }
      setB(e.latlng);
      const r = await api('/map/route', { method: 'POST', body: { from_lat: a.lat, from_lon: a.lng, to_lat: e.latlng.lat, to_lon: e.latlng.lng } });
      setRoute(r);
      onResult(r);
    },
  });
  return (
    <>
      {a && <Marker position={a} icon={pinIcon('A', COLORS.blue)} />}
      {b && <Marker position={b} icon={pinIcon('B', COLORS.do)} />}
      {route && (
        <Polyline
          positions={route.geometry.coordinates.map(([x, y]) => [y, x])}
          pathOptions={{ color: route.safe ? COLORS.good : COLORS.cam, weight: 5, opacity: 0.85 }}
        />
      )}
    </>
  );
}

// Thang màu tuần tự 1 sắc độ (xanh) cho lượng mưa dự báo
export const RAIN_BINS = [
  { max: 5, color: '#cde2fb', label: '< 5 mm' },
  { max: 20, color: '#86b6ef', label: '5–20' },
  { max: 50, color: '#3987e5', label: '20–50' },
  { max: 100, color: '#1c5cab', label: '50–100' },
  { max: Infinity, color: '#0d366b', label: '≥ 100 mm' },
];
const rainColor = (mm) => RAIN_BINS.find((b) => mm < b.max).color;

/** Lớp mưa dự báo 24 giờ tới (P50 kết hợp ECMWF/GFS) tô theo xã. */
export function ForecastChoropleth({ geo, areas }) {
  const byCode = useMemo(() => Object.fromEntries((areas || []).map((a) => [a.code, a])), [areas]);
  if (!geo || !areas?.length) return null;
  const data = { ...geo, features: geo.features.filter((f) => byCode[f.properties.code]) };
  return (
    <GeoJSON
      key={`fc-${areas.map((a) => a.p50).join(',')}`}
      data={data}
      style={(f) => ({ color: '#ffffff', weight: 1, fillColor: rainColor(byCode[f.properties.code].p50), fillOpacity: 0.65 })}
      onEachFeature={(f, layer) => {
        const a = byCode[f.properties.code];
        layer.bindTooltip(
          `<b>${a.name}</b><br/>Mưa 24h tới: <b>${a.p50} mm</b> (P10 ${a.p10} – P90 ${a.p90})<br/>Xác suất mưa ≥ 5 mm/h: ${Math.round(a.max_prob_heavy * 100)}%`,
          { sticky: true },
        );
      }}
    />
  );
}
