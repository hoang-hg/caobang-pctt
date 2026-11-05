import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { AlertTriangle, Info, Siren, X } from 'lucide-react';
import { useStore } from '../../app/store';
import { useDialogRoom } from '../../utils/useDialogRoom';

const TONE = {
  danger: { cls: 'border-danger/60', icon: Siren, color: 'text-danger', dot: 'bg-danger' },
  warn: { cls: 'border-warn/60', icon: AlertTriangle, color: 'text-warn', dot: 'bg-warn' },
  info: { cls: 'border-accent/60', icon: Info, color: 'text-accent', dot: 'bg-accent' },
  good: { cls: 'border-good/60', icon: Info, color: 'text-good', dot: 'bg-good' },
};

/**
 * Thông báo nổi. Thường: góc phải dưới, tự tắt. `placement: 'top'` (bản vẽ desktop khung M1 — "SOS mới" khi đang ở trang
 * khác): thẻ nổi góc phải trên, ngay dưới thanh trên cùng, có nút đóng; `actions` = [{ label, to?, primary? }] — bấm một nút
 * là đóng thẻ (nút không có `to` chỉ đóng, VD "Để sau"). Đang mở hộp thoại: thẻ gọn lại thành một dải phía trên hộp, hoặc
 * đứng cạnh ngăn bên phải — vẫn thấy SOS, vẫn mở được phiếu, không che phần đang nhập.
 */
export default function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  const tops = toasts.filter((t) => t.placement === 'top');
  const rest = toasts.filter((t) => t.placement !== 'top');
  const room = useDialogRoom(tops.length > 0);

  const action = (t, a, small) => {
    const size = small ? 'h-8 rounded-lg px-3 text-[13px]' : 'h-10 rounded-xl px-4 text-sm';
    return a.to ? (
      <Link key={a.label} to={a.to} onClick={() => dismiss(t.id)} className={clsx('tap inline-flex shrink-0 items-center font-semibold', size, a.primary ? 'bg-accent text-white hover:brightness-110' : 'border border-line bg-panel text-ink hover:bg-panel2')}>
        {a.label}
      </Link>
    ) : (
      <button key={a.label} type="button" onClick={() => dismiss(t.id)} className={clsx('tap shrink-0 items-center border border-line bg-panel text-ink hover:bg-panel2', size, small ? 'hidden sm:inline-flex' : 'inline-flex')}>
        {a.label}
      </button>
    );
  };

  const closeBtn = (t) => (
    <button type="button" onClick={() => dismiss(t.id)} className="tap-sq -mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-panel2 hover:text-ink" aria-label="Đóng thông báo">
      <X size={16} aria-hidden="true" />
    </button>
  );

  const card = (t) => {
    const tone = TONE[t.tone] || TONE.info;
    const Icon = tone.icon;
    const top = t.placement === 'top';
    return (
      <div
        key={t.id}
        role={top ? 'alert' : undefined}
        className={clsx('pointer-events-auto card flex gap-3 shadow-lg', top ? 'rounded-[18px] border-line p-4 shadow-[0_10px_30px_rgb(15_23_42/0.18)]' : clsx('border-l-4 p-3', tone.cls))}
      >
        {top ? <span className={clsx('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', tone.dot)} aria-hidden="true" /> : <Icon size={18} className={clsx('mt-0.5 shrink-0', tone.color)} />}
        <div className="min-w-0 flex-1">
          <div className={clsx('font-semibold', top ? 'text-[15px]' : 'text-sm')}>{t.title}</div>
          {t.body && <div className={clsx('text-ink-2', top ? 'mt-0.5 text-sm' : 'text-xs')}>{t.body}</div>}
          {t.actions?.length > 0 && <div className="mt-3 flex gap-2">{t.actions.map((a) => action(t, a))}</div>}
        </div>
        {top && closeBtn(t)}
      </div>
    );
  };

  // Dải trên hộp thoại: chỉ đủ chỗ một thẻ — thẻ mới nhất, số thẻ còn lại ghi ở tiêu đề (đóng thẻ này thì thấy thẻ trước)
  const strip = (t, more) => (
    <div
      key={t.id}
      role="alert"
      title={t.body ? `${t.title} — ${t.body}` : t.title}
      className="pointer-events-auto card flex h-11 items-center gap-2.5 rounded-xl border-line py-0 pl-3 pr-1.5 shadow-[0_6px_20px_rgb(15_23_42/0.25)]"
    >
      <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', (TONE[t.tone] || TONE.info).dot)} aria-hidden="true" />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[13px] font-semibold text-ink">{t.title}{more > 0 && <span className="font-normal text-muted"> · còn {more} thẻ nữa</span>}</div>
        {t.body && <div className="truncate text-xs text-ink-2">{t.body}</div>}
      </div>
      {t.actions?.map((a) => action(t, a, true))}
      <button type="button" onClick={() => dismiss(t.id)} className="tap-sq flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-panel2 hover:text-ink" aria-label="Đóng thông báo">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <>
      {tops.length > 0 && (room?.strip ? (
        <div className="no-print pointer-events-none fixed right-3 top-0.5 z-[2000] w-[min(36rem,calc(100vw-1.5rem))] lg:right-5">
          {strip(tops[tops.length - 1], tops.length - 1)}
        </div>
      ) : (
        <div
          className="no-print pointer-events-none fixed right-3 top-16 z-[2000] flex w-[min(26rem,calc(100vw-1.5rem))] flex-col gap-2 lg:right-5 lg:top-[84px]"
          style={room?.right ? { right: room.right, width: room.width } : undefined}
        >
          {tops.map(card)}
        </div>
      ))}
      <div className="no-print pointer-events-none fixed bottom-4 right-4 z-[2000] flex w-80 flex-col gap-2">
        {rest.map(card)}
      </div>
    </>
  );
}
