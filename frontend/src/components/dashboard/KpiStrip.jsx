import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { CloudRain, Droplets, Home, Siren, Users, Waves } from 'lucide-react';
import { useAreaQuery } from '../../api/hooks';
import { ALARM } from '../../utils/labels';
import { int, minutesSince, num, pct } from '../../utils/format';
import { LANDSLIDE_LEVEL, levelOf, RAIN_LABEL, rainLevel, risk } from '../../utils/risk';
import { trendProps } from '../../utils/stations';
import { ErrorState, Progress, Skeleton, TrendTag } from '../common/ui';
import StatCard, { Badge } from './StatCard';
import { riverName, riverSummary, ROMAN, shortName } from './RiverKpi';

const GRID = 'grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 xl:grid-cols-6 [&>*]:min-w-0';
const WIDE = 980; // vùng KPI rộng từ ~980 px (iPad ngang khi menu thu gọn) → 6 ô một hàng như laptop
const TILE_H = 112; // chiều cao khung tải — gần bằng ô thật để trang không nhảy
const HOUR = 3_600_000;

/**
 * Mưa của giờ TRỌN gần nhất (trung bình các trạm — cùng số liệu cột "Mưa giờ" của biểu đồ mưa) so với giờ trước đó. Giờ
 * đang chạy chưa đủ số đo nên bỏ; giờ trọn gần nhất cũ hơn 2 giờ (trạm ngừng gửi) → null. Chênh dưới 0,5 mm = tương đương.
 */
function lastHourRain(data) {
  const now = Date.now();
  const done = (data?.observed || []).filter((d) => new Date(d.time).getTime() + HOUR <= now);
  const last = done[done.length - 1];
  if (!last || now - new Date(last.time).getTime() > 2 * HOUR) return null;
  const prev = done[done.length - 2];
  const comparable = prev && new Date(last.time) - new Date(prev.time) === HOUR;
  const delta = comparable ? last.mm - prev.mm : null;
  const from = new Date(last.time).getHours();
  return {
    mm: last.mm,
    span: `${from}–${(from + 1) % 24}h`,
    dir: delta == null ? null : delta >= 0.5 ? 'len' : delta <= -0.5 ? 'xuong' : 'on_dinh',
    label: comparable && `${delta >= 0.5 ? 'Tăng' : delta <= -0.5 ? 'Giảm' : 'Tương đương'} so với giờ trước (${num(prev.mm, 1)} mm)`,
  };
}

/**
 * Hàng chỉ số nhanh (thiết kế mục A.2) cho lãnh đạo đọc trong vài giây: 6 ô gọn — 1 hàng trên laptop (≥ 1280 px), 3×2 trên
 * iPad, 2×3 trên điện thoại. Số liệu như trước (KPI, /stations, /evacuation); màu theo thang rủi ro chung. Chạm ô → chi tiết:
 * mưa → biểu đồ mưa, mực nước → trạm nặng nhất trên biểu đồ thủy văn, SOS / sơ tán → Điều hành cứu hộ, lực lượng → Vật tư &
 * Lực lượng (chỉ khi tài khoản mở được trang đó), hồ chứa / sạt lở → thẻ chuyên đề. Thiếu số liệu → "–" và nói rõ.
 * Xu hướng (thiết kế A.2): ô Mưa so mưa giờ trọn gần nhất với giờ trước (dùng chung truy vấn 'rainfall' của biểu đồ mưa —
 * không thêm lượt gọi); ô Mực nước có mũi tên lên / xuống của trạm nặng nhất và giờ dự báo vượt mức báo động kế tiếp.
 * `large`: chữ số to cho chế độ trình chiếu (màn hình lớn phòng điều hành, đọc từ xa).
 */
