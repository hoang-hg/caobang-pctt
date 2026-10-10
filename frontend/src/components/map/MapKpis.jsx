import { useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, CloudRain, Droplets, Home, RefreshCw, Siren, Users, Waves } from 'lucide-react';
import { useStore } from '../../app/store';
import { int, num } from '../../utils/format';
import { ALARM } from '../../utils/labels';
import { risk } from '../../utils/risk';
import { evacFacts, rainFacts, resourceFacts, sosFacts, topicFacts } from '../dashboard/kpiFacts';
import { riverSummary, ROMAN } from '../dashboard/RiverKpi';
import { ErrorState, Skeleton } from '../common/ui';

const HIDE_KEY = 'pctt.banDo.anTinhHinh'; // máy tính: người dùng thu gọn bảng chỉ số — nhớ trên máy này
const readHidden = () => { try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; } };
const writeHidden = (v) => { try { if (v) localStorage.setItem(HIDE_KEY, '1'); else localStorage.removeItem(HIDE_KEY); } catch { /* chế độ riêng tư */ } };

/**
 * 6 chỉ số giống dải KPI ở Tổng quan — cùng tên, cùng số, cùng mức (kpiFacts, riverSummary): số liệu /dashboard/kpis và
 * /stations mà Bản đồ đã tải sẵn (dải khẩn cấp dùng), không gọi thêm API. `stations`: { list, loading, error } trạm mực nước.
 */
export function kpiTiles(k, stations) {
  const rain = k.rain || {};
  const { known: rainKnown, level: rainLv } = rainFacts(k.rain);
  const river = riverSummary(stations.list);
  const n = river.rows.length;
  const sos = k.sos || {};
  const { late, level: sosLv } = sosFacts(sos);
  const ev = k.evacuation || {};
  const { planned, pct: evPct } = evacFacts(ev);
  const fo = k.forces || {};
  const hasRes = resourceFacts(fo, k.vehicles).has;
  const rs = k.reservoirs || {};
  const ls = k.landslides || {};
  const riverFailed = stations.error && !n;
  // Thứ tự trên bản đồ: chỉ số mang mức rủi ro lên trước (điện thoại chỉ thấy ~3 ô đầu, mắt lãnh đạo gặp điểm nóng trước)
  // `short` / `unitShort`: nhãn gọn cho ô hẹp của điện thoại
  return [
    {
      key: 'sos', icon: Siren, title: 'SOS chờ xử lý', short: 'SOS', level: sosLv, alert: late,
      value: int(sos.waiting), unit: 'phiếu mới',
      sub: sos.overdue > 0 ? `${sos.overdue} quá hạn phản hồi` : sos.no_team_15m > 0 ? `${sos.no_team_15m} chờ quá 15′`
        : sos.critical > 0 ? `${sos.critical} cấp 1 chưa xong` : `Đang xử lý ${int(sos.in_progress)}`,
    },
    {
      key: 'river', icon: Waves, title: 'Mực nước sông', short: 'Mực nước', level: riverFailed || stations.loading ? null : river.level,
      value: stations.loading && !n ? '…' : n ? `${river.above}/${n}` : '–', unit: n ? 'trạm trên BĐ' : '', unitShort: n ? 'trên BĐ' : '',
      sub: riverFailed ? 'Không tải được trạm' : stations.loading && !n ? 'Đang tải trạm…' : !n ? 'Chưa có trạm'
        : river.level == null ? 'Chưa đánh giá được' : river.level >= 1 ? `Nặng nhất BĐ ${ROMAN[river.level]}` : ALARM[0].label,
    },
    {
      key: 'topic', icon: Droplets, title: 'Hồ chứa · Sạt lở', short: 'Hồ · Sạt lở', level: topicFacts(rs, ls).level,
      value: rs.total ? `${rs.spill_count}/${rs.total}` : '–', unit: rs.total ? 'hồ đang xả' : '',
      sub: ls.total ? `${ls.blocked_count} điểm cấm đường` : 'Chưa có điểm sạt lở',
    },
    {
      key: 'rain', icon: CloudRain, title: 'Mưa 24 giờ', short: 'Mưa 24h', level: rainLv,
      value: rainKnown ? num(rain.avg_24h, 1) : '–', unit: rainKnown ? 'mm TB' : '',
      sub: rainKnown ? `Lớn nhất ${num(rain.max_24h, 1)} mm` : 'Chưa có số đo mưa',
    },
    {
      key: 'evac', icon: Home, title: 'Sơ tán an toàn', short: 'Sơ tán', level: planned ? undefined : null,
      value: planned ? `${evPct}%` : '–', unit: planned ? 'kế hoạch' : '',
      sub: planned ? `${int(ev.evacuated_households)}/${int(planned)} hộ` : 'Chưa có kế hoạch',
    },
    {
      key: 'forces', icon: Users, title: 'Lực lượng', short: 'Lực lượng', level: hasRes ? undefined : null,
      value: fo.units > 0 ? int(fo.ready) : '–', unit: fo.units > 0 ? `/ ${int(fo.total)} sẵn sàng` : '', unitShort: fo.units > 0 ? 'sẵn sàng' : '',
      sub: hasRes ? `Nhiệm vụ ${int(fo.on_mission)} người` : 'Chưa có dữ liệu',
    },
  ];
}

