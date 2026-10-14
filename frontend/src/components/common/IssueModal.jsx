import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, PackageMinus, Search, X } from 'lucide-react';
import { api } from '../../api/client';
import { useAreaQuery } from '../../api/hooks';
import { useStore } from '../../app/store';
import { ErrorState, FieldError, Modal, Progress, Skeleton, StepChips } from './ui';
import { usePermission } from '../../rbac/usePermission';
import { foldVi, int } from '../../utils/format';
import { STOCK_LOW, stockLevel } from '../../utils/risk';
import QtyStepper from './QtyStepper';

const STEPS = ['Mặt hàng', 'Số lượng & nơi nhận'];
const BIG = 'min-h-[44px] text-sm sm:min-h-0';

/** Ra lệnh xuất kho (thiết kế C.2) — gói ngoài: mỗi lần mở là một form mới (không giữ số của lần trước / kho khác). */
export default function IssueModal({ warehouse, onClose }) {
  if (!warehouse) return null;
  return <IssueForm key={warehouse.id} warehouse={warehouse} onClose={onClose} />;
}

/**
 * Form 2 bước cho điện thoại, ít gõ: (1) chạm chọn mặt hàng — dòng to, kèm tồn và vạch % định mức theo thang màu;
 * (2) số lượng bằng nút −10 / −1 / +1 / +10 hoặc chip nhanh, xem trước tồn còn lại (dưới 20 % → báo kho sẽ cạn kiệt),
 * nơi nhận gợi ý từ điểm sơ tán trong vùng. Lỗi hiện ngay dưới ô: số lượng sai / vượt tồn khi gõ; chưa chọn mặt hàng khi bấm
 * Tiếp. Số tồn trên mọi màn hình tự nhảy qua WebSocket sau khi xuất.
 */
