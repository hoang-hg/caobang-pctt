import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Users,
  ShieldCheck,
  History,
  UserPlus,
  Lock,
  Unlock,
  KeyRound,
  Pencil,
  Search,
  Crown,
  Building2,
  MapPin,
  ShieldOff,
  Info,
} from 'lucide-react';
import { api } from '../api/client';
import { useStore } from '../app/store';
import { Empty, Modal, Tabs } from '../components/common/ui';
import { usePermission } from '../rbac/usePermission';
import { canManageAt, GLOBAL } from '../rbac/permissions';
import { dateTime } from '../utils/format';
import { PASSWORD_HINT, weakPassword } from './AccountPages';

const AUDIT_LABEL = {
  'user.create': 'Tạo tài khoản',
  'user.update': 'Sửa tài khoản',
  'user.mfa_reset': 'Đặt lại xác thực 2 lớp',
  assign: 'Đổi cấp / phạm vi',
  'role.migrate': 'Chuyển sang phân quyền 3 cấp',
  grant: 'Cấp vai trò (cũ)',
  revoke: 'Thu hồi vai trò (cũ)',
  'role.create': 'Tạo vai trò (cũ)',
  'role.update': 'Sửa vai trò (cũ)',
  'role.delete': 'Xoá vai trò (cũ)',
};

/**
 * Phân quyền 3 cấp — mỗi cấp 1 vai trò, mỗi tài khoản 1 vai trò tại 1 phạm vi (backend: app/rbac/permissions.py).
 * Chỉ cấp trên quản lý tài khoản cấp dưới; cùng cấp không đổi mật khẩu / PIN / 2 lớp của nhau.
 */
export const TIER_CONFIG = {
  super_admin: {
    level: 1,
    title: 'Cấp 1 · Quản trị hệ thống',
    badge: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30',
    icon: Crown,
  },
  admin_tinh: {
    level: 2,
    title: 'Cấp 2 · Quản trị tỉnh',
    badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30',
    icon: Building2,
  },
  admin_xa: {
    level: 3,
    title: 'Cấp 3 · Quản trị xã/phường',
    badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30',
    icon: MapPin,
  },
};
const NO_TIER = {
  level: 9,
  title: 'Chưa có vai trò',
  badge: 'bg-danger/10 text-danger border border-danger/20',
  icon: ShieldOff,
};
export const getTier = (role) => TIER_CONFIG[role] || NO_TIER;
const levelOf = (assignments) => Math.min(9, ...(assignments || []).map((a) => getTier(a.role).level));
const isProvinceLevel = (role) => getTier(role).level <= 2;

const usePerms = () => useStore((s) => s.auth?.user?.permissions || []);
const useMyLevel = () => levelOf(useStore((s) => s.auth?.user?.assignments));
const useScopes = () =>
  useQuery({ queryKey: ['rbac-scopes'], queryFn: () => api('/rbac/scopes'), staleTime: Infinity });
const useRoles = () => useQuery({ queryKey: ['rbac-roles'], queryFn: () => api('/rbac/roles') });

/** Cấp được cấp: Cấp 1 → mọi cấp; người khác → chỉ cấp DƯỚI mình (backend kiểm tra lại). */
function RolePicker({ value, onChange }) {
  const myLevel = useMyLevel();
  const { data: roles = [] } = useRoles();
  const list = roles.filter((r) => myLevel === 1 || (r.level > myLevel && r.is_delegatable));
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Cấp">
      <option value="">— Chọn cấp —</option>
      {list.map((r) => (
        <option key={r.name} value={r.name}>
          {getTier(r.name).title}
        </option>
      ))}
    </select>
  );
}

