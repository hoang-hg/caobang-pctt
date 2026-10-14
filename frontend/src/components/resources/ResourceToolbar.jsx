import { useState } from 'react';
import clsx from 'clsx';
import { FileDown, FileSpreadsheet, Loader2, Search, SlidersHorizontal, X } from 'lucide-react';
import { FILTERS, SORTS } from './resourceFacts';

const PLACEHOLDER = {
  luc_luong: 'Tìm đơn vị, chỉ huy, kỹ năng…',
  vat_tu: 'Tìm kho, xã/phường, mặt hàng…',
  phuong_tien: 'Tìm số hiệu, loại, đơn vị…',
};
const CTRL = 'tap min-h-[40px] text-xs sm:text-sm';

/**
 * Thanh tìm kiếm · lọc · xếp · xuất của thẻ đang mở. Bộ lọc theo từng thẻ (resourceFacts.FILTERS), mỗi lựa chọn kèm số dòng.
 * Điện thoại 360 px: ô tìm cả hàng; "Bộ lọc (n)" · Excel · PDF một hàng nút ≥ 44 px; ô chọn mở trong khung khi bấm "Bộ lọc"
 * (cán bộ hiện trường chủ yếu tìm theo tên). Máy tính: một hàng. Đang lọc → hàng nhãn "Đang lọc" bỏ từng điều kiện được.
 */
export default function ResourceToolbar({
  tab, q, onSearch, filters, counts, onFilter, onClear, sort, onSort, shown, total, noun, onExcel, onPdf, exporting,
}) {
  const [open, setOpen] = useState(false);
  const fields = FILTERS[tab];
  const active = fields.filter((f) => filters[f.key]);
  return (
    <div className="card flex flex-col gap-2 p-2 no-print">
      {/* Hàng 1: ô tìm · (điện thoại: Bộ lọc) · Excel · PDF. Hàng 2: các ô lọc + cách xếp (điện thoại: mở bằng "Bộ lọc") */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-[1_1_100%] sm:flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            className={clsx('input pl-8 pr-9', CTRL)}
            placeholder={PLACEHOLDER[tab]}
            value={q}
            onChange={(e) => onSearch(e.target.value)}
            aria-label="Tìm trong danh sách"
            enterKeyHint="search"
          />
          {q && (
            <button
              type="button"
              className="tap-sq absolute right-0.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:text-ink"
              onClick={() => onSearch('')}
              aria-label="Xoá ô tìm"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          type="button"
          className={clsx('btn-ghost flex-1 px-2.5 sm:hidden', CTRL, (open || active.length > 0) && 'border-accent text-accent')}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <SlidersHorizontal size={14} aria-hidden="true" /> Bộ lọc{active.length ? ` (${active.length})` : ''}
        </button>
        <button type="button" className={clsx('btn-ghost flex-1 px-2.5 sm:flex-none', CTRL)} onClick={onExcel} disabled={!shown} title={`Xuất Excel ${shown} ${noun} đang lọc`}>
          <FileSpreadsheet size={14} aria-hidden="true" /> Excel
        </button>
        <button type="button" className={clsx('btn-ghost flex-1 px-2.5 sm:flex-none', CTRL)} onClick={onPdf} disabled={!shown || exporting} title={`Xuất PDF ${shown} ${noun} đang lọc`}>
          {exporting ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <FileDown size={14} aria-hidden="true" />} PDF
        </button>
      </div>
      <div className={clsx('grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center', !open && 'max-sm:hidden')}>
        {fields.map((f) => (
          <select
            key={f.key}
            className={clsx('input w-full min-w-0 px-2 sm:w-auto sm:max-w-[15rem]', CTRL, filters[f.key] && 'border-accent font-semibold text-accent')}
            value={filters[f.key]}
            onChange={(e) => onFilter(f.key, e.target.value)}
            aria-label={f.label}
          >
            <option value="">{f.all}</option>
            {f.options.map(([value, label]) => (
              <option key={value} value={value}>{label}{counts?.[f.key] ? ` (${counts[f.key][value] ?? 0})` : ''}</option>
            ))}
          </select>
        ))}
        <select
          className={clsx('input w-full min-w-0 px-2 sm:ml-auto sm:w-auto sm:max-w-[15rem]', CTRL)}
          value={sort}
          onChange={(e) => onSort(e.target.value)}
          aria-label="Sắp xếp"
        >
          {SORTS[tab].map(([value, label]) => <option key={value} value={value}>Xếp: {label}</option>)}
        </select>
      </div>
      {(active.length > 0 || q) && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs" aria-live="polite">
          <span className="text-muted">Đang hiện <b className="text-ink">{shown}</b>/{total} {noun}{active.length ? ' — lọc:' : ''}</span>
          {active.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => onFilter(f.key, '')}
              className="tap inline-flex min-h-[28px] items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2.5 font-semibold text-accent hover:bg-accent/15"
              aria-label={`Bỏ lọc ${f.label}: ${f.options.find(([v]) => v === filters[f.key])?.[1]}`}
            >
              {f.options.find(([v]) => v === filters[f.key])?.[1]} <X size={12} aria-hidden="true" />
            </button>
          ))}
          {(active.length > 1 || (active.length && q)) && (
            <button type="button" onClick={onClear} className="tap min-h-[28px] px-1.5 font-semibold text-muted underline-offset-2 hover:text-ink hover:underline">
              Bỏ lọc tất cả
            </button>
          )}
        </div>
      )}
    </div>
  );
}
