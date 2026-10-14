import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Ban, Loader2 } from 'lucide-react';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { ITEM_NAME } from '../../utils/labels';
import { FieldError, Modal } from './ui';

// Lý do hay gặp — chạm để điền (sửa / ghi thêm được), đỡ gõ trên điện thoại
const REASONS = [
  'Đường bị sạt, đội không tiếp cận được',
  'Nhầm lực lượng / phương tiện',
  'Đã có đội khác xử lý',
  'Người dân đã tự đến nơi an toàn',
  'Phương tiện hỏng giữa đường',
];

/** Huỷ lệnh điều động (nhầm lực lượng, đội không tiếp cận được…): lực lượng & phương tiện về sẵn sàng, link nhiệm vụ của
 * đội đóng ngay; phiếu không còn đội nào → về "Đang điều phối" để điều lực lượng khác. Lý do: chip chọn nhanh hoặc tự ghi;
 * thiếu lý do → báo ngay dưới ô (không khoá nút im lặng). */
export default function CancelDispatchModal({ ticket, onClose }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const [reason, setReason] = useState('');
  const [returnSupplies, setReturnSupplies] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const reasonRef = useRef(null);
  const supplies = Object.entries(ticket.dispatch_supplies || {}).filter(([, n]) => n > 0);
  const hasSupplies = !!ticket.supplies_warehouse && supplies.length > 0;
  const reasonErr = reason.trim().length < 3 ? 'Ghi lý do huỷ (chọn nhanh ở trên hoặc tự ghi) — lưu vào nhật ký điều động' : null;

  const submit = async () => {
    if (reasonErr) {
      setTried(true);
      reasonRef.current?.focus();
      return;
    }
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

  const big = 'tap min-h-[44px] text-sm sm:min-h-0';
  return (
    <Modal
      open
      onClose={onClose}
      title={`Huỷ lệnh điều động – ${ticket.code}`}
      footer={
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button type="button" className={clsx('btn-ghost', big)} onClick={onClose} disabled={busy}>Đóng</button>
          <button type="button" className={clsx('btn-danger', big)} disabled={busy} onMouseDown={(e) => e.preventDefault()} onClick={submit}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Ban size={15} />} Huỷ lệnh
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-ink-2">
          <b>{ticket.force_name || 'Lực lượng'}</b> và phương tiện của lệnh này trở về <b>sẵn sàng</b>; link nhiệm vụ của đội
          đóng ngay. Phiếu không còn đội nào thực hiện thì về cột <b>Đang điều phối</b> để điều lực lượng khác.
        </p>
        <div>
          <label htmlFor="ly-do-huy" className="font-medium">Lý do huỷ *</label>
          <div className="my-1.5 flex flex-wrap gap-1.5" aria-label="Chọn nhanh lý do">
            {REASONS.map((r) => (
              <button
                key={r}
                type="button"
                className={clsx('chip tap min-h-[32px] border px-2.5 text-xs', reason === r ? 'border-accent bg-accent text-white' : 'border-line bg-panel2 text-ink-2 hover:bg-panel')}
                onClick={() => setReason(r)}
              >
                {r}
              </button>
            ))}
          </div>
          <textarea
            id="ly-do-huy"
            ref={reasonRef}
            className={clsx('input', tried && reasonErr && 'border-danger')}
            rows={2}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="VD: Đường bị sạt, đội không tiếp cận được — điều đội khác hướng xã bên"
            aria-invalid={!!(tried && reasonErr)}
            aria-describedby="loi-ly-do-huy"
          />
          <FieldError id="loi-ly-do-huy">{tried ? reasonErr : null}</FieldError>
        </div>
        {hasSupplies && (
          <label className="flex min-h-[44px] cursor-pointer items-start gap-2 rounded-lg bg-panel2 p-2.5 text-xs">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={returnSupplies} onChange={(e) => setReturnSupplies(e.target.checked)} />
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
