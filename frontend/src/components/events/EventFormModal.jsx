import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Check, ChevronLeft, ChevronRight, Flag, Loader2, Search } from 'lucide-react';
import { api } from '../../api/client';
import { usePresets, useUnits } from '../../api/hooks';
import { useStore } from '../../app/store';
import { FieldError, Modal, StepChips } from '../common/ui';
import { foldVi } from '../../utils/format';
import { useOnline } from '../../utils/useOnline';
import { fromLocalInput, HAZARD, MAX_BACKDATE_DAYS, toLocalInput, when } from './eventFacts';
import { EVENT_HAZARD_CHOICES } from '../../utils/hazardScope';

const STEPS = ['Thông tin', 'Vùng ảnh hưởng'];
const BIG = 'tap min-h-[44px] text-sm sm:min-h-0';
const unitLabel = (u) => `${u.unit_type === 'phuong' ? 'Phường' : 'Xã'} ${u.name}`;
const KINDS = [['sos', 'phiếu SOS'], ['dispatch', 'lệnh điều động'], ['alerts', 'lệnh cảnh báo'], ['hazards', 'vùng nguy hiểm'], ['supplies', 'dòng sổ kho']];
const countText = (c) => KINDS.filter(([k]) => c?.[k]).map(([k, n]) => `${c[k]} ${n}`).join(', ');
/** Kết quả gắn bù / gỡ ra của API (mở đợt, đổi vùng, kết thúc lùi giờ) → một câu cho thông báo; không gắn / gỡ gì → undefined. */
const changeText = ({ attached, detached } = {}) => {
  const a = countText(attached);
  const d = countText(detached);
  const parts = [a && `Gắn bù ${a}`, d && `Gỡ khỏi đợt ${d} (ngoài vùng / ngoài thời gian của đợt)`].filter(Boolean);
  return parts.length ? parts.join('. ') : undefined;
};

/**
 * Mở / sửa đợt thiên tai (DB5) — 2 bước, lỗi hiện ngay dưới ô, con trỏ về ô lỗi:
 * 1. Thông tin: tên đợt, loại thiên tai (chạm chọn), bắt đầu "Bây giờ" hoặc "Đã bắt đầu từ…" (tối đa 30 ngày trước — phiếu, lệnh,
 *    cảnh báo… từ giờ đó được gắn bù), ghi chú.
 * 2. Vùng ảnh hưởng: Toàn tỉnh hoặc chọn xã/phường (chạm chọn, tìm không dấu, thêm cả nhóm lọc nhanh) + xem lại.
 * Sửa đợt: không đổi giờ bắt đầu; đổi vùng → gắn bù bản ghi các xã thêm vào, gỡ bản ghi của xã bỏ ra.
 */
