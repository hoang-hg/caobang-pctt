import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  AlertTriangle, ArrowUpRight, Building2, Clock, CloudRain, Compass, Droplets, FileDown, FileSpreadsheet, Home,
  LayoutDashboard, Loader2, MapPin, Mountain, PhoneCall, RefreshCw, Server, ShieldAlert, Siren, Users, Waves, X,
} from 'lucide-react';
import { useAreaQuery, usePresets, useUnits } from '../api/hooks';
import { useStore } from '../app/store';
import { Progress, Section } from '../components/common/ui';
import EventLog from '../components/common/EventLog';
import Hydrograph from '../components/charts/Hydrograph';
import RainfallChart from '../components/charts/RainfallChart';
import LandslideScatter from '../components/charts/LandslideScatter';
import SuppliesChart from '../components/charts/SuppliesChart';
import AreaForecastChart from '../components/charts/AreaForecastChart';
import ForecastBulletinModal from '../components/charts/ForecastBulletinModal';
import StatCard, { Badge } from '../components/dashboard/StatCard';
import RiverKpi, { riverState } from '../components/dashboard/RiverKpi';
import SituationBar from '../components/dashboard/SituationBar';
import TacticalMiniMap from '../components/dashboard/TacticalMiniMap';
import OperationsTable from '../components/dashboard/OperationsTable';
import CommuneView, { unitLabel } from '../components/dashboard/CommuneView';
import SystemView from '../components/dashboard/SystemView';
import QuickIncidentModal from '../components/dashboard/QuickIncidentModal';
import { useAllowedCodes, usePermission } from '../rbac/usePermission';
import { int, minutesSince, num, pct, vnFileStamp } from '../utils/format';
import { exportSnapshotPdf } from '../utils/exportPdf';
import { exportExcel } from '../utils/exportExcel';
import ReservoirMonitor from './public/ReservoirMonitor';
import LandslideMonitor, { maxTiltText } from './public/LandslideMonitor';

const VN_TIME = { timeZone: 'Asia/Ho_Chi_Minh' };
const VIEWS = [
  { id: 'tinh', label: 'Tổng hợp', icon: Building2 },
  { id: 'xa', label: 'Cấp xã / phường', icon: Home },
  { id: 'he_thong', label: 'Hệ thống & dữ liệu', icon: Server },
];

/** Đồng hồ giờ Việt Nam — component riêng để mỗi giây chỉ vẽ lại đồng hồ, không vẽ lại cả Dashboard. */
function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="flex items-center gap-1 font-mono text-xs text-muted">
      <Clock size={12} />
      {now.toLocaleTimeString('vi-VN', { ...VN_TIME, hour12: false })} · {now.toLocaleDateString('vi-VN', { ...VN_TIME, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}
    </span>
  );
}

const EmptyChart = ({ height, children }) => (
  <div style={{ height }} className="flex items-center justify-center rounded-lg border border-dashed border-line px-4 text-center text-xs text-muted">
    {children}
  </div>
);

/**
 * Khối chỉ số nhanh (thiết kế mục A.2): mưa, mực nước so với BĐ I–III, sơ tán so với kế hoạch, SOS chờ (nhấp nháy khi
 * quá hạn), lực lượng & phương tiện chuyên dụng. Thiếu số liệu → "–" và nói rõ chưa có gì, không điền số mặc định.
 */
