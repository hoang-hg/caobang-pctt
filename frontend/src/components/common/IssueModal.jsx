import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { PackageMinus } from 'lucide-react';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { FieldError, Modal } from './ui';
import { usePermission } from '../../rbac/usePermission';

const field = 'input mt-1 min-h-[44px] sm:min-h-0';

/** Ra lệnh xuất kho: số tồn trên mọi màn hình tự nhảy qua WebSocket. Lỗi hiện ngay dưới ô: chưa chọn mặt hàng (sau khi
 * bấm Xuất kho), số lượng không phải số nguyên dương hoặc vượt tồn (ngay khi gõ). */
export default function IssueModal({ warehouse, onClose }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const allowed = usePermission('inventory', 'issue', warehouse?.admin_code);
  const { data: list = [] } = useQuery({ queryKey: ['warehouses', 'all'], queryFn: () => api('/resources/warehouses'), enabled: !!warehouse });
  const wh = list.find((w) => w.id === warehouse?.id);
  const [item, setItem] = useState('');
  const [qty, setQty] = useState('10');
  const [dest, setDest] = useState('');
  const [busy, setBusy] = useState(false); // bấm đúp = xuất kho 2 lần (mỗi lần đều hợp lệ nếu còn đủ hàng)
  const [tried, setTried] = useState(false); // đã bấm Xuất kho → hiện lỗi "chưa chọn mặt hàng"
  const itemRef = useRef(null);
  const qtyRef = useRef(null);
  if (!warehouse) return null;
  const selected = wh?.items.find((i) => i.item_code === item);
  const n = Number(qty);
  const errors = {
    item: !item ? 'Chọn mặt hàng cần xuất' : null,
    qty: !(Number.isInteger(n) && n >= 1)
      ? 'Số lượng là số nguyên từ 1 trở lên'
      : selected && n > selected.quantity ? `Vượt tồn kho — kho chỉ còn ${selected.quantity} ${selected.unit}` : null,
  };
  const errItem = tried ? errors.item : null;

  const submit = async () => {
    if (errors.item || errors.qty) {
      setTried(true);
      (errors.item ? itemRef : qtyRef).current?.focus();
      return;
    }
    setBusy(true);
    try {
      await api(`/resources/warehouses/${warehouse.id}/issue`, { method: 'POST', body: { item_code: item, quantity: n, destination: dest || null } });
      toast({ tone: 'good', title: `Đã xuất ${n} ${selected?.unit || ''} ${selected?.name || item}`, body: warehouse.name });
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      qc.invalidateQueries({ queryKey: ['map-layers'] });
      onClose();
    } catch (e) {
      toast({ tone: 'danger', title: 'Không xuất được kho', body: e.message });
    } finally {
      setBusy(false);
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
          <button type="button" className="btn-ghost min-h-[44px] sm:min-h-0" onClick={onClose}>Huỷ</button>
          <button type="button" className="btn-primary min-h-[44px] sm:min-h-0" disabled={!allowed || busy} onClick={submit}>
            <PackageMinus size={15} /> Xuất kho
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <label>
          Mặt hàng *
          <select
            ref={itemRef}
            className={clsx(field, errItem && 'border-danger')}
            value={item}
            onChange={(e) => setItem(e.target.value)}
            aria-invalid={!!errItem}
            aria-describedby="loi-mat-hang"
          >
            <option value="">— Chọn —</option>
            {wh?.items.map((i) => (
              <option key={i.item_code} value={i.item_code}>{i.name} (tồn {i.quantity} {i.unit})</option>
            ))}
          </select>
          <FieldError id="loi-mat-hang">{errItem}</FieldError>
        </label>
        <label>
          Số lượng * {selected && <span className="text-muted">({selected.unit}, tối đa {selected.quantity})</span>}
          <input
            ref={qtyRef}
            type="number"
            inputMode="numeric"
            min={1}
            max={selected?.quantity}
            className={clsx(field, errors.qty && 'border-danger')}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            aria-invalid={!!errors.qty}
            aria-describedby="loi-so-luong"
          />
          <FieldError id="loi-so-luong">{errors.qty}</FieldError>
        </label>
        <label>
          Nơi nhận
          <input className={field} maxLength={200} placeholder="VD: Điểm sơ tán Trường THPT Bảo Lạc" value={dest} onChange={(e) => setDest(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}
