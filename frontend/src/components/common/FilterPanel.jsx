import clsx from 'clsx';

/**
 * Bảng "Bộ lọc" dọc ở cột trái (máy tính ≥ 1280 px — bản vẽ desktop khung E): mỗi điều kiện một nhóm có tên; nhóm ít lựa
 * chọn (≤ 4) là các nút xếp dọc kèm số dòng ("Cấp tỉnh (8)"), nhiều hơn là ô chọn; cuối cùng ô "Xếp". Cùng dữ liệu với
 * FilterToolbar (`fields`, `filters`, `counts`, `sorts`) — trang chỉ đổi chỗ đặt, không đổi cách lọc.
 */
export default function FilterPanel({ fields, filters, counts, onFilter, sorts, sort, onSort, onClear, className }) {
  const active = fields.some((f) => filters[f.key]);
  const btn = (on) => clsx(
    'tap flex h-11 w-full items-center justify-between gap-2 rounded-xl border px-3.5 text-left text-sm transition-colors',
    on ? 'border-2 border-accent bg-accent/5 font-semibold text-accent' : 'border-line bg-panel text-ink hover:bg-panel2',
  );
  return (
    <aside aria-label="Bộ lọc" className={clsx('sheet flex flex-col gap-4 p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold text-ink">Bộ lọc</h2>
        {active && (
          <button type="button" onClick={onClear} className="tap rounded px-1 text-xs font-semibold text-accent hover:underline">Bỏ lọc</button>
        )}
      </div>
      {fields.map((f) => {
        const n = (v) => (counts?.[f.key] ? counts[f.key][v] ?? 0 : null);
        // hideEmpty: bỏ lựa chọn không có bản ghi nào (VD "Cấp cụm" — địa bàn huyện cũ, dữ liệu hiện hành không dùng), trừ khi đang chọn
        const options = f.hideEmpty && counts?.[f.key] ? f.options.filter(([v]) => n(v) > 0 || filters[f.key] === v) : f.options;
        const id = `loc-${f.key}`;
        return (
          <div key={f.key} className="flex flex-col gap-1.5" role="group" aria-labelledby={id}>
            <div id={id} className="text-xs font-bold text-ink-2">{f.label}</div>
            {options.length <= 4 ? (
              <>
                <button type="button" aria-pressed={!filters[f.key]} className={btn(!filters[f.key])} onClick={() => onFilter(f.key, '')}>
                  {f.all}
                </button>
                {options.map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={filters[f.key] === value} className={btn(filters[f.key] === value)} onClick={() => onFilter(f.key, filters[f.key] === value ? '' : value)}>
                    <span className="min-w-0 truncate">{label}{n(value) != null && <span className="num font-normal text-muted"> ({n(value)})</span>}</span>
                  </button>
                ))}
              </>
            ) : (
              <select
                className={clsx('input tap h-11 rounded-xl bg-panel text-sm', filters[f.key] && 'border-accent font-semibold text-accent')}
                value={filters[f.key]}
                onChange={(e) => onFilter(f.key, e.target.value)}
                aria-label={f.label}
              >
                <option value="">{f.all}</option>
                {options.map(([value, label]) => (
                  <option key={value} value={value}>{label}{n(value) != null ? ` (${n(value)})` : ''}</option>
                ))}
              </select>
            )}
          </div>
        );
      })}
      {sorts?.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-xs font-bold text-ink-2" aria-hidden="true">Xếp</div>
          <select className="input tap h-11 rounded-xl bg-panel text-sm" value={sort} onChange={(e) => onSort(e.target.value)} aria-label="Sắp xếp">
            {sorts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      )}
    </aside>
  );
}
