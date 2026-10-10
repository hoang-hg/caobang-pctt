import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { FieldError, Modal } from '../common/ui';

const TYPES = [
  ['giao_thong', 'Sự cố giao thông (cây đổ, sạt taluy chắn đường, sập cầu, ngập đường)'],
  ['ha_tang', 'Sự cố hạ tầng (đứt dây điện, mất điện, mất liên lạc)'],
  ['sat_lo', 'Điểm sạt lở / nguy cơ sạt lở'],
];
const LEVELS = [['do', 'Rất cao (đỏ)'], ['cam', 'Cao (cam)'], ['vang', 'Trung bình (vàng)']];
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
      onClose={onClose}
      title={r ? `Tạo điểm sự cố từ phản ánh ${r.code}` : 'Đánh dấu điểm sự cố'}
      footer={
        <>
          <button type="button" className="btn-ghost min-h-[44px] sm:min-h-0" onClick={onClose}>Huỷ</button>
          {/* Giữ focus ở ô đang nhập khi nhấn nút: lỗi hiện lúc rời ô đẩy nút xuống giữa lúc nhấn và nhả chuột → mất cú bấm */}
          <button type="button" className="btn-primary min-h-[44px] sm:min-h-0" disabled={busy} onMouseDown={(e) => e.preventDefault()} onClick={submit}>
            Đánh dấu
          </button>
        </>
      }
    >
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <label className="flex flex-col gap-1 sm:col-span-2">
          Loại sự cố *
          <select className={field} value={f.type} onChange={set('type')}>
            {TYPES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
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
        <label className="flex flex-col gap-1">
          Mức độ *
          <select className={field} value={f.level} onChange={set('level')}>
            {LEVELS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
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
        <p className="text-[11px] text-muted sm:col-span-2">
          Vị trí {at.lat.toFixed(5)}, {at.lon.toFixed(5)}. Điểm hiện ngay trên cổng công khai cho người dân và được cảnh báo
          khi tìm đường đi gần; bấm “Kết thúc sự cố” khi đã thông đường / khắc phục. Thao tác được ghi nhật ký.
        </p>
      </div>
    </Modal>
  );
}
