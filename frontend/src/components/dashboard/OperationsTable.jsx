import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowUpDown, Boxes, ChartLine, ChevronLeft, ChevronRight, FileSpreadsheet, MapPin, Megaphone, Mountain, Search, Siren, Waves, X,
} from 'lucide-react';
import { useAreaQuery } from '../../api/hooks';
import { useStore } from '../../app/store';
import { usePermission } from '../../rbac/usePermission';
import { exportExcel } from '../../utils/exportExcel';
import { INCIDENT, PRIORITY, SOS_STATUS } from '../../utils/labels';
import { dateTime, int, minutesSince, num, vnFileStamp } from '../../utils/format';
import { slaState } from '../../utils/sla';
import { riverState } from './RiverKpi';

const TABS = [
  { id: 'rivers', label: 'Mực nước & trạm thủy văn', icon: Waves },
  { id: 'landslides', label: 'Điểm đen sạt lở', icon: Mountain },
  { id: 'sos', label: 'Phiếu SOS đang mở', icon: Siren },
  { id: 'supplies', label: 'Kho vật tư dự trữ', icon: Boxes },
];
const SEVERITY = [
  { id: 'all', label: 'Mọi mức' },
  { id: 'danger', label: 'Đỏ' },
  { id: 'serious', label: 'Cam' },
  { id: 'warn', label: 'Vàng' },
  { id: 'good', label: 'Dưới ngưỡng' },
  { id: 'muted', label: 'Chưa có dữ liệu' },
];
const TONE = ['good', 'warn', 'serious', 'danger'];
const CHIP = { danger: 'bg-danger text-white', serious: 'bg-serious text-white', warn: 'bg-warn text-black', good: 'bg-good text-white', muted: 'bg-panel2 text-muted' };
const LS_LEVEL = { cam_duong: 3, canh_bao: 2, thong_suot: 0 }; // chua_co_du_lieu → không đánh giá (xám)
const CATS = [['luong_thuc', 'Lương thực'], ['nuoc_uong', 'Nước uống'], ['do_dung', 'Áo phao & đồ cứu sinh']];
const WAREHOUSE_LEVEL = { tinh: 'Kho tỉnh', cum: 'Kho cụm', xa: 'Kho xã', da_chien: 'Kho dã chiến' };
const ALERT_CHANNELS = ['SMS', 'CELL_BROADCAST', 'ZALO_OA', 'LOA']; // như mặc định khung soạn (pages/Alerts.jsx)
const EMPTY = {
  rivers: 'Chưa có trạm mực nước trong vùng đang xem (nhập loại "Trạm quan trắc")',
  landslides: 'Chưa có điểm đen sạt lở trong vùng đang xem',
  sos: 'Không có phiếu SOS đang mở trong vùng đang xem',
  supplies: 'Chưa có kho / tồn kho kèm định mức dự trữ trong vùng đang xem',
};

