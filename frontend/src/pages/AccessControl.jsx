import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Users, ShieldCheck, History, UserPlus, Plus, X, Lock, Unlock, KeyRound, Pencil, Trash2, Check, Search,
} from 'lucide-react';
import { api } from '../api/client';
import { useStore } from '../app/store';
import { Empty, Modal, Tabs } from '../components/common/ui';
import { usePermission } from '../rbac/usePermission';
import { canManageAt, GLOBAL, hasPermission } from '../rbac/permissions';
import { dateTime } from '../utils/format';

const RESOURCE_LABEL = {
  monitoring: 'Giám sát', sos: 'SOS', dispatch: 'Điều động', resource: 'Nguồn lực', inventory: 'Kho vật tư', vehicle: 'Phương tiện',
  alert: 'Cảnh báo', contact: 'Danh bạ', hotline: 'Tổng đài', audit: 'Nhật ký', user: 'Tài khoản', rbac: 'Vai trò',
};
const ACTION_LABEL = {
  view: 'Xem', create: 'Tạo', update: 'Cập nhật', resolve: 'Hoàn thành', issue: 'Xuất', approve: 'Duyệt', operate: 'Vận hành', manage: 'Quản lý',
};
const AUDIT_LABEL = {
  grant: 'Cấp vai trò', revoke: 'Thu hồi vai trò', 'user.create': 'Tạo tài khoản', 'user.update': 'Sửa tài khoản',
  'role.create': 'Tạo vai trò', 'role.update': 'Sửa vai trò', 'role.delete': 'Xoá vai trò',
};

const usePerms = () => useStore((s) => s.auth?.user?.permissions || []);
const useScopes = () => useQuery({ queryKey: ['rbac-scopes'], queryFn: () => api('/rbac/scopes'), staleTime: Infinity });
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
          {'   '.repeat(o.depth)}{o.depth === 2 ? '· ' : ''}{o.label}
        </option>
      ))}
    </select>
  );
}

/** Vai trò mà người hiện tại được cấp (backend vẫn kiểm tra chống leo thang). */
function RolePicker({ value, onChange }) {
  const perms = usePerms();
  const { data: roles = [] } = useRoles();
  const isSuper = perms.some((p) => p.obj === '*' && p.dom === GLOBAL);
  const list = roles.filter((r) => isSuper || r.is_delegatable);
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Vai trò">
      <option value="">— Chọn vai trò —</option>
      {list.map((r) => <option key={r.name} value={r.name}>{r.display_name}</option>)}
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
  const [f, setF] = useState({ username: '', full_name: '', position: '', password: '', pin: '', role: '', domain: '' });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const valid = /^[a-z0-9._-]{3,40}$/.test(f.username) && f.full_name.length > 1 && f.password.length >= 6 && f.role && f.domain
    && (!f.pin || /^\d{4,8}$/.test(f.pin));
  const submit = async () => {
    if (await run(() => api('/rbac/users', { method: 'POST', body: { ...f, pin: f.pin || null, position: f.position || null } }), `Đã tạo tài khoản ${f.username}`)) onClose();
  };
  return (
    <Modal open onClose={onClose} title="Tạo tài khoản con" footer={<><button className="btn-ghost" onClick={onClose}>Huỷ</button><button className="btn-primary" disabled={!valid} onClick={submit}><UserPlus size={15} /> Tạo</button></>}>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <label>Tên đăng nhập<input className="input mt-1 font-mono" placeholder="vd: canbo.baolam" value={f.username} onChange={set('username')} /></label>
        <label>Họ tên<input className="input mt-1" value={f.full_name} onChange={set('full_name')} /></label>
        <label className="sm:col-span-2">Chức vụ<input className="input mt-1" value={f.position} onChange={set('position')} /></label>
        <label>Mật khẩu (≥ 6 ký tự)<input className="input mt-1" type="password" value={f.password} onChange={set('password')} /></label>
        <label>PIN phê duyệt (tuỳ chọn)<input className="input mt-1 font-mono" inputMode="numeric" value={f.pin} onChange={set('pin')} /></label>
        <label>Vai trò<div className="mt-1"><RolePicker value={f.role} onChange={(v) => setF((x) => ({ ...x, role: v }))} /></div></label>
        <label>Phạm vi<div className="mt-1"><ScopePicker value={f.domain} onChange={(v) => setF((x) => ({ ...x, domain: v }))} /></div></label>
      </div>
      <p className="mt-3 text-xs text-muted">Chỉ cấp được vai trò và phạm vi nằm trong quyền quản lý của bạn; không cấp được quyền bạn không có.</p>
    </Modal>
  );
}

