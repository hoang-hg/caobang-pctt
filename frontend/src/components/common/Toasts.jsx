import clsx from 'clsx';
import { AlertTriangle, Info, Siren } from 'lucide-react';
import { useStore } from '../../app/store';

const TONE = {
  danger: { cls: 'border-danger/60', icon: Siren, color: 'text-danger' },
  warn: { cls: 'border-warn/60', icon: AlertTriangle, color: 'text-warn' },
  info: { cls: 'border-accent/60', icon: Info, color: 'text-accent' },
  good: { cls: 'border-good/60', icon: Info, color: 'text-good' },
};

export default function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="no-print pointer-events-none fixed bottom-4 right-4 z-[2000] flex w-80 flex-col gap-2">
      {toasts.map((t) => {
        const tone = TONE[t.tone] || TONE.info;
        const Icon = tone.icon;
        return (
          <div key={t.id} className={clsx('pointer-events-auto card flex gap-3 border-l-4 p-3 shadow-lg', tone.cls)}>
            <Icon size={18} className={clsx('mt-0.5 shrink-0', tone.color)} />
            <div className="min-w-0">
              <div className="text-sm font-semibold">{t.title}</div>
              {t.body && <div className="text-xs text-ink-2">{t.body}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
