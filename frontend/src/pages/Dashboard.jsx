import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  AlertTriangle, CheckSquare, ChevronDown, ChevronUp, CloudRain, Columns2, Compass, FileDown, FileSpreadsheet, FileText, Home, LayoutDashboard, LifeBuoy,
  Minimize2, Monitor, Mountain, Pause, Play, Send, Server, Waves, X,
} from 'lucide-react';
import { useAreaQuery, useUnits } from '../api/hooks';
import { useStore } from '../app/store';
import { EmptyState, ErrorState, Hint, RiskLegend, Section, Segmented, Skeleton } from '../components/common/ui';
import RoleTips from '../components/common/RoleTips';
import EventLog from '../components/common/EventLog';
import Hydrograph from '../components/charts/Hydrograph';
import RainfallChart from '../components/charts/RainfallChart';
import LandslideScatter from '../components/charts/LandslideScatter';
import SensorHeatmap from '../components/charts/SensorHeatmap';
import SuppliesChart from '../components/charts/SuppliesChart';
import AreaForecastChart from '../components/charts/AreaForecastChart';
import ForecastBulletinModal from '../components/charts/ForecastBulletinModal';
import KpiStrip from '../components/dashboard/KpiStrip';
import DecisionPanel from '../components/dashboard/DecisionPanel';
import { riverState, StationPicker } from '../components/dashboard/RiverKpi';
import SituationBar from '../components/dashboard/SituationBar';
import SituationSummary, { LevelHint } from '../components/dashboard/SituationSummary';
import { forecastTitle, hydroTitle, landslideTitle, rainTitle, suppliesTitle } from '../components/dashboard/chartTitles';
import ConnectionBanner from '../components/dashboard/ConnectionBanner';
import TacticalMiniMap, { buildHotspots } from '../components/dashboard/TacticalMiniMap';
import OperationsTable from '../components/dashboard/OperationsTable';
import CommuneView, { unitLabel } from '../components/dashboard/CommuneView';
import SystemView from '../components/dashboard/SystemView';
import QuickIncidentModal from '../components/dashboard/QuickIncidentModal';
import PageHeader from '../components/common/PageHeader';
import ProvinceArt from '../components/layout/ProvinceArt';
import { PAGE } from '../components/layout/page';
import ReportDocModal from '../components/dashboard/ReportDocModal';
import QuickActionBar from '../components/common/QuickActionBar';
import { useAllowedCodes, useIsCommuneUser, usePermission } from '../rbac/usePermission';
import { num, vnFileStamp } from '../utils/format';
import { rainLevel, risk } from '../utils/risk';
import { captureSnapshot, exportSnapshotPdf } from '../utils/exportPdf';
import { exportExcel } from '../utils/exportExcel';
import { useMediaQuery } from '../utils/useMediaQuery';
import { useOnline } from '../utils/useOnline';
import LandslideMonitor from './public/LandslideMonitor';

const VN_TIME = { timeZone: 'Asia/Ho_Chi_Minh' };
// Một hàng thẻ duy nhất (trước đây 2 hàng: góc nhìn + chuyên đề, trùng chữ "Tổng hợp"); ?tab= để gửi link / tải lại
const TABS = [
  { id: 'tong_hop', label: 'Tổng hợp', icon: LayoutDashboard },
  // 3 nhóm thiên tai hệ thống nhấn mạnh (docs/pham-vi-thien-tai.md): Mưa lớn · Sạt lở, lũ quét · Ngập lụt
  { id: 'mua_lon', label: 'Mưa lớn', icon: CloudRain },
  { id: 'sat_lo', label: 'Sạt lở, lũ quét', icon: Mountain },
  { id: 'ngap_lut', label: 'Ngập lụt', icon: Waves },
  { id: 'cap_xa', label: 'Cấp xã / phường', icon: Home },
  { id: 'he_thong', label: 'Hệ thống & dữ liệu', icon: Server },
];
const LEGACY_LEVEL = { tinh: 'tong_hop', xa: 'cap_xa', he_thong: 'he_thong' }; // link cũ ?level=… (trước 10/2026)
// Điện thoại: biểu đồ thu gọn được (chỉ ẩn — số liệu vẫn tải như cũ); Thủy văn mở sẵn, còn lại đóng để lãnh đạo không phải
// cuộn qua 5 biểu đồ mới tới nhật ký / bảng
const CHARTS_OPEN = { thuy_van: true, mua: false, du_bao: false, sat_lo: false, vat_tu: false };

