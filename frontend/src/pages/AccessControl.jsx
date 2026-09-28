import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Users,
  ShieldCheck,
  History,
  UserPlus,
  Plus,
  X,
  Lock,
  Unlock,
  KeyRound,
  Pencil,
  Trash2,
  Check,
  Search,
  Crown,
  Building2,
  MapPin,
  
  
  
  Layers,
  ShieldOff,
} from 'lucide-react';
import { api } from '../api/client';
import { useStore } from '../app/store';
import { Empty, Modal, Tabs } from '../components/common/ui';
import { usePermission } from '../rbac/usePermission';
import { canManageAt, GLOBAL, hasPermission } from '../rbac/permissions';
import { dateTime } from '../utils/format';
import { PASSWORD_HINT, weakPassword } from './AccountPages';

const RESOURCE_LABEL = {
  monitoring: 'Giám sát',
  sos: 'SOS',
  dispatch: 'Điều động',
  resource: 'Nguồn lực',
  inventory: 'Kho vật tư',
  vehicle: 'Phương tiện',
  alert: 'Cảnh báo',
  contact: 'Danh bạ',
  hotline: 'Tổng đài',
  audit: 'Nhật ký',
  user: 'Tài khoản',
  rbac: 'Vai trò',
};

const ACTION_LABEL = {
  view: 'Xem',
  create: 'Tạo',
  update: 'Cập nhật',
  resolve: 'Hoàn thành',
  issue: 'Xuất',
  approve: 'Duyệt',
  operate: 'Vận hành',
  manage: 'Quản lý',
};

const AUDIT_LABEL = {
  grant: 'Cấp vai trò',
  revoke: 'Thu hồi vai trò',
  'user.create': 'Tạo tài khoản',
  'user.update': 'Sửa tài khoản',
  'role.create': 'Tạo vai trò',
  'role.update': 'Sửa vai trò',
  'role.delete': 'Xoá vai trò',
};

/** Cấu hình phân cấp 3 bậc quyền hạn chính quy */
export const TIER_CONFIG = {
  super_admin: {
    level: 1,
    title: 'Cấp 1 · Tổng hệ thống',
    badge: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30',
    icon: Crown,
    desc: 'Toàn quyền cấu hình, tài khoản, vai trò & hệ thống',
    scopeName: 'Toàn hệ thống (*)',
  },
  admin_tinh: {
    level: 2,
    title: 'Cấp 2 · Quản trị Tỉnh',
    badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30',
    icon: Building2,
    desc: 'Quản lý tài khoản toàn tỉnh, phân quyền cấp dưới, điều động & duyệt phản ánh',
    scopeName: 'Toàn tỉnh Cao Bằng (*)',
  },
  truong_ban: {
    level: 2,
    title: 'Cấp 2 · Lãnh đạo BCH',
    badge: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30',
    icon: Building2,
    desc: 'Chỉ huy toàn diện tác chiến & phê duyệt cảnh báo',
    scopeName: 'Toàn tỉnh Cao Bằng (*)',
  },
  truc_ban: {
    level: 2,
    title: 'Cấp 2 · Trực ban tỉnh',
    badge: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30',
    icon: Building2,
    desc: 'Trực ban tác chiến 24/7, vận hành tổng đài & tiếp nhận SOS',
    scopeName: 'Toàn tỉnh Cao Bằng (*)',
  },
  admin_xa: {
    level: 3,
    title: 'Cấp 3 · Quản trị Xã',
    badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30',
    icon: MapPin,
    desc: 'Quản trị cán bộ xã, tiếp nhận/xử lý cứu hộ và duyệt phản ánh tại địa bàn xã',
    scopeName: 'Theo địa bàn xã/phường',
  },
  chi_huy_cum: {
    level: 3,
    title: 'Cấp 3 · Chỉ huy Cụm',
    badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30',
    icon: MapPin,
    desc: 'Điều hành, phê duyệt và quản lý tài khoản trong cụm huyện',
    scopeName: 'Theo cụm huyện (<CUM>/*)',
  },
  can_bo_xa: {
    level: 3,
    title: 'Cấp 3 · Cán bộ Xã',
    badge: 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30',
    icon: MapPin,
    desc: 'Cán bộ PCTT địa bàn xã tiếp nhận SOS & theo dõi vật tư',
    scopeName: 'Theo địa bàn xã/phường',
  },
  thu_kho: {
    level: 3,
    title: 'Chuyên môn · Thủ kho',
    badge: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/30',
    icon: Layers,
    desc: 'Theo dõi và xuất cấp kho vật tư PCTT',
    scopeName: 'Toàn tỉnh hoặc kho cụm',
  },
  quan_sat: {
    level: 3,
    title: 'Chuyên môn · Quan sát',
    badge: 'bg-gray-500/15 text-gray-700 dark:text-gray-300 border border-gray-500/30',
    icon: Layers,
    desc: 'Lãnh đạo các sở ngành theo dõi tình hình',
    scopeName: 'Toàn tỉnh (*)',
  },
};

