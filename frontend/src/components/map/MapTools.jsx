import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GeoJSON, Marker, Pane, Polygon, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from './leafletGlobal';
import 'leaflet-draw';
import { api, ApiError } from '../../api/client';
import { useProvinceArea } from '../../api/hooks';
import { usePageStatus } from '../../app/pageStatus';
import { useStore } from '../../app/store';
import { useMediaQuery } from '../../utils/useMediaQuery';
import { pinIcon, COLORS } from './icons';
import { fmtVn } from '../../utils/bulletin';

// leaflet-draw 1.0.4: chú thích khi vẽ là tiếng Anh, số kiểu Anh; `readableArea` gán biến `type` chưa khai báo → bản
// build (mã strict) ném ReferenceError mỗi lần di chuột khi vẽ đa giác từ điểm thứ 3, diện tích không hiện. Đổi chú
// thích sang tiếng Việt và viết lại phần hệ mét của `readableArea` (km² / ha / m²).
L.drawLocal.format = { numeric: { delimiters: { thousands: '.', decimal: ',' } } };
Object.assign(L.drawLocal.draw.handlers.polygon.tooltip, {
  start: 'Chạm lên bản đồ để đặt điểm đầu của vùng.',
  cont: 'Chạm để thêm điểm.',
  end: 'Chạm điểm đầu để khép vùng.',
});
L.drawLocal.draw.handlers.polyline.error = '<strong>Lỗi:</strong> các cạnh của vùng không được cắt nhau.';
L.drawLocal.draw.handlers.circle.tooltip.start = 'Bấm giữ rồi kéo để vẽ vùng tròn.';
L.drawLocal.draw.handlers.circle.radius = 'Bán kính';
L.drawLocal.draw.handlers.simpleshape.tooltip.end = 'Thả tay để hoàn tất.';
const drawReadableArea = L.GeometryUtil.readableArea;
L.GeometryUtil.readableArea = function readableArea(area, isMetric, precision) {
  if (!isMetric) return drawReadableArea.call(this, area, isMetric, precision);
  const n = L.GeometryUtil.formattedNumber;
  if (area >= 1e6) return `${n(area / 1e6, 2)} km²`;
  if (area >= 1e4) return `${n(area / 1e4, 1)} ha`;
  return `${n(area, 0)} m²`;
};

// Bản đồ nền tự lưu trữ trên máy chủ tỉnh (deploy/fetch-basemap.sh → data/tiles, nginx phục vụ /tiles/): vector
// OpenStreetMap vùng Cao Bằng và các tỉnh lân cận, không phụ thuộc Google / CARTO, chạy được khi mất kết nối quốc tế.
// Nền có `local` dùng tệp này khi máy chủ có; không có (máy dev chưa tải) → nguồn ngoài `url` bên dưới.
const LOCAL_TILES = '/tiles/caobang.pmtiles';
// Zoom ≤ 6 (toàn quốc, Biển Đông) luôn dùng nền ngoài — Google tiếng Việt thể hiện đúng Hoàng Sa, Trường Sa; ô zoom
// thấp của tệp tự lưu trữ (dữ liệu OSM) phủ cả Biển Đông nên không được hiện.
const LOCAL_MIN_ZOOM = 7;

// Quyết định 21/10/2026 (docs/ke-hoach-lam-moi-giao-dien.md mục 7.1): Địa lý / Địa hình / Vệ tinh lấy ô Google như các trang
// tham khảo; nền Địa lý tự lưu trữ (`local`) chỉ còn là DỰ PHÒNG — tự bật khi không tải được ô Google (mất kết nối quốc tế).
// `preferLocal`: Ban đêm vẫn ưu tiên nền tự lưu trữ (ô Google tối chỉ là ô sáng đảo màu bằng CSS).
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
    preferLocal: true,
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

// Không tải được ô ngoài: ≥ 6 ô lỗi mà chưa ô nào tải được → coi như mất kết nối quốc tế, chuyển nền dự phòng
const DOWN_AFTER = 6;