function GrantModal({ user, onClose }) {
  const run = useMutate();
  const [role, setRole] = useState('');
  const [domain, setDomain] = useState('');
  const submit = async () => {
    if (await run(() => api(`/rbac/users/${user.id}/assignments`, { method: 'POST', body: { role, domain } }), `Đã cấp vai trò cho ${user.full_name}`)) onClose();
  };
  return (
    <Modal open onClose={onClose} title={`Cấp vai trò – ${user.full_name}`} footer={<><button className="btn-ghost" onClick={onClose}>Huỷ</button><button className="btn-primary" disabled={!role || !domain} onClick={submit}><Plus size={15} /> Cấp</button></>}>
      <div className="flex flex-col gap-3 text-sm">
        <label>Vai trò<div className="mt-1"><RolePicker value={role} onChange={setRole} /></div></label>
        <label>Phạm vi<div className="mt-1"><ScopePicker value={domain} onChange={setDomain} /></div></label>
        <p className="text-xs text-muted">Người dùng sẽ phải đăng nhập lại để nhận quyền mới.</p>
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
    if (await run(() => api(`/rbac/users/${user.id}`, { method: 'PATCH', body }), 'Đã cập nhật thông tin đăng nhập')) onClose();
  };
  return (
    <Modal open onClose={onClose} title={`Đặt lại mật khẩu / PIN – ${user.full_name}`} footer={<><button className="btn-ghost" onClick={onClose}>Huỷ</button><button className="btn-primary" disabled={(!password && !pin) || (password && password.length < 6) || (pin && !/^\d{4,8}$/.test(pin))} onClick={submit}><KeyRound size={15} /> Lưu</button></>}>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <label>Mật khẩu mới<input className="input mt-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <label>PIN mới (4–8 số)<input className="input mt-1 font-mono" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} /></label>
      </div>
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
  const [modal, setModal] = useState(null);
  const shown = users.filter((u) => !q || `${u.full_name} ${u.username} ${u.position || ''} ${u.assignments.map((a) => `${a.role_name} ${a.domain_label}`).join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  const manages = (u) => u.assignments.length ? u.assignments.every((a) => canManageAt(perms, a.domain)) : u.created_by === me?.id;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search size={14} className="absolute left-3 top-2.5 text-muted" />
          <input className="input pl-8" placeholder="Tìm tên, tài khoản, vai trò, địa bàn…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {canManage && <button className="btn-primary" onClick={() => setModal({ type: 'create' })}><UserPlus size={15} /> Tạo tài khoản con</button>}
      </div>
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead><tr><th>Tài khoản</th><th>Vai trò & phạm vi</th><th>Trạng thái</th><th /></tr></thead>
          <tbody>
            {shown.map((u) => {
              const editable = canManage && manages(u) && u.id !== me?.id;
              return (
                <tr key={u.id} className={clsx(!u.is_active && 'opacity-60')}>
                  <td>
                    <div className="font-medium">{u.full_name}</div>
                    <div className="text-xs text-muted"><span className="font-mono">{u.username}</span>{u.position ? ` · ${u.position}` : ''}</div>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {u.assignments.map((a) => (
                        <span key={`${a.role}@${a.domain}`} className="chip bg-accent/10 py-1 text-accent">
                          <ShieldCheck size={12} /> {a.role_name} · <span className="font-normal">{a.domain_label}</span>
                          {editable && canManageAt(perms, a.domain) && (
                            <button
                              className="ml-1 rounded-full hover:bg-danger/20 hover:text-danger"
                              title="Thu hồi"
                              aria-label="Thu hồi vai trò"
                              onClick={() => window.confirm(`Thu hồi “${a.role_name}” tại ${a.domain_label} của ${u.full_name}?`) &&
                                run(() => api(`/rbac/users/${u.id}/assignments?role=${encodeURIComponent(a.role)}&domain=${encodeURIComponent(a.domain)}`, { method: 'DELETE' }), 'Đã thu hồi vai trò')}
                            >
                              <X size={12} />
                            </button>
                          )}
                        </span>
                      ))}
                      {!u.assignments.length && <span className="text-xs text-danger">Chưa có vai trò</span>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap text-xs">
                    {u.is_active ? <span className="text-good">● Hoạt động</span> : <span className="text-danger">● Đã khoá</span>}
                    <div className="text-muted">PIN: {u.has_pin ? 'có' : 'chưa'}</div>
                  </td>
                  <td className="whitespace-nowrap">
                    {editable && (
                      <div className="flex justify-end gap-1">
                        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setModal({ type: 'grant', user: u })}><Plus size={12} /> Cấp vai trò</button>
                        <button className="btn-ghost px-2 py-1" title="Đặt lại mật khẩu / PIN" onClick={() => setModal({ type: 'cred', user: u })}><KeyRound size={14} /></button>
                        <button
                          className="btn-ghost px-2 py-1"
                          title={u.is_active ? 'Khoá tài khoản' : 'Mở khoá'}
                          onClick={() => run(() => api(`/rbac/users/${u.id}`, { method: 'PATCH', body: { is_active: !u.is_active } }), u.is_active ? 'Đã khoá tài khoản' : 'Đã mở khoá')}
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
        {!shown.length && <Empty>Không có tài khoản trong phạm vi quản lý</Empty>}
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
    name: role?.name || '', display_name: role?.display_name || '', description: role?.description || '',
    is_delegatable: role?.is_delegatable ?? true, permissions: role?.permissions || [],
  });
  const toggle = (code) => setF((x) => ({ ...x, permissions: x.permissions.includes(code) ? x.permissions.filter((c) => c !== code) : [...x.permissions, code] }));
  const groups = catalog.reduce((g, p) => ({ ...g, [p.resource]: [...(g[p.resource] || []), p] }), {});
  const system = role?.is_system;
  const submit = async () => {
    const body = system ? { display_name: f.display_name, description: f.description } : f;
    const ok = await run(
      () => api(isNew ? '/rbac/roles' : `/rbac/roles/${role.name}`, { method: isNew ? 'POST' : 'PATCH', body: isNew ? body : { ...body, name: undefined } }),
      isNew ? `Đã tạo vai trò ${f.display_name}` : 'Đã cập nhật vai trò',
    );
    if (ok) onClose();
  };
  return (
    <Modal open wide onClose={onClose} title={isNew ? 'Tạo vai trò' : `Sửa vai trò – ${role.display_name}`}
      footer={<><button className="btn-ghost" onClick={onClose}>Huỷ</button><button className="btn-primary" disabled={!f.display_name || (!system && !f.permissions.length) || (isNew && !/^[a-z][a-z0-9_]{2,40}$/.test(f.name))} onClick={submit}><Check size={15} /> Lưu</button></>}>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <label>Mã vai trò (không dấu)<input className="input mt-1 font-mono" disabled={!isNew} placeholder="vd: dieu_phoi_vien" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label>Tên hiển thị<input className="input mt-1" value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} /></label>
        <label className="sm:col-span-2">Mô tả<input className="input mt-1" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <label className="flex items-center gap-2 sm:col-span-2">
          <input type="checkbox" disabled={system} checked={f.is_delegatable} onChange={(e) => setF({ ...f, is_delegatable: e.target.checked })} />
          Cho phép chỉ huy cụm / lãnh đạo uỷ quyền vai trò này cho tài khoản con
        </label>
      </div>
      {system && <p className="mt-2 text-xs text-warn">Vai trò hệ thống: chỉ sửa được tên hiển thị và mô tả.</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(groups).map(([res, list]) => (
          <div key={res} className="rounded-lg border border-line p-2">
            <div className="mb-1 text-xs font-semibold uppercase text-muted">{RESOURCE_LABEL[res] || res}</div>
            {list.map((p) => (
              <label key={p.code} className="flex items-start gap-2 py-0.5 text-xs">
                <input type="checkbox" disabled={system} checked={f.permissions.includes(p.code)} onChange={() => toggle(p.code)} className="mt-0.5" />
                <span>{p.description}{!p.scopable && <span className="text-muted"> (toàn tỉnh)</span>}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
}

function RolesTab() {
  const canManageRoles = usePermission('rbac', 'manage', GLOBAL);
  const run = useMutate();
  const { data: roles = [] } = useRoles();
  const { data: catalog = [] } = useQuery({ queryKey: ['rbac-perms'], queryFn: () => api('/rbac/permissions'), staleTime: Infinity });
  const [modal, setModal] = useState(null);
  const resources = [...new Set(catalog.map((p) => p.resource))];

  return (
    <div className="flex flex-col gap-3">
      {canManageRoles && <div><button className="btn-primary" onClick={() => setModal({ role: null })}><Plus size={15} /> Tạo vai trò</button></div>}
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Vai trò</th>
              {resources.map((r) => <th key={r} className="text-center">{RESOURCE_LABEL[r]}</th>)}
              <th className="text-center">Người dùng</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.name}>
                <td className="min-w-[14rem]">
                  <div className="font-medium">{r.display_name}</div>
                  <div className="text-xs text-muted"><span className="font-mono">{r.name}</span>{r.description ? ` · ${r.description}` : ''}</div>
                  <div className="mt-1 flex gap-1">
                    {r.is_system && <span className="chip bg-panel2 text-muted">Hệ thống</span>}
                    {r.is_delegatable && <span className="chip bg-good/15 text-good">Uỷ quyền được</span>}
                  </div>
                </td>
                {resources.map((res) => {
                  const acts = r.permissions.includes('*.*')
                    ? ['*']
                    : r.permissions.filter((c) => c.startsWith(`${res}.`)).map((c) => c.split('.')[1]);
                  return (
                    <td key={res} className="text-center text-[11px]">
                      {acts[0] === '*' ? <span className="font-semibold text-accent">Tất cả</span> : acts.map((a) => ACTION_LABEL[a] || a).join(', ') || <span className="text-muted">–</span>}
                    </td>
                  );
                })}
                <td className="text-center font-mono">{r.user_count}</td>
                <td className="whitespace-nowrap">
                  {canManageRoles && r.name !== 'super_admin' && (
                    <div className="flex justify-end gap-1">
                      <button className="btn-ghost px-2 py-1" title="Sửa" onClick={() => setModal({ role: r })}><Pencil size={14} /></button>
                      {!r.is_system && (
                        <button className="btn-ghost px-2 py-1 text-danger" title="Xoá" onClick={() => window.confirm(`Xoá vai trò ${r.display_name}?`) && run(() => api(`/rbac/roles/${r.name}`, { method: 'DELETE' }), 'Đã xoá vai trò')}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Phạm vi được chọn khi <b>cấp vai trò cho người dùng</b>: toàn tỉnh, một cụm (địa bàn huyện cũ) hoặc một xã/phường.
        Quyền “(toàn tỉnh)” chỉ có hiệu lực khi cấp ở phạm vi toàn tỉnh.
      </p>
      {modal && <RoleModal role={modal.role} catalog={catalog} onClose={() => setModal(null)} />}
    </div>
  );
}

function AuditTab() {
  const { data = [] } = useQuery({ queryKey: ['rbac-audit'], queryFn: () => api('/rbac/audit') });
  return (
    <div className="card overflow-x-auto">
      <table className="table-base">
        <thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Tài khoản</th><th>Vai trò</th><th>Phạm vi</th></tr></thead>
        <tbody>
          {data.map((a) => (
            <tr key={a.id}>
              <td className="whitespace-nowrap font-mono text-xs">{dateTime(a.time)}</td>
              <td>{a.actor_name}</td>
              <td>{AUDIT_LABEL[a.action] || a.action}</td>
              <td className="font-mono text-xs">{a.target_user || '–'}</td>
              <td>{a.role || '–'}</td>
              <td className="text-xs">{a.domain_label || '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!data.length && <Empty>Chưa có thao tác phân quyền</Empty>}
    </div>
  );
}

export default function AccessControl() {
  const [tab, setTab] = useState('users');
  const perms = usePerms();
  const scopes = [...new Set(perms.filter((p) => (p.obj === 'user' || p.obj === '*') && (p.act === 'manage' || p.act === '*')).map((p) => p.dom))];
  const assignments = useStore((s) => s.auth?.user?.assignments || []);
  const label = (d) => assignments.find((a) => a.domain === d)?.domain_label || d;
  return (
    <div className="flex flex-col gap-3 p-3">
      <div>
        <h1 className="text-lg font-bold">Phân quyền & Tài khoản</h1>
        <p className="text-xs text-muted">
          RBAC theo phạm vi địa bàn (toàn tỉnh → cụm → xã/phường). Phạm vi bạn được quản lý:{' '}
          <b>{scopes.length ? scopes.map(label).join(', ') : 'chỉ xem'}</b>
          {hasPermission(perms, 'rbac', 'manage', GLOBAL) && ' · có quyền quản trị định nghĩa vai trò'}
        </p>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'users', label: 'Tài khoản', icon: Users },
          { value: 'roles', label: 'Vai trò & quyền', icon: ShieldCheck },
          { value: 'audit', label: 'Nhật ký phân quyền', icon: History },
        ]}
      />
      {tab === 'users' && <UsersTab />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  );
}
