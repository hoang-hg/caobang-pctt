import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { CloudRain, Home, Ship, Siren, Users, Waves } from 'lucide-react';
import { useAreaQuery } from '../../api/hooks';
import { ALARM } from '../../utils/labels';
import { int, minutesSince, num } from '../../utils/format';
import { RAIN_LABEL, risk } from '../../utils/risk';
import { trendProps } from '../../utils/stations';
import { useMediaQuery } from '../../utils/useMediaQuery';
import { ErrorState, Skeleton, TrendTag } from '../common/ui';
import StatCard from './StatCard';
import { evacFacts, rainFacts, sosFacts } from './kpiFacts';
import { riverName, riverSummary, ROMAN, shortName } from './RiverKpi';

const GRID = 'grid grid-cols-2 gap-1.5 sm:gap-2.5 [&>*]:min-w-0';
const WIDE = 980; // vùng chỉ số rộng từ ~980 px → 6 ô một hàng
// Ô từ ~300 px (cột trái màn lớn ≥ 1680 px, 2 × 3: dòng ~310 px): dòng ý nghĩa ghi thêm tên trạm, tên sông, số hộ. Ô hẹp
// hơn (6 ô một hàng trên laptop 1366 / 1440 / 1600, 3 cột iPad dọc, 2 cột điện thoại: dòng 145–230 px ≈ 19–30 chữ) chỉ ghi
// phần số chính — không để dấu "…" cắt mất số thiết kế yêu cầu (nhân khẩu sơ tán, mức báo động…); câu đầy đủ ở chú thích
// khi rê chuột
const ROOMY = 300;
const TILE_H = 92; // chiều cao khung tải — gần bằng ô thật để trang không nhảy
const HOUR = 3_600_000;

function formatWait(m) {
  if (m == null) return '';
  if (m >= 1440) return `${Math.floor(m / 1440)} ngày`;
  return `${m} phút`;
}

/**
 * Mưa của giờ TRỌN gần nhất (bình quân lưu vực — cùng số liệu cột "Mưa giờ" của biểu đồ mưa) so với giờ trước đó. Giờ
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
    span: `${from}–${(from + 1) % 24} giờ`,
    dir: delta == null ? null : delta >= 0.5 ? 'len' : delta <= -0.5 ? 'xuong' : 'on_dinh',
    label: comparable && `${delta >= 0.5 ? 'Tăng' : delta <= -0.5 ? 'Giảm' : 'Tương đương'} so với giờ trước (${num(prev.mm, 1)} mm)`,
  };
}

/**
 * Hàng 6 chỉ số nhanh (thiết kế mục A.2) cho lãnh đạo đọc trong vài giây: mỗi ô MỘT con số lớn + MỘT dòng ý nghĩa bằng lời
 * + mũi tên xu hướng ở góc (khi số liệu cho biết được). 1 hàng khi vùng chỉ số đủ rộng, 3×2 trên iPad / laptop có cột "Việc
 * chờ quyết định", 2×3 trên điện thoại (360 × 740 thấy đủ 6 ô cùng dải khẩn, không cuộn). Thứ tự: mưa · mực nước · SOS ·
 * sơ tán · quân số · phương tiện chuyên dụng. Số liệu như trước (KPI, /stations, /evacuation); màu theo thang rủi ro chung.
 * Chạm ô → chi tiết: mưa → biểu đồ mưa, mực nước → trạm đáng lo nhất trên biểu đồ thủy văn, SOS / sơ tán → Điều hành cứu
 * hộ, quân số / phương tiện → Vật tư & Lực lượng (chỉ khi tài khoản mở được trang đó). Thiếu số liệu → "–" và nói rõ.
 * Xu hướng: ô Mưa so mưa giờ trọn gần nhất với giờ trước (dùng chung truy vấn 'rainfall' của biểu đồ mưa — không thêm lượt
 * gọi); ô Mực nước: lên / xuống của trạm nặng nhất. Ô SOS: viền đỏ + nhãn nhấp nháy (chỉ nhãn) khi có phiếu quá hạn phản
 * hồi theo cấp hoặc chờ quá 15 phút chưa có lực lượng nhận.
 * Dòng ý nghĩa mang con số thứ hai của thiết kế A.2, đứng ĐẦU dòng: mưa lớn nhất; mức báo động cao nhất (màn ≥ 1536 px thêm
 * mực nước đo được vượt mốc bao nhiêu); nhân khẩu đã sơ tán / kế hoạch (ô rộng: cả hộ); thời gian chờ lâu nhất; số người
 * đang làm nhiệm vụ; loại phương tiện được đếm. Ô phương tiện đếm đúng "xuồng, xe lội nước" như thiết kế (máy xúc, máy ủi ghi
 * riêng ở dòng thứ hai).
 * `large`: chữ số to cho chế độ trình chiếu (màn hình lớn phòng điều hành, đọc từ xa).
 * `stacked`: luôn 2 × 3 — cột trái của Tổng quan màn lớn ≥ 1680 px, cạnh bản đồ (3 × 2 ở cột đó làm chữ trong ô bị cắt).
 */