/**
 * Nền bản đồ (README §6.9): Địa lý / Địa hình / Vệ tinh là ô Google như các trang tham khảo — Địa lý có nền tự lưu trữ
 * dự phòng; Ban đêm ưu tiên nền tự lưu trữ. Màn rộng (≥ 1024 px), zoom < 12: lấy ô 128 px của mức zoom kế tiếp như trang
 * Cảnh báo đa thiên tai Cao Bằng — chữ nhỏ, nét, nhiều chi tiết; điện thoại giữ ô 256 px (đỡ tốn dữ liệu di động).
 */
export function BaseLayer({ basemap }) {
  const map = useMap();
  const theme = useStore((s) => s.theme);
  const local = useLocalBasemap();
  const key = basemap === 'auto' ? (theme === 'dark' ? 'dark' : 'street') : basemap;
  const b = BASEMAPS[key] || BASEMAPS.street;
  const wide = useMediaQuery('(min-width: 1024px)');
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const crisp = wide && zoom < 12;
  const tiles = useRef({ ok: 0, err: 0 });
  const [down, setDown] = useState(false);
  useEffect(() => {
    tiles.current = { ok: 0, err: 0 };
    setDown(false);
  }, [key]);
  const watch = b.local && !b.preferLocal
    ? {
      tileload: () => { tiles.current.ok += 1; },
      tileerror: () => {
        tiles.current.err += 1;
        if (tiles.current.err >= DOWN_AFTER && !tiles.current.ok) setDown(true);
      },
    }
    : undefined;
  const maxZoom = b.maxZoom || 20;
  // Đặt maxZoom cho bản đồ trước khi các lớp khác được thêm (layout effect chạy trước effect thêm lớp của
  // react-leaflet): cụm điểm (markercluster) báo lỗi nếu bản đồ chưa có maxZoom, mà nền tự lưu trữ nạp sau.
  useLayoutEffect(() => {
    map.setMaxZoom(maxZoom);
  }, [map, maxZoom]);
  const external = (
    <>
      <TileLayer
        key={`${key}-${crisp ? 128 : 256}`}
        url={b.url}
        subdomains={b.subdomains || ['0', '1', '2', '3']}
        attribution={b.attr}
        maxZoom={b.maxZoom || 20}
        tileSize={crisp ? 128 : 256}
        zoomOffset={crisp ? 1 : 0}
        className={b.className}
        eventHandlers={watch}
      />
      {b.labels && <TileLayer key={`${key}-labels`} url={b.labels} maxZoom={b.maxZoom || 19} zIndex={350} />}
    </>
  );
  if (!b.local) return external;
  if (!b.preferLocal && !down) return external; // ô Google trước; mất kết nối quốc tế → nền tự lưu trữ (nếu máy chủ có)
  if (local === undefined) return b.preferLocal ? null : external; // chờ kiểm tra xong, tránh tải nền ngoài rồi lại đổi
  if (!local) return external;
  return <LocalBaseLayer key={b.local} source={local} flavor={b.local} fallback={external} />;
}

/**
 * Danh sách khung ảnh radar RainViewer: ~2 giờ qua, 10 phút một khung (gói miễn phí không còn ảnh dự báo, ảnh mây vệ
 * tinh). Tải lại 5 phút một lần khi lớp đang bật — mở bản đồ lâu thì ảnh "thời gian thực" vẫn là ảnh mới.
 */