export default function EventFormModal({ event, onClose, onSaved }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const online = useOnline();
  const { data: units = [] } = useUnits();
  const { data: presets = [] } = usePresets();
  const editing = !!event;
  const [step, setStep] = useState(0);
  const [name, setName] = useState(event?.name || '');
  const [hazard, setHazard] = useState(event?.hazard || '');
  const [startMode, setStartMode] = useState('now');
  const [startAt, setStartAt] = useState(() => toLocalInput(new Date(Date.now() - 3600_000)));
  const [note, setNote] = useState(event?.note || '');
  const [whole, setWhole] = useState(editing ? !event.admin_codes.length : true);
  const [codes, setCodes] = useState(() => new Set(event?.admin_codes || []));
  const [search, setSearch] = useState('');
  const [tried, setTried] = useState([false, false]);
  const [busy, setBusy] = useState(false);
  const refs = { name: useRef(null), hazard: useRef(null), start: useRef(null), area: useRef(null) };

  const sorted = useMemo(() => [...units].sort((a, b) => a.name.localeCompare(b.name, 'vi')), [units]);
  const names = useMemo(() => new Map(units.map((u) => [u.code, unitLabel(u)])), [units]);
  const nq = foldVi(search.trim());
  const shown = nq ? sorted.filter((u) => foldVi(u.name).includes(nq)) : sorted;
  const groups = presets.filter((p) => p.kind === 'luu_vuc');

  const now = Date.now();
  const startMs = startMode === 'now' ? now : Date.parse(startAt);
  const errors = {
    name: name.trim().length < 3 ? 'Ghi tên đợt (ít nhất 3 ký tự), VD "Mưa lũ ngày 12–15/9/2026"' : null,
    hazard: !hazard ? 'Chọn loại thiên tai' : null,
    start: editing || startMode === 'now' ? null
      : !startAt || Number.isNaN(startMs) ? 'Chọn giờ bắt đầu'
        : startMs > now + 60_000 ? 'Giờ bắt đầu không được ở tương lai'
          : startMs < now - MAX_BACKDATE_DAYS * 86400e3 ? `Tối đa ${MAX_BACKDATE_DAYS} ngày trước` : null,
    area: !whole && !codes.size ? 'Chọn ít nhất 1 xã/phường, hoặc chọn Toàn tỉnh' : null,
  };
  const stepFields = [['name', 'hazard', 'start'], ['area']];
  // Ô đã gõ / đã chọn → báo ngay; ô trống → báo khi bấm Tiếp / Lưu
  const err = (k) => {
    const s = stepFields.findIndex((f) => f.includes(k));
    const touched = { name: name !== (event?.name || ''), start: startMode === 'past' }[k];
    return tried[s] || touched ? errors[k] : null;
  };
  const firstBad = (s) => stepFields[s].find((k) => errors[k]);

  const next = () => {
    const bad = firstBad(0);
    if (bad) {
      setTried((t) => [true, t[1]]);
      refs[bad].current?.focus();
      return;
    }
    setStep(1);
  };
  const toggle = (code) => setCodes((s) => {
    const n = new Set(s);
    if (n.has(code)) n.delete(code); else n.add(code);
    return n;
  });
  const addGroup = (p) => setCodes((s) => new Set([...s, ...p.unit_codes]));
  const areaText = whole ? 'toàn tỉnh' : `${codes.size} xã/phường`;

  const submit = async () => {
    for (const s of [0, 1]) {
      const bad = firstBad(s);
      if (bad) {
        setTried(s === 0 ? [true, false] : [true, true]);
        setStep(s);
        requestAnimationFrame(() => refs[bad].current?.focus());
        return;
      }
    }
    setBusy(true);
    const area = whole ? [] : [...codes].sort();
    // Sửa đợt: chỉ gửi vùng khi vùng đổi — đổi vùng mới phải gắn bù / gỡ bản ghi
    const areaChanged = !editing || area.join() !== [...event.admin_codes].sort().join();
    const body = { name: name.trim(), note: note.trim() || null, ...(areaChanged && { admin_codes: area }) };
    try {
      const saved = editing
        ? await api(`/events/${encodeURIComponent(event.code)}`, { method: 'PATCH', body })
        : await api('/events', {
          method: 'POST',
          body: { ...body, hazard, ...(startMode === 'past' && { started_at: fromLocalInput(startAt) }) },
        });
      toast({
        tone: 'good',
        title: editing ? `Đã sửa đợt ${saved.code}` : `Đã mở đợt ${saved.code}`,
        body: changeText(saved) || (!editing && startMode === 'past' ? 'Không có bản ghi nào từ giờ bắt đầu để gắn bù' : undefined),
      });
      qc.invalidateQueries({ queryKey: ['events'] });
      qc.invalidateQueries({ queryKey: ['event-summary'] });
      onSaved?.(saved);
      onClose();
    } catch (e) {
      toast({ tone: 'danger', title: editing ? 'Không sửa được đợt' : 'Không mở được đợt', body: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={editing ? `Sửa đợt ${event.code}` : 'Mở đợt thiên tai'}
      footer={(
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
          {step === 1 && (
            <button type="button" className={clsx('btn-ghost sm:mr-auto', BIG)} onClick={() => setStep(0)} disabled={busy}>
              <ChevronLeft size={15} aria-hidden="true" /> Quay lại
            </button>
          )}
          <button type="button" className={clsx('btn-ghost', BIG)} onClick={onClose} disabled={busy}>Huỷ</button>
          {step === 0 ? (
            <button type="button" className={clsx('btn-primary', BIG)} onClick={next}>
              Tiếp <ChevronRight size={15} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              className={clsx('btn-primary col-span-2 font-bold sm:col-span-1', BIG)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={submit}
              disabled={busy || !online}
              title={online ? undefined : 'Mất mạng — chưa ghi được'}
            >
              {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Flag size={15} aria-hidden="true" />}
              {editing ? 'Lưu thay đổi' : 'Mở đợt'}
            </button>
          )}
        </div>
      )}
    >
      <StepChips steps={STEPS} step={step} onStep={(s) => (s === 1 ? next() : setStep(0))} done={[!firstBad(0), !firstBad(1)]} disabled={busy} />
      {!online && <p role="alert" className="mb-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">Mất mạng — chưa ghi được, nội dung đã nhập vẫn giữ</p>}
      {step === 0 ? (
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex flex-col">
            <label htmlFor="dot-ten" className="font-medium">Tên đợt *</label>
            <input
              id="dot-ten"
              ref={refs.name}
              className={clsx('input tap mt-1', err('name') && 'border-danger')}
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Mưa lũ ngày 12–15/9/2026"
              aria-invalid={!!err('name')}
              aria-describedby="loi-dot-ten"
            />
            <FieldError id="loi-dot-ten">{err('name')}</FieldError>
          </div>
          <fieldset>
            {/* 4 loại trong phạm vi theo dõi (utils/hazardScope.js); đợt cũ loại khác vẫn hiện đúng loại đã lưu */}
            <legend className="font-medium">Loại thiên tai *</legend>
            <div ref={refs.hazard} tabIndex={-1} className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="radiogroup" aria-label="Loại thiên tai" aria-describedby="loi-dot-loai">
              {(EVENT_HAZARD_CHOICES.includes(hazard) || !hazard ? EVENT_HAZARD_CHOICES : [...EVENT_HAZARD_CHOICES, hazard]).map((k) => {
                const H = HAZARD[k];
                const on = hazard === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={editing}
                    onClick={() => setHazard(k)}
                    className={clsx(
                      'tap flex min-w-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium',
                      on ? 'border-accent bg-accent/10 text-accent' : 'border-line hover:border-accent',
                      editing && !on && 'opacity-50',
                    )}
                  >
                    <H.icon size={15} className="shrink-0" aria-hidden="true" />
                    <span className="min-w-0">{H.label}</span>
                  </button>
                );
              })}
            </div>
            <FieldError id="loi-dot-loai">{err('hazard')}</FieldError>
          </fieldset>
          {editing ? (
            <p className="text-xs text-muted">Bắt đầu: <b className="text-ink-2">{when(event.started_at)}</b> (không đổi được — phiếu, lệnh, cảnh báo đã gắn theo giờ này)</p>
          ) : (
            <fieldset>
              <legend className="font-medium">Bắt đầu</legend>
              <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Giờ bắt đầu">
                {[['now', 'Bây giờ'], ['past', 'Đã bắt đầu từ…']].map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={startMode === v}
                    onClick={() => setStartMode(v)}
                    className={clsx('tap rounded-lg border px-3 py-1.5 text-xs font-semibold', startMode === v ? 'border-accent bg-accent text-white' : 'border-line hover:border-accent')}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {startMode === 'past' && (
                <>
                  <input
                    ref={refs.start}
                    type="datetime-local"
                    className={clsx('input tap mt-2 max-w-xs', err('start') && 'border-danger')}
                    value={startAt}
                    min={toLocalInput(new Date(now - MAX_BACKDATE_DAYS * 86400e3))}
                    max={toLocalInput(new Date(now))}
                    onChange={(e) => setStartAt(e.target.value)}
                    aria-label="Giờ bắt đầu đợt"
                    aria-invalid={!!err('start')}
                    aria-describedby="loi-dot-bat-dau"
                  />
                  <FieldError id="loi-dot-bat-dau">{err('start')}</FieldError>
                  <p className="mt-1 text-[11px] text-muted">Phiếu SOS, lệnh điều động, cảnh báo, vùng nguy hiểm, dòng sổ kho từ giờ này sẽ được gắn bù vào đợt.</p>
                </>
              )}
            </fieldset>
          )}
          <div className="flex flex-col">
            <label htmlFor="dot-ghi-chu" className="font-medium">Ghi chú <span className="font-normal text-muted">(tuỳ chọn)</span></label>
            <textarea id="dot-ghi-chu" className="input mt-1 min-h-[72px]" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="VD: Theo bản tin cảnh báo mưa lớn số 12 của Đài KTTV" />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <fieldset>
            <legend className="font-medium">Vùng ảnh hưởng *</legend>
            <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Vùng ảnh hưởng">
              {[[true, 'Toàn tỉnh'], [false, 'Chọn xã/phường']].map(([v, label]) => (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={whole === v}
                  onClick={() => setWhole(v)}
                  className={clsx('tap rounded-lg border px-3 py-1.5 text-xs font-semibold', whole === v ? 'border-accent bg-accent text-white' : 'border-line hover:border-accent')}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          {!whole && (
            <div ref={refs.area} tabIndex={-1} className="flex flex-col gap-2" aria-describedby="loi-dot-vung">
              {groups.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted">Thêm cả nhóm:</span>
                  {groups.map((p) => (
                    <button key={p.code} type="button" className="tap rounded-md bg-panel2 px-2 py-1 text-xs hover:bg-accent/10" onClick={() => addGroup(p)}>
                      {p.name} <span className="text-muted">({p.unit_codes.length})</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">Tìm xã / phường</span>
                  <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
                  <input className="input tap py-1.5 pl-8 text-sm" placeholder="Tìm xã / phường…" value={search} onChange={(e) => setSearch(e.target.value)} />
                </label>
                <span className="text-xs text-muted">Đã chọn <b className="text-ink">{codes.size}</b></span>
                {codes.size > 0 && <button type="button" className="tap rounded px-2 text-xs text-accent hover:underline" onClick={() => setCodes(new Set())}>Bỏ chọn hết</button>}
              </div>
              <div className="scroll-thin grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4" role="group" aria-label="Xã/phường trong vùng ảnh hưởng">
                {shown.map((u) => {
                  const on = codes.has(u.code);
                  return (
                    <button
                      key={u.code}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      aria-label={unitLabel(u)}
                      onClick={() => toggle(u.code)}
                      className={clsx('tap flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-left text-xs', on ? 'border-accent bg-accent text-white' : 'border-line hover:border-accent')}
                    >
                      <span className={clsx('flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border', on ? 'border-white' : 'border-muted')} aria-hidden="true">
                        {on && <Check size={11} />}
                      </span>
                      <span className="truncate">{u.name}</span>
                    </button>
                  );
                })}
                {!shown.length && <p className="col-span-full py-3 text-center text-xs text-muted">Không có xã/phường khớp “{search.trim()}”</p>}
              </div>
            </div>
          )}
          <FieldError id="loi-dot-vung">{err('area')}</FieldError>
          <div className="rounded-lg border border-line bg-panel2/50 p-3 text-xs text-ink-2">
            <div className="mb-1 font-semibold text-ink">Xem lại</div>
            <p>
              <b>{name.trim() || '(chưa có tên)'}</b> · {hazard ? HAZARD[hazard].label : '(chưa chọn loại)'} ·{' '}
              {editing ? `bắt đầu ${when(event.started_at)}` : startMode === 'now' ? 'bắt đầu ngay bây giờ' : `bắt đầu ${startAt ? when(fromLocalInput(startAt)) : '?'}`} · {areaText}
            </p>
            {!whole && codes.size > 0 && codes.size <= 12 && <p className="mt-0.5 text-muted">{[...codes].map((c) => names.get(c) || c).join(', ')}</p>}
            <p className="mt-1 text-muted">
              Phiếu SOS, lệnh điều động, lệnh cảnh báo, vùng nguy hiểm, dòng sổ kho ở {areaText} {editing ? 'từ giờ bắt đầu' : 'trong lúc đợt mở'} tự gắn vào đợt để báo cáo.
              {editing && ' Bỏ xã khỏi vùng → bản ghi của xã đó gỡ khỏi đợt.'}
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}

const END_NOTES = ['Mưa đã ngớt, nước rút dưới báo động I', 'Đã khắc phục xong hậu quả trước mắt', 'Hết cảnh báo của Đài KTTV'];

/** Kết thúc đợt: ghi chú (chọn nhanh, sửa được), giờ kết thúc "Bây giờ" hoặc giờ khác (sau giờ bắt đầu). */
export function EndEventModal({ event, onClose }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const online = useOnline();
  const [note, setNote] = useState('');
  const [mode, setMode] = useState('now');
  const [endAt, setEndAt] = useState(() => toLocalInput(new Date()));
  const [busy, setBusy] = useState(false);
  const endMs = mode === 'now' ? Date.now() : Date.parse(endAt);
  // Ô giờ chỉ chọn tới phút: cùng phút với giờ bắt đầu vẫn hợp lệ (gửi đi không sớm hơn giờ bắt đầu)
  const startMs = Date.parse(event.started_at);
  const error = mode === 'now' ? null
    : !endAt || Number.isNaN(endMs) ? 'Chọn giờ kết thúc'
      : endMs < startMs - (startMs % 60_000) ? `Phải sau giờ bắt đầu (${when(event.started_at)})`
        : endMs > Date.now() + 60_000 ? 'Không được ở tương lai' : null;
  const submit = async () => {
    if (error) return;
    setBusy(true);
    try {
      const ended = await api(`/events/${encodeURIComponent(event.code)}/end`, {
        method: 'POST',
        body: { end_note: note.trim() || null, ...(mode === 'past' && { ended_at: new Date(Math.max(endMs, startMs)).toISOString() }) },
      });
      toast({
        tone: 'good',
        title: `Đã kết thúc đợt ${event.code}`,
        body: [changeText(ended), 'Phiếu, lệnh, cảnh báo mới không gắn vào đợt này nữa'].filter(Boolean).join('. '),
      });
      qc.invalidateQueries({ queryKey: ['events'] });
      qc.invalidateQueries({ queryKey: ['event-summary'] });
      onClose();
    } catch (e) {
      toast({ tone: 'danger', title: 'Không kết thúc được đợt', body: e.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Kết thúc đợt ${event.code}`}
      footer={(
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button type="button" className={clsx('btn-ghost', BIG)} onClick={onClose} disabled={busy}>Huỷ</button>
          <button type="button" className={clsx('btn-primary font-bold', BIG)} onClick={submit} disabled={busy || !!error || !online} title={online ? undefined : 'Mất mạng — chưa ghi được'}>
            {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Flag size={15} aria-hidden="true" />} Kết thúc đợt
          </button>
        </div>
      )}
    >
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-xs text-muted">{event.name} — phiếu, lệnh, cảnh báo tạo sau giờ kết thúc không gắn vào đợt; báo cáo của đợt vẫn xem / xuất được.</p>
        <fieldset>
          <legend className="font-medium">Giờ kết thúc</legend>
          <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Giờ kết thúc">
            {[['now', 'Bây giờ'], ['past', 'Giờ khác…']].map(([v, label]) => (
              <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => setMode(v)} className={clsx('tap rounded-lg border px-3 py-1.5 text-xs font-semibold', mode === v ? 'border-accent bg-accent text-white' : 'border-line hover:border-accent')}>
                {label}
              </button>
            ))}
          </div>
          {mode === 'past' && (
            <>
              <input type="datetime-local" className={clsx('input tap mt-2 max-w-xs', error && 'border-danger')} value={endAt} onChange={(e) => setEndAt(e.target.value)} aria-label="Giờ kết thúc đợt" aria-invalid={!!error} aria-describedby="loi-dot-ket-thuc" />
              <FieldError id="loi-dot-ket-thuc">{error}</FieldError>
              <p className="mt-1 text-[11px] text-muted">Phiếu SOS, lệnh, cảnh báo, vùng nguy hiểm, dòng sổ kho đã tự gắn sau giờ này sẽ được gỡ khỏi đợt.</p>
            </>
          )}
        </fieldset>
        <div className="flex flex-col">
          <label htmlFor="dot-ket-thuc-ghi-chu" className="font-medium">Ghi chú <span className="font-normal text-muted">(tuỳ chọn)</span></label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {END_NOTES.map((n) => (
              <button key={n} type="button" className="tap rounded-md bg-panel2 px-2 py-1 text-xs hover:bg-accent/10" onClick={() => setNote(n)}>{n}</button>
            ))}
          </div>
          <textarea id="dot-ket-thuc-ghi-chu" className="input mt-1.5 min-h-[64px]" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