export const getTier = (roleName) =>
  TIER_CONFIG[roleName] || {
    level: 3,
    title: 'Vai trò tùy chỉnh',
    badge: 'bg-accent/10 text-accent border border-accent/20',
    icon: ShieldCheck,
    desc: 'Vai trò do quản trị viên thiết lập',
    scopeName: 'Theo phạm vi cấp',
  };

const usePerms = () => useStore((s) => s.auth?.user?.permissions || []);
const useScopes = () =>
  useQuery({ queryKey: ['rbac-scopes'], queryFn: () => api('/rbac/scopes'), staleTime: Infinity });
const useRoles = () => useQuery({ queryKey: ['rbac-roles'], queryFn: () => api('/rbac/roles') });

/** Chọn phạm vi: toàn tỉnh / cụm / xã — chỉ liệt kê phạm vi người dùng hiện tại được quản lý. */
function ScopePicker({ value, onChange }) {
  const perms = usePerms();
  const { data: tree } = useScopes();
  const options = useMemo(() => {
    const out = [];
    for (const root of tree || []) {
      if (canManageAt(perms, root.domain)) out.push({ value: root.domain, label: root.label, depth: 0 });
      for (const c of root.clusters) {
        const cOk = canManageAt(perms, c.domain);
        const units = c.units.filter((u) => canManageAt(perms, u.domain));
        if (!cOk && !units.length) continue;
        out.push({ value: c.domain, label: c.label, depth: 1, disabled: !cOk });
        units.forEach((u) => out.push({ value: u.domain, label: u.label, depth: 2 }));
      }
    }
    return out;
  }, [tree, perms]);
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Phạm vi">
      <option value="">— Chọn phạm vi —</option>
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {'   '.repeat(o.depth)}
          {o.depth === 2 ? '· ' : ''}
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Vai trò mà người hiện tại được cấp, nhóm theo 3 cấp bậc chính quy (backend kiểm tra chống leo thang). */
function RolePicker({ value, onChange }) {
  const perms = usePerms();
  const { data: roles = [] } = useRoles();
  const isSuper = perms.some((p) => p.obj === '*' && p.dom === GLOBAL);
  const list = roles.filter((r) => isSuper || r.is_delegatable);

  const groups = {
    1: { label: '👑 Cấp 1 — Tổng hệ thống', roles: [] },
    2: { label: '🏛️ Cấp 2 — Cấp Tỉnh', roles: [] },
    3: { label: '📍 Cấp 3 — Cấp Xã / Cụm / Chuyên môn', roles: [] },
  };

  list.forEach((r) => {
    const tier = getTier(r.name);
    const lvl = tier.level || 3;
    if (groups[lvl]) groups[lvl].roles.push(r);
  });

  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Vai trò">
      <option value="">— Chọn vai trò —</option>
      {Object.entries(groups).map(
        ([lvl, g]) =>
          g.roles.length > 0 && (
            <optgroup key={lvl} label={g.label}>
              {g.roles.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.display_name} ({getTier(r.name).title})
                </option>
              ))}
            </optgroup>
          )
      )}
    </select>
  );
}

function useMutate() {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  return async (fn, ok) => {
    try {
      await fn();
      toast({ tone: 'good', title: ok });
      qc.invalidateQueries({ queryKey: ['rbac-users'] });
      qc.invalidateQueries({ queryKey: ['rbac-roles'] });
      qc.invalidateQueries({ queryKey: ['rbac-audit'] });
      return true;
    } catch (e) {
      toast({ tone: 'danger', title: 'Không thực hiện được', body: e.message });
      return false;
    }
  };
}

