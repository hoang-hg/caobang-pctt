import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Circle, CircleMarker, GeoJSON, Marker, Polyline, Popup, Tooltip, useMap } from 'react-leaflet';
import { Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, YAxis } from 'recharts';
import { Phone, Send, Video, PackageMinus } from 'lucide-react';
import clsx from 'clsx';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import Hydrograph from '../charts/Hydrograph';
import { useChartTheme } from '../charts/chartTheme';
import { Can, usePermission } from '../../rbac/usePermission';
import { cameraIcon, evacIcon, forceIcon, hazardIcon, reservoirIcon, sosIcon, stationIcon, vehicleIcon, warehouseIcon } from './icons';
import { ALARM, alarmLevel, CATEGORY, FORCE_TYPE, INCIDENT, LEVEL, PRIORITY, RES_STATUS, SKILL, SOS_STATUS, SOURCE, STATION_TYPE, VEHICLE } from '../../utils/labels';
import { ago, num } from '../../utils/format';

const ll = (f) => [f.geometry.coordinates[1], f.geometry.coordinates[0]];
const Tel = ({ phone, label = 'Gọi' }) =>
  phone ? (
    <a className="btn-ghost px-2 py-1 text-xs" href={`tel:${phone.replace(/\s/g, '')}`}><Phone size={12} /> {label}</a>
  ) : null;

function MiniSeries({ stationId, unit }) {
  const c = useChartTheme();
  const { data } = useQuery({ queryKey: ['series', stationId, 24], queryFn: () => api(`/stations/${stationId}/series`, { params: { hours: 24 } }) });
  if (!data) return <div className="h-20 animate-pulse rounded bg-panel2" />;
  return (
    <div>
      <ResponsiveContainer width="100%" height={80}>
        <LineChart data={data.observed} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
          <YAxis tick={{ fontSize: 9, fill: c.axis }} tickLine={false} axisLine={false} />
          <Line dataKey="value" stroke={c.s1} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <div className="text-[10px] text-muted">24 giờ qua ({unit})</div>
    </div>
  );
}

function StationPopup({ p }) {
  const lv = alarmLevel(p.value, p.thresholds);
  return (
    <div className="w-72">
      <div className="font-semibold">{p.name}</div>
      <div className="mb-1 text-xs text-muted">{STATION_TYPE[p.type]} · {p.id}</div>
      <div className="mb-1 flex items-center gap-2">
        <span className="font-mono text-lg">{num(p.value, p.type === 'muc_nuoc' ? 2 : 1)} {p.unit}</span>
        {p.thresholds?.bd1 != null && <span className={clsx('chip', ALARM[lv].cls)}>{ALARM[lv].label}</span>}
      </div>
      {p.type === 'muc_nuoc' ? <Hydrograph stationId={p.id} height={130} hours={24} compact /> : <MiniSeries stationId={p.id} unit={p.unit} />}
    </div>
  );
}

function WarehousePopup({ p, onIssue }) {
  const c = useChartTheme();
  const cats = Object.entries(p.categories || {});
  const colors = [c.s1, c.s2, c.s3, '#e87ba4'];
  return (
    <div className="w-64">
      <div className="font-semibold">{p.name}</div>
      <div className="text-xs text-muted">Tồn kho trung bình {p.pct}% định mức</div>
      <div className="flex items-center gap-2">
        <div className="h-24 w-24">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={[{ v: Math.min(p.pct, 100) }, { v: Math.max(0, 100 - p.pct) }]} dataKey="v" innerRadius={26} outerRadius={40} startAngle={90} endAngle={-270} stroke="none" isAnimationActive={false}>
                <Cell fill={p.pct < 20 ? c.danger : p.pct < 50 ? c.serious : c.s1} />
                <Cell fill={c.shortage} />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="flex-1 space-y-0.5 text-xs">
          {cats.map(([k, v], i) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: colors[i] }} />
              {CATEGORY[k]}
              <b className={clsx('ml-auto font-mono', v < 20 && 'text-danger')}>{v}%</b>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-2 flex gap-1">
        <Can I="inventory" a="issue" scope={p.admin_code}>
          <button className="btn-primary px-2 py-1 text-xs" onClick={() => onIssue(p)}><PackageMinus size={12} /> Ra lệnh xuất kho</button>
        </Can>
        <Tel phone={p.phone} label="Thủ kho" />
      </div>
    </div>
  );
}

