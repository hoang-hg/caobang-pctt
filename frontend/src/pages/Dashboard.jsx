import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  AlertTriangle, ArrowUpRight, Compass, Droplets, FileDown, FileSpreadsheet, Home, Info, LayoutDashboard, LifeBuoy,
  Loader2, MapPin, Mountain, PhoneCall, RefreshCw, Server, ShieldAlert, Siren, Waves, X,
} from 'lucide-react';
import { useAreaQuery, usePresets, useUnits } from '../api/hooks';
import { useStore } from '../app/store';
import { EmptyState, ErrorState, RiskLegend, Section, Skeleton } from '../components/common/ui';
import EventLog from '../components/common/EventLog';
import Hydrograph from '../components/charts/Hydrograph';
import RainfallChart from '../components/charts/RainfallChart';
import LandslideScatter from '../components/charts/LandslideScatter';
import SuppliesChart from '../components/charts/SuppliesChart';
import AreaForecastChart from '../components/charts/AreaForecastChart';
import ForecastBulletinModal from '../components/charts/ForecastBulletinModal';
import KpiStrip from '../components/dashboard/KpiStrip';
import DecisionPanel from '../components/dashboard/DecisionPanel';
import { riverState, StationPicker } from '../components/dashboard/RiverKpi';
import SituationBar from '../components/dashboard/SituationBar';
import ConnectionBanner from '../components/dashboard/ConnectionBanner';
import TacticalMiniMap from '../components/dashboard/TacticalMiniMap';
import OperationsTable from '../components/dashboard/OperationsTable';
import CommuneView, { unitLabel } from '../components/dashboard/CommuneView';
import SystemView from '../components/dashboard/SystemView';
import QuickIncidentModal from '../components/dashboard/QuickIncidentModal';
import { useAllowedCodes, usePermission } from '../rbac/usePermission';
import { vnFileStamp } from '../utils/format';
import { risk } from '../utils/risk';
import { exportSnapshotPdf } from '../utils/exportPdf';
import { exportExcel } from '../utils/exportExcel';
import { useMediaQuery } from '../utils/useMediaQuery';
import { useOnline } from '../utils/useOnline';
import ReservoirMonitor from './public/ReservoirMonitor';
import LandslideMonitor from './public/LandslideMonitor';

const VN_TIME = { timeZone: 'Asia/Ho_Chi_Minh' };
// Một hàng thẻ duy nhất (trước đây 2 hàng: góc nhìn + chuyên đề, trùng chữ "Tổng hợp"); ?tab= để gửi link / tải lại
const TABS = [
  { id: 'tong_hop', label: 'Tổng hợp', icon: LayoutDashboard },
  { id: 'ho_chua', label: 'Hồ chứa & xả lũ', icon: Droplets },
  { id: 'sat_lo', label: 'Sạt lở & đường đèo', icon: Mountain },
  { id: 'cap_xa', label: 'Cấp xã / phường', icon: Home },
  { id: 'he_thong', label: 'Hệ thống & dữ liệu', icon: Server },
];
const LEGACY_LEVEL = { tinh: 'tong_hop', xa: 'cap_xa', he_thong: 'he_thong' }; // link cũ ?level=… (trước 10/2026)
// Điện thoại: biểu đồ thu gọn được (chỉ ẩn — số liệu vẫn tải như cũ); Thủy văn mở sẵn, còn lại đóng để lãnh đạo không phải
// cuộn qua 5 biểu đồ mới tới nhật ký / bảng
const CHARTS_OPEN = { thuy_van: true, mua: false, du_bao: false, sat_lo: false, vat_tu: false };

/** Nút của thanh thao tác điện thoại: cao ≥ 56 px, biểu tượng + chữ. */
const barBtn = 'flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-bold active:scale-95';

