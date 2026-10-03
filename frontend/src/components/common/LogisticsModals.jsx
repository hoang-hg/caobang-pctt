import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { Modal } from './ui';
import { dateTime, int } from '../../utils/format';

/** Làm mới mọi màn hình nguồn lực sau khi ghi (WebSocket cũng báo, đây là để người vừa bấm thấy ngay). */
const useRefresh = () => {
  const qc = useQueryClient();
  return () => ['vehicles', 'warehouses', 'fuel', 'resources-summary', 'supplies', 'map-layers', 'kpis'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
};

function useSave(onClose) {
  const toast = useStore((s) => s.toast);
  const refresh = useRefresh();
  const [busy, setBusy] = useState(false);
  const run = async (request, done) => {
    setBusy(true);
    try {
      await request();
      toast({ tone: 'good', title: done });
      refresh();
      onClose();
    } catch (e) {
      toast({ tone: 'danger', title: 'Không lưu được', body: e.message });
    } finally {
      setBusy(false);
    }
  };
  return [busy, run];
}

/** Báo tình trạng phương tiện (quyền vehicle.update): Sẵn sàng ↔ Bảo dưỡng / hỏng, mức nhiên liệu (%). "Đang làm nhiệm
 * vụ" chỉ do lệnh điều động gán — báo hỏng giữa nhiệm vụ thì phương tiện rời nhiệm vụ. */
export function VehicleModal({ vehicle: v, onClose }) {
  const [status, setStatus] = useState(v.status === 'bao_duong' ? 'bao_duong' : 'san_sang');
  const [fuel, setFuel] = useState(v.fuel_level ?? '');
  const [note, setNote] = useState('');
  const [busy, run] = useSave(onClose);
  const statusChanged = v.status === 'nhiem_vu' ? status === 'bao_duong' : status !== v.status;
  const fuelValid = fuel === '' || (Number.isInteger(Number(fuel)) && Number(fuel) >= 0 && Number(fuel) <= 100);
  const fuelChanged = fuel !== '' && Number(fuel) !== v.fuel_level;
  const submit = () =>
    run(
      () =>
        api(`/resources/vehicles/${v.id}`, {
          method: 'PATCH',
          body: { status: statusChanged ? status : null, fuel_level: fuelChanged ? Number(fuel) : null, note: note || null },
        }),
      `Đã cập nhật ${v.code}`,
    );
  return (
    <Modal
      open
      onClose={onClose}
      title={`Tình trạng phương tiện – ${v.code}`}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" disabled={busy || !fuelValid || (!statusChanged && !fuelChanged)} onClick={submit}>Lưu</button>
        </>
      }
    >
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          Trạng thái
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="san_sang">{v.status === 'nhiem_vu' ? 'Giữ nguyên (đang làm nhiệm vụ)' : 'Sẵn sàng'}</option>
            <option value="bao_duong">Bảo dưỡng / hỏng</option>
          </select>
          {v.status === 'nhiem_vu' && status === 'bao_duong' && (
            <span className="text-[11px] text-danger">Phương tiện sẽ rời nhiệm vụ {v.mission_code} và không được gợi ý điều động.</span>
          )}
        </label>
        <label className="flex flex-col gap-1">
          Mức nhiên liệu (%)
          <input className="input" type="number" min="0" max="100" placeholder="Chưa rõ" value={fuel} onChange={(e) => setFuel(e.target.value)} />
          <span className="text-[11px] text-muted">
            {v.fuel_updated_at ? `Báo lần cuối ${dateTime(v.fuel_updated_at)}` : 'Chưa ai báo mức nhiên liệu'}
          </span>
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          Ghi chú (lý do hỏng, nguồn báo)
          <input className="input" maxLength={200} placeholder="VD: Hỏng chân vịt, chờ thay — tổ trưởng báo lúc 15h" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <p className="text-[11px] text-muted sm:col-span-2">
          Phương tiện bảo dưỡng / hỏng hoặc đã báo nhiên liệu dưới 20% không được gợi ý khi điều động. Thao tác được ghi nhật ký.
        </p>
      </div>
    </Modal>
  );
}

