import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, ScaleControl, ZoomControl, useMapEvents } from 'react-leaflet';
import clsx from 'clsx';
import { BellRing, ChevronLeft, ChevronRight, Clock, Info, Layers, Map as MapIcon, RefreshCw, Siren, Wrench } from 'lucide-react';
import { api } from '../api/client';
import { useAreaQuery, useUnitsGeo } from '../api/hooks';
import { useStore } from '../app/store';
import MapLayers, { floodScenarioStates, StormLayer, stormQuery } from '../components/map/MapLayers';
import MapLegend from '../components/map/MapLegend';
import {
  AlertsList, DEFAULT_LAYERS, DrawnStats, LAYER_GROUPS, LAYER_ORDER, LayerList, layerCounts, Sheet, TimeControl, ToolHint, toolList,
} from '../components/map/MapPanels';
import IncidentModal from '../components/map/IncidentModal';
import StormBulletinModal from '../components/map/StormBulletinModal';
import OccupancyModal from '../components/common/OccupancyModal';
import { AdminBoundaries, AreaFocus, BASEMAPS, BaseLayer, DrawTool, FocusHandler, ForecastChoropleth, MeasureTool, RadarLayer, RAIN_BINS, RouteTool } from '../components/map/MapTools';
import DispatchModal from '../components/common/DispatchModal';
import CameraModal from '../components/common/CameraModal';
import IssueModal from '../components/common/IssueModal';
import QuickActionBar from '../components/common/QuickActionBar';
import { ErrorState } from '../components/common/ui';
import SituationBar from '../components/dashboard/SituationBar';
import ConnectionBanner from '../components/dashboard/ConnectionBanner';
import QuickIncidentModal from '../components/dashboard/QuickIncidentModal';
import { usePermission } from '../rbac/usePermission';
import { alarmLevel } from '../utils/labels';
import { time } from '../utils/format';
import { fmtVn } from '../utils/bulletin';
import { useMediaQuery } from '../utils/useMediaQuery';
import { useOnline } from '../utils/useOnline';

/** Chạm một điểm trên bản đồ khi công cụ "Đánh dấu sự cố" đang bật. */
function PickPoint({ active, onPick }) {
  useMapEvents({ click: (e) => active && onPick({ lat: e.latlng.lat, lon: e.latlng.lng }) });
  return null;
}

const floatCard = 'card border border-line bg-panel/95 shadow-2xl backdrop-blur-md';
const roundBtn = 'card flex flex-col items-center justify-center gap-0.5 border border-line bg-panel/95 text-[10px] font-bold text-ink-2 shadow-lg backdrop-blur-md active:scale-95';

/**
 * Bản đồ giám sát tương tác (thiết kế B). Bản đồ chiếm trọn vùng nội dung; dải tình huống (dùng chung Dashboard) luôn ở
 * trên cùng. Hai bố cục:
 * - Máy tính (≥ 1024 px): bảng nổi — Lớp dữ liệu (trái, mở sẵn khi màn ≥ 1440 px), Cảnh báo khẩn cấp (phải), công cụ
 *   (phải trên), thanh thời gian (đáy), chú giải (trái dưới).
 * - Điện thoại / máy tính bảng: bản đồ toàn màn; thanh dưới cùng Lớp · Cảnh báo · Báo SOS · Thời gian · Gọi 112 (vùng
 *   ngón cái), mỗi nút mở một bảng trượt từ đáy; Công cụ, Chú giải ở góc phải trên. Nút ≥ 44 px.
 * Lớp / thẻ không có quyền xem (SOS, nguồn lực, phản ánh) bị ẩn — API trả rỗng, không được hiện như "không có sự cố".
 */
