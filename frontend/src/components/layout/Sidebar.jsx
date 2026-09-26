import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Map, Boxes, Siren, Megaphone } from 'lucide-react';
import clsx from 'clsx';
import { useAreaQuery } from '../../api/hooks';

const NAV = [
  { to: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { to: '/ban-do', label: 'Bản đồ giám sát', icon: Map },
  { to: '/cuu-ho', label: 'Điều hành cứu hộ', icon: Siren, badge: true },
  { to: '/nguon-luc', label: 'Vật tư & Lực lượng', icon: Boxes },
  { to: '/canh-bao', label: 'Cảnh báo & Hotline', icon: Megaphone },
];

export default function Sidebar() {
  const { data } = useAreaQuery('kpis', '/dashboard/kpis', {}, { refetchInterval: 30_000 });
  const waiting = data?.sos?.waiting || 0;
  return (
    <nav className="no-print flex w-16 shrink-0 flex-col gap-1 border-r border-line bg-panel py-3 lg:w-52">
      {NAV.map(({ to, label, icon: Icon, badge }) => (
        <NavLink
          key={to}
          to={to}
          title={label}
          className={({ isActive }) =>
            clsx(
              'relative mx-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              isActive ? 'bg-accent/15 text-accent' : 'text-ink-2 hover:bg-panel2',
            )
          }
        >
          <Icon size={19} className="shrink-0" />
          <span className="hidden lg:inline">{label}</span>
          {badge && waiting > 0 && (
            <span className="absolute right-2 top-1.5 rounded-full bg-danger px-1.5 text-[11px] font-bold text-white animate-blink lg:static lg:ml-auto">
              {waiting}
            </span>
          )}
        </NavLink>
      ))}
      <div className="mt-auto hidden px-4 text-[11px] leading-snug text-muted lg:block">
        Dữ liệu mô phỏng phục vụ thử nghiệm. Ranh giới xã là xấp xỉ.
      </div>
    </nav>
  );
}