/** Nhập thêm hàng vào kho (quyền inventory.receive): hàng cứu trợ về, mua bổ sung. Mặt hàng mới ở kho cần định mức. */
export function ReceiveModal({ warehouse: w, onClose }) {
  const { data: items = [] } = useQuery({ queryKey: ['items'], queryFn: () => api('/resources/items'), staleTime: Infinity });
  const [code, setCode] = useState('');
  const [quantity, setQuantity] = useState('');
  const [quota, setQuota] = useState('');
  const [expiry, setExpiry] = useState('');
  const [source, setSource] = useState('');
  const [busy, run] = useSave(onClose);
  const existing = w.items.find((i) => i.item_code === code);
  const item = items.find((i) => i.code === code);
  const q = Number(quantity);
  const valid = code && Number.isInteger(q) && q > 0 && (existing || (quota !== '' && Number(quota) >= 0));
  const submit = () =>
    run(
      () =>
        api(`/resources/warehouses/${w.id}/receive`, {
          method: 'POST',
          body: { item_code: code, quantity: q, safety_quota: quota === '' ? null : Number(quota), expiry_date: expiry || null, source: source || null },
        }),
      `${w.name}: nhập ${q} ${item?.unit || ''} ${item?.name || code}`,
    );
  return (
    <Modal
      open
      onClose={onClose}
      title={`Nhập thêm hàng – ${w.name}`}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" disabled={busy || !valid} onClick={submit}>Nhập kho</button>
        </>
      }
    >
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <label className="flex flex-col gap-1 sm:col-span-2">
          Mặt hàng *
          <select className="input" value={code} onChange={(e) => setCode(e.target.value)}>
            <option value="">— Chọn mặt hàng —</option>
            {items.map((i) => <option key={i.code} value={i.code}>{i.name} ({i.unit})</option>)}
          </select>
          {existing && <span className="text-[11px] text-muted">Đang có {int(existing.quantity)} {existing.unit} · định mức {int(existing.safety_quota)}</span>}
          {code && !existing && <span className="text-[11px] text-warn">Mặt hàng mới ở kho này — cần định mức an toàn</span>}
        </label>
        <label className="flex flex-col gap-1">
          Số lượng nhập thêm *
          <input className="input" type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          Định mức an toàn{existing ? ' (đổi nếu cần)' : ' *'}
          <input className="input" type="number" min="0" placeholder={existing ? String(existing.safety_quota) : ''} value={quota} onChange={(e) => setQuota(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          Hạn sử dụng của lô
          <input className="input" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          <span className="text-[11px] text-muted">Kho giữ hạn sớm nhất (lô cũ hết hạn trước)</span>
        </label>
        <label className="flex flex-col gap-1">
          Nguồn hàng
          <input className="input" maxLength={200} placeholder="VD: Hội Chữ thập đỏ tỉnh" value={source} onChange={(e) => setSource(e.target.value)} />
        </label>
        <p className="text-[11px] text-muted sm:col-span-2">Số tồn kho trên mọi màn hình cập nhật ngay; thao tác được ghi nhật ký.</p>
      </div>
    </Modal>
  );
}

/** Cập nhật xăng / dầu dự trữ tại điểm cấp nhiên liệu (quyền inventory.receive). */
export function FuelDepotModal({ depot: d, onClose }) {
  const [gasoline, setGasoline] = useState(d.gasoline_l ?? '');
  const [diesel, setDiesel] = useState(d.diesel_l ?? '');
  const [source, setSource] = useState('');
  const [busy, run] = useSave(onClose);
  const g = Number(gasoline);
  const di = Number(diesel);
  const valid = gasoline !== '' && diesel !== '' && Number.isInteger(g) && Number.isInteger(di) && g >= 0 && di >= 0;
  const over = valid && d.capacity_l > 0 && g + di > d.capacity_l;
  const submit = () =>
    run(
      () => api(`/resources/fuel-depots/${d.id}`, { method: 'PATCH', body: { gasoline_l: g, diesel_l: di, source: source || null } }),
      `Đã cập nhật nhiên liệu ${d.name}`,
    );
  return (
    <Modal
      open
      onClose={onClose}
      title={`Nhiên liệu dự trữ – ${d.name}`}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" disabled={busy || !valid || over} onClick={submit}>Lưu</button>
        </>
      }
    >
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          Xăng (lít) *
          <input className="input" type="number" min="0" value={gasoline} onChange={(e) => setGasoline(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          Dầu (lít) *
          <input className="input" type="number" min="0" value={diesel} onChange={(e) => setDiesel(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          Nguồn báo
          <input className="input" maxLength={200} placeholder="VD: Cửa hàng xăng dầu số 3 báo lúc 16h" value={source} onChange={(e) => setSource(e.target.value)} />
        </label>
        <p className={over ? 'text-xs text-danger sm:col-span-2' : 'text-[11px] text-muted sm:col-span-2'}>
          Sức chứa {int(d.capacity_l)} L{over ? ' — tổng xăng + dầu đang vượt sức chứa, kiểm tra lại' : ''}.
          {d.updated_at ? ` Cập nhật lần cuối ${dateTime(d.updated_at)}.` : ''}
        </p>
      </div>
    </Modal>
  );
}
