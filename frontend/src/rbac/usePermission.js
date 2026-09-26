import { useMemo } from 'react';
import { useStore } from '../app/store';
import { useUnits } from '../api/hooks';
import { allowedCodes, hasPermission } from './permissions';

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

/** <Can I="sos" a="update" scope={ticket.admin_code}>…</Can> */
export function Can({ I, a, scope, fallback = null, children }) {
  return usePermission(I, a, scope) ? children : fallback;
}
