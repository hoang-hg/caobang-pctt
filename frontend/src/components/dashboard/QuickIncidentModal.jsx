import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  AlertTriangle, Check, ChevronLeft, ChevronRight, CloudOff, Copy, Crosshair, Loader2, Minus, PhoneCall, Plus, Send, X,
} from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { useUnits } from '../../api/hooks';
import { useStore } from '../../app/store';
import { useAllowedCodes } from '../../rbac/usePermission';
import { FieldError, Modal } from '../common/ui';
import { INCIDENT, PRIORITY, VULNERABLE } from '../../utils/labels';
import { useOnline } from '../../utils/useOnline';
import { unitLabel } from './CommuneView';

const STEPS = ['Loại sự cố', 'Địa điểm', 'Mức độ & nhu cầu'];
const STEP_FIELDS = [['type'], ['code'], ['priority', 'trapped', 'phone']];
const NEEDS = ['Xuồng / ca nô', 'Máy xúc, máy ủi thông tuyến', 'Lương thực, nước uống', 'Y tế, sơ cứu', 'Di dời người già, trẻ em'];
const EMPTY = { type: '', code: '', place: '', gps: null, priority: null, trapped: '', vulnerable: [], needs: [], phone: '', note: '' };
const NO_GPS = 'Phiếu sẽ định vị theo tên xóm / xã — trực ban cần xác minh toạ độ trước khi điều động';
const MAX_TRAPPED = 10_000; // như SosIn.trapped_count (backend api/v1/sos.py)
const GPS_ROUGH_M = 300; // sai số lớn hơn → nhắc mô tả thêm vị trí
// Số điện thoại Việt Nam: 0xxxxxxxxx / +84xxxxxxxxx (di động 10 số, cố định 10–11 số); bỏ dấu cách, chấm, gạch
const PHONE_RE = /^(?:\+?84|0)\d{9,10}$/;
const cleanPhone = (s) => s.replace(/[\s.\-()]/g, '');
// Mã tin gốc (external_id, tối đa 120 ký tự) cho một lần báo cáo; randomUUID chỉ có ở https / localhost
const newReportId = () => `bao-cao-nhanh-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`;

/**
 * Báo cáo nhanh của cán bộ → TẠO PHIẾU SOS THẬT (POST /sos, nguồn "Cán bộ"), cùng đường với ô tiếp nhận ở Điều hành
 * cứu hộ: máy chủ kiểm tra quyền theo xã của vị trí, phát sự kiện, ghi nhật ký; phiếu hiện ngay ở Kanban. Không có GPS
 * → máy chủ định vị theo tên xóm / xã trong nội dung. Chỉ báo "đã tạo" khi máy chủ trả mã phiếu.
 * Form 3 bước cho điện thoại: chọn bằng nút to, ít gõ (số người có nút −/+); bấm "Tiếp" khi còn thiếu → hiện lỗi ngay
 * dưới ô thiếu và đưa con trỏ tới đó (không khoá nút mà không nói vì sao); số người, số điện thoại kiểm tra ngay khi nhập.
 */