function CreateUserModal({ onClose }) {
  const run = useMutate();
  const [f, setF] = useState({
    username: '',
    full_name: '',
    position: '',
    email: '',
    password: '',
    pin: '',
    role: '',
    domain: '',
  });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const valid =
    /^[a-z0-9._-]{3,40}$/.test(f.username) &&
    f.full_name.length > 1 &&
    !weakPassword(f.password) &&
    f.role &&
    f.domain &&
    (!f.email || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) &&
    (!f.pin || /^\d{4,8}$/.test(f.pin));

  const submit = async () => {
    if (
      await run(
        () =>
          api('/rbac/users', {
            method: 'POST',
            body: {
              ...f,
              pin: f.pin || null,
              position: f.position || null,
              email: f.email || null,
            },
          }),
        `Đã tạo tài khoản ${f.username}`
      )
    )
      onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Tạo tài khoản công vụ"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Huỷ
          </button>
          <button className="btn-primary" disabled={!valid} onClick={submit}>
            <UserPlus size={15} /> Tạo tài khoản
          </button>
        </>
      }
    >
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <label>
          <span className="font-semibold text-xs uppercase text-ink-2">Tên đăng nhập</span>
          <input
            className="input mt-1 font-mono"
            placeholder="vd: admin.coba, canbo.baolam"
            value={f.username}
            onChange={set('username')}
          />
        </label>
        <label>
          <span className="font-semibold text-xs uppercase text-ink-2">Họ và tên cán bộ</span>
          <input className="input mt-1" placeholder="vd: Lục Văn Xã" value={f.full_name} onChange={set('full_name')} />
        </label>
        <label>
          <span className="font-semibold text-xs uppercase text-ink-2">Chức vụ / Đơn vị</span>
          <input className="input mt-1" placeholder="vd: Quản trị xã Cô Ba" value={f.position} onChange={set('position')} />
        </label>
        <label>
          <span className="font-semibold text-xs uppercase text-ink-2">Email công vụ (khôi phục mật khẩu)</span>
          <input
            className="input mt-1"
            type="email"
            placeholder="vd: canbo@caobang-pctt.local"
            value={f.email}
            onChange={set('email')}
          />
        </label>
        <label>
          <span className="font-semibold text-xs uppercase text-ink-2">Mật khẩu ban đầu</span>
          <input
            className="input mt-1"
            type="password"
            placeholder={PASSWORD_HINT.toLowerCase()}
            value={f.password}
            onChange={set('password')}
          />
        </label>
        <label>
          <span className="font-semibold text-xs uppercase text-ink-2">PIN phê duyệt (nếu có, 4–8 số)</span>
          <input
            className="input mt-1 font-mono"
            inputMode="numeric"
            placeholder="Để trống nếu không duyệt cảnh báo"
            value={f.pin}
            onChange={set('pin')}
          />
        </label>
        <label>
          <span className="font-semibold text-xs uppercase text-ink-2">Vai trò hệ thống</span>
          <div className="mt-1">
            <RolePicker value={f.role} onChange={(v) => setF((x) => ({ ...x, role: v }))} />
          </div>
        </label>
        <label>
          <span className="font-semibold text-xs uppercase text-ink-2">Phạm vi địa bàn được giao</span>
          <div className="mt-1">
            <ScopePicker value={f.domain} onChange={(v) => setF((x) => ({ ...x, domain: v }))} />
          </div>
        </label>
      </div>
      <p className="mt-3 text-xs text-muted leading-relaxed">
        * Nguyên tắc phân quyền rào chắn: Bạn chỉ cấp được vai trò và phạm vi nằm trong thẩm quyền quản lý của mình. Cán bộ cấp xã chỉ thấy và thao tác dữ liệu thuộc địa bàn được phân quyền.
      </p>
    </Modal>
  );
}

function GrantModal({ user, onClose }) {
  const run = useMutate();
  const [role, setRole] = useState('');
  const [domain, setDomain] = useState('');
  const submit = async () => {
    if (
      await run(
        () =>
          api(`/rbac/users/${user.id}/assignments`, {
            method: 'POST',
            body: { role, domain },
          }),
        `Đã cấp vai trò cho ${user.full_name}`
      )
    )
      onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Cấp thêm vai trò – ${user.full_name}`}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Huỷ
          </button>
          <button className="btn-primary" disabled={!role || !domain} onClick={submit}>
            <Plus size={15} /> Cấp quyền
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <label>
          <span className="font-semibold text-xs uppercase text-ink-2">Vai trò bổ sung</span>
          <div className="mt-1">
            <RolePicker value={role} onChange={setRole} />
          </div>
        </label>
        <label>
          <span className="font-semibold text-xs uppercase text-ink-2">Phạm vi phụ trách</span>
          <div className="mt-1">
            <ScopePicker value={domain} onChange={setDomain} />
          </div>
        </label>
        <p className="text-xs text-muted">
          Người dùng sẽ nhận quyền mới ngay trong phiên làm việc hoặc sau khi làm mới trang.
        </p>
      </div>
    </Modal>
  );
}

function CredentialsModal({ user, onClose }) {
  const run = useMutate();
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const submit = async () => {
    const body = { ...(password ? { password } : {}), ...(pin ? { pin } : {}) };
    if (
      await run(
        () => api(`/rbac/users/${user.id}`, { method: 'PATCH', body }),
        'Đã cập nhật thông tin đăng nhập thành công'
      )
    )
      onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Đặt lại mật khẩu / PIN – ${user.full_name}`}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Huỷ
          </button>
          <button
            className="btn-primary"
            disabled={
              (!password && !pin) ||
              (password && weakPassword(password)) ||
              (pin && !/^\d{4,8}$/.test(pin))
            }
            onClick={submit}
          >
            <KeyRound size={15} /> Lưu thay đổi
          </button>
        </>
      }
    >
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <label>
          <span className="font-semibold text-xs uppercase text-ink-2">Mật khẩu mới</span>
          <input
            className="input mt-1"
            type="password"
            placeholder={PASSWORD_HINT.toLowerCase()}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          <span className="font-semibold text-xs uppercase text-ink-2">Mã PIN mới (4–8 số)</span>
          <input
            className="input mt-1 font-mono"
            inputMode="numeric"
            placeholder="Để trống nếu không đổi"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
        </label>
      </div>
      <p className="mt-3 text-xs text-muted">
        Sau khi đặt lại mật khẩu, các phiên đăng nhập khác của tài khoản này trên các thiết bị khác sẽ bị hủy phiên để đảm bảo an toàn.
      </p>
    </Modal>
  );
}

