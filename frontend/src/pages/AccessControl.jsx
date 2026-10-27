import { cloneElement, useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Building2, Crown, History, KeyRound, Lock, MapPin, Pencil, Search, ShieldCheck, ShieldOff, Unlock, UserPlus, UserRound, Users } from 'lucide-react';
import { api } from '../api/client';
import { useStore } from '../app/store';
import PageHeader from '../components/common/PageHeader';
import RoleTips from '../components/common/RoleTips';
import { PAGE } from '../components/layout/page';
import { Confirm, Empty, ErrorState, Modal, Segmented, Skeleton, StepChips, Tabs } from '../components/common/ui';
import { usePermission } from '../rbac/usePermission';
import { canManageAt, GLOBAL } from '../rbac/permissions';
import { dateTime } from '../utils/format';
import { PASSWORD_HINT, weakPassword } from './AccountPages';
import CitizenAccountsTab from './CitizenAccountsTab';

const AUDIT_LABEL = {
  'user.create': 'Tạo tài khoản',
  'user.update': 'Sửa tài khoản',
  'user.mfa_reset': 'Đặt lại xác thực 2 lớp',
  assign: 'Đổi cấp / địa bàn',
  'role.migrate': 'Chuyển sang phân quyền 3 cấp',
  grant: 'Cấp vai trò (cũ)',
  revoke: 'Thu hồi vai trò (cũ)',
  'role.create': 'Tạo vai trò (cũ)',
  'role.update': 'Sửa vai trò (cũ)',
  'role.delete': 'Xoá vai trò (cũ)',
};

/**
 * Phân quyền 3 cấp — mỗi cấp 1 vai trò, mỗi tài khoản 1 vai trò tại 1 phạm vi (backend: app/rbac/permissions.py).
 * Chỉ cấp trên quản lý tài khoản cấp dưới; cùng cấp không đổi mật khẩu / PIN / 2 lớp của nhau. Mỗi cấp giải thích bằng lời:
 * `who` dành cho ai, `can` làm được gì, `cannot` không làm được gì (thiết kế mục G — người không rành công nghệ tự đọc hiểu).
 */
export const TIER_CONFIG = {
  super_admin: {
    level: 1,
    name: 'Quản trị hệ thống',
    title: 'Cấp 1 · Quản trị hệ thống',
    icon: Crown,
    who: 'Đơn vị kỹ thuật vận hành hệ thống.',
    can: 'Mọi việc; tạo và quản lý tài khoản mọi cấp; cài nguồn dữ liệu, thiết bị đo.',
  },
  admin_tinh: {
    level: 2,
    name: 'Quản trị tỉnh',
    title: 'Cấp 2 · Quản trị tỉnh',
    icon: Building2,
    who: 'Lãnh đạo, trực ban Ban Chỉ huy PCTT & TKCN tỉnh.',
    can: 'Cả tỉnh: tiếp nhận SOS, điều động, soạn và duyệt cảnh báo (cần mã PIN, không tự duyệt lệnh mình soạn), kho, nhập dữ liệu, duyệt hồ sơ xã gửi; tạo, quản lý tài khoản cấp xã.',
  },
  admin_xa: {
    level: 3,
    name: 'Quản trị xã/phường',
    title: 'Cấp 3 · Quản trị xã/phường',
    icon: MapPin,
    who: 'Cán bộ UBND xã, phường.',
    can: 'Trong xã mình: tiếp nhận, xử lý SOS, duyệt phản ánh, xuất kho của xã, gửi dữ liệu chờ tỉnh duyệt.',
    cannot: 'Không quản lý tài khoản.',
  },
};
const NO_TIER = { level: 9, name: 'Chưa có cấp', title: 'Chưa có cấp', icon: ShieldOff, who: '', can: '' };
export const getTier = (role) => TIER_CONFIG[role] || NO_TIER;
const levelOf = (assignments) => Math.min(9, ...(assignments || []).map((a) => getTier(a.role).level));
const isProvinceLevel = (role) => getTier(role).level <= 2;

