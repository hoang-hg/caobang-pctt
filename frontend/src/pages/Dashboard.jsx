import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  AlertTriangle, ArrowUpRight, CloudRain, Compass, Droplets, FileDown, FileSpreadsheet, Home, LayoutDashboard, LifeBuoy,
  Loader2, MapPin, Mountain, PhoneCall, RefreshCw, Server, ShieldAlert, Siren, Users, Waves, X,
} from 'lucide-react';
import { useAreaQuery, usePresets, useUnits } from '../api/hooks';
import { useStore } from '../app/store';
import { EmptyState, ErrorState, Progress, RiskLegend, Section, Skeleton } from '../components/common/ui';
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
import ConnectionBanner from '../components/dashboard/ConnectionBanner';
import TacticalMiniMap from '../components/dashboard/TacticalMiniMap';
import OperationsTable from '../components/dashboard/OperationsTable';
import CommuneView, { unitLabel } from '../components/dashboard/CommuneView';
import SystemView from '../components/dashboard/SystemView';
import QuickIncidentModal from '../components/dashboard/QuickIncidentModal';
import { useAllowedCodes, usePermission } from '../rbac/usePermission';
import { int, minutesSince, num, pct, vnFileStamp } from '../utils/format';
import { LANDSLIDE_LEVEL, levelOf, RAIN_LABEL, rainLevel, risk } from '../utils/risk';
import { exportSnapshotPdf } from '../utils/exportPdf';
import { exportExcel } from '../utils/exportExcel';
import { useOnline } from '../utils/useOnline';
import ReservoirMonitor from './public/ReservoirMonitor';
import LandslideMonitor, { maxTiltText } from './public/LandslideMonitor';

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

/**
 * Khối chỉ số nhanh (thiết kế mục A.2): mưa, mực nước so với BĐ I–III, sơ tán so với kế hoạch, SOS chờ (nhấp nháy khi
 * quá hạn), lực lượng & phương tiện chuyên dụng. Màu theo thang rủi ro chung (utils/risk.js). Thiếu số liệu → "–" và nói
 * rõ chưa có gì; lỗi tải → khung lỗi + "Thử lại" (không giả "chưa có dữ liệu").
 */
