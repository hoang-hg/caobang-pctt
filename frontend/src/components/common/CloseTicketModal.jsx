import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Loader2, XCircle } from 'lucide-react';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { CLOSE_REASON } from '../../utils/labels';
import { FieldError, Modal } from './ui';

// Lời giải thích từng lý do — người dân tra cứu thấy câu tương ứng (không thấy ghi chú nội bộ)
const REASON_HINT = {
  trung: 'Cùng nơi, cùng sự việc với một phiếu đang xử lý — đội đi theo phiếu đó',
  khong_xac_minh: 'Gọi lại không được, tới nơi không thấy sự việc — có thể là tin giả',
  da_an_toan: 'Đã gọi lại: người gặp nạn đã tự đến nơi an toàn, không cần lực lượng',
};
// Ghi chú hay gặp — chạm để điền (sửa / ghi thêm được)
const NOTES = {
  trung: ['Trùng phiếu SOS-', 'Cùng hộ gia đình đã báo qua tổng đài'],
  khong_xac_minh: ['Gọi 3 lần không nghe máy', 'Đội xã tới nơi không thấy sự việc'],
  da_an_toan: ['Đã gọi lại, cả nhà đã sang nhà hàng xóm', 'Thôn đã tự hỗ trợ'],
};

/** Đóng phiếu KHÔNG CẦN CỨU (POST /sos/{id}/close): phiếu người dân gửi trên cổng vào thẳng "Mới báo" — cán bộ gọi lại xác
 * minh; trùng / không xác minh được / tự an toàn thì đóng ở đây, không bấm "Xác nhận đã cứu" (người dân sẽ thấy "Đã cứu an
 * toàn", thống kê tính sai số người đã cứu). Bắt buộc ghi chú nội bộ; thiếu → báo ngay dưới ô. */
export default function CloseTicketModal({ ticket, onClose }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const noteRef = useRef(null);
  const reasonErr = !reason ? 'Chọn lý do đóng phiếu' : null;
  const noteErr = note.trim().length < 3 ? 'Ghi chú nội bộ: trùng phiếu nào, đã gọi lại lúc mấy giờ, ai xác nhận…' : null;

  const submit = async () => {
    if (reasonErr || noteErr) {
      setTried(true);
      if (!reasonErr) noteRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await api(`/sos/${ticket.id}/close`, { method: 'POST', body: { reason, note: note.trim() } });
      qc.invalidateQueries({ queryKey: ['sos'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
      toast({ tone: 'good', title: `Đã đóng phiếu ${ticket.code}`, body: CLOSE_REASON[reason] });
      onClose();
    } catch (e) {
      toast({ tone: 'danger', title: 'Không đóng được phiếu', body: e.message });
    } finally {
      setBusy(false);
    }
  };

  const big = 'tap min-h-[44px] text-sm sm:min-h-0';
  return (
    <Modal
      open
      onClose={onClose}
      title={`Đóng phiếu không cần cứu – ${ticket.code}`}
      footer={
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button type="button" className={clsx('btn-ghost', big)} onClick={onClose} disabled={busy}>Huỷ</button>
          <button type="button" className={clsx('btn-primary', big)} disabled={busy} onMouseDown={(e) => e.preventDefault()} onClick={submit}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />} Đóng phiếu
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-ink-2">
          Dùng khi <b>không cần lực lượng</b>. Đã đưa người tới nơi an toàn thì bấm <b>Xác nhận đã cứu</b> trên thẻ phiếu.
          {ticket.request_code && <> Phiếu yêu cầu <b className="num">{ticket.request_code}</b> của người dân đóng theo.</>}
        </p>
        <fieldset>
          <legend className="font-medium">Lý do *</legend>
          <div className="mt-1.5 flex flex-col gap-1.5">
            {Object.entries(CLOSE_REASON).map(([k, label]) => (
              <label
                key={k}
                className={clsx(
                  'flex min-h-[44px] cursor-pointer items-start gap-2 rounded-lg border p-2.5',
                  reason === k ? 'border-accent bg-accent/10' : 'border-line bg-panel2 hover:bg-panel',
                )}
              >
                <input type="radio" name="ly-do-dong" className="mt-0.5 h-4 w-4" checked={reason === k} onChange={() => setReason(k)} />
                <span>
                  <span className="font-semibold text-ink">{label}</span>
                  <span className="block text-xs text-muted">{REASON_HINT[k]}</span>
                </span>
              </label>
            ))}
          </div>
          <FieldError id="loi-ly-do-dong">{tried ? reasonErr : null}</FieldError>
        </fieldset>
        <div>
          <label htmlFor="ghi-chu-dong" className="font-medium">Ghi chú nội bộ *</label>
          {reason && (
            <div className="my-1.5 flex flex-wrap gap-1.5" aria-label="Chọn nhanh ghi chú">
              {NOTES[reason].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={clsx('chip tap min-h-[32px] border px-2.5 text-xs', note === n ? 'border-accent bg-accent text-white' : 'border-line bg-panel2 text-ink-2 hover:bg-panel')}
                  onClick={() => { setNote(n); noteRef.current?.focus(); }}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
          <textarea
            id="ghi-chu-dong"
            ref={noteRef}
            className={clsx('input mt-1', tried && noteErr && 'border-danger')}
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="VD: Trùng SOS-1049 (cùng hộ, báo qua tổng đài)"
            aria-invalid={!!(tried && noteErr)}
            aria-describedby="loi-ghi-chu-dong"
          />
          <FieldError id="loi-ghi-chu-dong">{tried ? noteErr : null}</FieldError>
        </div>
        <p className="text-xs text-muted">Người dân tra cứu chỉ thấy lý do chung, không thấy ghi chú nội bộ.</p>
      </div>
    </Modal>
  );
}
