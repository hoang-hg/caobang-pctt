import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Ban, Loader2 } from 'lucide-react';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { ITEM_NAME } from '../../utils/labels';
import { Modal } from './ui';

/** Huỷ lệnh điều động (nhầm lực lượng, đội không tiếp cận được…): lực lượng & phương tiện về sẵn sàng, link nhiệm vụ của
 * đội đóng ngay; phiếu không còn đội nào → về "Đang điều phối" để điều lực lượng khác. */
export default function CancelDispatchModal({ ticket, onClose }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const [reason, setReason] = useState('');
  const [returnSupplies, setReturnSupplies] = useState(false);
  const [busy, setBusy] = useState(false);
  const supplies = Object.entries(ticket.dispatch_supplies || {}).filter(([, n]) => n > 0);
  const hasSupplies = !!ticket.supplies_warehouse && supplies.length > 0;

  const submit = async () => {
    setBusy(true);
    try {
      await api(`/dispatch/${ticket.dispatch_id}/cancel`, {
        method: 'POST',
        body: { reason: reason.trim(), return_supplies: hasSupplies && returnSupplies },
      });
      qc.invalidateQueries({ queryKey: ['sos'] });
      if (hasSupplies && returnSupplies) qc.invalidateQueries({ queryKey: ['warehouses'] });
      toast({ tone: 'good', title: `Đã huỷ lệnh điều động ${ticket.code}`, body: 'Gọi báo trưởng nhóm dừng nhiệm vụ' });
      onClose();
    } catch (e) {
      toast({ tone: 'danger', title: 'Không huỷ được lệnh', body: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Huỷ lệnh điều động – ${ticket.code}`}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Đóng</button>
          <button className="btn-danger" disabled={busy || reason.trim().length < 3} onClick={submit}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Ban size={15} />} Huỷ lệnh
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-ink-2">
          <b>{ticket.force_name || 'Lực lượng'}</b> và phương tiện của lệnh này trở về <b>sẵn sàng</b>; link nhiệm vụ của đội
          đóng ngay. Phiếu không còn đội nào thực hiện thì về cột <b>Đang điều phối</b> để điều lực lượng khác.
        </p>
        <label className="flex flex-col gap-1">
          Lý do huỷ
          <textarea
            className="input"
            rows={2}
            maxLength={300}
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="VD: Đường bị sạt, đội không tiếp cận được — điều đội khác hướng xã bên"
          />
        </label>
        {hasSupplies && (
          <label className="flex items-start gap-2 rounded-lg bg-panel2 p-2.5 text-xs">
            <input type="checkbox" className="mt-0.5" checked={returnSupplies} onChange={(e) => setReturnSupplies(e.target.checked)} />
            <span>
              Vật tư mang theo <b>chưa dùng, đã nhập lại {ticket.supplies_warehouse}</b> — cộng lại tồn kho
              ({supplies.map(([code, n]) => `${n} ${ITEM_NAME[code] || code}`).join(', ')}). Không tích nếu đội đã dùng / còn giữ vật tư.
            </span>
          </label>
        )}
        <p className="text-xs font-medium text-warn">Hệ thống không tự báo cho đội — gọi trưởng nhóm dừng nhiệm vụ.</p>
      </div>
    </Modal>
  );
}