function KpiGrid({ k, kLoading, evac, waterStations, rainStations, canSystem, stationId, onSelectStation, canEvacUpdate, riverRef }) {
  if (kLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Đang tải chỉ số nhanh">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={clsx('card h-32 animate-pulse bg-panel2/60', i === 1 && 'sm:col-span-2')} />
        ))}
      </div>
    );
  }
  const rain = k?.rain;
  const rainKnown = rain?.avg_24h != null;
  const ev = k?.evacuation || {};
  const planned = ev.planned_households || 0;
  const sos = k?.sos || {};
  const fo = k?.forces || {};
  const ve = k?.vehicles || {};
  const sites = evac?.sites || [];
  const occupancy = sites.reduce((n, s) => n + (s.current_occupancy || 0), 0);
  const capacity = sites.reduce((n, s) => n + (s.capacity || 0), 0);
  const oldest = sos.oldest_waiting ? minutesSince(sos.oldest_waiting) : null;
  const hasResources = fo.units > 0 || ve.special_total > 0 || ve.heavy_total > 0;

  return (
    // 3 cột: cột trái Dashboard (cạnh nhật ký 360px) chỉ ~650–1300px — 6 cột làm thẻ quá hẹp, nhãn bị cắt
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
      <StatCard
        icon={CloudRain}
        title="Mưa 24 giờ"
        tone={!rainKnown ? 'muted' : rain.max_24h >= 100 ? 'serious' : rain.max_24h >= 50 ? 'warn' : undefined}
        badge={rainKnown && rain.max_24h >= 50 && (
          <Badge className={rain.max_24h >= 100 ? 'bg-serious text-white' : 'bg-warn text-black'}>{rain.max_24h >= 100 ? 'Mưa rất to' : 'Mưa to'}</Badge>
        )}
        value={num(rain?.avg_24h, 1)}
        unit={rainKnown ? 'mm · TB các trạm' : undefined}
        footer={
          rainKnown ? (
            <>
              Trạm lớn nhất: <b className="font-mono text-ink">{num(rain.max_24h, 1)} mm</b>
              {rain.max_station && ` · ${rain.max_station.replace(/^Trạm đo mưa\s+/i, '')}`}
            </>
          ) : (
            // Không có số đo ≠ không có trạm: trạm có mà im lặng là sự cố kết nối, không được che bằng "chưa có trạm".
            // Dự báo (Open-Meteo) chỉ là tham khảo, không thay số đo — dẫn tới biểu đồ dự báo ngay trên trang này
            <span>
              {rainStations ? `${rainStations} trạm đo mưa chưa gửi số đo 24 giờ qua` : 'Chưa có trạm đo mưa trong vùng đang xem'}
              {rainStations > 0 && canSystem && (
                <> · <Link to="/nguon-du-lieu" className="font-semibold text-accent hover:underline">Kiểm tra kết nối trạm →</Link></>
              )}
              {' · '}
              <button
                type="button"
                className="font-semibold text-accent hover:underline no-print"
                onClick={() => document.getElementById('du-bao-72h')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              >
                Xem dự báo mưa 72 giờ ↓
              </button>
            </span>
          )
        }
      />

      <div ref={riverRef} className="scroll-mt-20 sm:col-span-2">
        <RiverKpi stations={waterStations} selectedId={stationId} onSelect={onSelectStation} />
      </div>

      <StatCard
        icon={Home}
        title="Sơ tán an toàn"
        tone={planned ? undefined : 'muted'}
        badge={planned > 0 && <Badge className="bg-good/15 text-good">{pct(ev.evacuated_households, planned)}% kế hoạch</Badge>}
        value={planned ? `${int(ev.evacuated_households)}/${int(planned)}` : '–'}
        unit={planned ? 'hộ' : undefined}
        footer={
          <div className="flex flex-col gap-0.5">
            {planned ? (
              <span>Nhân khẩu: <b className="font-mono text-ink">{int(ev.evacuated_persons)}/{int(ev.planned_persons)}</b></span>
            ) : (
              <span>
                Chưa có kế hoạch sơ tán được cập nhật trong vùng đang xem
                {canEvacUpdate && <> · <Link to="/cuu-ho" className="font-semibold text-accent hover:underline">Cập nhật</Link></>}
              </span>
            )}
            <span className="text-muted">
              {sites.length ? `${sites.length} điểm sơ tán · đang ở ${int(occupancy)}/${int(capacity)} chỗ` : 'Chưa có điểm sơ tán trong dữ liệu'}
            </span>
          </div>
        }
      >
        {planned > 0 && <Progress value={pct(ev.evacuated_households, planned)} tone="good" />}
      </StatCard>

      <StatCard
        icon={Siren}
        title="SOS chờ xử lý"
        tone={sos.overdue > 0 ? 'danger' : sos.waiting > 0 ? 'warn' : k ? undefined : 'muted'}
        blink={sos.overdue > 0}
        badge={
          sos.overdue > 0 ? <Badge className="bg-danger text-white">{sos.overdue} quá hạn</Badge>
            : sos.critical > 0 ? <Badge className="bg-danger/15 text-danger">{sos.critical} cấp 1</Badge> : null
        }
        value={int(sos.waiting)}
        unit="phiếu mới"
        footer={
          <div className="flex flex-col gap-0.5">
            <span>
              Đang xử lý <b className="font-mono text-ink">{int(sos.in_progress)}</b> · Xong 24 giờ <b className="font-mono text-ink">{int(sos.resolved_24h)}</b>
            </span>
            {oldest != null && (
              <span>Phiếu chờ lâu nhất: <b className={clsx('font-mono', sos.overdue > 0 ? 'text-danger' : 'text-ink')}>{oldest} phút</b></span>
            )}
            {/* như SLA_MINUTES ở backend/app/services/sos.py */}
            <span className="text-[11px] text-muted">Hạn phản hồi: Cấp 1 · 3′ · Cấp 2 · 15′ · Cấp 3 · 60′</span>
          </div>
        }
      >
        <Link to="/cuu-ho" className="btn-ghost self-start px-2 py-0.5 text-[11px] no-print">
          Điều phối <ArrowUpRight size={11} />
        </Link>
      </StatCard>

      <StatCard
        icon={Users}
        title="Lực lượng & phương tiện"
        tone={hasResources ? undefined : 'muted'}
        value={fo.units > 0 ? int(fo.ready) : '–'}
        unit={fo.units > 0 ? `/ ${int(fo.total)} người sẵn sàng` : undefined}
        footer={
          hasResources ? (
            <div className="flex flex-col gap-0.5">
              <span>Đang làm nhiệm vụ: <b className="font-mono text-ink">{int(fo.on_mission)}</b> người · {int(fo.units)} đơn vị</span>
              <span>Xuồng, xe lội nước hoạt động: <b className="font-mono text-ink">{int(ve.special_active)}/{int(ve.special_total)}</b></span>
              <span>Máy xúc, máy ủi hoạt động: <b className="font-mono text-ink">{int(ve.heavy_active)}/{int(ve.heavy_total)}</b></span>
            </div>
          ) : (
            'Chưa có dữ liệu lực lượng, phương tiện trong vùng đang xem'
          )
        }
      />
    </div>
  );
}

