import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  AlertTriangle, ChevronDown, ChevronUp, Compass, Droplets, FileDown, FileSpreadsheet, FileText, Home, Info, LayoutDashboard, LifeBuoy,
  MapPin, Minimize2, Monitor, Mountain, Pause, Play, Send, Server, Waves, X,
} from 'lucide-react';
import { useAreaQuery, usePresets, useUnits } from '../api/hooks';
import { useStore } from '../app/store';
import { EmptyState, ErrorState, RiskLegend, Section, Segmented, Skeleton } from '../components/common/ui';
import EventLog from '../components/common/EventLog';
import Hydrograph from '../components/charts/Hydrograph';
import RainfallChart from '../components/charts/RainfallChart';
import LandslideScatter from '../components/charts/LandslideScatter';
import SensorHeatmap from '../components/charts/SensorHeatmap';
import ReservoirOpsChart from '../components/charts/ReservoirOpsChart';
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
import PageHeader from '../components/common/PageHeader';
import { PAGE } from '../components/layout/page';
import ReportDocModal from '../components/dashboard/ReportDocModal';
import QuickActionBar from '../components/common/QuickActionBar';
import { useAllowedCodes, useIsCommuneUser, usePermission } from '../rbac/usePermission';
import { vnFileStamp } from '../utils/format';
import { risk } from '../utils/risk';
import { captureSnapshot, exportSnapshotPdf } from '../utils/exportPdf';
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

// Chế độ trình chiếu: xoay vòng các chuyên đề lãnh đạo hay xem trên màn hình lớn (mặc định 60 giây, ?xoay=giây, tối thiểu 15)
const ROTATION = ['tong_hop', 'ho_chua', 'sat_lo'];

