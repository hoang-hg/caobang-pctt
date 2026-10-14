import { useState } from 'react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronDown, DatabaseZap, RefreshCw, Siren } from 'lucide-react';
import { risk, STOCK_LOW } from '../../utils/risk';

/**
 * Dải thông tin khẩn đầu trang Vật tư & Lực lượng — luôn ở trên cùng (thiết kế C, cùng kiểu dải tình huống của Tổng quan).
 * Mỗi mục là một nút: chạm → mở thẻ + bộ lọc tương ứng (`onGo`). Mức Cam / Đỏ: dải màu DÍNH trên cùng khi cuộn; điện thoại
 * một hàng (mục nặng nhất + "+N"), máy tính 3 mục. `sos` (chỉ tài khoản xem được phiếu SOS): phiếu quá hạn tính là mức Đỏ,
 * nút "Xử lý … SOS" mở Điều hành cứu hộ — nhu cầu cứu hộ đặt cạnh nguồn lực. Không có mục nào: nói "chưa ghi nhận" (không nói
 * "an toàn"); danh sách chưa tải được: nói chưa kiểm tra được phần nào, có nút Thử lại.
 */
export default function ResourceAlerts({ items, sos, failed = [], onRetry, loading, known, onGo }) {
  const [opened, setOpened] = useState(false);
  const overdue = sos?.overdue > 0;
  const worst = Math.max(items[0]?.level ?? -1, overdue ? 3 : -1);
  const sosLink = sos && (overdue || sos.waiting > 0);
  const failNote = failed.length > 0 && (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      Chưa kiểm tra được {failed.join(', ')}
      {onRetry && (
        <button type="button" onClick={onRetry} className="tap inline-flex min-h-[28px] items-center gap-1 rounded-md border border-current px-2 font-semibold">
          <RefreshCw size={12} aria-hidden="true" /> Thử lại
        </button>
      )}
    </span>
  );
  const sosLabel = sos && `Xử lý ${overdue ? `${sos.overdue} SOS quá hạn` : `${sos.waiting} SOS chờ`} →`;

  if (worst >= 2) {
    const onRed = worst === 3; // đỏ: chữ trắng; cam: chữ đen (tương phản ≥ 4,5 : 1)
    const chipCls = clsx(
      'tap min-w-0 max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-left font-semibold active:scale-[0.98]',
      onRed ? 'border-white/40 bg-white/10 hover:bg-white/20' : 'border-black/25 bg-black/5 hover:bg-black/10',
    );
    const ring = onRed ? 'ring-white/80' : 'ring-black/40';
    const btn = clsx(
      'tap flex min-h-[36px] shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-2.5 font-bold active:scale-95',
      onRed ? 'border-white/40 hover:bg-white/15' : 'border-black/25 hover:bg-black/10',
    );
    const vis = (i) => (opened || i === 0 ? 'flex sm:inline-flex' : i < 3 ? 'hidden sm:inline-flex' : 'hidden');
    const extraPhone = items.length - 1;
    const extraDesk = items.length - 3;
    // Một hàng ở mọi khổ (điện thoại: nhãn ngắn, "+N", nút SOS gọn) — dải dính trên cùng không chiếm quá 1 hàng nút
    return (
      <div
        className={clsx(
          'sticky top-0 z-30 -mx-3 -mt-3 flex items-center gap-2 px-3 py-1.5 text-xs shadow-lg sm:justify-between sm:py-2 print:static',
          risk(worst).chip,
        )}
        role="status"
        aria-live="polite"
        aria-label="Thông tin khẩn về nguồn lực"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Siren size={16} className={clsx('shrink-0', onRed && 'motion-safe:animate-pulse')} aria-hidden="true" />
          <div className={clsx('flex min-w-0 flex-1 items-center gap-1.5 leading-snug', opened ? 'flex-wrap' : 'max-sm:flex-nowrap sm:flex-wrap')}>
            <b className={clsx('hidden whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider sm:inline', onRed ? 'bg-white/20' : 'bg-black/10')}>
              {onRed ? 'Khẩn cấp' : 'Cần chú ý'}
            </b>
            {items.map((it, i) => (
              <button key={it.key} type="button" onClick={() => onGo(it)} className={clsx(chipCls, vis(i))} title={`${it.text} — mở danh sách đã lọc`}>
                <span className={clsx('h-2 w-2 shrink-0 rounded-full ring-1', risk(it.level).fill, ring)} aria-hidden="true" />
                <span className={clsx('min-w-0 sm:hidden', opened ? 'whitespace-normal' : 'truncate')}>{it.short || it.text}</span>
                <span className="hidden min-w-0 sm:inline">
                  {it.text}
                  {it.detail && <span className="hidden font-normal opacity-90 lg:inline"> — {it.detail}</span>}
                </span>
              </button>
            ))}
            {/* Không thiếu hụt nguồn lực nhưng có phiếu SOS quá hạn: nói thẳng trên dải (nút xử lý bên cạnh) */}
            {!items.length && overdue && <span className="font-semibold">{sos.overdue} phiếu SOS quá hạn phản hồi</span>}
            {failNote && <span className={clsx('opacity-90', !opened && 'hidden sm:inline-flex')}>{failNote}</span>}
            {extraPhone > 0 && (
              <button type="button" onClick={() => setOpened((v) => !v)} aria-expanded={opened} aria-label={opened ? 'Thu gọn' : `Xem thêm ${extraPhone} mục`} className={clsx(btn, 'sm:hidden')}>
                {opened ? 'Thu gọn' : `+${extraPhone}`}
                <ChevronDown size={13} className={clsx('transition-transform', opened && 'rotate-180')} aria-hidden="true" />
              </button>
            )}
            {extraDesk > 0 && (
              <button type="button" onClick={() => setOpened((v) => !v)} aria-expanded={opened} className={clsx(btn, 'hidden sm:flex')}>
                {opened ? 'Thu gọn' : `+${extraDesk}`}
                <ChevronDown size={13} className={clsx('transition-transform', opened && 'rotate-180')} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        {sosLink && (
          <Link
            to="/cuu-ho"
            className={clsx(btn, 'no-print', onRed ? 'bg-white/15' : 'bg-black/10')}
            title="Mở Điều hành cứu hộ để điều động lực lượng cho phiếu SOS"
            aria-label={sosLabel}
          >
            <Siren size={13} aria-hidden="true" />
            <span className="sm:hidden">{overdue ? sos.overdue : sos.waiting} SOS</span>
            <span className="hidden sm:inline">{sosLabel}</span>
          </Link>
        )}
      </div>
    );
  }

  if (worst === 1) {
    return (
      <div className={clsx('card flex flex-wrap items-center gap-2 px-3 py-2 text-xs text-ink', risk(1).soft)} role="status" aria-label="Thông tin khẩn về nguồn lực">
        <AlertTriangle size={15} className="shrink-0 text-warn" aria-hidden="true" />
        <b className="text-warn">Theo dõi:</b>
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            onClick={() => onGo(it)}
            className="tap inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 py-1 text-left font-semibold hover:border-warn"
          >
            <span className={clsx('h-2 w-2 shrink-0 rounded-full ring-1 ring-black/30', risk(it.level).fill)} aria-hidden="true" />
            {it.text}
          </button>
        ))}
        {sosLink && (
          <Link to="/cuu-ho" className="tap inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-line px-2.5 font-semibold text-accent hover:bg-panel2">
            <Siren size={13} aria-hidden="true" /> {sosLabel}
          </Link>
        )}
        {failNote && <span className="text-muted">{failNote}</span>}
      </div>
    );
  }

  if (loading) return null; // chưa tải xong: không vội nói "chưa ghi nhận"

  // Chỉ nói "không thiếu" về phần CÓ dữ liệu — vùng chưa có kho / phương tiện thì nói chưa đánh giá được (Xám)
  const checked = [
    known?.warehouses > 0 && `không kho nào có hàng dưới ${STOCK_LOW}% định mức`,
    known?.vehicles > 0 && `không phương tiện nào báo dưới ${STOCK_LOW}% nhiên liệu`,
  ].filter(Boolean);
  const gray = failed.length > 0 || !checked.length;
  return (
    <div
      className={clsx('flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs', gray ? 'border-dashed border-line text-muted' : 'border-line bg-panel text-ink-2')}
      role="status"
      aria-label="Thông tin khẩn về nguồn lực"
    >
      {gray
        ? <DatabaseZap size={15} className="shrink-0" aria-hidden="true" />
        : <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', risk(0).fill)} aria-hidden="true" />}
      <span className="min-w-0 flex-1">
        {failed.length
          ? failNote
          : checked.length
            ? `Chưa ghi nhận thiếu hụt: ${checked.join(', ')}`
            : 'Chưa có kho, phương tiện trong vùng đang xem — chưa đánh giá được thiếu hụt vật tư, nhiên liệu'}
      </span>
      {sosLink && (
        <Link to="/cuu-ho" className="tap inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-line px-2.5 font-semibold text-accent hover:bg-panel2">
          <Siren size={13} aria-hidden="true" /> {sosLabel}
        </Link>
      )}
    </div>
  );
}
