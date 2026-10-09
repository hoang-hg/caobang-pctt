import { useRef, useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, FileText, Loader2, RotateCcw, X } from 'lucide-react';
import { Modal } from '../common/ui';

const STEPS = ['Thông tin văn bản', 'Đánh giá & người ký', 'Xem lại & xuất'];
const STEP_FIELDS = [['issuer', 'parent', 'number', 'recipients'], ['assessment', 'signerTitle', 'signerName'], []];
const DEFAULTS = {
  parent: 'UBND TỈNH CAO BẰNG',
  issuer: 'Ban Chỉ huy Phòng, chống thiên tai và Tìm kiếm cứu nạn tỉnh Cao Bằng',
  number: '     /BC-BCH',
  recipients: 'Ủy ban nhân dân tỉnh Cao Bằng\nBan Chỉ đạo Quốc gia về Phòng, chống thiên tai',
  signerTitle: 'TRƯỞNG BAN',
  signerName: '',
};
const KEEP = Object.keys(DEFAULTS); // nhớ cho lần sau (trên trình duyệt này); "đánh giá" mỗi báo cáo nhập mới
const STORE_KEY = 'pctt_bao_cao_van_ban';
const MAX_ASSESSMENT = 4000;

const readSaved = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return Object.fromEntries(KEEP.map((key) => [key, typeof saved[key] === 'string' ? saved[key] : DEFAULTS[key]]));
  } catch {
    return { ...DEFAULTS };
  }
};
const save = (f) => {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(KEEP.map((key) => [key, f[key]]))));
  } catch { /* chế độ riêng tư / chặn lưu trữ: lần sau dùng mặc định */ }
};
const nonEmpty = (t) => String(t || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

const FieldError = ({ id, children }) => (children ? (
  <p id={id} className="flex items-center gap-1 text-[11px] font-semibold text-danger">
    <AlertTriangle size={12} className="shrink-0" aria-hidden="true" /> {children}
  </p>
) : null);

/**
 * Soạn báo cáo nhanh dạng VĂN BẢN (PDF định dạng chuẩn gửi UBND tỉnh / Ban Chỉ đạo — thiết kế A) trong 3 bước: thông tin
 * văn bản → đánh giá & người ký → xem lại & xuất. Lỗi hiện ngay dưới ô (độ dài: ngay khi gõ; ô bắt buộc: khi rời ô hoặc bấm
 * Tiếp). Số liệu do Tổng quan đưa vào lúc bấm Xuất (`onExport(form)` → số trang); `summary`: phạm vi + số mục sẽ có.
 */
export default function ReportDocModal({ open, onClose, onExport, summary }) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState(() => ({ ...readSaved(), assessment: '', appendix: true }));
  const [shown, setShown] = useState({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const refs = {
    issuer: useRef(null), parent: useRef(null), number: useRef(null), recipients: useRef(null),
    assessment: useRef(null), signerTitle: useRef(null), signerName: useRef(null),
  };
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const touch = (...keys) => setShown((s) => ({ ...s, ...Object.fromEntries(keys.map((key) => [key, true])) }));

  const to = nonEmpty(f.recipients);
  const signer = nonEmpty(f.signerTitle);
  const errors = {
    issuer: !f.issuer.trim() ? 'Nhập tên cơ quan ban hành báo cáo' : f.issuer.length > 150 && 'Tối đa 150 ký tự',
    parent: f.parent.length > 80 && 'Tối đa 80 ký tự',
    number: f.number.length > 40 && 'Tối đa 40 ký tự',
    recipients: !to.length ? 'Nhập ít nhất một nơi nhận (mỗi dòng một nơi)'
      : to.length > 6 ? 'Tối đa 6 nơi nhận' : to.some((t) => t.length > 150) && 'Mỗi nơi nhận tối đa 150 ký tự',
    assessment: f.assessment.length > MAX_ASSESSMENT && `Tối đa ${MAX_ASSESSMENT.toLocaleString('vi-VN')} ký tự`,
    signerTitle: !signer.length ? 'Nhập chức vụ người ký (VD TRƯỞNG BAN)'
      : signer.length > 3 ? 'Tối đa 3 dòng' : signer.some((t) => t.length > 60) && 'Mỗi dòng tối đa 60 ký tự',
    signerName: f.signerName.length > 60 && 'Tối đa 60 ký tự',
  };
  // Lỗi độ dài hiện ngay khi gõ; ô bắt buộc để trống hiện khi rời ô hoặc bấm Tiếp
  const LENGTH = ['parent', 'number', 'assessment', 'signerName'];
  const err = (key) => (LENGTH.includes(key) || shown[key] ? errors[key] || null : null);
  const stepValid = (i) => STEP_FIELDS[i].every((key) => !errors[key]);
  const guard = (i) => {
    const bad = STEP_FIELDS[i].filter((key) => errors[key]);
    if (!bad.length) return true;
    touch(...STEP_FIELDS[i]);
    refs[bad[0]].current?.focus();
    return false;
  };

  const close = () => {
    if (busy) return;
    setStep(0);
    setShown({});
    setFailure(null);
    onClose();
  };
  const submit = async () => {
    if (!guard(0)) { setStep(0); return; }
    if (!guard(1)) { setStep(1); return; }
    setBusy(true);
    setFailure(null);
    try {
      const pages = await onExport(f);
      save(f);
      setF((x) => ({ ...x, assessment: '' }));
      setStep(0);
      setShown({});
      onClose(pages);
    } catch (e) {
      setFailure(e?.message || 'Lỗi không xác định');
    } finally {
      setBusy(false);
    }
  };

  const input = (key) => clsx('input min-h-[44px] w-full text-sm sm:min-h-0 sm:text-xs', err(key) && 'border-danger');
  const field = (key, label, el, hint) => (
    <label className="flex flex-col gap-1">
      <span className="text-muted">{label}</span>
      {el}
      {hint && !err(key) && <span className="text-[11px] text-muted">{hint}</span>}
      <FieldError id={`loi-${key}`}>{err(key)}</FieldError>
    </label>
  );
  const props = (key) => ({
    ref: refs[key],
    value: f[key],
    onChange: (e) => set({ [key]: e.target.value }),
    onBlur: () => touch(key),
    'aria-invalid': !!err(key),
    'aria-describedby': err(key) ? `loi-${key}` : undefined,
  });
  const bigBtn = 'min-h-[44px] text-sm sm:min-h-0 sm:text-xs';

  return (
    <Modal
      open={open}
      onClose={close}
      wide
      title="Báo cáo văn bản (PDF định dạng chuẩn)"
      footer={
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
          {step > 0 && (
            <button type="button" className={clsx('btn-ghost sm:mr-auto', bigBtn)} onClick={() => setStep(step - 1)} disabled={busy}>
              <ChevronLeft size={15} /> Quay lại
            </button>
          )}
          <button type="button" className={clsx('btn-ghost', step === 0 && 'col-span-2', bigBtn)} onClick={close} disabled={busy}>
            <X size={15} /> Đóng
          </button>
          {step < 2 ? (
            <button type="button" className={clsx('btn-primary col-span-2', bigBtn)} onClick={() => guard(step) && setStep(step + 1)}>
              Tiếp <ChevronRight size={15} />
            </button>
          ) : (
            <button type="button" className={clsx('btn-primary col-span-2 font-bold', bigBtn)} onClick={submit} disabled={busy || !summary.ready}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} {busy ? 'Đang dựng PDF…' : 'Xuất PDF'}
            </button>
          )}
        </div>
      }
    >
      <ol className="mb-3 flex flex-wrap gap-1.5 text-[11px]" aria-label="Các bước">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              disabled={i > step || busy}
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

      {step === 0 && (
        <div className="flex flex-col gap-3 text-xs">
          <p className="text-muted">Thể thức theo Nghị định 30/2020/NĐ-CP: quốc hiệu, tiêu ngữ, cơ quan ban hành, số – ký hiệu, kính gửi, nơi nhận, chức vụ người ký.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {field('parent', 'Cơ quan chủ quản (dòng trên, có thể để trống)', <input className={input('parent')} {...props('parent')} />)}
            {field('number', 'Số, ký hiệu', <input className={input('number')} {...props('number')} />, 'Để trống phần số cho văn thư điền')}
          </div>
          {field('issuer', 'Cơ quan ban hành báo cáo *', <input className={input('issuer')} {...props('issuer')} />, 'Viết thường như trong câu; đầu văn bản tự in hoa')}
          {field('recipients', 'Kính gửi * (mỗi dòng một nơi nhận)', <textarea rows={3} className={clsx(input('recipients'), 'min-h-[84px]')} {...props('recipients')} />)}
          <button
            type="button"
            className="btn-ghost self-start px-2.5 py-1 text-xs"
            onClick={() => { set({ ...DEFAULTS }); setShown({}); }}
          >
            <RotateCcw size={13} /> Dùng lại mẫu mặc định
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-3 text-xs">
          {field(
            'assessment',
            `III. Đánh giá, kiến nghị (${f.assessment.length.toLocaleString('vi-VN')}/${MAX_ASSESSMENT.toLocaleString('vi-VN')} ký tự)`,
            <textarea rows={6} className={clsx(input('assessment'), 'min-h-[140px]')} placeholder="VD: Mưa lớn còn kéo dài đến hết ngày mai; đề nghị UBND tỉnh chỉ đạo các xã vùng núi cao…" {...props('assessment')} />,
            'Mỗi dòng thành một đoạn. Để trống: báo cáo ghi "(Đơn vị bổ sung …)" để điền tay',
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {field('signerTitle', 'Thẩm quyền, chức vụ người ký *', <textarea rows={2} className={clsx(input('signerTitle'), 'min-h-[60px]')} {...props('signerTitle')} />, 'VD "KT. TRƯỞNG BAN" xuống dòng "PHÓ TRƯỞNG BAN"')}
            {field('signerName', 'Họ tên người ký (để trống để ký tay)', <input className={input('signerName')} {...props('signerName')} />)}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3 text-xs">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-lg border border-line bg-panel2/40 p-3">
            <dt className="text-muted">Phạm vi</dt>
            <dd className="font-semibold text-ink">{summary.scope}</dd>
            <dt className="text-muted">Số liệu</dt>
            <dd className="text-ink">Lấy đúng số đang hiện trên Tổng quan tại lúc bấm Xuất</dd>
            <dt className="text-muted">I. Thiên tai</dt>
            <dd className="text-ink">Mưa · {summary.stations} trạm mực nước · {summary.reservoirs} hồ chứa · {summary.landslides} điểm sạt lở cấm đường / cảnh báo</dd>
            <dt className="text-muted">II. Ứng phó</dt>
            <dd className="text-ink">Phiếu SOS · sơ tán dân · lực lượng, phương tiện</dd>
            <dt className="text-muted">III. Đánh giá</dt>
            <dd className="text-ink">{f.assessment.trim() ? `${nonEmpty(f.assessment).length} đoạn đã nhập` : 'Để trống — điền tay sau khi in'}</dd>
            <dt className="text-muted">Người ký</dt>
            <dd className="text-ink">{signer.join(' / ')}{f.signerName.trim() ? ` — ${f.signerName.trim()}` : ''}</dd>
          </dl>
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2 sm:min-h-0">
            <input type="checkbox" className="h-4 w-4" checked={f.appendix} onChange={(e) => set({ appendix: e.target.checked })} />
            <span className="text-ink">Kèm phụ lục: ảnh chụp màn hình {summary.tabLabel} (khổ ngang)</span>
          </label>
          <p className="text-muted">
            Văn bản khổ A4, chữ Times cỡ 13, <b>chữ tìm và sao chép được</b> (khác nút "Xuất PDF" là ảnh chụp màn hình). In ra để ký,
            đóng dấu, hoặc gửi bản điện tử.
          </p>
          {!summary.ready && <p className="font-semibold text-danger">Chưa tải xong chỉ số tổng quan — chờ số liệu rồi xuất.</p>}
          {failure && (
            <p role="alert" className="flex items-start gap-1.5 rounded-lg border border-danger/50 bg-danger/10 p-2.5 font-semibold text-danger">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> Không xuất được báo cáo: {failure}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