export default function KpiStrip({
  k, kState, evacQ, stationsState, waterStations, rainStations, canSos, canResource, canEvacUpdate, onRiver, onRain, onOpenTab, riverRef,
  large = false,
}) {
  // Xếp 6 ô một hàng theo bề rộng THẬT của vùng KPI (không chỉ theo màn hình): iPad ngang 1180 px thu gọn menu đủ chỗ
  // như laptop → bản đồ lên màn hình đầu nhiều hơn; mở rộng menu thì trở lại 3×2
  const gridRef = useRef(null);
  const [wide, setWide] = useState(false);
  const rainQ = useAreaQuery('rainfall', '/dashboard/rainfall', {}, { refetchInterval: 60_000 });
  useEffect(() => {
    const el = gridRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= WIDE));
    ro.observe(el);
    return () => ro.disconnect();
  }, [k]);
  if (!k && kState.error) return <ErrorState onRetry={kState.refetch}>Không tải được chỉ số tổng quan</ErrorState>;
  if (!k) {
    return (
      <div className={GRID} aria-label="Đang tải chỉ số nhanh">
        {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={TILE_H} />)}
      </div>
    );
  }
  const rain = k.rain;
  const rainKnown = rain?.avg_24h != null;
  const rainLv = rainKnown ? rainLevel(rain.max_24h) : null;
  const hourRain = lastHourRain(rainQ.data);
  const river = riverSummary(waterStations);
  const lead = river.level >= 1 ? river.worst : null; // trạm nặng nhất (đã trên BĐ I) — mũi tên xu hướng của ô
  // Dự báo chỉ lên ô khi NẶNG THÊM (mức kế tiếp cao hơn mức nặng nhất hiện tại) — "BĐ II · dự báo BĐ II" của trạm khác dễ
  // đọc nhầm; dự báo từng trạm vẫn ở biểu đồ thủy văn. Chạm ô → trạm sắp nặng thêm đó, không thì trạm nặng nhất
  const next = river.next && river.next.eta.level > (river.level ?? 0) ? river.next : null;
  const riverTarget = next ? next.s : river.worst?.s || river.rows[0]?.s;
  const sos = k.sos || {};
  const sosLv = sos.overdue > 0 || sos.critical > 0 ? 3 : sos.waiting > 0 ? 1 : 0;
  const oldest = sos.oldest_waiting ? minutesSince(sos.oldest_waiting) : null;
  const ev = k.evacuation || {};
  const planned = ev.planned_households || 0;
  const evPct = planned ? pct(ev.evacuated_households, planned) : null;
  const sites = evacQ.data?.sites || [];
  const fo = k.forces || {};
  const ve = k.vehicles || {};
  const hasResources = fo.units > 0 || ve.special_total > 0 || ve.heavy_total > 0;
  const rs = k.reservoirs || {};
  const ls = k.landslides || {};
  const rsLv = !rs.total ? null : rs.emergency_count ? 3 : rs.spill_count ? 2 : 0;
  const lsLv = !ls.total ? null : ls.blocked_count ? levelOf(LANDSLIDE_LEVEL, 'cam_duong') : ls.warning_count ? levelOf(LANDSLIDE_LEVEL, 'canh_bao') : 0;
  const topicLv = rsLv == null && lsLv == null ? null : Math.max(rsLv ?? 0, lsLv ?? 0);
  const topicRow = 'flex min-h-[36px] w-full items-center justify-between gap-2 rounded-md px-1.5 text-left text-xs hover:bg-panel2';

  return (
    <div ref={gridRef} className={clsx(GRID, wide && 'sm:grid-cols-6', large && 'kpi-lon')} aria-label="Chỉ số nhanh">
      <StatCard
        compact
        icon={CloudRain}
        title="Mưa 24 giờ"
        level={rainLv}
        badge={rainLv >= 1 && <Badge level={rainLv}>{RAIN_LABEL[rainLv]}</Badge>}
        value={num(rain?.avg_24h, 1)}
        unit={rainKnown ? 'mm TB' : undefined}
        onClick={onRain}
        hint="Xem biểu đồ mưa giờ và dự báo 3 giờ tới"
        footer={
          rainKnown ? (
            <>
              {hourRain && (
                <>
                  {hourRain.span} <b className="font-mono text-ink">{num(hourRain.mm, 1)} mm</b>{' '}
                  <TrendTag dir={hourRain.dir} label={hourRain.label} className="align-middle" />
                  {' · '}
                </>
              )}
              Lớn nhất <b className="font-mono text-ink">{num(rain.max_24h, 1)} mm</b>
              {rain.max_station && ` · ${rain.max_station.replace(/^Trạm đo mưa\s+/i, '')}`}
            </>
          ) : rainStations ? `${rainStations} trạm đo mưa chưa gửi số đo 24 giờ qua` : 'Chưa có trạm đo mưa trong vùng đang xem'
        }
      />

      <div ref={riverRef} className="scroll-mt-20">
        {stationsState.error ? (
          <ErrorState onRetry={stationsState.refetch} className="h-full !py-3">Không tải được trạm mực nước</ErrorState>
        ) : stationsState.loading ? (
          <Skeleton height={TILE_H} />
        ) : (
          <StatCard
            compact
            className="h-full"
            icon={Waves}
            title="Mực nước sông"
            level={river.level}
            alert={river.level === 3}
            badge={
              !river.rows.length ? <Badge level={null}>Chưa có trạm</Badge>
                : river.level == null ? <Badge level={null}>Chưa đánh giá được</Badge>
                  : <Badge level={river.level}>{river.level >= 1 ? `BĐ ${ROMAN[river.level]}` : ALARM[0].label}</Badge>
            }
            aside={lead && <TrendTag {...trendProps(lead.trend, shortName(lead.s))} className="min-w-0 text-[11px]" />}
            value={river.rows.length ? `${river.above}/${river.rows.length}` : '–'}
            unit={river.rows.length ? 'trạm trên BĐ' : undefined}
            onClick={river.rows.length && onRiver ? () => onRiver(riverTarget.id) : undefined}
            hint={riverTarget ? `Xem biểu đồ thủy văn trạm ${shortName(riverTarget)}` : undefined}
            footer={
              next ? (
                // Dự báo đáng lo nhất: mức kế tiếp · giờ · trạm · nguồn (KTTV / mô phỏng — luôn ghi rõ)
                <span title={`${next.s.name}: dự báo vượt BĐ ${ROMAN[next.eta.level]} lúc ${next.eta.when} — ${next.eta.source}`}>
                  <b className={clsx('font-semibold', risk(next.eta.level).text)}>
                    Dự báo BĐ {ROMAN[next.eta.level]} lúc {next.eta.when}
                  </b>
                  {` · ${shortName(next.s)} (${next.eta.kttv ? 'KTTV' : 'mô phỏng'})`}
                </span>
              ) : river.worst && river.level >= 1 ? (
                <>
                  {riverName(river.worst.s)} <b className="font-mono text-ink">{num(river.worst.st.value, 2)} m</b>
                </>
              ) : river.rows.length ? `${river.fresh}/${river.rows.length} trạm có số đo trong 60 phút qua` : 'Chưa có trạm mực nước trong vùng đang xem'
            }
          />
        )}
      </div>

      <StatCard
        compact
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
        to={canSos ? '/cuu-ho' : undefined}
        hint="Hạn phản hồi (như backend services/sos.py): Cấp 1 · 3 phút · Cấp 2 · 15 phút · Cấp 3 · 60 phút"
        footer={
          <>
            {oldest != null && (
              <>Chờ lâu nhất <b className={clsx('font-mono', sos.overdue > 0 ? 'text-danger' : 'text-ink')}>{oldest}′</b> · </>
            )}
            Đang xử lý <b className="font-mono text-ink">{int(sos.in_progress)}</b> · Xong 24 giờ <b className="font-mono text-ink">{int(sos.resolved_24h)}</b>
          </>
        }
      />

      <StatCard
        compact
        icon={Home}
        title="Sơ tán an toàn"
        level={planned ? undefined : null}
        value={planned ? `${evPct}%` : '–'}
        unit={planned ? 'kế hoạch' : undefined}
        to={canSos ? '/cuu-ho' : undefined}
        hint={canEvacUpdate ? 'Cập nhật tiến độ sơ tán ở Điều hành cứu hộ' : undefined}
        footer={
          planned ? (
            <>
              {/* Thiết kế A.2: số hộ VÀ nhân khẩu đã sơ tán so với kế hoạch */}
              <b className="font-mono text-ink">{int(ev.evacuated_households)}/{int(planned)}</b> hộ
              {ev.planned_persons > 0 && <> · <b className="font-mono text-ink">{int(ev.evacuated_persons)}/{int(ev.planned_persons)}</b> người</>}
              {evacQ.data ? ` · ${sites.length} điểm sơ tán` : evacQ.isError ? ' · không tải được điểm sơ tán' : ''}
            </>
          ) : 'Chưa có kế hoạch sơ tán trong vùng đang xem'
        }
      >
        {planned > 0 && <Progress value={evPct} tone="accent" />}
      </StatCard>

      <StatCard
        compact
        icon={Users}
        title="Lực lượng"
        level={hasResources ? undefined : null}
        value={fo.units > 0 ? int(fo.ready) : '–'}
        unit={fo.units > 0 ? `/ ${int(fo.total)} sẵn sàng` : undefined}
        to={canResource ? '/nguon-luc' : undefined}
        footer={
          hasResources
            ? `Nhiệm vụ ${int(fo.on_mission)} người · Xuồng ${int(ve.special_active)}/${int(ve.special_total)} · Máy xúc ${int(ve.heavy_active)}/${int(ve.heavy_total)}`
            : 'Chưa có dữ liệu lực lượng, phương tiện'
        }
      />

      <StatCard compact icon={Droplets} title="Hồ chứa · Sạt lở" level={topicLv}>
        <button type="button" className={topicRow} onClick={() => onOpenTab('ho_chua')} title="Mở chuyên đề Hồ chứa & xả lũ">
          <span className="flex min-w-0 items-center gap-1.5 text-ink-2">
            <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', risk(rsLv).fill)} aria-hidden="true" />
            <span className="truncate">Hồ đang xả</span>
          </span>
          <b className="font-mono text-ink">{rs.total ? `${rs.spill_count}/${rs.total}` : '–'}</b>
        </button>
        <button
          type="button"
          className={topicRow}
          onClick={() => onOpenTab('sat_lo')}
          title={ls.total ? `Mở chuyên đề Sạt lở — ${ls.blocked_count} cấm đường, ${ls.warning_count} cảnh báo` : 'Mở chuyên đề Sạt lở & đường đèo'}
        >
          <span className="flex min-w-0 items-center gap-1.5 text-ink-2">
            <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', risk(lsLv).fill)} aria-hidden="true" />
            <span className="truncate">Cấm đường</span>
          </span>
          <b className="font-mono text-ink">{ls.total ? ls.blocked_count : '–'}</b>
        </button>
      </StatCard>
    </div>
  );
}