function KpiGrid({ k, kState, evacQ, stationsState, waterStations, rainStations, canSystem, canSos, stationId, onSelectStation, canEvacUpdate, riverRef }) {
  const grid = 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0';
  if (!k && kState.error) return <ErrorState onRetry={kState.refetch}>Không tải được chỉ số tổng quan</ErrorState>;
  if (!k) {
    return (
      <div className={grid} aria-label="Đang tải chỉ số nhanh">
        {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={128} className={clsx(i === 1 && 'sm:col-span-2')} />)}
      </div>
    );
  }
  const rain = k.rain;
  const rainKnown = rain?.avg_24h != null;
  const rainLv = rainKnown ? rainLevel(rain.max_24h) : null;
  const ev = k.evacuation || {};
  const planned = ev.planned_households || 0;
  const sos = k.sos || {};
  const sosLv = sos.overdue > 0 || sos.critical > 0 ? 3 : sos.waiting > 0 ? 1 : 0;
  const fo = k.forces || {};
  const ve = k.vehicles || {};
  const sites = evacQ.data?.sites || [];
  const occupancy = sites.reduce((n, s) => n + (s.current_occupancy || 0), 0);
  const capacity = sites.reduce((n, s) => n + (s.capacity || 0), 0);
  const oldest = sos.oldest_waiting ? minutesSince(sos.oldest_waiting) : null;
  const hasResources = fo.units > 0 || ve.special_total > 0 || ve.heavy_total > 0;

  return (
    // 3 cột: cột trái Dashboard (cạnh nhật ký 360px) chỉ ~650–1300px — 6 cột làm thẻ quá hẹp, nhãn bị cắt
    <div className={grid}>
      <StatCard
        icon={CloudRain}
        title="Mưa 24 giờ"
        level={rainLv}
        badge={rainLv >= 1 && <Badge level={rainLv}>{RAIN_LABEL[rainLv]}</Badge>}
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
        {stationsState.error ? (
          <ErrorState onRetry={stationsState.refetch} className="h-full">Không tải được danh sách trạm mực nước</ErrorState>
        ) : stationsState.loading ? (
          <Skeleton height={128} />
        ) : (
          <RiverKpi stations={waterStations} selectedId={stationId} onSelect={onSelectStation} />
        )}
      </div>

      <StatCard
        icon={Home}
        title="Sơ tán an toàn"
        level={planned ? undefined : null}
        badge={planned > 0 && <Badge className="bg-accent/15 text-accent">{pct(ev.evacuated_households, planned)}% kế hoạch</Badge>}
        value={planned ? `${int(ev.evacuated_households)}/${int(planned)}` : '–'}
        unit={planned ? 'hộ' : undefined}
        footer={
          <div className="flex flex-col gap-0.5">
            {planned ? (
              <span>Nhân khẩu: <b className="font-mono text-ink">{int(ev.evacuated_persons)}/{int(ev.planned_persons)}</b></span>
            ) : (
              <span>
                Chưa có kế hoạch sơ tán được cập nhật trong vùng đang xem
                {/* cập nhật ở Điều hành cứu hộ (/cuu-ho cần sos.view) */}
                {canEvacUpdate && canSos && <> · <Link to="/cuu-ho" className="font-semibold text-accent hover:underline">Cập nhật</Link></>}
              </span>
            )}
            <span className="text-muted">
              {evacQ.isError && !evacQ.data
                ? 'Không tải được danh sách điểm sơ tán'
                : !evacQ.data ? 'Đang tải điểm sơ tán…'
                  : sites.length ? `${sites.length} điểm sơ tán · đang ở ${int(occupancy)}/${int(capacity)} chỗ` : 'Chưa có điểm sơ tán trong dữ liệu'}
            </span>
          </div>
        }
      >
        {planned > 0 && <Progress value={pct(ev.evacuated_households, planned)} tone="accent" />}
      </StatCard>

      <StatCard
        icon={Siren}
        title="SOS chờ xử lý"
        level={sosLv}
        alert={sos.overdue > 0}
        badge={
          sos.overdue > 0 ? <Badge level={3}>{sos.overdue} quá hạn</Badge>
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
        {canSos && (
          <Link to="/cuu-ho" className="btn-ghost min-h-[36px] self-start px-2.5 py-0.5 text-[11px] no-print">
            Điều phối <ArrowUpRight size={11} />
          </Link>
        )}
      </StatCard>

      <StatCard
        icon={Users}
        title="Lực lượng & phương tiện"
        level={hasResources ? undefined : null}
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

/** Hai thẻ chuyên đề (hồ chứa, sạt lở đường đèo) — số từ KPI, vạch màu theo mức (khớp màu backend); chưa có danh mục thì
 * nói rõ. Bấm → mở thẻ chuyên đề. */
function TopicCards({ k, onOpen }) {
  const rs = k?.reservoirs;
  const ls = k?.landslides;
  const rsLv = !rs?.total ? null : rs.emergency_count ? 3 : rs.spill_count ? 2 : 0;
  const lsLv = !ls?.total ? null : ls.blocked_count ? levelOf(LANDSLIDE_LEVEL, 'cam_duong') : ls.warning_count ? levelOf(LANDSLIDE_LEVEL, 'canh_bao') : 0;
  const card = 'card min-h-[72px] cursor-pointer border-l-4 p-3.5 text-left transition-shadow hover:shadow-md';
  return (
    <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
      <button type="button" onClick={() => onOpen('ho_chua')} className={clsx(card, risk(rsLv).edge)}>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-bold text-ink">
            <Droplets size={17} className={risk(rsLv).text} aria-hidden="true" /> Hồ chứa & xả lũ
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

      <button type="button" onClick={() => onOpen('sat_lo')} className={clsx(card, risk(lsLv).edge)}>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-bold text-ink">
            <Mountain size={17} className={risk(lsLv).text} aria-hidden="true" /> Sạt lở & đường đèo
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

/** Nút của thanh thao tác điện thoại: cao ≥ 56 px, biểu tượng + chữ. */
const barBtn = 'flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-bold active:scale-95';

export default function Dashboard() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const online = useOnline();
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

  const waterStations = useMemo(() => allStations.filter((s) => s.type === 'muc_nuoc'), [allStations]);
  const rainStations = allStations.filter((s) => s.type === 'luong_mua').length;
  const rainKnown = k?.rain?.avg_24h != null;
  const [stationId, setStationId] = useState(null);
  const activeStation = waterStations.some((s) => s.id === stationId) ? stationId : waterStations[0]?.id || null;
  const [exporting, setExporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [bulletinOpen, setBulletinOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
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

  const selectStation = (id) => {
    setStationId(id);
    hydroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const openOnMap = (x) => {
    if (x?.lat != null) setFocus({ lat: x.lat, lon: x.lon, zoom: 13, label: x.name });
    navigate('/ban-do');
  };
  const goRivers = () => {
    if (tab !== 'tong_hop' && tab !== 'cap_xa') setTab('tong_hop');
    setTimeout(() => riverRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
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
    k, kState, evacQ, stationsState, waterStations, rainStations, canSystem, canSos, stationId: activeStation,
    onSelectStation: selectStation, canEvacUpdate, riverRef,
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
  const rs = k?.reservoirs;
  const ls = k?.landslides;
  const tabBadge = {
    ho_chua: rs?.spill_count ? { text: `${rs.spill_count} hồ xả`, level: rs.emergency_count ? 3 : 2 } : null,
    sat_lo: ls?.blocked_count ? { text: `${ls.blocked_count} cấm đường`, level: 3 } : ls?.warning_count ? { text: `${ls.warning_count} cảnh báo`, level: 2 } : null,
  };

  return (
    <div className="flex flex-col gap-3.5 p-3.5 pb-28 sm:p-5 sm:pb-5">
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

      {/* 1. Thanh chỉ huy: tiêu đề + phạm vi + giờ số liệu, thao tác; chú giải thang màu rủi ro */}
      <div className="card p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <span className="rounded border border-accent/25 bg-accent/10 px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-accent">
                Trung tâm điều hành · Cao Bằng
              </span>
              {role && <span className="chip border border-line bg-panel2 text-ink-2">{role}</span>}
            </div>
            {/* Điện thoại: tiêu đề chỉ là phạm vi đang xem (ngắn, 1–2 dòng) — "Tổng quan tác chiến" thành dòng nhỏ phía trên */}
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted sm:hidden">Tổng quan tác chiến</div>
            <h1 className="flex flex-wrap items-center gap-x-2 text-lg font-black tracking-tight text-ink sm:mt-1 sm:text-xl">
              <span className="hidden sm:inline">Tổng quan tác chiến</span>
              <span className="hidden font-normal text-muted sm:inline">/</span>
              <span className="text-accent">{filterLabel}</span>
              {isFiltered && tab !== 'cap_xa' && (
                <button type="button" onClick={clearFilter} className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-panel2 hover:text-ink" title="Bỏ lọc" aria-label="Bỏ lọc, xem toàn bộ phạm vi">
                  <X size={15} />
                </button>
              )}
            </h1>
            <p className="mt-0.5 text-xs text-muted">
              {kQ.dataUpdatedAt
                ? `Số liệu lúc ${new Date(kQ.dataUpdatedAt).toLocaleTimeString('vi-VN', { ...VN_TIME, hour12: false })} · tự cập nhật khi có sự kiện mới`
                : kState.error ? 'Chưa tải được số liệu' : 'Đang tải số liệu…'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 no-print">
            {canReport && (
              // Điện thoại: "Báo SOS" ở thanh dưới cùng (vùng ngón cái) — ở đây chỉ hiện từ máy tính bảng trở lên
              <button type="button" onClick={() => setReportOpen(true)} className="btn-danger hidden px-3 py-1.5 text-xs font-bold sm:inline-flex">
                <ShieldAlert size={14} /> Báo cáo nhanh
              </button>
            )}
            <button type="button" onClick={refresh} disabled={refreshing} className="btn-ghost h-10 min-w-[40px] px-2.5 text-xs sm:h-auto sm:py-1.5" aria-label="Làm mới số liệu" title="Làm mới số liệu">
              <RefreshCw size={14} className={clsx(refreshing && 'animate-spin')} /> <span className="hidden sm:inline">Làm mới</span>
            </button>
            <Link to="/ban-do" className="btn-ghost hidden px-2.5 py-1.5 text-xs sm:inline-flex">
              <Compass size={14} /> Bản đồ <ArrowUpRight size={12} />
            </Link>
            <button type="button" onClick={doExcel} disabled={!k} className="btn-ghost h-10 min-w-[40px] px-2.5 text-xs sm:h-auto sm:py-1.5" aria-label="Xuất Excel tổng quan" title="Xuất Excel tổng quan">
              <FileSpreadsheet size={14} /> <span className="hidden sm:inline">Excel</span>
            </button>
            <button type="button" onClick={doExport} disabled={exporting} className="btn-primary h-10 min-w-[40px] px-3 text-xs sm:h-auto sm:py-1.5" aria-label="Xuất PDF báo cáo nhanh" title="Xuất PDF báo cáo nhanh">
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} <span className="hidden sm:inline">Xuất PDF</span>
            </button>
          </div>
        </div>
        <RiskLegend className="mt-2.5 border-t border-line/60 pt-2" />
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
      <div className="scroll-thin -mx-1 flex items-center gap-1.5 overflow-x-auto border-b border-line px-1 pb-2.5 no-print" role="tablist" aria-label="Nội dung tổng quan">
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
          {/* Lọc nhanh theo lưu vực (nhóm do BCH xác nhận — README 2.4); tài khoản xã chỉ có xã mình nên ẩn */}
          {scope === null && presets.some((p) => p.kind === 'luu_vuc') && (
            <div className="scroll-thin -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 no-print">
              <span className="mr-1 flex items-center gap-1 whitespace-nowrap text-xs font-bold uppercase tracking-wider text-muted">
                <MapPin size={13} aria-hidden="true" /> Lưu vực:
              </span>
              <button
                type="button"
                onClick={clearFilter}
                aria-pressed={!isFiltered}
                className={clsx('min-h-[36px] whitespace-nowrap rounded-full border px-3 text-xs font-semibold', !isFiltered ? 'border-accent bg-accent text-white' : 'border-line bg-panel text-ink-2 hover:bg-panel2')}
              >
                Toàn tỉnh
              </button>
              {presets.filter((p) => p.kind === 'luu_vuc').map((p) => (
                <button
                  key={p.code}
                  type="button"
                  aria-pressed={filter.presetCode === p.code}
                  onClick={() => setFilter({ codes: p.unit_codes, label: p.name, presetCode: p.code })}
                  className={clsx(
                    'min-h-[36px] whitespace-nowrap rounded-full border px-3 text-xs font-semibold',
                    filter.presetCode === p.code ? 'border-accent bg-accent text-white' : 'border-line bg-panel text-ink-2 hover:bg-panel2',
                  )}
                >
                  {p.name} <span className="opacity-75">({p.unit_codes.length} xã)</span>
                </button>
              ))}
            </div>
          )}

          <div ref={ref} className="grid gap-3.5 bg-bg xl:grid-cols-[1fr_360px] [&>*]:min-w-0">
            <div className="flex min-w-0 flex-col gap-3.5">
              {/* Khối chỉ số nhanh (Top) → điểm nóng → biểu đồ (Middle): lãnh đạo nắm tình hình trong vài giây */}
              <KpiGrid {...kpiProps} />
              <TopicCards k={k} onOpen={setTab} />
              <TacticalMiniMap k={k} />

              <div className="grid gap-3.5 lg:grid-cols-2 [&>*]:min-w-0">
                <div ref={hydroRef} className="min-w-0 scroll-mt-20">
                  <Section title="Thủy văn – mực nước thực đo & dự báo">
                    {/* Chọn trạm ở hàng riêng (trước đây chen cạnh tiêu đề → tiêu đề gãy 3 dòng) */}
                    {waterStations.length > 0 && (
                      <label className="mb-2 flex items-center gap-2 text-xs text-muted">
                        <span className="shrink-0">Trạm</span>
                        <select className="input min-h-[36px] py-1 text-xs sm:w-auto" value={activeStation || ''} onChange={(e) => setStationId(e.target.value)}>
                          {waterStations.map((s) => (
                            <option key={s.id} value={s.id}>{s.name.replace(/^Trạm\s+(thủy|thuỷ)\s+văn\s+/i, '')}</option>
                          ))}
                        </select>
                      </label>
                    )}
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
                <Section title="Cường độ mưa & dự báo 3 giờ tới">
                  <RainfallChart height={270} />
                </Section>
                <Section id="du-bao-72h" title="Dự báo mưa 72 giờ theo xã – tổ hợp ECMWF + GFS (P10–P90)" className="lg:col-span-2">
                  <AreaForecastChart height={230} />
                </Section>
                <Section title="Ngưỡng kích hoạt sạt lở (mưa tích lũy 72h – cường độ)" className={clsx(!canResource && 'lg:col-span-2')}>
                  <LandslideScatter height={240} />
                </Section>
                {canResource && (
                  <Section title="Vật tư cứu trợ theo kho (% định mức dự trữ)">
                    <SuppliesChart height={240} />
                  </Section>
                )}
              </div>
            </div>

            {/* Khối nhật ký sự kiện & luồng cảnh báo (Side) */}
            {logSection('Nhật ký sự kiện & luồng cảnh báo', 60)}
          </div>

          <OperationsTable
            k={k}
            kState={kState}
            stations={waterStations}
            stationsState={stationsState}
            onSelectStation={selectStation}
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
