import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  Activity, AlertTriangle, ArrowUp, Circle as CircleIcon, Clock, CloudRain, Compass, Droplets, LifeBuoy, MapPin, Megaphone, MessageCircle, Mountain,
  PenTool, Route, Ruler, Search, RotateCcw, Send, Settings2, Siren, Waves, X,
} from 'lucide-react';
import { ErrorState, ShowMore, Skeleton, TrendTag, useEscapeToClose } from '../common/ui';
import { Can } from '../../rbac/usePermission';
import { ALARM, alarmLevel, INCIDENT, PRIORITY, STATION_TYPE } from '../../utils/labels';
import { ago, dateTime, int, time } from '../../utils/format';
import { fmtVn } from '../../utils/bulletin';
import { risk } from '../../utils/risk';
import { trendProps } from '../../utils/stations';
import { useShowMore } from '../../utils/useShowMore';

// Biểu tượng từng loại điểm nóng (hotspots.js)
const HOT_ICON = { sos: Siren, river: Waves, reservoir: Droplets, landslide: Mountain, rain: CloudRain, sensor: Activity, hazard: AlertTriangle };
const HOT_STEP = 10;

// Cấp ưu tiên phiếu SOS → tên màu (cấp 1 Đỏ, 2 Cam, 3 Vàng — mức thang màu = 4 − cấp)
const PRIO_CHIPS = [[1, 'Đỏ'], [2, 'Cam'], [3, 'Vàng']];

/**
 * Các lớp của bản đồ giám sát (thiết kế B.2, 4 nhóm). `perm`: quyền xem cần có — API trả lớp rỗng khi thiếu quyền
 * (map_layers.py), giao diện ẩn hẳn lớp đó thay vì hiện "0 SOS" như thể không có sự cố.
 */
export const LAYER_GROUPS = [
  {
    title: 'Thủy văn & Khí tượng',
    items: [
      { key: 'stations', label: 'Trạm đo mưa, mực nước, cảm biến IoT' },
      { key: 'reservoirs', label: 'Hồ chứa & đập thủy điện' },
      { key: 'forecast', label: 'Mưa dự báo theo xã (ECMWF + GFS)' }, // ghi chú dưới tên: 24 giờ tới / 1 giờ theo thanh thời gian
      { key: 'radar', label: 'Radar mưa thời gian thực' },
      { key: 'storm', label: 'Quỹ đạo bão / áp thấp' },
    ],
  },
  {
    title: 'Cảnh báo & Vùng nguy hiểm',
    items: [
      { key: 'flood', label: 'Vùng ngập lụt' },
      { key: 'floodScenario', label: 'Vùng ngập theo kịch bản (BĐ I–III)' },
      { key: 'landslide', label: 'Vùng sạt lở / lũ quét' },
      { key: 'blackspots', label: 'Điểm đen sạt lở, đèo dốc' }, // danh mục + trạng thái giám sát — /dashboard/kpis
      { key: 'hazardPoints', label: 'Điểm nguy hiểm, sự cố giao thông – hạ tầng' },
      { key: 'reports', label: 'Phản ánh của người dân (72 giờ)', perm: 'report' },
      { key: 'roads', label: 'Mạng đường & đoạn bị chặn' },
    ],
  },
  {
    title: 'Lực lượng & Vật tư',
    items: [
      { key: 'forces', label: 'Lực lượng cứu hộ', perm: 'resource' },
      { key: 'vehicles', label: 'Xuồng, xe, thiết bị', perm: 'resource' },
      { key: 'routes', label: 'Lộ trình đang điều động', perm: 'sos' },
      { key: 'warehouses', label: 'Kho vật tư', perm: 'resource' },
      { key: 'evac', label: 'Điểm sơ tán an toàn', perm: 'resource' },
      { key: 'cameras', label: 'Camera CCTV' },
    ],
  },
  { title: 'Yêu cầu cứu hộ', items: [{ key: 'sos', label: 'Điểm SOS từ người dân / cảm biến', perm: 'sos' }] },
  { title: 'Nền hành chính', items: [{ key: 'admin', label: 'Ranh giới xã/phường' }] },
];
export const LAYER_ORDER = LAYER_GROUPS.flatMap((g) => g.items.map((it) => it.key));

export const DEFAULT_LAYERS = {
  stations: true, reservoirs: true, forecast: false, radar: false, storm: false, flood: true, floodScenario: true, landslide: true, blackspots: true, hazardPoints: true,
  reports: true, roads: false,
  forces: true, vehicles: false, routes: true, warehouses: true, evac: false, cameras: true, sos: true, admin: true,
};

