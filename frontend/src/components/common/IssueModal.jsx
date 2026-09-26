import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PackageMinus } from 'lucide-react';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { Modal } from './ui';
import { usePermission } from '../../rbac/usePermission';

/** Ra lệnh xuất kho: số tồn trên mọi màn hình tự nhảy qua WebSocket. */
export default function IssueModal({ warehouse, onClose }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const allowed = usePermission('inventory', 'issue', warehouse?.admin_code);
  const { data: list = [] } = useQuery({ queryKey: ['warehouses', 'all'], queryFn: () => api('/resources/warehouses'), enabled: !!warehouse });
  const wh = list.find((w) => w.id === warehouse?.id);
  const [item, setItem] = useState('');
  const [qty, setQty] = useState(10);
  const [dest, setDest] = useState('');
  if (!warehouse) return null;
  const selected = wh?.items.find((i) => i.item_code === item);

  const submit = async () => {
    try {
      await api(`/resources/warehouses/${warehouse.id}/issue`, { method: 'POST', body: { item_code: item, quantity: Number(qty), destination: dest || null } });
      toast({ tone: 'good', title: `Đã xuất ${qty} ${selected?.unit || ''} ${selected?.name || item}`, body: warehouse.name });
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      qc.invalidateQueries({ queryKey: ['map-layers'] });
      onClose();
    } catch (e) {
      toast({ tone: 'danger', title: 'Không xuất được kho', body: e.message });
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Ra lệnh xuất kho – ${warehouse.name}`}
      footer={
        <>
          {!allowed && <span className="mr-auto self-center text-xs text-danger">Bạn không có quyền xuất kho này</span>}
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" disabled={!allowed || !item || qty < 1} onClick={submit}><PackageMinus size={15} /> Xuất kho</button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <label>
          Mặt hàng
          <select className="input mt-1" value={item} onChange={(e) => setItem(e.target.value)}>
            <option value="">— Chọn —</option>
            {wh?.items.map((i) => (
              <option key={i.item_code} value={i.item_code}>{i.name} (tồn {i.quantity} {i.unit})</option>
            ))}
          </select>
        </label>
        <label>
          Số lượng {selected && <span className="text-muted">({selected.unit}, tối đa {selected.quantity})</span>}
          <input type="number" min={1} max={selected?.quantity} className="input mt-1" value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
        <label>
          Nơi nhận
          <input className="input mt-1" placeholder="VD: Điểm sơ tán Trường THPT Bảo Lạc" value={dest} onChange={(e) => setDest(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}
