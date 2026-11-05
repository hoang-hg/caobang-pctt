import { useState } from 'react';
import clsx from 'clsx';
import { FileDown, FileSpreadsheet, Loader2, Search, SlidersHorizontal, X } from 'lucide-react';

const CTRL = 'tap min-h-[40px] text-xs sm:text-sm';

/** Dòng "Đang hiện N/M — lọc: …" khi đang lọc hoặc tìm: bỏ được từng điều kiện. */
export function FilterChips({ fields, filters, q, shown, total, noun, onFilter, onClear }) {
  const active = fields.filter((f) => filters[f.key]);
  if (!active.length && !q) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs no-print" aria-live="polite">
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
      {(active.length > 1 || (active.length > 0 && q)) && (
        <button type="button" onClick={onClear} className="tap min-h-[28px] px-1.5 font-semibold text-muted underline-offset-2 hover:text-ink hover:underline">
          Bỏ lọc tất cả
        </button>
      )}
    </div>
  );
}

/**
 * Thanh tìm kiếm · lọc · xếp · xuất dùng chung (Vật tư & Lực lượng, Điều hành cứu hộ…). `fields`: [{ key, label, all,
 * options: [[giá trị, nhãn]] }], `counts[key][giá trị]` = số dòng của từng lựa chọn; `sorts`: [[giá trị, nhãn]]; `children`:
 * nút riêng của trang (VD đổi cách xem) đặt cạnh Excel / PDF.
 * Điện thoại 360 px: ô tìm cả hàng; "Bộ lọc (n)" · Excel · PDF một hàng nút ≥ 44 px; ô chọn mở trong khung khi bấm "Bộ lọc"
 * (cán bộ hiện trường chủ yếu tìm theo tên). Máy tính: một hàng. Đang lọc → hàng nhãn "Đang lọc" bỏ từng điều kiện được.
 * `sorts` rỗng (VD danh bạ): không có ô "Sắp xếp".
 * `inline` (máy tính ≥ 1280 px — bản vẽ desktop khung C): MỘT hàng không khung — ô tìm giãn, các ô lọc, cách xếp, `children`
 * (VD đổi cách xem) cao 44 px; không có Excel / PDF (trang để ở menu "Xuất"). `searchMin`: bề rộng tối thiểu ô tìm (px).
 * `noChips`: trang tự đặt `FilterChips` chỗ khác (VD các ô lọc ở cột Bộ lọc, ô tìm hẹp — dòng này cần cả hàng).
 */
export default function FilterToolbar({
  fields, sorts, placeholder, q, onSearch, filters, counts, onFilter, onClear, sort, onSort, shown, total, noun, onExcel, onPdf, exporting,
  children, inline = false, searchMin = 208, noChips = false,
}) {
  const [open, setOpen] = useState(false);
  const active = fields.filter((f) => filters[f.key]);
  const searchBox = (
    <div className={clsx('relative', inline ? 'flex-1' : 'min-w-0 flex-[1_1_100%] sm:flex-1')} style={inline ? { minWidth: searchMin } : undefined}>
      <Search size={inline ? 16 : 14} className={clsx('pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted', inline ? 'left-3.5' : 'left-2.5')} aria-hidden="true" />
      <input
        className={clsx('input pr-9', inline ? 'tap h-11 rounded-xl bg-panel pl-10 text-sm' : clsx('pl-8', CTRL))}
        placeholder={placeholder}
        title={placeholder}
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
  );
  const selCls = (on) => clsx('input min-w-0', inline ? 'tap h-11 w-auto max-w-[11rem] rounded-xl bg-panel px-3 text-sm' : clsx('w-full px-2 sm:w-auto sm:max-w-[15rem]', CTRL), on && 'border-accent font-semibold text-accent');
  const selects = fields.map((f) => (
    <select key={f.key} className={selCls(filters[f.key])} value={filters[f.key]} onChange={(e) => onFilter(f.key, e.target.value)} aria-label={f.label}>
      <option value="">{f.all}</option>
      {f.options.map(([value, label]) => (
        <option key={value} value={value}>{label}{counts?.[f.key] ? ` (${counts[f.key][value] ?? 0})` : ''}</option>
      ))}
    </select>
  ));
  const sortBox = sorts?.length > 0 && (
    <select className={clsx(selCls(false), !inline && 'sm:ml-auto')} value={sort} onChange={(e) => onSort(e.target.value)} aria-label="Sắp xếp">
      {sorts.map(([value, label]) => <option key={value} value={value}>Xếp: {label}</option>)}
    </select>
  );
  const chips = !noChips && <FilterChips fields={fields} filters={filters} q={q} shown={shown} total={total} noun={noun} onFilter={onFilter} onClear={onClear} />;
  if (inline) {
    return (
      <div className="flex flex-col gap-2 no-print">
        <div className="flex items-center gap-2.5">
          {searchBox}
          {selects}
          {sortBox}
          {children}
        </div>
        {chips}
      </div>
    );
  }
  return (
    <div className="card flex flex-col gap-2 p-2 no-print">
      {/* Hàng 1: ô tìm · (điện thoại: Bộ lọc) · Excel · PDF. Hàng 2: các ô lọc + cách xếp (điện thoại: mở bằng "Bộ lọc") */}
      <div className="flex flex-wrap items-center gap-2">
        {searchBox}
        <button
          type="button"
          className={clsx('btn-ghost flex-1 px-2.5 sm:hidden', CTRL, (open || active.length > 0) && 'border-accent text-accent')}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <SlidersHorizontal size={14} aria-hidden="true" /> Bộ lọc{active.length ? ` (${active.length})` : ''}
        </button>
        {onExcel && <button type="button" className={clsx('btn-ghost flex-1 px-2.5 sm:flex-none', CTRL)} onClick={onExcel} disabled={!shown} title={`Xuất Excel ${shown} ${noun} đang lọc`}>
          <FileSpreadsheet size={14} aria-hidden="true" /> Excel
        </button>}
        {onPdf && <button type="button" className={clsx('btn-ghost flex-1 px-2.5 sm:flex-none', CTRL)} onClick={onPdf} disabled={!shown || exporting} title={`Xuất PDF ${shown} ${noun} đang lọc`}>
          {exporting ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <FileDown size={14} aria-hidden="true" />} PDF
        </button>}
        {children}
      </div>
      <div className={clsx('grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center', !open && 'max-sm:hidden')}>
        {selects}
        {sortBox}
      </div>
      {chips}
    </div>
  );
}
