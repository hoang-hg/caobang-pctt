import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Loader2, Save } from 'lucide-react';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { PRIORITY, VULNERABLE } from '../../utils/labels';
import { risk, sosLevel } from '../../utils/risk';
import QtyStepper from './QtyStepper';
import { FieldError, Modal } from './ui';

const SLA = { 1: 3, 2: 15, 3: 60 };
const MAX_TRAPPED = 10_000; // như SosIn.trapped_count (backend)

/**
 * Sửa mức ưu tiên / số người / nhóm yếu thế của phiếu SOS khi gọi lại hoặc đội báo thêm thông tin (bóc tách tự động có
 * thể đánh giá thấp). Điện thoại, ít gõ: 3 nút mức ưu tiên to (màu theo thang chung, kèm SLA), số người bằng nút −/+, chip
 * nhóm yếu thế. Lỗi hiện ngay dưới ô; bấm Lưu khi chưa đổi gì → nói rõ (không khoá nút im lặng). Ghi nhật ký; gợi ý lực
 * lượng, link nhiệm vụ cập nhật theo.
 */
export default function EditTicketModal({ ticket, onClose }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const [priority, setPriority] = useState(ticket.priority);
  const [trapped, setTrapped] = useState(String(ticket.trapped_count ?? 0));
  const [vulnerable, setVulnerable] = useState(ticket.vulnerable || []);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const trappedRef = useRef(null);
  const toggle = (v) => setVulnerable((xs) => (xs.includes(v) ? xs.filter((x) => x !== v) : [...xs, v]));
  const n = Number(trapped);
  const trappedErr = trapped === '' || !(Number.isInteger(n) && n >= 0 && n <= MAX_TRAPPED)
    ? `Số người là số nguyên từ 0 đến ${MAX_TRAPPED.toLocaleString('vi-VN')}` : null;
  const same = priority === ticket.priority && n === (ticket.trapped_count ?? 0)
    && [...vulnerable].sort().join() === [...(ticket.vulnerable || [])].sort().join();

  const save = async () => {
    if (trappedErr) {
      trappedRef.current?.focus();
      return;
    }
    if (same) {
      setTried(true);
      return;
    }
    setBusy(true);
    try {
      await api(`/sos/${ticket.id}`, { method: 'PATCH', body: { priority, trapped_count: n, vulnerable } });
      qc.invalidateQueries({ queryKey: ['sos'] });
      toast({ tone: 'good', title: `Đã cập nhật ${ticket.code}` });
      onClose();
    } catch (e) {
      toast({ tone: 'danger', title: 'Không cập nhật được', body: e.message });
    } finally {
      setBusy(false);
    }
  };

  const big = 'tap min-h-[44px] text-sm sm:min-h-0';
  return (
    <Modal
      open
      onClose={onClose}
      title={`Sửa thông tin phiếu – ${ticket.code}`}
      footer={
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button type="button" className={clsx('btn-ghost', big)} onClick={onClose} disabled={busy}>Huỷ</button>
          <button type="button" className={clsx('btn-primary', big)} disabled={busy} onMouseDown={(e) => e.preventDefault()} onClick={save}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Lưu
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {ticket.raw_message && <p className="rounded-lg bg-panel2 p-2.5 text-xs italic text-ink-2">“{ticket.raw_message}”</p>}
        <div>
          <div className="mb-1 font-medium" id="sua-muc-uu-tien">Mức ưu tiên</div>
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-labelledby="sua-muc-uu-tien">
            {[1, 2, 3].map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={priority === p}
                onClick={() => setPriority(p)}
                className={clsx(
                  'tap flex min-h-[48px] flex-col items-center justify-center rounded-lg border-2 px-1 text-center text-xs font-semibold',
                  priority === p ? clsx(risk(sosLevel(p)).chip, 'border-transparent') : 'border-line bg-panel2/50 text-ink-2',
                )}
                title={PRIORITY[p].label}
              >
                <span>Cấp {p} · {PRIORITY[p].short}</span>
                <span className="text-[10px] font-normal opacity-90">hạn {SLA[p]} phút</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="sua-so-nguoi" className="font-medium">Số người cần cứu</label>
          <QtyStepper
            id="sua-so-nguoi"
            ref={trappedRef}
            value={trapped}
            onChange={setTrapped}
            min={0}
            max={MAX_TRAPPED}
            steps={[1, 5]}
            unit="người"
            invalid={!!trappedErr}
            describedBy="loi-sua-so-nguoi"
          />
          <FieldError id="loi-sua-so-nguoi">{trappedErr}</FieldError>
        </div>
        <div>
          <div className="mb-1 font-medium">Nhóm yếu thế</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(VULNERABLE).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={clsx('chip tap min-h-[36px] border px-3', vulnerable.includes(k) ? 'border-danger bg-danger text-white' : 'border-line bg-panel2 text-ink-2')}
                onClick={() => toggle(k)}
                aria-pressed={vulnerable.includes(k)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {tried && same && <FieldError id="loi-sua-chua-doi">Chưa thay đổi gì — sửa mức ưu tiên, số người hoặc nhóm yếu thế rồi lưu</FieldError>}
        <p className="text-xs text-muted">Cấp 1: nguy hiểm tính mạng tức thì (vùi lấp, lũ cuốn, mắc kẹt trên mái) — phản hồi trong 3 phút.</p>
      </div>
    </Modal>
  );
}
