import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowUpDown, Boxes, ChartLine, ChevronLeft, ChevronRight, Droplets, FileDown, FileSpreadsheet, Loader2, MapPin, Megaphone, Mountain, Search,
  Siren, Waves, X,
} from 'lucide-react';
import { useAreaQuery } from '../../api/hooks';
import { useStore } from '../../app/store';
import { usePermission } from '../../rbac/usePermission';
import { exportExcel } from '../../utils/exportExcel';
import { exportSnapshotPdf } from '../../utils/exportPdf';
import { INCIDENT, PRIORITY, SOS_STATUS } from '../../utils/labels';
import { dateTime, int, minutesSince, num, vnFileStamp } from '../../utils/format';
import { LANDSLIDE_LEVEL, levelOf, RESERVOIR_LEVEL, risk, sosLevel } from '../../utils/risk';
import { slaState } from '../../utils/sla';
import { useMediaQuery } from '../../utils/useMediaQuery';
import { ErrorState, Skeleton } from '../common/ui';
import { riverState } from './RiverKpi';

const TABS = [
  { id: 'rivers', label: 'Mực nước & trạm thủy văn', short: 'Mực nước', noun: 'trạm mực nước', icon: Waves },
  { id: 'reservoirs', label: 'Hồ chứa & xả lũ', short: 'Hồ chứa', noun: 'hồ chứa', icon: Droplets },
  { id: 'landslides', label: 'Điểm đen sạt lở', short: 'Sạt lở', noun: 'điểm đen sạt lở', icon: Mountain },
  { id: 'sos', label: 'Phiếu SOS đang mở', short: 'SOS', noun: 'phiếu SOS', icon: Siren, perm: 'sos' },
  { id: 'supplies', label: 'Kho vật tư dự trữ', short: 'Kho', noun: 'kho vật tư', icon: Boxes, perm: 'resource' },
];
// Lọc theo thang màu rủi ro chung (utils/risk.js) — cùng tên màu ở mọi màn hình
const LEVEL_FILTERS = [
  ['all', 'Mọi mức'], ['3', 'Đỏ – khẩn cấp'], ['2', 'Cam – nguy hiểm'], ['1', 'Vàng – theo dõi'], ['0', 'Xanh – dưới ngưỡng'],
  ['none', 'Xám – chưa có dữ liệu'],
];
const CATS = [['luong_thuc', 'Lương thực'], ['nuoc_uong', 'Nước uống'], ['do_dung', 'Áo phao & đồ cứu sinh']];
const WAREHOUSE_LEVEL = { tinh: 'Kho tỉnh', cum: 'Kho cụm', xa: 'Kho xã', da_chien: 'Kho dã chiến' };
const ALERT_CHANNELS = ['SMS', 'CELL_BROADCAST', 'ZALO_OA', 'LOA']; // như mặc định khung soạn (pages/Alerts.jsx)
const EMPTY = {
  rivers: 'Chưa có trạm mực nước trong vùng đang xem (nhập loại "Trạm quan trắc")',
  reservoirs: 'Chưa có hồ chứa trong vùng đang xem (nhập loại "Hồ chứa")',
  landslides: 'Chưa có điểm đen sạt lở trong vùng đang xem',
  sos: 'Không có phiếu SOS đang mở trong vùng đang xem',
  supplies: 'Chưa có kho / tồn kho kèm định mức dự trữ trong vùng đang xem',
};

