import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { PackageMinus, PackagePlus, RefreshCw, Truck } from 'lucide-react';
import { useAreaQuery, useUnits } from '../api/hooks';
import { useStore } from '../app/store';
import { EmptyState, ErrorState, Pager, Section, Skeleton, Tabs } from '../components/common/ui';
import SuppliesChart from '../components/charts/SuppliesChart';
import IssueModal from '../components/common/IssueModal';
import { FuelDepotModal, ReceiveModal, VehicleModal } from '../components/common/LogisticsModals';
import QuickActionBar from '../components/common/QuickActionBar';
import ConnectionBanner from '../components/dashboard/ConnectionBanner';
import QuickIncidentModal from '../components/dashboard/QuickIncidentModal';
import { unitLabel } from '../components/dashboard/CommuneView';
import ForceList from '../components/resources/ForceList';
import InventoryLedger from '../components/resources/InventoryLedger';
import ItemSummary from '../components/resources/ItemSummary';
import PickSheet from '../components/resources/PickSheet';
import QuickDispatch from '../components/resources/QuickDispatch';
import { ForceReadinessChart, VehicleStatusChart } from '../components/resources/ReadinessCharts';
import ResourceAlerts from '../components/resources/ResourceAlerts';
import ResourceKpis from '../components/resources/ResourceKpis';
import FilterToolbar from '../components/common/FilterToolbar';
import VehicleList, { FuelDepots, VehicleMap } from '../components/resources/VehicleList';
import WarehouseList, { STOCK_NOTE } from '../components/resources/WarehouseList';
import {
  FILTERS, SORTS, TABS, TAB_IDS, WAREHOUSE_LEVEL, forceLevelLabel, matchFilters, optionCounts, resourceAlerts, sortRows,
  warehouseFacts,
} from '../components/resources/resourceFacts';
import { CATEGORY, FORCE_TYPE, RES_STATUS, SKILL, VEHICLE, VEHICLE_CAT } from '../utils/labels';
import { dateTime, foldVi, vnFileStamp } from '../utils/format';
import { exportExcel } from '../utils/exportExcel';
import { exportSnapshotPdf } from '../utils/exportPdf';
import { useMediaQuery } from '../utils/useMediaQuery';
import { useOnline } from '../utils/useOnline';
import { usePaged } from '../utils/usePaged';
import { stockLevel } from '../utils/risk';
import { useAllowedCodes, usePermission } from '../rbac/usePermission';

const EMPTY = {
  luc_luong: 'Chưa có đơn vị lực lượng cứu hộ trong vùng đang xem — nhập bằng loại dữ liệu “Lực lượng”.',
  vat_tu: 'Chưa có kho vật tư trong vùng đang xem — nhập loại dữ liệu “Kho vật tư”, rồi “Tồn kho vật tư”.',
  phuong_tien: 'Chưa có phương tiện, trang thiết bị trong vùng đang xem — nhập bằng loại dữ liệu “Phương tiện”.',
};
const PLACEHOLDER = {
  luc_luong: 'Tìm đơn vị, chỉ huy, kỹ năng…',
  vat_tu: 'Tìm kho, xã/phường, mặt hàng…',
  phuong_tien: 'Tìm số hiệu, loại, đơn vị…',
};
const REFRESH_KEYS = ['resources-summary', 'forces', 'warehouses', 'vehicles', 'fuel', 'supplies', 'kpis'];

/**
 * Quản lý Vật tư & Lực lượng cứu hộ (thiết kế C). Trên cùng: dải thông tin khẩn (kho cạn kiệt, hàng sắp hết hạn, phương tiện
 * thiếu nhiên liệu / hỏng, phiếu SOS chờ) → 4 ô chỉ số → 3 thẻ Lực lượng · Vật tư · Phương tiện, mỗi thẻ có tìm kiếm, bộ lọc
 * riêng, cách xếp, phân trang, xuất Excel / PDF (mọi dòng đang lọc, không chỉ trang đang xem).
 * Thẻ và bộ lọc nằm trên địa chỉ trang (?tab=vat_tu&tt=can_kiet): dải khẩn / ô chỉ số dẫn thẳng tới danh sách đã lọc, nút
 * Quay lại của trình duyệt trả lại. Danh sách tải đủ một lần theo vùng đang xem rồi lọc tại máy — dải khẩn, ô chỉ số, số
 * đếm của bộ lọc tính từ cùng dữ liệu. Máy tính: bảng; điện thoại, iPad dọc: thẻ, nút ≥ 44 px. Nút ghi (xuất / nhập kho,
 * báo tình trạng xe, điều động) chỉ hiện với quyền tương ứng ở đúng xã (backend kiểm tra lại); mất mạng → tắt, nói lý do.
 */
