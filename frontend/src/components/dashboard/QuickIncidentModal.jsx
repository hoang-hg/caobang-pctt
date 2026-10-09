import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Copy, Crosshair, Loader2, PhoneCall, Send, X } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { useUnits } from '../../api/hooks';
import { useStore } from '../../app/store';
import { useAllowedCodes } from '../../rbac/usePermission';
import { Modal } from '../common/ui';
import { INCIDENT, PRIORITY, VULNERABLE } from '../../utils/labels';
import { unitLabel } from './CommuneView';

const STEPS = ['Loại sự cố', 'Địa điểm', 'Mức độ & nhu cầu'];
const NEEDS = ['Xuồng / ca nô', 'Máy xúc, máy ủi thông tuyến', 'Lương thực, nước uống', 'Y tế, sơ cứu', 'Di dời người già, trẻ em'];
const EMPTY = { type: '', code: '', place: '', gps: null, priority: null, trapped: '', vulnerable: [], needs: [], phone: '', note: '' };
const NO_GPS = 'Phiếu sẽ định vị theo tên xóm / xã — trực ban cần xác minh toạ độ trước khi điều động';
// Mã tin gốc (external_id, tối đa 120 ký tự) cho một lần báo cáo; randomUUID chỉ có ở https / localhost
const newReportId = () => `bao-cao-nhanh-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`;

/**
 * Báo cáo nhanh của cán bộ → TẠO PHIẾU SOS THẬT (POST /sos, nguồn "Cán bộ"), cùng đường với ô tiếp nhận ở Điều hành
 * cứu hộ: máy chủ kiểm tra quyền theo xã của vị trí, phát sự kiện, ghi nhật ký; phiếu hiện ngay ở Kanban. Không có GPS
 * → máy chủ định vị theo tên xóm / xã trong nội dung. Chỉ báo "đã tạo" khi máy chủ trả mã phiếu.
 */