function buildRows(tab, { stations, reservoirs, points, tickets, supplies }) {
  if (tab === 'rivers') {
    return stations.map((s) => {
      const st = riverState(s);
      return {
        id: s.id, name: s.name, sub: s.river ? `Sông ${s.river}` : '', area: s.admin_name, lat: s.lat, lon: s.lon,
        level: st.level, levelText: st.label, value: st.value, thr: s.thresholds || {}, time: s.value == null ? null : s.time,
      };
    });
  }
  if (tab === 'reservoirs') {
    // Mức theo trạng thái máy chủ (services/reservoirs.py): xả lũ lớn Đỏ, xả điều tiết Cam, chưa xả Xanh, chưa có số liệu Xám
    return reservoirs.map((r) => {
      const has = !!r.updated_at; // có số liệu vận hành (thời điểm số liệu, không phải lần nhập danh mục)
      return {
        id: r.id, name: r.name, sub: r.river ? `Sông ${r.river}` : '', area: r.admin_name, lat: r.lat, lon: r.lon,
        level: levelOf(RESERVOIR_LEVEL, r.status_code), levelText: `${r.status_label}${r.stale ? ' (số liệu cũ)' : ''}`,
        waterLevel: has ? r.current_level : null, normal: r.normal_level, diff: has ? r.level_diff : null,
        gatesOpen: has ? r.spill_gates_open : null, gates: r.spill_gates, inflow: r.inflow_m3s, outflow: r.outflow_m3s,
        time: r.updated_at, stale: r.stale, warning: r.downstream_warning,
      };
    });
  }
  if (tab === 'landslides') {
    return points.map((p) => ({
      id: p.code, name: p.name, sub: p.road_name, area: p.admin_name, adminCode: p.admin_code, lat: p.lat, lon: p.lon,
      level: levelOf(LANDSLIDE_LEVEL, p.traffic_status), levelText: p.traffic_label, risk: p.risk_label,
      rain24: p.rain_info?.rain_24h_mm, tilt: p.tilt_info?.current_tilt_deg, action: p.response_action,
    }));
  }
  if (tab === 'sos') {
    return tickets
      .filter((t) => t.status !== 'hoan_thanh')
      .map((t) => {
        const late = !!slaState(t, Date.now())?.breached; // cùng quy tắc với Điều hành cứu hộ và KPI (utils/sla)
        return {
          id: t.id, name: t.code, sub: INCIDENT[t.incident_type], area: t.admin_name, adminCode: t.admin_code, lat: t.lat, lon: t.lon,
          level: sosLevel(t.priority, late), late, levelText: late ? 'Quá hạn phản hồi' : PRIORITY[t.priority]?.label, address: t.address,
          trapped: t.trapped_count, status: SOS_STATUS[t.status], waited: minutesSince(t.received_at), priority: t.priority,
        };
      });
  }
  return supplies.map((w) => {
    const vals = CATS.map(([key]) => w[key]).filter((v) => v != null);
    const low = vals.length ? Math.min(...vals) : null;
    // Đỏ: có mặt hàng < 20% định mức (cạn kiệt — thiết kế mục C); Vàng: < 50% (cần bổ sung — như KPI trang Vật tư)
    const level = low == null ? null : low < 20 ? 3 : low < 50 ? 1 : 0;
    return {
      id: w.code, name: w.name, sub: WAREHOUSE_LEVEL[w.level] || w.level, area: '', level, pcts: Object.fromEntries(CATS.map(([key]) => [key, w[key]])),
      levelText: low == null ? 'Chưa có định mức' : low < 20 ? `Có mặt hàng ${low}% (< 20%)` : low < 50 ? `Thấp nhất ${low}% (< 50%)` : `Thấp nhất ${low}%`,
    };
  });
}

