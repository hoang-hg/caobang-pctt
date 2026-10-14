import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle, Bot, ChevronLeft, ChevronRight, Inbox, Loader2, Sparkles } from 'lucide-react';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { FieldError, Section, StepChips } from '../common/ui';
import QtyStepper from '../common/QtyStepper';
import { INCIDENT, PRIORITY, SOURCE, VULNERABLE } from '../../utils/labels';
import { risk, sosLevel } from '../../utils/risk';

const STEPS = ['Nội dung tin', 'Kiểm tra phân loại'];
const CHANNELS = ['ZALO', 'APP', 'HOTLINE', 'CAN_BO'];
const SLA = { 1: 3, 2: 15, 3: 60 };
const MIN_TEXT = 8;
const MAX_TRAPPED = 10_000; // như SosIn.trapped_count (backend)
// Số điện thoại Việt Nam: 0xxxxxxxxx / +84xxxxxxxxx (di động 10 số, cố định 10–11 số); bỏ dấu cách, chấm, gạch
const PHONE_RE = /^(?:\+?84|0)\d{9,10}$/;
const cleanPhone = (s) => s.replace(/[\s.\-()]/g, '');
// Chưa bóc tách / bóc tách lỗi: chưa chọn gì — trực ban không chọn thì máy chủ tự phân loại từ nội dung khi tạo phiếu
const EMPTY = { incident_type: null, priority: null, trapped_count: '', vulnerable: [] };

/**
 * Tiếp nhận đa kênh & bóc tách tin nhắn (thiết kế D.1) — form 2 bước: (1) kênh (nút to), SĐT người báo, nội dung tin;
 * (2) kết quả bóc tách SỬA ĐƯỢC (loại sự cố, mức ưu tiên kèm SLA, số người bằng nút −/+, nhóm yếu thế, địa bàn) rồi tạo phiếu.
 * Lỗi hiện ngay dưới ô (SĐT sai khi gõ; nội dung quá ngắn, số người ngoài khoảng khi bấm Tiếp / Tạo). Bóc tách lỗi (mất
 * mạng, máy chủ) → nói rõ, vẫn sang bước 2 để trực ban tự phân loại; mất mạng → không tạo phiếu được, nói lý do.
 */