// Nút "?" cạnh tiêu đề biểu đồ: một câu giải thích thuật ngữ / nguồn số liệu (tên mô hình để ở đây, không lên tiêu đề)
const HYDRO_HINT = (
  <Hint label="Biểu đồ mực nước">
    Đường liền: mực nước đo được; nét đứt (vùng ghi "Dự báo"): bản tin dự báo thủy văn do trực ban nhập — chưa có bản tin
    thì là đường mô phỏng, luôn ghi rõ. Ba vạch ngang là mức Báo động I, II, III của trạm. Biểu đồ dưới: lượng xả của hồ
    chứa trên cùng sông.
  </Hint>
);
const RAIN_HINT = (
  <Hint label="Biểu đồ mưa">
    Cột: lượng mưa từng giờ (trung bình lưu vực, trạm đại diện vùng rộng tính nặng hơn). Cột nhạt viền đứt ở cuối: dự báo
    3 giờ tới của mô hình thời tiết số (Open-Meteo), không phải đo radar. Đường dưới: mưa cộng dồn.
  </Hint>
);
const FORECAST_HINT = (
  <Hint label="Dự báo mưa 3 ngày">
    Kết hợp hai bộ dự báo tổ hợp quốc tế (ECMWF của châu Âu, GFS của Mỹ) qua Open-Meteo. Đường đậm là lượng mưa có khả năng
    nhất; vùng tô là khoảng có thể xảy ra (10% thấp nhất đến 10% cao nhất của các phương án dự báo).
  </Hint>
);
const LANDSLIDE_HINT = (
  <Hint label="Ngưỡng sạt lở theo mưa">
    Mỗi chấm là một trạm đo mưa: trục ngang là mưa 3 ngày qua, trục dọc là cường độ mưa hiện tại. Vượt đường nét đứt Vàng /
    Cam / Đỏ là nguy cơ sạt lở tăng theo mức đó. Căn cứ của đường ngưỡng ghi ngay dưới biểu đồ (chưa khai báo thì là đường
    minh hoạ); cán bộ nhập dữ liệu sửa ngưỡng ở trang Nhập dữ liệu → Ngưỡng cảnh báo.
  </Hint>
);
const SUPPLIES_HINT = (
  <Hint label="Định mức dự trữ">
    Lượng hàng tối thiểu mỗi kho phải có sẵn. Phần màu: số hiện có so với định mức; phần xám: phần còn thiếu. Dưới 20% là
    cạn kiệt, cần bổ sung ngay.
  </Hint>
);

// Chế độ trình chiếu: xoay vòng các chuyên đề lãnh đạo hay xem trên màn hình lớn (mặc định 60 giây, ?xoay=giây, tối thiểu 15)
const ROTATION = ['tong_hop', 'mua_lon', 'sat_lo', 'ngap_lut'];

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
 * Tổng quan (thiết kế mục A) — trả lời trong 5 giây "Chỗ nào đang nguy hiểm nhất? Việc gì đang chờ tôi quyết định?".
 * Bố cục theo thiết bị — số liệu / API như cũ:
 * - đầu trang: dải khẩn (Cam / Đỏ, dính khi cuộn) → MỘT câu tóm tắt tình hình + "Nguy hiểm nhất" (SituationSummary) → thẻ;
 * - laptop / iPad ngang (≥ 1024 px): "Việc chờ quyết định" (trái) cạnh 6 ô chỉ số 3×2 → bản đồ + biểu đồ bên trái, nhật
 *   ký cột phải dính khi cuộn → bảng số liệu chi tiết (thu gọn sẵn);
 * - iPad dọc: Việc chờ → 6 ô 3×2 → bản đồ | nhật ký → biểu đồ;
 * - điện thoại: 6 ô 2×3 (thấy trọn cùng dải khẩn, không cuộn) → Việc chờ → bản đồ → biểu đồ thu gọn được → nhật ký
 *   5 mục → bảng dạng thẻ; thanh đáy.
 * Lần đầu mở: gợi ý 3 bước theo vai trò (RoleTips, tắt được, nhớ trên máy). Tiêu đề biểu đồ là câu kết luận (chartTitles.js).
 */