/** Phạm vi theo cấp: Cấp 1–2 toàn tỉnh (cố định); Cấp 3 chọn đúng 1 xã/phường trong phạm vi bạn quản lý. */
function ScopePicker({ role, value, onChange }) {
  const perms = usePerms();
  const { data } = useScopes();
  if (!role) {
    return (
      <select className="input" disabled aria-label="Phạm vi">
        <option>— Chọn cấp trước —</option>
      </select>
    );
  }
  if (isProvinceLevel(role)) {
    return <div className="input bg-panel2/60 text-ink-2">Toàn tỉnh Cao Bằng</div>;
  }
  const communes = (data?.communes || [])
    .filter((c) => canManageAt(perms, c.domain))
    .sort((a, b) => a.label.localeCompare(b.label, 'vi'));
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Phạm vi">
      <option value="">— Chọn xã/phường —</option>
      {communes.map((c) => (
        <option key={c.domain} value={c.domain}>
          {c.label}
        </option>
      ))}
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

const PIN_RE = /^\d{4,8}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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
  const province = isProvinceLevel(f.role);
  const domain = province ? GLOBAL : f.domain;
  const valid =
    /^[a-z0-9._-]{3,40}$/.test(f.username) &&
    f.full_name.length > 1 &&
    !weakPassword(f.password) &&
    f.role &&
    domain &&
    (!f.email || EMAIL_RE.test(f.email)) &&
    (!province || !f.pin || PIN_RE.test(f.pin));

  const submit = async () => {
    if (
      await run(
        () =>
          api('/rbac/users', {
            method: 'POST',
            body: {
              ...f,
              domain,
              pin: province && f.pin ? f.pin : null,
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
            placeholder="vd: admin.coba, nguyenvan.a"
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
          <input className="input mt-1" placeholder="vd: Phó Chủ tịch UBND xã Cô Ba" value={f.position} onChange={set('position')} />
        </label>
        <label>
          <span className="font-semibold text-xs uppercase text-ink-2">Email công vụ (khôi phục mật khẩu)</span>
          <input
            className="input mt-1"
            type="email"
            placeholder="vd: canbo@caobang.gov.vn"
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
          <span className="font-semibold text-xs uppercase text-ink-2">Cấp</span>
          <div className="mt-1">
            <RolePicker value={f.role} onChange={(v) => setF((x) => ({ ...x, role: v }))} />
          </div>
        </label>
        <label>
          <span className="font-semibold text-xs uppercase text-ink-2">Phạm vi</span>
          <div className="mt-1">
            <ScopePicker role={f.role} value={f.domain} onChange={(v) => setF((x) => ({ ...x, domain: v }))} />
          </div>
        </label>
        {province && (
          <label>
            <span className="font-semibold text-xs uppercase text-ink-2">PIN phê duyệt cảnh báo (4–8 số)</span>
            <input
              className="input mt-1 font-mono"
              inputMode="numeric"
              placeholder="Để trống nếu chưa giao duyệt cảnh báo"
              value={f.pin}
              onChange={set('pin')}
            />
          </label>
        )}
      </div>
      <p className="mt-3 text-xs text-muted leading-relaxed">
        Mỗi tài khoản có đúng 1 vai trò. Bạn chỉ tạo được tài khoản cấp dưới mình, trong phạm vi bạn quản lý. Chức vụ chỉ để
        hiển thị — quyền do cấp quyết định. Lần đăng nhập đầu, người dùng phải đổi mật khẩu ban đầu sang mật khẩu của riêng mình.
      </p>
    </Modal>
  );
}

function AssignmentModal({ user, onClose }) {
  const run = useMutate();
  const cur = user.assignments[0];
  const [role, setRole] = useState(cur?.role && TIER_CONFIG[cur.role] ? cur.role : '');
  const [dom, setDom] = useState(cur && !isProvinceLevel(cur.role) ? cur.domain : '');
  const domain = isProvinceLevel(role) ? GLOBAL : dom;
  const unchanged = cur && cur.role === role && cur.domain === domain;
  const submit = async () => {
    if (
      await run(
        () => api(`/rbac/users/${user.id}/assignment`, { method: 'PUT', body: { role, domain } }),
        `Đã đổi ${user.full_name} sang ${getTier(role).title}`
      )
    )
      onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Đổi cấp / phạm vi – ${user.full_name}`}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Huỷ
          </button>
          <button className="btn-primary" disabled={!role || !domain || unchanged} onClick={submit}>
            <Pencil size={15} /> Lưu
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <div className="text-xs text-muted">
          Hiện tại: <b className="text-ink">{getTier(cur?.role).title}</b>
          {cur && ` · ${cur.domain_label}`}
        </div>
        <label>
          <span className="font-semibold text-xs uppercase text-ink-2">Cấp mới</span>
          <div className="mt-1">
            <RolePicker value={role} onChange={setRole} />
          </div>
        </label>
        <label>
          <span className="font-semibold text-xs uppercase text-ink-2">Phạm vi</span>
          <div className="mt-1">
            <ScopePicker role={role} value={dom} onChange={setDom} />
          </div>
        </label>
        <p className="text-xs text-muted">
          Vai trò mới thay vai trò hiện tại (mỗi tài khoản 1 vai trò). Chuyển xuống Cấp 3 sẽ xoá PIN phê duyệt cảnh báo. Người
          dùng phải đăng nhập lại.
        </p>
      </div>
    </Modal>
  );
}

function CredentialsModal({ user, onClose }) {
  const run = useMutate();
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const canApprove = (user.level ?? 9) <= 2;
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
      title={canApprove ? `Đặt lại mật khẩu / PIN – ${user.full_name}` : `Đặt lại mật khẩu – ${user.full_name}`}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Huỷ
          </button>
          <button
            className="btn-primary"
            disabled={(!password && !pin) || (password && weakPassword(password)) || (pin && !PIN_RE.test(pin))}
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
        {canApprove && (
          <label>
            <span className="font-semibold text-xs uppercase text-ink-2">PIN phê duyệt cảnh báo (4–8 số)</span>
            <input
              className="input mt-1 font-mono"
              inputMode="numeric"
              placeholder="Để trống nếu không đổi"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
          </label>
        )}
      </div>
      <p className="mt-3 text-xs text-muted">
        Sau khi đặt lại mật khẩu, các phiên đăng nhập khác của tài khoản này trên các thiết bị khác sẽ bị hủy phiên để đảm bảo an toàn.
        Người dùng phải đổi sang mật khẩu của riêng mình ở lần đăng nhập tới.
      </p>
    </Modal>
  );
}

const LEVEL_CARDS = [
  {
    level: 1,
    emoji: '👑',
    title: 'Cấp 1 · Quản trị hệ thống',
    tone: 'border-purple-500/20',
    text: 'Toàn quyền hệ thống. Tạo và quản lý tài khoản mọi cấp.',
  },
  {
    level: 2,
    emoji: '🏛️',
    title: 'Cấp 2 · Quản trị tỉnh',
    tone: 'border-blue-500/20',
    text:
      'Toàn tỉnh: SOS, điều động, soạn và duyệt cảnh báo (cần PIN, không tự duyệt lệnh mình soạn), tổng đài, kho, nhập dữ ' +
      'liệu, duyệt hồ sơ xã gửi. Tạo và quản lý tài khoản Cấp 3.',
  },
  {
    level: 3,
    emoji: '📍',
    title: 'Cấp 3 · Quản trị xã/phường',
    tone: 'border-emerald-500/20',
    text:
      'Trong 1 xã/phường: tiếp nhận và xử lý SOS, duyệt phản ánh, xuất kho của xã, gửi dữ liệu chờ tỉnh duyệt. Không quản ' +
      'lý tài khoản.',
  },
];

function UsersTab() {
  const perms = usePerms();
  const me = useStore((s) => s.auth?.user);
  const myLevel = useMyLevel();
  const run = useMutate();
  const canManage = usePermission('user', 'manage');
  const { data: users = [] } = useQuery({ queryKey: ['rbac-users'], queryFn: () => api('/rbac/users') });
  const [q, setQ] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [modal, setModal] = useState(null);

  const shown = users.filter((u) => {
    const text = `${u.full_name} ${u.username} ${u.email || ''} ${u.position || ''} ${u.assignments
      .map((a) => `${a.role_name} ${a.domain_label}`)
      .join(' ')}`.toLowerCase();
    if (q && !text.includes(q.toLowerCase())) return false;
    return levelFilter === 'all' || (u.level ?? 9) === Number(levelFilter);
  });

  // Chỉ cấp trên quản lý tài khoản cấp dưới (cùng cấp không quản lý nhau) — backend kiểm tra lại
  const manages = (u) =>
    myLevel === 1 ||
    (u.assignments.length
      ? (u.level ?? 9) > myLevel && u.assignments.every((a) => canManageAt(perms, a.domain))
      : u.created_by === me?.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {LEVEL_CARDS.map((c) => (
          <div key={c.level} className={clsx('card p-3.5 bg-panel border rounded-xl', c.tone)}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-sm">{c.emoji}</span>
              <div className="font-bold text-xs text-ink uppercase tracking-wide">{c.title}</div>
            </div>
            <p className="text-[11px] text-muted leading-relaxed">{c.text}</p>
          </div>
        ))}
      </div>
      <p className="flex items-start gap-1.5 text-[11px] text-muted -mt-1">
        <Info size={13} className="shrink-0 mt-0.5 text-accent" />
        <span>
          Mỗi tài khoản đúng 1 vai trò. Chỉ cấp trên đổi mật khẩu, PIN, xác thực 2 lớp, khoá hoặc đổi cấp của tài khoản cấp
          dưới; cùng cấp không quản lý nhau.
        </span>
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative min-w-[14rem] flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-2.5 text-muted" />
            <input
              className="input pl-8 py-2 text-xs"
              placeholder="Tìm tên, tài khoản, email, chức vụ, xã..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1 bg-panel2/80 p-1 rounded-xl border border-line text-xs">
            {[
              ['all', `Tất cả (${users.length})`, 'bg-panel text-ink'],
              ['1', '👑 Cấp 1', 'bg-purple-500/15 text-purple-600 dark:text-purple-400'],
              ['2', '🏛️ Cấp 2', 'bg-blue-500/15 text-blue-600 dark:text-blue-400'],
              ['3', '📍 Cấp 3', 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'],
            ].map(([v, label, on]) => (
              <button
                key={v}
                onClick={() => setLevelFilter(v)}
                className={clsx(
                  'px-2.5 py-1 rounded-lg font-medium transition-all',
                  levelFilter === v ? `${on} shadow-sm font-semibold` : 'text-muted hover:text-ink'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {canManage && (
          <button className="btn-primary py-2 px-3 text-xs font-semibold shadow-md" onClick={() => setModal({ type: 'create' })}>
            <UserPlus size={15} />
            <span>Tạo tài khoản công vụ</span>
          </button>
        )}
      </div>

      <div className="card overflow-x-auto shadow-md border-line">
        <table className="table-base">
          <thead>
            <tr>
              <th>Cán bộ & Tài khoản</th>
              <th>Cấp</th>
              <th>Địa bàn phụ trách</th>
              <th>Trạng thái</th>
              <th className="text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => {
              const editable = canManage && manages(u) && u.id !== me?.id;
              const a = u.assignments[0];
              const tier = getTier(a?.role);
              const TierIcon = tier.icon;
              return (
                <tr key={u.id} className={clsx(!u.is_active && 'opacity-60 bg-danger/5')}>
                  <td>
                    <div className="font-semibold text-ink flex items-center gap-1.5">
                      <span>{u.full_name}</span>
                      {u.id === me?.id && (
                        <span className="chip py-0 px-1 text-[10px] bg-accent/15 text-accent font-semibold">Bạn</span>
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
                    <span className={clsx('chip py-0.5 px-2 text-xs font-semibold rounded-lg', tier.badge)}>
                      <TierIcon size={12} className="shrink-0 mr-1" />
                      <span>{tier.title}</span>
                    </span>
                  </td>
                  <td>
                    <div className="text-xs font-medium text-ink">{a?.domain_label || 'Chưa gán'}</div>
                    <div className="text-[11px] font-mono text-muted">{a?.domain || '–'}</div>
                  </td>
                  <td className="whitespace-nowrap text-xs">
                    {u.is_active ? (
                      <span className="chip py-0.5 px-2 bg-good/10 text-good border border-good/20 font-semibold text-[11px]">
                        ● Hoạt động
                      </span>
                    ) : (
                      <span className="chip py-0.5 px-2 bg-danger/10 text-danger border border-danger/20 font-semibold text-[11px]">
                        ● Đã khóa
                      </span>
                    )}
                    {(u.level ?? 9) <= 2 && (
                      <div className="text-[11px] text-muted mt-1">
                        PIN duyệt cảnh báo:{' '}
                        {u.has_pin ? <span className="text-good font-semibold">Đã cấp</span> : 'Chưa cấp'}
                      </div>
                    )}
                    <div className="text-[11px] text-muted">
                      Xác thực 2 lớp: {u.mfa_enabled ? <span className="text-good font-semibold">Đã bật</span> : 'Chưa bật'}
                    </div>
                    {u.must_change_password && (
                      <div className="text-[11px] font-semibold text-warn" title="Mật khẩu do cấp trên đặt — người dùng phải đổi ở lần đăng nhập tới">
                        Chờ tự đổi mật khẩu
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    {editable && (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          className="btn-ghost px-2 py-1 text-xs text-accent hover:bg-accent/10"
                          onClick={() => setModal({ type: 'assign', user: u })}
                        >
                          <Pencil size={13} />
                          <span>Đổi cấp / phạm vi</span>
                        </button>
                        <button
                          className="btn-ghost p-1.5 text-muted hover:text-ink"
                          title={(u.level ?? 9) <= 2 ? 'Đặt lại mật khẩu hoặc PIN' : 'Đặt lại mật khẩu'}
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
                              run(() => api(`/rbac/users/${u.id}/mfa/reset`, { method: 'POST' }), 'Đã đặt lại xác thực 2 lớp')
                            }
                          >
                            <ShieldOff size={14} />
                          </button>
                        )}
                        <button
                          className={clsx('btn-ghost p-1.5', u.is_active ? 'text-muted hover:text-danger' : 'text-danger hover:text-good')}
                          title={u.is_active ? 'Khóa tài khoản này' : 'Mở khóa tài khoản'}
                          onClick={() =>
                            run(
                              () => api(`/rbac/users/${u.id}`, { method: 'PATCH', body: { is_active: !u.is_active } }),
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
      {modal?.type === 'assign' && <AssignmentModal user={modal.user} onClose={() => setModal(null)} />}
      {modal?.type === 'cred' && <CredentialsModal user={modal.user} onClose={() => setModal(null)} />}
    </div>
  );
}

/** 3 vai trò cố định — chỉ xem (không tạo / sửa vai trò). */
function RolesTab() {
  const { data: roles = [] } = useRoles();
  const { data: catalog = [] } = useQuery({ queryKey: ['rbac-perms'], queryFn: () => api('/rbac/permissions') });
  // Theo thứ tự danh mục quyền (giám sát → SOS → điều động → … → dữ liệu), không theo mã
  const inCatalogOrder = (codes) => catalog.filter((p) => codes.includes(p.code)).map((p) => p.description);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted max-w-3xl">
        Hệ thống có đúng 3 vai trò cố định — mỗi cấp 1 vai trò, mỗi tài khoản 1 vai trò. Chức vụ (lãnh đạo, trực ban, cán bộ…)
        chỉ ghi ở hồ sơ tài khoản; quyền do cấp quyết định, nhờ vậy nhật ký luôn rõ ai làm gì với tư cách gì.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        {roles.map((r) => {
          const tier = getTier(r.name);
          const TierIcon = tier.icon;
          return (
            <div key={r.name} className="card p-4 flex flex-col gap-2 border-line shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span className={clsx('chip py-0.5 px-2 text-xs font-semibold rounded-lg', tier.badge)}>
                  <TierIcon size={12} className="inline mr-1" />
                  {tier.title}
                </span>
                <span className="chip py-0.5 px-2 bg-panel2 text-ink text-xs font-semibold">{r.user_count} tài khoản</span>
              </div>
              <p className="text-xs text-muted leading-relaxed">{r.description}</p>
              <div className="text-[11px] text-ink-2">
                Phạm vi: <b>{r.scope_kind === 'tinh' ? 'Toàn tỉnh' : 'Đúng 1 xã/phường'}</b>
              </div>
              <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-ink-2 max-h-56 overflow-y-auto scroll-thin">
                {r.permissions.includes('*.*') ? (
                  <li>Toàn quyền</li>
                ) : (
                  inCatalogOrder(r.permissions).map((d) => <li key={d}>{d}</li>)
                )}
              </ul>
            </div>
          );
        })}
      </div>
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
            <th>Cấp</th>
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
                    {TIER_CONFIG[a.role]?.title || a.role}
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
  const mine = useStore((s) => s.auth?.user?.assignments?.[0]);
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-line/60">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-ink tracking-tight">Phân quyền & Quản lý Tài khoản</h1>
            <span className="chip py-0.5 px-2 bg-accent/15 text-accent font-bold text-xs">3 cấp</span>
          </div>
          <p className="text-xs text-muted mt-1 leading-relaxed">
            Mỗi cấp 1 vai trò, mỗi tài khoản 1 vai trò (Cấp 1 Quản trị hệ thống · Cấp 2 Quản trị tỉnh · Cấp 3 Quản trị
            xã/phường). Bạn: <b className="text-ink font-semibold">{getTier(mine?.role).title}</b>
            {mine && ` · ${mine.domain_label}`}
          </p>
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'users', label: 'Tài khoản người dùng', icon: Users },
          { value: 'roles', label: '3 vai trò & quyền', icon: ShieldCheck },
          { value: 'audit', label: 'Nhật ký pháp lý RBAC', icon: History },
        ]}
      />

      {tab === 'users' && <UsersTab />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  );
}
