import { forwardRef } from 'react';
import clsx from 'clsx';

/**
 * Ô số lượng cho điện thoại, ít gõ: −lớn · −nhỏ · [ô số] · +nhỏ · +lớn (nút ≥ 44 px trên màn cảm ứng) và chip chọn nhanh.
 * Giá trị là chuỗi (để trống được — form tự báo "nhập số lượng"); nút cộng / trừ giữ trong [min, max]. `steps`: [nhỏ, lớn]
 * (xuất kho 1 / 10, nhập kho 10 / 100). `quick`: [10, 50…]; `allLabel`: chip lấy đúng `max` (VD "Tất cả 41").
 */
const QtyStepper = forwardRef(function QtyStepper(
  { id, value, onChange, min = 0, max, steps = [1, 10], quick = [], allLabel, invalid, describedBy, unit },
  ref,
) {
  const cur = value !== '' && Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0;
  const clamp = (x) => Math.max(min, max != null ? Math.min(max, x) : x);
  const bump = (d) => onChange(String(clamp(cur + d)));
  const btn = 'btn-ghost tap-sq h-10 min-w-[40px] px-1 font-mono text-xs sm:h-9';
  const chip = (on) => clsx('chip tap min-h-[32px] border px-2.5 font-mono', on ? 'border-accent bg-accent text-white' : 'border-line bg-panel2 text-ink-2 hover:bg-panel');
  return (
    <div className="mt-1">
      <div className="flex items-center gap-1.5">
        <button type="button" className={btn} onClick={() => bump(-steps[1])} aria-label={`Bớt ${steps[1]}`}>−{steps[1]}</button>
        <button type="button" className={btn} onClick={() => bump(-steps[0])} aria-label={`Bớt ${steps[0]}`}>−{steps[0]}</button>
        <div className="relative min-w-0 flex-1">
          <input
            ref={ref}
            id={id}
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            className={clsx('input tap min-h-[44px] text-center font-mono text-base sm:min-h-[36px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none', unit && 'pr-12', invalid && 'border-danger')}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={!!invalid}
            aria-describedby={describedBy}
          />
          {unit && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted">{unit}</span>}
        </div>
        <button type="button" className={btn} onClick={() => bump(steps[0])} aria-label={`Thêm ${steps[0]}`}>+{steps[0]}</button>
        <button type="button" className={btn} onClick={() => bump(steps[1])} aria-label={`Thêm ${steps[1]}`}>+{steps[1]}</button>
      </div>
      {(quick.length > 0 || (allLabel && max != null)) && (
        <div className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Chọn nhanh số lượng">
          {quick.map((x) => (
            <button key={x} type="button" className={chip(cur === x && value !== '')} onClick={() => onChange(String(x))}>{x.toLocaleString('vi-VN')}</button>
          ))}
          {allLabel && max != null && (
            <button type="button" className={chip(cur === max && value !== '')} onClick={() => onChange(String(max))}>{allLabel}</button>
          )}
        </div>
      )}
    </div>
  );
});

export default QtyStepper;