export default function Resources() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const online = useOnline();
  const isLg = useMediaQuery('(min-width: 1024px)');
  const filter = useStore((s) => s.filter);
  const setFocus = useStore((s) => s.setFocus);
  const toast = useStore((s) => s.toast);
  const [params, setParams] = useSearchParams();
  const tab = TAB_IDS.includes(params.get('tab')) ? params.get('tab') : TAB_IDS[0];
  const tabInfo = TABS.find((t) => t.id === tab);
  // Giá trị lạ trên địa chỉ (gõ tay, liên kết cũ) → bỏ qua, không lọc ra danh sách trống
  const filters = Object.fromEntries(FILTERS[tab].map((f) => [f.key, f.options.some(([v]) => v === params.get(f.key)) ? params.get(f.key) : '']));
  const [q, setQ] = useState('');
  const [sorts, setSorts] = useState({});
  const sort = sorts[tab] || SORTS[tab][0][0];
  const [pageSize, setPageSize] = useState(() => (window.innerWidth >= 1024 ? 20 : 10));
  const [chartOpen, setChartOpen] = useState(() => window.innerWidth >= 768);
  const [supplyView, setSupplyView] = useState('kho'); // thẻ Vật tư: biểu đồ theo kho | tổng hợp theo mặt hàng
  const [pdf, setPdf] = useState(false); // đang chụp PDF: mọi dòng đang lọc, dạng bảng, bỏ nút
  const [refreshing, setRefreshing] = useState(false);
  const [quick, setQuick] = useState(null);
  const [issue, setIssue] = useState(null);
  // Sổ xuất – nhập kho (DB7): khối thu gọn cuối thẻ Kho vật tư — chưa mở thì chưa tải; nút ở thẻ kho mở sẵn đúng kho
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerWh, setLedgerWh] = useState('');
  const [vehicleEdit, setVehicleEdit] = useState(null);
  const [receive, setReceive] = useState(null);
  const [depotEdit, setDepotEdit] = useState(null);
  const tabsRef = useRef(null);
  const contentRef = useRef(null);

  const canDispatch = usePermission('dispatch', 'create');
  const canSos = usePermission('sos', 'view');
  const canImport = usePermission('data', 'import');
  const canSubmit = usePermission('data', 'submit');
  const canReport = usePermission('sos', 'create');
  // Phạm vi ghi (null = toàn tỉnh, [] = không có quyền) — thanh thao tác nhanh chỉ đưa ra kho / phương tiện làm được
  const issueCodes = useAllowedCodes('inventory', 'issue');
  const receiveCodes = useAllowedCodes('inventory', 'receive');
  const vehicleCodes = useAllowedCodes('vehicle', 'update');
  const [pick, setPick] = useState(null); // 'issue' | 'receive' | 'vehicle' — đang chọn kho / phương tiện từ thanh đáy
  const [reportOpen, setReportOpen] = useState(false);

  // Tài khoản xã chưa lọc: tiêu đề là xã của mình, không ghi "Toàn tỉnh" (như Tổng quan)
  const scope = useAllowedCodes('resource', 'view');
  const { data: units = [] } = useUnits();
  const scopeUnit = scope?.length === 1 ? units.find((u) => u.code === scope[0]) : null;
  const scopeLabel = filter.codes.length || scope === null ? filter.label : scopeUnit ? unitLabel(scopeUnit) : `${scope.length} xã/phường được giao`;

  const summaryQ = useAreaQuery('resources-summary', '/resources/summary', {}, { refetchInterval: 30_000 });
  const forcesQ = useAreaQuery('forces', '/resources/forces');
  const warehousesQ = useAreaQuery('warehouses', '/resources/warehouses');
  const vehiclesQ = useAreaQuery('vehicles', '/resources/vehicles');
  const depotsQ = useAreaQuery('fuel', '/resources/fuel-depots');
  // Phiếu SOS chờ / quá hạn (cùng truy vấn KPI của Tổng quan — máy chủ đã đệm) — nhu cầu đặt cạnh nguồn lực
  const kpisQ = useAreaQuery('kpis', '/dashboard/kpis', {}, { enabled: canSos, refetchInterval: 30_000 });
  const queries = { luc_luong: forcesQ, vat_tu: warehousesQ, phuong_tien: vehiclesQ };
  const query = queries[tab];

  // Tìm không dấu trên mọi thẻ (số đếm của thẻ theo ô tìm); bộ lọc riêng chỉ áp vào thẻ đang mở
  const nq = foldVi(q.trim());
  const has = (...fields) => !nq || fields.some((f) => f != null && foldVi(f).includes(nq));
  const searched = {
    luc_luong: (forcesQ.data || []).filter((f) => has(f.name, f.code, f.commander, f.admin_name, f.base_name, FORCE_TYPE[f.org_type], ...(f.skills || []).map((s) => SKILL[s]))),
    vat_tu: (warehousesQ.data || []).filter((w) => has(w.name, w.code, w.admin_name, w.manager, ...w.items.map((i) => i.name))),
    phuong_tien: (vehiclesQ.data || []).filter((v) => has(v.code, v.name, v.force_name, VEHICLE[v.vehicle_type], VEHICLE_CAT[v.category])),
  };
  const factsById = new Map((warehousesQ.data || []).map((w) => [w.id, warehouseFacts(w)]));
  const factsOf = (w) => factsById.get(w.id) || warehouseFacts(w);
  const tabFacts = tab === 'vat_tu' ? factsOf : undefined;
  const rows = sortRows(tab, searched[tab].filter((r) => matchFilters(tab, r, filters, tabFacts?.(r))), sort, factsOf);
  const counts = Object.fromEntries(FILTERS[tab].map((f) => [f.key, optionCounts(tab, searched[tab], filters, f.key, tabFacts)]));
  const paged = usePaged(rows, pageSize, `${tab}|${nq}|${JSON.stringify(filters)}|${sort}|${pageSize}`, pdf);

  const alerts = resourceAlerts({ summary: summaryQ.data, warehouses: warehousesQ.data, vehicles: vehiclesQ.data, depots: depotsQ.data });
  const sources = [[summaryQ, 'chỉ số tổng hợp'], [warehousesQ, 'kho'], [vehiclesQ, 'phương tiện'], [depotsQ, 'điểm nhiên liệu']];
  const failed = sources.filter(([s]) => s.isError && !s.data);
  const tabAlert = (id) => {
    const top = alerts.find((a) => a.tab === id); // đã xếp nặng → nhẹ
    return top ? { level: top.level, text: top.text } : undefined;
  };

  // Thao tác hiện trường từ thanh dưới đáy điện thoại: kho / phương tiện tài khoản ghi được trong vùng đang xem — một mục thì
  // mở thẳng form, nhiều mục thì chọn (kho cảnh báo nặng lên đầu)
  const inScope = (codes, code) => codes === null || (codes || []).includes(code);
  const targets = {
    issue: sortRows('vat_tu', (warehousesQ.data || []).filter((w) => inScope(issueCodes, w.admin_code) && w.items.length), 'canh_bao', factsOf),
    receive: sortRows('vat_tu', (warehousesQ.data || []).filter((w) => inScope(receiveCodes, w.admin_code)), 'canh_bao', factsOf),
    vehicle: sortRows('phuong_tien', (vehiclesQ.data || []).filter((v) => inScope(vehicleCodes, v.admin_code)), 'so_hieu'),
  };
  const openTarget = (kind, x) => {
    setPick(null);
    if (kind === 'issue') setIssue(x);
    else if (kind === 'receive') setReceive(x);
    else setVehicleEdit(x);
  };
  const startPick = (kind) => (targets[kind].length === 1 ? openTarget(kind, targets[kind][0]) : setPick(kind));
  const pickItems = pick === 'vehicle'
    ? targets.vehicle.map((v) => ({
      id: v.id,
      value: v,
      title: `${v.code} · ${VEHICLE[v.vehicle_type] || v.vehicle_type}`,
      sub: `${RES_STATUS[v.status]?.label || v.status} · ${v.force_name || ''}`,
      level: stockLevel(v.fuel_level),
      right: <span className="shrink-0 font-mono text-xs text-muted">{v.fuel_level == null ? 'chưa báo' : `${v.fuel_level}%`}</span>,
      search: `${v.code} ${VEHICLE[v.vehicle_type]} ${v.force_name}`,
    }))
    : (targets[pick] || []).map((w) => ({
      id: w.id,
      value: w,
      title: w.name,
      sub: `${WAREHOUSE_LEVEL[w.level] || w.level} · ${w.admin_name || ''}`,
      level: factsOf(w).level,
      right: <span className="shrink-0 text-xs text-muted">{w.items.length} mặt hàng</span>,
      search: `${w.name} ${w.admin_name}`,
    }));
  const offlineSlot = !online ? { disabled: true, title: 'Mất mạng — chưa ghi được' } : {};

  const scrollToList = (anchor) => requestAnimationFrame(() => requestAnimationFrame(() => {
    ((anchor && document.getElementById(anchor)) || tabsRef.current)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  // Dải khẩn / ô chỉ số → thẻ + bộ lọc (một mục lịch sử: Quay lại trả về chỗ cũ); bỏ ô tìm để thấy đủ các dòng của bộ lọc
  const go = (id, f = {}, anchor) => {
    const next = new URLSearchParams({ tab: id });
    Object.entries(f).forEach(([k, v]) => v && next.set(k, v));
    setParams(next);
    setQ('');
    scrollToList(anchor);
  };
  const switchTab = (id) => setParams(id === TAB_IDS[0] ? {} : { tab: id }); // bộ lọc mỗi thẻ một nghĩa → đổi thẻ là bỏ
  const setFilter = (key, value) => setParams((p) => {
    const next = new URLSearchParams(p);
    if (value) next.set(key, value);
    else next.delete(key);
    return next;
  }, { replace: true });
  const clearAll = () => {
    setParams(tab === TAB_IDS[0] ? {} : { tab }, { replace: true });
    setQ('');
  };
  const setSort = (key) => setSorts((s) => ({ ...s, [tab]: key }));
  const showOnMap = (lat, lon, label) => {
    setFocus({ lat, lon, zoom: 14, label });
    navigate('/ban-do');
  };
  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all(REFRESH_KEYS.map((key) => qc.refetchQueries({ queryKey: [key], type: 'active' })));
    } finally {
      setRefreshing(false);
    }
  };

  const doExcel = async () => {
    if (!rows.length) return;
    const stamp = vnFileStamp(new Date(), true);
    try {
      if (tab === 'luc_luong') {
        await exportExcel(rows.map((f) => ({
          'Mã': f.code, 'Đơn vị': f.name, 'Loại': FORCE_TYPE[f.org_type], 'Cấp': forceLevelLabel(f.level), 'Tình trạng': RES_STATUS[f.status]?.label,
          'Vị trí đóng quân': f.base_name, 'Xã/phường': f.admin_name, 'Tổng quân số': f.personnel_total, 'Sẵn sàng': f.personnel_ready,
          'Đang nhiệm vụ': f.personnel_on_mission, 'Chỉ huy': f.commander, 'SĐT': f.contact_phone, 'Tần số': f.radio_freq,
          'Kỹ năng': (f.skills || []).map((s) => SKILL[s] || s).join(', '), 'Số phương tiện': f.vehicle_count,
        })), { sheet: 'Luc luong', filename: `luc-luong-cuu-ho-${stamp}.xlsx` });
      } else if (tab === 'vat_tu') {
        await exportExcel(rows.flatMap((w) => {
          const x = factsOf(w);
          return w.items.filter((i) => !filters.nhom || i.category === filters.nhom).map((i) => ({
            'Kho': w.name, 'Cấp kho': WAREHOUSE_LEVEL[w.level] || w.level, 'Xã/phường': w.admin_name, 'Thủ kho': w.manager, 'SĐT': w.phone,
            'Mặt hàng': i.name, 'Nhóm': CATEGORY[i.category], 'Tồn': i.quantity, 'Đơn vị': i.unit, 'Định mức': i.safety_quota,
            '% định mức': i.pct ?? '', 'Hạn dùng': i.expiry_date || '',
            'Cảnh báo': [x.low.includes(i) && 'Cạn kiệt', x.expiring.includes(i) && 'Sắp hết hạn'].filter(Boolean).join(', '),
            'Cập nhật': i.last_updated ? dateTime(i.last_updated) : '',
          }));
        }), { sheet: 'Ton kho', filename: `ton-kho-vat-tu-${stamp}.xlsx` });
      } else {
        await exportExcel(rows.map((v) => ({
          'Số hiệu': v.code, 'Tên': v.name, 'Loại': VEHICLE[v.vehicle_type], 'Nhóm': VEHICLE_CAT[v.category], 'Sức chở': v.capacity ?? '',
          'Đơn vị quản lý': v.force_name, 'SĐT đơn vị': v.contact_phone || '', 'Trạng thái': RES_STATUS[v.status]?.label,
          'Ghi chú': v.status_note || '', 'Nhiệm vụ': v.mission_code || '', 'Nhiên liệu %': v.fuel_level ?? '',
          'Báo nhiên liệu lúc': v.fuel_updated_at ? dateTime(v.fuel_updated_at) : '',
        })), { sheet: 'Phuong tien', filename: `phuong-tien-${stamp}.xlsx` });
      }
    } catch (e) {
      toast({ tone: 'danger', title: 'Không xuất được tệp Excel', body: e.message });
    }
  };

  // PDF: chụp vùng nội dung của thẻ — vẽ đủ mọi dòng đang lọc dạng bảng (điện thoại tạm dựng trang khổ laptop), chụp xong trả lại
  const doPdf = async () => {
    if (!rows.length || pdf) return;
    setPdf(true);
    try {
      await new Promise((resolve) => { requestAnimationFrame(() => requestAnimationFrame(resolve)); });
      const now = new Date();
      const active = FILTERS[tab].filter((f) => filters[f.key]).map((f) => f.options.find(([v]) => v === filters[f.key])?.[1]);
      await exportSnapshotPdf(contentRef.current, {
        title: 'BÁO CÁO NGUỒN LỰC ỨNG PHÓ THIÊN TAI – TỈNH CAO BẰNG',
        subtitle: [tabInfo.label, scopeLabel, `${rows.length} ${tabInfo.noun}`, ...active, q.trim() && `tìm "${q.trim()}"`, now.toLocaleString('vi-VN')]
          .filter(Boolean).join(' · '),
        filename: `nguon-luc-${tab}-${vnFileStamp(now, true)}.pdf`,
        layoutWidth: 1280,
      });
    } catch (e) {
      toast({ tone: 'danger', title: 'Không xuất được PDF', body: e.message });
    } finally {
      setPdf(false);
    }
  };

  const asTable = isLg || pdf;
  let body;
  if (query.isLoading) body = <Skeleton height={240} />;
  else if (query.isError && !query.data) body = <ErrorState height={200} onRetry={query.refetch}>Không tải được danh sách {tabInfo.noun}</ErrorState>;
  else if (!query.data?.length) {
    body = (
      <EmptyState height={160}>
        {EMPTY[tab]}
        {(canImport || canSubmit) && <> <Link to="/nhap-du-lieu" className="font-semibold text-accent hover:underline">Mở Nhập dữ liệu →</Link></>}
      </EmptyState>
    );
  } else if (!rows.length) {
    body = (
      <EmptyState height={140}>
        Không có {tabInfo.noun} khớp ô tìm / bộ lọc.{' '}
        <button type="button" className="tap font-semibold text-accent hover:underline" onClick={clearAll}>Bỏ lọc</button>
      </EmptyState>
    );
  } else if (tab === 'luc_luong') {
    body = <ForceList rows={paged.visible} asTable={asTable} pdf={pdf} sort={sort} onSort={setSort} canDispatch={canDispatch} online={online} onDispatch={setQuick} onMap={showOnMap} />;
  } else if (tab === 'vat_tu') {
    body = (
      <WarehouseList
        rows={paged.visible}
        factsOf={factsOf}
        category={filters.nhom}
        pdf={pdf}
        online={online}
        onReceive={setReceive}
        onIssue={setIssue}
        onMap={showOnMap}
        onLedger={(w) => { setLedgerWh(w.id); setLedgerOpen(true); scrollToList('so-kho'); }}
      />
    );
  } else {
    body = <VehicleList rows={paged.visible} asTable={asTable} pdf={pdf} sort={sort} onSort={setSort} online={online} onEdit={setVehicleEdit} onMap={showOnMap} />;
  }
  const pager = rows.length > 0 && !pdf && <Pager paged={paged} size={pageSize} onSize={setPageSize} noun={tabInfo.noun} />;
  const dataTime = summaryQ.dataUpdatedAt ? new Date(summaryQ.dataUpdatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : null;

  return (
    // Điện thoại: chừa chỗ cho thanh thao tác nhanh dưới đáy (không che dòng cuối, nút phân trang)
    <div className="flex flex-col gap-3 p-3 pb-28 sm:pb-8">
      {/* Thông tin khẩn luôn trên cùng (Cam / Đỏ dính khi cuộn) + mất mạng */}
      <ResourceAlerts
        items={alerts}
        sos={canSos ? kpisQ.data?.sos : null}
        failed={failed.map(([, name]) => name)}
        onRetry={() => failed.forEach(([s]) => s.refetch())}
        loading={sources.some(([s]) => s.isLoading)}
        known={{ warehouses: warehousesQ.data?.length || 0, vehicles: vehiclesQ.data?.length || 0 }}
        onGo={(it) => go(it.tab, it.filter, it.anchor)}
      />
      <ConnectionBanner updatedAt={summaryQ.dataUpdatedAt || null} />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-base font-bold leading-tight sm:text-lg">
            <span className="hidden sm:inline">Quản lý </span>Vật tư & Lực lượng<span className="hidden sm:inline"> cứu hộ</span>
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted">
            <span className="font-semibold text-accent">{scopeLabel}</span>
            <span aria-hidden="true">·</span>
            <span>
              {dataTime ? <>Số liệu lúc <b className="font-mono text-ink-2">{dataTime}</b></> : summaryQ.isError ? 'Chưa tải được số liệu' : 'Đang tải số liệu…'}
            </span>
            <span className="hidden lg:inline">· tự cập nhật khi kho xuất / nhập, lực lượng nhận lệnh</span>
          </p>
        </div>
        <button type="button" onClick={refresh} disabled={refreshing} className="btn-ghost tap-sq h-9 min-w-[36px] shrink-0 px-2.5 text-xs" aria-label="Làm mới số liệu" title="Làm mới số liệu">
          <RefreshCw size={14} className={clsx(refreshing && 'animate-spin')} aria-hidden="true" /> <span className="hidden md:inline">Làm mới</span>
        </button>
      </div>

      <ResourceKpis summaryQ={summaryQ} warehouses={warehousesQ.data} onGo={(id, f) => go(id, f)} />

      <div ref={tabsRef} className="scroll-mt-20">
        <Tabs
          fit
          label="Danh mục nguồn lực"
          value={tab}
          onChange={switchTab}
          tabs={TABS.map((t) => ({
            value: t.id, label: t.label, short: t.short, icon: t.icon, count: queries[t.id].data ? searched[t.id].length : undefined, alert: tabAlert(t.id),
          }))}
        />
      </div>

      <FilterToolbar
        fields={FILTERS[tab]}
        sorts={SORTS[tab]}
        placeholder={PLACEHOLDER[tab]}
        q={q}
        onSearch={setQ}
        filters={filters}
        counts={query.data ? counts : null}
        onFilter={setFilter}
        onClear={clearAll}
        sort={sort}
        onSort={setSort}
        shown={rows.length}
        total={query.data?.length || 0}
        noun={tabInfo.noun}
        onExcel={doExcel}
        onPdf={doPdf}
        exporting={pdf}
      />

      <div ref={contentRef} className="flex flex-col gap-3 bg-bg">
        {/* Biểu đồ cho lãnh đạo, trên danh sách của mỗi thẻ — thu gọn được (điện thoại mặc định thu gọn: danh sách lên trước) */}
        {tab === 'vat_tu' && (
          <Section
            title={supplyView === 'mat_hang' ? 'Dự trữ theo mặt hàng' : 'Phân bổ dự trữ giữa các kho (điều tiết liên vùng)'}
            collapsible
            open={chartOpen || pdf}
            onToggle={() => setChartOpen((v) => !v)}
            right={(
              <div className="flex shrink-0 gap-1 no-print" role="group" aria-label="Cách xem dự trữ">
                {[['kho', 'Theo kho'], ['mat_hang', 'Theo mặt hàng']].map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={supplyView === v}
                    onClick={() => { setSupplyView(v); setChartOpen(true); }}
                    className={clsx('tap whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold', supplyView === v ? 'bg-accent text-white' : 'bg-panel2/60 text-muted hover:text-ink')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          >
            {supplyView === 'mat_hang'
              ? <ItemSummary warehouses={rows} category={filters.nhom} expiringOf={(w) => factsOf(w).expiring} />
              : <SuppliesChart height={260} />}
          </Section>
        )}
        {tab === 'luc_luong' && rows.length > 0 && (
          <Section title="Quân số theo loại lực lượng" collapsible open={chartOpen || pdf} onToggle={() => setChartOpen((v) => !v)}>
            <ForceReadinessChart forces={rows} />
          </Section>
        )}
        {tab === 'phuong_tien' && rows.length > 0 && (
          <Section title="Phương tiện theo nhóm và tình trạng" collapsible open={chartOpen || pdf} onToggle={() => setChartOpen((v) => !v)}>
            <VehicleStatusChart vehicles={rows} />
          </Section>
        )}
        {tab === 'phuong_tien' ? (
          // Bảng cần đủ rộng: bản đồ + nhiên liệu chỉ đứng cột phải từ 1536 px; nhỏ hơn thì nằm dưới danh sách (2 cột từ 768 px)
          <div className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_400px]">
            <div className="flex min-w-0 flex-col gap-2">{body}{pager}</div>
            <div className="grid min-w-0 content-start gap-3 md:grid-cols-2 2xl:grid-cols-1">
              <VehicleMap rows={rows} />
              <FuelDepots query={depotsQ} online={online} onEdit={setDepotEdit} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">{body}{pager}</div>
        )}
        {tab === 'vat_tu' && <p className="text-[11px] text-muted">{STOCK_NOTE}</p>}
      </div>
      {tab === 'vat_tu' && (
        <Section
          id="so-kho"
          className="scroll-mt-20 no-print"
          title="Sổ xuất – nhập kho"
          collapsible
          open={ledgerOpen}
          onToggle={() => setLedgerOpen((v) => !v)}
        >
          {ledgerOpen && <InventoryLedger warehouse={ledgerWh} onWarehouse={setLedgerWh} known={warehousesQ.data || []} />}
        </Section>
      )}

      {quick && <QuickDispatch force={quick} onClose={() => setQuick(null)} />}
      <IssueModal warehouse={issue} onClose={() => setIssue(null)} />
      {vehicleEdit && <VehicleModal vehicle={vehicleEdit} onClose={() => setVehicleEdit(null)} />}
      {receive && <ReceiveModal warehouse={receive} onClose={() => setReceive(null)} />}
      {depotEdit && <FuelDepotModal depot={depotEdit} onClose={() => setDepotEdit(null)} />}

      {pick && (
        <PickSheet
          title={{ issue: 'Xuất kho — chọn kho', receive: 'Nhập hàng — chọn kho', vehicle: 'Báo tình trạng — chọn phương tiện' }[pick]}
          hint={pick === 'vehicle' ? 'Vạch màu theo mức nhiên liệu đã báo (dưới 20% Đỏ)' : 'Kho có cảnh báo nặng lên đầu'}
          items={pickItems}
          empty={pick === 'vehicle' ? 'Không có phương tiện bạn được báo tình trạng trong vùng đang xem' : 'Không có kho bạn được ghi trong vùng đang xem'}
          onPick={(it) => openTarget(pick, it.value)}
          onClose={() => setPick(null)}
        />
      )}
      {/* Điện thoại: thao tác chính ở vùng ngón cái (khung chung với Tổng quan, Bản đồ) — chỉ nút tài khoản làm được */}
      <QuickActionBar
        slots={[
          targets.issue.length ? { key: 'xuat-kho', label: 'Xuất kho', icon: PackageMinus, onClick: () => startPick('issue'), ...offlineSlot } : null,
          targets.receive.length ? { key: 'nhap-kho', label: 'Nhập kho', icon: PackagePlus, onClick: () => startPick('receive'), ...offlineSlot } : null,
          targets.vehicle.length ? { key: 'bao-xe', label: 'Báo xe', icon: Truck, onClick: () => startPick('vehicle'), ...offlineSlot } : null,
        ]}
        onSos={canReport ? () => setReportOpen(true) : null}
      />
      {canReport && <QuickIncidentModal open={reportOpen} onClose={() => setReportOpen(false)} />}
    </div>
  );
}