function SosPopup({ p, onDispatch }) {
  const pr = PRIORITY[p.priority];
  return (
    <div className="w-72">
      <div className="flex items-center gap-2">
        <b>{p.code}</b>
        <span className={clsx('chip', pr.cls)}>{pr.short}</span>
        <span className="chip bg-panel2">{SOS_STATUS[p.status]}</span>
      </div>
      <div className="mt-1 text-sm font-medium">{INCIDENT[p.incident_type]} · {p.trapped_count} người</div>
      <div className="text-xs text-muted">{p.address} · {SOURCE[p.source]} · {ago(p.received_at)}</div>
      {p.raw_message && <p className="mt-1 text-xs italic">“{p.raw_message}”</p>}
      {p.status !== 'thuc_thi' && (
        <Can I="dispatch" a="create" scope={p.admin_code}>
          <button className="btn-danger mt-2 px-2 py-1 text-xs" onClick={() => onDispatch(p)}><Send size={12} /> Điều phối lực lượng</button>
        </Can>
      )}
      <p className="mt-1 text-[11px] text-muted">Mẹo: kéo biểu tượng đội cứu hộ thả vào điểm SOS để điều động nhanh.</p>
    </div>
  );
}

export default function MapLayers({ data, layers, timeline, onDispatch, onCamera, onIssue }) {
  const map = useMap();
  const gps = useStore((s) => s.gps);
  const theme = useStore((s) => s.theme);
  const toast = useStore((s) => s.toast);
  const canDispatch = usePermission('dispatch', 'create');

  const openSos = useMemo(() => data?.sos.features || [], [data]);
  const floodFactor = timeline?.flood_factor ?? 1;

  // Kéo–thả đội cứu hộ vào điểm SOS → mở lệnh điều động
  const onForceDrop = (force, marker) => {
    const dropped = marker.getLatLng();
    const pt = map.latLngToContainerPoint(dropped);
    let best = null;
    for (const s of openSos) {
      const d = pt.distanceTo(map.latLngToContainerPoint(ll(s)));
      if (d < 48 && (!best || d < best.d)) best = { d, s };
    }
    marker.setLatLng(gps[force.id] || ll({ geometry: { coordinates: [force.lon, force.lat] } }));
    if (best) onDispatch(best.s.properties, force.id);
    else toast({ tone: 'info', title: 'Thả biểu tượng đội cứu hộ trùng lên một điểm SOS để điều động' });
  };

  if (!data) return null;
  const pos = (f) => gps[f.properties.id] || ll(f);

  return (
    <>
      {layers.roads && (
        <GeoJSON
          key={`roads-${theme}-${data.roads.features.filter((f) => f.properties.blocked).length}`}
          data={data.roads}
          style={(f) => ({ color: f.properties.blocked ? '#ef4444' : theme === 'dark' ? '#fbbf24' : '#b45309', weight: f.properties.blocked ? 4 : 2, opacity: 0.7, dashArray: f.properties.blocked ? '4 4' : undefined })}
          onEachFeature={(f, l) => l.bindTooltip(`${f.properties.road_name}${f.properties.blocked ? ' – đoạn bị chặn (vùng nguy hiểm)' : ''}`, { sticky: true })}
        />
      )}

      {/* Nhóm 2: vùng nguy hiểm */}
      {data.hazard_zones.features
        .filter((f) => (f.properties.type === 'ngap' ? layers.flood : layers.landslide))
        .map((f) => {
          const p = f.properties;
          const flood = p.type === 'ngap';
          const depthOpacity = flood ? Math.min(0.7, 0.2 + (p.depth_m || 0.5) * 0.2) * Math.min(1.4, floodFactor) : 0.25;
          return (
            <GeoJSON
              key={`${p.id}-${floodFactor}-${theme}`}
              data={f}
              style={{
                color: flood ? '#1d4ed8' : LEVEL[p.level].color,
                weight: flood ? 1 : 2,
                fillColor: flood ? '#2563eb' : LEVEL[p.level].color,
                fillOpacity: depthOpacity,
                dashArray: p.source === 'sensor' ? '5 4' : undefined,
              }}
            >
              <Popup>
                <b>{p.name}</b>
                <div className="text-xs text-muted">{flood ? `Độ sâu ngập ~${p.depth_m} m` : `Nguy cơ ${LEVEL[p.level].label}`} · nguồn: {p.source === 'sensor' ? 'cảm biến IoT (tự động)' : p.source === 'model' ? 'mô hình nội suy DEM' : 'thủ công'}</div>
                <div className="text-xs">Hiệu lực đến {new Date(p.valid_until).toLocaleString('vi-VN')}</div>
              </Popup>
            </GeoJSON>
          );
        })}

      {layers.hazardPoints &&
        data.hazard_points.features.map((f) => (
          <Marker key={f.properties.id} position={ll(f)} icon={hazardIcon(f.properties.type, f.properties.level)}>
            <Popup>
              <b>{f.properties.name}</b>
              <div className="text-xs text-muted">{ago(f.properties.reported_at)}</div>
              <p className="text-xs">{f.properties.description}</p>
            </Popup>
          </Marker>
        ))}

      {/* Nhóm 1: thủy văn – khí tượng */}
      {layers.stations &&
        data.stations.features.map((f) => {
          const p = f.properties;
          const value = timeline?.values?.[p.id] ?? p.value;
          const lv = alarmLevel(value, p.thresholds);
          const label = value == null ? undefined : p.type === 'muc_nuoc' ? value.toFixed(1) : p.type === 'luong_mua' ? Math.round(value) : value.toFixed(1);
          return (
            <Marker key={p.id} position={ll(f)} icon={stationIcon(p.type, lv, label)}>
              <Popup minWidth={290}><StationPopup p={{ ...p, value }} /></Popup>
            </Marker>
          );
        })}

      {layers.reservoirs &&
        data.reservoirs.features.map((f) => {
          const p = f.properties;
          return (
            <Marker key={p.id} position={ll(f)} icon={reservoirIcon(p.spill_gates_open)}>
              <Popup>
                <div className="w-60">
                  <b>{p.name}</b>
                  <div className="text-xs text-muted">Sông {p.river}{p.capacity_mw ? ` · ${p.capacity_mw} MW` : ''}</div>
                  <table className="mt-1 w-full text-xs">
                    <tbody>
                      <tr><td>Mực nước hồ</td><td className="text-right font-mono">{num(p.current_level, 2)} m</td></tr>
                      <tr><td>MNDBT</td><td className="text-right font-mono">{num(p.normal_level, 1)} m</td></tr>
                      <tr><td>Lưu lượng về</td><td className="text-right font-mono">{num(p.inflow_m3s)} m³/s</td></tr>
                      <tr><td>Lưu lượng xả</td><td className="text-right font-mono font-semibold">{num(p.outflow_m3s)} m³/s</td></tr>
                      <tr><td>Cửa xả mở</td><td className="text-right font-mono">{p.spill_gates_open}/{p.spill_gates}</td></tr>
                    </tbody>
                  </table>
                </div>
              </Popup>
            </Marker>
          );
        })}

      {/* Nhóm 3: lực lượng & vật tư */}
      {layers.warehouses &&
        data.warehouses.features.map((f) => (
          <Marker key={f.properties.id} position={ll(f)} icon={warehouseIcon(f.properties.pct)}>
            <Popup minWidth={260}><WarehousePopup p={f.properties} onIssue={onIssue} /></Popup>
          </Marker>
        ))}

      {layers.evac &&
        data.evacuation_sites.features.map((f) => {
          const p = f.properties;
          return (
            <Marker key={p.id} position={ll(f)} icon={evacIcon(p.current_occupancy / p.capacity)}>
              <Popup>
                <b>{p.name}</b>
                <div className="text-sm">Đang chứa: <b className="font-mono">{p.current_occupancy}/{p.capacity}</b> người</div>
                <Tel phone={p.contact_phone} />
              </Popup>
            </Marker>
          );
        })}

      {layers.vehicles &&
        data.vehicles.features.map((f) => {
          const p = f.properties;
          return (
            <Marker key={p.id} position={pos(f)} icon={vehicleIcon(p)}>
              <Popup>
                <b>{p.code}</b> – {VEHICLE[p.vehicle_type]}
                <div className="text-xs text-muted">{p.force_name}</div>
                <div className="text-xs">{RES_STATUS[p.status].label} · Nhiên liệu {p.fuel_level}%</div>
              </Popup>
            </Marker>
          );
        })}

      {layers.forces &&
        data.forces.features.map((f) => {
          const p = f.properties;
          return (
            <Marker
              key={p.id}
              position={pos(f)}
              icon={forceIcon(p.status)}
              draggable={canDispatch}
              eventHandlers={{ dragend: (e) => onForceDrop(p, e.target) }}
              zIndexOffset={500}
            >
              <Tooltip direction="top" offset={[0, -14]}>{p.name}</Tooltip>
              <Popup>
                <div className="w-64">
                  <b>{p.name}</b>
                  <div className="text-xs text-muted">{FORCE_TYPE[p.org_type]} · {p.commander}</div>
                  <div className="text-xs">Sẵn sàng {p.personnel_ready} · Nhiệm vụ {p.personnel_on_mission} · 📻 {p.radio_freq}</div>
                  <div className="mt-1 flex flex-wrap gap-1">{p.skills.map((s) => <span key={s} className="chip bg-panel2">{SKILL[s]}</span>)}</div>
                  <div className="mt-2"><Tel phone={p.contact_phone} label="Gọi chỉ huy" /></div>
                  <p className="mt-1 text-[11px] text-muted">Kéo biểu tượng này thả vào điểm SOS để điều động.</p>
                </div>
              </Popup>
            </Marker>
          );
        })}

      {layers.routes &&
        data.routes.features.map((f) => (
          <Polyline
            key={f.properties.id}
            positions={f.geometry.coordinates.map(([x, y]) => [y, x])}
            pathOptions={{ color: f.properties.route_safe ? '#22c55e' : '#f97316', weight: 4, dashArray: '10 6', opacity: 0.9 }}
          >
            <Tooltip sticky>{f.properties.force_name} → {f.properties.ticket_code} ({Math.round(f.properties.progress * 100)}%)</Tooltip>
          </Polyline>
        ))}

      {layers.cameras &&
        data.cameras.features.map((f) => (
          <Marker key={f.properties.id} position={ll(f)} icon={cameraIcon()}>
            <Popup>
              <b>{f.properties.name}</b>
              <div className="mt-1"><button className="btn-primary px-2 py-1 text-xs" onClick={() => onCamera(f.properties)}><Video size={12} /> Xem trực tiếp</button></div>
            </Popup>
          </Marker>
        ))}

      {/* Nhóm 4: SOS */}
      {layers.sos &&
        openSos.map((f) => {
          const p = f.properties;
          return (
            <Marker key={p.id} position={ll(f)} icon={sosIcon(p.priority, p.status)} zIndexOffset={1000}>
              <Popup minWidth={280}><SosPopup p={p} onDispatch={(t) => onDispatch(t)} /></Popup>
            </Marker>
          );
        })}
    </>
  );
}