/** Hai thẻ chuyên đề (hồ chứa, sạt lở đường đèo) — số từ KPI; chưa có danh mục thì nói rõ. Bấm → mở chuyên đề. */
function TopicCards({ k, onOpen }) {
  const rs = k?.reservoirs;
  const ls = k?.landslides;
  const card = 'card cursor-pointer border-l-4 p-3.5 text-left transition-shadow hover:shadow-md';
  return (
    <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
      <button type="button" onClick={() => onOpen('hochua')} className={clsx(card, rs?.emergency_count ? 'border-l-danger' : rs?.spill_count ? 'border-l-serious' : 'border-l-accent')}>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-bold text-ink">
            <Droplets size={17} className="text-accent" /> Hồ chứa & xả lũ
          </span>
          <span className="text-[11px] font-semibold text-accent">Mở chuyên đề →</span>
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 border-t border-line/60 pt-2 text-xs text-muted">
          {rs?.total ? (
            <>
              <span>Đang xả: <b className="font-mono text-ink">{rs.spill_count}/{rs.total} hồ</b></span>
              <span>Tổng xả: <b className="font-mono text-ink">{int(rs.total_outflow)} m³/s</b></span>
              {rs.no_data_count > 0 && <span>{rs.no_data_count} hồ chưa có số liệu vận hành</span>}
            </>
          ) : (
            <span>{k ? 'Chưa có hồ chứa trong dữ liệu của vùng đang xem' : '–'}</span>
          )}
        </div>
      </button>

      <button type="button" onClick={() => onOpen('satlo')} className={clsx(card, ls?.blocked_count ? 'border-l-danger' : ls?.warning_count ? 'border-l-serious' : 'border-l-accent')}>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-bold text-ink">
            <Mountain size={17} className="text-accent" /> Sạt lở & đường đèo
          </span>
          <span className="text-[11px] font-semibold text-accent">Mở chuyên đề →</span>
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 border-t border-line/60 pt-2 text-xs text-muted">
          {ls?.total ? (
            <>
              <span>Cấm đường: <b className="font-mono text-ink">{ls.blocked_count}</b> · Cảnh báo: <b className="font-mono text-ink">{ls.warning_count}</b></span>
              <span>Nghiêng lớn nhất: <b className="font-mono text-ink">{maxTiltText(ls.points)}</b></span>
              {ls.no_data_count > 0 && <span>{ls.no_data_count}/{ls.total} điểm chưa có dữ liệu giám sát</span>}
            </>
          ) : (
            <span>{k ? 'Chưa có điểm đen sạt lở trong vùng đang xem' : '–'}</span>
          )}
        </div>
      </button>
    </div>
  );
}

