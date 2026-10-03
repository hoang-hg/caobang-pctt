import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { Modal } from './ui';

/** Trưởng điểm / xã báo số người đang ở điểm sơ tán (quyền evacuation.update tại xã của điểm) → bản đồ điều hành,
 * Điều hành cứu hộ và cổng công khai (chỗ còn trống) cập nhật ngay. */
export default function OccupancyModal({ site, onClose }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const [value, setValue] = useState(site.current_occupancy ?? 0);
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const n = Number(value);
  const valid = value !== '' && Number.isInteger(n) && n >= 0;
  const problem = valid && site.capacity > 0 && n > site.capacity * 2 ? `Quá 2 lần sức chứa (${site.capacity}) — kiểm tra lại` : null;
  const submit = async () => {
    setBusy(true);
    try {
      await api(`/resources/evacuation-sites/${site.id}/occupancy`, {
        method: 'PATCH',
        body: { current_occupancy: n, source: source || null },
      });
      toast({ tone: n > site.capacity ? 'warn' : 'good', title: `${site.name}: ${n}/${site.capacity} người` });
      ['map-layers', 'evacuation', 'kpis'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      onClose();
    } catch (e) {
      toast({ tone: 'danger', title: 'Không cập nhật được', body: e.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Số người đang ở – ${site.name}`}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" disabled={!valid || !!problem || busy} onClick={submit}>Lưu</button>
        </>
      }
    >
      <div className="grid gap-3 text-sm">
        <label className="flex flex-col gap-1">
          Số người đang ở *
          <input className="input" type="number" min="0" step="1" value={value} onChange={(e) => setValue(e.target.value)} />
          <span className="text-[11px] text-muted">Sức chứa {site.capacity} người{valid && n > site.capacity ? ' — đang vượt sức chứa' : ''}</span>
        </label>
        <label className="flex flex-col gap-1">
          Nguồn báo cáo
          <input className="input" maxLength={200} placeholder="VD: Điện thoại trưởng điểm lúc 15h" value={source} onChange={(e) => setSource(e.target.value)} />
        </label>
        {problem && <p className="text-xs text-danger">{problem}</p>}
        <p className="text-[11px] text-muted">Cổng công khai hiện chỗ còn trống theo số này. Thao tác được ghi nhật ký.</p>
      </div>
    </Modal>
  );
}
