import { NavLink } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Phone, X } from 'lucide-react';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAreaQuery } from '../../api/hooks';
import { useStore } from '../../app/store';
import { hasPermission } from '../../rbac/permissions';
import { NAV_GROUPS } from './nav';

/** Số đếm trên menu (dùng chung Sidebar và nút menu trên điện thoại ở Header — cùng khoá truy vấn, không gọi API 2 lần). */
export function useNavBadges() {
  const perms = useStore((s) => s.auth?.user?.permissions);
  const hasPin = useStore((s) => !!s.auth?.user?.has_pin);
  const { data } = useAreaQuery('kpis', '/dashboard/kpis', {}, { refetchInterval: 30_000 });
  const waiting = data?.sos?.waiting || 0;
  const canReports = hasPermission(perms, 'report', 'view');
  const { data: rep } = useAreaQuery('reports', '/reports', { status: 'cho_duyet', limit: 1 }, { enabled: canReports, refetchInterval: 60_000 });
  // Hồ sơ dữ liệu xã gửi chờ duyệt — chỉ đếm cho người có quyền duyệt (toàn tỉnh)
  const canReview = hasPermission(perms, 'data', 'import', '*');
  const { data: subs } = useQuery({
    queryKey: ['submissions', 'cho_duyet', 'badge'],
    queryFn: () => api('/data-import/submissions', { params: { status: 'cho_duyet', limit: 1 } }),
    enabled: canReview,
    refetchInterval: 60_000,
  });
  // Lệnh cảnh báo chờ BẠN phê duyệt (có quyền duyệt + đã cấp PIN, không phải người soạn) — trước đây chỉ có thông báo 6 giây
  const canApprove = hasPermission(perms, 'alert', 'approve') && hasPin;
  const { data: pendingAlerts } = useQuery({
    queryKey: ['broadcasts', 'pending'],
    queryFn: () => api('/alerts/broadcasts', { params: { status: 'pending_approval', limit: 20 } }),
    enabled: canApprove,
    refetchInterval: 60_000,
  });
  return {
    sos: waiting,
    reports: rep?.counts?.cho_duyet || 0,
    submissions: canReview ? subs?.counts?.cho_duyet || 0 : 0,
    alerts: canApprove ? (pendingAlerts || []).filter((b) => b.can_approve).length : 0,
  };
}

export default function Sidebar() {
  const perms = useStore((s) => s.auth?.user?.permissions);
  const { sidebarCollapsed, toggleSidebarCollapse, mobileMenuOpen, setMobileMenuOpen } = useStore();
  const badges = useNavBadges();

  const renderNavLinks = (isMobile = false) => {
    const isCollapsed = !isMobile && sidebarCollapsed;
    return (
      <div className="flex flex-col gap-2.5 px-2">
        {NAV_GROUPS.map((group, gIdx) => {
          const visibleItems = group.items.filter(
            (n) => !n.perm || hasPermission(perms, ...n.perm) || (n.alt && hasPermission(perms, ...n.alt))
          );
          if (!visibleItems.length) return null;

          return (
            <div key={group.title} className="flex flex-col gap-0.5">
              {isCollapsed ? (
                gIdx > 0 && <div className="my-1 border-t border-white/10 mx-1.5" />
              ) : (
                <div className="px-3 pb-1 pt-1 text-xs font-semibold text-nav-muted">
                  {group.title}
                </div>
              )}

              {visibleItems.map(({ to, label, icon: Icon, badge, badgeKey }) => {
                const count = badges[badgeKey || 'sos'] || 0;
                const hasBadge = (badge || badgeKey) && count > 0;

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
                        // Nền xanh đêm: mục đang mở nền sáng nhẹ + chữ trắng + vạch xanh; mục khác chữ xám xanh, rê chuột sáng lên
                        'group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition duration-150 [@media(pointer:coarse)]:min-h-[44px]',
                        isActive
                          ? 'bg-white/[0.09] text-white shadow-sm ring-1 ring-inset ring-white/10'
                          : 'text-nav-ink hover:bg-white/[0.06] hover:text-white',
                        isCollapsed && 'justify-center px-0'
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-nav-active" />
                        )}
                        <Icon size={18} className={clsx('shrink-0', isActive ? 'text-nav-active' : 'text-nav-muted group-hover:text-nav-ink')} />
                        {!isCollapsed && <span className="flex-1 truncate">{label}</span>}
                        {hasBadge && (
                          <span
                            className={clsx(
                              'chip font-bold text-[10px] text-white',
                              badgeKey === 'reports' || badgeKey === 'submissions' ? 'bg-amber-600' : 'bg-danger motion-safe:animate-pulse',
                              isCollapsed ? 'absolute right-1 top-0.5 px-1 py-0 min-w-4 text-center' : 'ml-auto'
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
        })}
      </div>
    );
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <nav
        className={clsx(
          // Xanh đêm ở cả hai nền, liền với góc thương hiệu của thanh trên (Header) thành một khung chữ L
          'no-print hidden lg:flex min-h-0 shrink-0 flex-col justify-between gap-2 border-r border-black/20 bg-nav py-3 transition-[width] duration-200 select-none',
          sidebarCollapsed ? 'w-16' : 'w-60'
        )}
      >
        {/* Màn thấp (laptop 768 px): danh sách mục tự cuộn bên trong — menu không bao giờ kéo dài cả trang ra ngoài khung */}
        <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {renderNavLinks(false)}
        </div>

        <div className="flex shrink-0 flex-col gap-2 px-2 pt-2 border-t border-white/10">
          {!sidebarCollapsed && (
            <div className="rounded-xl bg-white/[0.06] p-2.5 text-xs ring-1 ring-inset ring-white/[0.06]">
              <div className="flex items-center gap-1.5 font-semibold text-red-300">
                <Phone size={13} /> Khẩn cấp cứu nạn: 112
              </div>
              <div className="text-[11px] text-nav-muted mt-0.5">Trực ban 24/7</div>
            </div>
          )}

          <button
            onClick={toggleSidebarCollapse}
            className="btn w-full justify-center border border-white/10 py-2 text-xs text-nav-muted hover:bg-white/10 hover:text-white [@media(pointer:coarse)]:min-h-[44px]"
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
          <div className="relative flex flex-col justify-between w-64 max-w-[80vw] h-full bg-nav border-r border-black/20 py-4 z-10 shadow-2xl animate-in slide-in-from-left duration-200">
            <div className="min-h-0 overflow-y-auto">
              <div className="flex items-center justify-between px-4 pb-3 border-b border-white/10 mb-3">
                <span className="font-bold text-sm text-white">Danh mục điều hành</span>
                <button
                  className="touch-hit p-1 rounded-lg text-nav-muted hover:bg-white/10 hover:text-white"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Đóng menu"
                >
                  <X size={18} />
                </button>
              </div>
              {renderNavLinks(true)}
            </div>

            <div className="px-3 pt-3 border-t border-white/10">
              <div className="rounded-xl bg-white/[0.06] p-3 text-xs ring-1 ring-inset ring-white/[0.06]">
                <div className="flex items-center gap-1.5 font-bold text-red-300">
                  <Phone size={14} /> Đường dây nóng: 112
                </div>
                <div className="text-[11px] text-nav-muted mt-1">Hỗ trợ tìm kiếm cứu nạn khẩn cấp trên địa bàn tỉnh</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