/** Ghi chú khi lớp danh mục đang trống — chạy thật chưa nhập thì nói rõ, không để bản đồ im lặng như "không có gì". */
const EMPTY_NOTE = {
  stations: 'Chưa có trạm trong vùng đang xem (nhập loại "Trạm quan trắc")',
  reservoirs: 'Chưa có hồ chứa (nhập loại "Hồ chứa")',
  forces: 'Chưa có lực lượng (nhập loại "Lực lượng")',
  vehicles: 'Chưa có phương tiện (nhập loại "Phương tiện")',
  warehouses: 'Chưa có kho (nhập loại "Kho vật tư")',
  evac: 'Chưa có điểm sơ tán (nhập loại "Điểm sơ tán")',
  cameras: 'Chưa có camera nào được khai báo',
  blackspots: 'Không có điểm đen sạt lở trong vùng đang xem',
};
// Ghi chú cố định: lực lượng chưa gắn thiết bị định vị — vị trí là nơi đóng quân đã nhập, không phải GPS trực tiếp
const FIXED_NOTE = { forces: 'Vị trí đơn vị đã nhập — chưa gắn thiết bị định vị' };

/** Số đối tượng của từng lớp trong vùng đang xem (hiện cạnh tên lớp). */
export function layerCounts(data) {
  if (!data) return {};
  const zones = data.hazard_zones.features;
  return {
    stations: data.stations.features.length,
    reservoirs: data.reservoirs.features.length,
    flood: zones.filter((f) => f.properties.type === 'ngap').length,
    landslide: zones.filter((f) => f.properties.type !== 'ngap').length,
    hazardPoints: data.hazard_points.features.length,
    reports: data.reports?.features.length ?? 0,
    forces: data.forces.features.length,
    vehicles: data.vehicles.features.length,
    routes: data.routes.features.length,
    warehouses: data.warehouses.features.length,
    evac: data.evacuation_sites.features.length,
    cameras: data.cameras.features.length,
    sos: data.sos.features.length,
  };
}