export default function Intake({ online = true }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const [step, setStep] = useState(0);
  const [source, setSource] = useState('ZALO');
  const [phone, setPhone] = useState('');
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState(null); // kết quả bóc tách (null = chưa / không bóc tách được)
  const [parseError, setParseError] = useState(null);
  const [edit, setEdit] = useState(EMPTY);
  const [shown, setShown] = useState({}); // ô đã "chạm" (rời ô / bấm Tiếp) → hiện lỗi
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false); // chống bấm đúp → 2 phiếu SOS trùng
  const refs = { text: useRef(null), phone: useRef(null), trapped: useRef(null) };

  const ph = cleanPhone(phone);
  const n = Number(edit.trapped_count);
  const errors = {
    phone: ph && !PHONE_RE.test(ph) ? 'Số điện thoại chưa đúng — VD 0912 345 678' : null,
    text: text.trim().length < MIN_TEXT ? `Dán / ghi nội dung tin cầu cứu (ít nhất ${MIN_TEXT} ký tự)` : null,
    trapped: edit.trapped_count !== '' && !(Number.isInteger(n) && n >= 0 && n <= MAX_TRAPPED)
      ? `Số người là số nguyên từ 0 đến ${MAX_TRAPPED.toLocaleString('vi-VN')}` : null,
  };
  // SĐT sai → báo ngay khi gõ; nội dung → khi rời ô hoặc bấm Tiếp; số người → ngay khi gõ
  const err = (key) => (key === 'phone' || key === 'trapped' || shown[key] ? errors[key] : null);
  const touch = (...keys) => setShown((s) => ({ ...s, ...Object.fromEntries(keys.map((k) => [k, true])) }));

  const reset = () => {
    setStep(0); setText(''); setPhone(''); setParsed(null); setParseError(null); setEdit(EMPTY); setShown({});
  };
  const next = async () => {
    const bad = ['phone', 'text'].find((k) => errors[k]);
    if (bad) {
      touch('phone', 'text');
      refs[bad].current?.focus();
      return;
    }
    setBusy(true);
    setParseError(null);
    try {
      const p = await api('/sos/parse', { method: 'POST', body: { text } });
      setParsed(p);
      setEdit({ incident_type: p.incident_type, priority: p.priority, trapped_count: String(p.trapped_count ?? 0), vulnerable: p.vulnerable || [] });
    } catch (e) {
      // Không bóc tách được: vẫn sang bước 2, trực ban tự chọn — máy chủ bóc tách lại khi tạo phiếu nếu có thể
      setParsed(null);
      setParseError(navigator.onLine === false ? 'Đang mất mạng — chưa bóc tách được' : `Không bóc tách được: ${e.message}`);
    } finally {
      setBusy(false);
      setStep(1);
    }
  };
  const create = async () => {
    if (errors.trapped) {
      refs.trapped.current?.focus();
      return;
    }
    setCreating(true);
    try {
      const t = await api('/sos', {
        method: 'POST',
        body: {
          raw_message: text, source, reporter_phone: ph || null,
          // Chỉ gửi phần đã có (bóc tách / trực ban chọn); phần trống để máy chủ tự bóc tách từ nội dung
          ...(edit.incident_type && { incident_type: edit.incident_type }),
          ...(edit.priority && { priority: edit.priority }),
          ...(edit.trapped_count !== '' && { trapped_count: n }),
          ...((parsed || edit.vulnerable.length > 0) && { vulnerable: edit.vulnerable }),
        },
      });
      toast({ tone: 'good', title: `Đã tạo phiếu ${t.code}`, body: `${INCIDENT[t.incident_type]} – ${t.address}` });
      if (t.possible_duplicates?.length) {
        toast({ tone: 'warn', title: `${t.code} có thể trùng với ${t.possible_duplicates.join(', ')}`, body: 'Kiểm tra trước khi điều động — tránh điều 2 đội tới cùng một nơi.', duration: 12000 });
      }
      qc.invalidateQueries({ queryKey: ['sos'] });
      reset();
    } catch (e) {
      toast({ tone: 'danger', title: 'Không tạo được phiếu', body: e.message });
    } finally {
      setCreating(false);
    }
  };

  const chip = (on, tone) => clsx('chip tap min-h-[36px] border px-3 text-xs', on ? (tone || 'border-accent bg-accent text-white') : 'border-line bg-panel2 text-ink-2 hover:bg-panel');
  const big = 'tap min-h-[40px] text-xs sm:text-sm';

  return (
    <Section title="Tiếp nhận đa kênh & bóc tách tin nhắn" right={<Bot size={16} className="text-accent" aria-hidden="true" />}>
      <StepChips steps={STEPS} step={step} onStep={setStep} done={[!errors.text && !errors.phone]} disabled={busy || creating} />
      {step === 0 ? (
        <div className="flex flex-col gap-2.5 text-sm">
          <div>
            <div className="mb-1 text-xs font-medium text-muted" id="kenh-tiep-nhan">Kênh tiếp nhận</div>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby="kenh-tiep-nhan">
              {CHANNELS.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={source === s} className={chip(source === s)} onClick={() => setSource(s)}>{SOURCE[s]}</button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">SĐT người báo tin (nếu có)</span>
            <input
              ref={refs.phone}
              className={clsx('input', big, err('phone') && 'border-danger')}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="VD 0912 345 678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-invalid={!!err('phone')}
              aria-describedby="loi-sdt-tiep-nhan"
            />
            <FieldError id="loi-sdt-tiep-nhan">{err('phone')}</FieldError>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Nội dung tin cầu cứu *</span>
            <textarea
              ref={refs.text}
              className={clsx('input min-h-[96px] text-xs leading-relaxed', err('text') && 'border-danger')}
              placeholder="Dán tin nhắn (Zalo, SMS) hoặc ghi lời người gọi. VD: Nước ngập đến mái nhà ở xóm Pác Bó xã Trường Hà, 5 người có 1 cụ già và 2 trẻ em…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => text && touch('text')}
              aria-invalid={!!err('text')}
              aria-describedby="loi-noi-dung-tiep-nhan"
            />
            <FieldError id="loi-noi-dung-tiep-nhan">{err('text')}</FieldError>
          </label>
          <button type="button" className={clsx('btn-primary self-end', big)} onClick={next} disabled={busy} onMouseDown={(e) => e.preventDefault()}>
            {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />} Bóc tách & kiểm tra <ChevronRight size={14} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 text-xs">
          {parseError ? (
            <p role="alert" className="flex items-start gap-1.5 rounded-lg border border-serious/50 bg-serious/10 p-2 text-ink">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-serious" aria-hidden="true" />
              <span><b>{parseError}</b> — chọn loại sự cố, mức ưu tiên, số người nếu đã rõ; phần để trống máy chủ tự bóc tách từ nội dung khi tạo phiếu, định vị theo tên xóm / xã.</span>
            </p>
          ) : (
            <p className="font-semibold text-accent">
              Phân loại tự động ({parsed?.engine === 'rules' ? 'quy tắc' : 'mô hình AI'}) — kiểm tra, sửa nếu cần rồi tạo phiếu
            </p>
          )}
          <div>
            <div className="mb-1 font-medium text-muted" id="muc-uu-tien-tiep-nhan">Mức ưu tiên</div>
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-labelledby="muc-uu-tien-tiep-nhan">
              {[1, 2, 3].map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={edit.priority === p}
                  onClick={() => setEdit({ ...edit, priority: p })}
                  className={clsx('tap flex min-h-[48px] flex-col items-center justify-center rounded-lg border-2 px-1 text-center font-semibold', edit.priority === p ? clsx(risk(sosLevel(p)).chip, 'border-transparent') : 'border-line bg-panel2/50 text-ink-2')}
                >
                  <span>Cấp {p} · {PRIORITY[p].short}</span>
                  <span className="text-[10px] font-normal opacity-90">SLA {SLA[p]}′</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 font-medium text-muted" id="loai-su-co-tiep-nhan">Loại sự cố</div>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby="loai-su-co-tiep-nhan">
              {Object.entries(INCIDENT).map(([k, v]) => (
                <button key={k} type="button" role="radio" aria-checked={edit.incident_type === k} className={chip(edit.incident_type === k)} onClick={() => setEdit({ ...edit, incident_type: k })}>{v}</button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="so-nguoi-tiep-nhan" className="font-medium text-muted">Số người cần cứu / mắc kẹt</label>
            <QtyStepper
              id="so-nguoi-tiep-nhan"
              ref={refs.trapped}
              value={edit.trapped_count}
              onChange={(v) => setEdit({ ...edit, trapped_count: v })}
              min={0}
              max={MAX_TRAPPED}
              steps={[1, 5]}
              unit="người"
              invalid={!!err('trapped')}
              describedBy="loi-so-nguoi-tiep-nhan"
            />
            <FieldError id="loi-so-nguoi-tiep-nhan">{err('trapped')}</FieldError>
          </div>
          <div>
            <div className="mb-1 font-medium text-muted">Nhóm yếu thế</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(VULNERABLE).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={edit.vulnerable.includes(k)}
                  className={chip(edit.vulnerable.includes(k), 'border-danger bg-danger text-white')}
                  onClick={() => setEdit({ ...edit, vulnerable: edit.vulnerable.includes(k) ? edit.vulnerable.filter((x) => x !== k) : [...edit.vulnerable, k] })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-line bg-panel2/40 p-2">
            <span className="text-muted">Địa bàn: </span>
            <b className={clsx(!parsed?.place && 'text-serious')}>{parsed?.place ? parsed.place.name : 'Chưa xác định — cán bộ cần xác minh toạ độ trước khi điều động'}</b>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <button type="button" className={clsx('btn-ghost', big)} onClick={() => setStep(0)} disabled={creating}><ChevronLeft size={14} aria-hidden="true" /> Quay lại</button>
            <button
              type="button"
              className={clsx('btn-danger font-semibold', big)}
              onClick={create}
              disabled={creating || !online}
              title={!online ? 'Mất mạng — chưa tạo phiếu được; việc khẩn hãy gọi trực ban' : undefined}
              onMouseDown={(e) => e.preventDefault()}
            >
              {creating ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Inbox size={14} aria-hidden="true" />} Tạo phiếu SOS
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}
