import { useState } from 'react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronDown, DatabaseZap, Info, ShieldAlert, Siren } from 'lucide-react';
import { num } from '../../utils/format';
import { rainLevel, risk } from '../../utils/risk';
import { riverState, ROMAN } from './RiverKpi';

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
      items.push({ level: st.level, text: `${where} trên BĐ ${ROMAN[st.level]} (${num(st.value, 2)} m${st.stale ? ', số đo cũ' : ''})` });
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
    items.push({ level: rainLv, text: `${rainLv >= 2 ? 'Mưa rất to' : 'Mưa to'} ${num(k.rain.max_24h, 1)} mm/24h${at}` });
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
 */
export default function SituationBar({
  k, waterStations, stationsError, rainKnown, canReport, onReport, canSos, canImportStations, canSystem, presentation = false,
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
    const chip = clsx('max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 font-semibold', onRed ? 'border-white/35 bg-white/10' : 'border-black/20 bg-black/5');
    const ring = onRed ? 'ring-white/80' : 'ring-black/40';
    const toggle = clsx('items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-2.5 font-bold', onRed ? 'border-white/40' : 'border-black/25');
    const extraPhone = items.length - 1;
    const extraDesk = items.length - 3;
    const sosLink = canSos && (sos.overdue > 0 || sos.waiting > 0);
    return (
      <div
        className={clsx(
          // Điện thoại: chip một hàng riêng (đủ rộng), nút xuống hàng dưới; máy tính: chip + nút cùng một hàng
          'sticky top-0 z-30 -mx-3.5 -mt-3.5 mb-1 flex flex-col gap-2 px-3.5 py-1.5 text-xs shadow-lg sm:-mx-5 sm:-mt-5 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-2 print:static',
          scale.chip,
        )}
        role="status"
        aria-live="polite"
        title={NOTE}
      >
        <div className="flex min-w-0 items-start gap-2 sm:flex-1 sm:items-center">
          <Siren size={16} className={clsx('mt-0.5 shrink-0 sm:mt-0', onRed && 'motion-safe:animate-pulse')} aria-hidden="true" />
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 leading-snug">
            <b className={clsx('whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider', onRed ? 'bg-white/20' : 'bg-black/10')}>
              {onRed ? 'Khẩn cấp' : 'Cần chú ý'}
            </b>
            {items.map((it, i) => (
              <span key={it.text} className={clsx('inline-flex', chip, chipVis(i))}>
                {dot(it.level, ring)}
                {it.text}
              </span>
            ))}
            {noDataNote && <span className={clsx('opacity-80', !expanded && 'hidden sm:inline')}>{noDataNote}</span>}
            {extraDesk > 0 && !presentation && (
              <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className={clsx('hidden min-h-[28px] sm:inline-flex', toggle)}>
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
            extraPhone <= 0 && !sosLink && 'hidden sm:flex',
            presentation && '!hidden',
          )}
        >
          {extraPhone > 0 && (
            <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className={clsx('flex min-h-[40px] sm:hidden', toggle)}>
              {expanded ? 'Thu gọn' : `+${extraPhone} tình huống`}
              <ChevronDown size={13} className={clsx('transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
            </button>
          )}
          {sosLink && (
            <Link
              to="/cuu-ho"
              className={clsx(
                'flex min-h-[40px] items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-2.5 font-bold shadow-sm active:scale-95 sm:min-h-[36px]',
                onRed ? 'border-white/40 bg-white/15 hover:bg-white/25' : 'border-black/25 bg-black/10 hover:bg-black/15',
              )}
              title="Mở Điều hành cứu hộ để xử lý các phiếu SOS"
            >
              <Siren size={13} aria-hidden="true" />
              Xử lý {sos.overdue > 0 ? `${sos.overdue} SOS quá hạn` : `${sos.waiting} SOS chờ`} →
            </Link>
          )}
          {canReport && (
            // Điện thoại: "Báo SOS" đã ở thanh dưới cùng (ngón cái) — không lặp ở dải này
            <button
              type="button"
              onClick={onReport}
              className="hidden min-h-[36px] items-center gap-1 rounded-lg bg-white px-2.5 font-black text-[rgb(var(--danger))] shadow-sm active:scale-95 sm:flex"
            >
              <ShieldAlert size={13} aria-hidden="true" /> Báo cáo nhanh
            </button>
          )}
        </div>
      </div>
    );
  }

  if (worst === 1) {
    return (
      <div className={clsx('card flex items-start gap-2 px-3 py-2 text-xs text-ink', risk(1).soft)} role="status" title={NOTE}>
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

  if (!hasData || stationsError) {
    // Link chỉ tới trang tài khoản mở được: nhập danh mục trạm (quyền data.import — cấp tỉnh), xem kết nối (integration.view)
    const link = canImportStations
      ? { to: '/nhap-du-lieu', text: 'Nhập danh mục trạm →' }
      : canSystem ? { to: '/nguon-du-lieu', text: 'Xem nguồn dữ liệu →' } : null;
    return (
      <div className="card flex flex-wrap items-center gap-2 border-dashed px-3 py-2 text-xs text-muted" role="status">
        <DatabaseZap size={15} className="shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          {stationsError
            ? 'Không tải được danh sách trạm quan trắc — Dashboard chưa đánh giá được mực nước. Bấm "Làm mới" để thử lại.'
            : 'Chưa có số đo trạm mực nước / đo mưa trong vùng đang xem — Dashboard chưa đánh giá được tình hình mưa, lũ.'}
          {!stationsError && !link && ' Báo cấp tỉnh kiểm tra danh mục trạm.'}
        </span>
        {!stationsError && link && (
          <Link to={link.to} className="font-semibold text-accent hover:underline">{link.text}</Link>
        )}
      </div>
    );
  }

  return (
    <div className="card flex items-start gap-2 px-3 py-2 text-xs text-ink-2" role="status" title={NOTE}>
      <Info size={15} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
      <span>
        Chưa ghi nhận trạm vượt báo động, SOS quá hạn, sạt lở cấm đường, hồ xả hay mưa ≥ 50 mm/24h trong vùng đang xem
        {waterStations.length > 0 && ` · ${fresh}/${waterStations.length} trạm mực nước có số đo trong 60 phút qua`}.
      </span>
    </div>
  );
}
