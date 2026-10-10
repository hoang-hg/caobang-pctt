import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { FieldError, Modal } from './ui';

const STEPS = [-10, -1, 1, 10];

/** Trưởng điểm / xã báo số người đang ở điểm sơ tán (quyền evacuation.update tại xã của điểm) → bản đồ điều hành,
 * Điều hành cứu hộ và cổng công khai (chỗ còn trống) cập nhật ngay. Điện thoại: nút −10 / −1 / +1 / +10 để chỉnh số không
 * cần bàn phím; lỗi hiện ngay khi gõ; vượt sức chứa chỉ nhắc (vẫn lưu được), quá 2 lần sức chứa thì chặn (gần như gõ nhầm). */
export default function OccupancyModal({ site, onClose }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const [value, setValue] = useState(String(site.current_occupancy ?? 0));
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const n = Number(value);
  const error = value.trim() === ''
    ? 'Nhập số người đang ở (0 nếu không còn ai)'
    : !(Number.isInteger(n) && n >= 0)
      ? 'Số người là số nguyên từ 0 trở lên'
      : site.capacity > 0 && n > site.capacity * 2 ? `Quá 2 lần sức chứa (${site.capacity}) — kiểm tra lại, có thể gõ nhầm` : null;
  const over = !error && site.capacity > 0 && n > site.capacity;
  const bump = (d) => setValue((v) => String(Math.max(0, (Number.isInteger(Number(v)) ? Number(v) : 0) + d)));

  const submit = async () => {
    if (error) {
      inputRef.current?.focus();
      return;
    }
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
          <button type="button" className="btn-ghost min-h-[44px] sm:min-h-0" onClick={onClose}>Huỷ</button>
          <button type="button" className="btn-primary min-h-[44px] sm:min-h-0" disabled={busy} onClick={submit}>Lưu</button>
        </>
      }
    >
      <div className="grid gap-3 text-sm">
        <label className="flex flex-col gap-1">
          Số người đang ở *
          <input
            ref={inputRef}
            className={clsx('input min-h-[44px] font-mono text-base sm:min-h-0', error && 'border-danger')}
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={!!error}
            aria-describedby="loi-so-nguoi goi-y-so-nguoi"
          />
          <FieldError id="loi-so-nguoi">{error}</FieldError>
          <span id="goi-y-so-nguoi" className={clsx('text-[11px]', over ? 'font-semibold text-warn' : 'text-muted')}>
            Sức chứa {site.capacity} người{over ? ` — đang vượt ${n - site.capacity} người, vẫn lưu được` : ''}
          </span>
        </label>
        <div className="grid grid-cols-4 gap-2" role="group" aria-label="Chỉnh nhanh số người">
          {STEPS.map((d) => (
            <button key={d} type="button" className="btn-ghost min-h-[44px] justify-center font-mono font-bold" onClick={() => bump(d)}>
              {d > 0 ? `+${d}` : `−${-d}`}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1">
          Nguồn báo cáo
          <input className="input min-h-[44px] sm:min-h-0" maxLength={200} placeholder="VD: Điện thoại trưởng điểm lúc 15h" value={source} onChange={(e) => setSource(e.target.value)} />
        </label>
        <p className="text-[11px] text-muted">Cổng công khai hiện chỗ còn trống theo số này. Thao tác được ghi nhật ký.</p>
      </div>
    </Modal>
  );
}
