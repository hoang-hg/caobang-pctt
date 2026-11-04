import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { FieldError, Modal, Segmented } from '../common/ui';

const TYPES = [
  ['giao_thong', 'Sự cố giao thông (cây đổ, sạt taluy chắn đường, sập cầu, ngập đường)'],
  ['ha_tang', 'Sự cố hạ tầng (đứt dây điện, mất điện, mất liên lạc)'],
  ['sat_lo', 'Điểm sạt lở / nguy cơ sạt lở'],
];
const LEVELS = [{ value: 'do', label: 'Rất cao (đỏ)' }, { value: 'cam', label: 'Cao (cam)' }, { value: 'vang', label: 'Trung bình (vàng)' }];
const HOURS = [[6, '6 giờ'], [12, '12 giờ'], [24, '24 giờ'], [48, '2 ngày'], [72, '3 ngày'], [168, '7 ngày']];
const NAME_MIN = 3;
const NAME_MAX = 160;
const field = 'input min-h-[44px] sm:min-h-0';

/** Đánh dấu nhanh điểm sự cố tại vị trí chọn trên bản đồ (quyền incident.update tại xã đó) — hoặc chuyển từ phản ánh
 * của người dân (`at.report`). Điểm hiện ngay trên bản đồ điều hành và cổng công khai, tự ẩn khi hết hạn. Báo lỗi ngay
 * dưới ô (sau khi rời ô hoặc bấm "Đánh dấu"); ô bấm cao 44 px trên điện thoại. */
export default function IncidentModal({ at, onClose }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const r = at.report;
  const [f, setF] = useState({
    type: r?.incident_type || 'giao_thong',
    level: 'cam',
    name: r ? `${r.category_label}${r.address || r.hamlet_name ? ` – ${r.address || r.hamlet_name}` : ''}`.slice(0, NAME_MAX) : '',
    description: r?.description || '',
    hours: 24,
  });
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false); // ô Tên đã được "chạm" (rời ô / bấm Đánh dấu) → hiện lỗi
  const nameRef = useRef(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const nameError = f.name.trim().length < NAME_MIN ? `Nhập tên ngắn gọn, ít nhất ${NAME_MIN} ký tự — VD: Cây đổ chắn QL3 km 12` : null;
  const err = shown ? nameError : null;

  const submit = async () => {
    if (nameError) {
      setShown(true);
      nameRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await api('/map/incidents', {
        method: 'POST',
        body: { ...f, name: f.name.trim(), hours: Number(f.hours), lat: at.lat, lon: at.lon, description: f.description || null, report_id: r?.id || null },
      });
      toast({ tone: 'good', title: 'Đã đánh dấu sự cố', body: 'Hiện trên bản đồ điều hành và cổng công khai' });
      qc.invalidateQueries({ queryKey: ['map-layers'] });
      onClose();
    } catch (e) {
      toast({ tone: 'danger', title: 'Không đánh dấu được', body: e.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      size="md"
      onClose={onClose}
      title={r ? 'Đánh dấu điểm sự cố từ phản ánh' : 'Đánh dấu điểm sự cố'}
      subtitle={r ? 'Không cần phiếu SOS — chỉ là điểm nguy hiểm trên đường' : 'Công cụ → Đánh dấu sự cố'}
      footer={
        <>
          <button type="button" className="btn-ghost min-h-[44px] sm:min-h-0" onClick={onClose}>Huỷ</button>
          {/* Giữ focus ở ô đang nhập khi nhấn nút: lỗi hiện lúc rời ô đẩy nút xuống giữa lúc nhấn và nhả chuột → mất cú bấm */}
          <button type="button" className="btn-primary min-h-[44px] sm:min-h-0" disabled={busy} onMouseDown={(e) => e.preventDefault()} onClick={submit}>
            Đánh dấu sự cố
          </button>
        </>
      }
    >
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        {r && <p className="rounded-[14px] bg-panel2 p-3 sm:col-span-2">Từ phản ánh <b>{r.code}</b>{r.admin_name ? ` · ${r.admin_name}` : ''} · vị trí người dân chấm</p>}
        <fieldset className="flex flex-col gap-1.5 sm:col-span-2">
          <legend className="mb-1 text-[13px] font-semibold text-ink-2">Loại sự cố *</legend>
          {TYPES.map(([k, label]) => (
            <label key={k} className={clsx('tap flex cursor-pointer items-center gap-2.5 rounded-[14px] border-2 px-3 py-2.5 text-sm', f.type === k ? 'border-accent bg-accent/10 font-medium text-ink' : 'border-transparent bg-panel2 text-ink-2 hover:border-line')}>
              <input type="radio" name="loai-su-co" className="shrink-0" checked={f.type === k} onChange={() => setF((x) => ({ ...x, type: k }))} />
              {label}
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1 sm:col-span-2">
          Tên ngắn gọn (hiện trên bản đồ) *
          <input
            ref={nameRef}
            className={clsx(field, err && 'border-danger')}
            maxLength={NAME_MAX}
            placeholder="VD: Cây đổ chắn QL3 km 12"
            value={f.name}
            onChange={set('name')}
            onBlur={() => setShown(true)}
            aria-invalid={!!err}
            aria-describedby="loi-ten-su-co"
          />
          <FieldError id="loi-ten-su-co">{err}</FieldError>
        </label>
        <div className="flex flex-col gap-1">
          <span>Mức độ *</span>
          <Segmented label="Mức độ" touch value={f.level} onChange={(level) => setF((x) => ({ ...x, level }))} options={LEVELS} />
        </div>
        <label className="flex flex-col gap-1">
          Tự ẩn sau *
          <select className={field} value={f.hours} onChange={set('hours')}>
            {HOURS.map(([h, label]) => <option key={h} value={h}>{label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          Mô tả, hướng xử lý
          <textarea className="input min-h-[70px]" maxLength={1000} value={f.description} onChange={set('description')} />
          <span className="text-right text-[11px] text-muted">{f.description.length}/1000</span>
        </label>
        <p className="rounded-[14px] bg-panel2 p-3 text-[13px] text-ink-2 sm:col-span-2">Vị trí: {r ? 'người dân chấm' : 'điểm vừa bấm trên bản đồ'} · <span className="num">{at.lat.toFixed(5)}, {at.lon.toFixed(5)}</span></p>
        <p className="rounded-[14px] border border-dashed border-line p-3 text-[13px] leading-normal text-ink-2 sm:col-span-2">
          Hiện ngay trên bản đồ điều hành <b>và cổng người dân</b>, được cảnh báo khi tìm đường đi gần. Hết hạn hoặc bấm “Kết thúc sự cố” thì tự bỏ khỏi bản đồ. Thao tác được ghi nhật ký.
        </p>
      </div>
    </Modal>
  );
}