/** Đồng hồ lớn của chế độ trình chiếu (thanh trên có đồng hồ — trình chiếu ẩn thanh trên). */
function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono text-xl font-black tabular-nums text-ink">{now.toLocaleTimeString('vi-VN', { ...VN_TIME, hour12: false })}</span>;
}

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
  const { filter, setFilter, clearFilter, toast, auth, wsStatus, setFocus, presentation, setPresentation } = useStore();
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
  const tabs = useMemo(() => TABS.filter((t) => t.id !== 'he_thong' || canSystem), [canSystem]);

  // Tài khoản cấp xã mở thẳng thẻ "Cấp xã / phường" của xã mình
  const isCommuneUser = useIsCommuneUser();
  const defaultTab = isCommuneUser ? 'cap_xa' : 'tong_hop';
  const wanted = params.get('tab') || LEGACY_LEVEL[params.get('level')] || defaultTab;
  const tab = tabs.some((t) => t.id === wanted) ? wanted : defaultTab;

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
  // Hàng thẻ hiển thị: tài khoản cấp xã — thẻ của xã mình đứng đầu, mang tên xã (thẻ mặc định của tài khoản này)
  const tabList = useMemo(() => {
    if (!isCommuneUser) return tabs;
    const mine = { ...tabs.find((t) => t.id === 'cap_xa'), label: scopeUnit ? unitLabel(scopeUnit) : 'Xã của tôi' };
    return [mine, ...tabs.filter((t) => t.id !== 'cap_xa')];
  }, [tabs, isCommuneUser, scopeUnit]);
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
  const activeRow = waterStations.find((s) => s.id === activeStation); // dòng /stations của trạm đang xem
  const [exporting, setExporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [bulletinOpen, setBulletinOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false); // xã xin chi viện lên tỉnh (nút ở trang xã + thanh dưới điện thoại)
  const [docOpen, setDocOpen] = useState(false); // báo cáo văn bản (PDF định dạng chuẩn)
  const [chartsOpen, setChartsOpen] = useState(CHARTS_OPEN);
  const [chartSegment, setChartSegment] = useState('thuy_van'); // 'thuy_van' | 'mua' | 'sat_lo' | 'vat_tu' | 'tat_ca'
  const [opsTableOpen, setOpsTableOpen] = useState(false);
  const [forceOpen, setForceOpen] = useState(false); // đang chụp PDF: mở mọi biểu đồ đang thu gọn, hiện đủ thẻ tab Hồ chứa / Sạt lở
  const ref = useRef(null); // vùng chụp PDF của thẻ đang mở
  const hydroRef = useRef(null);
  const riverRef = useRef(null);

  // Thẻ "Cấp xã" = bộ lọc chung đúng 1 xã (KPI, biểu đồ, nhật ký, bảng đều lọc theo xã đó)
  const communeCode = filter.codes.length === 1 ? filter.codes[0] : '';
  // `remember` = false: thẻ tự chọn sẵn xã đầu tiên — không nhớ qua lần tải lại (chỉ xã người dùng tự chọn mới được nhớ)
  const enterCommune = (code, remember = true) => {
    const u = units.find((x) => x.code === code);
    if (u) setFilter({ codes: [u.code], label: unitLabel(u), presetCode: null }, { remember });
  };
  const setTab = (id) => {
    if (id === 'cap_xa' && !communeCode && scopeUnits.length) enterCommune(scopeUnits[0].code, false);
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
  // (tài khoản cấp xã: phạm vi chính là xã được giao)
  const communeInit = useRef(false);
  useEffect(() => {
    if (tab !== 'cap_xa' || communeInit.current || !scopeUnits.length) return;
    communeInit.current = true;
    if (!communeCode) enterCommune(scopeUnits[0].code, false);
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

  // ---- Chế độ trình chiếu (thiết kế A.1 — màn hình lớn phòng điều hành): nền tối, chỉ còn nội dung, chữ số to, tự xoay
  // vòng Tổng hợp → Hồ chứa → Sạt lở, giữ màn hình sáng. Bật bằng nút "Trình chiếu" hoặc link /dashboard?trinh-chieu=1
  // (máy phòng điều hành tự mở). Thoát: nút "Thoát", phím Esc hoặc rời trang. Không ghi đè lựa chọn sáng / tối đã lưu.
  const [rotatePaused, setRotatePaused] = useState(false);
  const rotateSec = Math.max(15, Number(params.get('xoay')) || 60);
  const enterPresentation = () => {
    setPresentation(true);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('trinh-chieu', '1');
      return next;
    }, { replace: true });
    document.documentElement.requestFullscreen?.().catch(() => {});
  };
  const exitPresentation = () => {
    setPresentation(false);
    setRotatePaused(false);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('trinh-chieu');
      next.delete('xoay');
      return next;
    }, { replace: true });
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  };
  const exitRef = useRef(exitPresentation);
  exitRef.current = exitPresentation;
  const rotateRef = useRef(null);
  rotateRef.current = () => {
    setTab(ROTATION[(ROTATION.indexOf(tab) + 1) % ROTATION.length]);
    document.querySelector('main')?.scrollTo(0, 0);
  };
  // Mở bằng link ?trinh-chieu=1; rời trang khi đang trình chiếu → trả lại thanh trên / menu cho trang khác
  useEffect(() => {
    if (params.get('trinh-chieu') === '1') setPresentation(true);
    return () => useStore.getState().setPresentation(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- chỉ đọc link lúc mở trang
  useEffect(() => {
    if (!presentation) return undefined;
    const root = document.documentElement;
    const before = useStore.getState().theme;
    root.classList.add('dark');
    useStore.setState({ theme: 'dark' }); // biểu đồ đọc bảng màu tối; không ghi vào lựa chọn đã lưu
    let lock = null;
    let full = false;
    const keepAwake = () => navigator.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {});
    keepAwake();
    const onVisible = () => { if (document.visibilityState === 'visible') keepAwake(); };
    const onKey = (e) => { if (e.key === 'Escape') exitRef.current(); };
    const onFull = () => {
      if (document.fullscreenElement) full = true;
      else if (full) exitRef.current(); // Esc thoát toàn màn hình → thoát luôn trình chiếu
    };
    document.addEventListener('visibilitychange', onVisible);
    document.addEventListener('fullscreenchange', onFull);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('fullscreenchange', onFull);
      window.removeEventListener('keydown', onKey);
      lock?.release?.().catch(() => {});
      root.classList.toggle('dark', before === 'dark');
      useStore.setState({ theme: before });
    };
  }, [presentation]);
  useEffect(() => {
    if (!presentation || rotatePaused) return undefined;
    const id = setInterval(() => rotateRef.current(), rotateSec * 1000);
    return () => clearInterval(id);
  }, [presentation, rotatePaused, rotateSec, tab]); // đổi thẻ bằng tay → đếm lại từ đầu

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

  // Trước khi chụp phải mở ra hết, nếu không PDF thiếu nội dung: biểu đồ đang thu gọn (điện thoại), thẻ hồ / điểm sạt lở đang
  // ẩn sau "Xem thêm" (tab Hồ chứa / Sạt lở)
  const withChartsOpen = async (run) => {
    const folded = (isPhone && Object.values(chartsOpen).some((v) => !v)) || tab === 'ho_chua' || tab === 'sat_lo';
    try {
      if (folded) {
        setForceOpen(true);
        await new Promise((r) => { setTimeout(r, 500); }); // biểu đồ vừa hiện cần vẽ lại theo bề rộng thật
      }
      return await run();
    } finally {
      setForceOpen(false);
    }
  };

  const doExport = async () => {
    if (!ref.current) return;
    setExporting(true);
    try {
      const now = new Date();
      await withChartsOpen(() => exportSnapshotPdf(ref.current, {
        title: 'BÁO CÁO NHANH TÌNH HÌNH THIÊN TAI – TỈNH CAO BẰNG',
        subtitle: `Phạm vi: ${filterLabel} · Thời điểm: ${now.toLocaleString('vi-VN', VN_TIME)} · Nguồn: Hệ thống điều hành PCTT & TKCN tỉnh`,
        filename: `bao-cao-nhanh-pctt-cao-bang-${vnFileStamp(now, true)}.pdf`,
        layoutWidth: 1280, // điện thoại / iPad: chụp bố cục laptop (~3 trang) thay vì phóng màn hẹp thành ~19 trang
      }));
    } catch (e) {
      toast({ tone: 'danger', title: 'Không xuất được PDF', body: e.message });
    } finally {
      setExporting(false);
    }
  };

  // Báo cáo văn bản (thiết kế A: PDF định dạng chuẩn gửi UBND tỉnh / Ban Chỉ đạo): số liệu đang hiện trên Tổng quan + phụ lục
  // ảnh chụp tab đang xem. Mô-đun dựng PDF và font chỉ tải khi bấm xuất.
  const exportDoc = async (form) => {
    const now = new Date();
    const snapshot = form.appendix && ref.current
      ? await withChartsOpen(() => captureSnapshot(ref.current, { layoutWidth: 1280 }))
      : null;
    const { exportReportPdf } = await import('../utils/reportPdf');
    return exportReportPdf({
      form,
      at: now,
      scope: filterLabel,
      k,
      stations: waterStations,
      evacSites: evacQ.data?.sites,
      author: auth?.user?.full_name,
      snapshot,
      snapshotLabel: TABS.find((t) => t.id === tab)?.label,
      filename: `bao-cao-van-ban-pctt-cao-bang-${vnFileStamp(now, true)}.pdf`,
    });
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
      [k?.rain?.avg_method === 'thiessen' ? 'Mưa TB lưu vực 24h – theo diện tích, đa giác Thiessen (mm)' : 'Mưa TB 24h các trạm (mm)', k?.rain?.avg_24h],
      ['Mưa 24h lớn nhất (mm)', k?.rain?.max_24h, k?.rain?.max_station],
      ...waterStations.map((s) => {
        const st = riverState(s);
        return [`Mực nước – ${s.name} (m)`, st.value, `${st.label} · ${risk(st.level).name}`];
      }),
      ['Hộ đã sơ tán / kế hoạch', ev.planned_households ? `${ev.evacuated_households}/${ev.planned_households}` : null],
      ['Nhân khẩu đã sơ tán / kế hoạch', ev.planned_persons ? `${ev.evacuated_persons}/${ev.planned_persons}` : null],
      ['SOS chờ xử lý', sos.waiting],
      ['SOS quá hạn phản hồi (theo cấp)', sos.overdue],
      ['SOS chờ quá 15 phút chưa có đội tiếp nhận', sos.no_team_15m],
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
    onRain: () => {
      setChartSegment('mua');
      openChart('mua', 'bieu-do-mua');
    },
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
    <div className={PAGE}>
      {/* 0. Thông tin khẩn luôn trên cùng: dải tình huống (Cam / Đỏ dính khi cuộn) + mất mạng */}
      {k && (
        <SituationBar
          k={k}
          waterStations={waterStations}
          stationsError={stationsState.error}
          rainKnown={rainKnown}
          canSos={canSos}
          canImportStations={canDataImport}
          canSystem={canSystem}
          presentation={presentation}
        />
      )}
      <ConnectionBanner updatedAt={kQ.dataUpdatedAt || null} />

      {/* 1. Đầu trang (dùng chung các trang): phạm vi đang xem · giờ số liệu; Trình chiếu · Xuất · Làm mới. "Báo cáo nhanh"
          nằm cố định trên thanh trên cùng (máy tính) / thanh dưới cùng (điện thoại) */}
      <PageHeader
        className="card px-3 py-2.5 sm:px-4"
        title="Tổng quan tác chiến"
        short="Tổng quan"
        scope={(
          <>
            <span className="truncate" title={filterLabel}>{filterLabel}</span>
            {isFiltered && tab !== 'cap_xa' && (
              <button type="button" onClick={clearFilter} className="tap-sq -my-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted hover:bg-panel2 hover:text-ink" title="Bỏ lọc" aria-label="Bỏ lọc, xem toàn bộ phạm vi">
                <X size={13} aria-hidden="true" />
              </button>
            )}
          </>
        )}
        time={dataTime}
        timeNote={kState.error ? 'Chưa tải được số liệu' : 'Đang tải số liệu…'}
        meta={[
          role && <span key="role" className="hidden 2xl:inline">{role}</span>,
          // Điện thoại / iPad dọc: thang màu gọn vào "Thang màu" (chạm để mở) ngay trên dòng ngữ cảnh — không thêm một dòng
          <details key="thang-mau" className="md:hidden">
            <summary className="touch-hit flex cursor-pointer list-none items-center gap-1 font-semibold text-accent [&::-webkit-details-marker]:hidden">
              <Info size={13} aria-hidden="true" /> Thang màu
            </summary>
            <RiskLegend className="mt-1" />
          </details>,
        ]}
        actions={presentation ? (
          <>
            <LiveClock />
            <button type="button" onClick={() => setRotatePaused((v) => !v)} aria-pressed={rotatePaused} className="btn-secondary h-9 px-2.5" title={`Tự chuyển chuyên đề sau mỗi ${rotateSec} giây`}>
              {rotatePaused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />} {rotatePaused ? 'Tiếp tục xoay vòng' : 'Tạm dừng xoay vòng'}
            </button>
            <button type="button" onClick={exitPresentation} className="btn-secondary h-9 px-2.5">
              <Minimize2 size={14} aria-hidden="true" /> Thoát trình chiếu
            </button>
          </>
        ) : (
          <button type="button" onClick={enterPresentation} className="btn-secondary tap-sq hidden h-9 px-2.5 lg:inline-flex" aria-label="Chế độ trình chiếu màn hình lớn" title="Trình chiếu trên màn hình lớn phòng điều hành: nền tối, chữ số to, tự xoay vòng chuyên đề">
            <Monitor size={15} aria-hidden="true" /> <span className="hidden xl:inline">Trình chiếu</span>
          </button>
        )}
        exports={presentation ? undefined : [
          { key: 'anh', label: 'Ảnh chụp tình hình (PDF)', hint: 'Chỉ số, bản đồ, biểu đồ của thẻ đang xem — gửi nhanh qua Zalo, email', icon: FileDown, onClick: doExport, busy: exporting },
          { key: 'van-ban', label: 'Báo cáo văn bản (PDF)', hint: 'Quốc hiệu, số liệu, đánh giá – kiến nghị, chỗ ký — gửi UBND tỉnh / Ban Chỉ đạo', icon: FileText, onClick: () => setDocOpen(true), disabled: !k },
          { key: 'excel', label: 'Bảng số liệu (Excel)', hint: 'Chỉ số, trạm, hồ chứa, sạt lở trong vùng đang xem', icon: FileSpreadsheet, onClick: doExcel, disabled: !k },
        ]}
        onRefresh={presentation ? undefined : refresh}
        refreshing={refreshing}
      >
        <div className="hidden flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted sm:flex">
          {/* Thang màu: hiện sẵn từ md (dưới md: "Thang màu" trên dòng ngữ cảnh) */}
          <RiskLegend className="hidden md:flex" meaningClass="hidden xl:inline" />
          {/* Tài khoản xã chỉ có xã mình → không có lưu vực để chọn. Điện thoại: chọn lưu vực ở bộ lọc trong menu ☰ (cùng
              danh sách nhóm) — không chiếm thêm một dòng trước hàng KPI */}
          {tab === 'tong_hop' && !presentation && scope === null && basinPresets.length > 0 && (
            <label className="hidden items-center gap-1.5 no-print sm:flex">
              <MapPin size={12} aria-hidden="true" />
              <span className="hidden xl:inline">Lưu vực</span>
              <select className="input tap min-h-[32px] w-auto max-w-[13rem] py-0.5 text-[11px]" value={basinValue} onChange={(e) => pickBasin(e.target.value)} aria-label="Lọc theo lưu vực">
                <option value="">Toàn tỉnh</option>
                {basinValue === 'khac' && <option value="khac" disabled>{filter.label}</option>}
                {basinPresets.map((p) => <option key={p.code} value={p.code}>{p.name} ({p.unit_codes.length} xã)</option>)}
              </select>
            </label>
          )}
        </div>
      </PageHeader>

      {k && kQ.isError && online && (
        <div role="alert" className="card flex flex-wrap items-center justify-between gap-2 border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          <span className="flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0" aria-hidden="true" />
            Không tải được chỉ số mới từ máy chủ — số trên màn hình là lần tải trước.
          </span>
          <button type="button" onClick={refresh} className="btn-danger min-h-[36px] px-2.5 py-1 text-xs">Thử lại</button>
        </div>
      )}

      {/* 2. Một hàng thẻ: tổng hợp · chuyên đề · cấp xã · hệ thống — cùng kiểu gạch chân với thẻ các trang khác (ui.jsx Tabs);
          điện thoại cuộn ngang trong hàng */}
      <div className="scroll-thin -mx-1 flex items-end gap-1 overflow-x-auto border-b border-line px-1 no-print" role="tablist" aria-label="Nội dung tổng quan">
        {tabList.map((t) => {
          const badge = tabBadge[t.id];
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                'tap -mb-px flex min-h-[42px] shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors',
                tab === t.id ? 'border-accent font-semibold text-accent' : 'border-transparent text-muted hover:text-ink',
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
          <CommuneView code={communeCode} units={scopeUnits} onChange={(code) => enterCommune(code)} onSupport={() => setSupportOpen(true)}>
            <div className="grid gap-3.5 xl:grid-cols-[1fr_360px] [&>*]:min-w-0">
              <div className="grid gap-3.5 lg:grid-cols-2 [&>*]:min-w-0">
                {/* Biểu đồ số đo trạm chỉ khi xã có trạm đo mưa — không thì 2 khung trống "chưa có số đo" chiếm nửa trang */}
                {rainStations > 0 && (
                  <>
                    <Section id="bieu-do-mua" title="Mưa & dự báo 3 giờ tới tại xã" className="scroll-mt-20">
                      <RainfallChart height={250} />
                    </Section>
                    <Section title="Ngưỡng kích hoạt sạt lở – trạm mưa trong xã">
                      <LandslideScatter height={250} />
                    </Section>
                  </>
                )}
                <Section id="du-bao-72h" title="Dự báo mưa 72 giờ tới" className="lg:col-span-2">
                  <p className="mb-2 text-xs text-muted">
                    {!stationsState.loading && rainStations === 0 && 'Xã chưa có trạm đo mưa — theo dõi bằng dự báo mô hình. '}
                    Tổ hợp mô hình quốc tế ECMWF + GFS: đường = khả năng nhất, vùng tô = khoảng có thể xảy ra (P10–P90).
                  </p>
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
          <ReservoirMonitor areaScoped showAll={forceOpen} onSelectOnMap={openOnMap} />
        </div>
      )}

      {tab === 'sat_lo' && (
        // Cảm biến cảnh báo sớm lên đầu (thiết kế A: heatmap chuỗi thời gian độ nghiêng / độ ẩm đất), rồi điểm đen & đường đèo
        <div ref={ref} className="flex flex-col gap-2.5 bg-bg sm:gap-3.5">
          <Section title="Cảm biến cảnh báo sớm sạt lở · 48 giờ qua (độ nghiêng taluy, độ ẩm đất)">
            <SensorHeatmap />
          </Section>
          <div className="card p-3 sm:p-5">
            <LandslideMonitor areaScoped showAll={forceOpen} onSelectOnMap={openOnMap} />
          </div>
        </div>
      )}

      {tab === 'tong_hop' && (
        <>
          {/* Vùng chụp PDF: KPI + bản đồ + biểu đồ + nhật ký ("Việc chờ quyết định" không in — việc riêng của người xem) */}
          <div ref={ref} className="flex flex-col gap-2 bg-bg sm:gap-3.5">
            <KpiStrip
              {...kpiProps}
              onRiver={(id) => {
                setChartSegment('thuy_van');
                focusStation(id);
              }}
              large={presentation}
            />

            {/* Khung điều hành chính: 2 Cột (Trái: Bản đồ tác chiến & Biểu đồ chuyên đề; Phải: Việc chờ quyết định & Nhật ký realtime) */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px] [&>*]:min-w-0">
              {/* CỘT TRÁI: Bản đồ tác chiến & Giám sát Chuyên đề */}
              <div className="flex flex-col gap-3 min-w-0">
                {/* 1. Bản đồ tác chiến trực quan */}
                <TacticalMiniMap k={k} className="min-w-0 shadow-sm" />

                {/* 2. Biểu đồ theo chuyên đề — xem một chuyên đề một lúc (bớt rối cho lãnh đạo) hoặc "Tất cả" */}
                <div className="card p-2 sm:p-2.5">
                  <Segmented
                    label="Chuyên đề biểu đồ"
                    value={chartSegment}
                    onChange={setChartSegment}
                    options={[
                      { value: 'thuy_van', label: 'Thủy văn & hồ chứa', short: 'Thủy văn', icon: Waves },
                      { value: 'mua', label: 'Mưa & dự báo', short: 'Mưa', icon: Droplets },
                      { value: 'sat_lo', label: 'Sạt lở & cảm biến', short: 'Sạt lở', icon: Mountain },
                      canResource && { value: 'vat_tu', label: 'Kho & vật tư', short: 'Kho', icon: Server },
                      { value: 'tat_ca', label: 'Tất cả', hint: 'Xem mọi biểu đồ cùng lúc' },
                    ].filter(Boolean)}
                  />

                  {/* VÙNG NỘI DUNG BIỂU ĐỒ THEO CHUYÊN ĐỀ ĐƯỢC CHỌN */}
                  <div className="mt-3 space-y-3">
                    {/* CHUYÊN ĐỀ 1: THỦY VĂN & HỒ CHỨA */}
                    {(chartSegment === 'thuy_van' || chartSegment === 'tat_ca' || forceOpen) && (
                      <div ref={hydroRef} className="min-w-0 scroll-mt-20">
                        <Section title="Thủy văn – Mực nước thực đo & Vận hành xả lũ hồ chứa" {...fold('thuy_van')}>
                          <StationPicker stations={waterStations} selectedId={activeStation} onSelect={setStationId} />
                          {stationsState.error ? (
                            <ErrorState height={250} onRetry={stationsState.refetch}>Không tải được danh sách trạm mực nước</ErrorState>
                          ) : stationsState.loading ? (
                            <Skeleton height={250} />
                          ) : activeStation ? (
                            <Hydrograph stationId={activeStation} station={activeRow} height={250} syncId="thuy-van">
                              {(xDomain, xTicks) => <ReservoirOpsChart river={activeRow?.river} xDomain={xDomain} xTicks={xTicks} syncId="thuy-van" />}
                            </Hydrograph>
                          ) : (
                            <EmptyState height={250}>Chưa có trạm mực nước trong vùng đang xem</EmptyState>
                          )}
                          {canForecast && !presentation && waterStations.length > 0 && (
                            <div className="mt-2 flex justify-end no-print">
                              <button type="button" className="btn-ghost tap min-h-[34px] px-2.5 py-1 text-xs" onClick={() => setBulletinOpen(true)}>
                                Nhập bản tin dự báo KTTV
                              </button>
                            </div>
                          )}
                          {bulletinOpen && <ForecastBulletinModal stations={waterStations} stationId={activeStation} onClose={() => setBulletinOpen(false)} />}
                        </Section>
                      </div>
                    )}

                    {/* CHUYÊN ĐỀ 2: MƯA QPF & DỰ BÁO TỔ HỢP 72H */}
                    {(chartSegment === 'mua' || chartSegment === 'tat_ca' || forceOpen) && (
                      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                        <Section id="bieu-do-mua" title="Cường độ mưa & Dự báo 3 giờ tới (Nowcast)" className="scroll-mt-20" {...fold('mua')}>
                          <RainfallChart height={260} />
                        </Section>
                        <Section id="du-bao-72h" title="Dự báo mưa 72h tổ hợp ECMWF + GFS (P10–P90)" className="scroll-mt-20" {...fold('du_bao')}>
                          <AreaForecastChart height={260} />
                        </Section>
                      </div>
                    )}

                    {/* CHUYÊN ĐỀ 3: SẠT LỞ & CẢM BIẾN TALUY */}
                    {(chartSegment === 'sat_lo' || chartSegment === 'tat_ca' || forceOpen) && (
                      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                        <Section title="Ngưỡng kích hoạt sạt lở (Mưa tích lũy 72h – Cường độ)" {...fold('sat_lo')}>
                          <LandslideScatter height={250} />
                        </Section>
                        <Section title="Cảm biến cảnh báo sớm (Độ nghiêng & Độ ẩm đất)" {...fold('sat_lo')}>
                          <SensorHeatmap height={250} />
                        </Section>
                      </div>
                    )}

                    {/* CHUYÊN ĐỀ 4: KHO & VẬT TƯ */}
                    {canResource && (chartSegment === 'vat_tu' || chartSegment === 'tat_ca' || forceOpen) && (
                      <Section title="Vật tư cứu trợ theo kho (% định mức dự trữ an toàn)" {...fold('vat_tu')}>
                        <SuppliesChart height={250} />
                      </Section>
                    )}
                  </div>
                </div>
              </div>

              {/* CỘT PHẢI: Quyết định khẩn & Nhật ký realtime (Cố định khi cuộn trên màn hình lớn). Điện thoại: cột tan ra
                  (contents) để "Việc chờ quyết định" lên đầu trang, nhật ký xuống cuối — chỉ CSS, không nhân đôi component */}
              <div className="contents md:flex md:min-w-0 md:flex-col md:gap-3 lg:sticky lg:top-16 lg:h-[calc(100vh-8.5rem)] lg:self-start print:static print:h-auto">
                {!presentation && (
                  <DecisionPanel k={k} kState={kState} className="min-w-0 shrink-0 shadow-sm max-md:order-first" />
                )}
                {logSection({
                  title: 'Nhật ký sự kiện & luồng tác chiến',
                  limit: 60,
                  className: 'min-w-0 flex-1 overflow-hidden shadow-sm',
                })}
              </div>
            </div>
          </div>

          {/* 3. Bảng tác chiến theo chuyên đề — thu gọn sẵn thành một thanh (tóm tắt + nút mở); mở ra là chính bảng */}
          {!presentation && (opsTableOpen ? (
            <div id="bang-tac-chien" className="flex flex-col gap-1.5">
              <OperationsTable
                k={k}
                kState={kState}
                stations={waterStations}
                stationsState={stationsState}
                onSelectStation={focusStation}
                scopeLabel={filterLabel}
              />
              <button type="button" onClick={() => setOpsTableOpen(false)} aria-expanded="true" aria-controls="bang-tac-chien" className="btn-ghost tap self-center px-3">
                Thu gọn bảng <ChevronUp size={14} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="card flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2.5">
              <div className="min-w-0">
                <h2 className="card-title">
                  <FileSpreadsheet size={15} className="text-accent" aria-hidden="true" /> Bảng tác chiến theo chuyên đề
                </h2>
                <p className="num mt-0.5 text-xs text-muted">
                  {waterStations.length} trạm mực nước · {k?.reservoirs?.total || 0} hồ chứa · {k?.sos?.waiting || 0} phiếu SOS chờ · {k?.forces?.ready || 0} người sẵn sàng
                </p>
              </div>
              <button type="button" onClick={() => setOpsTableOpen(true)} aria-expanded="false" aria-controls="bang-tac-chien" className="btn-secondary tap h-9 px-3">
                Mở bảng dữ liệu chi tiết <ChevronDown size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
        </>
      )}

      {/* Thanh thao tác nhanh trên điện thoại (khung chung: Báo SOS giữa, 112 mép phải); chỉ hiện nút tài khoản có quyền dùng */}
      <QuickActionBar
        slots={[
          isCommuneUser
            ? { key: 'chi-vien', label: 'Chi viện', icon: Send, onClick: () => setSupportOpen(true) }
            : { key: 'muc-nuoc', label: 'Mực nước', icon: Waves, onClick: goRivers },
          { key: 'ban-do', label: 'Bản đồ', icon: Compass, to: '/ban-do' },
          canSos ? { key: 'cuu-ho', label: 'Cứu hộ', icon: LifeBuoy, to: '/cuu-ho' } : null,
        ]}
        onSos={canReport ? () => setReportOpen(true) : null}
      />

      {canReport && <QuickIncidentModal open={reportOpen} onClose={() => setReportOpen(false)} />}
      {/* Xã xin chi viện lên tỉnh: cùng hộp thoại báo cáo nhanh, chế độ support (phiếu SOS gắn thẻ — rescueFacts) */}
      {supportOpen && <QuickIncidentModal open onClose={() => setSupportOpen(false)} support />}
      <ReportDocModal
        open={docOpen}
        onClose={(pages) => {
          setDocOpen(false);
          if (pages) toast({ tone: 'good', title: `Đã xuất báo cáo văn bản (${pages} trang)`, duration: 3500 });
        }}
        onExport={exportDoc}
        summary={{
          ready: !!k,
          scope: filterLabel,
          tabLabel: TABS.find((t) => t.id === tab)?.label || 'Tổng quan',
          stations: waterStations.length,
          reservoirs: k?.reservoirs?.total || 0,
          landslides: (k?.landslides?.blocked_count || 0) + (k?.landslides?.warning_count || 0),
        }}
      />
    </div>
  );
}