/**
 * Dashboard tổng quan (thiết kế mục A). Bố cục theo thiết bị của lãnh đạo — chỉ sắp xếp lại, số liệu / API như cũ:
 * - laptop (≥ 1280 px) / iPad ngang (≥ 1024 px): dải khẩn → thanh lệnh → thẻ → 6 ô KPI (1 hàng / 3×2) → bản đồ + biểu đồ
 *   bên trái, "Việc chờ quyết định" + nhật ký cột phải dính khi cuộn → bảng tác chiến;
 * - iPad dọc: KPI 3×2 → bản đồ cả hàng → (Việc chờ | nhật ký 5 mục) → biểu đồ 2 cột;
 * - điện thoại: KPI 2×3 → Việc chờ → bản đồ thu gọn → biểu đồ thu gọn được → nhật ký 5 mục → bảng dạng thẻ; thanh đáy.
 */
export default function Dashboard() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const online = useOnline();
  const isLg = useMediaQuery('(min-width: 1024px)'); // laptop / iPad ngang: nhật ký là cột phải, dính khi cuộn
  const isPhone = !useMediaQuery('(min-width: 640px)');
  const [params, setParams] = useSearchParams();
  const { filter, setFilter, clearFilter, toast, auth, wsStatus, setFocus } = useStore();
  const isFiltered = filter.codes.length > 0;

  // Quyền: nút / thẻ / khối chỉ hiện khi tài khoản mở được — backend vẫn kiểm tra lại mọi thao tác
  const canReport = usePermission('sos', 'create');
  const canSos = usePermission('sos', 'view');
  const canResource = usePermission('resource', 'view');
  const canSystem = usePermission('integration', 'view');
  const canDataImport = usePermission('data', 'import');
  const canDataSubmit = usePermission('data', 'submit'); // xã gửi hồ sơ chờ duyệt — cũng mở được /nhap-du-lieu
  const canForecast = usePermission('monitoring', 'update', '*');
  const canEvacUpdate = usePermission('evacuation', 'update');
  const tabs = TABS.filter((t) => t.id !== 'he_thong' || canSystem);

  const wanted = params.get('tab') || LEGACY_LEVEL[params.get('level')] || 'tong_hop';
  const tab = tabs.some((t) => t.id === wanted) ? wanted : 'tong_hop';

  const kQ = useAreaQuery('kpis', '/dashboard/kpis', {}, { refetchInterval: 30_000 });
  const k = kQ.data;
  const kState = { loading: kQ.isLoading, error: kQ.isError && !k, refetch: kQ.refetch };
  const stationsQ = useAreaQuery('stations', '/stations');
  const allStations = useMemo(() => stationsQ.data || [], [stationsQ.data]);
  const stationsState = { loading: stationsQ.isLoading, error: stationsQ.isError && !stationsQ.data, refetch: stationsQ.refetch };
  const evacQ = useAreaQuery('evacuation', '/evacuation', {}, { refetchInterval: 30_000 });
  const { data: supplies } = useAreaQuery('supplies', '/dashboard/supplies', {}, { enabled: tab === 'he_thong' && canResource });
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
  // Lọc nhanh theo lưu vực (nhóm do BCH xác nhận — README 2.4) — ô chọn trong thanh lệnh (trước đây 1 hàng chip riêng)
  const basinPresets = useMemo(() => presets.filter((p) => p.kind === 'luu_vuc'), [presets]);
  const basinValue = filter.presetCode && basinPresets.some((p) => p.code === filter.presetCode)
    ? filter.presetCode
    : isFiltered ? 'khac' : '';
  const pickBasin = (code) => {
    const p = basinPresets.find((x) => x.code === code);
    if (p) setFilter({ codes: p.unit_codes, label: p.name, presetCode: p.code });
    else clearFilter();
  };

  const waterStations = useMemo(() => allStations.filter((s) => s.type === 'muc_nuoc'), [allStations]);
  const rainStations = allStations.filter((s) => s.type === 'luong_mua').length;
  const rainKnown = k?.rain?.avg_24h != null;
  const [stationId, setStationId] = useState(null);
  const activeStation = waterStations.some((s) => s.id === stationId) ? stationId : waterStations[0]?.id || null;
  const [exporting, setExporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [bulletinOpen, setBulletinOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [chartsOpen, setChartsOpen] = useState(CHARTS_OPEN);
  const [forceOpen, setForceOpen] = useState(false); // đang chụp PDF trên điện thoại: mở mọi biểu đồ đang thu gọn
  const ref = useRef(null); // vùng chụp PDF của thẻ đang mở
  const hydroRef = useRef(null);
  const riverRef = useRef(null);

  // Thẻ "Cấp xã" = bộ lọc chung đúng 1 xã (KPI, biểu đồ, nhật ký, bảng đều lọc theo xã đó)
  const communeCode = filter.codes.length === 1 ? filter.codes[0] : '';
  const enterCommune = (code) => {
    const u = units.find((x) => x.code === code);
    if (u) setFilter({ codes: [u.code], label: unitLabel(u), presetCode: null });
  };
  const setTab = (id) => {
    if (id === 'cap_xa' && !communeCode && scopeUnits.length) enterCommune(scopeUnits[0].code);
    if (tab === 'cap_xa' && id !== 'cap_xa') clearFilter();
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('level');
      if (id === 'tong_hop') next.delete('tab');
      else next.set('tab', id);
      return next;
    }, { replace: true });
  };
  // Mở thẳng /dashboard?tab=cap_xa (link, tải lại trang) khi bộ lọc chưa là 1 xã → chọn sẵn xã đầu tiên trong phạm vi
  const communeInit = useRef(false);
  useEffect(() => {
    if (tab !== 'cap_xa' || communeInit.current || !scopeUnits.length) return;
    communeInit.current = true;
    if (!communeCode) enterCommune(scopeUnits[0].code);
  }, [tab, scopeUnits.length]); // eslint-disable-line react-hooks/exhaustive-deps -- chỉ chọn sẵn 1 lần khi mở thẻ xã

  // Chọn trạm (ô KPI mực nước, bảng tác chiến) → mở & cuộn tới biểu đồ thủy văn của trạm đó
  const focusStation = (id) => {
    setStationId(id);
    setChartsOpen((o) => ({ ...o, thuy_van: true }));
    setTimeout(() => hydroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };
  const openChart = (key, id) => {
    setChartsOpen((o) => ({ ...o, [key]: true }));
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };
  // Biểu đồ thu gọn được chỉ trên điện thoại; máy lớn luôn mở
  const fold = (key) => ({
    collapsible: isPhone,
    open: !isPhone || forceOpen || chartsOpen[key],
    onToggle: () => setChartsOpen((o) => ({ ...o, [key]: !o[key] })),
  });
  const openOnMap = (x) => {
    if (x?.lat != null) setFocus({ lat: x.lat, lon: x.lon, zoom: 13, label: x.name });
    navigate('/ban-do');
  };
  // Nút "Mực nước" ở thanh dưới: tới danh sách trạm + biểu đồ thủy văn (thẻ Cấp xã không có biểu đồ → ô KPI mực nước)
  const goRivers = () => {
    if (tab === 'cap_xa') {
      riverRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (tab !== 'tong_hop') setTab('tong_hop');
    setChartsOpen((o) => ({ ...o, thuy_van: true }));
    setTimeout(() => hydroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  };

  // Làm mới thật: tải lại mọi truy vấn đang hiển thị, báo đúng kết quả (có nguồn lỗi thì nói)
  const refresh = async () => {
    setRefreshing(true);
    try {
      await qc.refetchQueries({ type: 'active' });
      const failed = qc.getQueryCache().findAll({ type: 'active' }).filter((q) => q.state.status === 'error').length;
      toast(failed
        ? { tone: 'warn', title: `Đã tải lại — ${failed} nguồn số liệu chưa tải được`, body: online ? 'Kiểm tra kết nối tới máy chủ' : 'Thiết bị đang mất mạng' }
        : { tone: 'good', title: 'Đã tải lại số liệu', duration: 2500 });
    } finally {
      setRefreshing(false);
    }
  };

  const doExport = async () => {
    if (!ref.current) return;
    setExporting(true);
    // Điện thoại: biểu đồ đang thu gọn phải mở ra trước khi chụp, nếu không PDF thiếu biểu đồ
    const folded = isPhone && Object.values(chartsOpen).some((v) => !v);
    try {
      if (folded) {
        setForceOpen(true);
        await new Promise((r) => { setTimeout(r, 500); }); // biểu đồ vừa hiện cần vẽ lại theo bề rộng thật
      }
      const now = new Date();
      await exportSnapshotPdf(ref.current, {
        title: 'BÁO CÁO NHANH TÌNH HÌNH THIÊN TAI – TỈNH CAO BẰNG',
        subtitle: `Phạm vi: ${filterLabel} · Thời điểm: ${now.toLocaleString('vi-VN', VN_TIME)} · Nguồn: Hệ thống điều hành PCTT & TKCN tỉnh`,
        filename: `bao-cao-nhanh-pctt-cao-bang-${vnFileStamp(now, true)}.pdf`,
      });
    } catch (e) {
      toast({ tone: 'danger', title: 'Không xuất được PDF', body: e.message });
    } finally {
      setForceOpen(false);
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
        return [`Mực nước – ${s.name} (m)`, st.value, `${st.label} · ${risk(st.level).name}`];
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
    k, kState, evacQ, stationsState, waterStations, rainStations, canSos, canResource, canEvacUpdate, riverRef,
    onOpenTab: setTab,
    onRain: () => openChart('mua', 'bieu-do-mua'),
  };
  // Nhật ký: máy lớn — danh sách đầy đủ cuộn trong khung cố định; iPad dọc / điện thoại — 5 sự kiện mới + "Xem tất cả"
  const logSection = ({ title, limit, className, listClass = isLg ? 'h-full' : undefined }) => (
    <Section
      title={title}
      className={clsx('flex flex-col print:static print:h-auto print:overflow-visible', className)}
      bodyClass="flex min-h-0 flex-1 flex-col"
      right={
        wsStatus === 'online'
          ? <span className="badge-live shrink-0 whitespace-nowrap text-[10px]">Trực tuyến</span>
          : <span className="chip shrink-0 whitespace-nowrap bg-panel2 px-2 py-0 text-[10px] text-muted">Mất kết nối realtime</span>
      }
    >
      <EventLog className={listClass} limit={limit} preview={isLg ? undefined : 5} />
    </Section>
  );
  const rs = k?.reservoirs;
  const ls = k?.landslides;
  const tabBadge = {
    ho_chua: rs?.spill_count ? { text: `${rs.spill_count} hồ xả`, level: rs.emergency_count ? 3 : 2 } : null,
    sat_lo: ls?.blocked_count ? { text: `${ls.blocked_count} cấm đường`, level: 3 } : ls?.warning_count ? { text: `${ls.warning_count} cảnh báo`, level: 2 } : null,
  };
  const dataTime = kQ.dataUpdatedAt ? new Date(kQ.dataUpdatedAt).toLocaleTimeString('vi-VN', { ...VN_TIME, hour12: false }) : null;

  return (
    <div className="flex flex-col gap-2 p-3.5 pb-28 sm:gap-3.5 sm:p-5 sm:pb-5">
      {/* 0. Thông tin khẩn luôn trên cùng: dải tình huống (Cam / Đỏ dính khi cuộn) + mất mạng */}
      {k && (
        <SituationBar
          k={k}
          waterStations={waterStations}
          stationsError={stationsState.error}
          rainKnown={rainKnown}
          canReport={canReport}
          onReport={() => setReportOpen(true)}
          canSos={canSos}
          canImportStations={canDataImport}
          canSystem={canSystem}
        />
      )}
      <ConnectionBanner updatedAt={kQ.dataUpdatedAt || null} />

      {/* 1. Thanh lệnh gọn (2 dòng): phạm vi · thao tác / giờ số liệu · thang màu · lưu vực */}
      <div className="card px-3 py-2 sm:px-4 sm:py-2.5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="flex min-w-0 items-center gap-x-2 text-base font-black tracking-tight text-ink sm:text-lg">
            <span className="hidden shrink-0 md:inline">Tổng quan tác chiến</span>
            <span className="hidden font-normal text-muted md:inline">/</span>
            <span className="min-w-0 truncate text-accent" title={filterLabel}>{filterLabel}</span>
            {isFiltered && tab !== 'cap_xa' && (
              <button type="button" onClick={clearFilter} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-panel2 hover:text-ink" title="Bỏ lọc" aria-label="Bỏ lọc, xem toàn bộ phạm vi">
                <X size={15} />
              </button>
            )}
          </h1>
          <div className="flex shrink-0 items-center gap-2 no-print">
            {canReport && (
              // Điện thoại: "Báo SOS" ở thanh dưới cùng (vùng ngón cái) — ở đây chỉ hiện từ máy tính bảng trở lên
              <button type="button" onClick={() => setReportOpen(true)} className="btn-danger hidden min-h-[40px] px-3 text-xs font-bold sm:inline-flex lg:min-h-0 lg:py-1.5">
                <ShieldAlert size={14} /> Báo cáo nhanh
              </button>
            )}
            <button type="button" onClick={refresh} disabled={refreshing} className="btn-ghost h-10 min-w-[40px] px-2.5 text-xs lg:h-auto lg:py-1.5" aria-label="Làm mới số liệu" title="Làm mới số liệu">
              <RefreshCw size={14} className={clsx(refreshing && 'animate-spin')} /> <span className="hidden xl:inline">Làm mới</span>
            </button>
            <Link to="/ban-do" className="btn-ghost hidden h-10 px-2.5 text-xs sm:inline-flex lg:h-auto lg:py-1.5" title="Mở Bản đồ giám sát">
              <Compass size={14} /> <span className="hidden md:inline">Bản đồ</span> <ArrowUpRight size={12} />
            </Link>
            <button type="button" onClick={doExcel} disabled={!k} className="btn-ghost h-10 min-w-[40px] px-2.5 text-xs lg:h-auto lg:py-1.5" aria-label="Xuất Excel tổng quan" title="Xuất Excel tổng quan">
              <FileSpreadsheet size={14} /> <span className="hidden md:inline">Excel</span>
            </button>
            <button type="button" onClick={doExport} disabled={exporting} className="btn-primary h-10 min-w-[40px] px-3 text-xs lg:h-auto lg:py-1.5" aria-label="Xuất PDF báo cáo nhanh" title="Xuất PDF báo cáo nhanh">
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} <span className="hidden md:inline">Xuất PDF</span>
            </button>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          <span className="whitespace-nowrap">
            {dataTime ? (
              <>
                <span className="sm:hidden">Lúc </span><span className="hidden sm:inline">Số liệu lúc </span>
                <b className="font-mono text-ink-2">{dataTime}</b>
                <span className="hidden 2xl:inline"> · tự cập nhật khi có sự kiện mới</span>
              </>
            ) : kState.error ? 'Chưa tải được số liệu' : 'Đang tải số liệu…'}
          </span>
          {role && <span className="chip hidden border border-line bg-panel2 py-0 text-[10px] text-ink-2 2xl:inline-flex">{role}</span>}
          {/* Thang màu: hiện sẵn từ md; điện thoại gọn vào "Thang màu" (chạm để mở) */}
          <RiskLegend className="hidden md:flex" meaningClass="hidden xl:inline" />
          <details className="md:hidden">
            <summary className="flex min-h-[28px] cursor-pointer list-none items-center gap-1 font-semibold text-accent [&::-webkit-details-marker]:hidden">
              <Info size={13} aria-hidden="true" /> Thang màu
            </summary>
            <RiskLegend className="mt-1" />
          </details>
          {/* Tài khoản xã chỉ có xã mình → không có lưu vực để chọn. Điện thoại: chọn lưu vực ở bộ lọc trong menu ☰ (cùng
              danh sách nhóm) — không chiếm thêm một dòng trước hàng KPI */}
          {tab === 'tong_hop' && scope === null && basinPresets.length > 0 && (
            <label className="hidden items-center gap-1.5 no-print sm:flex">
              <MapPin size={12} aria-hidden="true" />
              <span className="hidden xl:inline">Lưu vực</span>
              <select className="input min-h-[32px] w-auto max-w-[13rem] py-0.5 text-[11px]" value={basinValue} onChange={(e) => pickBasin(e.target.value)} aria-label="Lọc theo lưu vực">
                <option value="">Toàn tỉnh</option>
                {basinValue === 'khac' && <option value="khac" disabled>{filter.label}</option>}
                {basinPresets.map((p) => <option key={p.code} value={p.code}>{p.name} ({p.unit_codes.length} xã)</option>)}
              </select>
            </label>
          )}
        </div>
      </div>

      {k && kQ.isError && online && (
        <div role="alert" className="card flex flex-wrap items-center justify-between gap-2 border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          <span className="flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0" aria-hidden="true" />
            Không tải được chỉ số mới từ máy chủ — số trên màn hình là lần tải trước.
          </span>
          <button type="button" onClick={refresh} className="btn-danger min-h-[36px] px-2.5 py-1 text-xs">Thử lại</button>
        </div>
      )}

      {/* 2. Một hàng thẻ: tổng hợp · chuyên đề · cấp xã · hệ thống (cuộn ngang trong hàng trên điện thoại) */}
      <div className="scroll-thin -mx-1 flex items-center gap-1.5 overflow-x-auto border-b border-line px-1 pb-2 no-print sm:pb-2.5" role="tablist" aria-label="Nội dung tổng quan">
        {tabs.map((t) => {
          const badge = tabBadge[t.id];
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                'flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 text-xs font-bold',
                tab === t.id ? 'border-accent bg-accent text-white' : 'border-line bg-panel text-ink-2 hover:bg-panel2 hover:text-ink',
              )}
            >
              <t.icon size={15} aria-hidden="true" /> {t.label}
              {badge && <span className={clsx('rounded-full px-1.5 py-0.5 text-[10px] font-bold', risk(badge.level).chip)}>{badge.text}</span>}
            </button>
          );
        })}
      </div>

      {tab === 'he_thong' && (
        <div ref={ref}>
          <SystemView k={k} stations={allStations} supplies={supplies} evac={evacQ.data} unitsCount={units.length} canImport={canDataImport || canDataSubmit} />
        </div>
      )}

      {tab === 'cap_xa' && (
        <div ref={ref} className="flex flex-col gap-3.5">
          <CommuneView code={communeCode} units={scopeUnits} onChange={enterCommune}>
            <KpiStrip {...kpiProps} />
            <div className="grid gap-3.5 xl:grid-cols-[1fr_360px] [&>*]:min-w-0">
              <div className="grid gap-3.5 lg:grid-cols-2 [&>*]:min-w-0">
                <Section id="bieu-do-mua" title="Mưa & dự báo 3 giờ tới tại xã" className="scroll-mt-20">
                  <RainfallChart height={250} />
                </Section>
                <Section title="Ngưỡng kích hoạt sạt lở – trạm mưa trong xã">
                  <LandslideScatter height={250} />
                </Section>
                <Section id="du-bao-72h" title="Dự báo mưa 72 giờ – tổ hợp ECMWF + GFS (P10–P90)" className="lg:col-span-2">
                  <AreaForecastChart height={220} />
                </Section>
              </div>
              {logSection({
                title: 'Nhật ký sự kiện của xã',
                limit: 40,
                className: 'xl:sticky xl:top-16 xl:h-[calc(100vh-8.5rem)] xl:self-start xl:overflow-hidden',
                listClass: isLg ? 'h-[60vh] xl:h-full' : undefined,
              })}
            </div>
          </CommuneView>
        </div>
      )}

      {tab === 'ho_chua' && (
        <div ref={ref} className="card p-3 sm:p-5">
          <ReservoirMonitor onSelectOnMap={openOnMap} />
        </div>
      )}

      {tab === 'sat_lo' && (
        <div ref={ref} className="card p-3 sm:p-5">
          <LandslideMonitor onSelectOnMap={openOnMap} />
        </div>
      )}

      {tab === 'tong_hop' && (
        <>
          {/* Vùng chụp PDF: KPI + bản đồ + biểu đồ + nhật ký ("Việc chờ quyết định" không in — việc riêng của người xem) */}
          <div ref={ref} className="flex flex-col gap-2 bg-bg sm:gap-3.5">
            <KpiStrip {...kpiProps} onRiver={focusStation} />
            {/* Thứ tự theo thiết bị (chỉ CSS, không nhân đôi component):
                điện thoại — Việc chờ → bản đồ → biểu đồ → nhật ký; iPad dọc — bản đồ → (Việc chờ | nhật ký) → biểu đồ;
                laptop / iPad ngang — bản đồ + biểu đồ bên trái, cột phải (Việc chờ + nhật ký) dính khi cuộn */}
            {/* grid-cols-1 = minmax(0, 1fr): cột không bị nội dung rộng (hàng nút lọc nhật ký) kéo quá bề rộng màn hình; khối bên
                trong lớp `contents` không nhận [&>*]:min-w-0 nên tự đặt min-w-0 */}
            <div className="grid grid-cols-1 gap-2.5 sm:gap-3.5 md:grid-cols-2 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:grid-cols-[minmax(0,1fr)_360px] [&>*]:min-w-0">
              <TacticalMiniMap k={k} className="order-2 md:order-1 md:col-span-2 lg:order-none lg:col-span-1 lg:col-start-1 lg:row-start-1" />
              <div className="contents lg:sticky lg:top-16 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:flex lg:h-[calc(100vh-8.5rem)] lg:flex-col lg:gap-3.5 lg:self-start print:static print:h-auto">
                <DecisionPanel k={k} kState={kState} className="order-1 min-w-0 md:order-2 md:self-start lg:order-none lg:shrink-0 lg:self-auto" />
                {logSection({
                  title: 'Nhật ký sự kiện & luồng cảnh báo',
                  limit: 60,
                  className: 'order-4 min-w-0 md:order-3 lg:order-none lg:min-h-0 lg:flex-1 lg:overflow-hidden',
                })}
              </div>
              <div className="order-3 grid grid-cols-1 gap-2.5 sm:gap-3.5 md:order-4 md:col-span-2 md:grid-cols-2 lg:order-none lg:col-span-1 lg:col-start-1 lg:row-start-2 lg:grid-cols-1 xl:grid-cols-2 [&>*]:min-w-0">
                <div ref={hydroRef} className="min-w-0 scroll-mt-20">
                  <Section title="Thủy văn – mực nước thực đo & dự báo" {...fold('thuy_van')}>
                    {/* Danh sách trạm (trước đây nằm trong thẻ KPI cao) — chọn trạm để xem biểu đồ */}
                    <StationPicker stations={waterStations} selectedId={activeStation} onSelect={setStationId} />
                    {stationsState.error ? (
                      <ErrorState height={250} onRetry={stationsState.refetch}>Không tải được danh sách trạm mực nước</ErrorState>
                    ) : stationsState.loading ? (
                      <Skeleton height={250} />
                    ) : activeStation ? (
                      <Hydrograph stationId={activeStation} height={250} />
                    ) : (
                      <EmptyState height={250}>Chưa có trạm mực nước trong vùng đang xem — nhập danh mục trạm và ngưỡng BĐ I–III (loại "Trạm quan trắc")</EmptyState>
                    )}
                    {canForecast && waterStations.length > 0 && (
                      <div className="mt-2 flex justify-end no-print">
                        <button type="button" className="btn-ghost min-h-[36px] px-2.5 py-1 text-xs" onClick={() => setBulletinOpen(true)}>
                          Nhập bản tin dự báo KTTV
                        </button>
                      </div>
                    )}
                    {bulletinOpen && <ForecastBulletinModal stations={waterStations} stationId={activeStation} onClose={() => setBulletinOpen(false)} />}
                  </Section>
                </div>
                <Section id="bieu-do-mua" title="Cường độ mưa & dự báo 3 giờ tới" className="scroll-mt-20" {...fold('mua')}>
                  <RainfallChart height={270} />
                </Section>
                <Section id="du-bao-72h" title="Dự báo mưa 72 giờ theo xã – tổ hợp ECMWF + GFS (P10–P90)" className="scroll-mt-20 md:col-span-2 lg:col-span-1 xl:col-span-2" {...fold('du_bao')}>
                  <AreaForecastChart height={230} />
                </Section>
                <Section title="Ngưỡng kích hoạt sạt lở (mưa tích lũy 72h – cường độ)" className={clsx(!canResource && 'md:col-span-2 lg:col-span-1 xl:col-span-2')} {...fold('sat_lo')}>
                  <LandslideScatter height={240} />
                </Section>
                {canResource && (
                  <Section title="Vật tư cứu trợ theo kho (% định mức dự trữ)" {...fold('vat_tu')}>
                    <SuppliesChart height={240} />
                  </Section>
                )}
              </div>
            </div>
          </div>

          <OperationsTable
            k={k}
            kState={kState}
            stations={waterStations}
            stationsState={stationsState}
            onSelectStation={focusStation}
            scopeLabel={filterLabel}
          />
        </>
      )}

      {/* Thanh thao tác nhanh trên điện thoại: "Báo SOS" ở GIỮA, nổi lên (vùng ngón cái của cả hai tay); 112 ở mép
          ngoài, tách khỏi Báo SOS để không bấm nhầm; chỉ hiện nút tài khoản có quyền dùng */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-end gap-1 border-t border-line bg-panel/95 px-2 pb-[calc(0.375rem+env(safe-area-inset-bottom))] pt-1.5 shadow-2xl backdrop-blur sm:hidden print:hidden"
        aria-label="Thao tác nhanh"
      >
        <button type="button" onClick={goRivers} className={clsx(barBtn, 'text-ink')}>
          <Waves size={18} className="text-accent" aria-hidden="true" /> Mực nước
        </button>
        <Link to="/ban-do" className={clsx(barBtn, 'text-ink')}>
          <Compass size={18} className="text-accent" aria-hidden="true" /> Bản đồ
        </Link>
        {canReport ? (
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className={clsx(barBtn, '-mt-5 min-h-[64px] bg-danger text-xs font-black text-white shadow-lg shadow-danger/30 ring-4 ring-panel')}
          >
            <Siren size={22} aria-hidden="true" /> Báo SOS
          </button>
        ) : <span />}
        {canSos ? (
          <Link to="/cuu-ho" className={clsx(barBtn, 'text-ink')}>
            <LifeBuoy size={18} className="text-accent" aria-hidden="true" /> Cứu hộ
          </Link>
        ) : <span />}
        <a href="tel:112" className={clsx(barBtn, 'text-danger')} title="Gọi điện khẩn cấp 112">
          <PhoneCall size={18} aria-hidden="true" /> Gọi 112
        </a>
      </nav>

      {canReport && <QuickIncidentModal open={reportOpen} onClose={() => setReportOpen(false)} />}
    </div>
  );
}
