import clsx from 'clsx';
import { EmptyState, Progress } from '../common/ui';
import { CATEGORY } from '../../utils/labels';
import { int } from '../../utils/format';
import { RISK, STOCK_LOW, stockLevel } from '../../utils/risk';

/**
 * Tổng hợp theo mặt hàng (thiết kế C.2 — danh mục hàng hoá): cộng tồn và định mức của các kho đang hiện (cùng ô tìm, bộ lọc
 * của thẻ), % so với định mức theo thang màu chung, số kho có mặt hàng đó dưới 20%, hạn dùng gần nhất. Lãnh đạo hỏi "toàn
 * tỉnh còn bao nhiêu gạo" thì đọc ở đây; thiếu nhất lên đầu. Cộng gộp có thể che chỗ thiếu cục bộ → luôn ghi số kho thiếu.
 */
export default function ItemSummary({ warehouses, category, expiringOf }) {
  const groups = new Map();
  for (const w of warehouses) {
    for (const i of w.items) {
      if (category && i.category !== category) continue;
      const g = groups.get(i.item_code) || { code: i.item_code, name: i.name, unit: i.unit, category: i.category, qty: 0, quota: 0, n: 0, low: 0, expiring: 0, expiry: null };
      g.qty += Number(i.quantity) || 0;
      g.quota += Number(i.safety_quota) || 0;
      g.n += 1;
      if (stockLevel(i.pct) === 3) g.low += 1;
      if (expiringOf(w).includes(i)) g.expiring += 1;
      if (i.expiry_date && (!g.expiry || i.expiry_date < g.expiry)) g.expiry = i.expiry_date;
      groups.set(i.item_code, g);
    }
  }
  const rows = [...groups.values()]
    .map((g) => ({ ...g, pct: g.quota > 0 ? Math.round((100 * g.qty) / g.quota) : null }))
    .sort((a, b) => (a.pct ?? Infinity) - (b.pct ?? Infinity) || b.low - a.low);
  if (!rows.length) return <EmptyState height={96}>Chưa có số liệu tồn kho trong các kho đang hiện</EmptyState>;
  return (
    <div>
      <p className="mb-1 text-[11px] text-muted">Cộng {warehouses.length} kho đang hiện · thiếu nhất lên đầu</p>
      <ul className="divide-y divide-line/60" aria-label="Tồn kho theo mặt hàng">
        {rows.map((r) => {
          const lv = stockLevel(r.pct);
          return (
            <li key={r.code} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2 text-sm md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_9rem_auto]">
              <span className="min-w-0">
                <b className="block truncate text-ink">{r.name}</b>
                <span className="text-xs text-muted">{CATEGORY[r.category] || r.category} · {r.n} kho</span>
              </span>
              <span className="text-right font-mono text-xs md:order-3">
                <b className={clsx(lv === 3 && 'text-danger')}>{int(r.qty)}</b> / {int(r.quota)} {r.unit}
              </span>
              <span className="col-span-2 flex items-center gap-2 md:order-2 md:col-span-1">
                <Progress className="flex-1" value={r.pct ?? 0} level={lv} />
                <span className="w-10 shrink-0 text-right font-mono text-xs text-muted">{r.pct == null ? '–' : `${r.pct}%`}</span>
              </span>
              <span className="col-span-2 flex flex-wrap justify-end gap-1 md:order-4 md:col-span-1">
                {r.low > 0 && <span className={clsx('chip px-1.5 py-0 text-[10px]', RISK[3].chip)}>{r.low} kho dưới {STOCK_LOW}%</span>}
                {r.expiring > 0 && (
                  <span className={clsx('chip px-1.5 py-0 text-[10px]', RISK[2].chip)} title={r.expiry ? `Hạn gần nhất ${r.expiry.split('-').reverse().join('/')}` : undefined}>
                    {r.expiring} kho sắp hết hạn
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
