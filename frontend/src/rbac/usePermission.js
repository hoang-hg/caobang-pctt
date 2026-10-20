import { useMemo } from 'react';
import { useStore } from '../app/store';
import { useUnits } from '../api/hooks';
import { allowedCodes, hasPermission } from './permissions';

// Nhãn xã/phường (như components/dashboard/CommuneView unitLabel — chép lại để rbac/ không phụ thuộc component)
const unitLabel = (u) => `${u.unit_type === 'phuong' ? 'Phường' : 'Xã'} ${u.name}`;

/** Chuyển mã xã (CB-...) → domain RBAC; giữ nguyên nếu đã là domain. */
function useDomainOf(scope) {
  const { data: units } = useUnits();
  if (scope === undefined || scope === null) return undefined;
  if (scope === '*' || scope.includes('/')) return scope;
  return units?.find((u) => u.code === scope)?.rbac_domain ?? '*';
}

/**
 * const canDispatch = usePermission('dispatch', 'create', ticket.admin_code);
 * scope: mã xã, domain, hoặc bỏ trống (có quyền ở bất kỳ đâu).
 */
export function usePermission(obj, act, scope) {
  const perms = useStore((s) => s.auth?.user?.permissions);
  const domain = useDomainOf(scope);
  return hasPermission(perms, obj, act, domain);
}

/** Có quyền trên TẤT CẢ các mã xã (VD vùng nhận cảnh báo). */
export function useCanAll(obj, act, codes) {
  const perms = useStore((s) => s.auth?.user?.permissions);
  const { data: units } = useUnits();
  return useMemo(() => {
    if (!codes?.length) return hasPermission(perms, obj, act);
    return codes.every((c) => hasPermission(perms, obj, act, units?.find((u) => u.code === c)?.rbac_domain ?? '*'));
  }, [perms, units, obj, act, codes]);
}

/** Danh sách mã xã được phép; null = toàn tỉnh. */
export function useAllowedCodes(obj, act) {
  const perms = useStore((s) => s.auth?.user?.permissions);
  const { data: units } = useUnits();
  return useMemo(() => allowedCodes(perms, obj, act, units), [perms, units, obj, act]);
}

/** Tài khoản chỉ có vai trò cấp xã (GET /auth/me: assignments[].role = admin_xa): Tổng quan mở thẳng trang Cấp xã của xã
 * mình, có kênh xin chi viện lên tỉnh. */
export function useIsCommuneUser() {
  return useStore((s) => {
    const a = s.auth?.user?.assignments || [];
    return a.length > 0 && a.every((x) => x.role === 'admin_xa');
  });
}

/** Nhóm người dùng cho phần hướng dẫn (utils/guides.js): có vai trò Quản trị hệ thống → 'quan_tri'; chỉ vai trò cấp xã →
 * 'xa'; còn lại (Quản trị tỉnh — lãnh đạo BCH, trực ban) → 'tinh'. */
export function useGuideRole() {
  return useStore((s) => {
    const roles = (s.auth?.user?.assignments || []).map((x) => x.role);
    if (roles.includes('super_admin')) return 'quan_tri';
    if (roles.length > 0 && roles.every((r) => r === 'admin_xa')) return 'xa';
    return 'tinh';
  });
}

/** Nhãn địa bàn đang xem: bộ lọc đang chọn → xã duy nhất được giao ("Xã Cô Ba") → "N xã/phường được giao"; tài khoản
 * toàn tỉnh chưa lọc → "Toàn tỉnh Cao Bằng" (nhãn mặc định của bộ lọc). */
export function useScopeLabel(obj = 'monitoring', act = 'view') {
  const filter = useStore((s) => s.filter);
  const scope = useAllowedCodes(obj, act);
  const { data: units } = useUnits();
  if (filter.codes.length || scope === null) return filter.label;
  const only = scope.length === 1 ? units?.find((u) => u.code === scope[0]) : null;
  return only ? unitLabel(only) : `${scope.length} xã/phường được giao`;
}

/** <Can I="sos" a="update" scope={ticket.admin_code}>…</Can> */
export function Can({ I, a, scope, fallback = null, children }) {
  return usePermission(I, a, scope) ? children : fallback;
}