export default function MonitoringMap() {
  const navigate = useNavigate();
  const { filter, setAlertDraft, setFocus } = useStore();
  const wide = useMediaQuery('(min-width: 1024px)');
  const roomy = useMediaQuery('(min-width: 1440px)');
  const online = useOnline();
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [basemap, setBasemap] = useState('auto');
  const [tool, setTool] = useState(null); // measure | route | polygon | circle | incident
  const [offset, setOffset] = useState(0);
  const [leftOpen, setLeftOpen] = useState(roomy); // laptop 1366 px: bảng lớp thu gọn sẵn để bản đồ đủ rộng
  const [rightOpen, setRightOpen] = useState(true);
  const [legendOpen, setLegendOpen] = useState(false);
  const [sheet, setSheet] = useState(null); // điện thoại / máy tính bảng: layers | alerts | time | tools | legend
  const [dispatch, setDispatch] = useState(null);
  const [camera, setCamera] = useState(null);
  const [issue, setIssue] = useState(null);
  const [drawn, setDrawn] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [incident, setIncident] = useState(null); // { lat, lon, report? } → form đánh dấu sự cố
  const [stormForm, setStormForm] = useState(false);
  const [occupancy, setOccupancy] = useState(null); // điểm sơ tán đang cập nhật số người
  const [rightTab, setRightTab] = useState('sos'); // sos | sensors
  const [reportOpen, setReportOpen] = useState(false);

  const canSos = usePermission('sos', 'view');
  const canResource = usePermission('resource', 'view');
  const canReports = usePermission('report', 'view');
  const canReport = usePermission('sos', 'create');
  const canDispatch = usePermission('dispatch', 'create');
  const canStorm = usePermission('monitoring', 'update', '*');
  const canIncident = usePermission('incident', 'update');
  const canImportStations = usePermission('data', 'import');
  const canSystem = usePermission('integration', 'view');

  const layersQ = useAreaQuery('map-layers', '/map/layers', {}, { refetchInterval: 30_000 });
  const data = layersQ.data;
  // Dải tình huống: cùng truy vấn (cùng bộ nhớ đệm) với Dashboard → cùng số, cùng màu
  const kQ = useAreaQuery('kpis', '/dashboard/kpis', {}, { refetchInterval: 30_000 });
  const stationsQ = useAreaQuery('stations', '/stations');
  const waterStations = useMemo(() => (stationsQ.data || []).filter((s) => s.type === 'muc_nuoc'), [stationsQ.data]);
  const { data: area } = useAreaQuery('area', '/admin-units/area', {}, { staleTime: Infinity });
  const { data: unitsGeo } = useUnitsGeo();
  const { data: fcAreas } = useAreaQuery('forecast-areas', '/forecast/areas', { hours: 24 }, { enabled: layers.forecast, refetchInterval: 10 * 60_000 });
  const { data: timeline } = useQuery({
    queryKey: ['timeline', offset],
    queryFn: () => api('/map/timeline', { params: { offset_h: offset } }),
    enabled: offset !== 0,
  });
  // Lớp chưa có nguồn dữ liệu thật (API 404) → khoá nút và ghi rõ lý do: bật lên mà trống dễ bị hiểu là "không có bão"
  const storm = useQuery(stormQuery);
  const scenarioStates = useMemo(() => floodScenarioStates(data, offset !== 0 ? timeline : null), [data, offset, timeline]);
  const unavailable = {
    storm: storm.isError ? storm.error?.message || 'Chưa có bản tin bão đang theo dõi' : null,
    roads: data && !data.roads?.features?.length ? 'Chưa có dữ liệu mạng đường' : null, // chạy thật chưa nhập mạng đường
    floodScenario: data && !scenarioStates.length ? 'Chưa nhập bản đồ ngập theo kịch bản' : null,
  };
  // Ghi chú dưới tên lớp (không khoá lớp): vùng kịch bản nào đang hiện theo mực nước tại thời điểm đang xem
  const unknownLevels = scenarioStates.filter((x) => x.level == null).length;
  const notes = {
    floodScenario: scenarioStates.length
      ? `${scenarioStates.filter((x) => x.active).length}/${scenarioStates.length} vùng đang ngập theo mực nước ${offset ? `lúc ${fmtVn(Date.now() + offset * 3600_000)}` : 'hiện tại'}${unknownLevels ? ` · ${unknownLevels} vùng chưa có số đo trạm` : ''}`
      : null,
  };
  const counts = useMemo(() => layerCounts(data), [data]);
  const permOk = { sos: canSos, resource: canResource, report: canReports };
  const groups = LAYER_GROUPS.map((g) => ({ ...g, items: g.items.filter((it) => !it.perm || permOk[it.perm]) })).filter((g) => g.items.length);

  const onDrawn = useCallback(async (polygon) => {
    setTool(null);
    setDrawn({ polygon, stats: null });
    const stats = await api('/map/area-stats', { method: 'POST', body: { polygon } });
    setDrawn({ polygon, stats });
  }, []);

  const toggleTool = (t) => {
    setTool((cur) => (cur === t ? null : t));
    setRouteInfo(null);
    setSheet(null);
  };
  const toggleSheet = (s) => setSheet((cur) => (cur === s ? null : s));

  const sos = useMemo(
    () => data?.sos.features.map((f) => f.properties).sort((a, b) => a.priority - b.priority || new Date(a.received_at) - new Date(b.received_at)) || [],
    [data],
  );
  const stationList = data?.stations.features.map((f) => f.properties) || [];
  const sensorAlerts = stationList.filter((p) => !p.stale && p.value != null && alarmLevel(p.value, p.thresholds) > 0);
  const silentStations = stationList.filter((p) => p.stale); // mất tín hiệu — thiết bị hay hỏng đúng lúc lũ về
  const noDataCount = stationList.filter((p) => p.value == null).length;
  const alertCount = canSos ? sos.length : sensorAlerts.length + silentStations.length;

  const setAllLayers = (val) => {
    const next = {};
    Object.keys(DEFAULT_LAYERS).forEach((k) => { next[k] = val; });
    setLayers(next);
  };
  const layerActions = (
    <div className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px]">
      <button type="button" onClick={() => setAllLayers(true)} className={clsx('px-1.5 font-medium text-muted hover:text-accent', !wide && 'min-h-[44px]')}>Bật hết</button>
      <span className="text-muted/40" aria-hidden="true">·</span>
      <button type="button" onClick={() => setLayers(DEFAULT_LAYERS)} className={clsx('px-1.5 font-medium text-muted hover:text-accent', !wide && 'min-h-[44px]')}>Mặc định</button>
    </div>
  );
  const layerList = (
    <LayerList
      groups={groups}
      layers={layers}
      setLayers={setLayers}
      unavailable={unavailable}
      notes={notes}
      counts={counts}
      canStorm={canStorm}
      onStorm={() => setStormForm(true)}
      touch={!wide}
    />
  );
  const alertsList = (
    <AlertsList
      tab={rightTab}
      setTab={setRightTab}
      sos={sos}
      sensorAlerts={sensorAlerts}
      silentStations={silentStations}
      noDataCount={noDataCount}
      canSos={canSos}
      canDispatch={canDispatch}
      // Điện thoại: chạm một mục → đóng bảng để thấy chỗ bản đồ bay tới
      onFocus={(f) => { setFocus(f); if (!wide) setSheet(null); }}
      onDispatch={(s) => setDispatch({ ticket: s })}
      touch={!wide}
    />
  );
  const tools = toolList(canIncident);
  const basemapSelect = (cls) => (
    <select className={cls} value={basemap} onChange={(e) => setBasemap(e.target.value)} title="Nền bản đồ" aria-label="Nền bản đồ">
      <option value="auto">Nền: Theo giao diện</option>
      {Object.entries(BASEMAPS).map(([key, b]) => <option key={key} value={key}>{b.label}</option>)}
    </select>
  );
  const drawnCard = drawn && (
    <DrawnStats
      drawn={drawn}
      onClose={() => setDrawn(null)}
      onAlert={() => { setAlertDraft(drawn); navigate('/canh-bao'); }}
      touch={!wide}
      className={wide ? 'w-[19rem]' : 'w-full'}
    />
  );
  const dataTime = layersQ.dataUpdatedAt || null;

  return (
    <div
      className={clsx(
        'flex h-[calc(100vh-3.5rem)] w-full flex-col [@supports(height:100dvh)]:h-[calc(100dvh-3.5rem)]',
        // Màn hẹp: chừa chỗ cho thanh thao tác dưới cùng (cố định) — nút thu phóng, bảng trượt nằm trên thanh
        !wide && 'pb-[calc(4.3rem+env(safe-area-inset-bottom))]',
      )}
    >
      {/* 0. Thông tin khẩn luôn trên cùng: dải tình huống (cùng số với Dashboard) + mất mạng / không cập nhật được */}
      <div className="shrink-0">
        {kQ.data && (
          <SituationBar
            compact
            k={kQ.data}
            waterStations={waterStations}
            stationsError={stationsQ.isError && !stationsQ.data}
            rainKnown={kQ.data?.rain?.avg_24h != null}
            canReport={canReport}
            onReport={() => setReportOpen(true)}
            canSos={canSos}
            canImportStations={canImportStations}
            canSystem={canSystem}
          />
        )}
        <div className="px-2 pt-2 empty:hidden">
          <ConnectionBanner updatedAt={dataTime} />
        </div>
        {online && data && layersQ.isError && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel2 px-3 py-1.5 text-xs text-ink" role="status">
            <span className="min-w-0 flex-1">
              <b>Không cập nhật được các lớp bản đồ</b> — đang hiện số liệu lúc {time(dataTime)}.
            </span>
            <button type="button" className="btn-ghost min-h-[36px] px-2.5 text-xs" onClick={() => layersQ.refetch()}>
              <RefreshCw size={13} aria-hidden="true" /> Thử lại
            </button>
          </div>
        )}
      </div>

      {/* Vùng bản đồ: `isolate` giữ z-index của Leaflet bên trong, không đè thanh thao tác / hộp thoại */}
      <div className="relative isolate min-h-0 w-full flex-1 select-none overflow-hidden">
        <MapContainer center={[22.75, 106.05]} zoom={9} zoomControl={false} zoomSnap={0.25} className="h-full w-full">
          <BaseLayer basemap={basemap} />
          {layers.radar && <RadarLayer />}
          <ZoomControl position="bottomright" />
          <ScaleControl position="bottomleft" imperial={false} />
          {layers.forecast && <ForecastChoropleth geo={unitsGeo} areas={fcAreas} />}
          {layers.admin && <AdminBoundaries geo={unitsGeo} basemap={basemap} />}
          <AreaFocus
            area={area}
            filtered={filter.codes.length > 0}
            padding={wide
              ? { topLeft: [leftOpen ? 300 : 60, 30], bottomRight: [rightOpen ? 350 : 60, 100] }
              : { topLeft: [16, 16], bottomRight: [16, 16] }}
          />
          {layers.storm && !unavailable.storm && <StormLayer offset={offset} />}
          <MapLayers
            data={data}
            layers={layers}
            timeline={offset !== 0 ? timeline : null}
            onDispatch={(ticket, forceId) => setDispatch({ ticket, forceId })}
            onCamera={setCamera}
            onIssue={setIssue}
            onIncident={setIncident}
            onOccupancy={setOccupancy}
          />
          <PickPoint active={tool === 'incident'} onPick={(pt) => { setTool(null); setIncident(pt); }} />
          <FocusHandler />
          <DrawTool mode={tool === 'polygon' || tool === 'circle' ? tool : null} onDrawn={onDrawn} />
          <MeasureTool active={tool === 'measure'} />
          <RouteTool active={tool === 'route'} onResult={setRouteInfo} />
        </MapContainer>

        {wide ? (
          <>
            {/* Bảng lớp dữ liệu – Trái (thu gọn: chỉ còn nút có chữ, không để dải trắng mép bản đồ) */}
            <div className="pointer-events-none absolute bottom-[8rem] left-3 top-3 z-[1000] flex items-start">
              {leftOpen && (
                <div className={clsx(floatCard, 'pointer-events-auto flex max-h-full w-[18rem] flex-col overflow-hidden')}>
                  <div className="flex items-center justify-between border-b border-line bg-panel2/40 px-3.5 py-2">
                    <div className="flex items-center gap-2 text-sm font-bold text-ink">
                      <Layers size={16} className="text-accent" aria-hidden="true" />
                      <span className="whitespace-nowrap">Lớp dữ liệu</span>
                    </div>
                    {layerActions}
                  </div>
                  <div className="scroll-thin flex-1 overflow-y-auto p-3">{layerList}</div>
                </div>
              )}
              <button
                type="button"
                className={clsx(floatCard, 'pointer-events-auto flex h-10 items-center justify-center gap-1.5 text-xs font-semibold text-ink-2 hover:bg-panel2', leftOpen ? 'ml-1.5 w-8' : 'px-3')}
                onClick={() => setLeftOpen((o) => !o)}
                aria-expanded={leftOpen}
                aria-label={leftOpen ? 'Thu gọn bảng lớp dữ liệu' : undefined}
                title={leftOpen ? 'Thu gọn' : undefined}
              >
                {leftOpen ? <ChevronLeft size={16} /> : <><Layers size={16} className="text-accent" aria-hidden="true" /> Lớp dữ liệu</>}
              </button>
            </div>

            {/* Phải: công cụ bản đồ (góc phải trên) xếp ngay cạnh bảng Cảnh báo khẩn cấp — cùng một hàng, tự nhường chỗ */}
            <div className="pointer-events-none absolute bottom-[7.5rem] right-3 top-3 z-[1000] flex items-start gap-2">
              <div className="pointer-events-auto flex flex-col items-end gap-2">
                <div className={clsx(floatCard, 'flex items-center gap-1 p-1.5')}>
                  {basemapSelect('input w-auto border-0 bg-transparent px-2 py-1 text-xs focus:ring-0')}
                  <div className="mx-0.5 h-4 w-px bg-line/80" aria-hidden="true" />
                  {tools.map(([t, Icon, label]) => (
                    <button
                      key={t}
                      type="button"
                      className={clsx('btn h-9 w-9 justify-center rounded-lg p-0 text-xs transition-colors', tool === t ? 'bg-accent text-white shadow-sm' : 'text-ink-2 hover:bg-panel2')}
                      onClick={() => toggleTool(t)}
                      title={label}
                      aria-label={label}
                      aria-pressed={tool === t}
                    >
                      <Icon size={16} />
                    </button>
                  ))}
                </div>
                {tool && <ToolHint tool={tool} routeInfo={routeInfo} onClose={() => setTool(null)} className="max-w-xs" />}
                {drawnCard}
              </div>
              <div className="pointer-events-auto flex h-full items-start">
                <button
                  type="button"
                  className={clsx(floatCard, 'flex h-10 items-center justify-center gap-1.5 text-xs font-semibold hover:bg-panel2', rightOpen ? 'mr-1.5 w-8 text-ink-2' : 'px-3 text-danger')}
                  onClick={() => setRightOpen((o) => !o)}
                  aria-expanded={rightOpen}
                  aria-label={rightOpen ? 'Thu gọn bảng cảnh báo khẩn cấp' : undefined}
                  title={rightOpen ? 'Thu gọn' : undefined}
                >
                  {rightOpen ? <ChevronRight size={16} /> : <><Siren size={16} aria-hidden="true" /> Cảnh báo{alertCount > 0 && ` (${alertCount})`}</>}
                </button>
                {rightOpen && (
                  <div className={clsx(floatCard, 'flex h-full w-[20rem] flex-col overflow-hidden')}>
                    <div className="flex items-center justify-between border-b border-line px-3 py-2">
                      <div className="flex items-center gap-1.5 text-sm font-bold text-danger">
                        <Siren size={16} aria-hidden="true" /> Cảnh báo khẩn cấp
                      </div>
                      {canSos && <span className="chip bg-danger text-[11px] font-bold text-white">{sos.length} SOS</span>}
                    </div>
                    {alertsList}
                  </div>
                )}
              </div>
            </div>

            {/* Chú giải – Trái dưới */}
            <div className="absolute bottom-9 left-3 z-[1000] flex flex-col items-start gap-2">
              {legendOpen && (
                <div className={clsx(floatCard, 'scroll-thin max-h-[min(28rem,calc(100vh-14rem))] w-[19rem] overflow-y-auto p-3')}>
                  <MapLegend layers={layers} order={LAYER_ORDER} />
                </div>
              )}
              {!legendOpen && layers.forecast && (
                <div className={clsx(floatCard, 'p-2.5 text-xs')}>
                  <div className="mb-1 font-bold text-ink">Mưa dự báo 24 giờ tới (P50)</div>
                  <div className="space-y-1">
                    {RAIN_BINS.map((b) => (
                      <div key={b.label} className="flex items-center gap-2">
                        <span className="h-3 w-5 rounded-sm shadow-sm" style={{ background: b.color }} aria-hidden="true" />
                        <span>{b.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button
                type="button"
                className={clsx(floatCard, 'flex min-h-[34px] items-center gap-1.5 px-3 text-xs font-semibold text-ink-2 hover:bg-panel2')}
                onClick={() => setLegendOpen((o) => !o)}
                aria-expanded={legendOpen}
              >
                <Info size={14} className="text-accent" aria-hidden="true" /> {legendOpen ? 'Ẩn chú giải' : 'Chú giải'}
              </button>
            </div>

            {/* Thanh thời gian – Đáy */}
            <div className={clsx(floatCard, 'absolute bottom-3 left-1/2 z-[1000] w-[min(600px,calc(100%-14rem))] -translate-x-1/2 px-4 py-2')}>
              <TimeControl offset={offset} setOffset={setOffset} />
            </div>
          </>
        ) : (
          <>
            {/* Góc phải trên: Công cụ, Chú giải (nút 48 px) */}
            <div className="absolute right-2 top-2 z-[1000] flex flex-col gap-2">
              <button type="button" className={clsx(roundBtn, 'h-12 w-12', (sheet === 'tools' || tool) && '!bg-accent !text-white')} onClick={() => toggleSheet('tools')} aria-pressed={sheet === 'tools'}>
                <Wrench size={18} aria-hidden="true" /> Công cụ
              </button>
              <button type="button" className={clsx(roundBtn, 'h-12 w-12', sheet === 'legend' && '!bg-accent !text-white')} onClick={() => toggleSheet('legend')} aria-pressed={sheet === 'legend'}>
                <Info size={18} aria-hidden="true" /> Chú giải
              </button>
            </div>

            {/* Trên cùng bên trái: đang xem thời điểm khác, công cụ đang dùng, kết quả khoanh vùng */}
            <div className="absolute left-2 right-[4.25rem] top-2 z-[1000] flex flex-col items-start gap-2">
              {offset !== 0 && (
                <div className={clsx(floatCard, 'flex w-full items-center gap-2 px-3 py-1.5 text-xs')} role="status">
                  <Clock size={14} className="shrink-0 text-accent" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    Đang xem <b className="text-accent">{offset > 0 ? `+${offset}h · dự báo` : `${offset}h · đã qua`}</b>
                  </span>
                  <button type="button" className="min-h-[40px] shrink-0 rounded-lg px-2 font-semibold text-accent hover:bg-accent/10" onClick={() => setOffset(0)}>
                    Về hiện tại
                  </button>
                </div>
              )}
              {tool && <ToolHint tool={tool} routeInfo={routeInfo} onClose={() => setTool(null)} className="w-full" />}
              {drawnCard}
            </div>

            {layers.forecast && !sheet && (
              <div className={clsx(floatCard, 'absolute bottom-2 left-2 z-[1000] px-2 py-1.5 text-[10px]')}>
                <div className="mb-0.5 font-bold text-ink">Mưa dự báo 24h (P50)</div>
                <div className="flex gap-1">
                  {RAIN_BINS.map((b) => <span key={b.label} className="h-2.5 w-5 rounded-sm" style={{ background: b.color }} title={b.label} />)}
                </div>
              </div>
            )}

            {sheet === 'layers' && (
              <Sheet title="Lớp dữ liệu bản đồ" onClose={() => setSheet(null)} actions={layerActions}>
                {layerList}
              </Sheet>
            )}
            {sheet === 'alerts' && (
              <Sheet title="Cảnh báo khẩn cấp" onClose={() => setSheet(null)} bodyClass="flex flex-col overflow-hidden">
                {alertsList}
              </Sheet>
            )}
            {sheet === 'time' && (
              <Sheet title="Thời gian: số đo đã qua · dự báo" onClose={() => setSheet(null)}>
                <TimeControl offset={offset} setOffset={setOffset} touch />
              </Sheet>
            )}
            {sheet === 'tools' && (
              <Sheet title="Công cụ bản đồ" onClose={() => setSheet(null)}>
                {basemapSelect('input mb-3 min-h-[44px] w-full text-sm')}
                <div className="grid grid-cols-2 gap-2">
                  {tools.map(([t, Icon, label, short]) => (
                    <button
                      key={t}
                      type="button"
                      className={clsx('flex min-h-[52px] items-center gap-2 rounded-xl border px-3 text-left text-xs font-semibold', tool === t ? 'border-accent bg-accent text-white' : 'border-line text-ink hover:bg-panel2')}
                      onClick={() => toggleTool(t)}
                      title={label}
                      aria-pressed={tool === t}
                    >
                      <Icon size={18} className="shrink-0" aria-hidden="true" /> {short}
                    </button>
                  ))}
                </div>
              </Sheet>
            )}
            {sheet === 'legend' && (
              <Sheet title="Chú giải bản đồ" onClose={() => setSheet(null)}>
                <MapLegend layers={layers} order={LAYER_ORDER} />
              </Sheet>
            )}
          </>
        )}

        {/* Trạng thái: đang tải lần đầu / không tải được (bản đồ nền vẫn xem được) */}
        {!data && !layersQ.isError && (
          <div className="absolute inset-0 z-[900] flex items-center justify-center bg-bg/40 backdrop-blur-sm" role="status" aria-label="Đang tải lớp dữ liệu bản đồ">
            <MapIcon className="animate-bounce text-accent" size={32} />
          </div>
        )}
        {!data && layersQ.isError && (
          <div className="pointer-events-none absolute inset-x-0 top-1/3 z-[900] flex justify-center px-4">
            <ErrorState onRetry={() => layersQ.refetch()} className="pointer-events-auto w-full max-w-sm bg-panel shadow-2xl">
              Không tải được các lớp dữ liệu bản đồ (SOS, trạm, lực lượng…) — bản đồ nền vẫn xem được.
            </ErrorState>
          </div>
        )}
      </div>

      {/* Màn hẹp: thanh thao tác vùng ngón cái — khung chung (Báo SOS giữa, 112 mép phải), ô theo trang Bản đồ */}
      {!wide && (
        <QuickActionBar
          className="z-40"
          slots={[
            { key: 'lop', label: 'Lớp', icon: Layers, onClick: () => toggleSheet('layers'), active: sheet === 'layers' },
            { key: 'canh-bao', label: 'Cảnh báo', icon: BellRing, onClick: () => toggleSheet('alerts'), active: sheet === 'alerts', badge: alertCount },
            {
              key: 'thoi-gian',
              label: offset ? `${offset > 0 ? '+' : ''}${offset} giờ` : 'Thời gian',
              icon: Clock,
              onClick: () => toggleSheet('time'),
              active: sheet === 'time' || offset !== 0,
            },
          ]}
          onSos={canReport ? () => setReportOpen(true) : null}
        />
      )}

      {dispatch && <DispatchModal ticket={dispatch.ticket} presetForceId={dispatch.forceId} onClose={() => setDispatch(null)} />}
      <CameraModal camera={camera} onClose={() => setCamera(null)} />
      <IssueModal warehouse={issue} onClose={() => setIssue(null)} />
      {incident && <IncidentModal at={incident} onClose={() => setIncident(null)} />}
      {stormForm && <StormBulletinModal onClose={() => setStormForm(false)} />}
      {occupancy && <OccupancyModal site={occupancy} onClose={() => setOccupancy(null)} />}
      {canReport && <QuickIncidentModal open={reportOpen} onClose={() => setReportOpen(false)} />}
    </div>
  );
}
