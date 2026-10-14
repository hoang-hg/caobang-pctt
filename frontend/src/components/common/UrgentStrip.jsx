import { useState } from 'react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronDown, DatabaseZap, RefreshCw, Siren } from 'lucide-react';
import { risk } from '../../utils/risk';

/**
 * Dải thông tin khẩn đầu trang — dùng chung (Vật tư & Lực lượng, Điều hành cứu hộ…), cùng kiểu dải tình huống của Tổng
 * quan: luôn ở trên cùng; mức Cam / Đỏ là dải màu DÍNH trên cùng khi cuộn, điện thoại gọn 1 hàng (mục nặng nhất với nhãn
 * ngắn + "+N"), máy tính 3 mục; mức Vàng là khung vàng.
 * - `items`: [{ key, level 0–3, text, short (nhãn ngắn trên điện thoại), detail (thêm từ 1024 px), onClick | to }] — nơi gọi
 *   xếp nặng → nhẹ; mỗi mục là nút / liên kết mở đúng danh sách đã lọc.
 * - `action`: { to, label, short, title, level, note } — nút bên phải (VD "Xử lý 3 SOS quá hạn →"); `level` tính vào màu dải;
 *   không có mục nào mà `action.level` ≥ Cam thì `note` hiện trên dải.
 * - Không có mục nào: `calm` (chấm xanh — chỉ nói "chưa ghi nhận" về phần CÓ dữ liệu, không nói "an toàn") hoặc `gray`
 *   (chưa đánh giá được — viền nét đứt). `failed` (tên phần chưa tải được) + `onRetry`. `loading`: chưa nói gì.
 * - `bleed`: lề âm để dải tràn sát mép vùng nội dung (theo khoảng đệm của trang).
 */
export default function UrgentStrip({ label, items, action, calm, gray, failed = [], onRetry, loading, bleed = '-mx-3 -mt-3' }) {
  const [opened, setOpened] = useState(false);
  const worst = Math.max(items[0]?.level ?? -1, action?.level ?? -1);
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
  const softAction = action && (
    <Link to={action.to} className="tap inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-line px-2.5 font-semibold text-accent hover:bg-panel2" title={action.title}>
      <Siren size={13} aria-hidden="true" /> {action.label}
    </Link>
  );

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
    return (
      <div
        className={clsx(
          'sticky top-0 z-30 flex items-center gap-2 px-3 py-1.5 text-xs shadow-lg sm:justify-between sm:py-2 print:static',
          bleed,
          risk(worst).chip,
        )}
        role="status"
        aria-live="polite"
        aria-label={label}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Siren size={16} className={clsx('shrink-0', onRed && 'motion-safe:animate-pulse')} aria-hidden="true" />
          <div className={clsx('flex min-w-0 flex-1 items-center gap-1.5 leading-snug', opened ? 'flex-wrap' : 'max-sm:flex-nowrap sm:flex-wrap')}>
            <b className={clsx('hidden whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider sm:inline', onRed ? 'bg-white/20' : 'bg-black/10')}>
              {onRed ? 'Khẩn cấp' : 'Cần chú ý'}
            </b>
            {items.map((it, i) => {
              const inner = (
                <>
                  <span className={clsx('h-2 w-2 shrink-0 rounded-full ring-1', risk(it.level).fill, ring)} aria-hidden="true" />
                  <span className={clsx('min-w-0 sm:hidden', opened ? 'whitespace-normal' : 'truncate')}>{it.short || it.text}</span>
                  <span className="hidden min-w-0 sm:inline">
                    {it.text}
                    {it.detail && <span className="hidden font-normal opacity-90 lg:inline"> — {it.detail}</span>}
                  </span>
                </>
              );
              return it.to ? (
                <Link key={it.key} to={it.to} className={clsx(chipCls, vis(i))} title={`${it.text} — mở danh sách`}>{inner}</Link>
              ) : (
                <button key={it.key} type="button" onClick={it.onClick} className={clsx(chipCls, vis(i))} title={`${it.text} — mở danh sách đã lọc`}>{inner}</button>
              );
            })}
            {/* Không có mục nào nhưng nút hành động mang mức khẩn (VD phiếu SOS quá hạn): nói thẳng trên dải */}
            {!items.length && action?.note && <span className="font-semibold">{action.note}</span>}
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
        {action && (
          <Link to={action.to} className={clsx(btn, 'no-print', onRed ? 'bg-white/15' : 'bg-black/10')} title={action.title} aria-label={action.label}>
            <Siren size={13} aria-hidden="true" />
            <span className="sm:hidden">{action.short || action.label}</span>
            <span className="hidden sm:inline">{action.label}</span>
          </Link>
        )}
      </div>
    );
  }

  if (worst === 1) {
    return (
      <div className={clsx('card flex flex-wrap items-center gap-2 px-3 py-2 text-xs text-ink', risk(1).soft)} role="status" aria-label={label}>
        <AlertTriangle size={15} className="shrink-0 text-warn" aria-hidden="true" />
        <b className="text-warn">Theo dõi:</b>
        {items.map((it) => {
          const cls = 'tap inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 py-1 text-left font-semibold hover:border-warn';
          const inner = (
            <>
              <span className={clsx('h-2 w-2 shrink-0 rounded-full ring-1 ring-black/30', risk(it.level).fill)} aria-hidden="true" />
              {it.text}
            </>
          );
          return it.to
            ? <Link key={it.key} to={it.to} className={cls}>{inner}</Link>
            : <button key={it.key} type="button" onClick={it.onClick} className={cls}>{inner}</button>;
        })}
        {softAction}
        {failNote && <span className="text-muted">{failNote}</span>}
      </div>
    );
  }

  if (loading) return null; // chưa tải xong: không vội nói "chưa ghi nhận"

  const grayState = failed.length > 0 || !calm;
  return (
    <div
      className={clsx('flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs', grayState ? 'border-dashed border-line text-muted' : 'border-line bg-panel text-ink-2')}
      role="status"
      aria-label={label}
    >
      {grayState
        ? <DatabaseZap size={15} className="shrink-0" aria-hidden="true" />
        : <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', risk(0).fill)} aria-hidden="true" />}
      <span className="min-w-0 flex-1">{failed.length ? failNote : calm || gray}</span>
      {softAction}
    </div>
  );
}
