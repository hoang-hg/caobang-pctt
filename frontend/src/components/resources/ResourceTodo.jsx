import { useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, Eye, PackageMinus, PackagePlus, Wrench } from 'lucide-react';
import { RES_STATUS, VEHICLE } from '../../utils/labels';
import { int } from '../../utils/format';
import { STOCK_LOW, risk } from '../../utils/risk';

const HEAD = 5; // hiện 5 việc nặng nhất, còn lại bấm "Xem thêm"
const BTN = 'btn-secondary tap inline-flex min-h-[36px] shrink-0 items-center gap-1.5 px-3 text-xs font-semibold';
const day = (d) => (d ? new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : '');
const lower = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/**
 * "Cần bổ sung / cần sửa" (thiết kế C, chỉnh giao diện cho người mới): trưởng ban nhìn một lần biết kho nào thiếu, hàng nào sắp
 * hết hạn, xe / xuồng nào hỏng — mỗi việc MỘT câu ("Kho cụm Bảo Lạc: gạo còn 15% định mức — cần bổ sung") và MỘT nút: Nhập
 * kho / Xuất kho dùng trước / Báo tình trạng nếu tài khoản ghi được ở xã đó (backend kiểm tra lại), không thì "Xem" (mở danh
 * sách đã lọc). Việc nặng lên đầu; không có việc → không hiện khối (dải khẩn trên cùng đã nói "chưa ghi nhận").
 * `scope`: { receive, issue, vehicle } — mã xã ghi được (null = toàn tỉnh).
 */
export default function ResourceTodo({ warehouses, vehicles, factsOf, scope, online, onReceive, onIssue, onVehicle, onShow }) {
  const [open, setOpen] = useState(false);
  const can = (codes, code) => codes === null || (codes || []).includes(code);
  const items = [];

  for (const w of warehouses || []) {
    const x = factsOf(w);
    if (x.low.length) {
      const what = x.low.slice(0, 3).map((i) => `${lower(i.name)} còn ${i.pct}%`).join(', ');
      items.push({
        key: `thieu-${w.id}`,
        level: 3,
        text: `${w.name}: ${what}${x.low.length > 3 ? ` và ${x.low.length - 3} mặt hàng khác` : ''} định mức — cần bổ sung`,
        action: can(scope.receive, w.admin_code)
          ? { label: 'Nhập kho', icon: PackagePlus, onClick: () => onReceive(w) }
          : { label: 'Xem', icon: Eye, onClick: () => onShow('vat_tu', { tt: 'can_kiet' }) },
      });
    }
    if (x.expiring.length) {
      const what = x.expiring.slice(0, 2).map((i) => `${lower(i.name)}${i.expiry_date ? ` (hạn ${day(i.expiry_date)})` : ''}`).join(', ');
      items.push({
        key: `het-han-${w.id}`,
        level: 2,
        text: `${w.name}: ${what}${x.expiring.length > 2 ? ` và ${x.expiring.length - 2} mặt hàng khác` : ''} sắp hết hạn — xuất dùng trước`,
        action: can(scope.issue, w.admin_code)
          ? { label: 'Xuất kho', icon: PackageMinus, onClick: () => onIssue(w) }
          : { label: 'Xem', icon: Eye, onClick: () => onShow('vat_tu', { tt: 'het_han' }) },
      });
    }
  }
  for (const v of vehicles || []) {
    const name = `${VEHICLE[v.vehicle_type] || 'Phương tiện'} ${v.code}${v.force_name ? ` (${v.force_name})` : ''}`;
    const fix = can(scope.vehicle, v.admin_code)
      ? { label: 'Báo tình trạng', icon: Wrench, onClick: () => onVehicle(v) }
      : null;
    if (v.status === 'bao_duong') {
      items.push({
        key: `hong-${v.id}`,
        level: 1,
        text: `${name}: ${lower(RES_STATUS.bao_duong.label)}${v.status_note ? ` — ${v.status_note}` : ''}`,
        action: fix || { label: 'Xem', icon: Eye, onClick: () => onShow('phuong_tien', { tt: 'bao_duong' }) },
      });
    } else if (v.fuel_level != null && v.fuel_level < STOCK_LOW) {
      items.push({
        key: `nhien-lieu-${v.id}`,
        level: 3,
        text: `${name}: còn ${int(v.fuel_level)}% nhiên liệu — cần tiếp, chưa được gợi ý điều động`,
        action: fix || { label: 'Xem', icon: Eye, onClick: () => onShow('phuong_tien', { nl: 'duoi20' }) },
      });
    }
  }
  if (!items.length) return null;
  items.sort((a, b) => b.level - a.level);
  const shown = open ? items : items.slice(0, HEAD);

  return (
    <section className="card p-3 sm:p-4" aria-labelledby="can-bo-sung">
      <h2 id="can-bo-sung" className="card-title">
        Cần bổ sung / cần sửa <span className="num font-normal text-muted">· {items.length} việc</span>
      </h2>
      <ul className="mt-2 flex flex-col divide-y divide-line/60" aria-label="Việc cần bổ sung, sửa chữa">
        {shown.map((it) => (
          <li key={it.key} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:gap-3">
            <span className="flex min-w-0 flex-1 items-start gap-2 text-sm text-ink">
              <span className={clsx('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', risk(it.level).fill)} title={risk(it.level).meaning} aria-hidden="true" />
              <span className="min-w-0 [overflow-wrap:anywhere]">{it.text}</span>
            </span>
            <button
              type="button"
              className={clsx(BTN, 'self-end sm:self-auto')}
              onClick={it.action.onClick}
              disabled={!online && it.action.label !== 'Xem'}
              title={!online && it.action.label !== 'Xem' ? 'Mất mạng — chưa ghi được' : undefined}
            >
              <it.action.icon size={14} aria-hidden="true" /> {it.action.label}
            </button>
          </li>
        ))}
      </ul>
      {items.length > HEAD && (
        <button type="button" className="btn-ghost tap mt-1 px-2 text-xs font-semibold text-accent" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <ChevronDown size={14} className={clsx('transition-transform', open && 'rotate-180')} aria-hidden="true" />
          {open ? 'Thu gọn' : `Xem thêm ${items.length - HEAD} việc`}
        </button>
      )}
    </section>
  );
}
