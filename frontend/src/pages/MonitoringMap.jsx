import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, ScaleControl, ZoomControl } from 'react-leaflet';
import clsx from 'clsx';
import {
  Layers, Ruler, Route, PenTool, Circle as CircleIcon, Map as MapIcon, X, Siren, Radio, Megaphone, ChevronLeft, ChevronRight, Clock,
} from 'lucide-react';
import { api } from '../api/client';
import { useAreaQuery, useUnitsGeo } from '../api/hooks';
import { useStore } from '../app/store';
import MapLayers, { StormLayer } from '../components/map/MapLayers';
import { AdminBoundaries, AreaFocus, BASEMAPS, BaseLayer, DrawTool, FocusHandler, MeasureTool, RadarLayer, RouteTool } from '../components/map/MapTools';
import DispatchModal from '../components/common/DispatchModal';
import CameraModal from '../components/common/CameraModal';
import IssueModal from '../components/common/IssueModal';
import { ALARM, alarmLevel, INCIDENT, PRIORITY, STATION_TYPE } from '../utils/labels';
import { ago, int } from '../utils/format';

const LAYER_GROUPS = [
  {
    title: 'Thủy văn & Khí tượng',
    items: [
      ['stations', 'Trạm đo mưa, mực nước, cảm biến IoT'],
      ['reservoirs', 'Hồ chứa & đập thủy điện'],
      ['radar', 'Radar mưa thời gian thực'],
      ['storm', 'Quỹ đạo bão / áp thấp'],
    ],
  },
  {
    title: 'Cảnh báo & Vùng nguy hiểm',
    items: [
      ['flood', 'Vùng ngập lụt'],
      ['landslide', 'Vùng sạt lở / lũ quét'],
      ['hazardPoints', 'Điểm nóng sạt lở, sự cố giao thông – hạ tầng'],
      ['roads', 'Mạng đường & đoạn bị chặn'],
    ],
  },
  {
    title: 'Lực lượng & Vật tư',
    items: [
      ['forces', 'Lực lượng cứu hộ (GPS)'],
      ['vehicles', 'Xuồng, xe, thiết bị'],
      ['routes', 'Lộ trình đang điều động'],
      ['warehouses', 'Kho vật tư'],
      ['evac', 'Điểm sơ tán an toàn'],
      ['cameras', 'Camera CCTV'],
    ],
  },
  { title: 'Yêu cầu cứu hộ', items: [['sos', 'Điểm SOS từ người dân / cảm biến']] },
  { title: 'Nền hành chính', items: [['admin', 'Ranh giới xã/phường (xấp xỉ)']] },
];

const DEFAULT_LAYERS = {
  stations: true, reservoirs: true, radar: false, storm: false, flood: true, landslide: true, hazardPoints: true, roads: false,
  forces: true, vehicles: false, routes: true, warehouses: true, evac: false, cameras: true, sos: true, admin: true,
};