function IssueForm({ warehouse, onClose }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const allowed = usePermission('inventory', 'issue', warehouse.admin_code);
  // Số tồn mới nhất của kho (danh sách trên trang có thể cũ vài giây)
  const listQ = useQuery({ queryKey: ['warehouses', 'all'], queryFn: () => api('/resources/warehouses') });
  const sitesQ = useAreaQuery('evacuation-sites', '/resources/evacuation-sites', {}, { staleTime: 300_000 });
  // Kho mở từ popup Bản đồ không kèm danh sách mặt hàng → chờ số tồn mới nhất, không dùng dữ liệu thiếu
  const wh = listQ.data?.find((w) => w.id === warehouse.id) || (warehouse.items ? warehouse : null);
  const items = wh?.items || [];
  const [step, setStep] = useState(0);
  const [item, setItem] = useState('');
  const [qty, setQty] = useState('');
  const [dest, setDest] = useState('');
  const [search, setSearch] = useState('');
  const [tried, setTried] = useState(false); // đã bấm Tiếp / Xuất → hiện lỗi "chưa chọn", "chưa nhập"
  const [busy, setBusy] = useState(false); // bấm đúp = xuất kho 2 lần
  const qtyRef = useRef(null);
  const listRef = useRef(null);

  const sel = items.find((i) => i.item_code === item);
  const n = Number(qty);
  const errors = {
    item: !sel ? 'Chọn mặt hàng cần xuất' : null,
    qty: qty === ''
      ? 'Nhập số lượng cần xuất'
      : !(Number.isInteger(n) && n >= 1)
        ? 'Số lượng là số nguyên từ 1 trở lên'
        : sel && n > sel.quantity ? `Vượt tồn kho — kho chỉ còn ${int(sel.quantity)} ${sel.unit}` : null,
  };
  const errItem = tried ? errors.item : null;
  const errQty = qty !== '' || tried ? errors.qty : null; // gõ sai → báo ngay; để trống → báo khi bấm Xuất
  const after = sel && !errors.qty ? sel.quantity - n : null;
  const pctAfter = after != null && sel.safety_quota > 0 ? Math.round((100 * after) / sel.safety_quota) : null;
  const lvAfter = stockLevel(pctAfter);
  const nq = foldVi(search.trim());
  const shownItems = nq ? items.filter((i) => foldVi(i.name).includes(nq)) : items;
  const sites = (sitesQ.data || []).map((s) => s.name);
  const nearSites = (sitesQ.data || []).filter((s) => s.admin_name && s.admin_name === wh?.admin_name).slice(0, 3);

  const pick = (code) => {
    setItem(code);
    setQty('');
    setTried(false);
    setStep(1);
    requestAnimationFrame(() => qtyRef.current?.focus());
  };
  const next = () => {
    if (errors.item) {
      setTried(true);
      listRef.current?.querySelector('button:not([disabled])')?.focus();
      return;
    }
    setStep(1);
  };
  const submit = async () => {
    if (errors.item || errors.qty) {
      setTried(true);
      if (errors.item) setStep(0);
      else qtyRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await api(`/resources/warehouses/${warehouse.id}/issue`, { method: 'POST', body: { item_code: item, quantity: n, destination: dest.trim() || null } });
      toast({ tone: 'good', title: `Đã xuất ${int(n)} ${sel.unit} ${sel.name}`, body: `${warehouse.name}${dest.trim() ? ` → ${dest.trim()}` : ''}` });
      ['warehouses', 'map-layers', 'supplies', 'resources-summary', 'kpis'].forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
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
        // Điện thoại: nút chính chiếm trọn hàng dưới cùng (gần ngón cái); máy tính: một hàng
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
          {!allowed && <span className="col-span-2 self-center text-xs text-danger sm:mr-auto">Bạn không có quyền xuất kho này</span>}
          {step > 0 && (
            <button type="button" className={clsx('btn-ghost sm:mr-auto', BIG)} onClick={() => setStep(0)} disabled={busy}>
              <ChevronLeft size={15} /> Quay lại
            </button>
          )}
          <button type="button" className={clsx('btn-ghost', step === 0 && 'col-span-2', BIG)} onClick={onClose} disabled={busy}>
            <X size={15} /> Huỷ
          </button>
          {step === 0 ? (
            <button type="button" className={clsx('btn-primary col-span-2', BIG)} onClick={next}>
              Tiếp <ChevronRight size={15} />
            </button>
          ) : (
            <button
              type="button"
              className={clsx('btn-primary col-span-2 font-bold', BIG)}
              disabled={!allowed || busy}
              onMouseDown={(e) => e.preventDefault()} // lỗi hiện khi rời ô làm nút nhảy chỗ → giữ con trỏ, không mất cú bấm
              onClick={submit}
            >
              <PackageMinus size={15} /> {sel && !errors.qty ? `Xuất ${int(n)} ${sel.unit}` : 'Xuất kho'}
            </button>
          )}
        </div>
      }
    >
      <StepChips steps={STEPS} step={step} onStep={setStep} done={[!errors.item]} disabled={busy} />

      {step === 0 ? (
        <div className="flex flex-col gap-2">
          {items.length > 8 && (
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input className="input tap min-h-[40px] pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm mặt hàng…" aria-label="Tìm mặt hàng" />
            </div>
          )}
          {!wh ? (listQ.isError ? <ErrorState onRetry={listQ.refetch}>Không tải được số tồn của kho</ErrorState> : <Skeleton height={160} />)
            : !items.length && <p className="text-sm text-muted">Kho chưa có số liệu tồn kho.</p>}
          <div ref={listRef} role="radiogroup" aria-label="Mặt hàng cần xuất" aria-describedby="loi-mat-hang" className="flex flex-col gap-1.5">
            {shownItems.map((i) => {
              const lv = stockLevel(i.pct);
              return (
                <button
                  key={i.item_code}
                  type="button"
                  role="radio"
                  aria-checked={item === i.item_code}
                  disabled={i.quantity <= 0}
                  onClick={() => pick(i.item_code)}
                  className={clsx(
                    'card tap flex min-h-[52px] w-full items-center gap-3 px-3 py-2 text-left disabled:opacity-50',
                    item === i.item_code ? 'border-accent ring-1 ring-accent' : 'hover:border-accent',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <b className="truncate text-sm text-ink">{i.name}</b>
                      <span className={clsx('shrink-0 font-mono text-xs', lv === 3 && 'font-bold text-danger')}>
                        {i.quantity > 0 ? `tồn ${int(i.quantity)} ${i.unit}` : 'hết hàng'}
                      </span>
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <Progress className="flex-1" value={i.pct ?? 0} level={lv} />
                      <span className="w-9 shrink-0 text-right font-mono text-[11px] text-muted">{i.pct == null ? '–' : `${i.pct}%`}</span>
                    </span>
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-muted" aria-hidden="true" />
                </button>
              );
            })}
          </div>
          <FieldError id="loi-mat-hang">{errItem}</FieldError>
        </div>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-panel2/50 px-3 py-2">
            <span className="min-w-0"><b>{sel?.name}</b> <span className="text-muted">· tồn {int(sel?.quantity)} {sel?.unit}</span></span>
            <button type="button" className="tap shrink-0 px-1 text-xs font-semibold text-accent" onClick={() => setStep(0)}>Đổi</button>
          </div>
          <div>
            <label htmlFor="so-luong-xuat" className="font-medium">Số lượng xuất ({sel?.unit}) *</label>
            <QtyStepper
              id="so-luong-xuat"
              ref={qtyRef}
              value={qty}
              onChange={setQty}
              max={sel?.quantity}
              invalid={!!errQty}
              describedBy="loi-so-luong"
              quick={[10, 50, 100].filter((x) => sel && x < sel.quantity)}
              allLabel={sel ? `Tất cả ${int(sel.quantity)}` : null}
            />
            <FieldError id="loi-so-luong">{errQty}</FieldError>
          </div>
          {after != null && (
            <div className={clsx('rounded-lg border p-2.5 text-xs', lvAfter === 3 ? 'border-danger/50 bg-danger/5' : 'border-line')} aria-live="polite">
              Sau khi xuất, kho còn <b className="font-mono">{int(after)} {sel.unit}</b>{pctAfter != null && <> — <b>{pctAfter}%</b> định mức</>}
              <Progress className="mt-1.5" value={pctAfter ?? 0} level={lvAfter} />
              {lvAfter === 3 && <p className="mt-1 font-semibold text-danger">Dưới {STOCK_LOW}% định mức — kho sẽ báo cạn kiệt mặt hàng này</p>}
            </div>
          )}
          <div>
            <label htmlFor="noi-nhan" className="font-medium">Nơi nhận</label>
            <input
              id="noi-nhan"
              className="input mt-1 min-h-[44px] sm:min-h-0"
              list="goi-y-noi-nhan"
              maxLength={200}
              placeholder="VD: Điểm sơ tán Trường THPT Bảo Lạc"
              value={dest}
              onChange={(e) => setDest(e.target.value)}
            />
            <datalist id="goi-y-noi-nhan">{sites.map((s) => <option key={s} value={s} />)}</datalist>
            {nearSites.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {nearSites.map((s) => (
                  <button key={s.id} type="button" className={clsx('chip tap min-h-[32px] border px-2.5', dest === s.name ? 'border-accent bg-accent text-white' : 'border-line bg-panel2 text-ink-2')} onClick={() => setDest(s.name)}>
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