/**
 * Một ô chỉ số. Màu như thẻ KPI ở Tổng quan (StatCard): vạch trái theo mức 0–3, nền nhạt từ mức Vàng, viền đứt khi chưa có
 * dữ liệu, viền đỏ khi có việc quá hạn. Có `onPick` → nút "xem trên bản đồ"; không (tài khoản không mở được lớp đó) → chỉ
 * hiện số, như ô ở Tổng quan không có liên kết.
 */
function Tile({ t, layout, onPick }) {
  const scale = t.level === undefined ? null : risk(t.level);
  const Icon = t.icon;
  const text = `${t.title}: ${t.value}${t.unit ? ` ${t.unit}` : ''}${t.sub ? ` — ${t.sub}` : ''}`;
  const Tag = onPick ? 'button' : 'div';
  const props = onPick
    ? { type: 'button', onClick: () => onPick(t.key), 'aria-label': `${text}. Xem trên bản đồ`, title: `${text} — bấm để xem trên bản đồ` }
    : { title: text };
  const scroll = layout === 'scroll';
  return (
    <Tag
      {...props}
      className={clsx(
        'flex min-w-0 flex-col justify-center rounded-lg border border-line bg-panel text-left',
        t.level != null && clsx('border-l-4', scale.edge, t.level > 0 && scale.soft),
        t.level === null && 'border-dashed',
        t.alert && 'ring-2 ring-danger',
        onPick && 'transition-colors hover:border-accent active:scale-[0.98]',
        scroll ? 'min-h-[44px] w-[6.75rem] shrink-0 snap-start px-2 py-1' : 'min-h-[3.75rem] px-2 py-1.5',
      )}
    >
      <span className="flex min-w-0 items-center gap-1 text-[10px] font-semibold leading-tight text-muted">
        <Icon size={12} className={clsx('shrink-0', scale && t.level != null && t.level > 0 && scale.text)} aria-hidden="true" />
        <span className="truncate">{scroll ? t.short : t.title}</span>
      </span>
      <span className="flex min-w-0 items-baseline gap-1">
        <b className={clsx('font-mono font-black leading-tight text-ink', scroll ? 'text-sm' : 'text-base')}>{t.value}</b>
        {t.unit && <span className="truncate text-[10px] text-muted">{scroll ? t.unitShort ?? t.unit : t.unit}</span>}
      </span>
      {!scroll && (
        <span className={clsx('block truncate text-[10px] leading-snug', t.level >= 2 ? scale.text : 'text-ink-2', t.alert && 'font-bold')}>
          {t.sub}
        </span>
      )}
    </Tag>
  );
}