export default function QuickIncidentModal({ open, onClose }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const me = useStore((s) => s.auth?.user);
  const { data: units = [] } = useUnits();
  const allowed = useAllowedCodes('sos', 'create');
  const choices = units.filter((u) => !allowed || allowed.includes(u.code));
  const [step, setStep] = useState(0);
  const [f, setF] = useState(EMPTY);
  const [locating, setLocating] = useState(false);
  const [sending, setSending] = useState(false); // chống bấm đúp → 2 phiếu trùng
  const [failure, setFailure] = useState(null); // { network: true } | { network: false, message }
  const [reportId, setReportId] = useState(null);

  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const toggleIn = (key, v) => setF((x) => ({ ...x, [key]: x[key].includes(v) ? x[key].filter((y) => y !== v) : [...x[key], v] }));
  const code = f.code || (choices.length === 1 ? choices[0].code : '');
  const unit = units.find((u) => u.code === code);
  const where = [f.place.trim(), unitLabel(unit)].filter(Boolean).join(', ');
  const trapped = f.trapped === '' ? null : Number(f.trapped);
  const message = f.type
    ? [
        `${INCIDENT[f.type]} tại ${where || '(chưa rõ địa điểm)'}`,
        trapped != null && `${trapped} người cần hỗ trợ`,
        f.note.trim(),
        f.needs.length > 0 && `Cần: ${f.needs.join(', ')}`,
        `(Báo cáo nhanh của cán bộ${me?.full_name ? ` ${me.full_name}` : ''})`,
      ].filter(Boolean).join('. ')
    : '';
  const valid = [!!f.type, !!code, f.priority != null && (trapped == null || (Number.isInteger(trapped) && trapped >= 0))];

  const close = () => {
    setStep(0);
    setF(EMPTY);
    setFailure(null);
    setReportId(null);
    onClose();
  };

  // Vị trí lấy MỘT LẦN khi cán bộ bấm (đang đứng ở hiện trường) — không theo dõi vị trí liên tục
  const locate = () => {
    if (!navigator.geolocation) {
      toast({ tone: 'warn', title: 'Thiết bị không hỗ trợ định vị', body: NO_GPS });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        set({ gps: { lat: +pos.coords.latitude.toFixed(6), lon: +pos.coords.longitude.toFixed(6), acc: Math.round(pos.coords.accuracy) } });
      },
      () => {
        setLocating(false);
        toast({ tone: 'warn', title: 'Không lấy được vị trí', body: NO_GPS });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  // Gửi không được (mất sóng / máy chủ báo lỗi): KHÔNG lưu chờ "tự đồng bộ" — không có cơ chế gửi bù, phiếu sẽ nằm
  // mãi trên máy trong khi cán bộ tưởng đã báo. Giữ nguyên form, nói rõ CHƯA gửi, cho sao chép nội dung để báo trực ban
  // qua điện thoại / Zalo (như "Sao chép nội dung lệnh" khi điều động) và gửi lại khi có sóng.
  const submit = async () => {
    setSending(true);
    setFailure(null);
    // Mã tin của báo cáo này — giữ nguyên qua các lần gửi lại: lần trước đã tới máy chủ (chỉ mất phản hồi) thì máy chủ
    // trả phiếu đã có (duplicate) thay vì tạo phiếu thứ hai — ràng buộc (source, external_id), services/sos.create_ticket
    const externalId = reportId || newReportId();
    setReportId(externalId);
    try {
      if (navigator.onLine === false) throw new TypeError('offline');
      const t = await api('/sos', {
        method: 'POST',
        body: {
          raw_message: message,
          source: 'CAN_BO',
          reporter_name: me?.full_name || null,
          reporter_phone: f.phone.trim() || null,
          lat: f.gps?.lat ?? null,
          lon: f.gps?.lon ?? null,
          incident_type: f.type,
          priority: f.priority,
          trapped_count: trapped,
          vulnerable: f.vulnerable,
          address: where || null,
          external_id: externalId,
        },
      });
      if (t.duplicate) {
        toast({ tone: 'info', title: `Phiếu ${t.code} đã có trên hệ thống`, body: 'Lần gửi trước đã tới máy chủ — không tạo phiếu thứ hai. Sửa thông tin (nếu cần) ở Điều hành cứu hộ.' });
      } else {
        toast({ tone: 'good', title: `Đã tạo phiếu ${t.code}`, body: `${INCIDENT[t.incident_type]} – ${t.address || where}. Trực ban xử lý ở Điều hành cứu hộ.` });
      }
      if (t.possible_duplicates?.length) {
        toast({ tone: 'warn', title: `${t.code} có thể trùng với ${t.possible_duplicates.join(', ')}`, body: 'Kiểm tra trước khi điều động — tránh điều 2 đội tới cùng một nơi.', duration: 12000 });
      }
      ['sos', 'kpis', 'map-layers'].forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
      close();
    } catch (e) {
      // ApiError = máy chủ đã nhận và từ chối (ngoài phạm vi xã, không định vị được…); lỗi khác = không tới được máy chủ
      setFailure(e instanceof ApiError ? { network: false, message: e.message } : { network: true });
    } finally {
      setSending(false);
    }
  };

  const copyReport = () => {
    const text = [
      `[SOS – CHƯA vào hệ thống] ${message}`,
      f.gps && `Toạ độ: ${f.gps.lat}, ${f.gps.lon} (sai số ~${f.gps.acc} m)`,
      f.priority && `Mức ưu tiên: ${PRIORITY[f.priority].label}`,
      f.phone.trim() && `SĐT hiện trường: ${f.phone.trim()}`,
    ].filter(Boolean).join('\n');
    if (!navigator.clipboard) {
      toast({ tone: 'danger', title: 'Không sao chép được — chép tay nội dung trong hộp thoại' });
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => toast({ tone: 'good', title: 'Đã sao chép nội dung báo cáo', body: 'Dán vào tin nhắn / Zalo gửi trực ban ngay' }),
      () => toast({ tone: 'danger', title: 'Không sao chép được — chép tay nội dung trong hộp thoại' }),
    );
  };

  const pill = (active) => clsx(
    'rounded-lg border px-2.5 py-2 text-left text-xs font-semibold transition-colors',
    active ? 'border-accent bg-accent/15 text-ink ring-1 ring-accent' : 'border-line bg-panel2/50 text-ink-2 hover:bg-panel2',
  );

  return (
    <Modal
      open={open}
      onClose={close}
      title="Báo cáo nhanh hiện trường → tạo phiếu SOS"
      footer={
        <>
          {step > 0 && (
            <button type="button" className="btn-ghost mr-auto text-xs" onClick={() => setStep(step - 1)} disabled={sending}>
              <ChevronLeft size={14} /> Quay lại
            </button>
          )}
          <button type="button" className="btn-ghost text-xs" onClick={close} disabled={sending}>
            <X size={14} /> Huỷ
          </button>
          {step < 2 ? (
            <button type="button" className="btn-primary text-xs" onClick={() => setStep(step + 1)} disabled={!valid[step]}>
              Tiếp <ChevronRight size={14} />
            </button>
          ) : (
            <button type="button" className="btn-danger text-xs font-bold" onClick={submit} disabled={!valid.every(Boolean) || sending}>
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} {failure ? 'Gửi lại' : 'Tạo phiếu SOS'}
            </button>
          )}
        </>
      }
    >
      <ol className="mb-3 flex flex-wrap gap-1.5 text-[11px]">
        {STEPS.map((s, i) => (
          <li key={s} className={clsx('chip px-2 py-0.5', i === step ? 'bg-accent text-white' : i < step ? 'bg-good/15 text-good' : 'bg-panel2 text-muted')}>
            {i < step && <Check size={11} />} {i + 1}. {s}
          </li>
        ))}
      </ol>

      {!choices.length && (
        <p className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs text-danger">Tài khoản chưa được giao quyền tạo phiếu SOS ở xã/phường nào.</p>
      )}

      {failure && (
        <div role="alert" className="mb-3 flex flex-col gap-2 rounded-lg border border-danger/50 bg-danger/10 p-3 text-xs">
          <p className="flex items-start gap-1.5 font-bold text-danger">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              CHƯA gửi được phiếu SOS —{' '}
              {failure.network ? 'không kết nối được tới máy chủ (mạng yếu / mất sóng).' : failure.message}
            </span>
          </p>
          {failure.network && (
            <p className="text-ink-2">
              Báo ngay cho trực ban qua điện thoại / Zalo bằng nội dung bên dưới. Khi có sóng bấm <b>Gửi lại</b> — nếu lần gửi
              trước thực ra đã tới máy chủ, hệ thống trả lại phiếu đã có, không tạo phiếu trùng.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost px-2.5 py-1 text-xs" onClick={copyReport}>
              <Copy size={13} /> Sao chép nội dung báo cáo
            </button>
            {failure.network && (
              <a href="tel:112" className="btn-ghost px-2.5 py-1 text-xs">
                <PhoneCall size={13} /> Gọi 112
              </a>
            )}
          </div>
        </div>
      )}

      {step === 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Object.entries(INCIDENT).map(([key, label]) => (
            <button key={key} type="button" className={pill(f.type === key)} aria-pressed={f.type === key} onClick={() => set({ type: key })}>
              {label}
            </button>
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-3 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-muted">Xã / phường *</span>
            <select className="input text-xs" value={code} onChange={(e) => set({ code: e.target.value })}>
              {choices.length !== 1 && <option value="">— Chọn xã/phường —</option>}
              {choices.map((u) => <option key={u.code} value={u.code}>{unitLabel(u)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted">Xóm / địa danh / mô tả vị trí</span>
            <input className="input text-xs" value={f.place} onChange={(e) => set({ place: e.target.value })} placeholder="VD: Xóm Nà Pò, cạnh ngầm tràn" maxLength={200} />
          </label>
          <div className="flex flex-col gap-1.5 rounded-lg border border-line p-2.5">
            <button type="button" className="btn-ghost self-start text-xs" onClick={locate} disabled={locating}>
              {locating ? <Loader2 size={13} className="animate-spin" /> : <Crosshair size={13} />} Tôi đang ở hiện trường — lấy vị trí hiện tại
            </button>
            {f.gps ? (
              <span className="text-ink-2">
                Toạ độ: <b className="font-mono">{f.gps.lat}, {f.gps.lon}</b> (sai số ~{f.gps.acc} m) — phiếu gán theo vị trí này.{' '}
                <button type="button" className="text-accent hover:underline" onClick={() => set({ gps: null })}>Bỏ toạ độ</button>
              </span>
            ) : (
              <span className="text-muted">Không lấy toạ độ: {NO_GPS.toLowerCase()}.</span>
            )}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3 text-xs">
          <div className="flex flex-col gap-1">
            <span className="text-muted">Mức ưu tiên *</span>
            <div className="grid gap-1.5 sm:grid-cols-3">
              {[1, 2, 3].map((p) => (
                <button key={p} type="button" className={pill(f.priority === p)} aria-pressed={f.priority === p} onClick={() => set({ priority: p })}>
                  <span className={clsx('chip mr-1 px-1.5 py-0 text-[10px]', PRIORITY[p].cls)}>{PRIORITY[p].short}</span>
                  {PRIORITY[p].label.split('·')[1]?.trim()}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-muted">Số người cần hỗ trợ</span>
              <input className="input text-xs" type="number" min={0} step={1} inputMode="numeric" value={f.trapped} onChange={(e) => set({ trapped: e.target.value })} placeholder="Chưa rõ thì để trống" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted">SĐT liên hệ tại hiện trường</span>
              <input className="input text-xs" type="tel" inputMode="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="Không bắt buộc" maxLength={20} />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted">Nhóm yếu thế:</span>
            {Object.entries(VULNERABLE).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={f.vulnerable.includes(key)}
                className={clsx('chip px-2 py-0.5', f.vulnerable.includes(key) ? 'bg-danger text-white' : 'bg-panel2 text-ink-2')}
                onClick={() => toggleIn('vulnerable', key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted">Cần hỗ trợ:</span>
            {NEEDS.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={f.needs.includes(n)}
                className={clsx('chip px-2 py-0.5', f.needs.includes(n) ? 'bg-accent text-white' : 'bg-panel2 text-ink-2')}
                onClick={() => toggleIn('needs', n)}
              >
                {n}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-muted">Mô tả thêm</span>
            <textarea className="input min-h-[64px] text-xs" value={f.note} onChange={(e) => set({ note: e.target.value })} maxLength={1000} placeholder="Tình trạng hiện trường, đường tiếp cận…" />
          </label>
          <div className="rounded-lg bg-panel2 p-2.5 text-[11px] text-ink-2">
            <b className="text-ink">Nội dung phiếu:</b> {message}
          </div>
        </div>
      )}
    </Modal>
  );
}