export default function KpiStrip({
  k, kState, evacQ, stationsState, waterStations, rainStations, canSos, canResource, canEvacUpdate, onRiver, onRain, riverRef,
  large = false, stacked = false,
}) {
  // Xếp 6 ô một hàng theo bề rộng THẬT của vùng chỉ số (không chỉ theo màn hình): màn rộng / trình chiếu đủ chỗ thì một
  // hàng; cạnh cột "Việc chờ quyết định" thì 3×2
  const gridRef = useRef(null);
  const [gridW, setGridW] = useState(0);
  const smUp = useMediaQuery('(min-width: 640px)'); // sm: 3 cột khi chưa đủ rộng cho 6 ô một hàng
  const xl2 = useMediaQuery('(min-width: 1536px)'); // 2xl: ô có thêm dòng thứ hai
  const rainQ = useAreaQuery('rainfall', '/dashboard/rainfall', {}, { refetchInterval: 60_000 });
  useEffect(() => {
    const el = gridRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setGridW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [k]);
  const wide = gridW >= WIDE;
  const cols = stacked ? 2 : wide ? 6 : smUp ? 3 : 2;
  const roomy = gridW > 0 && (gridW - (cols - 1) * 10) / cols >= ROOMY;
  const fit = (short, full) => (roomy ? full : short);
  if (!k && kState.error) return <ErrorState onRetry={kState.refetch}>Không tải được chỉ số tổng quan</ErrorState>;
  if (!k) {
    return (
      <div className={clsx(GRID, !stacked && 'sm:grid-cols-3')} aria-label="Đang tải chỉ số nhanh">
        {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={TILE_H} />)}
      </div>
    );
  }
  const rain = k.rain;
  const { known: rainKnown, level: rainLv } = rainFacts(rain);
  const hourRain = lastHourRain(rainQ.data);
  const maxAt = rain?.max_station ? ` tại ${rain.max_station.replace(/^Trạm đo mưa\s+/i, '')}` : '';
  const river = riverSummary(waterStations);
  const lead = river.level >= 1 ? river.worst : null; // trạm nặng nhất (đã trên báo động I) — mũi tên xu hướng của ô
  // Dự báo chỉ lên ô khi NẶNG THÊM (mức kế tiếp cao hơn mức nặng nhất hiện tại); dự báo từng trạm vẫn ở biểu đồ thủy văn.
  // Chạm ô → trạm sắp nặng thêm đó, không thì trạm nặng nhất
  const next = river.next && river.next.eta.level > (river.level ?? 0) ? river.next : null;
  const riverTarget = next ? next.s : river.worst?.s || river.rows[0]?.s;
  // Mực nước đo được của trạm nặng nhất so với mốc báo động của nó (thiết kế A.2: "mực nước … so với các mốc Báo động")
  const mark = lead ? Number(lead.s.thresholds?.[`bd${lead.st.level}`]) : null;
  const over = lead && Number.isFinite(mark) ? lead.st.value - mark : null;
  const riverDetail = lead && `${riverName(lead.s)}: ${num(lead.st.value, 2)} m${over != null ? `, vượt mốc Báo động ${ROMAN[lead.st.level]} (${num(mark, 2)} m) ${num(over, 2)} m` : ''}`;
  const sos = k.sos || {};
  // Mức / số chính dùng chung với bảng "Tình hình" của Bản đồ giám sát (kpiFacts) — hai nơi luôn cùng số, cùng màu
  const { late: sosLate, level: sosLv } = sosFacts(sos);
  const oldest = sos.oldest_waiting ? minutesSince(sos.oldest_waiting) : null;
  const ev = k.evacuation || {};
  const { planned, pct: evPct } = evacFacts(ev);
  const sites = evacQ.data?.sites || [];
  const households = <><b className="num text-ink">{int(ev.evacuated_households)}/{int(planned)}</b> hộ</>;
  const persons = ev.planned_persons > 0 && <><b className="num text-ink">{int(ev.evacuated_persons)}/{int(ev.planned_persons)}</b> người</>;
  const sitesText = evacQ.data ? `${sites.length} điểm sơ tán` : evacQ.isError ? 'không tải được điểm sơ tán' : null;
  const fo = k.forces || {};
  const ve = k.vehicles || {};
  // Thiết kế A.2: "phương tiện chuyên dụng (xuồng, xe lội nước) đang hoạt động" — số lớn chỉ đếm xuồng, ca nô, ghe, xe lội
  // nước đang làm nhiệm vụ / tổng số (trước đây cộng cả máy xúc, máy ủi: "0/17" mà không rõ 17 là gì)
  const hasBoats = ve.special_total > 0;
  const hasVehicles = hasBoats || ve.heavy_total > 0;
  const line = 'block truncate';
  const sosChip = (
    <span className="chip whitespace-nowrap bg-danger px-1.5 py-0 text-[11px] font-bold text-white motion-safe:animate-blink-text">
      {sos.overdue > 0 ? `${sos.overdue} quá hạn` : `${sos.no_team_15m} chờ quá 15 phút`}
    </span>
  );

  return (
    <div ref={gridRef} className={clsx(GRID, !stacked && (wide ? 'sm:grid-cols-6' : 'sm:grid-cols-3'), large && 'kpi-lon')} aria-label="Chỉ số nhanh">
      <StatCard
        compact
        icon={CloudRain}
        title="Mưa trung bình"
        level={rainLv}
        // Chỉ mũi tên (chữ ở dòng "Giờ …" bên dưới và trong lời đọc) — tiêu đề không bị cắt ở ô hẹp
        trend={hourRain && <TrendTag dir={hourRain.dir} label={`Mưa giờ ${hourRain.span}: ${num(hourRain.mm, 1)} mm${hourRain.label ? ` — ${hourRain.label}` : ''}`} />}
        value={num(rain?.avg_24h, 1)}
        unit={rainKnown ? 'mm/24 giờ' : undefined}
        onClick={onRain}
        hint={`${rain?.avg_method === 'thiessen' ? `Trung bình lưu vực theo diện tích đại diện của ${rain.stations} trạm` : rain?.stations === 1 ? 'Số đo của 1 trạm trong vùng' : 'Trung bình cộng các trạm'} — bấm xem biểu đồ mưa từng giờ và dự báo 3 giờ tới`}
        footerRows={rainKnown}
        footer={
          rainKnown ? (
            <>
              {/* Mưa cực đại cục bộ: số trước, tên trạm sau (ô hẹp: tên trạm ở chú thích) */}
              <span className={line} title={`Lớn nhất ${num(rain.max_24h, 1)} mm/24 giờ${maxAt}${rainLv >= 1 ? ` — ${RAIN_LABEL[rainLv]}` : ''}`}>
                Lớn nhất <b className={clsx('num', rainLv >= 1 ? risk(rainLv).text : 'text-ink')}>{num(rain.max_24h, 1)} mm</b>{roomy && maxAt}
              </span>
              {hourRain && <span className={clsx(line, 'hidden 2xl:block')}>Mưa {hourRain.span}: <b className="num text-ink">{num(hourRain.mm, 1)} mm</b></span>}
            </>
          ) : rainStations
            ? fit(`${rainStations} trạm chưa có số đo`, `${rainStations} trạm đo mưa chưa gửi số đo 24 giờ qua`)
            : fit('Chưa có trạm đo mưa', 'Chưa có trạm đo mưa trong vùng đang xem')
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
            title="Mực nước"
            level={river.level}
            alert={river.level === 3}
            trend={lead && <TrendTag {...trendProps(lead.trend, shortName(lead.s))} textClass="hidden 2xl:inline" />}
            value={river.rows.length ? `${river.above}/${river.rows.length}` : '–'}
            unit={river.rows.length ? fit('báo động', 'trạm báo động') : undefined}
            onClick={river.rows.length && onRiver ? () => onRiver(riverTarget.id) : undefined}
            hint={riverTarget ? `${riverDetail ? `${riverDetail}. ` : ''}Bấm xem biểu đồ mực nước trạm ${shortName(riverTarget)}` : undefined}
            footerRows={river.rows.length > 0}
            footer={
              !river.rows.length ? fit('Chưa có trạm mực nước', 'Chưa có trạm mực nước trong vùng đang xem') : (
                <>
                  {/* Dòng chính: mực nước so với mốc báo động (mức cao nhất; ô rộng thêm sông, trạm) */}
                  <span className={line} title={riverDetail || undefined}>
                    {river.level == null
                      ? fit('Chưa đánh giá được', `${river.fresh}/${river.rows.length} trạm có số đo trong 60 phút qua — chưa đánh giá được`)
                      : lead
                        ? <>Cao nhất <b className={risk(river.level).text}>Báo động {ROMAN[river.level]}</b>{roomy && `: ${riverName(lead.s)}`}</>
                        : fit(ALARM[0].label, `${ALARM[0].label} ở mọi trạm có số đo`)}
                  </span>
                  {/* Dòng thứ hai (màn ≥ 1536 px). Ô rộng có dự báo nặng thêm: nguồn ghi ĐẦU câu (bản tin / mô phỏng — câu
                      dài bị cắt thì chỉ mất phần giờ, không bao giờ mất nguồn); còn lại: mực nước đo được vượt mốc bao nhiêu */}
                  {roomy && next ? (
                    <span className={clsx(line, 'hidden 2xl:block')} title={`${next.s.name}: dự báo lên báo động ${ROMAN[next.eta.level]} lúc ${next.eta.when} — ${next.eta.source}`}>
                      {next.eta.kttv ? 'Bản tin' : 'Mô phỏng'}:{' '}
                      <b className={clsx('font-semibold', risk(next.eta.level).text)}>
                        {next.s.id !== lead?.s.id && `${shortName(next.s)} `}lên Báo động {ROMAN[next.eta.level]} lúc {next.eta.when}
                      </b>
                    </span>
                  ) : over != null && over >= 0 && (
                    <span className={clsx(line, 'hidden 2xl:block')} title={riverDetail}>
                      Vượt mốc {ROMAN[lead.st.level]} <b className="num text-ink">{num(over, 2)} m</b>{roomy && ` · ${shortName(lead.s)} ${num(lead.st.value, 2)} m`}
                    </span>
                  )}
                </>
              )
            }
          />
        )}
      </div>

      <StatCard
        compact
        icon={Siren}
        title="SOS chờ"
        level={sosLv}
        alert={sosLate}
        // Chỉ NHÃN nhấp nháy (cả ô nhấp nháy thì không đọc được số) — tắt khi hệ điều hành bật "giảm chuyển động"
        // (ô hẹp — điện thoại, 6 ô một hàng trên laptop: nhãn nằm cạnh số, hàng tiêu đề không đủ chỗ)
        trend={sosLate && <span className="hidden 2xl:inline">{sosChip}</span>}
        value={int(sos.waiting)}
        // Ô hẹp dưới 1536 px: nhãn đỏ nằm cạnh số — bỏ chữ "phiếu" để nhãn không bị cắt mất
        unit={sosLate ? <span className="flex items-center gap-1.5">{(roomy || xl2) && 'phiếu'}<span className="2xl:hidden">{sosChip}</span></span> : 'phiếu'}
        to={canSos ? '/cuu-ho' : undefined}
        hint="Đỏ khi có phiếu quá hạn phản hồi theo cấp (cấp 1: 3 phút · cấp 2: 15 phút · cấp 3: 60 phút, như trang Điều hành cứu hộ) hoặc chờ quá 15 phút mà chưa có đội nhận"
        footerRows
        footer={
          <>
            <span className={line} title={oldest != null ? `Chờ lâu nhất ${oldest} phút` : undefined}>
              {oldest != null && sos.waiting > 0
                ? <>Chờ lâu nhất <b className={clsx('num', sos.overdue > 0 || oldest > 15 ? 'text-danger' : 'text-ink')}>{formatWait(oldest)}</b>{roomy && sos.critical > 0 && ` · ${sos.critical} cấp 1`}</>
                : fit('Không có phiếu chờ', 'Không có phiếu đang chờ')}
            </span>
            <span className={clsx(line, 'hidden 2xl:block')}>
              {!roomy && sos.critical > 0 ? (
                <><b className="num text-danger">{int(sos.critical)}</b> cấp 1 · đang cứu <b className="num text-ink">{int(sos.in_progress)}</b></>
              ) : (
                <>Đang cứu <b className="num text-ink">{int(sos.in_progress)}</b> · xong 24 giờ <b className="num text-ink">{int(sos.resolved_24h)}</b></>
              )}
            </span>
          </>
        }
      />

      <StatCard
        compact
        icon={Home}
        title="Sơ tán"
        level={planned ? undefined : null}
        value={planned ? `${evPct}%` : '–'}
        unit={planned ? fit('đã sơ tán', 'hộ đã sơ tán') : undefined}
        to={canSos ? '/cuu-ho' : undefined}
        hint={canEvacUpdate ? 'Cập nhật tiến độ sơ tán ở Điều hành cứu hộ' : 'Số hộ, số người đã sơ tán so với kế hoạch'}
        footerRows={planned > 0}
        footer={
          planned ? (
            <>
              {/* Số lớn là % hộ → dòng chính ghi nhân khẩu đã sơ tán / kế hoạch (ô rộng: cả số hộ) */}
              <span className={line}>
                {(roomy || !persons) && households}
                {roomy && persons && ' · '}
                {persons}
              </span>
              {/* Dòng thứ hai (màn ≥ 1536 px): ô hẹp — số hộ (dòng chính đã ghi nhân khẩu); ô rộng — số điểm sơ tán */}
              {(!roomy && persons ? households : sitesText) && (
                <span className={clsx(line, 'hidden 2xl:block')}>{!roomy && persons ? households : sitesText}</span>
              )}
            </>
          ) : fit('Chưa có kế hoạch', 'Chưa có kế hoạch sơ tán trong vùng đang xem')
        }
      />

      <StatCard
        compact
        icon={Users}
        title={fit('Quân số trực', 'Quân số ứng trực')}
        level={fo.units > 0 ? undefined : null}
        value={fo.units > 0 ? int(fo.ready) : '–'}
        unit={fo.units > 0 ? `/ ${int(fo.total)} người` : undefined}
        to={canResource ? '/nguon-luc' : undefined}
        hint="Người sẵn sàng nhận nhiệm vụ / tổng quân số các đội trong vùng đang xem"
        footerRows
        footer={
          <span className={line}>
            {fo.units > 0
              ? fit(<>Làm nhiệm vụ: <b className="num text-ink">{int(fo.on_mission)}</b></>, <><b className="num text-ink">{int(fo.on_mission)}</b> người đang làm nhiệm vụ</>)
              : fit('Chưa có dữ liệu', 'Chưa có dữ liệu lực lượng')}
          </span>
        }
      />

      <StatCard
        compact
        icon={Ship}
        title={roomy ? 'Phương tiện chuyên dụng' : 'Phương tiện'}
        level={hasVehicles ? undefined : null}
        value={hasBoats ? `${int(ve.special_active)}/${int(ve.special_total)}` : '–'}
        unit={hasBoats ? 'hoạt động' : undefined}
        to={canResource ? '/nguon-luc' : undefined}
        hint="Xuồng, xe lội nước (gồm ca nô, ghe): đang làm nhiệm vụ / tổng số. Máy xúc, máy ủi thông tuyến ghi riêng ở dòng dưới"
        footerRows={hasVehicles}
        footer={
          hasVehicles ? (
            <>
              <span className={line}>{hasBoats ? 'Xuồng, xe lội nước' : fit('Chưa có xuồng', 'Chưa có xuồng, xe lội nước')}</span>
              {ve.heavy_total > 0 && (
                <span className={clsx(line, 'hidden 2xl:block')}>Máy xúc, máy ủi <b className="num text-ink">{int(ve.heavy_active)}/{int(ve.heavy_total)}</b></span>
              )}
            </>
          ) : fit('Chưa có dữ liệu', 'Chưa có dữ liệu phương tiện')
        }
      />
    </div>
  );
}
