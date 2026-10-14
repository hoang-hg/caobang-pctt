import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { CheckCircle2, ChevronLeft, ChevronRight, PackagePlus, Search, Wrench, X } from 'lucide-react';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { ErrorState, FieldError, Modal, Progress, Skeleton, StepChips } from './ui';
import QtyStepper from './QtyStepper';
import { CATEGORY } from '../../utils/labels';
import { dateTime, foldVi, int } from '../../utils/format';
import { STOCK_LOW, stockLevel } from '../../utils/risk';

const BIG = 'min-h-[44px] text-sm sm:min-h-0';
const field = 'input mt-1 min-h-[44px] sm:min-h-0';

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

/** Hàng nút cuối hộp thoại: điện thoại — nút chính chiếm trọn hàng dưới cùng (gần ngón cái); máy tính — một hàng. */
function Footer({ back, onCancel, busy, children }) {
  return (
    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
      {back && (
        <button type="button" className={clsx('btn-ghost sm:mr-auto', BIG)} onClick={back} disabled={busy}>
          <ChevronLeft size={15} /> Quay lại
        </button>
      )}
      <button type="button" className={clsx('btn-ghost', !back && 'col-span-2', BIG)} onClick={onCancel} disabled={busy}>
        <X size={15} /> Huỷ
      </button>
      {children}
    </div>
  );
}
const primary = clsx('btn-primary col-span-2 font-bold', BIG);
const keepFocus = (e) => e.preventDefault(); // lỗi hiện khi rời ô làm nút nhảy chỗ → giữ con trỏ, không mất cú bấm

