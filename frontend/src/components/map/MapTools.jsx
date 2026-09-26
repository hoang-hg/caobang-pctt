import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GeoJSON, Marker, Polygon, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from './leafletGlobal';
import 'leaflet-draw';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { pinIcon, COLORS } from './icons';

export const BASEMAPS = {
  street: { label: 'Bản đồ đường phố', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '© OpenStreetMap' },
  terrain: { label: 'Địa hình', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attr: '© OpenTopoMap, © OpenStreetMap', maxZoom: 17 },
  satellite: {
    label: 'Vệ tinh',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr: '© Esri World Imagery',
  },
  dark: {
    label: 'Chế độ ban đêm',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    labels: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    attr: '© Esri, HERE, OpenStreetMap',
    maxZoom: 16,
  },
};

/** Nền bản đồ: 'auto' = nền tối (Dark Gray Canvas) khi giao diện tối, bản đồ đường phố khi sáng. */
export function BaseLayer({ basemap }) {
  const theme = useStore((s) => s.theme);
  const key = basemap === 'auto' ? (theme === 'dark' ? 'dark' : 'street') : basemap;
  const b = BASEMAPS[key];
  return (
    <>
      <TileLayer key={key} url={b.url} attribution={b.attr} maxZoom={b.maxZoom || 19} />
      {b.labels && <TileLayer key={`${key}-labels`} url={b.labels} maxZoom={b.maxZoom || 19} zIndex={350} />}
    </>
  );
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
  if (!frame) return null;
  return <TileLayer url={`${data.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`} opacity={0.6} zIndex={400} attribution="Radar © RainViewer" />;
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

export function AdminBoundaries({ geo }) {
  const theme = useStore((s) => s.theme);
  if (!geo) return null;
  return (
    <GeoJSON
      key={theme}
      data={geo}
      style={{ color: theme === 'dark' ? '#94a3b8' : '#475569', weight: 1, opacity: 0.55, fill: false, dashArray: '3 3' }}
      onEachFeature={(f, layer) => layer.bindTooltip(`${f.properties.unit_type === 'phuong' ? 'Phường' : 'Xã'} ${f.properties.name}`, { sticky: true })}
    />
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
          pathOptions={{ color: route.safe ? '#16a34a' : '#f97316', weight: 5, opacity: 0.85 }}
        />
      )}
    </>
  );
}