function buildRows(tab, { stations, points, tickets, supplies }) {
  if (tab === 'rivers') {
    return stations.map((s) => {
      const st = riverState(s);
      return {
        id: s.id, name: s.name, sub: s.river ? `Sông ${s.river}` : '', area: s.admin_name, lat: s.lat, lon: s.lon,
        level: st.level ?? -1, tone: st.level == null ? 'muted' : TONE[st.level], levelText: st.label,
        value: st.value, thr: s.thresholds || {}, time: s.value == null ? null : s.time,
      };
    });
  }
  if (tab === 'landslides') {
    return points.map((p) => {
      const lv = LS_LEVEL[p.traffic_status] ?? -1;
      return {
        id: p.code, name: p.name, sub: p.road_name, area: p.admin_name, adminCode: p.admin_code, lat: p.lat, lon: p.lon,
        level: lv, tone: lv < 0 ? 'muted' : TONE[lv], levelText: p.traffic_label, risk: p.risk_label,
        rain24: p.rain_info?.rain_24h_mm, tilt: p.tilt_info?.current_tilt_deg, action: p.response_action,
      };
    });
  }
  if (tab === 'sos') {
    return tickets
      .filter((t) => t.status !== 'hoan_thanh')
      .map((t) => {
        const late = !!slaState(t, Date.now())?.breached; // cùng quy tắc với Điều hành cứu hộ và KPI (utils/sla)
        const lv = late || t.priority === 1 ? 3 : t.priority === 2 ? 2 : 1;
        return {
          id: t.id, name: t.code, sub: INCIDENT[t.incident_type], area: t.admin_name, adminCode: t.admin_code, lat: t.lat, lon: t.lon,
          level: lv, tone: TONE[lv], levelText: late ? 'Quá hạn phản hồi' : PRIORITY[t.priority]?.label, address: t.address,
          trapped: t.trapped_count, status: SOS_STATUS[t.status], waited: minutesSince(t.received_at), priority: t.priority,
        };
      });
  }
  return supplies.map((w) => {
    const vals = CATS.map(([key]) => w[key]).filter((v) => v != null);
    const low = vals.length ? Math.min(...vals) : null;
    const lv = low == null ? -1 : low < 20 ? 3 : 0; // định mức: dưới 20% là cạn kiệt (thiết kế mục C)
    return {
      id: w.code, name: w.name, sub: WAREHOUSE_LEVEL[w.level] || w.level, area: '', level: lv,
      tone: lv < 0 ? 'muted' : TONE[lv], levelText: low == null ? 'Chưa có định mức' : low < 20 ? `Có mặt hàng ${low}% (< 20%)` : `Thấp nhất ${low}%`,
      pcts: Object.fromEntries(CATS.map(([key]) => [key, w[key]])),
    };
  });
}

function excelRows(tab, rows) {
  return rows.map((r, i) => {
    const base = { STT: i + 1 };
    if (tab === 'rivers') {
      return {
        ...base, 'Mã trạm': r.id, 'Tên trạm': r.name, 'Sông': r.sub, 'Xã/phường': r.area || '',
        'Mực nước (m)': r.value ?? '', 'BĐ I (m)': r.thr.bd1 ?? '', 'BĐ II (m)': r.thr.bd2 ?? '', 'BĐ III (m)': r.thr.bd3 ?? '',
        'Tình trạng': r.levelText, 'Số đo lúc': r.time ? dateTime(r.time) : '',
      };
    }
    if (tab === 'landslides') {
      return {
        ...base, 'Mã điểm': r.id, 'Điểm đen': r.name, 'Tuyến đường': r.sub, 'Xã/phường': r.area || '',
        'Mưa 24h (mm)': r.rain24 ?? '', 'Độ nghiêng (°)': r.tilt ?? '', 'Nguy cơ': r.risk || '', 'Giao thông': r.levelText,
        'Hướng xử lý': r.action || '',
      };
    }
    if (tab === 'sos') {
      return {
        ...base, 'Mã phiếu': r.name, 'Loại sự cố': r.sub, 'Xã/phường': r.area || '', 'Địa chỉ': r.address || '',
        'Số người': r.trapped ?? '', 'Mức ưu tiên': PRIORITY[r.priority]?.label || '', 'Trạng thái': r.status, 'Từ lúc nhận (phút)': r.waited,
        'Ghi chú': r.levelText === 'Quá hạn phản hồi' ? 'Quá hạn phản hồi' : '',
      };
    }
    return {
      ...base, 'Mã kho': r.id, 'Tên kho': r.name, 'Cấp kho': r.sub,
      ...Object.fromEntries(CATS.map(([key, label]) => [`${label} (% định mức)`, r.pcts[key] ?? ''])), 'Đánh giá': r.levelText,
    };
  });
}

const Th = ({ k, sort, onSort, className, children }) => (
  <th scope="col" className={clsx('p-2.5 font-semibold', k && 'cursor-pointer hover:text-ink', className)} onClick={k ? () => onSort(k) : undefined}>
    <span className="inline-flex items-center gap-1">
      {children}
      {k && <ArrowUpDown size={11} className={sort.key === k ? 'text-accent' : 'opacity-40'} />}
    </span>
  </th>
);

/**
 * Bảng tác chiến dưới Dashboard: 4 chuyên đề, mọi dòng từ API thật (trạm, điểm đen sạt lở trong KPI, phiếu SOS, kho).
 * Thao tác chỉ dẫn tới luồng nghiệp vụ có sẵn: bản đồ, Điều hành cứu hộ, khung soạn cảnh báo (vẫn Maker–Checker + PIN).
 */