export function useRadarFrames(enabled) {
  return useQuery({
    queryKey: ['rainviewer'],
    queryFn: async () => {
      const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
      if (!res.ok) throw new Error(`RainViewer ${res.status}`);
      return res.json();
    },
    enabled,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}

/**
 * Khung radar cho thời điểm trên thanh thời gian (`offsetH` giờ so với bây giờ): hiện tại = khung mới nhất; giờ đã qua =
 * khung gần nhất, lệch không quá nửa nấc thanh (30 phút); giờ tới, hoặc xa hơn ~2 giờ qua → null (không có ảnh).
 */
export function radarFrameAt(data, offsetH, now = Date.now()) {
  const past = data?.radar?.past;
  if (!past?.length || !data.host || offsetH > 0) return null;
  if (offsetH === 0) return past.at(-1);
  const t = now / 1000 + offsetH * 3600;
  const best = past.reduce((a, f) => (Math.abs(f.time - t) < Math.abs(a.time - t) ? f : a));
  return Math.abs(best.time - t) <= 30 * 60 ? best : null;
}

// Bảng màu "Universal Blue" (mã 2 trong địa chỉ ảnh — gói miễn phí chỉ còn bảng này), phần mưa, theo bảng CSV của
// rainviewer.com/api/color-schemes.html: 20–30 dBZ xanh, 35–40 vàng → cam, 45–50 đỏ, ≥ 55 hồng. Mỗi nhóm 2 sắc.
export const RADAR_BINS = [
  { colors: ['#00a3e0', '#005588'], label: 'Mưa nhỏ – vừa' },
  { colors: ['#ffee00', '#ffaa00'], label: 'Mưa to' },
  { colors: ['#ff4400', '#c10000'], label: 'Mưa rất to' },
  { colors: ['#ffaaff', '#ff77ff'], label: 'Dông rất mạnh' },
];

/** Radar mưa (RainViewer, ảnh mờ opacity): khung `frame` lấy từ `useRadarFrames` / `radarFrameAt`. */
export function RadarLayer({ host, frame }) {
  return (
    <TileLayer
      url={`${host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`}
      opacity={0.55}
      zIndex={400}
      tileSize={256}
      maxNativeZoom={7}
      maxZoom={18}
      attribution='Radar © <a href="https://www.rainviewer.com/" target="_blank" rel="noopener noreferrer">RainViewer</a>'
    />
  );
}

/** Zoom vừa khít vùng đang lọc + phủ lớp mờ ngoài ranh giới. */
/**
 * Khung bản đồ đổi cỡ mà cửa sổ không đổi (hàng chỉ số "Tình hình" hiện ra sau khi bản đồ khởi tạo, thu gọn menu trái…) →
 * báo Leaflet tính lại kích thước, giữ nguyên tâm. Không thì Leaflet dùng cỡ cũ: căn giữa vùng lệch (điện thoại: tỉnh dồn
 * xuống đáy), popup tự kéo bản đồ theo cỡ sai nên bị khuất.
 */
export function MapResize() {
  const map = useMap();
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    let frame = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => map.invalidateSize());
    });
    ro.observe(map.getContainer());
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [map]);
  return null;
}

/** Toạ độ con trỏ trên bản đồ → thanh trạng thái dưới cùng (StatusBar — máy tính màn rộng, đủ cao); con trỏ rời bản đồ
 * hoặc rời trang thì xoá. */
export function CursorToStatus() {
  useMapEvents({
    mousemove: (e) => usePageStatus.setState({ cursor: e.latlng }),
    mouseout: () => usePageStatus.setState({ cursor: null }),
  });
  useEffect(() => () => usePageStatus.setState({ cursor: null }), []);
  return null;
}

// Viền vùng đang xem (xã đang lọc): màu nhấn (xanh) của giao diện — KHÔNG dùng đỏ (Đỏ chỉ nghĩa là mức Khẩn cấp của thang rủi ro
// chung), viền nền tương phản bên dưới để rõ trên nền sáng, tối, vệ tinh. Ngoài tỉnh phủ KÍN 100 % (quyết định 28/10/2026: chỉ
// hiện tỉnh Cao Bằng — docs/ke-hoach-lam-moi-giao-dien.md mục 7.2): nền sáng phủ trắng, nền tối và vệ tinh phủ tối. Ranh giới
// tỉnh: nét ĐEN đậm; nền tối thêm viền sáng bên dưới (nét đen trên nền xanh đêm không thấy).
const AREA_STYLE = {
  dark: { line: '#3987e5', halo: '#0b1220', mask: '#0b1220', maskOff: 1, provLine: '#000000', provHalo: '#e2e8f0' },
  light: { line: '#2a78d6', halo: '#ffffff', mask: '#ffffff', maskOff: 1, provLine: '#000000', provHalo: '#ffffff' },
};

