import { useState } from 'react';
import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';
import { useAreaQuery } from '../../api/hooks';
import DispatchModal from '../common/DispatchModal';
import { EmptyState, ErrorState, Modal, Skeleton } from '../common/ui';
import { INCIDENT, PRIORITY } from '../../utils/labels';
import { ago, int } from '../../utils/format';

/**
 * "Điều động nhanh" từ một đơn vị (thiết kế C.1): chọn phiếu SOS đang chờ (cấp 1 và phiếu chờ lâu lên đầu — máy chủ đã xếp)
 * → mở lệnh điều động 3 bước có sẵn (đội này chọn sẵn ở bước "Chọn đội"). Mỗi phiếu một câu: mức, việc gì, mấy người, ở đâu,
 * chờ bao lâu. Bản vẽ khung E2: chọn một dòng rồi bấm "Điều động tới …" ở chân hộp, không nhảy bước ngay khi chạm nhầm.
 */
export default function QuickDispatch({ force, onClose }) {
  const sosQ = useAreaQuery('sos', '/sos');
  const [ticket, setTicket] = useState(null);
  const [pickedId, setPickedId] = useState(null);
  if (ticket) return <DispatchModal ticket={ticket} presetForceId={force.id} onClose={onClose} />;
  const open = (sosQ.data || []).filter((t) => t.status === 'moi' || t.status === 'dieu_phoi');
  const picked = open.find((t) => t.id === pickedId) || open[0];
  return (
    <Modal
      open
      size="md"
      onClose={onClose}
      title={`Điều động nhanh — ${force.name}`}
      subtitle="Chỉ phiếu đang chờ điều đội trong vùng đang xem"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Huỷ</button>
          <button type="button" className="btn-primary" disabled={!picked} onClick={() => setTicket(picked)}>{picked ? `Điều động tới ${picked.code}` : 'Điều động'} <ChevronRight size={15} aria-hidden="true" /></button>
        </>
      }
    >
      <p className="mb-2 text-sm text-muted">
        Đội có <b className="text-ink">{int(force.personnel_ready)}</b> người sẵn sàng. Chọn phiếu cứu hộ cần đến (cấp 1, phiếu chờ lâu lên đầu):
      </p>
      {sosQ.isLoading ? <Skeleton height={120} />
        : sosQ.isError && !sosQ.data ? <ErrorState onRetry={sosQ.refetch}>Không tải được danh sách phiếu cứu hộ</ErrorState>
          : !open.length ? <EmptyState>Không có phiếu cứu hộ đang chờ điều đội trong vùng đang xem</EmptyState>
            : (
              <ul className="flex flex-col gap-1.5" role="radiogroup" aria-label="Phiếu cứu hộ cần đến">
                {open.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={picked?.id === t.id}
                      className={clsx('tap flex w-full items-center gap-2.5 rounded-[14px] border-2 px-3 py-2.5 text-left', picked?.id === t.id ? 'border-accent bg-accent/10' : 'border-transparent bg-panel2 hover:border-line')}
                      onClick={() => setPickedId(t.id)}
                      onDoubleClick={() => setTicket(t)}
                    >
                      <span className={clsx('chip shrink-0 whitespace-nowrap', PRIORITY[t.priority]?.cls || 'bg-panel2')}>Cấp {t.priority}{PRIORITY[t.priority] ? ` · ${PRIORITY[t.priority].short}` : ''}</span>
                      <span className="min-w-0 text-sm">
                        <b>{t.code}</b> · {INCIDENT[t.incident_type] || t.incident_type} · {t.trapped_count ?? 0} người
                        <span className="block truncate text-xs text-muted">{t.address || t.admin_name} · báo {ago(t.received_at)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
      {open.length > 0 && (
        <p className="mt-3 rounded-[14px] bg-panel2 p-3 text-[13px] leading-normal text-ink-2">
          Chọn phiếu rồi mở lệnh điều động 3 bước (Chọn đội · Vật tư mang theo · Xác nhận), đội này được chọn sẵn.
        </p>
      )}
    </Modal>
  );
}