/**
 * Bảng "Tình hình" của Bản đồ giám sát cho lãnh đạo nắm tình hình trong vài giây: 6 chỉ số (kpiTiles) theo vùng đang lọc.
 * Chạm một ô → `onPick(key)`: Bản đồ bật lớp, mở đúng danh sách, đưa bản đồ tới các điểm đó. `pickable[key]` = tài khoản
 * mở được lớp đó (theo quyền) — không thì ô chỉ hiện số.
 * `layout`: `grid` 2×3 trong bảng Cảnh báo khẩn cấp (máy tính, iPad ngang; thu gọn được, nhớ trên máy) · `row` 1 hàng 6 ô
 * (iPad dọc) · `scroll` 1 hàng vuốt ngang ô cao 44 px (điện thoại).
 */
export default function MapKpis({ k, kState, stations, layout, onPick, pickable = {}, className }) {
  const area = useStore((s) => s.filter.label);
  const [hidden, setHidden] = useState(() => layout === 'grid' && readHidden());
  const toggle = () => setHidden((h) => { writeHidden(!h); return !h; });

  let body;
  if (!k && kState.error) {
    body = layout === 'scroll' ? (
      <div className="flex min-h-[44px] items-center gap-2 px-1 text-xs text-muted" role="status">
        <span className="min-w-0 flex-1">Không tải được chỉ số tình hình</span>
        <button type="button" className="btn-ghost min-h-[44px] px-2.5 text-xs" onClick={kState.refetch}>
          <RefreshCw size={13} aria-hidden="true" /> Thử lại
        </button>
      </div>
    ) : (
      <ErrorState onRetry={kState.refetch} className="!py-3">Không tải được chỉ số tình hình</ErrorState>
    );
  } else if (!k) {
    body = (
      <div className={clsx(layout === 'grid' ? 'grid grid-cols-2 gap-1.5' : layout === 'row' ? 'grid grid-cols-6 gap-1.5' : 'flex gap-1.5 overflow-hidden')} aria-label="Đang tải chỉ số tình hình">
        {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={layout === 'scroll' ? 44 : 60} className={layout === 'scroll' ? 'w-[6.75rem] shrink-0' : ''} />)}
      </div>
    );
  } else {
    const tiles = kpiTiles(k, stations);
    body = (
      <div
        className={clsx(
          // Bảng phải rộng 20rem: 2 cột (~147 px / ô) mới đủ chữ — 3 cột thì nhãn, đơn vị bị cắt
          layout === 'grid' && 'grid grid-cols-2 gap-1.5',
          layout === 'row' && 'grid grid-cols-6 gap-1.5',
          layout === 'scroll' && 'scroll-thin -mx-2 flex snap-x gap-1.5 overflow-x-auto px-2 pb-0.5',
        )}
      >
        {tiles.map((t) => <Tile key={t.key} t={t} layout={layout} onPick={pickable[t.key] ? onPick : undefined} />)}
      </div>
    );
  }

  if (layout !== 'grid') {
    return (
      <section className={clsx('px-2', layout === 'scroll' ? 'py-1' : 'py-1.5', className)} aria-label={`Tình hình · ${area}`}>
        {body}
      </section>
    );
  }
  return (
    <section className={clsx('px-2.5 pb-2 pt-1.5', className)} aria-label={`Tình hình · ${area}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[11px] font-bold uppercase tracking-wide text-muted">Tình hình · {area}</span>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!hidden}
          className="flex min-h-[28px] shrink-0 items-center gap-0.5 rounded-md px-1.5 text-[11px] font-semibold text-muted hover:bg-panel2 hover:text-accent [@media(pointer:coarse)]:min-h-[44px]"
        >
          {hidden ? 'Hiện chỉ số' : 'Thu gọn'}
          <ChevronDown size={14} className={clsx('transition-transform', !hidden && 'rotate-180')} aria-hidden="true" />
        </button>
      </div>
      {!hidden && body}
    </section>
  );
}
