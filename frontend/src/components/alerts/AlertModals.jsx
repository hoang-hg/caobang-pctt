import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { BellOff, KeyRound, ShieldCheck, TimerReset, XCircle } from 'lucide-react';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { Modal } from '../common/ui';
import { ALERT_VALID_HOURS, CHANNEL, notIntegrated } from '../../utils/labels';
import { dateTime, int } from '../../utils/format';

const BIG = 'tap min-h-[44px] text-sm sm:min-h-0';

/** Lãnh đạo (Checker) xem nội dung, ký duyệt bằng PIN hoặc từ chối kèm lý do. */
export function ApproveModal({ b, onClose }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const [pin, setPin] = useState('');
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState('approve');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      if (mode === 'approve') {
        const res = await api(`/alerts/broadcasts/${b.id}/approve`, { method: 'POST', body: { pin } });
        toast(notIntegrated(res)
          ? { tone: 'good', title: `Đã phê duyệt ${b.code} – đã công bố trên cổng công khai`, body: 'Kênh SMS / Zalo / Cell Broadcast chưa tích hợp: tin CHƯA gửi tới điện thoại người dân.' }
          : { tone: 'good', title: `Đã phê duyệt – bắt đầu phát ${b.code}` });
      } else {
        await api(`/alerts/broadcasts/${b.id}/reject`, { method: 'POST', body: { reason } });
        toast({ tone: 'info', title: `Đã từ chối ${b.code}` });
      }
      qc.invalidateQueries({ queryKey: ['broadcasts'] });
      onClose();
    } catch (e) {
      toast({ tone: 'danger', title: 'Không thực hiện được', body: e.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Phê duyệt lệnh ${b.code}`}
      footer={
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button type="button" className={clsx('btn-ghost', BIG)} onClick={onClose}>Đóng</button>
          {mode === 'approve'
            ? <button type="button" className={clsx('btn-danger', BIG)} disabled={busy || pin.length < 4} onClick={run}><ShieldCheck size={15} /> Xác nhận phát lệnh</button>
            : <button type="button" className={clsx('btn-ghost text-danger', BIG)} disabled={busy || reason.length < 3} onClick={run}><XCircle size={15} /> Từ chối</button>}
        </div>
      }
    >
      <div className="mb-3 rounded-lg bg-panel2 p-3 text-sm">
        <div className="font-semibold">{b.title}</div>
        <p className="mt-1 whitespace-pre-wrap">{b.message_body}</p>
        <div className="mt-2 text-xs text-muted">
          Kênh: {b.channels.map((c) => CHANNEL[c]).join(', ')} · Vùng: {b.target_admin_codes.length} xã · {int(b.audience?.households)} hộ, {int(b.audience?.subscribers)} thuê bao
        </div>
        <div className="text-xs text-muted">Người soạn: {b.created_by_name || 'Hệ thống (tự động)'} · {dateTime(b.created_at)}</div>
      </div>
      <div className="mb-2 flex gap-2">
        <button type="button" aria-pressed={mode === 'approve'} className={clsx('chip tap min-h-[36px] px-3 py-1', mode === 'approve' ? 'bg-accent text-white' : 'bg-panel2')} onClick={() => setMode('approve')}>Phê duyệt</button>
        <button type="button" aria-pressed={mode === 'reject'} className={clsx('chip tap min-h-[36px] px-3 py-1', mode === 'reject' ? 'bg-danger text-white' : 'bg-panel2')} onClick={() => setMode('reject')}>Từ chối</button>
      </div>
      {mode === 'approve' ? (
        <label className="block text-sm">
          <span className="flex items-center gap-1"><KeyRound size={14} /> Mã PIN ký duyệt của bạn</span>
          <input type="password" inputMode="numeric" autoFocus aria-label="Mã PIN ký duyệt" className="input tap mt-1 w-40 font-mono tracking-widest" value={pin} onChange={(e) => setPin(e.target.value)} />
        </label>
      ) : (
        <input className="input tap" aria-label="Lý do từ chối" placeholder="Lý do từ chối" value={reason} onChange={(e) => setReason(e.target.value)} />
      )}
    </Modal>
  );
}

/** Gia hạn (thiên tai kéo dài) / kết thúc (hết nguy hiểm — ký PIN) một cảnh báo đang hiệu lực. */
export function ManageModal({ b, mode, onClose }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const [hours, setHours] = useState(24);
  const [note, setNote] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const end = mode === 'end';
  const run = async () => {
    setBusy(true);
    try {
      await api(`/alerts/broadcasts/${b.id}/${end ? 'end' : 'extend'}`, { method: 'POST', body: end ? { pin, note: note.trim() } : { pin, hours } });
      toast({ tone: 'good', title: end ? `Đã kết thúc cảnh báo ${b.code}` : `Đã gia hạn cảnh báo ${b.code} thêm ${hours} giờ` });
      qc.invalidateQueries({ queryKey: ['broadcasts'] });
      onClose();
    } catch (e) {
      toast({ tone: 'danger', title: 'Không thực hiện được', body: e.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`${end ? 'Kết thúc' : 'Gia hạn'} cảnh báo – ${b.code}`}
      footer={
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button type="button" className={clsx('btn-ghost', BIG)} onClick={onClose}>Huỷ</button>
          <button type="button" className={clsx(end ? 'btn-danger' : 'btn-primary', BIG)} disabled={busy || pin.length < 4 || (end && note.trim().length < 3)} onClick={run}>
            {end ? <><BellOff size={15} /> Kết thúc cảnh báo</> : <><TimerReset size={15} /> Gia hạn</>}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <div className="rounded-lg bg-panel2 p-2.5">
          <b>{b.title}</b>
          <div className="text-xs text-muted">Đang hiệu lực đến {dateTime(b.valid_until)}</div>
        </div>
        {end ? (
          <>
            <p className="text-ink-2">Cảnh báo thôi hiện ngay trên cổng công khai, “Tôi đang ở đâu?”, bản nhẹ; danh sách cảnh báo của người dân ghi “đã kết thúc”.</p>
            <label className="flex flex-col gap-1">
              Lý do / thông báo kết thúc
              <input className="input tap" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: Nước đã rút, dỡ bỏ lệnh sơ tán" />
            </label>
          </>
        ) : (
          <label className="flex flex-col gap-1">
            Gia hạn thêm (tính từ hạn hiện tại)
            <select className="input tap w-40" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              {ALERT_VALID_HOURS.map(([h, label]) => <option key={h} value={h}>{label}</option>)}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="flex items-center gap-1"><KeyRound size={14} /> Mã PIN ký duyệt của bạn</span>
          <input type="password" inputMode="numeric" aria-label="Mã PIN ký duyệt" className="input tap w-40 font-mono tracking-widest" value={pin} onChange={(e) => setPin(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}