/**
 * Vùng đang xem (tỉnh, vùng lọc, phạm vi được giao): bay tới vùng + làm mờ đậm ngoài ranh giới + viền màu nhấn.
 * Ngoài ranh giới tỉnh Cao Bằng phủ kín 100 % — chỉ hiện tỉnh Cao Bằng; ranh giới tỉnh nét đen đậm.
 * Lớp mờ ở pane riêng (trên ô nền, dưới mọi lớp số liệu: điểm, vùng nguy hiểm, quỹ đạo bão vẫn rõ dù ở ngoài vùng);
 * không khoá kéo bản đồ ra ngoài. `fly` = false: không bay tới vùng. `basemap`: nền Vệ tinh → phủ tối.
 */
export function AreaFocus({ area, filtered, padding = {}, fly = true, basemap }) {
  const map = useMap();
  const theme = useStore((st) => st.theme);
  const s = AREA_STYLE[basemap === 'satellite' ? 'dark' : theme] || AREA_STYLE.dark;
  const { data: provinceArea } = useProvinceArea();
  const targetArea = area || provinceArea;

  useEffect(() => {
    if (!fly || !targetArea?.bbox) return;
    const [x1, y1, x2, y2] = targetArea.bbox;
    map.flyToBounds([[y1, x1], [y2, x2]], {
      paddingTopLeft: padding.topLeft || [16, 16],
      paddingBottomRight: padding.bottomRight || [16, 16],
      duration: 0.8,
    });
  }, [targetArea?.bbox?.join(','), map, fly, JSON.stringify(padding)]); // eslint-disable-line react-hooks/exhaustive-deps

  const toRings = (geom) => {
    if (!geom) return null;
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    return polys.map((p) => p[0].map(([x, y]) => [y, x]));
  };

  const provinceRings = useMemo(() => toRings(provinceArea?.geometry), [provinceArea]);
  const activeRings = useMemo(() => toRings(area?.geometry), [area]);
  // Vùng đang xem hẹp hơn tỉnh — đang lọc, hoặc tài khoản xã chưa lọc (phạm vi được giao): làm nổi vùng đó (quyết định 21/10/2026
  // "chỉ rõ tỉnh / vùng đang xem" — docs/ke-hoach-lam-moi-giao-dien.md mục 7.2)
  const narrowed = !!activeRings && (filtered || (!!provinceArea?.bbox && area?.bbox?.join(',') !== provinceArea.bbox.join(',')));

  // Nếu chưa có ranh giới nào được nạp thì chưa vẽ
  if (!provinceRings && !activeRings) return null;

  const world = [[-89, -179], [-89, 179], [89, 179], [89, -179]];

  return (
    <>
      <Pane name="mat-na-ngoai-vung" style={{ zIndex: 350 }}>
        {/* Mặt nạ ngoài tỉnh Cao Bằng: phủ kín — chỉ hiện lãnh thổ tỉnh */}
        {provinceRings && (
          <Polygon
            key={`mask-prov-${s.mask}`}
            positions={[world, ...provinceRings]}
            pathOptions={{ stroke: false, fillColor: s.mask, fillOpacity: s.maskOff }}
            interactive={false}
          />
        )}
        {/* Vùng hẹp hơn tỉnh (xã đang lọc / phạm vi được giao): làm mờ nhẹ (30%) phần còn lại trong tỉnh */}
        {narrowed && provinceRings && (
          <Polygon
            key={`mask-commune-${s.mask}`}
            positions={[provinceRings[0], ...activeRings]}
            pathOptions={{ stroke: false, fillColor: s.mask, fillOpacity: 0.3 }}
            interactive={false}
          />
        )}
      </Pane>
      <Pane name="vien-vung" style={{ zIndex: 425 }}>
        {/* Ranh giới tỉnh Cao Bằng: nét đen đậm trên viền nền tương phản */}
        {provinceRings && (
          <>
            <Polygon
              key={`prov-halo-${s.provHalo}`}
              positions={provinceRings}
              pathOptions={{ color: s.provHalo, weight: 6, opacity: 0.9, fill: false }}
              interactive={false}
            />
            <Polygon
              key={`prov-line-${s.provLine}`}
              positions={provinceRings}
              pathOptions={{ color: s.provLine, weight: 3, opacity: 1, fill: false }}
              interactive={false}
            />
          </>
        )}
        {/* Viền nổi bật cho vùng đang xem (xã đang lọc / phạm vi được giao) */}
        {narrowed && (
          <>
            <Polygon key={`halo-${s.halo}`} positions={activeRings} pathOptions={{ color: s.halo, weight: 5, opacity: 0.7, fill: false }} interactive={false} />
            <Polygon key={`line-${s.line}`} positions={activeRings} pathOptions={{ color: s.line, weight: 2.5, fill: false }} interactive={false} />
          </>
        )}
      </Pane>
    </>
  );
}

