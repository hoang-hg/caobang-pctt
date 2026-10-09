import clsx from 'clsx';
import { CloudRain, Droplets, Home, Siren, Users, Waves } from 'lucide-react';
import { ALARM } from '../../utils/labels';
import { int, minutesSince, num, pct } from '../../utils/format';
import { LANDSLIDE_LEVEL, levelOf, RAIN_LABEL, rainLevel, risk } from '../../utils/risk';
import { ErrorState, Progress, Skeleton } from '../common/ui';
import StatCard, { Badge } from './StatCard';
import { riverName, riverSummary } from './RiverKpi';

const GRID = 'grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 xl:grid-cols-6 [&>*]:min-w-0';
const TILE_H = 112; // chiều cao khung tải — gần bằng ô thật để trang không nhảy

/**
 * Hàng chỉ số nhanh (thiết kế mục A.2) cho lãnh đạo đọc trong vài giây: 6 ô gọn — 1 hàng trên laptop (≥ 1280 px), 3×2 trên
 * iPad, 2×3 trên điện thoại. Số liệu như trước (KPI, /stations, /evacuation); màu theo thang rủi ro chung. Chạm ô → chi tiết:
 * mưa → biểu đồ mưa, mực nước → trạm nặng nhất trên biểu đồ thủy văn, SOS / sơ tán → Điều hành cứu hộ, lực lượng → Vật tư &
 * Lực lượng (chỉ khi tài khoản mở được trang đó), hồ chứa / sạt lở → thẻ chuyên đề. Thiếu số liệu → "–" và nói rõ.
 */
export default function KpiStrip({
  k, kState, evacQ, stationsState, waterStations, rainStations, canSos, canResource, canEvacUpdate, onRiver, onRain, onOpenTab, riverRef,
}) {
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
  const river = riverSummary(waterStations);
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
    <div className={GRID} aria-label="Chỉ số nhanh">
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
                  : <Badge level={river.level}>{ALARM[river.level].label}</Badge>
            }
            value={river.rows.length ? `${river.above}/${river.rows.length}` : '–'}
            unit={river.rows.length ? 'trạm trên BĐ' : undefined}
            onClick={river.rows.length && onRiver ? () => onRiver(river.worst?.s.id || river.rows[0].s.id) : undefined}
            hint="Xem biểu đồ thủy văn của trạm nặng nhất"
            footer={
              river.worst && river.level >= 1 ? (
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
              <b className="font-mono text-ink">{int(ev.evacuated_households)}/{int(planned)}</b> hộ
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