/** Bảng bật / tắt lớp. `touch`: dòng cao ≥ 44 px (điện thoại, máy tính bảng). */
export function LayerList({ groups, layers, setLayers, unavailable, notes, counts, canStorm, onStorm, touch }) {
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.title} className="space-y-1">
          <div className="px-1 text-[11px] font-bold uppercase tracking-wider text-muted">{g.title}</div>
          <div className="space-y-0.5">
            {g.items.map(({ key, label }) => {
              const off = unavailable[key];
              const n = counts[key];
              const note = off || (n === 0 && EMPTY_NOTE[key]) || notes[key] || FIXED_NOTE[key];
              return (
                <Fragment key={key}>
                  <label
                    className={clsx(
                      'flex items-center gap-2.5 rounded-lg px-2 text-xs transition-colors',
                      touch ? 'min-h-[44px] py-1.5' : 'min-h-[32px] py-1',
                      off
                        ? 'cursor-not-allowed text-muted'
                        : layers[key] ? 'cursor-pointer bg-panel2 font-medium text-ink' : 'cursor-pointer text-ink-2 hover:bg-panel2/60',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={layers[key] && !off}
                      disabled={!!off}
                      onChange={(e) => setLayers((l) => ({ ...l, [key]: e.target.checked }))}
                      className={clsx('shrink-0 rounded accent-[rgb(var(--accent))]', touch && 'h-5 w-5')}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{label}</span>
                      {note && <span className={clsx('block text-[10px] font-normal', !off && 'text-muted')}>{note}</span>}
                    </span>
                    {n != null && !off && <span className="shrink-0 font-mono text-[11px] text-muted" title="Số đối tượng trong vùng đang xem">{n}</span>}
                  </label>
                  {key === 'storm' && canStorm && (
                    <button
                      type="button"
                      className={clsx('ml-8 text-[11px] font-medium text-accent hover:underline', touch && 'min-h-[44px]')}
                      onClick={onStorm}
                    >
                      Nhập / cập nhật bản tin bão
                    </button>
                  )}
                </Fragment>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// Dòng diễn biến: nhóm loại nhật ký (operations.event_logs.category) → chip lọc
const FEED_GROUPS = [
  ['tat_ca', 'Tất cả', null],
  ['cuu_ho', 'Cứu hộ', ['cuu_ho', 'nguoi_dan']],
  ['canh_bao', 'Cảnh báo', ['canh_bao', 'he_thong']],
  ['van_hanh', 'Vận hành', ['van_hanh']],
];
const SOS_CATEGORIES = ['cuu_ho', 'nguoi_dan']; // tài khoản không xem được SOS → ẩn (như tab Phiếu SOS)
const FEED_ICON = { cuu_ho: LifeBuoy, nguoi_dan: MessageCircle, canh_bao: AlertTriangle, he_thong: Activity, van_hanh: Settings2 };
const FEED_SEV = {
  danger: { edge: risk(3).edge, text: risk(3).text },
  warning: { edge: risk(1).edge, text: risk(1).text },
  info: { edge: 'border-l-accent/40', text: 'text-muted' },
};
const FEED_STEP = 20;
const feedRows = (all, g) => {
  const cs = FEED_GROUPS.find(([x]) => x === g)?.[2];
  return cs ? all.filter((l) => cs.includes(l.category)) : all;
};
const isToday = (t) => new Date(t).toDateString() === new Date().toDateString();

/**
 * Dòng diễn biến (thiết kế B.1 "dòng thời gian cuộn liên tục các tín hiệu SOS… hoặc cảnh báo từ cảm biến tự động"): nhật ký
 * sự kiện mới nhất trên cùng — cùng nguồn "Nhật ký sự kiện" ở Tổng quan (/dashboard/logs), đẩy tức thì qua WebSocket
 * `log.new`. Mục đến sau khi mở tab có nhãn "mới"; đang cuộn xem mục cũ thì danh sách không nhảy — hiện nút "N mục mới".
 * Chạm mục có toạ độ → bản đồ bay tới. `feed`: { logs, pending, error, refetch }.
 */
function EventFeed({ feed, canSos, onFocus, touch }) {
  const [group, setGroup] = useState('tat_ca');
  const [opened] = useState(() => Date.now()); // mục đến sau lúc mở tab = "mới"
  const [seenAt, setSeenAt] = useState(null); // giờ của mục trên cùng lúc người dùng còn ở đầu danh sách
  const listRef = useRef(null);
  const all = useMemo(
    () => (feed.logs || []).filter((l) => canSos || !SOS_CATEGORIES.includes(l.category)),
    [feed.logs, canSos],
  );
  const rows = useMemo(() => feedRows(all, group), [all, group]);
  const list = useShowMore(rows, FEED_STEP, group);
  const topTime = rows[0] ? Date.parse(rows[0].time) : null;
  // Đang ở đầu danh sách → coi như đã thấy mục mới nhất; cuộn xuống xem mục cũ → mục đến sau đó đếm vào nút "N mục mới"
  useEffect(() => {
    const el = listRef.current?.closest('.overflow-y-auto');
    if (!el) return undefined;
    // lúc mở tab coi như đã thấy mục trên cùng (vùng cuộn có thể đang ở giữa do tab trước)
    const sync = () => setSeenAt((cur) => (el.scrollTop < 40 || cur == null ? topTime : cur));
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    return () => el.removeEventListener('scroll', sync);
  }, [topTime]);
  const unseen = seenAt == null ? 0 : rows.filter((l) => Date.parse(l.time) > seenAt).length;
  const toTop = (behavior = 'smooth') => listRef.current?.closest('.overflow-y-auto')?.scrollTo({ top: 0, behavior });
  // Đổi bộ lọc = xem danh sách mới từ đầu: mục trên cùng của bộ lọc đó coi như đã thấy
  const pick = (g) => {
    const first = feedRows(all, g)[0];
    setGroup(g);
    setSeenAt(first ? Date.parse(first.time) : null);
    toTop('auto');
  };

  if (feed.pending) return <div className="space-y-2" ref={listRef}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={52} />)}</div>;
  if (feed.error && !feed.logs) return <ErrorState onRetry={feed.refetch}>Không tải được diễn biến (nhật ký sự kiện)</ErrorState>;
  const groups = FEED_GROUPS.filter(([g]) => canSos || g !== 'cuu_ho');
  return (
    <div ref={listRef} className="space-y-2">
      <div className={clsx('grid gap-1', groups.length === 4 ? 'grid-cols-2' : 'grid-cols-3')} role="group" aria-label="Lọc diễn biến theo loại">
        {groups.map(([g, label, cs]) => (
          <button
            key={g}
            type="button"
            onClick={() => pick(g)}
            aria-pressed={group === g}
            className={clsx(
              'inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-full border px-2 text-[11px] font-semibold',
              touch ? 'min-h-[44px]' : 'min-h-[26px]',
              group === g ? 'border-accent bg-accent text-white' : 'border-line text-ink-2 hover:bg-panel2',
            )}
          >
            {label} <span className="font-mono">{cs ? all.filter((l) => cs.includes(l.category)).length : all.length}</span>
          </button>
        ))}
      </div>
      {unseen > 0 && (
        <button
          type="button"
          onClick={() => toTop()}
          className={clsx('sticky top-0 z-10 mx-auto flex items-center gap-1 rounded-full bg-accent px-3 text-[11px] font-bold text-white shadow-lg', touch ? 'min-h-[44px]' : 'min-h-[28px]')}
        >
          <ArrowUp size={12} aria-hidden="true" /> {unseen} mục mới
        </button>
      )}
      {feed.error && <p className="text-[11px] text-danger" role="status">Không cập nhật được — đang hiện diễn biến đã tải trước đó</p>}
      <ol className="space-y-2" role="log" aria-label="Diễn biến, mới nhất trên cùng">
        {list.visible.map((l) => {
          const Icon = FEED_ICON[l.category] || Activity;
          const sev = FEED_SEV[l.severity] || FEED_SEV.info;
          const at = l.lat != null && l.lon != null;
          const fresh = Date.parse(l.time) > opened;
          const body = (
            <>
              <Icon size={14} className={clsx('mt-0.5 shrink-0', sev.text)} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[11px] text-muted">
                  <time dateTime={l.time} className="font-mono">{isToday(l.time) ? time(l.time) : dateTime(l.time)}</time>
                  {fresh && <span className="chip bg-accent px-1.5 py-0 text-[10px] font-bold text-white">mới</span>}
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-ink">{l.message}</span>
              </span>
              {at && <MapPin size={13} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />}
            </>
          );
          const cls = clsx('flex w-full items-start gap-2 rounded-xl border border-l-4 border-line p-2.5 text-left shadow-sm', sev.edge, fresh && 'bg-accent/5');
          return (
            <li key={l.id}>
              {at ? (
                <button
                  type="button"
                  className={clsx(cls, 'transition-all hover:border-accent hover:bg-panel2/80')}
                  onClick={() => onFocus({ lat: l.lat, lon: l.lon, zoom: 14, label: l.message.slice(0, 60) })}
                  aria-label={`${time(l.time)}: ${l.message}. Xem trên bản đồ`}
                >
                  {body}
                </button>
              ) : (
                <div className={cls}>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
      <ShowMore list={list} step={FEED_STEP} noun="mục" />
      {!rows.length && (
        <div className="px-2 py-8 text-center text-xs text-muted">
          {all.length ? 'Không có diễn biến loại này' : 'Chưa có sự kiện nào trong vùng đang xem'}
        </div>
      )}
    </div>
  );
}

/**
 * Bảng cảnh báo khẩn cấp (thiết kế B.1 — bên phải): tab Điểm nóng (lãnh đạo — mọi loại rủi ro xếp Đỏ → Vàng, hotspots.js),
 * Diễn biến (dòng thời gian mới nhất trên cùng — EventFeed), Phiếu SOS (khi xem được SOS), Cảm biến (vượt báo động, mất tín
 * hiệu). `hotNote`: số liệu điểm nóng chưa đủ (đang tải / không tải được) — nói rõ thay vì để danh sách thiếu trông như
 * "không có gì". Chạm một mục → `onFocus(vị trí, điểm nóng?)` — bản đồ bay tới, bật lớp chứa điểm nóng.
 */
export function AlertsList({
  tab, setTab, sos, sensorAlerts, silentStations, noDataCount, hotspots = [], hotNote, feed, canSos, canDispatch, onFocus, onDispatch, touch,
}) {
  const [search, setSearch] = useState('');
  const [prio, setPrio] = useState(0); // 0 = mọi mức; 1 / 2 / 3 = cấp ưu tiên (Đỏ / Cam / Vàng — cùng màu trên bản đồ)
  const tabs = canSos ? ['diem_nong', 'dien_bien', 'sos', 'sensors'] : ['diem_nong', 'dien_bien', 'sensors'];
  const active = tabs.includes(tab) ? tab : 'diem_nong';
  const hot = useShowMore(hotspots, HOT_STEP, 'diem-nong');
  const perPrio = useMemo(() => Object.fromEntries([1, 2, 3].map((n) => [n, sos.filter((s) => s.priority === n).length])), [sos]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sos.filter((s) => (!prio || s.priority === prio)
      && (!q || s.code?.toLowerCase().includes(q) || s.address?.toLowerCase().includes(q) || s.admin_name?.toLowerCase().includes(q)));
  }, [sos, search, prio]);
  const prioName = PRIO_CHIPS.find(([n]) => n === prio)?.[1];
  const tabBtn = (id, label) => (
    <button
      key={id}
      type="button"
      className={clsx('flex-1 rounded-lg text-xs font-medium transition-colors', touch ? 'min-h-[44px]' : 'min-h-[30px]', active === id ? 'bg-accent text-white' : 'text-muted hover:bg-panel2')}
      onClick={() => setTab(id)}
      aria-pressed={active === id}
    >
      {label}
    </button>
  );
  const item = 'w-full rounded-xl border border-line text-left shadow-sm transition-all hover:border-accent';
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-line bg-panel2/40 px-3 py-2">
        <div className="flex gap-1">
          {tabBtn('diem_nong', `Điểm nóng (${hotspots.length})`)}
          {tabBtn('dien_bien', 'Diễn biến')}
          {canSos && tabBtn('sos', `Phiếu SOS (${sos.length})`)}
          {tabBtn('sensors', `Cảm biến (${sensorAlerts.length + silentStations.length})`)}
        </div>
        {active === 'sos' && (
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              className={clsx('input pl-7 text-xs', touch ? 'min-h-[44px]' : 'py-1')}
              placeholder="Tìm mã SOS, địa điểm..."
              aria-label="Tìm phiếu SOS"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
        {active === 'sos' && (
          <div className="flex flex-wrap gap-1" role="group" aria-label="Lọc phiếu SOS theo mức">
            {[[0, 'Tất cả', sos.length], ...PRIO_CHIPS.map(([n, name]) => [n, name, perPrio[n]])].map(([n, name, count]) => (
              <button
                key={n}
                type="button"
                onClick={() => setPrio(n)}
                aria-pressed={prio === n}
                className={clsx(
                  'inline-flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-full border px-2 text-[11px] font-semibold',
                  touch ? 'min-h-[44px]' : 'min-h-[26px]',
                  prio === n
                    ? (n ? clsx('border-transparent', risk(4 - n).chip) : 'border-accent bg-accent text-white')
                    : 'border-line text-ink-2 hover:bg-panel2',
                )}
              >
                {n > 0 && prio !== n && <span className={clsx('h-2 w-2 shrink-0 rounded-full', risk(4 - n).fill)} aria-hidden="true" />}
                {name} <span className="font-mono">{count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
        {active === 'diem_nong' && (
          <>
            {hotNote && <p className="rounded-lg border border-dashed border-line px-2.5 py-1.5 text-[11px] text-muted" role="status">{hotNote}</p>}
            {hot.visible.map((h) => {
              const Icon = HOT_ICON[h.kind] || AlertTriangle;
              const sc = risk(h.level);
              return (
                <button
                  key={h.id}
                  type="button"
                  className={clsx(item, 'flex items-start gap-2 border-l-4 p-2.5 hover:bg-panel2/80', sc.edge)}
                  onClick={() => onFocus(h.bounds ? { bounds: h.bounds, label: h.name } : { lat: h.lat, lon: h.lon, zoom: 13, label: h.name }, h)}
                  aria-label={`${sc.name}: ${h.name} — ${h.detail}. Xem trên bản đồ`}
                >
                  <Icon size={15} className={clsx('mt-0.5 shrink-0', sc.text)} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <b className="truncate text-xs font-bold text-ink">{h.name}</b>
                      {h.trend && <TrendTag {...trendProps(h.trend, h.name)} className="shrink-0 text-[10px]" />}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-ink-2">{h.detail}</span>
                  </span>
                  <span className={clsx('chip shrink-0 px-1.5 py-0 text-[10px] font-bold', sc.chip)}>{sc.name}</span>
                </button>
              );
            })}
            <ShowMore list={hot} step={HOT_STEP} noun="điểm" />
            {!hotspots.length && !hotNote && (
              <div className="px-2 py-8 text-center text-xs text-muted">
                Không có điểm nóng trong vùng đang xem
                <span className="mt-1 block">
                  Chưa ghi nhận {canSos ? 'SOS cấp 1, ' : ''}trạm trên báo động, hồ xả, sạt lở cấm đường, mưa từ 50 mm/24 giờ hay sự cố mức Cam / Đỏ.
                </span>
              </div>
            )}
          </>
        )}

        {active === 'dien_bien' && <EventFeed feed={feed} canSos={canSos} onFocus={onFocus} touch={touch} />}

        {active === 'sos' && (
          <>
            {shown.map((s) => (
              <div key={s.id} className={item}>
                <button type="button" className="w-full rounded-xl p-2.5 text-left hover:bg-panel2/80" onClick={() => onFocus({ lat: s.lat, lon: s.lon, zoom: 15, label: s.code })}>
                  <div className="flex items-center gap-2">
                    <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', s.status === 'moi' && 'animate-blink', risk(4 - s.priority).fill)} />
                    <b className="text-sm font-bold text-ink">{s.code}</b>
                    <span className="text-xs text-muted">{PRIORITY[s.priority]?.short || `Cấp ${s.priority}`}</span>
                    <span className="ml-auto text-[11px] text-muted">{ago(s.received_at)}</span>
                  </div>
                  <div className="mt-1 text-xs text-ink-2">
                    {INCIDENT[s.incident_type] || s.incident_type} · <b>{s.trapped_count} người</b> · <span className="text-muted">{s.address}</span>
                  </div>
                </button>
                {s.status === 'moi' && canDispatch && (
                  <button
                    type="button"
                    className={clsx('mx-1.5 mb-1.5 inline-flex items-center gap-1 rounded-lg px-2 text-[11px] font-bold text-danger hover:bg-danger/10', touch ? 'min-h-[44px]' : 'min-h-[26px]')}
                    onClick={() => onDispatch(s)}
                  >
                    <Send size={12} aria-hidden="true" /> Điều phối lực lượng
                  </button>
                )}
              </div>
            ))}
            {!shown.length && (
              <div className="py-8 text-center text-xs text-muted">
                {search
                  ? 'Không tìm thấy phiếu phù hợp'
                  : prio ? `Không có phiếu mức ${prioName} đang mở trong vùng đang xem` : 'Không có phiếu SOS đang mở trong vùng đang xem'}
              </div>
            )}
          </>
        )}

        {active === 'sensors' && (
          <>
            {sensorAlerts.map((p) => {
              const lv = alarmLevel(p.value, p.thresholds);
              return (
                <button key={p.id} type="button" className={clsx(item, 'p-2.5 hover:bg-panel2/80')} onClick={() => onFocus({ lat: p.lat, lon: p.lon, zoom: 14, label: p.name })}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className={clsx('chip text-[10px] font-bold', ALARM[lv].cls)}>{ALARM[lv].label}</span>
                    <span className="text-muted">{STATION_TYPE[p.type]}</span>
                  </div>
                  <div className="truncate text-xs font-medium text-ink">{p.name}</div>
                  <div className="mt-0.5 font-mono text-xs font-bold text-accent">{p.value?.toFixed(2)} {p.unit}</div>
                </button>
              );
            })}
            {silentStations.length > 0 && (
              <div className="pt-1 text-[11px] font-bold uppercase tracking-wide text-muted">Mất tín hiệu ({silentStations.length})</div>
            )}
            {silentStations.map((p) => {
              const lv = alarmLevel(p.value, p.thresholds);
              return (
                <button
                  key={p.id}
                  type="button"
                  className="w-full rounded-xl border border-dashed border-line p-2.5 text-left transition-all hover:border-accent hover:bg-panel2/80"
                  onClick={() => onFocus({ lat: p.lat, lon: p.lon, zoom: 14, label: p.name })}
                >
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="chip bg-panel2 text-[10px] font-bold text-muted">Mất tín hiệu từ {fmtVn(p.time)}</span>
                    <span className="text-muted">{STATION_TYPE[p.type]}</span>
                  </div>
                  <div className="truncate text-xs font-medium text-ink">{p.name}</div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    Số đo cuối {p.value?.toFixed(2)} {p.unit}
                    {lv > 0 && <span className={clsx('chip ml-1 text-[10px]', ALARM[lv].cls)}>{ALARM[lv].label}</span>}
                  </div>
                </button>
              );
            })}
            {!sensorAlerts.length && !silentStations.length && (
              <div className="py-8 text-center text-xs text-muted">
                Không có trạm vượt báo động hoặc mất tín hiệu
                {noDataCount > 0 && <span className="mt-1 block">{noDataCount} trạm chưa có số đo — không coi là an toàn</span>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Chế độ xem bản đồ: "Tình hình" — chỉ giữ lớp rủi ro (SOS, trạm, hồ, vùng nguy hiểm, sạt lở, sự cố) cho lãnh đạo nắm tình
 * hình; "Tác nghiệp" — đủ lớp như trước (thêm lực lượng, phương tiện, kho, lộ trình, điểm sơ tán, phản ánh, camera). Chỉ
 * đổi lớp đang bật — không đổi số liệu. `touch`: nút cao 44 px.
 */
export const VIEW_MODES = [
  ['tinh_hinh', 'Tình hình', 'Chỉ lớp rủi ro: SOS, trạm, hồ, vùng nguy hiểm, sạt lở, sự cố — mở tab Điểm nóng'],
  ['tac_nghiep', 'Tác nghiệp', 'Đủ lớp: thêm lực lượng, phương tiện, kho, lộ trình, điểm sơ tán, phản ánh, camera'],
];
export function ViewModeSwitch({ mode, onChange, touch, className }) {
  return (
    <div role="group" aria-label="Chế độ xem bản đồ" className={clsx('flex gap-0.5 rounded-xl border border-line bg-panel/95 p-0.5 shadow-lg backdrop-blur-md', className)}>
      {VIEW_MODES.map(([id, label, hint]) => (
        <button
          key={id}
          type="button"
          aria-pressed={mode === id}
          title={hint}
          onClick={() => onChange(id)}
          className={clsx(
            'flex-1 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-colors',
            touch ? 'min-h-[44px]' : 'min-h-[32px] [@media(pointer:coarse)]:min-h-[44px]',
            mode === id ? 'bg-accent text-white shadow-sm' : 'text-ink-2 hover:bg-panel2',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const QUICK_HOURS = [-12, -6, 0, 6, 12, 24];

/** Thanh thời gian (thiết kế B.1): −12 giờ (số đo đã qua) → +24 giờ (dự báo, quỹ đạo bão). */
export function TimeControl({ offset, setOffset, touch }) {
  const when = new Date(Date.now() + offset * 3600_000).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  return (
    <div>
      <div className="flex items-center gap-3">
        <Clock size={16} className="shrink-0 text-accent" aria-hidden="true" />
        <input
          type="range"
          min={-12}
          max={24}
          step={1}
          value={offset}
          onChange={(e) => setOffset(Number(e.target.value))}
          className={clsx('min-w-0 flex-1 accent-[rgb(var(--accent))]', touch && 'h-11')}
          aria-label="Thanh trượt thời gian"
          aria-valuetext={offset === 0 ? 'Hiện tại' : `${offset > 0 ? '+' : ''}${offset} giờ — ${when}`}
        />
        <div className="w-32 shrink-0 text-right text-xs">
          {offset === 0 ? (
            <>
              <b className="font-bold text-good">Hiện tại</b>
              <span className="block text-[11px] text-muted">thời gian thực</span>
            </>
          ) : (
            <>
              <b className="text-accent">{offset > 0 ? `+${offset}h · dự báo` : `${offset}h · đã qua`}</b>
              <span className="block text-[11px] text-muted">{when}</span>
            </>
          )}
        </div>
      </div>
      <div className="mt-1.5 grid grid-cols-6 gap-1 border-t border-line/50 pt-1.5">
        {QUICK_HOURS.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => setOffset(h)}
            aria-pressed={offset === h}
            className={clsx(
              'rounded-lg text-[11px] font-semibold',
              touch ? 'min-h-[44px]' : 'min-h-[26px]',
              offset === h ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-panel2',
            )}
          >
            {h === 0 ? 'Hiện tại' : `${h > 0 ? '+' : ''}${h}h`}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Công cụ bản đồ (thiết kế B.1, B.3): [mã, biểu tượng, mô tả, nhãn ngắn]. Đánh dấu sự cố chỉ cho tài khoản có quyền. */
export const toolList = (canIncident) => [
  ['measure', Ruler, 'Đo khoảng cách (km)', 'Đo khoảng cách'],
  ['route', Route, 'Tìm đường an toàn A → B (tránh vùng nguy hiểm)', 'Đường an toàn'],
  ['polygon', PenTool, 'Khoanh vùng nguy cơ (đa giác)', 'Khoanh đa giác'],
  ['circle', CircleIcon, 'Khoanh vùng tròn', 'Khoanh tròn'],
  ...(canIncident ? [['incident', MapPin, 'Đánh dấu điểm sự cố (cây đổ, đứt điện, sập cầu…)', 'Đánh dấu sự cố']] : []),
];

const TOOL_NAME = { measure: 'Thước đo', route: 'Dò đường an toàn', incident: 'Đánh dấu sự cố' };

/** Hướng dẫn công cụ đang dùng (và kết quả dò đường: đang tìm / lỗi + thử lại / lộ trình — RouteTool). */
export function ToolHint({ tool, routeInfo, onClose, className }) {
  return (
    <div className={clsx('card border border-accent/40 bg-panel/95 px-3.5 py-2 text-xs shadow-xl backdrop-blur-md', className)} role="status">
      <div className="mb-1 flex items-center justify-between gap-2 font-semibold text-accent">
        <span>Đang dùng: {TOOL_NAME[tool] || 'Khoanh vùng'}</span>
        <button type="button" onClick={onClose} className="tap-sq -m-1 flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-panel2 hover:text-ink" aria-label="Tắt công cụ">
          <X size={14} />
        </button>
      </div>
      {tool === 'measure' && 'Chạm lên bản đồ để thêm các điểm đo khoảng cách. Bấm lại nút thước để xoá.'}
      {tool === 'route' && (routeInfo?.loading ? (
        <span className="flex items-center gap-1.5 text-muted">
          <Compass size={13} className="animate-spin text-accent" aria-hidden="true" /> Đang tìm lộ trình an toàn…
        </span>
      ) : routeInfo?.error ? (
        <span className="block" role="alert">
          <span className="flex items-start gap-1.5 font-semibold text-danger">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" /> Không tìm được lộ trình: {routeInfo.error}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <button type="button" className="btn-ghost tap px-2.5 py-1 text-xs" onClick={routeInfo.retry}>
              <RotateCcw size={12} aria-hidden="true" /> Thử lại
            </button>
            <span className="text-muted">hoặc chạm bản đồ chọn lại điểm A</span>
          </span>
        </span>
      ) : routeInfo ? (
        <span>
          Lộ trình: <b>{routeInfo.distance_km} km</b> (~{routeInfo.duration_min}′) ·{' '}
          {routeInfo.safe
            ? <b className="text-good">Né vùng nguy hiểm đã ghi nhận</b>
            : <b className="text-danger">Đi qua vùng nguy hiểm{routeInfo.hazards?.length ? `: ${routeInfo.hazards.join(', ')}` : ''}</b>}
          {routeInfo.offroad_km >= 0.5 && <span className="text-warn"> · {routeInfo.offroad_km} km chưa có dữ liệu đường</span>}
          <br /><span className="text-muted">{routeInfo.roads.join(' → ')}</span>
          {routeInfo.warnings?.map((w) => <span key={w} className="block text-warn">⚠ {w}</span>)}
        </span>
      ) : (
        'Chạm chọn điểm A (vị trí lực lượng) rồi điểm B (nơi cần cứu hộ).'
      ))}
      {(tool === 'polygon' || tool === 'circle') && 'Vẽ vùng nguy cơ: hệ thống tự động đếm số hộ dân và chuẩn bị cảnh báo sơ tán.'}
      {tool === 'incident' && 'Chạm vào vị trí sự cố trên bản đồ để đánh dấu (hiện ngay trên cổng công khai).'}
    </div>
  );
}

const UNITS_STEP = 6; // số xã / phường hiện trước khi bấm "xem thêm"

/**
 * Kết quả khoanh vùng: diện tích, dân số, số hộ… → soạn cảnh báo sơ tán (quyền alert.create, vẫn qua phê duyệt).
 * `drawn`: { polygon, stats, error } — error: không tính được (mất mạng / máy chủ lỗi) → báo + `onRetry`.
 * `units`: { names, small, unknown } — xã / phường trong vùng (MonitoringMap tính từ `admin_codes`; vùng nhỏ → xã chứa tâm
 * vùng; `unknown`: chưa tải được ranh giới xã).
 */
export function DrawnStats({ drawn, units, onClose, onRetry, onAlert, touch, className }) {
  const [allUnits, setAllUnits] = useState(false);
  const s = drawn.stats;
  const names = units?.names || [];
  const shownNames = allUnits ? names : names.slice(0, UNITS_STEP);
  return (
    // Cao tối đa 60% màn hình, phần dưới tiêu đề tự cuộn — danh sách nhiều xã không đẩy nút "Soạn cảnh báo" ra khỏi màn
    <div className={clsx('card flex max-h-[min(60vh,34rem)] flex-col border border-line bg-panel/95 p-3.5 shadow-2xl backdrop-blur-md', className)}>
      <div className="mb-2 flex shrink-0 items-center justify-between border-b border-line pb-1.5 text-sm font-bold text-ink">
        <span>Phân tích vùng khoanh</span>
        <button type="button" onClick={onClose} className="tap-sq -m-1 flex h-8 w-8 items-center justify-center rounded-lg hover:bg-panel2" aria-label="Đóng phân tích vùng">
          <X size={14} />
        </button>
      </div>
      <div className="scroll-thin -mr-1.5 min-h-0 overflow-y-auto pr-1.5">
        {drawn.error ? (
          <div className="space-y-2 py-1 text-xs" role="alert">
            <p className="flex items-start gap-1.5 font-semibold text-danger">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>Không tính được số liệu vùng khoanh: {drawn.error}</span>
            </p>
            <button type="button" className={clsx('btn-ghost w-full justify-center text-xs', touch ? 'min-h-[44px]' : 'py-1.5')} onClick={onRetry}>
              <RotateCcw size={13} aria-hidden="true" /> Thử lại
            </button>
          </div>
        ) : !s ? (
          <div className="flex items-center gap-2 py-3 text-xs text-muted" role="status">
            <Compass size={14} className="animate-spin text-accent" aria-hidden="true" />
            <span>Đang tính toán không gian địa lý…</span>
          </div>
        ) : (
          <>
            <div className="my-1 grid grid-cols-[1fr_auto] gap-x-2 gap-y-1 text-xs">
              <div className="text-muted">Diện tích:</div><b className="text-right font-mono">{s.area_km2 ? `${int(s.area_km2)} km²` : '< 1 km²'}</b>
              <div className="text-muted">Dân số (ước tính):</div><b className="text-right font-mono">{int(s.population)} người</b>
              <div className="text-muted">Số hộ (ước tính):</div><b className="text-right font-mono">{int(s.households)} hộ</b>
              <div className="text-muted">Thuê bao di động (ước tính):</div><b className="text-right font-mono">{int(s.subscribers)} TB</b>
              <div className="text-muted">SOS đang mở:</div><b className={clsx('text-right font-mono', s.sos_open ? 'text-danger' : 'text-ink')}>{int(s.sos_open)}</b>
              <div className="text-muted">Lực lượng đóng trong vùng:</div><b className="text-right font-mono">{int(s.forces)} đơn vị</b>
              <div className="text-muted">Chỗ trống sơ tán:</div><b className={clsx('text-right font-mono', s.evac_free ? 'text-good' : 'text-ink')}>{int(s.evac_free)}</b>
              <div className="text-muted">Vùng nguy hiểm đang hiệu lực:</div><b className={clsx('text-right font-mono', s.hazard_zones ? 'text-warn' : 'text-ink')}>{int(s.hazard_zones)}</b>
            </div>
            <p className="text-[10px] leading-snug text-muted">Dân số, số hộ, thuê bao ước tính theo tỉ lệ diện tích từng xã (chưa có dân cư theo xóm).</p>
            <div className="mt-2 border-t border-line pt-1.5 text-xs">
              {!names.length ? (
                <span className="text-muted">{units?.unknown ? 'Chưa xác định được xã / phường (chưa tải được ranh giới xã).' : 'Vùng khoanh nằm ngoài các xã / phường của tỉnh.'}</span>
              ) : (
                <>
                  <b className="text-ink">{units.small ? 'Vùng nhỏ, thuộc' : `Xã / phường trong vùng (${names.length})`}:</b>{' '}
                  <span className="text-ink-2">{shownNames.join(', ')}</span>
                  {names.length > UNITS_STEP && (
                    <button type="button" className="tap ml-1 font-semibold text-accent hover:underline" onClick={() => setAllUnits((v) => !v)} aria-expanded={allUnits}>
                      {allUnits ? 'thu gọn' : `+${names.length - UNITS_STEP} xã / phường`}
                    </button>
                  )}
                </>
              )}
            </div>
            <Can I="alert" a="create">
              <button
                type="button"
                className={clsx('btn-danger mt-2 w-full justify-center text-xs font-semibold shadow-sm', touch ? 'min-h-[44px]' : 'py-2')}
                onClick={onAlert}
              >
                <Megaphone size={14} aria-hidden="true" /> Soạn cảnh báo sơ tán vùng này
              </button>
            </Can>
          </>
        )}
      </div>
    </div>
  );
}

/** Bảng trượt từ đáy (điện thoại, máy tính bảng): một bảng mỗi lúc, bản đồ vẫn thấy phía trên; Esc / nút X để đóng. */
export function Sheet({ title, onClose, actions, children, bodyClass = 'scroll-thin overflow-y-auto p-3' }) {
  useEscapeToClose(true, onClose);
  return (
    <section className="absolute inset-x-0 bottom-0 z-[1100] flex max-h-[72%] flex-col rounded-t-2xl border-t border-line bg-panel shadow-2xl" aria-label={title}>
      <div className="mx-auto mt-1.5 h-1 w-10 shrink-0 rounded-full bg-line" aria-hidden="true" />
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line py-0.5 pl-3 pr-1">
        <b className="text-sm text-ink">{title}</b>
        <div className="flex items-center gap-1">
          {actions}
          <button type="button" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-panel2 hover:text-ink" onClick={onClose} aria-label={`Đóng ${title.toLowerCase()}`}>
            <X size={18} />
          </button>
        </div>
      </div>
      <div className={clsx('min-h-0 flex-1', bodyClass)}>{children}</div>
    </section>
  );
}
