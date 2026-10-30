import { useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, Globe, Phone } from 'lucide-react';
import clsx from 'clsx';
import { useStore } from '../../app/store';
import { hasPermission } from '../../rbac/permissions';
import { useEscapeToClose } from '../common/ui';
import { useClickOutside } from '../../utils/useClickOutside';
import { NAV_GROUPS } from './nav';
import { useNavBadges } from './Sidebar';

const MORE_W = 84; // bề rộng nút "Thêm" (đo xấp xỉ) — luôn chừa chỗ khi có mục phải dồn vào
const GAP = 4;

const allowed = (perms) => (n) => !n.perm || hasPermission(perms, ...n.perm) || (n.alt && hasPermission(perms, ...n.alt));

function Badge({ n, warm }) {
  if (!n) return null;
  return (
    <span className={clsx('chip px-1.5 py-0 text-[10px] font-bold text-white', warm ? 'bg-amber-700' : 'bg-danger')}>{n}</span>
  );
}

/**
 * Menu ngang của thanh trên cùng (máy tính ≥ 1024 px — DESIGN.md, phương án B: không còn menu trái). Nhóm "Điều hành" hiện
 * thẳng; mục KHÔNG ĐỦ CHỖ tự dồn vào "Thêm" (đo bề rộng thật — thanh không bao giờ tràn ngang ở 1024 / 1280 / 1440 px), cùng
 * các nhóm Dữ liệu & báo cáo, Quản trị, Trợ giúp, cổng người dân, số 112. Số đếm khẩn (SOS chờ, lệnh chờ duyệt…) như menu cũ.
 * Như bản mẫu B: mục trên thanh chỉ có chữ (biểu tượng chỉ trong "Thêm" — danh sách dọc dễ dò hơn).
 */
export default function TopNav() {
  const perms = useStore((s) => s.auth?.user?.permissions);
  const badges = useNavBadges();
  const { pathname } = useLocation();
  const primary = NAV_GROUPS[0].items.filter(allowed(perms));
  const others = NAV_GROUPS.slice(1)
    .map((g) => ({ ...g, items: g.items.filter(allowed(perms)) }))
    .filter((g) => g.items.length);

  const box = useRef(null);
  const measure = useRef(null);
  const [fit, setFit] = useState(primary.length);
  const [open, setOpen] = useState(false);
  const menu = useRef(null);
  useClickOutside(menu, () => setOpen(false));
  useEscapeToClose(open, () => setOpen(false));

  // Đếm số mục vừa chỗ: đo bề rộng từng mục ở hàng đo ẩn, so với bề rộng khung
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const calc = () => {
      const widths = [...(measure.current?.children || [])].map((c) => c.getBoundingClientRect().width);
      const avail = el.clientWidth;
      const total = widths.reduce((s, w) => s + w + GAP, 0);
      if (total <= avail && !others.length) { setFit(widths.length); return; }
      let used = MORE_W;
      let n = 0;
      for (const w of widths) {
        if (used + w + GAP > avail) break;
        used += w + GAP;
        n += 1;
      }
      setFit(n);
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    if (measure.current) ro.observe(measure.current); // số đếm đổi → bề rộng mục đổi
    return () => ro.disconnect();
  }, [primary.length, others.length]);

  const count = (it) => ((it.badge || it.badgeKey) ? badges[it.badgeKey || 'sos'] || 0 : 0);
  const warm = (it) => it.badgeKey === 'reports' || it.badgeKey === 'submissions';
  const item = (it, inMenu = false) => (
    <NavLink
      key={it.to}
      to={it.to}
      onClick={() => setOpen(false)}
      className={({ isActive }) => clsx(
        'tap flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3.5 py-2 text-sm font-medium transition-colors',
        isActive ? 'bg-accent/10 font-semibold text-accent' : 'text-ink-2 hover:bg-panel2 hover:text-ink',
        inMenu && 'w-full',
      )}
    >
      {inMenu && <it.icon size={16} className="shrink-0" aria-hidden="true" />}
      <span className={inMenu ? 'flex-1' : undefined}>{inMenu ? it.label : it.short || it.label}</span>
      <Badge n={count(it)} warm={warm(it)} />
    </NavLink>
  );

  const shown = primary.slice(0, fit);
  const hidden = primary.slice(fit);
  const moreActive = [...hidden, ...others.flatMap((g) => g.items)].some((n) => pathname === n.to || pathname.startsWith(`${n.to}/`));
  const moreCount = [...hidden, ...others.flatMap((g) => g.items)].reduce((s, n) => s + count(n), 0);

  return (
    <nav aria-label="Menu chính" ref={box} className="relative hidden min-w-0 flex-1 items-center gap-1 lg:flex">
      {/* Hàng đo (ẩn): bề rộng thật của từng mục để biết bao nhiêu mục vừa chỗ */}
      <div ref={measure} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 flex gap-1">
        {primary.map((it) => (
          <span key={it.to} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3.5 py-2 text-sm font-semibold">
            {it.short || it.label} {count(it) ? <span className="chip px-1.5 py-0 text-[10px] font-bold">{count(it)}</span> : null}
          </span>
        ))}
      </div>
      {shown.map((it) => item(it))}
      {(hidden.length > 0 || others.length > 0) && (
        <div className="relative shrink-0" ref={menu}>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-haspopup="true"
            className={clsx(
              'tap flex items-center gap-1 whitespace-nowrap rounded-[10px] px-3.5 py-2 text-sm font-medium transition-colors',
              moreActive ? 'bg-accent/10 text-accent' : 'text-ink-2 hover:bg-panel2 hover:text-ink',
            )}
          >
            Thêm <Badge n={moreCount} /> <ChevronDown size={14} aria-hidden="true" />
          </button>
          {open && (
            <div className="card absolute left-0 top-11 z-[1200] flex w-72 flex-col gap-2 p-2 shadow-2xl">
              {hidden.length > 0 && <div className="flex flex-col gap-0.5">{hidden.map((it) => item(it, true))}</div>}
              {others.map((g) => (
                <div key={g.title} className="flex flex-col gap-0.5 border-t border-line/70 pt-2 first:border-0 first:pt-0">
                  <div className="px-3 pb-0.5 text-[11px] font-semibold text-muted">{g.title}</div>
                  {g.items.map((it) => item(it, true))}
                </div>
              ))}
              <div className="flex flex-col gap-1 border-t border-line/70 px-1 pt-2">
                <Link to="/cong-khai" target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className="tap flex items-center gap-2 rounded-[10px] px-2 py-1.5 text-sm text-accent hover:bg-panel2">
                  <Globe size={15} aria-hidden="true" /> Cổng người dân (thẻ mới)
                </Link>
                <a href="tel:112" className="tap flex items-center gap-2 rounded-[10px] px-2 py-1.5 text-sm font-semibold text-danger hover:bg-panel2">
                  <Phone size={15} aria-hidden="true" /> Khẩn cấp cứu nạn: 112 · trực ban 24/7
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