/** Cột dữ liệu từng chuyên đề — dùng chung cho bảng (máy tính, PDF) và thẻ (điện thoại). */
const COLUMNS = {
  rivers: [
    { label: 'Xã/phường', sort: 'area', cell: (r) => r.area || '–' },
    { label: 'Mực nước', sort: 'value', num: true, cell: (r) => (r.value == null ? '–' : `${num(r.value, 2)} m`) },
    { label: 'BĐ I / II / III', num: true, cell: (r) => [r.thr.bd1, r.thr.bd2, r.thr.bd3].map((x) => (x == null ? '–' : num(x, 2))).join(' / ') },
    { label: 'Số đo lúc', sort: 'time', cell: (r) => (r.time ? dateTime(r.time) : 'không có số đo 2 giờ qua') },
  ],
  // Đơn vị nối với số bằng dấu cách không ngắt: thẻ điện thoại hẹp xuống dòng sau "/" chứ không để "m" lẻ một dòng
  reservoirs: [
    { label: 'Xã/phường', sort: 'area', cell: (r) => r.area || '–' },
    { label: 'Mực nước / MNDBT', sort: 'diff', num: true, cell: (r) => (r.waterLevel == null ? '–' : `${num(r.waterLevel, 2)} / ${num(r.normal, 2)} m`) },
    { label: 'Cửa xả mở', sort: 'gatesOpen', num: true, cell: (r) => (r.gatesOpen == null ? '–' : `${int(r.gatesOpen)}/${int(r.gates)}`) },
    { label: 'Q đến / Q xả', sort: 'outflow', num: true, cell: (r) => (r.inflow == null ? '–' : `${int(r.inflow)} / ${int(r.outflow)} m³/s`) },
    { label: 'Số liệu lúc', sort: 'time', cell: (r) => (r.time ? `${dateTime(r.time)}${r.stale ? ' (cũ)' : ''}` : 'chưa có số liệu vận hành') },
  ],
  landslides: [
    { label: 'Xã/phường', sort: 'area', cell: (r) => r.area || '–' },
    { label: 'Mưa 24h', sort: 'rain24', num: true, cell: (r) => (r.rain24 == null ? '–' : `${num(r.rain24, 1)} mm`) },
    { label: 'Nghiêng', sort: 'tilt', num: true, cell: (r) => (r.tilt == null ? '–' : `${num(r.tilt, 2)}°`) },
    { label: 'Nguy cơ', cell: (r) => r.risk || '–' },
  ],
  sos: [
    { label: 'Xã/phường', sort: 'area', cell: (r) => r.area || '–', sub: (r) => r.address },
    { label: 'Số người', sort: 'trapped', num: true, cell: (r) => r.trapped ?? '?' },
    { label: 'Trạng thái', cell: (r) => r.status },
    { label: 'Từ lúc nhận', sort: 'waited', num: true, cell: (r) => `${int(r.waited)} phút`, alarm: (r) => r.late },
  ],
  supplies: CATS.map(([key, label]) => ({
    label,
    num: true,
    cell: (r) => (r.pcts[key] == null ? '–' : `${r.pcts[key]}%`),
    alarm: (r) => r.pcts[key] != null && r.pcts[key] < 20,
  })),
};

function excelRows(tab, rows) {
  return rows.map((r, i) => {
    const base = { STT: i + 1 };
    if (tab === 'rivers') {
      return {
        ...base, 'Mã trạm': r.id, 'Tên trạm': r.name, 'Sông': r.sub, 'Xã/phường': r.area || '',
        'Mực nước (m)': r.value ?? '', 'BĐ I (m)': r.thr.bd1 ?? '', 'BĐ II (m)': r.thr.bd2 ?? '', 'BĐ III (m)': r.thr.bd3 ?? '',
        'Tình trạng': r.levelText, 'Mức màu': risk(r.level).name, 'Số đo lúc': r.time ? dateTime(r.time) : '',
      };
    }
    if (tab === 'reservoirs') {
      return {
        ...base, 'Mã hồ': r.id, 'Tên hồ': r.name, 'Sông': r.sub, 'Xã/phường': r.area || '',
        'Mực nước (m)': r.waterLevel ?? '', 'MNDBT (m)': r.normal ?? '', 'Chênh so MNDBT (m)': r.diff ?? '',
        'Cửa xả đang mở': r.gatesOpen ?? '', 'Tổng số cửa xả': r.gates ?? '', 'Q đến (m³/s)': r.inflow ?? '', 'Q xả (m³/s)': r.outflow ?? '',
        'Trạng thái': r.levelText, 'Mức màu': risk(r.level).name, 'Số liệu lúc': r.time ? dateTime(r.time) : '', 'Khuyến cáo hạ du': r.warning || '',
      };
    }
    if (tab === 'landslides') {
      return {
        ...base, 'Mã điểm': r.id, 'Điểm đen': r.name, 'Tuyến đường': r.sub, 'Xã/phường': r.area || '',
        'Mưa 24h (mm)': r.rain24 ?? '', 'Độ nghiêng (°)': r.tilt ?? '', 'Nguy cơ': r.risk || '', 'Giao thông': r.levelText,
        'Mức màu': risk(r.level).name, 'Hướng xử lý': r.action || '',
      };
    }
    if (tab === 'sos') {
      return {
        ...base, 'Mã phiếu': r.name, 'Loại sự cố': r.sub, 'Xã/phường': r.area || '', 'Địa chỉ': r.address || '',
        'Số người': r.trapped ?? '', 'Mức ưu tiên': PRIORITY[r.priority]?.label || '', 'Trạng thái': r.status, 'Từ lúc nhận (phút)': r.waited,
        'Ghi chú': r.late ? 'Quá hạn phản hồi' : '',
      };
    }
    return {
      ...base, 'Mã kho': r.id, 'Tên kho': r.name, 'Cấp kho': r.sub,
      ...Object.fromEntries(CATS.map(([key, label]) => [`${label} (% định mức)`, r.pcts[key] ?? ''])), 'Đánh giá': r.levelText,
    };
  });
}