const usePerms = () => useStore((s) => s.auth?.user?.permissions || []);
const useMyLevel = () => levelOf(useStore((s) => s.auth?.user?.assignments));
const useScopes = () =>
  useQuery({ queryKey: ['rbac-scopes'], queryFn: () => api('/rbac/scopes'), staleTime: Infinity });
const useRoles = () => useQuery({ queryKey: ['rbac-roles'], queryFn: () => api('/rbac/roles') });

/** Chip cấp: biểu tượng + tên cấp, nền trung tính (cấp không phải mức rủi ro — không tô màu). */
function TierChip({ role }) {
  const t = getTier(role);
  return (
    <span className={clsx('chip whitespace-nowrap px-2 py-0.5 text-xs font-semibold', t.level === 9 ? 'bg-danger/10 text-danger' : 'bg-panel2 text-ink-2')}>
      <t.icon size={12} className="shrink-0" aria-hidden="true" />
      {t.name}{t.level < 9 && <span className="font-normal text-muted"> · Cấp {t.level}</span>}
    </span>
  );
}

/** Chọn cấp bằng thẻ có lời giải thích. Cấp 1 → mọi cấp; người khác → chỉ cấp DƯỚI mình (backend kiểm tra lại). */
function RoleChoice({ value, onChange }) {
  const myLevel = useMyLevel();
  const { data: roles = [], isLoading, isError, refetch } = useRoles();
  const list = roles.filter((r) => myLevel === 1 || (r.level > myLevel && r.is_delegatable));
  if (isLoading) return <Skeleton height={120} />;
  if (isError && !roles.length) return <ErrorState onRetry={() => refetch()}>Không tải được danh sách cấp tài khoản</ErrorState>;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">Cấp của tài khoản</legend>
      {list.map((r) => {
        const t = getTier(r.name);
        return (
          <label
            key={r.name}
            className={clsx('tap flex cursor-pointer items-start gap-3 rounded-lg border p-3', value === r.name ? 'border-accent bg-accent/5' : 'border-line hover:border-accent')}
          >
            <input type="radio" name="cap-tai-khoan" className="mt-1" checked={value === r.name} onChange={() => onChange(r.name)} />
            <span className="icon-tile mt-0.5 h-10 w-10" aria-hidden="true"><t.icon size={20} strokeWidth={1.75} /></span>
            <span className="min-w-0 text-sm">
              <b className="block">{t.name} <span className="font-normal text-muted">· Cấp {t.level}</span></b>
              <span className="block text-ink-2">Dành cho: {t.who}</span>
              <span className="block text-ink-2">Làm được: {t.can}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

/** Phạm vi theo cấp: Cấp 1–2 toàn tỉnh (cố định); Cấp 3 chọn đúng 1 xã/phường trong phạm vi bạn quản lý. */
function ScopePicker({ role, value, onChange }) {
  const perms = usePerms();
  const { data } = useScopes();
  if (!role) return null;
  if (isProvinceLevel(role)) {
    return <p className="rounded-lg bg-panel2 px-3 py-2 text-sm">Địa bàn: <b>Toàn tỉnh Cao Bằng</b></p>;
  }
  const communes = (data?.communes || [])
    .filter((c) => canManageAt(perms, c.domain))
    .sort((a, b) => a.label.localeCompare(b.label, 'vi'));
  return (
    <label className="flex flex-col gap-1 text-sm">
      Xã/phường phụ trách
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— Chọn xã/phường —</option>
        {communes.map((c) => (
          <option key={c.domain} value={c.domain}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
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
const USERNAME_RE = /^[a-z0-9._-]{3,40}$/;
const STEPS = ['Cấp & địa bàn', 'Thông tin cán bộ', 'Đăng nhập', 'Xem lại'];

/** Ô nhập kèm một dòng hướng dẫn / báo sai ngay dưới ô (gắn vào ô bằng aria-describedby — tên ô chỉ là nhãn). */
function Field({ label, hint, error, children }) {
  const id = useId();
  const note = error || hint;
  return (
    <div className="flex flex-col gap-1 text-sm">
      <label className="flex flex-col gap-1">
        {label}
        {cloneElement(children, { 'aria-describedby': note ? id : undefined, 'aria-invalid': error ? true : undefined })}
      </label>
      {note && <span id={id} className={error ? 'text-xs font-medium text-danger' : 'text-xs text-muted'}>{note}</span>}
    </div>
  );
}

/** Tạo tài khoản từng bước: cấp & địa bàn → thông tin cán bộ → đăng nhập → xem lại (nói rõ việc sẽ xảy ra) → tạo. */
function CreateUserModal({ onClose }) {
  const run = useMutate();
  const { data: scopes } = useScopes();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ username: '', full_name: '', position: '', email: '', password: '', pin: '', role: '', domain: '' });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const province = isProvinceLevel(f.role);
  const domain = province ? GLOBAL : f.domain;
  const place = province ? 'toàn tỉnh Cao Bằng' : scopes?.communes?.find((c) => c.domain === f.domain)?.label || '';
  const errs = {
    email: f.email && !EMAIL_RE.test(f.email) ? 'Email chưa đúng dạng (VD canbo@caobang.gov.vn)' : '',
    username: f.username && !USERNAME_RE.test(f.username) ? 'Chỉ chữ thường không dấu, số, dấu . _ - (3–40 ký tự)' : '',
    password: f.password && weakPassword(f.password) ? PASSWORD_HINT : '',
    pin: province && f.pin && !PIN_RE.test(f.pin) ? 'Mã PIN gồm 4–8 chữ số' : '',
  };
  const ok = [
    !!f.role && !!domain,
    f.full_name.trim().length > 1 && !errs.email,
    USERNAME_RE.test(f.username) && !weakPassword(f.password) && !errs.pin,
    true,
  ];
  const missing = [
    !f.role ? 'chọn cấp' : !domain ? 'chọn xã/phường' : '',
    f.full_name.trim().length < 2 ? 'ghi họ tên' : errs.email ? 'sửa email' : '',
    !f.username ? 'ghi tên đăng nhập' : errs.username ? 'sửa tên đăng nhập' : !f.password ? 'ghi mật khẩu ban đầu' : errs.password ? 'mật khẩu đủ mạnh' : errs.pin ? 'sửa mã PIN' : '',
    '',
  ][step];

  const submit = async () => {
    setBusy(true);
    const done = await run(
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
    );
    setBusy(false);
    if (done) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Tạo tài khoản công vụ"
      footer={
        <>
          {step > 0 ? (
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => setStep(step - 1)}>Quay lại</button>
          ) : (
            <button type="button" className="btn-ghost" onClick={onClose}>Huỷ</button>
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn-primary" disabled={!ok[step]} title={missing ? `Còn thiếu: ${missing}` : undefined} onClick={() => setStep(step + 1)}>
              Tiếp: {STEPS[step + 1].toLowerCase()}
            </button>
          ) : (
            <button type="button" className="btn-primary" disabled={busy || !ok.every(Boolean)} onClick={submit}>
              <UserPlus size={15} /> Tạo tài khoản
            </button>
          )}
        </>
      }
    >
      <StepChips steps={STEPS} step={step} onStep={setStep} done={ok} disabled={busy} />
      {step === 0 && (
        <div className="flex flex-col gap-3">
          <RoleChoice value={f.role} onChange={(v) => setF((x) => ({ ...x, role: v }))} />
          <ScopePicker role={f.role} value={f.domain} onChange={(v) => setF((x) => ({ ...x, domain: v }))} />
        </div>
      )}
      {step === 1 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Họ và tên cán bộ">
            <input className="input" placeholder="VD: Lục Văn Xã" value={f.full_name} onChange={set('full_name')} />
          </Field>
          <Field label="Chức vụ / đơn vị (không bắt buộc)" hint="Chỉ để hiện tên — quyền do cấp quyết định">
            <input className="input" placeholder="VD: Phó Chủ tịch UBND xã Cô Ba" value={f.position} onChange={set('position')} />
          </Field>
          <Field label="Email công vụ (không bắt buộc)" hint="Để người dùng tự lấy lại mật khẩu khi quên" error={errs.email}>
            <input className="input" type="email" placeholder="VD: canbo@caobang.gov.vn" value={f.email} onChange={set('email')} />
          </Field>
        </div>
      )}
      {step === 2 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tên đăng nhập" hint="Chữ thường không dấu, VD admin.coba, nguyenvan.a" error={errs.username}>
            <input className="input font-mono" autoComplete="off" value={f.username} onChange={set('username')} />
          </Field>
          <Field label="Mật khẩu ban đầu" hint={PASSWORD_HINT} error={errs.password}>
            <input className="input" type="password" autoComplete="new-password" value={f.password} onChange={set('password')} />
          </Field>
          {province && (
            <Field label="Mã PIN duyệt cảnh báo (không bắt buộc)" hint="4–8 chữ số — chỉ cấp cho lãnh đạo được giao duyệt lệnh cảnh báo" error={errs.pin}>
              <input className="input font-mono" inputMode="numeric" autoComplete="off" value={f.pin} onChange={set('pin')} />
            </Field>
          )}
        </div>
      )}
      {step === 3 && (
        <div className="flex flex-col gap-3 text-sm">
          <p className="rounded-lg bg-panel2 p-3">
            Tạo tài khoản <b className="font-mono">{f.username}</b> cho <b>{f.full_name}</b>
            {f.position ? ` (${f.position})` : ''} — <b>{getTier(f.role).name}</b>, {place}
            {province && f.pin ? ', có mã PIN duyệt cảnh báo' : ''}.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-ink-2">
            <li>Người này đăng nhập bằng mật khẩu ban đầu bạn giao, lần đầu phải đổi sang mật khẩu của riêng mình.</li>
            <li>Giao mật khẩu tận tay hoặc qua điện thoại — không gửi qua nhóm chat.</li>
            <li>Tài khoản này làm được: {getTier(f.role).can}</li>
          </ul>
        </div>
      )}
      {missing && <p className="mt-3 text-xs text-muted">Còn thiếu: {missing}.</p>}
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
  const losesPin = user.has_pin && role && !isProvinceLevel(role);
  const submit = async () => {
    if (await run(() => api(`/rbac/users/${user.id}/assignment`, { method: 'PUT', body: { role, domain } }), `Đã đổi ${user.full_name} sang ${getTier(role).name}`)) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Đổi cấp / địa bàn – ${user.full_name}`}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button type="button" className="btn-primary" disabled={!role || !domain || unchanged} onClick={submit}>
            <Pencil size={15} /> Đổi cấp
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-ink-2">
          Hiện tại: <b className="text-ink">{getTier(cur?.role).name}</b>
          {cur && ` · ${cur.domain_label}`}
        </p>
        <RoleChoice value={role} onChange={setRole} />
        <ScopePicker role={role} value={dom} onChange={setDom} />
        <p className="rounded-lg bg-panel2 p-3 text-ink-2">
          Bấm <b>Đổi cấp</b>: cấp mới thay cấp hiện tại (mỗi tài khoản một cấp); {user.full_name} bị đăng xuất trên mọi máy và đăng nhập lại với
          quyền mới.{losesPin ? ' Chuyển xuống cấp xã sẽ xoá mã PIN duyệt cảnh báo.' : ''}
        </p>
      </div>
    </Modal>
  );
}

/** Đặt lại mật khẩu / mã PIN: hậu quả ghi ngay trên nút và câu trước nút (mật khẩu → đăng xuất mọi máy, phải đổi lần tới). */
function CredentialsModal({ user, onClose }) {
  const run = useMutate();
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const canApprove = (user.level ?? 9) <= 2;
  const action = password && pin ? 'Đặt lại mật khẩu và mã PIN' : pin ? 'Đổi mã PIN' : 'Đặt lại mật khẩu';
  const submit = async () => {
    const body = { ...(password ? { password } : {}), ...(pin ? { pin } : {}) };
    if (await run(() => api(`/rbac/users/${user.id}`, { method: 'PATCH', body }), `Đã ${action.toLowerCase()} cho ${user.full_name}`)) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={canApprove ? `Đặt lại mật khẩu / mã PIN – ${user.full_name}` : `Đặt lại mật khẩu – ${user.full_name}`}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button
            type="button"
            className="btn-primary"
            disabled={(!password && !pin) || (password && weakPassword(password)) || (pin && !PIN_RE.test(pin))}
            onClick={submit}
          >
            <KeyRound size={15} /> {action}
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Mật khẩu mới" hint={PASSWORD_HINT} error={password && weakPassword(password) ? PASSWORD_HINT : ''}>
          <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {canApprove && (
          <Field label="Mã PIN duyệt cảnh báo mới" hint="4–8 chữ số — để trống nếu không đổi" error={pin && !PIN_RE.test(pin) ? 'Mã PIN gồm 4–8 chữ số' : ''}>
            <input className="input font-mono" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} />
          </Field>
        )}
      </div>
      {(password || pin) && (
        <ul className="mt-3 list-disc space-y-1 rounded-lg bg-panel2 p-3 pl-7 text-sm text-ink-2">
          {password && <li>{user.full_name} bị đăng xuất ngay trên mọi máy, đăng nhập lại bằng mật khẩu mới và phải đổi sang mật khẩu riêng.</li>}
          {password && <li>Giao mật khẩu mới tận tay hoặc qua điện thoại — không gửi qua nhóm chat.</li>}
          {pin && <li>Mã PIN cũ hết hiệu lực ngay — duyệt lệnh cảnh báo phải dùng mã PIN mới.</li>}
        </ul>
      )}
    </Modal>
  );
}

function UsersTab() {
  const perms = usePerms();
  const me = useStore((s) => s.auth?.user);
  const myLevel = useMyLevel();
  const run = useMutate();
  const canManage = usePermission('user', 'manage');
  const { data: users = [], isLoading, isError, refetch } = useQuery({ queryKey: ['rbac-users'], queryFn: () => api('/rbac/users') });
  const [q, setQ] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);

  const shown = users.filter((u) => {
    const text = `${u.full_name} ${u.username} ${u.email || ''} ${u.position || ''} ${u.assignments
      .map((a) => `${a.role_name} ${a.domain_label}`)
      .join(' ')}`.toLowerCase();
    if (q && !text.includes(q.toLowerCase())) return false;
    return levelFilter === 'all' || (u.level ?? 9) === Number(levelFilter);
  });
  const count = (lv) => users.filter((u) => (u.level ?? 9) === lv).length;

  // Chỉ cấp trên quản lý tài khoản cấp dưới (cùng cấp không quản lý nhau) — backend kiểm tra lại
  const manages = (u) =>
    myLevel === 1 ||
    (u.assignments.length
      ? (u.level ?? 9) > myLevel && u.assignments.every((a) => canManageAt(perms, a.domain))
      : u.created_by === me?.id);
  const confirm = async (fn, ok) => {
    setBusy(true);
    await run(fn, ok);
    setBusy(false);
    setModal(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="3 cấp tài khoản" className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {Object.values(TIER_CONFIG).map((t) => (
          <div key={t.level} className="card flex flex-col gap-1 p-3.5">
            <h3 className="flex items-center gap-2 font-semibold">
              <span className="icon-tile h-8 w-8" aria-hidden="true"><t.icon size={16} strokeWidth={1.75} /></span>
              {t.name} <span className="text-sm font-normal text-muted">· Cấp {t.level}</span>
            </h3>
            <p className="text-sm text-ink-2"><b className="font-medium text-ink">Dành cho:</b> {t.who}</p>
            <p className="text-sm text-ink-2"><b className="font-medium text-ink">Làm được:</b> {t.can}</p>
            {t.cannot && <p className="text-sm text-ink-2"><b className="font-medium text-ink">Không:</b> {t.cannot}</p>}
          </div>
        ))}
      </section>
      <p className="-mt-1 text-sm text-ink-2">
        Mỗi tài khoản đúng một cấp. Chỉ cấp trên đổi mật khẩu, mã PIN, xác thực 2 lớp, khoá hoặc đổi cấp của tài khoản cấp dưới — cùng cấp không quản lý nhau.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] max-w-md flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              className="input pl-9"
              aria-label="Tìm tài khoản"
              placeholder="Tìm theo tên, tài khoản, chức vụ, xã…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Segmented
            label="Lọc theo cấp"
            value={levelFilter}
            onChange={setLevelFilter}
            options={[
              { value: 'all', label: `Tất cả (${users.length})` },
              { value: '1', label: `Hệ thống (${count(1)})`, short: `Cấp 1 (${count(1)})` },
              { value: '2', label: `Tỉnh (${count(2)})`, short: `Cấp 2 (${count(2)})` },
              { value: '3', label: `Xã/phường (${count(3)})`, short: `Cấp 3 (${count(3)})` },
            ]}
          />
        </div>

        {canManage && (
          <button type="button" className="btn-primary" onClick={() => setModal({ type: 'create' })}>
            <UserPlus size={15} /> Tạo tài khoản công vụ
          </button>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Cán bộ</th>
              <th>Cấp</th>
              <th>Địa bàn</th>
              <th>Tình trạng</th>
              <th className="text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => {
              const editable = canManage && manages(u) && u.id !== me?.id;
              const a = u.assignments[0];
              return (
                <tr key={u.id} className={clsx(!u.is_active && 'bg-panel2/60')}>
                  <td>
                    <div className="flex items-center gap-1.5 font-semibold text-ink">
                      <span>{u.full_name}</span>
                      {u.id === me?.id && <span className="chip bg-accent/15 px-1.5 py-0 text-[11px] text-accent">Bạn</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      <span className="font-mono text-ink-2">{u.username}</span>
                      {u.position && <span> · {u.position}</span>}
                    </div>
                    {u.email && <div className="text-xs text-muted">{u.email}</div>}
                  </td>
                  <td><TierChip role={a?.role} /></td>
                  <td className="text-sm">{a?.domain_label || 'Chưa gán'}</td>
                  <td className="whitespace-nowrap text-xs">
                    {u.is_active ? (
                      <div className="font-semibold text-good">Đang hoạt động</div>
                    ) : (
                      <div className="flex items-center gap-1 font-semibold text-danger"><Lock size={12} aria-hidden="true" /> Đã khoá</div>
                    )}
                    {(u.level ?? 9) <= 2 && <div className="text-muted">Mã PIN duyệt cảnh báo: {u.has_pin ? 'đã cấp' : 'chưa cấp'}</div>}
                    <div className="text-muted">Xác thực 2 lớp: {u.mfa_enabled ? 'đã bật' : 'chưa bật'}</div>
                    {u.must_change_password && (
                      <div className="font-medium text-warn" title="Mật khẩu do cấp trên đặt — người dùng phải đổi ở lần đăng nhập tới">Chờ tự đổi mật khẩu</div>
                    )}
                  </td>
                  <td className="text-right">
                    {editable && (
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setModal({ type: 'assign', user: u })}>
                          <Pencil size={13} /> Đổi cấp
                        </button>
                        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setModal({ type: 'cred', user: u })}>
                          <KeyRound size={13} /> {(u.level ?? 9) <= 2 ? 'Mật khẩu / PIN' : 'Đặt lại mật khẩu'}
                        </button>
                        {u.mfa_enabled && (
                          <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setModal({ type: 'mfa', user: u })}>
                            <ShieldOff size={13} /> Đặt lại 2 lớp
                          </button>
                        )}
                        {u.is_active ? (
                          <button type="button" className="btn-ghost px-2 py-1 text-xs text-danger" onClick={() => setModal({ type: 'lock', user: u })}>
                            <Lock size={13} /> Khoá
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-ghost px-2 py-1 text-xs"
                            onClick={() => run(() => api(`/rbac/users/${u.id}`, { method: 'PATCH', body: { is_active: true } }), `Đã mở khoá tài khoản ${u.full_name}`)}
                          >
                            <Unlock size={13} /> Mở khoá
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!shown.length && (isLoading ? (
          <Skeleton height={160} className="m-3" />
        ) : isError && !users.length ? (
          <ErrorState className="m-3" onRetry={() => refetch()}>Không tải được danh sách tài khoản</ErrorState>
        ) : (
          <Empty art={q ? 'tim' : undefined}>Không tìm thấy tài khoản phù hợp trong phạm vi quản lý</Empty>
        ))}
      </div>

      {modal?.type === 'create' && <CreateUserModal onClose={() => setModal(null)} />}
      {modal?.type === 'assign' && <AssignmentModal user={modal.user} onClose={() => setModal(null)} />}
      {modal?.type === 'cred' && <CredentialsModal user={modal.user} onClose={() => setModal(null)} />}
      {modal?.type === 'lock' && (
        <Confirm
          title={`Khoá tài khoản của ${modal.user.full_name}?`}
          confirmLabel="Khoá tài khoản"
          danger
          busy={busy}
          onClose={() => setModal(null)}
          onConfirm={() => confirm(() => api(`/rbac/users/${modal.user.id}`, { method: 'PATCH', body: { is_active: false } }), `Đã khoá tài khoản ${modal.user.full_name}`)}
        >
          <p>{modal.user.full_name} bị đăng xuất ngay trên mọi máy và không đăng nhập được cho tới khi được mở khoá.</p>
          <p>Phiếu cứu hộ, nhật ký do người này làm vẫn giữ nguyên. Dùng khi mất máy, nghỉ việc, chuyển công tác.</p>
        </Confirm>
      )}
      {modal?.type === 'mfa' && (
        <Confirm
          title={`Đặt lại xác thực 2 lớp của ${modal.user.full_name}?`}
          confirmLabel="Đặt lại xác thực 2 lớp"
          danger
          busy={busy}
          onClose={() => setModal(null)}
          onConfirm={() => confirm(() => api(`/rbac/users/${modal.user.id}/mfa/reset`, { method: 'POST' }), 'Đã đặt lại xác thực 2 lớp')}
        >
          <p>Chỉ làm sau khi đã gọi điện xác minh đúng người yêu cầu (mất điện thoại, hết mã khôi phục).</p>
          <p>{modal.user.full_name} bị đăng xuất trên mọi máy; lần đăng nhập tới dùng mật khẩu như cũ, cấp bắt buộc xác thực 2 lớp thì phải cài lại.</p>
        </Confirm>
      )}
    </div>
  );
}

/** 3 cấp cố định — chỉ xem (không tạo / sửa vai trò). */
function RolesTab() {
  const { data: roles = [] } = useRoles();
  const { data: catalog = [] } = useQuery({ queryKey: ['rbac-perms'], queryFn: () => api('/rbac/permissions') });
  // Theo thứ tự danh mục quyền (giám sát → SOS → điều động → … → dữ liệu), không theo mã
  const inCatalogOrder = (codes) => catalog.filter((p) => codes.includes(p.code)).map((p) => p.description);
  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-3xl text-sm text-ink-2">
        Hệ thống có đúng 3 cấp cố định — mỗi tài khoản một cấp. Chức vụ (lãnh đạo, trực ban, cán bộ…) chỉ ghi ở hồ sơ tài khoản;
        quyền do cấp quyết định, nhờ vậy nhật ký luôn rõ ai làm gì với tư cách gì.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        {roles.map((r) => (
          <div key={r.name} className="card flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <TierChip role={r.name} />
              <span className="text-xs text-muted">{r.user_count} tài khoản</span>
            </div>
            <p className="text-sm text-ink-2">{r.description}</p>
            <p className="text-sm text-ink-2">
              Địa bàn: <b className="text-ink">{r.scope_kind === 'tinh' ? 'Toàn tỉnh' : 'Đúng 1 xã/phường'}</b>
            </p>
            <ul className="scroll-thin max-h-56 list-disc space-y-0.5 overflow-y-auto pl-4 text-xs text-ink-2">
              {r.permissions.includes('*.*') ? <li>Toàn quyền</li> : inCatalogOrder(r.permissions).map((d) => <li key={d}>{d}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditTab() {
  const { data = [] } = useQuery({ queryKey: ['rbac-audit'], queryFn: () => api('/rbac/audit') });
  return (
    <div className="card overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th>Lúc</th>
            <th>Người làm</th>
            <th>Việc</th>
            <th>Tài khoản bị tác động</th>
            <th>Cấp</th>
            <th>Địa bàn</th>
          </tr>
        </thead>
        <tbody>
          {data.map((a) => (
            <tr key={a.id}>
              <td className="num whitespace-nowrap text-xs">{dateTime(a.time)}</td>
              <td className="font-semibold text-ink">{a.actor_name}</td>
              <td>{AUDIT_LABEL[a.action] || a.action}</td>
              <td className="font-mono text-xs">{a.target_user || '–'}</td>
              <td>{a.role ? <TierChip role={a.role} /> : '–'}</td>
              <td className="text-sm text-ink-2">{a.domain_label || a.domain || '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!data.length && <Empty>Chưa có thao tác phân quyền nào</Empty>}
    </div>
  );
}

export default function AccessControl() {
  const [tab, setTab] = useState('users');
  const mine = useStore((s) => s.auth?.user?.assignments?.[0]);
  const canCitizens = usePermission('citizen', 'view');
  return (
    <div className={`${PAGE} pb-8`}>
      <PageHeader
        title="Phân quyền & tài khoản"
        short="Phân quyền"
        meta={[
          <span key="ban">Bạn: <b className="font-semibold text-ink-2">{getTier(mine?.role).name}</b>{mine && ` · ${mine.domain_label}`}</span>,
        ]}
        description="Ai được làm gì trong hệ thống: 3 cấp, mỗi tài khoản một cấp. Chỉ cấp trên tạo và quản lý tài khoản cấp dưới."
      />

      <RoleTips page="phan-quyen" />

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'users', label: 'Tài khoản', icon: Users },
          { value: 'roles', label: '3 cấp & quyền hạn', short: '3 cấp', icon: ShieldCheck },
          { value: 'audit', label: 'Nhật ký thao tác', short: 'Nhật ký', icon: History },
          // Tài khoản người dân của cổng (Đ5) — chỉ cán bộ cấp tỉnh (quyền citizen.view)
          ...(canCitizens ? [{ value: 'citizens', label: 'Tài khoản người dân', short: 'Người dân', icon: UserRound }] : []),
        ]}
      />

      {tab === 'users' && <UsersTab />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'citizens' && canCitizens && <CitizenAccountsTab />}
    </div>
  );
}
