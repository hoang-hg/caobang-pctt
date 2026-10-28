import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { BellOff, CornerUpLeft, KeyRound, Loader2, ShieldCheck, TimerReset } from 'lucide-react';
import { api } from '../../api/client';
import { useUnits } from '../../api/hooks';
import { useStore } from '../../app/store';
import { FieldError, Modal } from '../common/ui';
import { ALERT_VALID_HOURS, CHANNEL, LEVEL, notIntegrated } from '../../utils/labels';
import { dateTime, int } from '../../utils/format';
import { SHOW_STORM } from '../../utils/hazardScope';
import { useOnline } from '../../utils/useOnline';

const BIG = 'tap min-h-[44px] text-sm sm:min-h-0';
const PIN_RE = /^\d{4,8}$/;
const OFFLINE = 'Mất mạng — chưa thực hiện được';
// Lý do hay gặp — chạm để điền (sửa / ghi thêm được)
const REJECT_REASONS = ['Sai vùng nhận tin', 'Nội dung chưa rõ, thiếu hướng dẫn', 'Mức cảnh báo chưa phù hợp', 'Trùng lệnh đã phát', 'Chưa đến mức phải cảnh báo'];
const END_NOTES = ['Nước đã rút, dỡ bỏ lệnh sơ tán', 'Hết nguy cơ sạt lở', ...(SHOW_STORM ? ['Bão / áp thấp đã suy yếu'] : [])];

/** Ô PIN dùng chung: to, chỉ số, lỗi ngay dưới ô (sai định dạng khi bấm; sai PIN / tạm khoá / chưa cấp PIN từ máy chủ). */
function PinField({ value, onChange, error, inputRef }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="flex items-center gap-1 font-medium"><KeyRound size={14} aria-hidden="true" /> Mã PIN ký duyệt của bạn</span>
      <input
        ref={inputRef}
        type="password"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={8}
        className={clsx('input tap min-h-[44px] w-44 font-mono text-lg tracking-[0.4em]', error && 'border-danger')}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        aria-invalid={!!error}
        aria-describedby="loi-pin"
      />
      <FieldError id="loi-pin">{error}</FieldError>
    </label>
  );
}

/** Lỗi máy chủ về PIN (sai, tạm khoá, chưa cấp) → hiện dưới ô PIN; lỗi khác → thông báo nổi. */
const pinMessage = (e) => (/PIN/i.test(e?.message || '') ? e.message : null);

