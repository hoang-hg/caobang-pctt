import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Map, Boxes, Siren, Megaphone, KeyRound, DatabaseZap, Camera, FileUp,
  ChevronLeft, ChevronRight, Phone, X
} from 'lucide-react';
import clsx from 'clsx';
import AdminFilter from '../common/AdminFilter';
import { useAreaQuery } from '../../api/hooks';
import { useStore } from '../../app/store';
import { hasPermission } from '../../rbac/permissions';

const NAV = [
  { to: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard, perm: ['monitoring', 'view'] },
  { to: '/ban-do', label: 'Bản đồ giám sát', icon: Map, perm: ['monitoring', 'view'] },
  { to: '/cuu-ho', label: 'Điều hành cứu hộ', icon: Siren, badge: true, perm: ['sos', 'view'] },
  { to: '/phan-anh', label: 'Phản ánh người dân', icon: Camera, perm: ['report', 'view'], badgeKey: 'reports' },
  { to: '/nguon-luc', label: 'Vật tư & Lực lượng', icon: Boxes, perm: ['resource', 'view'] },
  { to: '/canh-bao', label: 'Cảnh báo & Hotline', icon: Megaphone, perm: ['alert', 'view'] },
  { to: '/nguon-du-lieu', label: 'Nguồn dữ liệu & IoT', icon: DatabaseZap, perm: ['integration', 'view'] },
  { to: '/nhap-du-lieu', label: 'Nhập dữ liệu', icon: FileUp, perm: ['data', 'import'] },
  { to: '/phan-quyen', label: 'Phân quyền', icon: KeyRound, perm: ['user', 'view'] },
];

export default function Sidebar() {
  const perms = useStore((s) => s.auth?.user?.permissions);
  const { sidebarCollapsed, toggleSidebarCollapse, mobileMenuOpen, setMobileMenuOpen } = useStore();
  const { data } = useAreaQuery('kpis', '/dashboard/kpis', {}, { refetchInterval: 30_000 });
  const waiting = data?.sos?.waiting || 0;
  const canReports = hasPermission(perms, 'report', 'view');
  const { data: rep } = useAreaQuery('reports', '/reports', { status: 'cho_duyet', limit: 1 }, { enabled: canReports, refetchInterval: 60_000 });
  const badges = { sos: waiting, reports: rep?.counts?.cho_duyet || 0 };

  const navItems = NAV.filter((n) => hasPermission(perms, ...n.perm));

  const renderNavLinks = (isMobile = false) => (
    <div className="flex flex-col gap-1 px-2">
      {navItems.map(({ to, label, icon: Icon, badge, badgeKey }) => {
        const count = badges[badgeKey || 'sos'] || 0;
        const hasBadge = (badge || badgeKey) && count > 0;
        const isCollapsed = !isMobile && sidebarCollapsed;

        return (
          <NavLink
            key={to}
            to={to}
            title={isCollapsed ? label : undefined}
            onClick={() => {
              if (isMobile) setMobileMenuOpen(false);
            }}
            className={({ isActive }) =>
              clsx(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-accent/15 text-accent shadow-sm font-semibold'
                  : 'text-ink-2 hover:bg-panel2 hover:text-ink',
                isCollapsed && 'justify-center px-0'
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-accent" />
                )}
                <Icon size={19} className={clsx('shrink-0 transition-transform group-hover:scale-110', isActive && 'text-accent')} />
                {!isCollapsed && <span className="truncate flex-1">{label}</span>}
                {hasBadge && (
                  <span
                    className={clsx(
                      'chip font-bold text-[10px] text-white',
                      badgeKey === 'reports' ? 'bg-amber-600' : 'bg-danger animate-pulse',
                      isCollapsed ? 'absolute right-1.5 top-1 px-1 py-0 min-w-4 text-center' : 'ml-auto'
                    )}
                  >
                    {count}
                  </span>
                )}
              </>
            )}
          </NavLink>
        );
      })}
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <nav
        className={clsx(
          'no-print hidden lg:flex shrink-0 flex-col justify-between border-r border-line bg-panel py-3 transition-all duration-200 select-none',
          sidebarCollapsed ? 'w-16' : 'w-56'
        )}
      >
        <div className="flex flex-col gap-2">
          {renderNavLinks(false)}
        </div>

        <div className="flex flex-col gap-2 px-2 pt-2 border-t border-line/60">
          {!sidebarCollapsed && (
            <p className="px-1 text-[11px] leading-snug text-muted">Hệ thống tác chiến PCTT & TKCN tỉnh Cao Bằng.</p>
          )}
          {!sidebarCollapsed && (
            <div className="rounded-xl bg-panel2/80 p-2.5 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-danger">
                <Phone size={13} /> Khẩn cấp cứu nạn: 112
              </div>
              <div className="text-[11px] text-muted mt-0.5">Trực ban tác chiến 24/7</div>
            </div>
          )}

          <button
            onClick={toggleSidebarCollapse}
            className="btn-ghost w-full justify-center py-2 text-xs text-muted hover:text-ink"
            title={sidebarCollapsed ? 'Mở rộng thanh menu' : 'Thu gọn thanh menu'}
            aria-label="Thu gọn hoặc mở rộng thanh menu"
          >
            {sidebarCollapsed ? (
              <ChevronRight size={16} />
            ) : (
              <div className="flex items-center gap-1.5">
                <ChevronLeft size={16} />
                <span>Thu gọn menu</span>
              </div>
            )}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer Backdrop & Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[1200] lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="relative flex flex-col justify-between w-64 max-w-[80vw] h-full bg-panel border-r border-line py-4 z-10 shadow-2xl animate-in slide-in-from-left duration-200">
            <div>
              <div className="flex items-center justify-between px-4 pb-3 border-b border-line mb-3">
                <span className="font-bold text-sm text-ink">Danh mục điều hành</span>
                <button
                  className="p-1 rounded-lg hover:bg-panel2 text-muted"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Đóng menu"
                >
                  <X size={18} />
                </button>
              </div>
              {/* Header ẩn bộ lọc trên màn hình hẹp → đưa vào menu */}
              <div className="mb-3 px-3 sm:hidden">
                <AdminFilter />
              </div>
              {renderNavLinks(true)}
            </div>

            <div className="px-3 pt-3 border-t border-line">
              <div className="rounded-xl bg-danger/10 border border-danger/20 p-3 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-danger">
                  <Phone size={14} /> Đường dây nóng: 112
                </div>
                <div className="text-[11px] text-muted mt-1">Hỗ trợ tìm kiếm cứu nạn khẩn cấp trên địa bàn tỉnh</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