/** Làm mờ ngoài tỉnh Cao Bằng cho bản đồ không gắn vùng lọc (cổng người dân, chọn vị trí, hồ sơ, phương tiện…). */
export function ProvinceMask({ basemap }) {
  const { data: area } = useProvinceArea();
  return <AreaFocus area={area} filtered={false} fly={false} basemap={basemap} />;
}

/**
 * Bay tới chỗ được chọn (`focus` trong store): { lat, lon, zoom, label } → bay tới một điểm, cắm dấu 8 giây; { bounds:
 * [[lat, lon], …] } → khung vừa đủ nhiều điểm (VD chạm một chỉ số "Tình hình"), không cắm dấu. `padding` ({ topLeft,
 * bottomRight } px): chừa chỗ các bảng nổi để điểm không nằm dưới bảng.
 */
export function FocusHandler({ padding } = {}) {
  const map = useMap();
  const focus = useStore((s) => s.focus);
  const [marker, setMarker] = useState(null);
  const pad = useRef(padding);
  pad.current = padding;
  useEffect(() => {
    if (!focus) return;
    if (focus.bounds) {
      setMarker(null);
      const b = L.latLngBounds(focus.bounds);
      if (!b.isValid()) return;
      if (b.getNorthEast().equals(b.getSouthWest())) map.flyTo(b.getCenter(), focus.zoom || 13, { duration: 0.8 });
      else map.flyToBounds(b, { duration: 0.8, maxZoom: 13, paddingTopLeft: pad.current?.topLeft, paddingBottomRight: pad.current?.bottomRight });
      return;
    }
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

/** Lời báo lỗi khi công cụ bản đồ gọi máy chủ (khoanh vùng, tìm đường): mất mạng / máy chủ lỗi / lời giải thích của máy chủ. */
export function toolError(e) {
  if (!(e instanceof ApiError)) return 'mất kết nối mạng — kiểm tra mạng rồi thử lại';
  if (e.status >= 500) return `máy chủ đang lỗi (mã ${e.status}) — thử lại sau ít phút`;
  // 422 của FastAPI trả danh sách lỗi dạng JSON — không đưa nguyên văn cho người dùng
  return e.message && !/^[[{]/.test(e.message) ? e.message : `dữ liệu gửi lên không hợp lệ (mã ${e.status})`;
}

/**
 * Tìm đường an toàn: chọn điểm A (lực lượng) và B (cần cứu hộ). `onResult`: null (chưa đủ 2 điểm) | { loading } |
 * { error, retry } | lộ trình. Chọn lại điểm A hoặc tắt công cụ khi đang tìm → bỏ kết quả của lượt cũ.
 */
export function RouteTool({ active, onResult }) {
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);
  const [route, setRoute] = useState(null);
  const seq = useRef(0); // lượt tìm mới nhất
  useEffect(() => {
    if (!active) {
      seq.current += 1;
      setA(null);
      setB(null);
      setRoute(null);
    }
  }, [active]);
  const find = async (from, to) => {
    const n = ++seq.current;
    setRoute(null);
    onResult({ loading: true });
    try {
      const r = await api('/map/route', { method: 'POST', body: { from_lat: from.lat, from_lon: from.lng, to_lat: to.lat, to_lon: to.lng } });
      if (n !== seq.current) return;
      setRoute(r);
      onResult(r);
    } catch (e) {
      if (n === seq.current) onResult({ error: toolError(e), retry: () => find(from, to) });
    }
  };
  useMapEvents({
    click(e) {
      if (!active) return;
      if (!a || (a && b)) {
        seq.current += 1;
        setA(e.latlng);
        setB(null);
        setRoute(null);
        onResult(null);
        return;
      }
      setB(e.latlng);
      find(a, e.latlng);
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
// Mưa trong 1 giờ (thanh thời gian kéo tới +N giờ): ≥ 20 mm/giờ là mưa rất to — thang riêng, dùng thang tổng 24 giờ thì gần
// như mọi xã cùng một màu nhạt
export const RAIN_BINS_HOURLY = [
  { max: 1, color: '#cde2fb', label: '< 1 mm' },
  { max: 5, color: '#86b6ef', label: '1–5' },
  { max: 10, color: '#3987e5', label: '5–10' },
  { max: 20, color: '#1c5cab', label: '10–20' },
  { max: Infinity, color: '#0d366b', label: '≥ 20 mm' },
];

/** Kiểu số liệu của lớp mưa dự báo, xác định theo CHÍNH số liệu (khung 1 giờ: mốc đầu = mốc cuối) → thang màu, nhãn luôn
 * khớp số đang vẽ — kể cả khi bản đồ còn giữ số cũ trong lúc tải khung giờ mới. */
export function rainScale(areas) {
  const a = areas?.[0];
  if (a?.window_to && a.window_from === a.window_to) {
    // Mốc giờ = lượng mưa của 1 giờ TRƯỚC mốc → ghi khoảng giờ, VD "Mưa 21:00–22:00 10-10"
    const from = new Date(Date.parse(a.window_to) - 3600e3).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const span = `Mưa ${from}–${fmtVn(a.window_to)}`;
    return { hourly: true, bins: RAIN_BINS_HOURLY, title: `${span} (dự báo — khả năng cao nhất)`, short: span };
  }
  return { hourly: false, bins: RAIN_BINS, title: 'Mưa dự báo 24 giờ tới (khả năng cao nhất)', short: 'Mưa 24 giờ tới' };
}

/** Lớp mưa dự báo (P50 kết hợp ECMWF/GFS) tô theo xã: tổng 24 giờ tới, hoặc mưa 1 giờ tại thời điểm trên thanh thời gian. */
export function ForecastChoropleth({ geo, areas }) {
  const byCode = useMemo(() => Object.fromEntries((areas || []).map((a) => [a.code, a])), [areas]);
  if (!geo || !areas?.length) return null;
  const scale = rainScale(areas);
  const color = (mm) => scale.bins.find((b) => mm < b.max).color;
  const data = { ...geo, features: geo.features.filter((f) => byCode[f.properties.code]) };
  return (
    <GeoJSON
      key={`fc-${scale.short}-${areas.map((a) => a.p50).join(',')}`}
      data={data}
      style={(f) => ({ color: '#ffffff', weight: 1, fillColor: color(byCode[f.properties.code].p50), fillOpacity: 0.65 })}
      onEachFeature={(f, layer) => {
        const a = byCode[f.properties.code];
        layer.bindTooltip(
          `<b>${a.name}</b><br/>${scale.short}: <b>${a.p50} mm</b> (khoảng có thể xảy ra: ${a.p10} – ${a.p90} mm)<br/>Xác suất mưa ≥ 5 mm/giờ: ${Math.round(a.max_prob_heavy * 100)}%`,
          { sticky: true },
        );
      }}
    />
  );
}
