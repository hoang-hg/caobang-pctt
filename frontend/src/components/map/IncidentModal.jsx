import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { Modal } from '../common/ui';

const TYPES = [
  ['giao_thong', 'Sự cố giao thông (cây đổ, sạt taluy chắn đường, sập cầu, ngập đường)'],
  ['ha_tang', 'Sự cố hạ tầng (đứt dây điện, mất điện, mất liên lạc)'],
  ['sat_lo', 'Điểm sạt lở / nguy cơ sạt lở'],
];
const LEVELS = [['do', 'Rất cao (đỏ)'], ['cam', 'Cao (cam)'], ['vang', 'Trung bình (vàng)']];
const HOURS = [[6, '6 giờ'], [12, '12 giờ'], [24, '24 giờ'], [48, '2 ngày'], [72, '3 ngày'], [168, '7 ngày']];

/** Đánh dấu nhanh điểm sự cố tại vị trí chọn trên bản đồ (quyền incident.update tại xã đó) — hoặc chuyển từ phản ánh
 * của người dân (`at.report`). Điểm hiện ngay trên bản đồ điều hành và cổng công khai, tự ẩn khi hết hạn. */
export default function IncidentModal({ at, onClose }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const r = at.report;
  const [f, setF] = useState({
    type: r?.incident_type || 'giao_thong',
    level: 'cam',
    name: r ? `${r.category_label}${r.address || r.hamlet_name ? ` – ${r.address || r.hamlet_name}` : ''}`.slice(0, 160) : '',
    description: r?.description || '',
    hours: 24,
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async () => {
    setBusy(true);
    try {
      await api('/map/incidents', {
        method: 'POST',
        body: { ...f, hours: Number(f.hours), lat: at.lat, lon: at.lon, description: f.description || null, report_id: r?.id || null },
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
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" disabled={busy || f.name.trim().length < 3} onClick={submit}>Đánh dấu</button>
        </>
      }
    >
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <label className="flex flex-col gap-1 sm:col-span-2">
          Loại sự cố *
          <select className="input" value={f.type} onChange={set('type')}>
            {TYPES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          Tên ngắn gọn (hiện trên bản đồ) *
          <input className="input" maxLength={160} placeholder="VD: Cây đổ chắn QL3 km 12" value={f.name} onChange={set('name')} />
        </label>
        <label className="flex flex-col gap-1">
          Mức độ *
          <select className="input" value={f.level} onChange={set('level')}>
            {LEVELS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Tự ẩn sau *
          <select className="input" value={f.hours} onChange={set('hours')}>
            {HOURS.map(([h, label]) => <option key={h} value={h}>{label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          Mô tả, hướng xử lý
          <textarea className="input min-h-[70px]" maxLength={1000} value={f.description} onChange={set('description')} />
        </label>
        <p className="text-[11px] text-muted sm:col-span-2">
          Vị trí {at.lat.toFixed(5)}, {at.lon.toFixed(5)}. Điểm hiện ngay trên cổng công khai cho người dân và được cảnh báo
          khi tìm đường đi gần; bấm “Kết thúc sự cố” khi đã thông đường / khắc phục. Thao tác được ghi nhật ký.
        </p>
      </div>
    </Modal>
  );
}
