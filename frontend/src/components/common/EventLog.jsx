import clsx from 'clsx';
import { Activity, AlertTriangle, LifeBuoy, MessageCircle, Settings2, Siren } from 'lucide-react';
import { useAreaQuery } from '../../api/hooks';
import { time } from '../../utils/format';

const CAT = {
  van_hanh: { icon: Settings2, label: 'Vận hành' },
  cuu_ho: { icon: LifeBuoy, label: 'Cứu hộ' },
  canh_bao: { icon: AlertTriangle, label: 'Cảnh báo' },
  nguoi_dan: { icon: MessageCircle, label: 'Người dân' },
  he_thong: { icon: Activity, label: 'Hệ thống' },
};
const SEV = { danger: 'border-l-danger', warning: 'border-l-warn', info: 'border-l-accent/50' };

/** Nhật ký sự kiện & luồng cảnh báo (ticker cập nhật realtime qua WebSocket). */
export default function EventLog({ limit = 40, className }) {
  const { data = [] } = useAreaQuery('logs', '/dashboard/logs', { limit });
  return (
    <ul className={clsx('flex flex-col gap-1.5 overflow-y-auto pr-1 scroll-thin', className)} aria-live="polite">
      {data.map((l) => {
        const cat = CAT[l.category] || CAT.he_thong;
        const Icon = l.severity === 'danger' ? Siren : cat.icon;
        return (
          <li key={l.id} className={clsx('rounded-md border-l-4 bg-panel2/60 px-2.5 py-1.5', SEV[l.severity])}>
            <div className="flex items-center gap-1.5 text-[11px] text-muted">
              <Icon size={12} className={l.severity === 'danger' ? 'text-danger' : ''} />
              <span className="font-mono">{time(l.time)}</span>
              <span>· {cat.label}</span>
            </div>
            <div className="text-[13px] leading-snug">{l.message}</div>
          </li>
        );
      })}
    </ul>
  );
}