const Chip = ({ r }) => <span className={clsx('chip whitespace-nowrap px-2 py-0 text-[10px]', risk(r.level).chip)}>{r.levelText}</span>;

/**
 * Bảng tác chiến dưới Dashboard: 5 chuyên đề, mọi dòng từ API thật (trạm; hồ chứa và điểm đen sạt lở trong KPI — cùng vùng
 * đang xem, không thêm lượt gọi; phiếu SOS; kho).
 * Tìm kiếm, lọc theo mức màu, sắp xếp, phân trang, xuất Excel / PDF (toàn bộ danh sách đã lọc, không chỉ trang đang xem).
 * Điện thoại (< 640 px): mỗi dòng là một thẻ, nút to — không phải kéo ngang bảng 760 px. Thao tác chỉ dẫn tới luồng
 * nghiệp vụ có sẵn: bản đồ, Điều hành cứu hộ, khung soạn cảnh báo (vẫn Maker–Checker + PIN). Chuyên đề / nút chỉ hiện khi
 * tài khoản có quyền (SOS: sos.view; Kho: resource.view) — backend vẫn kiểm tra lại.
 */
export default function OperationsTable({ k, kState, stations, stationsState, onSelectStation, scopeLabel, className }) {
  const navigate = useNavigate();
  const { toast, setFocus, setAlertDraft } = useStore();
  const canAlert = usePermission('alert', 'create');
  const canSos = usePermission('sos', 'view');
  const canResource = usePermission('resource', 'view');
  const isWide = useMediaQuery('(min-width: 640px)');
  const tabs = TABS.filter((t) => !t.perm || (t.perm === 'sos' ? canSos : canResource));
  const [tab, setTab] = useState('rivers');
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'rank', desc: true });
  const [selected, setSelected] = useState(() => new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pdf, setPdf] = useState(false); // đang chụp PDF: vẽ bảng đủ mọi dòng đã lọc, bỏ cột chọn / thao tác
  const tableRef = useRef(null);

  // /sos không cache (cần tươi tuyệt đối) → chỉ tải khi mở tab SOS, không nhân tải cho mọi cán bộ đang xem Dashboard
  const ticketsQ = useAreaQuery('sos', '/sos', {}, { refetchInterval: 20_000, enabled: tab === 'sos' && canSos });
  const suppliesQ = useAreaQuery('supplies', '/dashboard/supplies', {}, { refetchInterval: 60_000, enabled: canResource });

  const state = {
    rivers: stationsState,
    reservoirs: kState,
    landslides: kState,
    sos: { loading: ticketsQ.isLoading, error: ticketsQ.isError && !ticketsQ.data, refetch: ticketsQ.refetch },
    supplies: { loading: suppliesQ.isLoading, error: suppliesQ.isError && !suppliesQ.data, refetch: suppliesQ.refetch },
  }[tab] || {};
  const rows = useMemo(
    () => buildRows(tab, {
      stations, reservoirs: k?.reservoirs?.reservoirs || [], points: k?.landslides?.points || [], tickets: ticketsQ.data || [], supplies: suppliesQ.data || [],
    })
      .map((r) => ({ ...r, rank: r.level ?? -1 })),
    [tab, stations, k, ticketsQ.data, suppliesQ.data],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => (levelFilter === 'all' || (levelFilter === 'none' ? r.level == null : r.level === Number(levelFilter)))
      && (!q || [r.id, r.name, r.sub, r.area, r.levelText, r.address].some((x) => x && String(x).toLowerCase().includes(q))));
    const dir = sort.desc ? -1 : 1;
    return list.sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === 'string' ? x.localeCompare(y, 'vi') : x - y) * dir;
    });
  }, [rows, search, levelFilter, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages);
  const visible = pdf ? filtered : filtered.slice((cur - 1) * pageSize, cur * pageSize);
  const chosen = filtered.filter((r) => selected.has(r.id));
  const allChecked = filtered.length > 0 && chosen.length === filtered.length;
  const cols = COLUMNS[tab];
  const tabInfo = TABS.find((t) => t.id === tab);

  const switchTab = (id) => {
    setTab(id);
    setSelected(new Set());
    setLevelFilter('all');
    setSearch('');
    setPage(1);
    setSort({ key: 'rank', desc: true });
  };
  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const onSort = (key) => setSort((s) => ({ key, desc: s.key === key ? !s.desc : true }));
  const showOnMap = (r) => {
    setFocus({ lat: r.lat, lon: r.lon, zoom: 13, label: r.name });
    navigate('/ban-do');
  };

  const doExcel = async (list) => {
    if (!list.length) return;
    try {
      await exportExcel(excelRows(tab, list), { sheet: tabInfo.label, filename: `bang-tac-chien-${tab}-${vnFileStamp(new Date(), true)}.xlsx` });
    } catch (e) {
      toast({ tone: 'danger', title: 'Không xuất được tệp Excel', body: e.message });
    }
  };

  // PDF như trang Vật tư & Lực lượng (utils/exportPdf: chụp bảng, tiêu đề vẽ qua canvas để giữ dấu tiếng Việt) — vẽ đủ
  // mọi dòng ĐÃ LỌC dạng bảng (cả trên điện thoại), chụp xong trả lại phân trang
  const doPdf = async () => {
    if (!filtered.length || pdf) return;
    setPdf(true);
    try {
      await new Promise((resolve) => { requestAnimationFrame(() => requestAnimationFrame(resolve)); });
      const now = new Date();
      const lv = LEVEL_FILTERS.find(([id]) => id === levelFilter)?.[1];
      await exportSnapshotPdf(tableRef.current, {
        title: `BẢNG TÁC CHIẾN – ${tabInfo.label.toUpperCase()}`,
        subtitle: [scopeLabel, `${filtered.length} mục`, levelFilter !== 'all' && lv, search.trim() && `tìm "${search.trim()}"`, now.toLocaleString('vi-VN')]
          .filter(Boolean).join(' · '),
        filename: `bang-tac-chien-${tab}-${vnFileStamp(now, true)}.pdf`,
      });
    } catch (e) {
      toast({ tone: 'danger', title: 'Không xuất được PDF', body: e.message });
    } finally {
      setPdf(false);
    }
  };

  // Soạn cảnh báo cho các xã của dòng đã chọn: chỉ điền sẵn vùng nhận + tiêu đề vào khung soạn có sẵn; người soạn chọn
  // mẫu tin, kiểm tra rồi gửi duyệt — lệnh vẫn qua Lãnh đạo phê duyệt (Maker–Checker + PIN), không phát từ đây.
  const codes = [...new Set(chosen.map((r) => r.adminCode).filter(Boolean))];
  const draftAlert = () => {
    const top = Math.max(...chosen.map((r) => r.level ?? 0));
    setAlertDraft({
      prefill: {
        title: tab === 'landslides' ? 'Cảnh báo nguy cơ sạt lở' : 'Cảnh báo khẩn cấp',
        body: '',
        severity: top >= 3 ? 'do' : top === 2 ? 'cam' : 'vang',
        codes,
        channels: ALERT_CHANNELS,
        validHours: 48,
      },
    });
    toast({ tone: 'info', title: `Đã chuyển ${codes.length} xã/phường sang khung soạn cảnh báo`, body: 'Chọn mẫu tin, kiểm tra nội dung và vùng nhận rồi gửi Lãnh đạo phê duyệt' });
    navigate('/canh-bao');
  };

  const actions = (r, big) => {
    const cls = clsx('btn-ghost tap text-[11px]', big ? 'min-h-[40px] flex-1 px-3' : 'px-2 py-0.5');
    return (
      <>
        {tab === 'rivers' && onSelectStation && (
          <button type="button" className={cls} onClick={() => onSelectStation(r.id)} title="Xem biểu đồ thuỷ văn của trạm">
            <ChartLine size={12} /> Biểu đồ
          </button>
        )}
        {tab === 'sos' && canSos && <Link to="/cuu-ho" className={cls}>Điều phối</Link>}
        {tab === 'supplies' && canResource && <Link to="/nguon-luc" className={cls}>Kho</Link>}
        {tab !== 'supplies' && r.lat != null && (
          <button type="button" className={cls} onClick={() => showOnMap(r)} title="Xem trên bản đồ giám sát">
            <MapPin size={12} /> Bản đồ
          </button>
        )}
      </>
    );
  };

  const asTable = isWide || pdf;
  const status = state.loading
    ? 'loading'
    : state.error ? 'error' : !visible.length ? 'empty' : 'rows';
  const statusBox = status === 'loading'
    ? <Skeleton height={140} />
    : status === 'error'
      ? <ErrorState onRetry={state.refetch}>Không tải được danh sách {tabInfo.noun}</ErrorState>
      : status === 'empty'
        ? <p className="p-6 text-center text-xs text-muted">{rows.length ? 'Không có mục khớp bộ lọc' : EMPTY[tab]}</p>
        : null;

  return (
    <section className={clsx('card flex flex-col gap-3 p-3 sm:p-4', className)}>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="card-title">Bảng tác chiến theo chuyên đề</h2>
        <div className="scroll-thin -mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5" role="tablist" aria-label="Chuyên đề của bảng">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => switchTab(t.id)}
              className={clsx(
                'tap flex min-h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1 text-xs font-semibold',
                tab === t.id ? 'border-accent bg-accent text-white' : 'border-line bg-panel2/60 text-ink-2 hover:text-ink',
              )}
            >
              <t.icon size={13} aria-hidden="true" /> <span className="sm:hidden">{t.short}</span><span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-[1_1_220px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            className="input tap min-h-[40px] py-1 pl-8 pr-8 text-xs"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Tìm theo tên, mã, xã/phường, tình trạng…"
            aria-label="Tìm trong bảng"
          />
          {search && (
            <button type="button" className="tap-sq absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-muted hover:text-ink [@media(pointer:coarse)]:right-0" onClick={() => setSearch('')} aria-label="Xoá tìm kiếm">
              <X size={13} />
            </button>
          )}
        </div>
        <select className="input tap min-h-[40px] w-auto py-1 text-xs" value={levelFilter} onChange={(e) => { setLevelFilter(e.target.value); setPage(1); }} aria-label="Lọc theo mức màu">
          {LEVEL_FILTERS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost tap min-h-[40px] px-2.5 py-1 text-xs" onClick={() => doExcel(filtered)} disabled={!filtered.length}>
            <FileSpreadsheet size={13} /> Excel
          </button>
          <button type="button" className="btn-ghost tap min-h-[40px] px-2.5 py-1 text-xs" onClick={doPdf} disabled={!filtered.length || pdf}>
            {pdf ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />} PDF
          </button>
        </div>
      </div>

      {chosen.length > 0 && (
        <div className="sticky top-12 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-panel/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
          <span className="flex items-center gap-1.5 rounded-lg bg-accent/15 px-2 py-0.5 font-bold text-accent">
            Đã chọn {chosen.length} mục
          </span>
          <button type="button" className="btn-primary tap min-h-[36px] px-2.5 py-1 text-xs font-semibold" onClick={() => doExcel(chosen)}>
            <FileSpreadsheet size={13} /> Xuất Excel mục đã chọn
          </button>
          {canAlert && (tab === 'landslides' || tab === 'sos') && (
            <button
              type="button"
              className="btn-danger tap min-h-[36px] px-2.5 py-1 text-xs font-bold"
              onClick={draftAlert}
              disabled={!codes.length}
              title={codes.length ? 'Mở khung soạn cảnh báo, điền sẵn các xã/phường của mục đã chọn' : 'Mục đã chọn chưa gắn xã/phường'}
            >
              <Megaphone size={13} /> Soạn cảnh báo cho {codes.length} xã/phường
            </button>
          )}
          <button type="button" className="tap ml-auto min-h-[36px] px-1 text-xs text-muted hover:text-ink" onClick={() => setSelected(new Set())}>
            Bỏ chọn
          </button>
        </div>
      )}

      {statusBox || (asTable ? (
        // relative: caption sr-only (position: absolute) phải có khối chứa trong vùng cuộn — nếu không nó "lọt" khỏi <main>,
        // kéo dài cả trang → cuộn hết nội dung thì toàn bộ ứng dụng trôi lên, lộ khoảng trắng (máy tính, iPad)
        <div className="scroll-thin relative overflow-x-auto rounded-lg border border-line">
          <table ref={tableRef} className={clsx('w-full bg-panel text-left text-xs', pdf ? 'min-w-[1100px]' : 'min-w-[760px]')}>
            <caption className="sr-only">{tabInfo.label} — {filtered.length} mục</caption>
            <thead className="bg-panel2/70 text-[11px] uppercase tracking-wide text-muted">
              <tr>
                {!pdf && (
                  <th scope="col" className="w-8 p-0">
                    {/* Ô chọn nằm trong nhãn phủ cả ô bảng — màn cảm ứng chạm trúng dễ (≥ 44 px), không phải nhắm ô 13 px */}
                    <label className="tap-sq flex cursor-pointer items-center justify-center p-2.5">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        onChange={() => setSelected(allChecked ? new Set() : new Set(filtered.map((r) => r.id)))}
                        aria-label="Chọn tất cả"
                      />
                    </label>
                  </th>
                )}
                {[{ label: { rivers: 'Trạm', reservoirs: 'Hồ', landslides: 'Điểm', sos: 'Phiếu', supplies: 'Kho' }[tab], sort: 'name' }, ...cols,
                  { label: { landslides: 'Giao thông', reservoirs: 'Trạng thái' }[tab] || 'Mức', sort: 'rank' }].map((col) => (
                  <th
                    key={col.label}
                    scope="col"
                    className={clsx('p-2.5 font-semibold', col.num && 'text-right')}
                    aria-sort={col.sort && sort.key === col.sort ? (sort.desc ? 'descending' : 'ascending') : undefined}
                  >
                    {col.sort && !pdf ? (
                      <button type="button" className="tap-sq inline-flex items-center gap-1 uppercase hover:text-ink" onClick={() => onSort(col.sort)}>
                        {col.label}
                        <ArrowUpDown size={11} className={sort.key === col.sort ? 'text-accent' : 'opacity-40'} aria-hidden="true" />
                      </button>
                    ) : col.label}
                  </th>
                ))}
                {!pdf && <th scope="col" className="p-2.5 text-right font-semibold">Thao tác</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {visible.map((r) => (
                <tr key={r.id} className={clsx('hover:bg-panel2/50', selected.has(r.id) && !pdf && 'bg-accent/5')}>
                  {!pdf && (
                    <td className="p-0">
                      <label className="tap-sq flex cursor-pointer items-center justify-center p-2.5">
                        <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Chọn ${r.name}`} />
                      </label>
                    </td>
                  )}
                  <td className={clsx('p-2.5', !pdf && 'max-w-[240px]')}>
                    <div className={clsx('font-semibold text-ink', !pdf && 'truncate')} title={r.name}>{r.name}</div>
                    {r.sub && <div className={clsx('text-muted', !pdf && 'truncate')} title={r.sub}>{r.sub}</div>}
                  </td>
                  {cols.map((col) => (
                    <td
                      key={col.label}
                      className={clsx('p-2.5', col.num && 'whitespace-nowrap text-right font-mono', col.alarm?.(r) && 'font-bold text-danger')}
                    >
                      <div className={clsx(!pdf && !col.num && 'max-w-[200px] truncate')}>{col.cell(r)}</div>
                      {col.sub?.(r) && <div className={clsx('text-muted', !pdf && 'max-w-[200px] truncate')} title={col.sub(r)}>{col.sub(r)}</div>}
                    </td>
                  ))}
                  <td className="p-2.5"><Chip r={r} /></td>
                  {!pdf && (
                    <td className="p-2.5">
                      <div className="flex justify-end gap-1">{actions(r, false)}</div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        // Điện thoại: mỗi dòng một thẻ — vạch màu trái theo mức, số liệu 2 cột, nút cao ≥ 40 px
        <ul className="flex flex-col gap-2" aria-label={tabInfo.label}>
          {visible.map((r) => (
            <li key={r.id} className={clsx('rounded-xl border border-l-4 bg-panel p-3', risk(r.level).edge, selected.has(r.id) ? 'border-accent' : 'border-line')}>
              <div className="flex items-start gap-2.5">
                <label className="tap-sq -m-2 flex shrink-0 cursor-pointer items-start justify-center p-2">
                  <input type="checkbox" className="mt-0.5 h-5 w-5" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Chọn ${r.name}`} />
                </label>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <b className="block text-sm leading-snug text-ink">{r.name}</b>
                      {r.sub && <span className="block text-xs text-muted">{r.sub}</span>}
                    </div>
                    <Chip r={r} />
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    {cols.map((col) => (
                      <div key={col.label} className="min-w-0">
                        <dt className="text-[11px] text-muted">{col.label}</dt>
                        <dd className={clsx('break-words font-medium text-ink', col.num && 'font-mono', col.alarm?.(r) && 'font-bold text-danger')}>
                          {col.cell(r)}
                          {col.sub?.(r) && <span className="block font-normal text-muted">{col.sub(r)}</span>}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-2.5 flex gap-2">{actions(r, true)}</div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted no-print">
        <span>
          {filtered.length} mục{filtered.length !== rows.length && ` (trong ${rows.length})`}
        </span>
        <div className="flex items-center gap-2">
          <select className="input tap min-h-[36px] w-auto py-0.5 text-xs" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} aria-label="Số dòng mỗi trang">
            {[10, 20, 50].map((n) => <option key={n} value={n}>{n} dòng</option>)}
          </select>
          <button type="button" className="btn-ghost tap-sq h-9 w-9 p-0" onClick={() => setPage(Math.max(1, cur - 1))} disabled={cur <= 1} aria-label="Trang trước">
            <ChevronLeft size={15} />
          </button>
          <span className="font-mono">{cur}/{pages}</span>
          <button type="button" className="btn-ghost tap-sq h-9 w-9 p-0" onClick={() => setPage(Math.min(pages, cur + 1))} disabled={cur >= pages} aria-label="Trang sau">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </section>
  );
}
