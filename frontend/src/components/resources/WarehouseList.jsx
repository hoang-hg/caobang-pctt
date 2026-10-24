import { useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, MapPin, PackageMinus, PackagePlus, Phone } from 'lucide-react';
import { Progress } from '../common/ui';
import { usePermission } from '../../rbac/usePermission';
import { dateTime, int } from '../../utils/format';
import { NO_DATA, RISK, STOCK_LOW, STOCK_WATCH, risk, stockLevel } from '../../utils/risk';
import { WAREHOUSE_LEVEL } from './resourceFacts';

const BTN = 'tap inline-flex min-h-[36px] whitespace-nowrap flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold';
const vnDate = (d) => (d ? d.split('-').reverse().join('/') : '');
const HEAD = 4; // thu gọn: hiện 4 dòng đầu (mặt hàng thiếu / sắp hết hạn luôn hiện đủ)

/** Mức của từng mặt hàng: dưới 20 % Đỏ; sắp hết hạn Cam; dưới 50 % Vàng; đủ Xanh; chưa có định mức Xám. */
const itemLevel = (i, expiring) => {
  const lv = stockLevel(i.pct);
  return expiring ? Math.max(2, lv ?? 0) : lv;
};

function WarehouseCard({ w, x, category, pdf, online, onReceive, onIssue, onMap, onLedger }) {
  const [open, setOpen] = useState(false);
  const canIssue = usePermission('inventory', 'issue', w.admin_code);
  const canReceive = usePermission('inventory', 'receive', w.admin_code);
  const iconOnly = canIssue || canReceive;
  const items = (category ? w.items.filter((i) => i.category === category) : w.items)
    .map((i, n) => ({ i, n, exp: x.expiring.includes(i), lv: itemLevel(i, x.expiring.includes(i)) }))
    .sort((a, b) => (b.lv ?? -1) - (a.lv ?? -1) || a.n - b.n); // thiếu / sắp hết hạn lên đầu
  const problems = items.filter((r) => r.lv >= 1).length;
  const head = Math.max(HEAD, problems);
  const shown = open || pdf ? items : items.slice(0, head);
  const updated = w.items.reduce((m, i) => (i.last_updated > m ? i.last_updated : m), '');
  const offline = !online ? 'Mất mạng — chưa ghi được' : undefined;
  return (
    <li className={clsx('card flex flex-col gap-2 border-l-4 p-3', risk(x.level).edge)}>
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <div className="min-w-0">
          <b className="block leading-snug text-ink">{w.name}</b>
          <span className="block text-xs text-muted">{WAREHOUSE_LEVEL[w.level] || w.level} · {w.admin_name}{w.manager ? ` · ${w.manager}` : ''}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {x.low.length > 0 && <span className={clsx('chip', RISK[3].chip)}>Cạn kiệt {x.low.length}</span>}
          {x.expiring.length > 0 && <span className={clsx('chip', RISK[2].chip)}>Sắp hết hạn {x.expiring.length}</span>}
          {!x.low.length && x.watch.length > 0 && <span className={clsx('chip', RISK[1].chip)}>Dưới {STOCK_WATCH}%: {x.watch.length}</span>}
          {x.level === 0 && <span className={clsx('chip', RISK[0].chip)}>Đủ dự trữ</span>}
          {x.level == null && <span className={clsx('chip', NO_DATA.chip)}>Chưa có số liệu</span>}
        </div>
      </div>

      {!w.items.length ? (
        <p className="text-xs text-muted">Chưa có số liệu tồn kho — nhập bằng loại dữ liệu “Tồn kho vật tư” hoặc nút Nhập hàng.</p>
      ) : !items.length ? (
        <p className="text-xs text-muted">Kho không có mặt hàng thuộc nhóm đang lọc.</p>
      ) : (
        <ul className="divide-y divide-line/50">
          {shown.map(({ i, exp, lv }) => (
            <li key={i.item_code} className="py-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-ink-2" title={i.name}>{i.name}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {stockLevel(i.pct) === 3 && <span className={clsx('chip px-1.5 py-0 text-[10px]', RISK[3].chip)}>Cạn kiệt</span>}
                  {exp && <span className={clsx('chip px-1.5 py-0 text-[10px]', RISK[2].chip)} title={`Hạn dùng ${vnDate(i.expiry_date)}`}>Hạn {vnDate(i.expiry_date).slice(0, 5)}</span>}
                  <span className={clsx('font-mono', lv === 3 && 'font-bold text-danger')}>{int(i.quantity)} {i.unit}</span>
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <Progress className="flex-1" value={i.pct ?? 0} level={stockLevel(i.pct)} />
                <span className="w-9 shrink-0 text-right font-mono text-[11px] text-muted" title={i.pct == null ? 'Chưa có định mức an toàn' : `${i.pct}% định mức (${int(i.safety_quota)} ${i.unit})`}>
                  {i.pct == null ? '–' : `${i.pct}%`}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!pdf && items.length > head && (
        <button type="button" className="tap flex min-h-[32px] items-center justify-center gap-1 text-xs font-semibold text-accent no-print" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? 'Thu gọn' : `Xem đủ ${items.length} mặt hàng`}
          <ChevronDown size={13} className={clsx('transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </button>
      )}
      <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted">
        {updated && <span>Cập nhật tồn kho: {dateTime(updated)}</span>}
        {onLedger && !pdf && (
          <button type="button" className="tap rounded px-1 font-semibold text-accent hover:underline no-print" onClick={() => onLedger(w)} aria-label={`Sổ xuất – nhập của ${w.name}`}>
            Sổ xuất – nhập
          </button>
        )}
      </div>

      {/* Điện thoại: có nút Xuất / Nhập thì Gọi, Bản đồ chỉ còn biểu tượng (44 × 44) — 4 nút chữ không vừa 360 px */}
      <div className="mt-auto flex gap-2 pt-1 no-print">
        {canIssue && (
          <button type="button" className={clsx('btn-primary', BTN)} onClick={() => onIssue(w)} disabled={!online || !w.items.length} title={offline || 'Ra lệnh xuất hàng khỏi kho'}>
            <PackageMinus size={14} aria-hidden="true" /> Xuất kho
          </button>
        )}
        {canReceive && (
          <button type="button" className={clsx('btn-ghost', BTN)} onClick={() => onReceive(w)} disabled={!online} title={offline || 'Nhập thêm hàng cứu trợ, hàng mua bổ sung'}>
            <PackagePlus size={14} aria-hidden="true" /> Nhập hàng
          </button>
        )}
        {w.phone && (
          <a
            href={`tel:${w.phone.replace(/\s/g, '')}`}
            className={clsx('btn-ghost', BTN, iconOnly && 'tap-sq max-sm:w-11 max-sm:flex-none max-sm:px-0')}
            title={`Gọi thủ kho${w.manager ? ` ${w.manager}` : ''} — ${w.phone}`}
            aria-label={`Gọi thủ kho ${w.name}`}
          >
            <Phone size={14} aria-hidden="true" /> <span className={clsx(iconOnly && 'max-sm:hidden')}>Gọi</span>
          </a>
        )}
        {w.lat != null && (
          <button
            type="button"
            className={clsx('btn-ghost', BTN, iconOnly && 'tap-sq max-sm:w-11 max-sm:flex-none max-sm:px-0')}
            onClick={() => onMap(w.lat, w.lon, w.name)}
            title="Xem kho trên Bản đồ giám sát"
            aria-label={`Xem ${w.name} trên bản đồ`}
          >
            <MapPin size={14} aria-hidden="true" /> <span className={clsx(iconOnly && 'max-sm:hidden')}>Bản đồ</span>
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * Kho vật tư (thiết kế C.2): mỗi kho một thẻ, vạch trái theo mức nặng nhất (thang chung — Đỏ: có hàng dưới 20 % định mức,
 * Cam: sắp hết hạn, Vàng: dưới 50 %). Trong thẻ, mặt hàng thiếu / sắp hết hạn lên đầu, phần còn lại thu gọn. Nút Xuất kho /
 * Nhập hàng chỉ hiện với tài khoản có quyền ở đúng xã của kho (backend kiểm tra lại); mất mạng → nút tắt, ghi lý do.
 */
export default function WarehouseList({ rows, factsOf, category, pdf, online, onReceive, onIssue, onMap, onLedger }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3" aria-label="Kho vật tư">
      {rows.map((w) => (
        <WarehouseCard key={w.id} w={w} x={factsOf(w)} category={category} pdf={pdf} online={online} onReceive={onReceive} onIssue={onIssue} onMap={onMap} onLedger={onLedger} />
      ))}
    </ul>
  );
}

export const STOCK_NOTE = `Thanh màu: dưới ${STOCK_LOW}% định mức Đỏ (cạn kiệt) · dưới ${STOCK_WATCH}% Vàng · đủ Xanh · Cam: hàng hết hạn dùng trong 30 ngày`;