export default function QuickIncidentModal({ open, onClose }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const me = useStore((s) => s.auth?.user);
  const online = useOnline();
  const { data: units = [] } = useUnits();
  const allowed = useAllowedCodes('sos', 'create');
  const choices = units.filter((u) => !allowed || allowed.includes(u.code));
  const [step, setStep] = useState(0);
  const [f, setF] = useState(EMPTY);
  const [shown, setShown] = useState({}); // ô đã được "chạm" (rời ô / bấm Tiếp) → hiện lỗi của ô đó
  const [locating, setLocating] = useState(false);
  const [sending, setSending] = useState(false); // chống bấm đúp → 2 phiếu trùng
  const [failure, setFailure] = useState(null); // { network: true } | { network: false, message }
  const [reportId, setReportId] = useState(null);
  const refs = { type: useRef(null), code: useRef(null), priority: useRef(null), trapped: useRef(null), phone: useRef(null) };

  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const touch = (...keys) => setShown((s) => ({ ...s, ...Object.fromEntries(keys.map((key) => [key, true])) }));
  const toggleIn = (key, v) => setF((x) => ({ ...x, [key]: x[key].includes(v) ? x[key].filter((y) => y !== v) : [...x[key], v] }));
  const code = f.code || (choices.length === 1 ? choices[0].code : '');
  const unit = units.find((u) => u.code === code);
  const where = [f.place.trim(), unitLabel(unit)].filter(Boolean).join(', ');
  const trapped = f.trapped === '' ? null : Number(f.trapped);
  const phone = cleanPhone(f.phone);
  const message = f.type
    ? [
        `${INCIDENT[f.type]} tại ${where || '(chưa rõ địa điểm)'}`,
        trapped != null && `${trapped} người cần hỗ trợ`,
        f.note.trim(),
        f.needs.length > 0 && `Cần: ${f.needs.join(', ')}`,
        `(Báo cáo nhanh của cán bộ${me?.full_name ? ` ${me.full_name}` : ''})`,
      ].filter(Boolean).join('. ')
    : '';

  const errors = {
    type: !f.type && 'Chọn loại sự cố',
    code: !code && 'Chọn xã / phường nơi xảy ra sự cố',
    priority: f.priority == null && 'Chọn mức ưu tiên',
    trapped: trapped != null && !(Number.isInteger(trapped) && trapped >= 0 && trapped <= MAX_TRAPPED)
      && `Số người là số nguyên từ 0 đến ${MAX_TRAPPED.toLocaleString('vi-VN')}`,
    phone: phone && !PHONE_RE.test(phone) && 'Số điện thoại chưa đúng — VD 0912 345 678',
  };
  // Số người sai hiện NGAY khi gõ; ô khác hiện lỗi sau khi rời ô hoặc bấm Tiếp / Tạo phiếu
  const err = (key) => (key === 'trapped' || shown[key] ? errors[key] || null : null);
  const stepValid = (i) => STEP_FIELDS[i].every((key) => !errors[key]);

  // "Tiếp" / "Tạo phiếu" khi còn thiếu: hiện lỗi các ô của bước + đưa con trỏ tới ô lỗi đầu tiên
  const guard = (i) => {
    const bad = STEP_FIELDS[i].filter((key) => errors[key]);
    if (!bad.length) return true;
    touch(...STEP_FIELDS[i]);
    refs[bad[0]].current?.focus();
    return false;
  };
  const next = () => {
    if (guard(step)) setStep(step + 1);
  };

  const close = () => {
    setStep(0);
    setF(EMPTY);
    setShown({});
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
    if (!guard(2)) return;
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
          reporter_phone: phone || null,
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
      phone && `SĐT hiện trường: ${phone}`,
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

  const stepTrapped = (d) => {
    const n = Math.min(MAX_TRAPPED, Math.max(0, (Number.isInteger(trapped) ? trapped : 0) + d));
    set({ trapped: String(n) });
  };

  const pill = (active, invalid) => clsx(
    'min-h-[48px] rounded-lg border px-3 py-2 text-left text-sm font-semibold transition-colors sm:min-h-[40px] sm:text-xs',
    active ? 'border-accent bg-accent/15 text-ink ring-1 ring-accent' : invalid ? 'border-danger/60 bg-panel2/50 text-ink-2' : 'border-line bg-panel2/50 text-ink-2 hover:bg-panel2',
  );
  const toggleChip = (active, tone) => clsx(
    'chip min-h-[36px] px-3 py-1 text-xs',
    active ? (tone === 'danger' ? 'bg-danger text-white' : 'bg-accent text-white') : 'border-line bg-panel2 text-ink-2',
  );
  const bigBtn = 'min-h-[44px] text-sm sm:min-h-0 sm:text-xs';

  return (
    <Modal
      open={open}
      onClose={close}
      title="Báo cáo nhanh hiện trường → tạo phiếu SOS"
      footer={
        // Điện thoại: nút chính chiếm trọn hàng dưới cùng (gần ngón cái, không gãy chữ); máy tính: một hàng như cũ
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
          {step > 0 && (
            <button type="button" className={clsx('btn-ghost sm:mr-auto', bigBtn)} onClick={() => setStep(step - 1)} disabled={sending}>
              <ChevronLeft size={15} /> Quay lại
            </button>
          )}
          <button type="button" className={clsx('btn-ghost', step === 0 && 'col-span-2', bigBtn)} onClick={close} disabled={sending}>
            <X size={15} /> Huỷ
          </button>
          {step < 2 ? (
            <button type="button" className={clsx('btn-primary col-span-2', bigBtn)} onClick={next}>
              Tiếp <ChevronRight size={15} />
            </button>
          ) : (
            <button type="button" className={clsx('btn-danger col-span-2 font-bold', bigBtn)} onClick={submit} disabled={sending}>
              {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} {failure ? 'Gửi lại' : 'Tạo phiếu SOS'}
            </button>
          )}
        </div>
      }
    >
      {/* Bước: bấm được để quay lại bước đã qua (không nhảy cóc qua bước chưa điền) */}
      <ol className="mb-3 flex flex-wrap gap-1.5 text-[11px]" aria-label="Các bước">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              disabled={i > step || sending}
              onClick={() => setStep(i)}
              aria-current={i === step ? 'step' : undefined}
              className={clsx(
                'chip min-h-[32px] px-2.5 py-0.5',
                i === step ? 'bg-accent text-white' : i < step ? 'bg-good/15 text-good hover:bg-good/25' : 'bg-panel2 text-muted',
              )}
            >
              {i < step && stepValid(i) && <Check size={11} aria-hidden="true" />} {i + 1}. {s}
            </button>
          </li>
        ))}
      </ol>

      {!choices.length && (
        <p className="mb-3 rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs text-danger">Tài khoản chưa được giao quyền tạo phiếu SOS ở xã/phường nào.</p>
      )}

      {!online && !failure && (
        <p role="status" className="mb-3 flex items-start gap-1.5 rounded-lg border border-line bg-panel2 p-2.5 text-xs text-ink">
          <CloudOff size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            <b>Đang mất mạng</b> — vẫn điền được, nhưng phiếu chỉ gửi được khi có sóng. Việc khẩn: sao chép nội dung ở bước cuối
            gửi trực ban, hoặc gọi 112.
          </span>
        </p>
      )}

      {failure && (
        <div role="alert" className="mb-3 flex flex-col gap-2 rounded-lg border border-danger/50 bg-danger/10 p-3 text-xs">
          <p className="flex items-start gap-1.5 font-bold text-danger">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
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
            <button type="button" className="btn-ghost min-h-[40px] px-3 py-1 text-xs" onClick={copyReport}>
              <Copy size={13} /> Sao chép nội dung báo cáo
            </button>
            {failure.network && (
              <a href="tel:112" className="btn-ghost min-h-[40px] px-3 py-1 text-xs">
                <PhoneCall size={13} /> Gọi 112
              </a>
            )}
          </div>
        </div>
      )}

      {step === 0 && (
        <fieldset aria-describedby="loi-loai">
          <legend className="mb-2 text-xs text-muted">Loại sự cố *</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(INCIDENT).map(([key, label], i) => (
              <button
                key={key}
                ref={i === 0 ? refs.type : undefined}
                type="button"
                className={pill(f.type === key, !!err('type'))}
                aria-pressed={f.type === key}
                onClick={() => set({ type: key })}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-2"><FieldError id="loi-loai">{err('type')}</FieldError></div>
        </fieldset>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-3 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-muted">Xã / phường *</span>
            <select
              ref={refs.code}
              className={clsx('input min-h-[44px] text-sm sm:min-h-0 sm:text-xs', err('code') && 'border-danger')}
              value={code}
              onChange={(e) => set({ code: e.target.value })}
              onBlur={() => touch('code')}
              aria-invalid={!!err('code')}
              aria-describedby="loi-xa"
            >
              {choices.length !== 1 && <option value="">— Chọn xã/phường —</option>}
              {choices.map((u) => <option key={u.code} value={u.code}>{unitLabel(u)}</option>)}
            </select>
            <FieldError id="loi-xa">{err('code')}</FieldError>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted">Xóm / địa danh / mô tả vị trí</span>
            <input className="input min-h-[44px] text-sm sm:min-h-0 sm:text-xs" value={f.place} onChange={(e) => set({ place: e.target.value })} placeholder="VD: Xóm Nà Pò, cạnh ngầm tràn" maxLength={200} />
          </label>
          <div className="flex flex-col gap-1.5 rounded-lg border border-line p-2.5">
            <button type="button" className="btn-ghost min-h-[44px] self-start text-xs sm:min-h-0" onClick={locate} disabled={locating}>
              {locating ? <Loader2 size={14} className="animate-spin" /> : <Crosshair size={14} />} Tôi đang ở hiện trường — lấy vị trí hiện tại
            </button>
            {f.gps ? (
              <span className="text-ink-2">
                Toạ độ: <b className="font-mono">{f.gps.lat}, {f.gps.lon}</b> (sai số ~{f.gps.acc} m) — phiếu gán theo vị trí này.{' '}
                <button type="button" className="text-accent hover:underline" onClick={() => set({ gps: null })}>Bỏ toạ độ</button>
                {f.gps.acc > GPS_ROUGH_M && (
                  <span className="mt-1 block font-semibold text-warn">Sai số lớn — mô tả thêm xóm / địa danh ở ô trên để đội tìm đúng chỗ.</span>
                )}
              </span>
            ) : (
              <span className="text-muted">Không lấy toạ độ: {NO_GPS.toLowerCase()}.</span>
            )}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3 text-xs">
          <fieldset className="flex flex-col gap-1" aria-describedby="loi-uu-tien">
            <legend className="mb-1 text-muted">Mức ưu tiên *</legend>
            <div className="grid gap-1.5 sm:grid-cols-3">
              {[1, 2, 3].map((p, i) => (
                <button
                  key={p}
                  ref={i === 0 ? refs.priority : undefined}
                  type="button"
                  className={pill(f.priority === p, !!err('priority'))}
                  aria-pressed={f.priority === p}
                  onClick={() => set({ priority: p })}
                >
                  <span className={clsx('chip mr-1 px-1.5 py-0 text-[10px]', PRIORITY[p].cls)}>{PRIORITY[p].short}</span>
                  {PRIORITY[p].label.split('·')[1]?.trim()}
                </button>
              ))}
            </div>
            <FieldError id="loi-uu-tien">{err('priority')}</FieldError>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="so-nguoi" className="text-muted">Số người cần hỗ trợ</label>
              <div className="flex items-stretch gap-1.5">
                <button type="button" className="btn-ghost h-11 w-11 shrink-0 p-0" onClick={() => stepTrapped(-1)} aria-label="Bớt 1 người">
                  <Minus size={16} />
                </button>
                <input
                  id="so-nguoi"
                  ref={refs.trapped}
                  className={clsx('input h-11 min-w-0 text-center font-mono text-sm', err('trapped') && 'border-danger')}
                  type="number"
                  min={0}
                  max={MAX_TRAPPED}
                  step={1}
                  inputMode="numeric"
                  value={f.trapped}
                  onChange={(e) => set({ trapped: e.target.value })}
                  placeholder="Chưa rõ"
                  aria-invalid={!!err('trapped')}
                  aria-describedby="loi-so-nguoi"
                />
                <button type="button" className="btn-ghost h-11 w-11 shrink-0 p-0" onClick={() => stepTrapped(1)} aria-label="Thêm 1 người">
                  <Plus size={16} />
                </button>
              </div>
              <FieldError id="loi-so-nguoi">{err('trapped')}</FieldError>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="sdt-hien-truong" className="text-muted">SĐT liên hệ tại hiện trường</label>
              <input
                id="sdt-hien-truong"
                ref={refs.phone}
                className={clsx('input h-11 text-sm', err('phone') && 'border-danger')}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={f.phone}
                onChange={(e) => set({ phone: e.target.value })}
                onBlur={() => touch('phone')}
                placeholder="Không bắt buộc"
                maxLength={20}
                aria-invalid={!!err('phone')}
                aria-describedby="loi-sdt"
              />
              <FieldError id="loi-sdt">{err('phone')}</FieldError>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted">Nhóm yếu thế:</span>
            {Object.entries(VULNERABLE).map(([key, label]) => (
              <button key={key} type="button" aria-pressed={f.vulnerable.includes(key)} className={toggleChip(f.vulnerable.includes(key), 'danger')} onClick={() => toggleIn('vulnerable', key)}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted">Cần hỗ trợ:</span>
            {NEEDS.map((n) => (
              <button key={n} type="button" aria-pressed={f.needs.includes(n)} className={toggleChip(f.needs.includes(n))} onClick={() => toggleIn('needs', n)}>
                {n}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1">
            <span className="flex justify-between text-muted">
              Mô tả thêm <span className="font-mono">{f.note.length}/1000</span>
            </span>
            <textarea className="input min-h-[72px] text-sm sm:text-xs" value={f.note} onChange={(e) => set({ note: e.target.value })} maxLength={1000} placeholder="Tình trạng hiện trường, đường tiếp cận…" />
          </label>
          <div className="rounded-lg bg-panel2 p-2.5 text-[11px] text-ink-2">
            <b className="text-ink">Nội dung phiếu:</b> {message}
          </div>
          {!online && (
            <button type="button" className="btn-ghost min-h-[40px] self-start px-3 text-xs" onClick={copyReport}>
              <Copy size={13} /> Sao chép nội dung gửi trực ban
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
