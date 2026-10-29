import { NavLink } from 'react-router-dom';
import { Phone, X } from 'lucide-react';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAreaQuery } from '../../api/hooks';
import { useStore } from '../../app/store';
import { hasPermission } from '../../rbac/permissions';
import { NAV_GROUPS } from './nav';

/** Số đếm trên menu (dùng chung menu ngang TopNav, ngăn menu điện thoại và nút ☰ ở Header — cùng khoá truy vấn, không gọi
 * API 2 lần). */
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

/**
 * Ngăn menu của điện thoại / máy tính bảng (< 1024 px, mở bằng nút ☰ ở Header). Máy tính dùng menu ngang trên thanh trên
 * cùng (TopNav) — không còn menu trái (DESIGN.md, phương án B).
 */
export default function Sidebar() {
  const perms = useStore((s) => s.auth?.user?.permissions);
  const { mobileMenuOpen, setMobileMenuOpen } = useStore();
  const badges = useNavBadges();
  if (!mobileMenuOpen) return null;

  return (
    <div className="fixed inset-0 z-[1200] flex lg:hidden">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={() => setMobileMenuOpen(false)} aria-hidden="true" />
      <div className="relative z-10 flex h-full w-64 max-w-[80vw] flex-col justify-between border-r border-black/20 bg-nav py-4 shadow-2xl">
        <div className="min-h-0 overflow-y-auto">
          <div className="mb-3 flex items-center justify-between border-b border-white/10 px-4 pb-3">
            <span className="text-sm font-bold text-white">Danh mục điều hành</span>
            <button className="touch-hit rounded-lg p-1 text-nav-muted hover:bg-white/10 hover:text-white" onClick={() => setMobileMenuOpen(false)} aria-label="Đóng menu">
              <X size={18} />
            </button>
          </div>
          <div className="flex flex-col gap-2.5 px-2">
            {NAV_GROUPS.map((group) => {
              const items = group.items.filter((n) => !n.perm || hasPermission(perms, ...n.perm) || (n.alt && hasPermission(perms, ...n.alt)));
              if (!items.length) return null;
              return (
                <div key={group.title} className="flex flex-col gap-0.5">
                  <div className="px-3 pb-1 pt-1 text-xs font-semibold text-nav-muted">{group.title}</div>
                  {items.map(({ to, label, icon: Icon, badge, badgeKey }) => {
                    const count = badges[badgeKey || 'sos'] || 0;
                    return (
                      <NavLink
                        key={to}
                        to={to}
                        onClick={() => setMobileMenuOpen(false)}
                        className={({ isActive }) => clsx(
                          'group relative flex min-h-[44px] items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition duration-150',
                          isActive ? 'bg-white/[0.09] text-white ring-1 ring-inset ring-white/10' : 'text-nav-ink hover:bg-white/[0.06] hover:text-white',
                        )}
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && <span className="absolute bottom-1.5 left-0 top-1.5 w-1 rounded-r bg-nav-active" />}
                            <Icon size={18} className={clsx('shrink-0', isActive ? 'text-nav-active' : 'text-nav-muted group-hover:text-nav-ink')} />
                            <span className="flex-1 truncate">{label}</span>
                            {(badge || badgeKey) && count > 0 && (
                              <span className={clsx('chip ml-auto text-[10px] font-bold text-white', badgeKey === 'reports' || badgeKey === 'submissions' ? 'bg-amber-700' : 'bg-danger')}>
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
        </div>
        <div className="border-t border-white/10 px-3 pt-3">
          <a href="tel:112" className="block rounded-xl bg-white/[0.06] p-3 text-xs ring-1 ring-inset ring-white/[0.06]">
            <span className="flex items-center gap-1.5 font-bold text-red-300"><Phone size={14} /> Đường dây nóng: 112</span>
            <span className="mt-1 block text-[11px] text-nav-muted">Hỗ trợ tìm kiếm cứu nạn khẩn cấp trên địa bàn tỉnh</span>
          </a>
        </div>
      </div>
    </div>
  );
}