function Chips({ list, value, onPick, label }) {
  return (
    <div className="flex flex-wrap gap-1.5" aria-label={label}>
      {list.map((r) => (
        <button
          key={r}
          type="button"
          className={clsx('chip tap min-h-[32px] border px-2.5 text-xs', value === r ? 'border-accent bg-accent text-white' : 'border-line bg-panel2 text-ink-2 hover:bg-panel')}
          onClick={() => onPick(r)}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

/**
 * Người duyệt (lãnh đạo) xem đủ nội dung — mức, tin người dân nhận, vùng (tên xã), người nhận, kênh, hiệu lực, người soạn — rồi
 * "Ký duyệt & phát" (mã PIN) hoặc "Trả lại" (lý do chọn nhanh / tự ghi). `initial`: 'approve' | 'reject' theo nút đã bấm trên
 * thẻ lệnh. Lỗi hiện ngay dưới ô: PIN sai định dạng, sai PIN, tạm khoá 15 phút; thiếu lý do. Mất mạng → không gửi được.
 */
export function ApproveModal({ b, initial = 'approve', onClose }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const online = useOnline();
  const { data: units = [] } = useUnits();
  const [mode, setMode] = useState(initial);
  const [pin, setPin] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [serverErr, setServerErr] = useState(null);
  const pinRef = useRef(null);
  const reasonRef = useRef(null);
  const approve = mode === 'approve';
  const pinErr = serverErr || (tried && !PIN_RE.test(pin) ? 'Nhập mã PIN 4–8 chữ số' : null);
  const reasonErr = tried && reason.trim().length < 3 ? 'Ghi lý do trả lại (chọn nhanh ở trên hoặc tự ghi) — người soạn sẽ thấy để sửa' : null;
  const names = (b.target_admin_codes || []).map((c) => units.find((u) => u.code === c)?.name || c);

  const run = async () => {
    setServerErr(null);
    if (approve ? !PIN_RE.test(pin) : reason.trim().length < 3) {
      setTried(true);
      (approve ? pinRef : reasonRef).current?.focus();
      return;
    }
    setBusy(true);
    try {
      if (approve) {
        const res = await api(`/alerts/broadcasts/${b.id}/approve`, { method: 'POST', body: { pin } });
        toast(notIntegrated(res)
          ? { tone: 'good', title: `Đã duyệt ${b.code} – đã công bố trên cổng thông tin cho người dân`, body: 'Kênh SMS / Zalo / tin nhắn vùng chưa nối cổng gửi tin: tin CHƯA gửi tới điện thoại người dân.' }
          : { tone: 'good', title: `Đã duyệt – bắt đầu phát ${b.code}` });
      } else {
        await api(`/alerts/broadcasts/${b.id}/reject`, { method: 'POST', body: { reason: reason.trim() } });
        toast({ tone: 'info', title: `Đã trả lại ${b.code}`, body: 'Người soạn thấy lý do và soạn lại' });
      }
      qc.invalidateQueries({ queryKey: ['broadcasts'] });
      onClose();
    } catch (e) {
      const m = approve && pinMessage(e);
      if (m) {
        setServerErr(m);
        setPin('');
        pinRef.current?.focus();
      } else toast({ tone: 'danger', title: 'Không thực hiện được', body: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Duyệt lệnh ${b.code}`}
      footer={
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button type="button" className={clsx('btn-ghost', BIG)} onClick={onClose} disabled={busy}>Đóng</button>
          <button
            type="button"
            className={clsx(approve ? 'btn-danger' : 'btn-ghost text-danger', 'font-bold', BIG)}
            aria-label={approve ? 'Ký duyệt & phát' : 'Trả lại lệnh'}
            disabled={busy || !online}
            title={!online ? OFFLINE : undefined}
            onMouseDown={(e) => e.preventDefault()}
            onClick={run}
          >
            {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : approve ? <ShieldCheck size={15} aria-hidden="true" /> : <CornerUpLeft size={15} aria-hidden="true" />}
            {approve ? <><span className="sm:hidden">Ký & phát</span><span className="hidden sm:inline">Ký duyệt & phát</span></> : 'Trả lại lệnh'}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <div className="rounded-lg bg-panel2 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={clsx('chip', LEVEL[b.severity]?.cls)}>{LEVEL[b.severity]?.label}</span>
            {b.auto_generated && <span className="chip border border-warn bg-warn/20 text-ink">Máy đề xuất — cần người duyệt{b.trigger_source ? ` · ${b.trigger_source}` : ''}</span>}
          </div>
          <div className="mt-1 font-semibold text-ink [overflow-wrap:anywhere]">{b.title}</div>
          <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-panel p-2 text-xs leading-relaxed [overflow-wrap:anywhere]">{b.message_body}</p>
          <ul className="mt-2 flex flex-col gap-0.5 text-xs text-ink-2">
            <li>Vùng: {names.length ? `${names.length} xã/phường — ${names.slice(0, 6).join(', ')}${names.length > 6 ? '…' : ''}` : 'vùng vẽ trên bản đồ'}</li>
            <li>Người nhận: {int(b.audience?.households)} hộ · {int(b.audience?.subscribers)} thuê bao · {int(b.audience?.speakers)} loa</li>
            <li>Kênh: {(b.channels || []).map((c) => CHANNEL[c]).join(', ')}</li>
            <li>Hiệu lực: {ALERT_VALID_HOURS.find(([h]) => h === b.valid_hours)?.[1] || `${b.valid_hours} giờ`} kể từ khi duyệt</li>
            <li>Người soạn: {b.created_by_name || 'Hệ thống (máy đề xuất)'} · {dateTime(b.created_at)}</li>
          </ul>
        </div>
        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Quyết định">
          <button type="button" role="radio" aria-checked={approve} onClick={() => { setMode('approve'); setTried(false); }} className={clsx('tap flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border-2 text-sm font-semibold', approve ? 'border-transparent bg-accent text-white' : 'border-line bg-panel2/50 text-ink-2')}>
            <ShieldCheck size={15} aria-hidden="true" /> Duyệt
          </button>
          <button type="button" role="radio" aria-checked={!approve} onClick={() => { setMode('reject'); setTried(false); setServerErr(null); }} className={clsx('tap flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border-2 text-sm font-semibold', !approve ? 'border-transparent bg-danger text-white' : 'border-line bg-panel2/50 text-ink-2')}>
            <CornerUpLeft size={15} aria-hidden="true" /> Trả lại
          </button>
        </div>
        {approve ? (
          <>
            <p className="text-xs leading-snug text-ink-2">
              Mã PIN xác nhận đúng lãnh đạo có thẩm quyền ký lệnh — tin sẽ tới hàng nghìn người dân, không thu hồi được. Người soạn
              không tự duyệt lệnh của mình.
            </p>
            <PinField value={pin} onChange={(v) => { setPin(v); setServerErr(null); }} error={pinErr} inputRef={pinRef} />
          </>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ly-do-tu-choi" className="font-medium">Lý do trả lại *</label>
            <Chips list={REJECT_REASONS} value={reason} onPick={setReason} label="Chọn nhanh lý do" />
            <textarea
              id="ly-do-tu-choi"
              ref={reasonRef}
              className={clsx('input', reasonErr && 'border-danger')}
              rows={2}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="VD: Sai vùng nhận tin — thêm xã Bảo Lâm"
              aria-invalid={!!reasonErr}
              aria-describedby="loi-ly-do-tu-choi"
            />
            <FieldError id="loi-ly-do-tu-choi">{reasonErr}</FieldError>
          </div>
        )}
      </div>
    </Modal>
  );
}

/**
 * Gia hạn (thiên tai kéo dài) / kết thúc sớm (hết nguy hiểm) một cảnh báo đang hiệu lực — người duyệt ký PIN. Thời gian gia
 * hạn chọn bằng chip; lý do kết thúc chọn nhanh / tự ghi (người dân thấy "đã kết thúc"). Lỗi ngay dưới ô.
 */
export function ManageModal({ b, mode, onClose }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const online = useOnline();
  const [hours, setHours] = useState(24);
  const [note, setNote] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [serverErr, setServerErr] = useState(null);
  const pinRef = useRef(null);
  const noteRef = useRef(null);
  const end = mode === 'end';
  const noteErr = end && tried && note.trim().length < 3 ? 'Ghi lý do / thông báo kết thúc (ít nhất 3 ký tự)' : null;
  const pinErr = serverErr || (tried && !PIN_RE.test(pin) ? 'Nhập mã PIN 4–8 chữ số' : null);

  const run = async () => {
    setServerErr(null);
    const badNote = end && note.trim().length < 3;
    if (badNote || !PIN_RE.test(pin)) {
      setTried(true);
      (badNote ? noteRef : pinRef).current?.focus();
      return;
    }
    setBusy(true);
    try {
      await api(`/alerts/broadcasts/${b.id}/${end ? 'end' : 'extend'}`, { method: 'POST', body: end ? { pin, note: note.trim() } : { pin, hours } });
      toast({ tone: 'good', title: end ? `Đã kết thúc cảnh báo ${b.code}` : `Đã gia hạn cảnh báo ${b.code} thêm ${hours} giờ` });
      qc.invalidateQueries({ queryKey: ['broadcasts'] });
      onClose();
    } catch (e) {
      const m = pinMessage(e);
      if (m) {
        setServerErr(m);
        setPin('');
        pinRef.current?.focus();
      } else toast({ tone: 'danger', title: 'Không thực hiện được', body: e.message });
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
          <button type="button" className={clsx('btn-ghost', BIG)} onClick={onClose} disabled={busy}>Huỷ</button>
          <button
            type="button"
            className={clsx(end ? 'btn-danger' : 'btn-primary', 'font-bold', BIG)}
            disabled={busy || !online}
            title={!online ? OFFLINE : undefined}
            onMouseDown={(e) => e.preventDefault()}
            onClick={run}
          >
            {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : end ? <BellOff size={15} aria-hidden="true" /> : <TimerReset size={15} aria-hidden="true" />}
            {end ? 'Kết thúc cảnh báo' : `Gia hạn ${hours} giờ`}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <div className="rounded-lg bg-panel2 p-2.5">
          <b className="[overflow-wrap:anywhere]">{b.title}</b>
          <div className="text-xs text-muted">Đang hiệu lực đến {dateTime(b.valid_until)}</div>
        </div>
        {end ? (
          <>
            <p className="text-ink-2">Cảnh báo thôi hiện ngay trên cổng công khai, “Tôi đang ở đâu?”, bản nhẹ; danh sách cảnh báo của người dân ghi “đã kết thúc”.</p>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ly-do-ket-thuc" className="font-medium">Lý do / thông báo kết thúc *</label>
              <Chips list={END_NOTES} value={note} onPick={setNote} label="Chọn nhanh lý do kết thúc" />
              <input
                id="ly-do-ket-thuc"
                ref={noteRef}
                className={clsx('input tap', noteErr && 'border-danger')}
                maxLength={300}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="VD: Nước đã rút, dỡ bỏ lệnh sơ tán"
                aria-invalid={!!noteErr}
                aria-describedby="loi-ly-do-ket-thuc"
              />
              <FieldError id="loi-ly-do-ket-thuc">{noteErr}</FieldError>
            </div>
          </>
        ) : (
          <div>
            <div className="mb-1 font-medium" id="gia-han-them">Gia hạn thêm (tính từ hạn hiện tại)</div>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby="gia-han-them">
              {ALERT_VALID_HOURS.map(([h, label]) => (
                <button
                  key={h}
                  type="button"
                  role="radio"
                  aria-checked={hours === h}
                  className={clsx('chip tap min-h-[36px] border px-3', hours === h ? 'border-accent bg-accent text-white' : 'border-line bg-panel2 text-ink-2 hover:bg-panel')}
                  onClick={() => setHours(h)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        <PinField value={pin} onChange={(v) => { setPin(v); setServerErr(null); }} error={pinErr} inputRef={pinRef} />
      </div>
    </Modal>
  );
}