/** Quỹ đạo bão/ATNĐ + vùng gió giật; vị trí tâm theo thanh thời gian. */
export function StormLayer({ offset }) {
  const { data } = useQuery({ queryKey: ['storm'], queryFn: () => api('/map/storm-track'), staleTime: 10 * 60_000 });
  if (!data) return null;
  const pts = data.points;
  const past = pts.filter((p) => !p.forecast).map((p) => [p.lat, p.lon]);
  const future = pts.filter((p, i) => p.forecast || i === pts.filter((x) => !x.forecast).length - 1).map((p) => [p.lat, p.lon]);
  const t = Date.now() + offset * 3600_000;
  const cur = pts.reduce((best, p) => (Math.abs(new Date(p.time) - t) < Math.abs(new Date(best.time) - t) ? p : best), pts[0]);
  return (
    <>
      <Polyline positions={past} pathOptions={{ color: '#a855f7', weight: 3 }} />
      <Polyline positions={future} pathOptions={{ color: '#a855f7', weight: 3, dashArray: '8 6' }} />
      {pts.map((p) => (
        <CircleMarker key={p.time} center={[p.lat, p.lon]} radius={4} pathOptions={{ color: '#a855f7', fillOpacity: 1 }}>
          <Tooltip>{new Date(p.time).toLocaleString('vi-VN', { hour: '2-digit', day: '2-digit', month: '2-digit' })} · {p.label} · gió {p.wind_kmh} km/h</Tooltip>
        </CircleMarker>
      ))}
      <Circle center={[cur.lat, cur.lon]} radius={cur.wind_kmh * 900} pathOptions={{ color: '#a855f7', weight: 1, fillOpacity: 0.08 }}>
        <Tooltip permanent direction="center" className="!bg-transparent !border-0 !shadow-none">🌀 {data.name.split('(')[0]}</Tooltip>
      </Circle>
    </>
  );
}
