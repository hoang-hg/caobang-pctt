import { useState } from 'react';
import clsx from 'clsx';
import { useAreaQuery } from '../../api/hooks';
import DispatchModal from '../common/DispatchModal';
import { EmptyState, ErrorState, Modal, Skeleton } from '../common/ui';
import { INCIDENT, PRIORITY } from '../../utils/labels';
import { ago, int } from '../../utils/format';

/**
 * "Điều động nhanh" từ một đơn vị (thiết kế C.1): chọn phiếu SOS đang chờ (cấp 1 và phiếu chờ lâu lên đầu — máy chủ đã xếp)
 * → mở lệnh điều động 2 bước có sẵn, đơn vị này chọn sẵn.
 */
export default function QuickDispatch({ force, onClose }) {
  const sosQ = useAreaQuery('sos', '/sos');
  const [ticket, setTicket] = useState(null);
  if (ticket) return <DispatchModal ticket={ticket} presetForceId={force.id} onClose={onClose} />;
  const open = (sosQ.data || []).filter((t) => t.status === 'moi' || t.status === 'dieu_phoi');
  return (
    <Modal open onClose={onClose} title={`Điều động nhanh – ${force.name}`}>
      <p className="mb-2 text-sm text-muted">
        <b className="text-ink">{int(force.personnel_ready)}</b> người sẵn sàng. Chọn phiếu SOS cần đến (cấp 1, phiếu chờ lâu lên đầu):
      </p>
      {sosQ.isLoading ? <Skeleton height={120} />
        : sosQ.isError && !sosQ.data ? <ErrorState onRetry={sosQ.refetch}>Không tải được danh sách phiếu SOS</ErrorState>
          : !open.length ? <EmptyState>Không có phiếu SOS đang chờ điều phối trong vùng đang xem</EmptyState>
            : (
              <ul className="flex flex-col gap-1.5">
                {open.map((t) => (
                  <li key={t.id}>
                    <button type="button" className="card tap flex w-full items-center gap-2 p-2 text-left hover:border-accent" onClick={() => setTicket(t)}>
                      <span className={clsx('chip shrink-0', PRIORITY[t.priority]?.cls || 'bg-panel2')}>{PRIORITY[t.priority]?.short || `Cấp ${t.priority}`}</span>
                      <span className="min-w-0 text-sm">
                        <b>{t.code}</b> · {INCIDENT[t.incident_type] || t.incident_type}
                        <span className="block truncate text-xs text-muted">{t.address || t.admin_name} · nhận {ago(t.received_at)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
    </Modal>
  );
}