export default function Dashboard() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { filter, setFilter, clearFilter, toast, auth, wsStatus, setFocus } = useStore();
  const isFiltered = filter.codes.length > 0;

  // Quyền: nút / góc nhìn chỉ hiện khi có quyền — backend vẫn kiểm tra lại mọi thao tác
  const canReport = usePermission('sos', 'create');
  const canSystem = usePermission('integration', 'view');
  const canDataImport = usePermission('data', 'import');
  const canDataSubmit = usePermission('data', 'submit');
  const canImport = canDataImport || canDataSubmit;
  const canForecast = usePermission('monitoring', 'update', '*');
  const canEvacUpdate = usePermission('evacuation', 'update');

  const levelParam = params.get('level');
  const view = levelParam === 'xa' || (levelParam === 'he_thong' && canSystem) ? levelParam : 'tinh';

  const { data: k, isLoading: kLoading, isError: kError, dataUpdatedAt } = useAreaQuery('kpis', '/dashboard/kpis', {}, { refetchInterval: 30_000 });
  const { data: allStations = [] } = useAreaQuery('stations', '/stations');
  const { data: evac } = useAreaQuery('evacuation', '/evacuation', {}, { refetchInterval: 30_000 });
  const { data: supplies } = useAreaQuery('supplies', '/dashboard/supplies', {}, { enabled: view === 'he_thong' });
  const { data: presets = [] } = usePresets();
  const { data: units = [] } = useUnits();

  // Phạm vi được giao: tài khoản xã chưa lọc thì tiêu đề là xã đó, không ghi "Toàn tỉnh"
  const scope = useAllowedCodes('monitoring', 'view');
  const scopeUnits = useMemo(
    () => units.filter((u) => !scope || scope.includes(u.code)).sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    [units, scope],
  );
  const scopeUnit = scope?.length === 1 ? units.find((u) => u.code === scope[0]) : null;
  const scopeLabel = scopeUnit ? unitLabel(scopeUnit) : `${scope?.length || 0} xã/phường được giao`;
  const filterLabel = isFiltered || scope === null ? filter.label : scopeLabel;
  const role = auth?.user?.assignments?.[0]?.role_name;

  const waterStations = useMemo(() => allStations.filter((s) => s.type === 'muc_nuoc'), [allStations]);
  const rainStations = allStations.filter((s) => s.type === 'luong_mua').length;
  const rainKnown = k?.rain?.avg_24h != null;
  const [stationId, setStationId] = useState(null);
  const activeStation = waterStations.some((s) => s.id === stationId) ? stationId : waterStations[0]?.id || null;
  const [mode, setMode] = useState('tong_hop'); // tong_hop | hochua | satlo
  const [exporting, setExporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [bulletinOpen, setBulletinOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const ref = useRef(null); // vùng chụp PDF của góc nhìn đang mở
  const hydroRef = useRef(null);
  const riverRef = useRef(null);

  // Góc nhìn xã = bộ lọc chung đúng 1 xã (KPI, biểu đồ, nhật ký, bảng đều lọc theo xã đó)
  const communeCode = filter.codes.length === 1 ? filter.codes[0] : '';
  const enterCommune = (code) => {
    const u = units.find((x) => x.code === code);
    if (u) setFilter({ codes: [u.code], label: unitLabel(u), presetCode: null });
  };
  const setView = (id) => {
    if (id === 'xa' && !communeCode && scopeUnits.length) enterCommune(scopeUnits[0].code);
    if (id === 'tinh' && view === 'xa') clearFilter();
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id === 'tinh') next.delete('level');
      else next.set('level', id);
      return next;
    }, { replace: true });
  };
  // Mở thẳng /dashboard?level=xa (link, tải lại trang) khi bộ lọc chưa là 1 xã → chọn sẵn xã đầu tiên trong phạm vi
  const communeInit = useRef(false);
  useEffect(() => {
    if (view !== 'xa' || communeInit.current || !scopeUnits.length) return;
    communeInit.current = true;
    if (!communeCode) enterCommune(scopeUnits[0].code);
  }, [view, scopeUnits.length]); // eslint-disable-line react-hooks/exhaustive-deps -- chỉ chọn sẵn 1 lần khi mở góc nhìn xã

  const selectStation = (id) => {
    setStationId(id);
    hydroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const openOnMap = (x) => {
    if (x?.lat != null) setFocus({ lat: x.lat, lon: x.lon, zoom: 13, label: x.name });
    navigate('/ban-do');
  };

  // Làm mới thật: tải lại mọi truy vấn đang hiển thị, báo đúng kết quả (có nguồn lỗi thì nói)
  const refresh = async () => {
    setRefreshing(true);
    try {
      await qc.refetchQueries({ type: 'active' });
      const failed = qc.getQueryCache().findAll({ type: 'active' }).filter((q) => q.state.status === 'error').length;
      toast(failed
        ? { tone: 'warn', title: `Đã tải lại — ${failed} nguồn số liệu chưa tải được`, body: 'Kiểm tra kết nối tới máy chủ' }
        : { tone: 'good', title: 'Đã tải lại số liệu', duration: 2500 });
    } finally {
      setRefreshing(false);
    }
  };

  const doExport = async () => {
    if (!ref.current) return;
    setExporting(true);
    try {
      const now = new Date();
      await exportSnapshotPdf(ref.current, {
        title: 'BÁO CÁO NHANH TÌNH HÌNH THIÊN TAI – TỈNH CAO BẰNG',
        subtitle: `Phạm vi: ${filterLabel} · Thời điểm: ${now.toLocaleString('vi-VN', VN_TIME)} · Nguồn: Hệ thống điều hành PCTT & TKCN tỉnh`,
        filename: `bao-cao-nhanh-pctt-cao-bang-${vnFileStamp(now, true)}.pdf`,
      });
    } catch (e) {
      toast({ tone: 'danger', title: 'Không xuất được PDF', body: e.message });
    } finally {
      setExporting(false);
    }
  };

  // Excel: mỗi chỉ tiêu một dòng (không lặp số tổng ở từng dòng trạm); chưa có số liệu ghi rõ
  const doExcel = async () => {
    const now = new Date();
    const ev = k?.evacuation || {};
    const sos = k?.sos || {};
    const fo = k?.forces || {};
    const ve = k?.vehicles || {};
    const rows = [
      ['Phạm vi', filterLabel],
      ['Thời điểm', now.toLocaleString('vi-VN', VN_TIME)],
      ['Mưa TB 24h các trạm (mm)', k?.rain?.avg_24h],
      ['Mưa 24h lớn nhất (mm)', k?.rain?.max_24h, k?.rain?.max_station],
      ...waterStations.map((s) => {
        const st = riverState(s);
        return [`Mực nước – ${s.name} (m)`, st.value, st.label];
      }),
      ['Hộ đã sơ tán / kế hoạch', ev.planned_households ? `${ev.evacuated_households}/${ev.planned_households}` : null],
      ['Nhân khẩu đã sơ tán / kế hoạch', ev.planned_persons ? `${ev.evacuated_persons}/${ev.planned_persons}` : null],
      ['SOS chờ xử lý', sos.waiting],
      ['SOS quá hạn phản hồi', sos.overdue],
      ['SOS đang xử lý', sos.in_progress],
      ['SOS hoàn thành 24 giờ', sos.resolved_24h],
      ['Quân số sẵn sàng / tổng', fo.units ? `${fo.ready}/${fo.total}` : null],
      ['Quân số đang làm nhiệm vụ', fo.units ? fo.on_mission : null],
      ['Xuồng, xe lội nước hoạt động / tổng', ve.special_total ? `${ve.special_active}/${ve.special_total}` : null],
      ['Máy xúc, máy ủi hoạt động / tổng', ve.heavy_total ? `${ve.heavy_active}/${ve.heavy_total}` : null],
      ['Hồ đang xả / tổng', k?.reservoirs?.total ? `${k.reservoirs.spill_count}/${k.reservoirs.total}` : null],
      ['Điểm sạt lở cấm đường / tổng', k?.landslides?.total ? `${k.landslides.blocked_count}/${k.landslides.total}` : null],
    ].map(([label, value, note]) => ({ 'Chỉ tiêu': label, 'Giá trị': value ?? 'Chưa có số liệu', 'Ghi chú': note || '' }));
    try {
      await exportExcel(rows, { sheet: 'Tong quan', filename: `tong-quan-pctt-cao-bang-${vnFileStamp(now, true)}.xlsx` });
    } catch (e) {
      toast({ tone: 'danger', title: 'Không xuất được tệp Excel', body: e.message });
    }
  };

  const kpiProps = {
    k, kLoading, evac, waterStations, rainStations, canSystem, stationId: activeStation, onSelectStation: selectStation, canEvacUpdate, riverRef,
  };
  const logSection = (title, limit) => (
    <Section
      title={title}
      // Dính khi cuộn (thiết kế A.4: ticker luôn thấy bên phải); top-16 chừa chỗ cho dải tình huống dính trên cùng.
      // Chiều cao CỐ ĐỊNH (không phải max-h): h-full của danh sách mới tính được → cuộn bên trong, không tràn đè bảng bên dưới
      className="flex flex-col xl:sticky xl:top-16 xl:h-[calc(100vh-8.5rem)] xl:self-start xl:overflow-hidden print:static print:h-auto print:overflow-visible"
      bodyClass="flex min-h-0 flex-1 flex-col"
      right={
        wsStatus === 'online'
          ? <span className="badge-live shrink-0 whitespace-nowrap text-[10px]">Trực tuyến</span>
          : <span className="chip shrink-0 whitespace-nowrap bg-panel2 px-2 py-0 text-[10px] text-muted">Mất kết nối realtime</span>
      }
    >
      <EventLog className="h-[60vh] xl:h-full" limit={limit} />
    </Section>
  );

  return (
    <div className="flex flex-col gap-3.5 p-3.5 pb-20 sm:p-5 sm:pb-5">
      {/* 0. Tình huống nổi bật — dải đỏ / cam dính trên cùng khi có tình huống mức 2–3 */}
      {k && (
        <SituationBar
          k={k}
          waterStations={waterStations}
          rainKnown={rainKnown}
          canReport={canReport}
          onReport={() => setReportOpen(true)}
          canImport={canImport}
        />
      )}

      {/* 1. Thanh chỉ huy: tiêu đề + phạm vi, giờ, thao tác nhanh */}
      <div className="card p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded border border-accent/25 bg-accent/10 px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-accent">
                Trung tâm điều hành · Cao Bằng
              </span>
              {role && <span className="chip hidden border border-line bg-panel2 text-ink-2 sm:inline-flex">{role}</span>}
              <LiveClock />
            </div>
            <h1 className="mt-1 flex flex-wrap items-center gap-2 text-lg font-black tracking-tight text-ink sm:text-xl">
              <span>Tổng quan tác chiến PCTT & TKCN</span>
              <span className="font-normal text-muted">/</span>
              <span className="text-accent">{filterLabel}</span>
              {isFiltered && view !== 'xa' && (
                <button type="button" onClick={clearFilter} className="rounded-full p-0.5 text-muted hover:bg-panel2 hover:text-ink" title="Bỏ lọc" aria-label="Bỏ lọc">
                  <X size={14} />
                </button>
              )}
            </h1>
            <p className="mt-0.5 text-xs text-muted">
              {dataUpdatedAt
                ? `Số liệu tổng hợp lúc ${new Date(dataUpdatedAt).toLocaleTimeString('vi-VN', { ...VN_TIME, hour12: false })} · tự cập nhật khi có sự kiện mới`
                : 'Đang tải số liệu…'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 no-print">
            {canReport && (
              <button type="button" onClick={() => setReportOpen(true)} className="btn-danger px-3 py-1.5 text-xs font-bold">
                <ShieldAlert size={14} /> Báo cáo nhanh
              </button>
            )}
            <button type="button" onClick={refresh} disabled={refreshing} className="btn-ghost px-2.5 py-1.5 text-xs" aria-label="Làm mới số liệu">
              <RefreshCw size={13} className={clsx(refreshing && 'animate-spin')} /> Làm mới
            </button>
            <Link to="/ban-do" className="btn-ghost px-2.5 py-1.5 text-xs">
              <Compass size={14} /> Bản đồ <ArrowUpRight size={12} />
            </Link>
            <button type="button" onClick={doExcel} disabled={!k} className="btn-ghost px-2.5 py-1.5 text-xs">
              <FileSpreadsheet size={14} /> Excel
            </button>
            <button type="button" onClick={doExport} disabled={exporting} className="btn-primary px-3 py-1.5 text-xs">
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} Xuất PDF
            </button>
          </div>
        </div>
      </div>

      {kError && (
        <div className="card flex flex-wrap items-center justify-between gap-2 border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          <span className="flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0" />
            Không tải được chỉ số tổng quan từ máy chủ{k ? ' — số trên màn hình là lần tải trước' : ''}.
          </span>
          <button type="button" onClick={refresh} className="btn-danger px-2.5 py-1 text-xs">Thử lại</button>
        </div>
      )}

      {/* 2. Góc nhìn: tổng hợp (tỉnh / vùng lọc) · xã/phường · hệ thống */}
      <div className="flex flex-wrap items-center gap-1.5 no-print">
        {VIEWS.filter((v) => v.id !== 'he_thong' || canSystem).map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            aria-pressed={view === v.id}
            className={clsx(
              'flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold',
              view === v.id ? 'border-accent bg-accent text-white' : 'border-line bg-panel text-ink-2 hover:bg-panel2 hover:text-ink',
            )}
          >
            <v.icon size={14} /> {v.label}
          </button>
        ))}
      </div>

      {view === 'he_thong' && (
        <div ref={ref}>
          <SystemView k={k} stations={allStations} supplies={supplies} evac={evac} unitsCount={units.length} canImport={canImport} />
        </div>
      )}

      {view === 'xa' && (
        <div ref={ref} className="flex flex-col gap-3.5">
          <CommuneView code={communeCode} units={scopeUnits} onChange={enterCommune}>
            <KpiGrid {...kpiProps} />
            <div className="grid gap-3.5 xl:grid-cols-[1fr_360px] [&>*]:min-w-0">
              <div className="grid gap-3.5 lg:grid-cols-2 [&>*]:min-w-0">
                <Section title="Mưa & dự báo 3 giờ tới tại xã">
                  <RainfallChart height={250} />
                </Section>
                <Section title="Ngưỡng kích hoạt sạt lở – trạm mưa trong xã">
                  <LandslideScatter height={250} />
                </Section>
                <Section id="du-bao-72h" title="Dự báo mưa 72 giờ – tổ hợp ECMWF + GFS (P10–P90)" className="lg:col-span-2">
                  <AreaForecastChart height={220} />
                </Section>
              </div>
              {logSection('Nhật ký sự kiện của xã', 40)}
            </div>
          </CommuneView>
        </div>
      )}

      {view === 'tinh' && (
        <>
          {/* Lọc nhanh theo lưu vực (nhóm do BCH xác nhận — README 2.4); tài khoản xã chỉ có xã mình nên ẩn */}
          {scope === null && presets.some((p) => p.kind === 'luu_vuc') && (
            <div className="scroll-thin flex items-center gap-1.5 overflow-x-auto pb-1 no-print">
              <span className="mr-1 flex items-center gap-1 whitespace-nowrap text-xs font-bold uppercase tracking-wider text-muted">
                <MapPin size={13} /> Lưu vực:
              </span>
              <button
                type="button"
                onClick={clearFilter}
                className={clsx('whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold', !isFiltered ? 'border-accent bg-accent text-white' : 'border-line bg-panel text-ink-2 hover:bg-panel2')}
              >
                Toàn tỉnh
              </button>
              {presets.filter((p) => p.kind === 'luu_vuc').map((p) => (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => setFilter({ codes: p.unit_codes, label: p.name, presetCode: p.code })}
                  className={clsx(
                    'whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold',
                    filter.presetCode === p.code ? 'border-accent bg-accent text-white' : 'border-line bg-panel text-ink-2 hover:bg-panel2',
                  )}
                >
                  {p.name} <span className="opacity-75">({p.unit_codes.length} xã)</span>
                </button>
              ))}
            </div>
          )}

          {/* Chuyên đề */}
          <div className="scroll-thin flex items-center gap-2 overflow-x-auto border-b border-line pb-2.5 no-print">
            {[
              { id: 'tong_hop', label: 'Tác chiến tổng hợp', icon: LayoutDashboard },
              {
                id: 'hochua', label: 'Hồ chứa & xả lũ', icon: Droplets,
                badge: k?.reservoirs?.spill_count ? `${k.reservoirs.spill_count} hồ xả` : null,
                badgeCls: k?.reservoirs?.emergency_count ? 'bg-danger text-white' : 'bg-serious text-white',
              },
              {
                id: 'satlo', label: 'Sạt lở & đường đèo', icon: Mountain,
                badge: k?.landslides?.blocked_count ? `${k.landslides.blocked_count} điểm cấm` : null,
                badgeCls: 'bg-danger text-white',
              },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                aria-pressed={mode === m.id}
                className={clsx(
                  'flex items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 py-2 text-xs font-bold',
                  mode === m.id ? 'border-accent bg-accent text-white' : 'border-line bg-panel text-ink-2 hover:bg-panel2 hover:text-ink',
                )}
              >
                <m.icon size={15} /> {m.label}
                {m.badge && <span className={clsx('rounded-full px-1.5 py-0.5 text-[10px] font-bold', m.badgeCls)}>{m.badge}</span>}
              </button>
            ))}
          </div>

          {mode === 'hochua' && (
            <div ref={ref} className="card p-4 sm:p-5">
              <ReservoirMonitor onSelectOnMap={openOnMap} />
            </div>
          )}

          {mode === 'satlo' && (
            <div ref={ref} className="card p-4 sm:p-5">
              <LandslideMonitor onSelectOnMap={openOnMap} />
            </div>
          )}

          {mode === 'tong_hop' && (
            <>
              <div ref={ref} className="grid gap-3.5 bg-bg xl:grid-cols-[1fr_360px] [&>*]:min-w-0">
                <div className="flex min-w-0 flex-col gap-3.5">
                  {/* Khối chỉ số nhanh (Top) */}
                  <KpiGrid {...kpiProps} />
                  <TopicCards k={k} onOpen={setMode} />
                  <TacticalMiniMap k={k} />

                  {/* Khối biểu đồ phân tích (Middle) */}
                  <div className="grid gap-3.5 lg:grid-cols-2 [&>*]:min-w-0">
                    <div ref={hydroRef} className="min-w-0 scroll-mt-20">
                      <Section
                        title="Thủy văn – mực nước thực đo & dự báo"
                        right={
                          waterStations.length > 0 && (
                            <select className="input w-auto py-1 text-xs" value={activeStation || ''} onChange={(e) => setStationId(e.target.value)} aria-label="Chọn trạm thủy văn">
                              {waterStations.map((s) => (
                                <option key={s.id} value={s.id}>{s.name.replace(/^Trạm\s+(thủy|thuỷ)\s+văn\s+/i, '')}</option>
                              ))}
                            </select>
                          )
                        }
                      >
                        {activeStation ? (
                          <Hydrograph stationId={activeStation} height={250} />
                        ) : (
                          <EmptyChart height={250}>Chưa có trạm mực nước trong vùng đang xem — nhập danh mục trạm và ngưỡng BĐ I–III (loại "Trạm quan trắc")</EmptyChart>
                        )}
                        {canForecast && waterStations.length > 0 && (
                          <div className="mt-2 flex justify-end no-print">
                            <button type="button" className="btn-ghost px-2.5 py-1 text-xs" onClick={() => setBulletinOpen(true)}>
                              Nhập bản tin dự báo KTTV
                            </button>
                          </div>
                        )}
                        {bulletinOpen && <ForecastBulletinModal stations={waterStations} stationId={activeStation} onClose={() => setBulletinOpen(false)} />}
                      </Section>
                    </div>
                    <Section title="Cường độ mưa & dự báo 3 giờ tới">
                      <RainfallChart height={270} />
                    </Section>
                    <Section id="du-bao-72h" title="Dự báo mưa 72 giờ theo xã – tổ hợp ECMWF + GFS (P10–P90)" className="lg:col-span-2">
                      <AreaForecastChart height={230} />
                    </Section>
                    <Section title="Ngưỡng kích hoạt sạt lở (mưa tích lũy 72h – cường độ)">
                      <LandslideScatter height={240} />
                    </Section>
                    <Section title="Vật tư cứu trợ theo kho (% định mức dự trữ)">
                      <SuppliesChart height={240} />
                    </Section>
                  </div>
                </div>

                {/* Khối nhật ký sự kiện & luồng cảnh báo (Side) */}
                {logSection('Nhật ký sự kiện & luồng cảnh báo', 60)}
              </div>

              <OperationsTable k={k} stations={waterStations} onSelectStation={selectStation} />
            </>
          )}
        </>
      )}

      {/* Thanh thao tác nhanh trên điện thoại (ngón cái) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around gap-1.5 border-t border-line bg-panel/95 p-2 shadow-2xl backdrop-blur sm:hidden print:hidden" aria-label="Thao tác nhanh">
        {canReport && (
          <button type="button" onClick={() => setReportOpen(true)} className="flex flex-1 flex-col items-center gap-0.5 rounded-xl bg-danger px-1.5 py-2 text-xs font-black text-white active:scale-95">
            <Siren size={16} /> Báo SOS
          </button>
        )}
        <a
          href="tel:112"
          className="flex flex-1 flex-col items-center gap-0.5 rounded-xl border border-danger/40 bg-danger/10 px-1.5 py-2 text-center text-xs font-bold text-danger active:scale-95"
          title="Gọi điện khẩn cấp 112"
        >
          <PhoneCall size={16} className="animate-pulse text-danger" /> Gọi 112
        </a>
        <button
          type="button"
          onClick={() => {
            if (view === 'he_thong') setView('tinh');
            setMode('tong_hop');
            setTimeout(() => riverRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
          }}
          className="flex flex-1 flex-col items-center gap-0.5 rounded-xl border border-line bg-panel2 px-1.5 py-2 text-xs font-bold text-ink active:scale-95"
        >
          <Waves size={16} className="text-accent" /> Mực nước
        </button>
        <Link to="/ban-do" className="flex flex-1 flex-col items-center gap-0.5 rounded-xl border border-line bg-panel2 px-2 py-2 text-xs font-bold text-ink active:scale-95">
          <Compass size={16} className="text-accent" /> Bản đồ
        </Link>
        <Link to="/cuu-ho" className="flex flex-1 flex-col items-center gap-0.5 rounded-xl border border-line bg-panel2 px-2 py-2 text-xs font-bold text-ink active:scale-95">
          <Siren size={16} className="text-accent" /> Cứu hộ
        </Link>
      </nav>

      {canReport && <QuickIncidentModal open={reportOpen} onClose={() => setReportOpen(false)} />}
    </div>
  );
}
