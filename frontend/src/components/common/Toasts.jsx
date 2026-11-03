import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { AlertTriangle, Info, Siren, X } from 'lucide-react';
import { useStore } from '../../app/store';

const TONE = {
  danger: { cls: 'border-danger/60', icon: Siren, color: 'text-danger', dot: 'bg-danger' },
  warn: { cls: 'border-warn/60', icon: AlertTriangle, color: 'text-warn', dot: 'bg-warn' },
  info: { cls: 'border-accent/60', icon: Info, color: 'text-accent', dot: 'bg-accent' },
  good: { cls: 'border-good/60', icon: Info, color: 'text-good', dot: 'bg-good' },
};

/**
 * Thông báo nổi. Thường: góc phải dưới, tự tắt. `placement: 'top'` (bản vẽ desktop khung M1 — "SOS mới" khi đang ở trang
 * khác): thẻ nổi góc phải trên, ngay dưới thanh trên cùng, có nút đóng; `actions` = [{ label, to?, primary? }] — bấm một nút
 * là đóng thẻ (nút không có `to` chỉ đóng, VD "Để sau").
 */
export default function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
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
          {t.actions?.length > 0 && (
            <div className="mt-3 flex gap-2">
              {t.actions.map((a) => (a.to ? (
                <Link key={a.label} to={a.to} onClick={() => dismiss(t.id)} className={clsx('tap inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold', a.primary ? 'bg-accent text-white hover:brightness-110' : 'border border-line bg-panel text-ink hover:bg-panel2')}>
                  {a.label}
                </Link>
              ) : (
                <button key={a.label} type="button" onClick={() => dismiss(t.id)} className="tap inline-flex h-10 items-center rounded-xl border border-line bg-panel px-4 text-sm text-ink hover:bg-panel2">
                  {a.label}
                </button>
              )))}
            </div>
          )}
        </div>
        {top && (
          <button type="button" onClick={() => dismiss(t.id)} className="tap-sq -mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-panel2 hover:text-ink" aria-label="Đóng thông báo">
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    );
  };
  const tops = toasts.filter((t) => t.placement === 'top');
  const rest = toasts.filter((t) => t.placement !== 'top');
  return (
    <>
      {tops.length > 0 && (
        <div className="no-print pointer-events-none fixed right-3 top-16 z-[2000] flex w-[min(26rem,calc(100vw-1.5rem))] flex-col gap-2 lg:right-5 lg:top-[84px]">
          {tops.map(card)}
        </div>
      )}
      <div className="no-print pointer-events-none fixed bottom-4 right-4 z-[2000] flex w-80 flex-col gap-2">
        {rest.map(card)}
      </div>
    </>
  );
}