export default function Dashboard() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const online = useOnline();
  const isLg = useMediaQuery('(min-width: 1024px)'); // laptop / iPad ngang: nhật ký là cột phải, dính khi cuộn
  const isPhone = !useMediaQuery('(min-width: 640px)');
  const [params, setParams] = useSearchParams();
  const { filter, setFilter, clearFilter, toast, auth, wsStatus, setFocus, presentation, setPresentation } = useStore();
  // Màn lớn của lãnh đạo (≥ 1680 px — màn rời, TV phòng điều hành; cả chế độ trình chiếu): 2 cột — việc chờ + 6 ô số bên
  // trái, bản đồ điểm nóng lớn bên phải (docs/ke-hoach-lam-moi-giao-dien.md mục 6.3); mở rộng một bên / thu gọn bên kia theo
  // lựa chọn của người xem (nhớ trên máy). Laptop 1366–1600 px giữ 1 cột: 2 cột đẩy 6 ô số ra khỏi màn hình đầu (1440 × 900:
  // hàng ô cuối bị thanh trạng thái che)
  const bigScreen = useMediaQuery('(min-width: 1680px)');
  const [heroLayout, setHeroLayoutState] = useState(() => {
    try {
      const saved = localStorage.getItem('pctt_dashboard_hero_layout');
      if (saved === 'left_full' || saved === 'right_full' || saved === 'split') return saved;
    } catch { /* bỏ qua */ }
    return 'split';
  });
  const setHeroLayout = (layout) => {
    setHeroLayoutState(layout);
    try {
      localStorage.setItem('pctt_dashboard_hero_layout', layout);
    } catch { /* bỏ qua */ }
  };
  // Trình chiếu (TV phòng điều hành) luôn chia 2 cột, đủ 6 ô số — lựa chọn thu gọn của người xem trên máy không áp vào
  const layout = presentation ? 'split' : heroLayout;
  const layoutProps = presentation ? {} : { heroLayout: layout, onSetHeroLayout: setHeroLayout };
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
  const [chartSegment, setChartSegment] = useState('mua'); // 'mua' | 'sat_lo' | 'thuy_van' | 'vat_tu' | 'tat_ca' — theo 3 nhóm thiên tai
  const [forceOpen, setForceOpen] = useState(false); // đang chụp PDF: mở mọi biểu đồ đang thu gọn, hiện đủ thẻ tab Sạt lở
  const showSeg = (id) => tab === 'tong_hop' && (chartSegment === id || chartSegment === 'tat_ca' || forceOpen);
  const { data: supplies } = useAreaQuery('supplies', '/dashboard/supplies', {}, { enabled: (tab === 'he_thong' || showSeg('vat_tu')) && canResource });
  // Tiêu đề kết luận của biểu đồ + "Nguy hiểm nhất": CÙNG khoá / tuỳ chọn truy vấn với biểu đồ, bản đồ điểm nóng (TanStack
  // gộp — không thêm lượt gọi); chỉ tải khi chuyên đề đang hiện
  const { data: rainfall } = useAreaQuery('rainfall', '/dashboard/rainfall', {}, { refetchInterval: 60_000, enabled: tab === 'tong_hop' || tab === 'mua_lon' });
  const { data: fcAreas } = useAreaQuery('forecast-areas', '/forecast/areas', { hours: 72 }, { refetchInterval: 10 * 60_000, enabled: showSeg('mua') || tab === 'mua_lon' });
  const { data: lsRisk } = useAreaQuery('landslide', '/dashboard/landslide-risk', {}, { refetchInterval: 60_000, enabled: showSeg('sat_lo') });
  const { data: layers } = useAreaQuery('map-layers', '/map/layers', {}, { refetchInterval: 30_000, enabled: tab !== 'cap_xa' });
  const hotspots = useMemo(() => buildHotspots(layers, k), [layers, k]);
  const [mapFocus, setMapFocus] = useState(null); // "Xem trên bản đồ" của câu "Nguy hiểm nhất" → bản đồ điểm nóng bay tới
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
  const [opsTableOpen, setOpsTableOpen] = useState(false);
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
  // vòng Tổng hợp → Mưa lớn → Sạt lở, lũ quét → Ngập lụt, giữ màn hình sáng. Bật bằng nút "Trình chiếu" hoặc link /dashboard?trinh-chieu=1
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

  // Trước khi chụp phải mở ra hết, nếu không PDF thiếu nội dung: biểu đồ đang thu gọn (điện thoại), thẻ điểm sạt lở đang
  // ẩn sau "Xem thêm" (tab Sạt lở)
  const withChartsOpen = async (run) => {
    const folded = (isPhone && Object.values(chartsOpen).some((v) => !v)) || tab === 'sat_lo';
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
      [k?.rain?.avg_method === 'thiessen' ? 'Mưa trung bình lưu vực 24 giờ – theo diện tích, đa giác Thiessen (mm)' : 'Mưa trung bình 24 giờ các trạm (mm)', k?.rain?.avg_24h],
      ['Mưa 24 giờ lớn nhất (mm)', k?.rain?.max_24h, k?.rain?.max_station],
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
        // Trạng thái nhận tin tức thời — chữ thường, không nhấp nháy
        wsStatus === 'online'
          ? <span className="shrink-0 whitespace-nowrap text-xs text-muted">Tự cập nhật</span>
          : <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-warn">Mất kết nối — đang thử lại</span>
      }
    >
      <EventLog className={listClass} limit={limit} preview={isLg ? undefined : 5} />
    </Section>
  );
  const ls = k?.landslides;
  // Huy hiệu trên tab 3 nhóm: mưa 24 giờ lớn nhất (từ Mưa to), số trạm mực nước vượt báo động, điểm sạt lở cấm đường / cảnh báo
  const rainLv = rainLevel(k?.rain?.max_24h);
  const riverLv = waterStations.map((s) => riverState(s).level ?? 0);
  const riversAbove = riverLv.filter((lv) => lv >= 1).length;
  const tabBadge = {
    mua_lon: rainLv >= 1 ? { text: `${num(k.rain.max_24h, 0)} mm`, level: rainLv } : null,
    ngap_lut: riversAbove ? { text: `${riversAbove} trạm vượt`, level: Math.max(...riverLv) } : null, // gọn: hàng 6 tab vừa laptop 1366
    sat_lo: ls?.blocked_count ? { text: `${ls.blocked_count} cấm đường`, level: 3 } : ls?.warning_count ? { text: `${ls.warning_count} cảnh báo`, level: 2 } : null,
  };
  // Biểu đồ mực nước (thực đo + bản tin dự báo, vạch Báo động I–III) và chọn trạm — chuyên đề "Ngập lụt" của Tổng hợp, tab Ngập lụt
  const hydroBody = (height) => (
    <>
      <StationPicker stations={waterStations} selectedId={activeStation} onSelect={setStationId} />
      {stationsState.error ? (
        <ErrorState height={height} onRetry={stationsState.refetch}>Không tải được danh sách trạm mực nước</ErrorState>
      ) : stationsState.loading ? (
        <Skeleton height={height} />
      ) : activeStation ? (
        <Hydrograph stationId={activeStation} station={activeRow} height={height} syncId="thuy-van" />
      ) : (
        <EmptyState height={height} icon={Waves}>Chưa có trạm mực nước trong vùng đang xem</EmptyState>
      )}
      {canForecast && !presentation && waterStations.length > 0 && (
        <div className="mt-2 flex justify-end no-print">
          <button type="button" className="btn-ghost tap min-h-[34px] px-2.5 py-1 text-xs" onClick={() => setBulletinOpen(true)}>
            Nhập bản tin dự báo thủy văn
          </button>
        </div>
      )}
      {bulletinOpen && <ForecastBulletinModal stations={waterStations} stationId={activeStation} onClose={() => setBulletinOpen(false)} />}
    </>
  );
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
          quiet
        />
      )}
      <ConnectionBanner updatedAt={kQ.dataUpdatedAt || null} />

      {/* 1. Đầu trang (dùng chung các trang): phạm vi đang xem · giờ số liệu; Trình chiếu · Xuất · Làm mới. "Báo cáo nhanh"
          nằm cố định trên thanh trên cùng (máy tính) / thanh dưới cùng (điện thoại) */}
      <PageHeader
        // Khối nổi bật xanh đêm (diện mạo phòng chỉ huy — đợt 2): lớp `dark` riêng cho khối → chữ, nút, ô chọn bên trong dùng
        // bảng màu tối đã kiểm tương phản; hình ranh giới tỉnh mờ bên phải (trang trí, trình đọc màn hình bỏ qua)
        className="card dark hero-brand relative isolate overflow-hidden border-white/10 px-3 py-2.5 sm:px-4"
        data-mau-chuyen="" // màu chuyển đã duyệt (kế hoạch giao diện mục 12) — ui-test bỏ qua
        title="Tổng quan"
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
          // Thang màu chỉ hiện thường trực khi trình chiếu màn hình lớn; màn thường: nút "?" bên cạnh đã giải thích đủ
          presentation && <RiskLegend key="thang-mau" className="hidden md:flex" meaningClass="hidden xl:inline" />,
          !presentation && <LevelHint key="giai-thich" />,
        ]}
        actions={presentation ? (
          <>
            <LiveClock />
            <button type="button" onClick={() => setRotatePaused((v) => !v)} aria-pressed={rotatePaused} className="btn-secondary h-9 px-2.5" title={`Tự chuyển chuyên đề sau mỗi ${rotateSec} giây`}>
              {rotatePaused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />} {rotatePaused ? 'Tiếp tục tự chuyển' : 'Dừng tự chuyển'}
            </button>
            <button type="button" onClick={exitPresentation} className="btn-secondary h-9 px-2.5">
              <Minimize2 size={14} aria-hidden="true" /> Thoát trình chiếu
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={enterPresentation} className="btn-secondary tap-sq hidden h-9 px-2.5 lg:inline-flex" aria-label="Chế độ trình chiếu màn hình lớn" title="Trình chiếu trên màn hình lớn phòng điều hành: nền tối, chữ số to, tự chuyển chuyên đề">
              <Monitor size={15} aria-hidden="true" /> <span className="hidden xl:inline">Trình chiếu</span>
            </button>
          </>
        )}
        exports={presentation ? undefined : [
          { key: 'anh', label: 'Ảnh chụp tình hình (PDF)', hint: 'Chỉ số, bản đồ, biểu đồ của thẻ đang xem — gửi nhanh qua Zalo, email', icon: FileDown, onClick: doExport, busy: exporting },
          { key: 'van-ban', label: 'Báo cáo văn bản (PDF)', hint: 'Quốc hiệu, số liệu, đánh giá – kiến nghị, chỗ ký — gửi UBND tỉnh / Ban Chỉ đạo', icon: FileText, onClick: () => setDocOpen(true), disabled: !k },
          { key: 'excel', label: 'Bảng số liệu (Excel)', hint: 'Chỉ số, trạm, sạt lở trong vùng đang xem', icon: FileSpreadsheet, onClick: doExcel, disabled: !k },
        ]}
        onRefresh={presentation ? undefined : refresh}
        refreshing={refreshing}
      >
        <ProvinceArt className="pointer-events-none absolute -right-8 top-1/2 -z-10 h-[230%] w-auto -translate-y-1/2 text-accent/15 opacity-30 max-md:hidden" />
        {/* Câu tóm tắt tình hình bằng lời + chỗ nguy hiểm nhất (thẻ Cấp xã có phần riêng của xã) */}
        {tab !== 'cap_xa' && (
          <div className="mt-1.5">
            <SituationSummary
              k={k}
              waterStations={waterStations}
              stationsError={stationsState.error}
              hotspots={hotspots}
              large={presentation}
              onShowWorst={(h) => {
                if (tab !== 'tong_hop') setTab('tong_hop');
                if (bigScreen && heroLayout === 'left_full') setHeroLayout('split'); // bản đồ đang thu gọn → hiện lại để bay tới
                setMapFocus({ id: h.id, at: Date.now() });
              }}
              link={canDataImport ? { to: '/nhap-du-lieu', text: 'Nhập danh mục trạm →' } : canSystem ? { to: '/nguon-du-lieu', text: 'Xem nguồn dữ liệu →' } : null}
            />
          </div>
        )}
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
                'tap -mb-px flex min-h-[44px] shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors',
                tab === t.id ? 'border-accent font-semibold text-accent' : 'border-transparent text-muted hover:text-ink',
              )}
            >
              <t.icon size={15} aria-hidden="true" /> {t.label}
              {badge && (
                <span className="flex items-center gap-1 text-xs font-semibold text-ink-2">
                  <span className={clsx('h-2 w-2 rounded-full', risk(badge.level).fill)} aria-hidden="true" />
                  {badge.text}
                </span>
              )}
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
            {/* Tài khoản xã: gợi ý lần đầu ngay dưới các ô chỉ số của xã (cấp tỉnh xem thẻ này đã có gợi ý ở thẻ Tổng hợp) */}
            {isCommuneUser && <RoleTips page="tong-quan" />}
            <div className="grid gap-3.5 xl:grid-cols-[1fr_360px] [&>*]:min-w-0">
              <div className="grid gap-3.5 lg:grid-cols-2 [&>*]:min-w-0">
                {/* Biểu đồ số đo trạm chỉ khi xã có trạm đo mưa — không thì 2 khung trống "chưa có số đo" chiếm nửa trang */}
                {rainStations > 0 && (
                  <>
                    <Section id="bieu-do-mua" title="Mưa từng giờ & dự báo 3 giờ tới tại xã" className="scroll-mt-20">
                      <RainfallChart height={250} />
                    </Section>
                    <Section title="Ngưỡng sạt lở theo mưa – trạm mưa trong xã" hint={LANDSLIDE_HINT}>
                      <LandslideScatter height={250} />
                    </Section>
                  </>
                )}
                <Section id="du-bao-72h" title="Dự báo mưa 3 ngày tới" className="lg:col-span-2" hint={FORECAST_HINT}>
                  <p className="mb-2 text-[13px] text-muted">
                    {!stationsState.loading && rainStations === 0 && 'Xã chưa có trạm đo mưa — theo dõi bằng dự báo. '}
                    Đường đậm: lượng mưa có khả năng nhất; vùng tô: khoảng có thể xảy ra.
                  </p>
                  <AreaForecastChart height={220} />
                </Section>
              </div>
              {logSection({
                title: 'Nhật ký sự kiện của xã',
                limit: 40,
                className: 'xl:sticky xl:top-16 xl:h-[calc(100vh-8.5rem)] xl:self-start xl:overflow-hidden xl:tall:h-[calc(100vh-10.5rem)]', // màn đủ cao: trừ cả thanh trạng thái
                listClass: isLg ? 'h-[60vh] xl:h-full' : undefined,
              })}
            </div>
          </CommuneView>
        </div>
      )}

      {tab === 'mua_lon' && (
        // Mưa lớn: mưa từng giờ bình quân lưu vực + cộng dồn + 3 giờ tới; dự báo mưa 3 ngày theo xã (khoảng có thể xảy ra)
        <div ref={ref} className="grid grid-cols-1 gap-2.5 bg-bg sm:gap-3.5 xl:grid-cols-2 [&>*]:min-w-0">
          <Section id="bieu-do-mua" title={rainTitle(k, rainfall)} hint={RAIN_HINT}>
            <RainfallChart height={300} />
          </Section>
          <Section id="du-bao-72h" title={forecastTitle(fcAreas)} hint={FORECAST_HINT}>
            <AreaForecastChart height={300} />
          </Section>
        </div>
      )}

      {tab === 'ngap_lut' && (
        // Ngập lụt: mực nước các trạm thủy văn so với Báo động I–III; vùng ngập, vùng sẽ ngập theo báo động ở Bản đồ giám sát
        <div ref={ref} className="flex flex-col gap-2.5 bg-bg sm:gap-3.5">
          <Section title={hydroTitle(activeRow)} hint={HYDRO_HINT}>
            {hydroBody(320)}
          </Section>
          <p className="px-1 text-[13px] text-muted no-print">
            Vùng đang ngập và vùng sẽ ngập khi sông lên Báo động I – III:{' '}
            <button type="button" className="tap inline-flex items-center font-semibold text-accent hover:underline" onClick={() => navigate('/ban-do')}>xem trên Bản đồ giám sát</button>
          </p>
        </div>
      )}

      {tab === 'sat_lo' && (
        // Cảm biến cảnh báo sớm lên đầu (thiết kế A: heatmap chuỗi thời gian độ nghiêng / độ ẩm đất), rồi điểm đen & đường đèo
        <div ref={ref} className="flex flex-col gap-2.5 bg-bg sm:gap-3.5">
          <Section title="Cảm biến cảnh báo sớm sạt lở 48 giờ qua (độ nghiêng mái taluy, độ ẩm đất)">
            <SensorHeatmap />
          </Section>
          <div className="card p-3 sm:p-5">
            <LandslideMonitor areaScoped showAll={forceOpen} onSelectOnMap={openOnMap} />
          </div>
        </div>
      )}

      {tab === 'tong_hop' && (
        <>
          {/* Vùng chụp PDF: chỉ số + bản đồ + biểu đồ + nhật ký ("Việc chờ quyết định", gợi ý không in — việc riêng của người xem) */}
          <div ref={ref} className="flex flex-col gap-2.5 bg-bg sm:gap-3.5">
            {/* 1. Việc chờ quyết định + 6 ô chỉ số & Bản đồ điểm nóng:
                Màn lớn: 2 cột (split), mở rộng bên trái (left_full) hoặc mở rộng bản đồ (right_full) — trình chiếu luôn 2 cột. */}
            {bigScreen ? (
              <div className="flex flex-col gap-3.5">
                {layout === 'split' && (
                  <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-3.5">
                    <div className="flex min-w-0 flex-col gap-3.5">
                      {!presentation && (
                        <DecisionPanel
                          k={k}
                          kState={kState}
                          className="max-sm:order-last"
                          stacked
                          {...layoutProps}
                        />
                      )}
                      <KpiStrip
                        {...kpiProps}
                        onRiver={(id) => {
                          setChartSegment('thuy_van');
                          focusStation(id);
                        }}
                        large={presentation}
                        stacked
                      />
                    </div>
                    <TacticalMiniMap
                      k={k}
                      className="min-w-0"
                      focus={mapFocus}
                      tall
                      {...layoutProps}
                    />
                  </div>
                )}

                {layout === 'left_full' && (
                  <div className="flex min-w-0 flex-col gap-3.5">
                    {!presentation && (
                      <DecisionPanel
                        k={k}
                        kState={kState}
                        className="max-sm:order-last"
                        stacked={false}
                        {...layoutProps}
                      />
                    )}
                    <KpiStrip
                      {...kpiProps}
                      onRiver={(id) => {
                        setChartSegment('thuy_van');
                        focusStation(id);
                      }}
                      large={presentation}
                      stacked={false}
                    />
                    <div className="flex items-center justify-between rounded-lg border border-dashed border-accent/40 bg-accent/5 px-4 py-2.5 text-xs text-ink/80 transition hover:bg-accent/10">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/15 text-accent font-semibold">
                          <Compass size={14} />
                        </span>
                        <span>Bản đồ điểm nóng đang được thu gọn. Khối việc chờ & 6 chỉ số đang hiển thị toàn bộ chiều rộng màn hình.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setHeroLayout('split')}
                        className="btn-ghost tap flex items-center gap-1.5 rounded-md border border-accent/40 bg-panel px-3 py-1 font-semibold text-accent shadow-xs hover:bg-accent hover:text-white"
                      >
                        <Columns2 size={13} />
                        <span>Hiện lại bản đồ (chia 2 cột)</span>
                      </button>
                    </div>
                  </div>
                )}

                {layout === 'right_full' && (
                  <div className="flex min-w-0 flex-col gap-3.5">
                    <div className="flex items-center justify-between rounded-lg border border-dashed border-accent/40 bg-accent/5 px-4 py-2.5 text-xs text-ink/80 transition hover:bg-accent/10">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/15 text-accent font-semibold">
                          <CheckSquare size={14} />
                        </span>
                        <span>Đang thu gọn khối việc chờ & 6 chỉ số để bản đồ điểm nóng hiển thị toàn bộ chiều rộng màn hình.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setHeroLayout('split')}
                        className="btn-ghost tap flex items-center gap-1.5 rounded-md border border-accent/40 bg-panel px-3 py-1 font-semibold text-accent shadow-xs hover:bg-accent hover:text-white"
                      >
                        <Columns2 size={13} />
                        <span>Hiện lại việc chờ & 6 chỉ số (chia 2 cột)</span>
                      </button>
                    </div>
                    <TacticalMiniMap
                      k={k}
                      className="min-w-0"
                      focus={mapFocus}
                      tall
                      {...layoutProps}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2.5 sm:gap-3.5">
                <div className="contents">
                  {!presentation && <DecisionPanel k={k} kState={kState} className="max-sm:order-last" stacked={false} />}
                  <KpiStrip
                    {...kpiProps}
                    onRiver={(id) => {
                      setChartSegment('thuy_van');
                      focusStation(id);
                    }}
                    large={presentation}
                    stacked={false}
                  />
                </div>
              </div>
            )}

            {/* 2. Khối chiến thuật: bản đồ + chuyên đề (trái), nhật ký sự kiện (phải). Gợi ý lần đầu: điện thoại ngay trước bản
                đồ; máy tính bảng / laptop đầu cột phải (trên nhật ký) — không đẩy bản đồ xuống dưới màn hình đầu */}
            {/* Hàng 1 cao vừa gợi ý (gập sẵn một dòng), phần cao dư của cột trái dồn cho hàng 2 — nhật ký nằm sát ngay dưới */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:grid-rows-[auto_1fr] lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px] [&>*]:min-w-0">
              {!presentation && (
                <RoleTips
                  page="tong-quan"
                  className="md:col-start-2 md:row-start-1 md:!flex-col md:!items-stretch md:self-start [&_ol]:md:!grid-cols-1"
                />
              )}
              <div className="flex min-w-0 flex-col gap-3 md:col-start-1 md:row-span-2 md:row-start-1">
                {!bigScreen && <TacticalMiniMap k={k} className="min-w-0" focus={mapFocus} />}

                {/* Biểu đồ theo chuyên đề — xem một chuyên đề một lúc (bớt rối cho lãnh đạo) hoặc "Tất cả" */}
                <div className="card p-2 sm:p-2.5">
                  <Segmented
                    label="Chuyên đề biểu đồ"
                    value={chartSegment}
                    onChange={setChartSegment}
                    options={[
                      { value: 'mua', label: 'Mưa lớn', short: 'Mưa lớn', icon: CloudRain },
                      { value: 'sat_lo', label: 'Sạt lở, lũ quét', short: 'Sạt lở', icon: Mountain },
                      { value: 'thuy_van', label: 'Ngập lụt (mực nước sông)', short: 'Ngập lụt', icon: Waves },
                      canResource && { value: 'vat_tu', label: 'Kho vật tư', short: 'Kho', icon: Server },
                      { value: 'tat_ca', label: 'Tất cả', hint: 'Xem mọi biểu đồ cùng lúc' },
                    ].filter(Boolean)}
                  />

                  <div className="mt-3 space-y-3">
                    {showSeg('thuy_van') && (
                      <div ref={hydroRef} className="min-w-0 scroll-mt-20">
                        <Section title={hydroTitle(activeRow)} hint={HYDRO_HINT} {...fold('thuy_van')}>
                          {hydroBody(250)}
                        </Section>
                      </div>
                    )}

                    {showSeg('mua') && (
                      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                        <Section id="bieu-do-mua" title={rainTitle(k, rainfall)} hint={RAIN_HINT} className="scroll-mt-20" {...fold('mua')}>
                          <RainfallChart height={260} />
                        </Section>
                        <Section id="du-bao-72h" title={forecastTitle(fcAreas)} hint={FORECAST_HINT} className="scroll-mt-20" {...fold('du_bao')}>
                          <AreaForecastChart height={260} />
                        </Section>
                      </div>
                    )}

                    {showSeg('sat_lo') && (
                      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                        <Section title={landslideTitle(lsRisk)} hint={LANDSLIDE_HINT} {...fold('sat_lo')}>
                          <LandslideScatter height={250} />
                        </Section>
                        <Section title="Cảm biến sạt lở 48 giờ qua (độ nghiêng mái taluy, độ ẩm đất)" {...fold('sat_lo')}>
                          <SensorHeatmap height={250} />
                        </Section>
                      </div>
                    )}

                    {canResource && showSeg('vat_tu') && (
                      <Section title={suppliesTitle(supplies)} hint={SUPPLIES_HINT} {...fold('vat_tu')}>
                        <SuppliesChart height={250} />
                      </Section>
                    )}
                  </div>
                </div>
              </div>

              {logSection({
                title: 'Nhật ký sự kiện',
                limit: 60,
                className: 'min-w-0 md:col-start-2 lg:sticky lg:top-16 lg:h-[calc(100vh-8.5rem)] lg:self-start lg:overflow-hidden lg:tall:h-[calc(100vh-10.5rem)]', // màn đủ cao: trừ cả thanh trạng thái
              })}
            </div>
          </div>

          {/* 3. Bảng số liệu chi tiết theo chuyên đề — thu gọn sẵn thành một thanh (tóm tắt + nút mở); mở ra là chính bảng */}
          {!presentation && (opsTableOpen ? (
            <div id="bang-so-lieu" className="flex flex-col gap-1.5">
              <OperationsTable
                k={k}
                kState={kState}
                stations={waterStations}
                stationsState={stationsState}
                onSelectStation={focusStation}
                scopeLabel={filterLabel}
              />
              <button type="button" onClick={() => setOpsTableOpen(false)} aria-expanded="true" aria-controls="bang-so-lieu" className="btn-ghost tap self-center px-3">
                Thu gọn bảng <ChevronUp size={14} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="card flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2.5">
              <div className="min-w-0">
                <h2 className="card-title">
                  <FileSpreadsheet size={15} className="text-accent" aria-hidden="true" /> Bảng số liệu chi tiết
                </h2>
                <p className="num mt-0.5 text-[13px] text-muted">
                  {waterStations.length} trạm mực nước · {k?.landslides?.total || 0} điểm sạt lở{canSos ? ` · ${k?.sos?.waiting || 0} phiếu SOS chờ` : ''}
                </p>
              </div>
              <button type="button" onClick={() => setOpsTableOpen(true)} aria-expanded="false" aria-controls="bang-so-lieu" className="btn-secondary tap h-9 px-3">
                Mở bảng số liệu <ChevronDown size={14} aria-hidden="true" />
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
          landslides: (k?.landslides?.blocked_count || 0) + (k?.landslides?.warning_count || 0),
        }}
      />
    </div>
  );
}
