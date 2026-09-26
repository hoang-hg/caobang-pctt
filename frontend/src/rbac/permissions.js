/**
 * Kiểm tra quyền phía giao diện — phản chiếu logic Casbin ở backend (app/rbac).
 *
 * Mỗi quyền: { obj, act, dom }. dom là phạm vi:
 *   "*"              toàn tỉnh
 *   "BAOLAC/*"       cả cụm (địa bàn huyện cũ)
 *   "BAOLAC/CB-COBA" một xã
 * Giao diện chỉ ẩn/hiện; backend mới là nơi chặn thật.
 */

export const GLOBAL = '*';

/** key_match của Casbin: mẫu có thể kết thúc bằng "*". */
export function domainMatches(pattern, domain) {
  const i = pattern.indexOf('*');
  if (i === -1) return pattern === domain;
  return domain.length > i ? domain.slice(0, i) === pattern.slice(0, i) : domain === pattern.slice(0, i);
}

const grants = (p, obj, act) => (p.obj === '*' || p.obj === obj) && (p.act === '*' || p.act === act);

/**
 * @param {Array} perms  danh sách quyền của người dùng
 * @param {string} obj
 * @param {string} act
 * @param {string} [domain]  bỏ trống = có quyền ở bất kỳ phạm vi nào; "*" = cần quyền toàn tỉnh
 */
export function hasPermission(perms, obj, act, domain) {
  return (perms || []).some((p) => grants(p, obj, act) && (domain === undefined || p.dom === GLOBAL || domainMatches(p.dom, domain)));
}

/** Phạm vi outer có bao trùm inner (inner có thể là mẫu cụm "X/*"). */
export function covers(outer, inner) {
  if (outer === GLOBAL) return true;
  if (inner === GLOBAL) return false;
  if (outer.endsWith('/*')) return inner.startsWith(outer.slice(0, -1));
  return outer === inner;
}

/** Người dùng được quản lý (cấp quyền) tại phạm vi domain? */
export function canManageAt(perms, domain) {
  return (perms || []).some((p) => grants(p, 'user', 'manage') && covers(p.dom, domain));
}

/** Mã xã được phép (obj, act); null = toàn tỉnh; [] = không có quyền. */
export function allowedCodes(perms, obj, act, units) {
  const doms = (perms || []).filter((p) => grants(p, obj, act)).map((p) => p.dom);
  if (doms.includes(GLOBAL)) return null;
  return (units || []).filter((u) => u.rbac_domain && doms.some((d) => domainMatches(d, u.rbac_domain))).map((u) => u.code);
}
