import { useState } from 'react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronDown, DatabaseZap, Info, Siren } from 'lucide-react';
import { num } from '../../utils/format';
import { rainLevel, risk } from '../../utils/risk';
import { trendWords } from '../../utils/stations';
import { riverState, riverTrend, ROMAN } from './RiverKpi';
import { EDGE, EDGE_PAD } from '../layout/page';

const NOTE = 'Tổng hợp tự động từ số liệu hệ thống — không phải cấp độ rủi ro thiên tai do cơ quan có thẩm quyền công bố';

/**
 * Các tình huống đáng chú ý lấy từ số liệu thật (KPI + trạm mực nước). Mức theo thang màu rủi ro chung (utils/risk.js),
 * khớp màu backend trả cho từng đối tượng: trạm vượt BĐ I / II / III → Vàng / Cam / Đỏ; SOS quá hạn hoặc cấp 1 → Đỏ;
 * sạt lở cấm đường → Đỏ, cảnh báo → Cam; hồ xả khẩn cấp → Đỏ, xả điều tiết → Cam; mưa 24 giờ theo rainLevel.
 */
export function situationItems(k, waterStations) {
  const items = [];
  for (const s of waterStations) {
    const st = riverState(s);
    if (st.level >= 1) {
      const where = s.river ? `Sông ${s.river}` : s.name;
      const trend = !st.stale && riverTrend(s); // số đo cũ: không nói lên / xuống
      const note = st.stale ? ', số đo cũ' : trend && trend.dir !== 'on_dinh' ? `, ${trendWords(trend)}` : '';
      items.push({ level: st.level, text: `${where} Báo động ${ROMAN[st.level]} (${num(st.value, 2)} m${note})` });
    }
  }
  const sos = k?.sos || {};
  if (sos.overdue > 0) items.push({ level: 3, text: `${sos.overdue} phiếu SOS quá hạn phản hồi` });
  if (sos.critical > 0) items.push({ level: 3, text: `${sos.critical} phiếu SOS cấp 1 chưa xong` });
  const rs = k?.reservoirs || {};
  if (rs.emergency_count > 0) items.push({ level: 3, text: `${rs.emergency_count} hồ xả khẩn cấp` });
  const ls = k?.landslides || {};
  if (ls.blocked_count > 0) items.push({ level: 3, text: `${ls.blocked_count} điểm sạt lở cấm đường` });
  const rainLv = rainLevel(k?.rain?.max_24h);
  if (rainLv >= 1) {
    const at = k.rain.max_station ? ` tại ${k.rain.max_station.replace(/^Trạm đo mưa\s+/i, '')}` : '';
    items.push({ level: rainLv, text: `${rainLv >= 2 ? 'Mưa rất to' : 'Mưa to'} ${num(k.rain.max_24h, 1)} mm/24 giờ${at}` });
  }
  if (ls.warning_count > 0) items.push({ level: 2, text: `${ls.warning_count} điểm sạt lở cảnh báo` });
  const spilling = (rs.spill_count || 0) - (rs.emergency_count || 0);
  if (spilling > 0) items.push({ level: 2, text: `${spilling} hồ đang xả điều tiết` });
  return items.sort((a, b) => b.level - a.level);
}

/**
 * Dải tình huống đầu Dashboard — thông tin khẩn luôn ở trên cùng, mỗi tình huống một chip. Mức Cam / Đỏ: dải màu DÍNH trên
 * cùng khi cuộn; điện thoại hiện chip nặng nhất, máy tính 3 chip đầu, còn lại "+N" (bấm để mở hết). Mức Vàng: khung vàng.
 * Không có tình huống: nói "chưa ghi nhận" kèm độ phủ số đo — không nói "an toàn"; chưa có số đo: khung xám chỉ chỗ
 * nhập (chỉ link tới trang tài khoản được mở). Lỗi tải danh sách trạm: nói không tải được, không nói "chưa có trạm".
 * `presentation` (chế độ trình chiếu màn hình lớn): hiện đủ mọi tình huống, ẩn nút thao tác — màn hình chỉ để xem.
 * `quiet` (Tổng quan): chỉ hiện dải khi có tình huống — "chưa có số liệu" / "chưa ghi nhận" nằm trong câu tóm tắt.
 * `compact` (đầu trang Bản đồ): một dải mỏng sát mép, không dính / không lề âm (trang không cuộn); trạng thái "chưa ghi
 * nhận tình huống" chỉ hiện từ máy tính bảng trở lên — điện thoại dành chỗ cho bản đồ.
 */