/** Ngày hôm nay theo giờ Việt Nam (YYYY-MM-DD) — so hạn dùng như máy chủ (logistics.receive_problem). */
const vnToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const plusMonths = (months) => {
  const d = new Date(`${vnToday()}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};

const VEHICLE_REASONS = ['Hỏng máy', 'Hỏng chân vịt / lốp', 'Thủng, rò nước', 'Bảo dưỡng định kỳ', 'Chờ phụ tùng'];
const FUEL_CHIPS = [100, 75, 50, 25, 10];

/**
 * Báo tình trạng phương tiện (quyền vehicle.update): Sẵn sàng ↔ Bảo dưỡng / hỏng, mức nhiên liệu (%). "Đang làm nhiệm vụ"
 * chỉ do lệnh điều động gán — báo hỏng giữa nhiệm vụ thì phương tiện rời nhiệm vụ. Điện thoại, ít gõ: 2 nút trạng thái to,
 * chip lý do hỏng, chip mức nhiên liệu (100 · 75 · 50 · 25 · 10 %), vạch xem trước theo thang màu (dưới 20 % = không được
 * gợi ý điều động). Lỗi hiện ngay dưới ô; bấm Lưu mà chưa đổi gì → nói rõ, không khoá nút im lặng.
 */
export function VehicleModal({ vehicle: v, onClose }) {
  const [status, setStatus] = useState(v.status === 'bao_duong' ? 'bao_duong' : 'san_sang');
  const [fuel, setFuel] = useState(v.fuel_level == null ? '' : String(v.fuel_level));
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, run] = useSave(onClose);
  const fuelRef = useRef(null);
  const statusChanged = v.status === 'nhiem_vu' ? status === 'bao_duong' : status !== v.status;
  const f = Number(fuel);
  const fuelErr = fuel === '' || (Number.isInteger(f) && f >= 0 && f <= 100) ? null : 'Mức nhiên liệu là số nguyên từ 0 đến 100 (%)';
  const fuelChanged = fuel !== '' && !fuelErr && f !== v.fuel_level;
  const nothing = !statusChanged && !fuelChanged;
  const lv = fuel === '' || fuelErr ? null : stockLevel(f);
  const pickReason = (r) => setNote((n) => (!n.trim() || VEHICLE_REASONS.includes(n) ? r : `${n.trim()}; ${r}`));
  const submit = () => {
    if (fuelErr) {
      fuelRef.current?.focus();
      return;
    }
    if (nothing) {
      setTried(true);
      return;
    }
    run(
      () => api(`/resources/vehicles/${v.id}`, {
        method: 'PATCH',
        body: { status: statusChanged ? status : null, fuel_level: fuelChanged ? f : null, note: note.trim() || null },
      }),
      `Đã cập nhật ${v.code}`,
    );
  };
  const opt = (on, tone) => clsx(
    'tap flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors',
    on ? (tone === 'danger' ? 'border-danger bg-danger/10 text-danger ring-1 ring-danger' : 'border-accent bg-accent/10 text-ink ring-1 ring-accent') : 'border-line bg-panel2/50 text-ink-2 hover:bg-panel2',
  );
  const chip = (on) => clsx('chip tap min-h-[32px] border px-2.5', on ? 'border-accent bg-accent text-white' : 'border-line bg-panel2 text-ink-2 hover:bg-panel');
  return (
    <Modal
      open
      onClose={onClose}
      title={`Tình trạng phương tiện – ${v.code}`}
      footer={
        <Footer onCancel={onClose} busy={busy}>
          <button type="button" className={primary} disabled={busy} onMouseDown={keepFocus} onClick={submit}>Lưu tình trạng</button>
        </Footer>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <div>
          <div className="font-medium" id="tt-xe">Trạng thái</div>
          <div className="mt-1 flex gap-2" role="radiogroup" aria-labelledby="tt-xe">
            <button type="button" role="radio" aria-checked={status === 'san_sang'} className={opt(status === 'san_sang')} onClick={() => setStatus('san_sang')}>
              <CheckCircle2 size={16} className="shrink-0 text-good" aria-hidden="true" />
              {v.status === 'nhiem_vu' ? 'Giữ nguyên (đang nhiệm vụ)' : 'Sẵn sàng'}
            </button>
            <button type="button" role="radio" aria-checked={status === 'bao_duong'} className={opt(status === 'bao_duong', 'danger')} onClick={() => setStatus('bao_duong')}>
              <Wrench size={16} className="shrink-0" aria-hidden="true" /> Hỏng / bảo dưỡng
            </button>
          </div>
          {v.status === 'nhiem_vu' && status === 'bao_duong' && (
            <p className="mt-1 text-xs font-semibold text-danger">Phương tiện sẽ rời nhiệm vụ {v.mission_code} và không được gợi ý điều động.</p>
          )}
        </div>

        {status === 'bao_duong' && (
          <div>
            <label htmlFor="ly-do-hong" className="font-medium">Lý do (chạm để chọn nhanh)</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {VEHICLE_REASONS.map((r) => <button key={r} type="button" className={chip(note.includes(r))} onClick={() => pickReason(r)}>{r}</button>)}
            </div>
            <input id="ly-do-hong" className={field} maxLength={200} placeholder="VD: Hỏng chân vịt, chờ thay — tổ trưởng báo lúc 15h" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        )}

        <div>
          <label htmlFor="muc-nhien-lieu" className="font-medium">Mức nhiên liệu (%)</label>
          <div className="mt-1 flex flex-wrap gap-1.5" aria-label="Chọn nhanh mức nhiên liệu">
            {FUEL_CHIPS.map((x) => <button key={x} type="button" className={chip(fuel === String(x))} onClick={() => setFuel(String(x))}>{x === 100 ? 'Đầy 100%' : `${x}%`}</button>)}
          </div>
          <input
            id="muc-nhien-lieu"
            ref={fuelRef}
            className={clsx(field, 'font-mono', fuelErr && 'border-danger')}
            type="number"
            inputMode="numeric"
            min="0"
            max="100"
            placeholder="Chưa rõ"
            value={fuel}
            onChange={(e) => setFuel(e.target.value)}
            aria-invalid={!!fuelErr}
            aria-describedby="loi-nhien-lieu"
          />
          <FieldError id="loi-nhien-lieu">{fuelErr}</FieldError>
          {lv != null && (
            <div className="mt-1.5" aria-live="polite">
              <Progress value={f} level={lv} />
              {lv === 3 && <p className="mt-1 text-xs font-semibold text-danger">Dưới {STOCK_LOW}% — phương tiện sẽ không được gợi ý khi điều động</p>}
            </div>
          )}
          <p className="mt-1 text-[11px] text-muted">{v.fuel_updated_at ? `Báo lần cuối ${dateTime(v.fuel_updated_at)}` : 'Chưa ai báo mức nhiên liệu'}</p>
        </div>

        {status !== 'bao_duong' && (
          <label className="flex flex-col">
            <span className="font-medium">Ghi chú (nguồn báo)</span>
            <input className={field} maxLength={200} placeholder="VD: Tổ trưởng báo qua điện thoại lúc 15h" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        )}
        {tried && nothing && <FieldError id="loi-chua-doi">Chưa thay đổi trạng thái hay mức nhiên liệu</FieldError>}
        <p className="text-[11px] text-muted">
          Phương tiện bảo dưỡng / hỏng hoặc đã báo nhiên liệu dưới {STOCK_LOW}% không được gợi ý khi điều động. Thao tác được ghi nhật ký.
        </p>
      </div>
    </Modal>
  );
}

const RECEIVE_STEPS = ['Mặt hàng', 'Số lượng, hạn dùng'];

/**
 * Nhập thêm hàng vào kho (quyền inventory.receive): hàng cứu trợ về, mua bổ sung. Form 2 bước, ít gõ: (1) chạm chọn mặt
 * hàng — hàng đang có ở kho lên đầu (kèm tồn, % định mức), lọc theo nhóm, tìm không dấu; (2) số lượng bằng nút −/+ hoặc
 * chip, định mức (bắt buộc với mặt hàng mới ở kho), hạn dùng (chip +6 tháng / +1 năm / +2 năm), nguồn hàng; xem trước tồn
 * sau khi nhập. Lỗi hiện ngay dưới ô (hạn đã qua, số lượng sai); bấm Nhập khi còn thiếu → hiện lỗi + đưa con trỏ tới ô đó.
 */
export function ReceiveModal({ warehouse: w, onClose }) {
  const itemsQ = useQuery({ queryKey: ['items'], queryFn: () => api('/resources/items'), staleTime: Infinity });
  const catalog = itemsQ.data || [];
  const [step, setStep] = useState(0);
  const [code, setCode] = useState('');
  const [quantity, setQuantity] = useState('');
  const [quota, setQuota] = useState('');
  const [expiry, setExpiry] = useState('');
  const [source, setSource] = useState('');
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, run] = useSave(onClose);
  const refs = { code: useRef(null), quantity: useRef(null), quota: useRef(null), expiry: useRef(null) };

  const existing = w.items.find((i) => i.item_code === code);
  const item = catalog.find((i) => i.code === code) || (existing && { code, name: existing.name, unit: existing.unit, category: existing.category });
  const q = Number(quantity);
  const qt = Number(quota);
  const today = vnToday();
  const errors = {
    code: !item ? 'Chọn mặt hàng cần nhập' : null,
    quantity: quantity === ''
      ? 'Nhập số lượng nhập thêm'
      : !(Number.isInteger(q) && q > 0) ? 'Số lượng là số nguyên từ 1 trở lên' : q > 10_000_000 ? 'Số lượng quá lớn — kiểm tra lại' : null,
    quota: quota === ''
      ? (existing ? null : 'Mặt hàng mới ở kho này — nhập định mức an toàn để tính % dự trữ')
      : !(Number.isInteger(qt) && qt >= 0 && qt <= 10_000_000) ? 'Định mức là số nguyên từ 0 trở lên' : null,
    expiry: expiry && expiry < today ? 'Hạn dùng đã qua — không nhập hàng hết hạn vào kho cứu trợ' : null,
  };
  // Gõ sai → báo ngay; ô bắt buộc để trống → báo khi bấm Nhập
  const err = (key) => (tried || (key === 'quantity' ? quantity !== '' : key === 'quota' ? quota !== '' : key === 'expiry') ? errors[key] : null);
  const baseQuota = quota !== '' && !errors.quota ? qt : existing?.safety_quota;
  const after = !errors.quantity ? (existing?.quantity || 0) + q : null;
  const pctAfter = after != null && baseQuota > 0 ? Math.round((100 * after) / baseQuota) : null;

  const nq = foldVi(search.trim());
  const have = new Set(w.items.map((i) => i.item_code));
  const match = (i) => (!cat || i.category === cat) && (!nq || foldVi(i.name).includes(nq));
  // Hàng đang thiếu (Đỏ, Vàng) lên đầu — thủ kho thường nhập bù hàng thiếu; cùng mức giữ thứ tự danh mục
  const inStock = w.items.filter(match).sort((a, b) => (stockLevel(b.pct) ?? -1) - (stockLevel(a.pct) ?? -1));
  const others = catalog.filter((i) => !have.has(i.code) && match(i));

  const pick = (c) => {
    setCode(c);
    setQuantity('');
    setQuota('');
    setTried(false);
    setStep(1);
    requestAnimationFrame(() => refs.quantity.current?.focus());
  };
  const submit = () => {
    const bad = ['code', 'quantity', 'quota', 'expiry'].find((key) => errors[key]);
    if (bad) {
      setTried(true);
      if (bad === 'code') setStep(0);
      else refs[bad].current?.focus();
      return;
    }
    run(
      () => api(`/resources/warehouses/${w.id}/receive`, {
        method: 'POST',
        body: { item_code: code, quantity: q, safety_quota: quota === '' ? null : qt, expiry_date: expiry || null, source: source.trim() || null },
      }),
      `${w.name}: nhập ${int(q)} ${item?.unit || ''} ${item?.name || code}`,
    );
  };
  const row = (on) => clsx('card tap flex min-h-[52px] w-full items-center gap-3 px-3 py-2 text-left', on ? 'border-accent ring-1 ring-accent' : 'hover:border-accent');
  const chip = (on) => clsx('chip tap min-h-[32px] border px-2.5', on ? 'border-accent bg-accent text-white' : 'border-line bg-panel2 text-ink-2 hover:bg-panel');

  return (
    <Modal
      open
      onClose={onClose}
      title={`Nhập thêm hàng – ${w.name}`}
      footer={
        <Footer back={step > 0 ? () => setStep(0) : null} onCancel={onClose} busy={busy}>
          {step === 0 ? (
            <button type="button" className={primary} onClick={() => (item ? setStep(1) : setTried(true))}>Tiếp <ChevronRight size={15} /></button>
          ) : (
            <button type="button" className={primary} disabled={busy} onMouseDown={keepFocus} onClick={submit}>
              <PackagePlus size={15} /> {item && !errors.quantity ? `Nhập ${int(q)} ${item.unit}` : 'Nhập kho'}
            </button>
          )}
        </Footer>
      }
    >
      <StepChips steps={RECEIVE_STEPS} step={step} onStep={setStep} done={[!!item]} disabled={busy} />
      {step === 0 ? (
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex flex-wrap gap-1.5" aria-label="Lọc theo nhóm hàng">
            {[['', 'Tất cả'], ...Object.entries(CATEGORY)].map(([k, label]) => (
              <button key={k || 'all'} type="button" className={chip(cat === k)} onClick={() => setCat(k)} aria-pressed={cat === k}>{label}</button>
            ))}
          </div>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input className="input tap min-h-[40px] pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm mặt hàng (gõ không dấu được)…" aria-label="Tìm mặt hàng" />
          </div>
          <div ref={refs.code} role="radiogroup" aria-label="Mặt hàng cần nhập" aria-describedby="loi-mat-hang-nhap" className="flex flex-col gap-1.5">
            {inStock.length > 0 && <div className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Đang có ở kho</div>}
            {inStock.map((i) => (
              <button key={i.item_code} type="button" role="radio" aria-checked={code === i.item_code} className={row(code === i.item_code)} onClick={() => pick(i.item_code)}>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <b className="truncate text-ink">{i.name}</b>
                    <span className="shrink-0 font-mono text-xs">tồn {int(i.quantity)} {i.unit}</span>
                  </span>
                  <span className="mt-1 flex items-center gap-2">
                    <Progress className="flex-1" value={i.pct ?? 0} level={stockLevel(i.pct)} />
                    <span className="w-9 shrink-0 text-right font-mono text-[11px] text-muted">{i.pct == null ? '–' : `${i.pct}%`}</span>
                  </span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-muted" aria-hidden="true" />
              </button>
            ))}
            {itemsQ.isLoading ? <Skeleton height={96} />
              : itemsQ.isError && !itemsQ.data ? <ErrorState onRetry={itemsQ.refetch}>Không tải được danh mục vật tư</ErrorState>
                : others.length > 0 && (
                  <>
                    <div className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Mặt hàng khác (mới ở kho này)</div>
                    {others.map((i) => (
                      <button key={i.code} type="button" role="radio" aria-checked={code === i.code} className={row(code === i.code)} onClick={() => pick(i.code)}>
                        <span className="min-w-0 flex-1">
                          <b className="block truncate text-ink">{i.name}</b>
                          <span className="block text-xs text-muted">{CATEGORY[i.category] || i.category} · tính theo {i.unit}</span>
                        </span>
                        <ChevronRight size={16} className="shrink-0 text-muted" aria-hidden="true" />
                      </button>
                    ))}
                  </>
                )}
            {!inStock.length && !others.length && !itemsQ.isLoading && <p className="py-3 text-center text-xs text-muted">Không có mặt hàng khớp ô tìm / nhóm đang chọn</p>}
          </div>
          <FieldError id="loi-mat-hang-nhap">{tried ? errors.code : null}</FieldError>
        </div>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-panel2/50 px-3 py-2">
            <span className="min-w-0">
              <b>{item?.name}</b>{' '}
              <span className="text-muted">{existing ? `· đang có ${int(existing.quantity)} ${existing.unit}${existing.pct != null ? ` (${existing.pct}% định mức)` : ''}` : '· mặt hàng mới ở kho này'}</span>
            </span>
            <button type="button" className="tap shrink-0 px-1 text-xs font-semibold text-accent" onClick={() => setStep(0)}>Đổi</button>
          </div>
          <div>
            <label htmlFor="so-luong-nhap" className="font-medium">Số lượng nhập thêm *</label>
            <QtyStepper
              id="so-luong-nhap"
              ref={refs.quantity}
              value={quantity}
              onChange={setQuantity}
              min={0}
              steps={[10, 100]}
              quick={[10, 50, 100, 500, 1000]}
              unit={item?.unit}
              invalid={!!err('quantity')}
              describedBy="loi-so-luong-nhap"
            />
            <FieldError id="loi-so-luong-nhap">{err('quantity')}</FieldError>
          </div>
          <div>
            <label htmlFor="dinh-muc" className="font-medium">Định mức an toàn{existing ? ' (để trống = giữ như cũ)' : ' *'}</label>
            <input
              id="dinh-muc"
              ref={refs.quota}
              className={clsx(field, 'font-mono', err('quota') && 'border-danger')}
              type="number"
              inputMode="numeric"
              min="0"
              placeholder={existing ? String(existing.safety_quota) : `VD 500 (${item?.unit || ''})`}
              value={quota}
              onChange={(e) => setQuota(e.target.value)}
              aria-invalid={!!err('quota')}
              aria-describedby="loi-dinh-muc"
            />
            <FieldError id="loi-dinh-muc">{err('quota')}</FieldError>
          </div>
          {after != null && (
            <div className="rounded-lg border border-line p-2.5 text-xs" aria-live="polite">
              Sau khi nhập, kho có <b className="font-mono">{int(after)} {item?.unit}</b>{pctAfter != null && <> — <b>{pctAfter}%</b> định mức</>}
              {pctAfter != null && <Progress className="mt-1.5" value={pctAfter} level={stockLevel(pctAfter)} />}
            </div>
          )}
          <div>
            <label htmlFor="han-dung" className="font-medium">Hạn sử dụng của lô</label>
            <div className="mt-1 flex flex-wrap gap-1.5" aria-label="Chọn nhanh hạn dùng">
              {[[6, '+6 tháng'], [12, '+1 năm'], [24, '+2 năm']].map(([m, label]) => (
                <button key={m} type="button" className={chip(expiry === plusMonths(m))} onClick={() => setExpiry(plusMonths(m))}>{label}</button>
              ))}
              <button type="button" className={chip(!expiry)} onClick={() => setExpiry('')}>Không có hạn</button>
            </div>
            <input
              id="han-dung"
              ref={refs.expiry}
              className={clsx(field, err('expiry') && 'border-danger')}
              type="date"
              min={today}
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              aria-invalid={!!err('expiry')}
              aria-describedby="loi-han-dung goi-y-han-dung"
            />
            <FieldError id="loi-han-dung">{err('expiry')}</FieldError>
            <p id="goi-y-han-dung" className="mt-1 text-[11px] text-muted">Kho giữ hạn sớm nhất (lô cũ hết hạn trước) — hàng hết hạn trong 30 ngày hiện Cam</p>
          </div>
          <label className="flex flex-col">
            <span className="font-medium">Nguồn hàng</span>
            <input className={field} maxLength={200} placeholder="VD: Hội Chữ thập đỏ tỉnh" value={source} onChange={(e) => setSource(e.target.value)} />
          </label>
        </div>
      )}
    </Modal>
  );
}

/**
 * Cập nhật xăng / dầu dự trữ tại điểm cấp nhiên liệu (quyền inventory.receive). Lỗi hiện ngay dưới ô (số âm, không phải số
 * nguyên, tổng vượt sức chứa); vạch xem trước % sức chứa theo thang màu chung (dưới 20 % Đỏ).
 */
export function FuelDepotModal({ depot: d, onClose }) {
  const [gasoline, setGasoline] = useState(d.gasoline_l == null ? '' : String(d.gasoline_l));
  const [diesel, setDiesel] = useState(d.diesel_l == null ? '' : String(d.diesel_l));
  const [source, setSource] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, run] = useSave(onClose);
  const refs = { gasoline: useRef(null), diesel: useRef(null) };
  const g = Number(gasoline);
  const di = Number(diesel);
  const bad = (s, n) => (s === '' ? 'Nhập số lít (0 nếu hết)' : !(Number.isInteger(n) && n >= 0) ? 'Số lít là số nguyên từ 0 trở lên' : null);
  const errors = { gasoline: bad(gasoline, g), diesel: bad(diesel, di) };
  const total = !errors.gasoline && !errors.diesel ? g + di : null;
  const over = total != null && d.capacity_l > 0 && total > d.capacity_l
    ? `Tổng xăng + dầu (${int(total)} L) vượt sức chứa (${int(d.capacity_l)} L) — kiểm tra lại số liệu`
    : null;
  const err = (key, value) => (tried || value !== '' ? errors[key] : null);
  const pct = total != null && d.capacity_l > 0 ? (100 * total) / d.capacity_l : null;
  const submit = () => {
    const first = ['gasoline', 'diesel'].find((key) => errors[key]);
    if (first || over) {
      setTried(true);
      refs[first || 'gasoline'].current?.focus();
      return;
    }
    run(
      () => api(`/resources/fuel-depots/${d.id}`, { method: 'PATCH', body: { gasoline_l: g, diesel_l: di, source: source.trim() || null } }),
      `Đã cập nhật nhiên liệu ${d.name}`,
    );
  };
  const input = (key, label, value, set) => (
    <div className="flex flex-col">
      <label htmlFor={`nl-${key}`} className="font-medium">{label} *</label>
      <input
        id={`nl-${key}`}
        ref={refs[key]}
        className={clsx(field, 'font-mono', (err(key, value) || over) && 'border-danger')}
        type="number"
        inputMode="numeric"
        min="0"
        value={value}
        onChange={(e) => set(e.target.value)}
        aria-invalid={!!(err(key, value) || over)}
        aria-describedby={`loi-nl-${key} loi-nl-tong`}
      />
      <FieldError id={`loi-nl-${key}`}>{err(key, value)}</FieldError>
    </div>
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={`Nhiên liệu dự trữ – ${d.name}`}
      footer={
        <Footer onCancel={onClose} busy={busy}>
          <button type="button" className={primary} disabled={busy} onMouseDown={keepFocus} onClick={submit}>Lưu</button>
        </Footer>
      }
    >
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        {input('gasoline', 'Xăng (lít)', gasoline, setGasoline)}
        {input('diesel', 'Dầu (lít)', diesel, setDiesel)}
        <div className="sm:col-span-2" aria-live="polite">
          {pct != null && <Progress value={pct} level={stockLevel(pct)} />}
          <p className="mt-1 text-xs text-muted">
            {total != null ? <>Tổng <b className="font-mono text-ink">{int(total)}</b> / sức chứa {int(d.capacity_l)} L{pct != null && ` (${Math.round(pct)}%)`}</> : `Sức chứa ${int(d.capacity_l)} L`}
            {d.updated_at ? ` · cập nhật lần cuối ${dateTime(d.updated_at)}` : ''}
          </p>
          <FieldError id="loi-nl-tong">{over}</FieldError>
        </div>
        <label className="flex flex-col sm:col-span-2">
          <span className="font-medium">Nguồn báo</span>
          <input className={field} maxLength={200} placeholder="VD: Cửa hàng xăng dầu số 3 báo lúc 16h" value={source} onChange={(e) => setSource(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}
