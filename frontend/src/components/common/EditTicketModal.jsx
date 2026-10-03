import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Loader2, Save } from 'lucide-react';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { PRIORITY, VULNERABLE } from '../../utils/labels';
import { Modal } from './ui';

/** Sửa mức ưu tiên / số người / nhóm yếu thế của phiếu SOS khi gọi lại hoặc đội báo thêm thông tin (bóc tách tự động có
 * thể đánh giá thấp). Ghi nhật ký; gợi ý lực lượng, link nhiệm vụ cập nhật theo. */
export default function EditTicketModal({ ticket, onClose }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const [priority, setPriority] = useState(ticket.priority);
  const [trapped, setTrapped] = useState(String(ticket.trapped_count ?? 0));
  const [vulnerable, setVulnerable] = useState(ticket.vulnerable || []);
  const [busy, setBusy] = useState(false);
  const toggle = (v) => setVulnerable((xs) => (xs.includes(v) ? xs.filter((x) => x !== v) : [...xs, v]));

  const save = async () => {
    setBusy(true);
    try {
      await api(`/sos/${ticket.id}`, {
        method: 'PATCH',
        body: { priority, trapped_count: trapped === '' ? null : Number(trapped), vulnerable },
      });
      qc.invalidateQueries({ queryKey: ['sos'] });
      toast({ tone: 'good', title: `Đã cập nhật ${ticket.code}` });
      onClose();
    } catch (e) {
      toast({ tone: 'danger', title: 'Không cập nhật được', body: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Sửa thông tin phiếu – ${ticket.code}`}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" disabled={busy || trapped === ''} onClick={save}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Lưu
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {ticket.raw_message && <p className="rounded-lg bg-panel2 p-2.5 text-xs italic text-ink-2">“{ticket.raw_message}”</p>}
        <label className="flex flex-col gap-1">
          Mức ưu tiên
          <select className="input" value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
            {[1, 2, 3].map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Số người cần cứu
          <input className="input w-32" type="number" min={0} max={10000} value={trapped} onChange={(e) => setTrapped(e.target.value)} />
        </label>
        <div>
          <div className="mb-1">Nhóm yếu thế</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(VULNERABLE).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={clsx('chip px-2.5 py-1', vulnerable.includes(k) ? 'bg-danger text-white' : 'bg-panel2 text-ink-2')}
                onClick={() => toggle(k)}
                aria-pressed={vulnerable.includes(k)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted">Cấp 1: nguy hiểm tính mạng tức thì (vùi lấp, lũ cuốn, mắc kẹt trên mái) — SLA 3 phút.</p>
      </div>
    </Modal>
  );
}