export default function SituationBar({
  k, waterStations, stationsError, rainKnown, canSos, canImportStations, canSystem, presentation = false,
  compact = false, quiet = false,
}) {
  const [opened, setExpanded] = useState(false);
  const expanded = opened || presentation;
  const items = situationItems(k, waterStations);
  const worst = items[0]?.level || 0;
  const fresh = waterStations.filter((s) => {
    const st = riverState(s);
    return !st.noData && !st.stale;
  }).length;
  const hasData = fresh > 0 || rainKnown;
  const noDataNote = stationsError ? 'không tải được danh sách trạm' : !hasData && 'chưa có số đo trạm mực nước / đo mưa';
  const sos = k?.sos || {};

  // Mỗi tình huống một chip, chấm màu theo ĐÚNG mức của tình huống đó (dải tô theo mức nặng nhất). Hiện sẵn: điện thoại
  // 1 chip, máy tính 3 chip — phần còn lại mở bằng "+N" (đọc trong vài giây thay vì một câu dài nối bằng "·")
  const chipVis = (i) => (expanded || i === 0 ? '' : i < 3 ? 'hidden sm:inline-flex' : 'hidden');
  const dot = (lv, ring) => <span className={clsx('h-2 w-2 shrink-0 rounded-full ring-1', risk(lv).fill, ring)} aria-hidden="true" />;

  if (worst >= 2) {
    const scale = risk(worst);
    const onRed = worst === 3; // đỏ: chữ trắng; cam: chữ đen (tương phản ≥ 4,5 : 1)
    // Chữ 13 px ở Tổng quan; dải gọn của Bản đồ giữ 12 px — điện thoại không đủ chỗ, chip xuống dòng làm bản đồ thấp đi
    const size = compact ? 'text-xs' : 'text-[13px]';
    const chip = clsx('max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 font-semibold', size, onRed ? 'border-white/35' : 'border-black/20');
    const ring = onRed ? 'ring-white/80' : 'ring-black/40';
    const toggle = clsx('items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-2.5 font-bold', onRed ? 'border-white/40' : 'border-black/25');
    const extraPhone = items.length - 1;
    const extraDesk = items.length - 3;
    const sosLink = canSos && (sos.overdue > 0 || sos.waiting > 0);
    return (
      <div
        className={clsx(
          // Điện thoại: chip một hàng riêng (đủ rộng), nút xuống hàng dưới; máy tính: chip + nút cùng một hàng
          compact
            ? 'flex flex-col gap-1.5 px-3 py-1.5 text-xs shadow-md sm:flex-row sm:items-center sm:justify-between sm:px-4'
            : clsx('sticky top-0 z-30 mb-1 flex flex-col gap-2 py-1.5 text-xs shadow-lg sm:flex-row sm:items-center sm:justify-between sm:py-2 print:static', EDGE, EDGE_PAD),
          scale.chip,
        )}
        role="status"
        aria-live="polite"
        title={NOTE}
      >
        <div className="flex min-w-0 items-start gap-2 sm:flex-1 sm:items-center">
          <Siren size={16} className="mt-0.5 shrink-0 sm:mt-0" aria-hidden="true" />
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 leading-snug">
            <b className={clsx('whitespace-nowrap font-bold', size)}>
              {onRed ? 'Khẩn cấp:' : 'Cần chú ý:'}
            </b>
            {items.map((it, i) => (
              <span key={it.text} className={clsx('inline-flex', chip, chipVis(i))}>
                {dot(it.level, ring)}
                {it.text}
              </span>
            ))}
            {noDataNote && <span className={clsx('opacity-80', !expanded && 'hidden sm:inline')}>{noDataNote}</span>}
            {extraDesk > 0 && !presentation && (
              <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className={clsx('hidden min-h-[28px] sm:inline-flex [@media(pointer:coarse)]:min-h-[44px]', toggle)}>
                {expanded ? 'Thu gọn' : `+${extraDesk}`}
                <ChevronDown size={13} className={clsx('transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        {/* Điện thoại không có nút nào (chỉ "Báo cáo nhanh" — nằm ở thanh dưới cùng) → ẩn hàng, không để khoảng trống */}
        <div
          className={clsx(
            'flex flex-wrap items-center gap-2 no-print sm:ml-auto sm:shrink-0 [&>*]:flex-1 sm:[&>*]:flex-none',
            // Tổng quan (`quiet`): điện thoại bỏ hàng nút — câu tóm tắt ngay dưới đã nói đủ các tình huống, "Việc chờ quyết
            // định" có nút điều động; dành chỗ để 6 ô chỉ số vẫn thấy trọn không cần cuộn
            ((extraPhone <= 0 && !sosLink) || quiet) && 'hidden sm:flex',
            presentation && '!hidden',
          )}
        >
          {extraPhone > 0 && (
            <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className={clsx('flex min-h-[40px] sm:hidden [@media(pointer:coarse)]:min-h-[44px]', toggle)}>
              {expanded ? 'Thu gọn' : `+${extraPhone} tình huống`}
              <ChevronDown size={13} className={clsx('transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
            </button>
          )}
          {sosLink && (
            <Link
              to="/cuu-ho"
              className={clsx(
                // Màn cảm ứng: 44 px (! để thắng sm:min-h-[36px] khi cả hai cùng khớp — iPad)
                'flex min-h-[40px] items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-2.5 font-bold sm:min-h-[36px] [@media(pointer:coarse)]:!min-h-[44px]', size,
                onRed ? 'border-white/40 bg-white/15 hover:bg-white/25' : 'border-black/25 bg-black/10 hover:bg-black/15',
              )}
              title="Mở Điều hành cứu hộ để điều động cho các phiếu SOS"
            >
              Điều động {sos.overdue > 0 ? `${sos.overdue} phiếu quá hạn` : `${sos.waiting} phiếu chờ`} →
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (worst === 1) {
    return (
      <div
        className={clsx(compact ? 'flex items-start gap-2 border-b px-3 py-1.5 text-xs text-ink' : 'card flex items-start gap-2 px-3 py-2 text-xs text-ink', risk(1).soft)}
        role="status"
        title={NOTE}
      >
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 leading-snug">
          <b className="text-warn">Theo dõi:</b>
          {items.map((it) => (
            <span key={it.text} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-panel px-2 py-0.5 font-semibold">
              {dot(it.level, 'ring-black/30')}
              {it.text}
            </span>
          ))}
          {noDataNote && <span className="text-muted">{noDataNote}</span>}
        </div>
      </div>
    );
  }

  // `quiet` (Tổng quan): trạng thái chưa có số liệu / chưa ghi nhận đã nói trong câu tóm tắt (SituationSummary)
  if (quiet) return null;

  if (!hasData || stationsError) {
    // Link chỉ tới trang tài khoản mở được: nhập danh mục trạm (quyền data.import — cấp tỉnh), xem kết nối (integration.view)
    const link = canImportStations
      ? { to: '/nhap-du-lieu', text: 'Nhập danh mục trạm →' }
      : canSystem ? { to: '/nguon-du-lieu', text: 'Xem nguồn dữ liệu →' } : null;
    return (
      <div
        className={clsx(
          'flex flex-wrap items-center gap-2 border-dashed text-xs text-muted',
          compact ? 'border-b border-line px-3 py-1.5' : 'card px-3 py-2',
        )}
        role="status"
      >
        <DatabaseZap size={15} className="shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          {stationsError
            ? `Không tải được danh sách trạm quan trắc — chưa đánh giá được mực nước.${compact ? '' : ' Bấm "Làm mới" để thử lại.'}`
            : 'Chưa có số đo trạm mực nước / đo mưa trong vùng đang xem — chưa đánh giá được tình hình mưa, lũ.'}
          {!stationsError && !link && ' Báo cấp tỉnh kiểm tra danh mục trạm.'}
        </span>
        {!stationsError && link && (
          <Link to={link.to} className="font-semibold text-accent hover:underline">{link.text}</Link>
        )}
      </div>
    );
  }

  return (
    <div
      className={clsx('items-start gap-2 text-xs text-ink-2', compact ? 'hidden border-b border-line px-3 py-1.5 sm:flex' : 'card flex px-3 py-2')}
      role="status"
      title={NOTE}
    >
      <Info size={15} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
      <span>
        Chưa ghi nhận trạm vượt báo động, SOS quá hạn, sạt lở cấm đường, hồ xả hay mưa ≥ 50 mm/24 giờ trong vùng đang xem
        {waterStations.length > 0 && ` · ${fresh}/${waterStations.length} trạm mực nước có số đo trong 60 phút qua`}.
      </span>
    </div>
  );
}

const lower = (t) => t.charAt(0).toLowerCase() + t.slice(1);

/**
 * MỘT câu tóm tắt tình hình bằng lời (thiết kế A — trả lời "đang có chuyện gì" trong 5 giây), ghép từ số liệu thật của
 * KPI + trạm mực nước: "2 trạm ở Báo động II, 12 phiếu SOS chờ (3 quá hạn), 2 hồ đang xả lũ." Không có tình huống
 * → "chưa ghi nhận …" kèm độ phủ số đo; chưa có số đo → "chưa có số liệu …, chưa đánh giá được" — KHÔNG BAO GIỜ "an toàn".
 * → { level (mức nặng nhất, null = chưa có số liệu), text, noData }
 */
export function situationSentence(k, waterStations, { stationsError = false } = {}) {
  const parts = [];
  const rows = waterStations.map((s) => riverState(s));
  const fresh = rows.filter((st) => !st.noData && !st.stale).length;
  const above = rows.filter((st) => st.level >= 1);
  if (above.length) {
    const top = Math.max(...above.map((st) => st.level));
    const same = above.every((st) => st.level === top);
    parts.push({ level: top, text: same ? `${above.length} trạm ở Báo động ${ROMAN[top]}` : `${above.length} trạm vượt báo động (cao nhất Báo động ${ROMAN[top]})` });
  }
  const sos = k?.sos || {};
  if (sos.waiting > 0) {
    const late = sos.overdue > 0 ? `${sos.overdue} quá hạn` : sos.no_team_15m > 0 ? `${sos.no_team_15m} chờ quá 15 phút` : '';
    parts.push({ level: late ? 3 : 1, text: `${sos.waiting} phiếu SOS chờ${late ? ` (${late})` : ''}` });
  }
  const rs = k?.reservoirs || {};
  if (rs.spill_count > 0) {
    parts.push({ level: rs.emergency_count ? 3 : 2, text: `${rs.spill_count} hồ đang xả lũ${rs.emergency_count ? ` (${rs.emergency_count} xả khẩn cấp)` : ''}` });
  }
  const ls = k?.landslides || {};
  if (ls.blocked_count > 0) parts.push({ level: 3, text: `${ls.blocked_count} điểm sạt lở cấm đường` });
  else if (ls.warning_count > 0) parts.push({ level: 2, text: `${ls.warning_count} điểm sạt lở cần cảnh báo` });
  const rainLv = rainLevel(k?.rain?.max_24h);
  if (rainLv >= 1) parts.push({ level: rainLv, text: `mưa lớn nhất ${num(k.rain.max_24h, 0)} mm/24 giờ` });
  const rainKnown = k?.rain?.avg_24h != null;
  const noData = stationsError || (!fresh && !rainKnown);
  const gap = stationsError ? 'chưa tải được danh sách trạm quan trắc' : 'chưa có số đo mực nước, lượng mưa trong vùng đang xem';
  if (parts.length) {
    const text = parts.map((p, i) => (i ? lower(p.text) : p.text.charAt(0).toUpperCase() + p.text.slice(1))).join(', ');
    return { level: Math.max(...parts.map((p) => p.level)), text: `${text}${noData ? ` (${gap})` : ''}.`, noData };
  }
  if (noData) return { level: null, text: `${gap.charAt(0).toUpperCase()}${gap.slice(1)} — chưa đánh giá được tình hình mưa, lũ.`, noData };
  return {
    level: 0,
    text: `Chưa ghi nhận trạm vượt báo động, phiếu SOS chờ, hồ xả lũ hay sạt lở cấm đường trong vùng đang xem${waterStations.length ? ` · ${fresh}/${waterStations.length} trạm mực nước có số đo trong 60 phút qua` : ''}.`,
    noData,
  };
}