export default function OperationsTable({ k, stations, onSelectStation, className }) {
  const navigate = useNavigate();
  const { toast, setFocus, setAlertDraft } = useStore();
  const canAlert = usePermission('alert', 'create');
  const [tab, setTab] = useState('rivers');
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('all');
  const [sort, setSort] = useState({ key: 'level', desc: true });
  const [selected, setSelected] = useState(() => new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // /sos không cache (cần tươi tuyệt đối) → chỉ tải khi mở tab SOS, không nhân tải cho mọi cán bộ đang xem Dashboard
  const { data: tickets } = useAreaQuery('sos', '/sos', {}, { refetchInterval: 20_000, enabled: tab === 'sos' });
  const { data: supplies } = useAreaQuery('supplies', '/dashboard/supplies', {}, { refetchInterval: 60_000 });

  const loading = (tab === 'sos' && !tickets) || (tab === 'supplies' && !supplies) || (tab === 'landslides' && !k);
  const rows = useMemo(
    () => buildRows(tab, { stations, points: k?.landslides?.points || [], tickets: tickets || [], supplies: supplies || [] }),
    [tab, stations, k, tickets, supplies],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => (severity === 'all' || r.tone === severity)
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
  }, [rows, search, severity, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages);
  const visible = filtered.slice((cur - 1) * pageSize, cur * pageSize);
  const chosen = filtered.filter((r) => selected.has(r.id));
  const allChecked = filtered.length > 0 && chosen.length === filtered.length;

  const switchTab = (id) => {
    setTab(id);
    setSelected(new Set());
    setSeverity('all');
    setSearch('');
    setPage(1);
    setSort({ key: 'level', desc: true });
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

  const doExport = async (list) => {
    if (!list.length) return;
    try {
      await exportExcel(excelRows(tab, list), { sheet: TABS.find((t) => t.id === tab).label, filename: `bang-tac-chien-${tab}-${vnFileStamp(new Date(), true)}.xlsx` });
    } catch (e) {
      toast({ tone: 'danger', title: 'Không xuất được tệp Excel', body: e.message });
    }
  };

  // Soạn cảnh báo cho các xã của dòng đã chọn: chỉ điền sẵn vùng nhận + tiêu đề vào khung soạn có sẵn; người soạn chọn
  // mẫu tin, kiểm tra rồi gửi duyệt — lệnh vẫn qua Lãnh đạo phê duyệt (Maker–Checker + PIN), không phát từ đây.
  const codes = [...new Set(chosen.map((r) => r.adminCode).filter(Boolean))];
  const draftAlert = () => {
    const severityCode = chosen.some((r) => r.tone === 'danger') ? 'do' : chosen.some((r) => r.tone === 'serious') ? 'cam' : 'vang';
    setAlertDraft({
      prefill: {
        title: tab === 'landslides' ? 'Cảnh báo nguy cơ sạt lở' : 'Cảnh báo khẩn cấp',
        body: '',
        severity: severityCode,
        codes,
        channels: ALERT_CHANNELS,
        validHours: 48,
      },
    });
    toast({ tone: 'info', title: `Đã chuyển ${codes.length} xã/phường sang khung soạn cảnh báo`, body: 'Chọn mẫu tin, kiểm tra nội dung và vùng nhận rồi gửi Lãnh đạo phê duyệt' });
    navigate('/canh-bao');
  };

  const chip = (r) => <span className={clsx('chip whitespace-nowrap px-2 py-0 text-[10px]', CHIP[r.tone])}>{r.levelText}</span>;
  const mapBtn = (r) => r.lat != null && (
    <button type="button" className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => showOnMap(r)} title="Xem trên bản đồ giám sát">
      <MapPin size={12} /> Bản đồ
    </button>
  );

  return (
    <section className={clsx('card flex flex-col gap-3 p-3 sm:p-4', className)}>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="card-title">Bảng tác chiến theo chuyên đề</h2>
        <div className="scroll-thin flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => switchTab(t.id)}
              aria-pressed={tab === t.id}
              className={clsx(
                'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1 text-xs font-semibold',
                tab === t.id ? 'border-accent bg-accent text-white' : 'border-line bg-panel2/60 text-ink-2 hover:text-ink',
              )}
            >
              <t.icon size={13} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input py-1 pl-8 pr-7 text-xs"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Tìm theo tên, mã, xã/phường, tình trạng…"
            aria-label="Tìm trong bảng"
          />
          {search && (
            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink" onClick={() => setSearch('')} aria-label="Xoá tìm kiếm">
              <X size={12} />
            </button>
          )}
        </div>
        <select className="input w-auto py-1 text-xs" value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1); }} aria-label="Lọc theo mức">
          {SEVERITY.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <button type="button" className="btn-ghost px-2.5 py-1 text-xs" onClick={() => doExport(filtered)} disabled={!filtered.length}>
          <FileSpreadsheet size={13} /> Xuất Excel
        </button>
      </div>

      {chosen.length > 0 && (
        <div className="sticky top-12 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-panel/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
          <span className="flex items-center gap-1.5 rounded-lg bg-accent/15 px-2 py-0.5 font-bold text-accent">
            Đã chọn {chosen.length} mục
          </span>
          <button type="button" className="btn-primary px-2.5 py-1 text-xs font-semibold" onClick={() => doExport(chosen)}>
            <FileSpreadsheet size={13} /> Xuất Excel mục đã chọn
          </button>
          {canAlert && (tab === 'landslides' || tab === 'sos') && (
            <button
              type="button"
              className="btn-danger px-2.5 py-1 text-xs font-bold"
              onClick={draftAlert}
              disabled={!codes.length}
              title={codes.length ? 'Mở khung soạn cảnh báo, điền sẵn các xã/phường của mục đã chọn' : 'Mục đã chọn chưa gắn xã/phường'}
            >
              <Megaphone size={13} /> Soạn cảnh báo cho {codes.length} xã/phường
            </button>
          )}
          <button type="button" className="ml-auto text-xs text-muted hover:text-ink" onClick={() => setSelected(new Set())}>
            Bỏ chọn
          </button>
        </div>
      )}

      <div className="scroll-thin overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="bg-panel2/70 text-[11px] uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="w-8 p-2.5">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={() => setSelected(allChecked ? new Set() : new Set(filtered.map((r) => r.id)))}
                  aria-label="Chọn tất cả"
                />
              </th>
              <Th k="name" sort={sort} onSort={onSort}>{tab === 'sos' ? 'Phiếu' : tab === 'supplies' ? 'Kho' : tab === 'rivers' ? 'Trạm' : 'Điểm'}</Th>
              {tab !== 'supplies' && <Th k="area" sort={sort} onSort={onSort}>Xã/phường</Th>}
              {tab === 'rivers' && (
                <>
                  <Th k="value" sort={sort} onSort={onSort} className="text-right">Mực nước</Th>
                  <Th className="text-right">BĐ I / II / III</Th>
                  <Th k="time" sort={sort} onSort={onSort}>Số đo lúc</Th>
                </>
              )}
              {tab === 'landslides' && (
                <>
                  <Th k="rain24" sort={sort} onSort={onSort} className="text-right">Mưa 24h</Th>
                  <Th k="tilt" sort={sort} onSort={onSort} className="text-right">Nghiêng</Th>
                  <Th>Nguy cơ</Th>
                </>
              )}
              {tab === 'sos' && (
                <>
                  <Th k="trapped" sort={sort} onSort={onSort} className="text-right">Số người</Th>
                  <Th>Trạng thái</Th>
                  <Th k="waited" sort={sort} onSort={onSort} className="text-right">Từ lúc nhận</Th>
                </>
              )}
              {tab === 'supplies' && CATS.map(([key, label]) => <Th key={key} className="text-right">{label}</Th>)}
              <Th k="level" sort={sort} onSort={onSort}>{tab === 'landslides' ? 'Giao thông' : 'Mức'}</Th>
              <Th className="text-right">Thao tác</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {loading && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-muted">Đang tải…</td>
              </tr>
            )}
            {!loading && !visible.length && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-muted">{rows.length ? 'Không có mục khớp bộ lọc' : EMPTY[tab]}</td>
              </tr>
            )}
            {!loading && visible.map((r) => (
              <tr key={r.id} className={clsx('hover:bg-panel2/50', selected.has(r.id) && 'bg-accent/5')}>
                <td className="p-2.5">
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Chọn ${r.name}`} />
                </td>
                <td className="max-w-[240px] p-2.5">
                  <div className="truncate font-semibold text-ink" title={r.name}>{r.name}</div>
                  {r.sub && <div className="truncate text-muted" title={r.sub}>{r.sub}</div>}
                </td>
                {tab !== 'supplies' && (
                  <td className="max-w-[200px] p-2.5">
                    <div className="truncate">{r.area || '–'}</div>
                    {r.address && <div className="truncate text-muted" title={r.address}>{r.address}</div>}
                  </td>
                )}
                {tab === 'rivers' && (
                  <>
                    <td className={clsx('p-2.5 text-right font-mono font-semibold', r.level < 0 && 'text-muted')}>{r.value == null ? '–' : `${num(r.value, 2)} m`}</td>
                    <td className="whitespace-nowrap p-2.5 text-right font-mono text-muted">
                      {[r.thr.bd1, r.thr.bd2, r.thr.bd3].map((x) => (x == null ? '–' : num(x, 2))).join(' / ')}
                    </td>
                    <td className="whitespace-nowrap p-2.5 text-muted">{r.time ? dateTime(r.time) : 'không có số đo 2 giờ qua'}</td>
                  </>
                )}
                {tab === 'landslides' && (
                  <>
                    <td className="p-2.5 text-right font-mono">{r.rain24 == null ? '–' : `${num(r.rain24, 1)} mm`}</td>
                    <td className="p-2.5 text-right font-mono">{r.tilt == null ? '–' : `${num(r.tilt, 2)}°`}</td>
                    <td className="p-2.5">{r.risk || '–'}</td>
                  </>
                )}
                {tab === 'sos' && (
                  <>
                    <td className="p-2.5 text-right font-mono">{r.trapped ?? '?'}</td>
                    <td className="whitespace-nowrap p-2.5">{r.status}</td>
                    <td className={clsx('whitespace-nowrap p-2.5 text-right font-mono', r.levelText === 'Quá hạn phản hồi' && 'font-bold text-danger')}>{int(r.waited)} phút</td>
                  </>
                )}
                {tab === 'supplies' && CATS.map(([key]) => (
                  <td key={key} className={clsx('p-2.5 text-right font-mono', r.pcts[key] != null && r.pcts[key] < 20 && 'font-bold text-danger')}>
                    {r.pcts[key] == null ? '–' : `${r.pcts[key]}%`}
                  </td>
                ))}
                <td className="p-2.5">{chip(r)}</td>
                <td className="p-2.5">
                  <div className="flex justify-end gap-1">
                    {tab === 'rivers' && onSelectStation && (
                      <button type="button" className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => onSelectStation(r.id)} title="Xem biểu đồ thuỷ văn của trạm">
                        <ChartLine size={12} /> Biểu đồ
                      </button>
                    )}
                    {tab === 'sos' && <Link to="/cuu-ho" className="btn-ghost px-2 py-0.5 text-[11px]">Điều phối</Link>}
                    {tab === 'supplies' && <Link to="/nguon-luc" className="btn-ghost px-2 py-0.5 text-[11px]">Kho</Link>}
                    {tab !== 'supplies' && mapBtn(r)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted no-print">
        <span>
          {filtered.length} mục{filtered.length !== rows.length && ` (trong ${rows.length})`}
        </span>
        <div className="flex items-center gap-2">
          <select className="input w-auto py-0.5 text-xs" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} aria-label="Số dòng mỗi trang">
            {[10, 20, 50].map((n) => <option key={n} value={n}>{n} dòng</option>)}
          </select>
          <button type="button" className="btn-ghost px-1.5 py-0.5" onClick={() => setPage(Math.max(1, cur - 1))} disabled={cur <= 1} aria-label="Trang trước">
            <ChevronLeft size={14} />
          </button>
          <span className="font-mono">{cur}/{pages}</span>
          <button type="button" className="btn-ghost px-1.5 py-0.5" onClick={() => setPage(Math.min(pages, cur + 1))} disabled={cur >= pages} aria-label="Trang sau">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </section>
  );
}