function UsersTab() {
  const perms = usePerms();
  const me = useStore((s) => s.auth?.user);
  const run = useMutate();
  const canManage = usePermission('user', 'manage');
  const { data: users = [] } = useQuery({ queryKey: ['rbac-users'], queryFn: () => api('/rbac/users') });
  const [q, setQ] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [modal, setModal] = useState(null);

  const shown = users.filter((u) => {
    const textMatch =
      !q ||
      `${u.full_name} ${u.username} ${u.email || ''} ${u.position || ''} ${u.assignments
        .map((a) => `${a.role_name} ${a.domain_label}`)
        .join(' ')}`
        .toLowerCase()
        .includes(q.toLowerCase());

    if (!textMatch) return false;

    if (levelFilter === 'all') return true;

    // Lọc theo level cấp bậc
    const highestLevel = Math.min(
      ...(u.assignments.length ? u.assignments.map((a) => getTier(a.role).level) : [3])
    );
    return highestLevel === Number(levelFilter);
  });

  const manages = (u) =>
    u.assignments.length
      ? u.assignments.every((a) => canManageAt(perms, a.domain))
      : u.created_by === me?.id;

  return (
    <div className="flex flex-col gap-4">
      {/* Khối giới thiệu 3 cấp bậc phân quyền hành chính */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="card p-3.5 bg-panel border border-purple-500/20 rounded-xl relative overflow-hidden">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold text-sm">
              👑
            </span>
            <div>
              <div className="font-bold text-xs text-ink uppercase tracking-wide">Cấp 1 · Tổng Hệ Thống</div>
              <div className="text-[11px] text-purple-600 dark:text-purple-400 font-medium">Toàn quyền hệ thống & cấu hình</div>
            </div>
          </div>
          <p className="text-[11px] text-muted leading-relaxed">
            Quản trị viên kỹ thuật cao nhất: Toàn quyền quản lý vai trò (RBAC), tạo tài khoản cấp tỉnh, tích hợp IoT và giám sát toàn diện.
          </p>
        </div>

        <div className="card p-3.5 bg-panel border border-blue-500/20 rounded-xl relative overflow-hidden">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold text-sm">
              🏛️
            </span>
            <div>
              <div className="font-bold text-xs text-ink uppercase tracking-wide">Cấp 2 · Quản Trị Tỉnh</div>
              <div className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">Ban Chỉ huy PCTT & TKCN Tỉnh</div>
            </div>
          </div>
          <p className="text-[11px] text-muted leading-relaxed">
            Quản trị & điều hành tác chiến tỉnh: Quản lý tài khoản toàn tỉnh, phân quyền cho cấp dưới (Admin xã/cụm), duyệt cảnh báo và điều phối cứu hộ.
          </p>
        </div>

        <div className="card p-3.5 bg-panel border border-emerald-500/20 rounded-xl relative overflow-hidden">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
              📍
            </span>
            <div>
              <div className="font-bold text-xs text-ink uppercase tracking-wide">Cấp 3 · Quản Trị Xã / Cụm</div>
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">UBND Xã/Phường & Cụm địa bàn</div>
            </div>
          </div>
          <p className="text-[11px] text-muted leading-relaxed">
            Quản trị cấp cơ sở: Quản lý cán bộ trong xã, trực tiếp tiếp nhận & xử lý SOS, duyệt phản ánh hiện trường thuộc địa bàn được phân quyền.
          </p>
        </div>
      </div>

      {/* Thanh tìm kiếm & Bộ lọc Cấp bậc */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative min-w-[14rem] flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-2.5 text-muted" />
            <input
              className="input pl-8 py-2 text-xs"
              placeholder="Tìm tên, tài khoản, email, chức vụ, vai trò, xã..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {/* Bộ lọc theo Cấp bậc */}
          <div className="flex items-center gap-1 bg-panel2/80 p-1 rounded-xl border border-line text-xs">
            <button
              onClick={() => setLevelFilter('all')}
              className={clsx(
                'px-2.5 py-1 rounded-lg font-medium transition-all',
                levelFilter === 'all'
                  ? 'bg-panel text-ink shadow-sm font-semibold'
                  : 'text-muted hover:text-ink'
              )}
            >
              Tất cả ({users.length})
            </button>
            <button
              onClick={() => setLevelFilter('1')}
              className={clsx(
                'px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1',
                levelFilter === '1'
                  ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 shadow-sm font-semibold'
                  : 'text-muted hover:text-ink'
              )}
            >
              <span>👑 Cấp 1</span>
            </button>
            <button
              onClick={() => setLevelFilter('2')}
              className={clsx(
                'px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1',
                levelFilter === '2'
                  ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 shadow-sm font-semibold'
                  : 'text-muted hover:text-ink'
              )}
            >
              <span>🏛️ Cấp 2</span>
            </button>
            <button
              onClick={() => setLevelFilter('3')}
              className={clsx(
                'px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1',
                levelFilter === '3'
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shadow-sm font-semibold'
                  : 'text-muted hover:text-ink'
              )}
            >
              <span>📍 Cấp 3</span>
            </button>
          </div>
        </div>

        {canManage && (
          <button
            className="btn-primary py-2 px-3 text-xs font-semibold shadow-md"
            onClick={() => setModal({ type: 'create' })}
          >
            <UserPlus size={15} />
            <span>Tạo tài khoản công vụ</span>
          </button>
        )}
      </div>

      {/* Bảng danh sách người dùng */}
      <div className="card overflow-x-auto shadow-md border-line">
        <table className="table-base">
          <thead>
            <tr>
              <th>Cán bộ & Tài khoản</th>
              <th>Cấp bậc & Vai trò</th>
              <th>Địa bàn phụ trách</th>
              <th>Trạng thái</th>
              <th className="text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => {
              const editable = canManage && manages(u) && u.id !== me?.id;
              const primaryRole = u.assignments[0]?.role;
              const tier = getTier(primaryRole);
              const TierIcon = tier.icon;

              return (
                <tr key={u.id} className={clsx(!u.is_active && 'opacity-60 bg-danger/5')}>
                  <td>
                    <div className="font-semibold text-ink flex items-center gap-1.5">
                      <span>{u.full_name}</span>
                      {u.id === me?.id && (
                        <span className="chip py-0 px-1 text-[10px] bg-accent/15 text-accent font-semibold">
                          Bạn
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted flex items-center gap-1 mt-0.5">
                      <span className="font-mono text-ink-2 bg-panel2/60 px-1 py-0.2 rounded border border-line/50">
                        @{u.username}
                      </span>
                      {u.position && <span>· {u.position}</span>}
                    </div>
                    {u.email && <div className="text-[11px] text-muted/80 mt-0.5">{u.email}</div>}
                  </td>

                  <td>
                    <div className="flex flex-col gap-1 items-start">
                      <span className={clsx('chip py-0.5 px-2 text-xs font-semibold rounded-lg', tier.badge)}>
                        <TierIcon size={12} className="shrink-0 mr-1" />
                        <span>{tier.title}</span>
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {u.assignments.map((a) => (
                          <span
                            key={`${a.role}@${a.domain}`}
                            className="chip text-[11px] bg-panel2 text-ink-2 py-0.5 px-1.5 border border-line"
                          >
                            <ShieldCheck size={11} className="text-accent inline mr-1" />
                            {a.role_name}
                            {editable && canManageAt(perms, a.domain) && (
                              <button
                                className="ml-1 rounded-full hover:bg-danger/20 hover:text-danger"
                                title="Thu hồi vai trò này"
                                aria-label="Thu hồi vai trò"
                                onClick={() =>
                                  window.confirm(
                                    `Thu hồi vai trò “${a.role_name}” tại ${a.domain_label} của ${u.full_name}?`
                                  ) &&
                                  run(
                                    () =>
                                      api(
                                        `/rbac/users/${u.id}/assignments?role=${encodeURIComponent(
                                          a.role
                                        )}&domain=${encodeURIComponent(a.domain)}`,
                                        { method: 'DELETE' }
                                      ),
                                    'Đã thu hồi vai trò'
                                  )
                                }
                              >
                                <X size={11} />
                              </button>
                            )}
                          </span>
                        ))}
                        {!u.assignments.length && (
                          <span className="text-xs text-danger font-medium">Chưa có vai trò</span>
                        )}
                      </div>
                    </div>
                  </td>

                  <td>
                    <div className="text-xs font-medium text-ink">
                      {u.assignments[0]?.domain_label || 'Chưa gán'}
                    </div>
                    <div className="text-[11px] font-mono text-muted">
                      {u.assignments[0]?.domain || '–'}
                    </div>
                  </td>

                  <td className="whitespace-nowrap text-xs">
                    <div className="flex items-center gap-1.5">
                      {u.is_active ? (
                        <span className="chip py-0.5 px-2 bg-good/10 text-good border border-good/20 font-semibold text-[11px]">
                          ● Hoạt động
                        </span>
                      ) : (
                        <span className="chip py-0.5 px-2 bg-danger/10 text-danger border border-danger/20 font-semibold text-[11px]">
                          ● Đã khóa
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted mt-1">
                      Mã PIN: {u.has_pin ? <span className="text-good font-semibold">Đã cài</span> : 'Chưa cài'}
                    </div>
                    <div className="text-[11px] text-muted">
                      Xác thực 2 lớp: {u.mfa_enabled ? <span className="text-good font-semibold">Đã bật</span> : 'Chưa bật'}
                    </div>
                  </td>

                  <td className="whitespace-nowrap text-right">
                    {editable && (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          className="btn-ghost px-2 py-1 text-xs text-accent hover:bg-accent/10"
                          onClick={() => setModal({ type: 'grant', user: u })}
                        >
                          <Plus size={13} />
                          <span>Cấp vai trò</span>
                        </button>
                        <button
                          className="btn-ghost p-1.5 text-muted hover:text-ink"
                          title="Đặt lại mật khẩu hoặc PIN"
                          onClick={() => setModal({ type: 'cred', user: u })}
                        >
                          <KeyRound size={14} />
                        </button>
                        {u.mfa_enabled && (
                          <button
                            className="btn-ghost p-1.5 text-muted hover:text-warn"
                            title="Đặt lại xác thực 2 lớp (mất điện thoại)"
                            onClick={() =>
                              window.confirm(
                                `Đặt lại xác thực 2 lớp của ${u.full_name}? Chỉ làm sau khi đã xác minh đúng người yêu cầu. ` +
                                  'Mọi phiên đăng nhập của tài khoản sẽ bị đăng xuất.'
                              ) &&
                              run(
                                () => api(`/rbac/users/${u.id}/mfa/reset`, { method: 'POST' }),
                                'Đã đặt lại xác thực 2 lớp'
                              )
                            }
                          >
                            <ShieldOff size={14} />
                          </button>
                        )}
                        <button
                          className={clsx(
                            'btn-ghost p-1.5',
                            u.is_active ? 'text-muted hover:text-danger' : 'text-danger hover:text-good'
                          )}
                          title={u.is_active ? 'Khóa tài khoản này' : 'Mở khóa tài khoản'}
                          onClick={() =>
                            run(
                              () =>
                                api(`/rbac/users/${u.id}`, {
                                  method: 'PATCH',
                                  body: { is_active: !u.is_active },
                                }),
                              u.is_active ? 'Đã khóa tài khoản' : 'Đã mở khóa tài khoản'
                            )
                          }
                        >
                          {u.is_active ? <Lock size={14} /> : <Unlock size={14} />}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!shown.length && <Empty>Không tìm thấy tài khoản phù hợp trong phạm vi quản lý</Empty>}
      </div>

      {modal?.type === 'create' && <CreateUserModal onClose={() => setModal(null)} />}
      {modal?.type === 'grant' && <GrantModal user={modal.user} onClose={() => setModal(null)} />}
      {modal?.type === 'cred' && <CredentialsModal user={modal.user} onClose={() => setModal(null)} />}
    </div>
  );
}

function RoleModal({ role, catalog, onClose }) {
  const run = useMutate();
  const isNew = !role;
  const [f, setF] = useState({
    name: role?.name || '',
    display_name: role?.display_name || '',
    description: role?.description || '',
    is_delegatable: role?.is_delegatable ?? true,
    permissions: role?.permissions || [],
  });
  const toggle = (code) =>
    setF((x) => ({
      ...x,
      permissions: x.permissions.includes(code)
        ? x.permissions.filter((c) => c !== code)
        : [...x.permissions, code],
    }));
  const groups = catalog.reduce((g, p) => ({ ...g, [p.resource]: [...(g[p.resource] || []), p] }), {});
  const valid = (isNew ? /^[a-z][a-z0-9_]{2,40}$/.test(f.name) : true) && f.display_name.length > 1 && f.permissions.length > 0;

  const submit = async () => {
    if (isNew) {
      if (await run(() => api('/rbac/roles', { method: 'POST', body: f }), `Đã tạo vai trò ${f.display_name}`)) onClose();
    } else {
      const body = {
        display_name: f.display_name,
        description: f.description,
        ...(role.is_system ? {} : { is_delegatable: f.is_delegatable, permissions: f.permissions }),
      };
      if (await run(() => api(`/rbac/roles/${role.name}`, { method: 'PATCH', body }), `Đã cập nhật vai trò ${f.display_name}`)) onClose();
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Tạo vai trò mới' : `Sửa vai trò – ${role.display_name}`}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Huỷ
          </button>
          <button className="btn-primary" disabled={!valid} onClick={submit}>
            {isNew ? <Plus size={15} /> : <Check size={15} />} {isNew ? 'Tạo vai trò' : 'Lưu'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {isNew && (
          <label>
            <span className="font-semibold text-xs uppercase text-ink-2">Mã vai trò (chữ thường không dấu, số, gạch dưới)</span>
            <input className="input mt-1 font-mono" placeholder="vd: chi_huy_huyen" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </label>
        )}
        <label>
          <span className="font-semibold text-xs uppercase text-ink-2">Tên hiển thị</span>
          <input className="input mt-1" placeholder="vd: Chỉ huy PCTT Cụm Huyện" value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} />
        </label>
        <label>
          <span className="font-semibold text-xs uppercase text-ink-2">Mô tả nhiệm vụ & quyền hạn</span>
          <textarea rows={2} className="input mt-1" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </label>
        {!role?.is_system && (
          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={f.is_delegatable}
              onChange={(e) => setF({ ...f, is_delegatable: e.target.checked })}
              className="h-4 w-4 rounded border-line text-accent"
            />
            <span className="text-xs text-ink font-medium">Cho phép quản trị viên cấp dưới (Admin tỉnh, Admin xã) được ủy quyền gán vai trò này</span>
          </label>
        )}

        <div>
          <div className="font-semibold text-xs uppercase text-ink-2 mb-2">Danh sách quyền hạn gán cho vai trò</div>
          {role?.is_system && (
            <p className="text-xs text-warn mb-2 font-medium">
              * Vai trò hệ thống được cố định danh sách quyền để bảo đảm an toàn kiến trúc.
            </p>
          )}
          <div className="max-h-80 overflow-y-auto pr-1 scroll-thin flex flex-col gap-3 rounded-xl border border-line p-3 bg-panel2/40">
            {Object.entries(groups).map(([res, perms]) => (
              <div key={res}>
                <div className="text-xs font-bold text-accent mb-1 uppercase tracking-wide">
                  {RESOURCE_LABEL[res] || res}
                </div>
                <div className="grid gap-1 sm:grid-cols-2">
                  {perms.map((p) => {
                    const checked = f.permissions.includes(p.code);
                    return (
                      <label
                        key={p.code}
                        className={clsx(
                          'flex items-start gap-2 rounded-lg p-2 text-xs border transition-colors cursor-pointer',
                          checked ? 'border-accent bg-accent/10' : 'border-line hover:bg-panel2'
                        )}
                      >
                        <input
                          type="checkbox"
                          disabled={role?.is_system}
                          checked={checked}
                          onChange={() => toggle(p.code)}
                          className="mt-0.5 h-3.5 w-3.5 rounded border-line text-accent"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-ink">
                            {ACTION_LABEL[p.action] || p.action}
                            <span className="font-mono text-[10px] text-muted ml-1">({p.code})</span>
                          </div>
                          <div className="text-[11px] text-muted leading-tight mt-0.5">{p.description}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function RolesTab() {
  const run = useMutate();
  const canManageRoles = usePermission('rbac', 'manage');
  const { data: roles = [] } = useRoles();
  const { data: catalog = [] } = useQuery({ queryKey: ['rbac-perms'], queryFn: () => api('/rbac/permissions') });
  const [modal, setModal] = useState(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted max-w-xl">
          Định nghĩa vai trò hệ thống và vai trò tùy chỉnh. Mỗi vai trò quy định tập hợp quyền thao tác trên các phân hệ điều hành tác chiến.
        </p>
        {canManageRoles && (
          <button className="btn-primary py-2 px-3 text-xs" onClick={() => setModal({ type: 'create' })}>
            <Plus size={14} /> Tạo vai trò mới
          </button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {roles.map((r) => {
          const tier = getTier(r.name);
          const TierIcon = tier.icon;
          return (
            <div key={r.name} className="card p-4 flex flex-col justify-between border-line shadow-sm hover:border-accent/40 transition-all">
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className={clsx('chip py-0.5 px-1.5 text-[10px] font-bold rounded', tier.badge)}>
                        <TierIcon size={11} className="inline mr-0.5" />
                        {tier.title}
                      </span>
                      {r.is_system && (
                        <span className="chip text-[10px] py-0 px-1.5 bg-panel2 text-muted font-medium">Hệ thống</span>
                      )}
                    </div>
                    <h3 className="font-bold text-sm text-ink mt-1">{r.display_name}</h3>
                    <div className="font-mono text-[11px] text-muted">@{r.name}</div>
                  </div>
                  <span className="chip py-0.5 px-2 bg-panel2 text-ink text-xs font-semibold">
                    {r.user_count} người dùng
                  </span>
                </div>

                <p className="text-xs text-muted leading-relaxed mb-3 min-h-[32px]">{r.description || 'Chưa có mô tả'}</p>

                <div className="text-[11px] text-ink-2 font-medium mb-1.5 flex items-center justify-between">
                  <span>Quyền hạn được cấp ({r.permissions.length}):</span>
                  {r.is_delegatable && <span className="text-good text-[10px]">Được ủy quyền</span>}
                </div>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto scroll-thin p-1 rounded-lg bg-panel2/60 border border-line/60">
                  {r.permissions.map((p) => (
                    <span key={p} className="chip text-[10px] py-0 px-1.5 bg-panel text-ink-2 border border-line">
                      {p}
                    </span>
                  ))}
                  {!r.permissions.length && <span className="text-[11px] text-danger">Chưa có quyền nào</span>}
                </div>
              </div>

              {canManageRoles && (
                <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-end gap-1">
                  <button
                    className="btn-ghost py-1 px-2.5 text-xs text-accent hover:bg-accent/10"
                    onClick={() => setModal({ type: 'edit', role: r })}
                  >
                    <Pencil size={12} /> Sửa vai trò
                  </button>
                  {!r.is_system && (
                    <button
                      className="btn-ghost py-1 px-2 text-xs text-muted hover:text-danger hover:bg-danger/10"
                      title="Xoá vai trò"
                      onClick={() =>
                        window.confirm(`Xoá vai trò “${r.display_name}”? Hành động này không thể hoàn tác.`) &&
                        run(() => api(`/rbac/roles/${r.name}`, { method: 'DELETE' }), 'Đã xoá vai trò')
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {modal?.type === 'create' && <RoleModal catalog={catalog} onClose={() => setModal(null)} />}
      {modal?.type === 'edit' && <RoleModal role={modal.role} catalog={catalog} onClose={() => setModal(null)} />}
    </div>
  );
}

function AuditTab() {
  const { data = [] } = useQuery({ queryKey: ['rbac-audit'], queryFn: () => api('/rbac/audit') });
  return (
    <div className="card overflow-x-auto shadow-md border-line">
      <table className="table-base">
        <thead>
          <tr>
            <th>Thời gian</th>
            <th>Người thực hiện</th>
            <th>Hành động</th>
            <th>Đối tượng tác động</th>
            <th>Vai trò</th>
            <th>Địa bàn (Domain)</th>
          </tr>
        </thead>
        <tbody>
          {data.map((a) => (
            <tr key={a.id}>
              <td className="whitespace-nowrap font-mono text-xs">{dateTime(a.time)}</td>
              <td>
                <span className="font-semibold text-ink">{a.actor_name}</span>
              </td>
              <td>
                <span className="chip py-0.5 px-2 text-xs bg-panel2 text-ink border border-line">
                  {AUDIT_LABEL[a.action] || a.action}
                </span>
              </td>
              <td className="font-mono text-xs">{a.target_user || '–'}</td>
              <td>
                {a.role ? (
                  <span className="chip py-0.5 px-1.5 text-xs bg-accent/10 text-accent font-medium">
                    {a.role}
                  </span>
                ) : (
                  '–'
                )}
              </td>
              <td className="text-xs text-ink-2 font-medium">{a.domain_label || a.domain || '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!data.length && <Empty>Chưa có nhật ký thao tác phân quyền nào</Empty>}
    </div>
  );
}

export default function AccessControl() {
  const [tab, setTab] = useState('users');
  const perms = usePerms();
  const scopes = [
    ...new Set(
      perms
        .filter((p) => (p.obj === 'user' || p.obj === '*') && (p.act === 'manage' || p.act === '*'))
        .map((p) => p.dom)
    ),
  ];
  const assignments = useStore((s) => s.auth?.user?.assignments || []);
  const label = (d) => assignments.find((a) => a.domain === d)?.domain_label || d;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-line/60">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-ink tracking-tight">Phân quyền & Quản lý Tài khoản</h1>
            <span className="chip py-0.5 px-2 bg-accent/15 text-accent font-bold text-xs">RBAC Đa Cấp</span>
          </div>
          <p className="text-xs text-muted mt-1 leading-relaxed">
            Phân bậc quyền hạn hành chính 3 cấp (Tổng hệ thống · Cấp Tỉnh · Cấp Xã). Thẩm quyền quản lý của bạn:{' '}
            <b className="text-ink font-semibold">{scopes.length ? scopes.map(label).join(', ') : 'Chỉ xem'}</b>
            {hasPermission(perms, 'rbac', 'manage', GLOBAL) && (
              <span className="text-purple-600 dark:text-purple-400 font-medium"> · Toàn quyền quản trị vai trò hệ thống</span>
            )}
          </p>
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'users', label: 'Tài khoản người dùng', icon: Users },
          { value: 'roles', label: 'Vai trò & Danh mục quyền', icon: ShieldCheck },
          { value: 'audit', label: 'Nhật ký pháp lý RBAC', icon: History },
        ]}
      />

      {tab === 'users' && <UsersTab />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  );
}