export default function MonitoringMap() {
  const navigate = useNavigate();
  const { filter, setAlertDraft } = useStore();
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [basemap, setBasemap] = useState('auto');
  const [tool, setTool] = useState(null); // measure | route | polygon | circle
  const [offset, setOffset] = useState(0);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [dispatch, setDispatch] = useState(null);
  const [camera, setCamera] = useState(null);
  const [issue, setIssue] = useState(null);
  const [drawn, setDrawn] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);

  const { data } = useAreaQuery('map-layers', '/map/layers', {}, { refetchInterval: 30_000 });
  const { data: area } = useAreaQuery('area', '/admin-units/area', {}, { staleTime: Infinity });
  const { data: unitsGeo } = useUnitsGeo();
  const { data: timeline } = useQuery({
    queryKey: ['timeline', offset],
    queryFn: () => api('/map/timeline', { params: { offset_h: offset } }),
    enabled: offset !== 0,
  });

  const onDrawn = useCallback(async (polygon) => {
    setTool(null);
    setDrawn({ polygon, stats: null });
    const stats = await api('/map/area-stats', { method: 'POST', body: { polygon } });
    setDrawn({ polygon, stats });
  }, []);

  const toggleTool = (t) => {
    setTool((cur) => (cur === t ? null : t));
    setRouteInfo(null);
  };

  const sos = data?.sos.features.map((f) => f.properties).sort((a, b) => a.priority - b.priority || new Date(a.received_at) - new Date(b.received_at)) || [];
  const sensorAlerts = data?.stations.features.map((f) => f.properties).filter((p) => alarmLevel(p.value, p.thresholds) > 0) || [];
  const setFocus = useStore((s) => s.setFocus);

  return (
    <div className="relative h-[calc(100vh-3.5rem)] w-full">
      <MapContainer center={[22.75, 106.05]} zoom={9} zoomControl={false} zoomSnap={0.25} className="h-full w-full">
        <BaseLayer basemap={basemap} />
        {layers.radar && <RadarLayer />}
        <ZoomControl position="bottomright" />
        <ScaleControl position="bottomleft" imperial={false} />
        {layers.admin && <AdminBoundaries geo={unitsGeo} />}
        <AreaFocus
          area={area}
          filtered={filter.codes.length > 0}
          padding={{ topLeft: [leftOpen ? 300 : 40, 20], bottomRight: [rightOpen ? 350 : 50, 80] }}
        />
        {layers.storm && <StormLayer offset={offset} />}
        <MapLayers
          data={data}
          layers={layers}
          timeline={offset !== 0 ? timeline : null}
          onDispatch={(ticket, forceId) => setDispatch({ ticket, forceId })}
          onCamera={setCamera}
          onIssue={setIssue}
        />
        <FocusHandler />
        <DrawTool mode={tool === 'polygon' || tool === 'circle' ? tool : null} onDrawn={onDrawn} />
        <MeasureTool active={tool === 'measure'} />
        <RouteTool active={tool === 'route'} onResult={setRouteInfo} />
      </MapContainer>

      {/* Bảng lớp dữ liệu – trái */}
      <div className={clsx('absolute left-3 top-3 z-[1000] flex max-h-[calc(100%-8rem)] transition-all', !leftOpen && '-translate-x-[calc(100%-2.25rem)]')}>
        <div className="card w-72 overflow-y-auto p-3 shadow-xl scroll-thin">
          <div className="mb-2 flex items-center gap-2 font-semibold"><Layers size={16} /> Lớp dữ liệu</div>
          {LAYER_GROUPS.map((g) => (
            <div key={g.title} className="mb-2">
              <div className="mb-1 text-[11px] font-semibold uppercase text-muted">{g.title}</div>
              {g.items.map(([key, label]) => (
                <label key={key} className="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
                  <input type="checkbox" checked={layers[key]} onChange={(e) => setLayers((l) => ({ ...l, [key]: e.target.checked }))} className="accent-[rgb(var(--accent))]" />
                  {label}
                </label>
              ))}
            </div>
          ))}
        </div>
        <button className="card ml-1 h-9 w-8 self-start shadow" onClick={() => setLeftOpen((o) => !o)} aria-label="Thu gọn">
          {leftOpen ? <ChevronLeft size={16} className="mx-auto" /> : <ChevronRight size={16} className="mx-auto" />}
        </button>
      </div>

      {/* Công cụ bản đồ – phải trên */}
      <div className={clsx('absolute top-3 z-[1000] flex flex-col items-end gap-2 transition-all', rightOpen ? 'right-[24rem]' : 'right-14')}>
        <div className="card flex gap-1 p-1 shadow-xl">
          <select className="input w-auto border-0 py-1 text-xs" value={basemap} onChange={(e) => setBasemap(e.target.value)} title="Nền bản đồ" aria-label="Nền bản đồ">
            <option value="auto">Nền: theo giao diện</option>
            {Object.entries(BASEMAPS).map(([k, b]) => <option key={k} value={k}>{b.label}</option>)}
          </select>
          {[
            ['measure', Ruler, 'Đo khoảng cách'],
            ['route', Route, 'Tìm đường an toàn A → B'],
            ['polygon', PenTool, 'Khoanh vùng đa giác'],
            ['circle', CircleIcon, 'Khoanh vùng tròn'],
          ].map(([t, Icon, label]) => (
            <button key={t} className={clsx('btn px-2', tool === t ? 'bg-accent text-white' : 'text-ink-2 hover:bg-panel2')} onClick={() => toggleTool(t)} title={label} aria-label={label}>
              <Icon size={16} />
            </button>
          ))}
        </div>
        {tool && (
          <div className="card px-3 py-2 text-xs shadow-xl">
            {tool === 'measure' && 'Click lên bản đồ để thêm điểm đo. Bấm lại nút thước để xoá.'}
            {tool === 'route' && (routeInfo
              ? <span>Lộ trình <b>{routeInfo.distance_km} km</b> · ~<b>{routeInfo.duration_min} phút</b> · {routeInfo.safe ? <span className="text-good">an toàn</span> : <span className="text-danger">buộc qua vùng nguy hiểm</span>}<br />{routeInfo.roads.join(' → ')}</span>
              : 'Click chọn điểm A (lực lượng) rồi điểm B (cần cứu hộ).')}
            {(tool === 'polygon' || tool === 'circle') && 'Vẽ vùng nguy cơ: hệ thống đếm hộ dân và soạn tin cảnh báo sơ tán.'}
          </div>
        )}
        {drawn && (
          <div className="card w-72 p-3 shadow-xl">
            <div className="mb-1 flex items-center justify-between font-semibold"><span>Phân tích vùng khoanh</span><button onClick={() => setDrawn(null)} aria-label="Đóng"><X size={14} /></button></div>
            {!drawn.stats ? <div className="text-xs text-muted">Đang truy vấn không gian…</div> : (
              <>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <div>Diện tích</div><b className="text-right font-mono">{int(drawn.stats.area_km2)} km²</b>
                  <div>Dân số ước tính</div><b className="text-right font-mono">{int(drawn.stats.population)}</b>
                  <div>Hộ dân</div><b className="text-right font-mono">{int(drawn.stats.households)}</b>
                  <div>Thuê bao di động</div><b className="text-right font-mono">{int(drawn.stats.subscribers)}</b>
                  <div>SOS đang mở</div><b className="text-right font-mono">{drawn.stats.sos_open}</b>
                  <div>Chỗ trống sơ tán</div><b className="text-right font-mono">{int(drawn.stats.evac_free)}</b>
                </div>
                <button className="btn-danger mt-2 w-full justify-center" onClick={() => { setAlertDraft(drawn); navigate('/canh-bao'); }}>
                  <Megaphone size={15} /> Soạn cảnh báo sơ tán cho vùng này
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Bảng cảnh báo khẩn cấp – phải */}
      <div className={clsx('absolute right-3 top-3 z-[1000] flex h-[calc(100%-7.5rem)] transition-all', !rightOpen && 'translate-x-[calc(100%-2.25rem)]')}>
        <button className="card mr-1 h-9 w-8 self-start shadow" onClick={() => setRightOpen((o) => !o)} aria-label="Thu gọn">
          {rightOpen ? <ChevronRight size={16} className="mx-auto" /> : <ChevronLeft size={16} className="mx-auto" />}
        </button>
        <div className="card flex w-80 flex-col overflow-hidden shadow-xl">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2 font-semibold">
            <Siren size={16} className="text-danger" /> Cảnh báo khẩn cấp
            <span className="chip ml-auto bg-danger text-white">{sos.length} SOS</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 scroll-thin">
            {sos.map((s) => (
              <button key={s.id} className="mb-1.5 w-full rounded-lg border border-line p-2 text-left hover:bg-panel2" onClick={() => setFocus({ lat: s.lat, lon: s.lon, zoom: 14, label: s.code })}>
                <div className="flex items-center gap-2">
                  <span className={clsx('h-2.5 w-2.5 rounded-full', s.status === 'moi' && 'animate-blink', { 1: 'bg-danger', 2: 'bg-serious', 3: 'bg-warn' }[s.priority])} />
                  <b className="text-sm">{s.code}</b>
                  <span className="text-xs text-muted">{PRIORITY[s.priority].short}</span>
                  <span className="ml-auto text-[11px] text-muted">{ago(s.received_at)}</span>
                </div>
                <div className="text-xs">{INCIDENT[s.incident_type]} · {s.trapped_count} người · {s.address}</div>
                {s.status === 'moi' && (
                  <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-danger" onClick={(e) => { e.stopPropagation(); setDispatch({ ticket: s }); }}>
                    → Điều phối ngay
                  </span>
                )}
              </button>
            ))}
            {sensorAlerts.length > 0 && <div className="mb-1 mt-2 flex items-center gap-1 text-[11px] font-semibold uppercase text-muted"><Radio size={12} /> Cảm biến vượt ngưỡng</div>}
            {sensorAlerts.map((p) => {
              const lv = alarmLevel(p.value, p.thresholds);
              return (
                <button key={p.id} className="mb-1 w-full rounded-lg border border-line p-2 text-left hover:bg-panel2" onClick={() => setFocus({ lat: p.lat, lon: p.lon, zoom: 13, label: p.name })}>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={clsx('chip', ALARM[lv].cls)}>{ALARM[lv].label}</span>
                    <span className="text-muted">{STATION_TYPE[p.type]}</span>
                  </div>
                  <div className="text-xs">{p.name}: <b className="font-mono">{p.value?.toFixed(2)} {p.unit}</b></div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Thanh thời gian – dưới */}
      <div className="card absolute bottom-3 left-1/2 z-[1000] w-[min(640px,calc(100%-7rem))] -translate-x-1/2 px-4 py-2 shadow-xl">
        <div className="flex items-center gap-3">
          <Clock size={16} className="text-accent" />
          <input type="range" min={-12} max={24} step={1} value={offset} onChange={(e) => setOffset(Number(e.target.value))} className="flex-1 accent-[rgb(var(--accent))]" aria-label="Thanh thời gian" />
          <span className="w-44 text-right text-xs">
            {offset === 0 ? <b>Hiện tại (thời gian thực)</b> : (
              <>
                <b>{offset > 0 ? `+${offset}h · dự báo` : `${offset}h · đã qua`}</b>
                <span className="block text-muted">{new Date(Date.now() + offset * 3600_000).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</span>
              </>
            )}
          </span>
          {offset !== 0 && <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setOffset(0)}>Về hiện tại</button>}
        </div>
        <div className="flex justify-between text-[10px] text-muted"><span>−12h</span><span>Hiện tại</span><span>+24h (mực nước HEC-HMS, bão)</span></div>
      </div>

      {!data && <div className="absolute inset-0 z-[900] flex items-center justify-center bg-bg/40"><MapIcon className="animate-pulse text-muted" /></div>}

      {dispatch && <DispatchModal ticket={dispatch.ticket} presetForceId={dispatch.forceId} onClose={() => setDispatch(null)} />}
      <CameraModal camera={camera} onClose={() => setCamera(null)} />
      <IssueModal warehouse={issue} onClose={() => setIssue(null)} />
    </div>
  );
}
