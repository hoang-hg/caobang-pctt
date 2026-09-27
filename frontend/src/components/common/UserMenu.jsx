import { lazy, Suspense, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut, UserCircle2, ShieldCheck, KeyRound, Globe, Smartphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ChangePasswordModal } from '../../pages/AccountPages';
import { useStore } from '../../app/store';
import { useClickOutside } from '../../utils/useClickOutside';

// Tách chunk: menu nằm trong gói tải đầu (cả cổng công khai) — chỉ tải phần xác thực 2 lớp khi mở
const MfaModal = lazy(() => import('../account/Mfa'));

/** Thông tin tài khoản đang đăng nhập + vai trò/phạm vi được giao. */
export default function UserMenu() {
  const { auth, setAuth } = useStore();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [mfaOpen, setMfaOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));
  const user = auth?.user;
  if (!user) return null;

  const logout = () => {
    setAuth(null);
    qc.clear();
  };

  return (
    <div className="relative" ref={ref}>
      <button className="btn-ghost" onClick={() => setOpen((o) => !o)}>
        <UserCircle2 size={16} />
        <span className="hidden max-w-[10rem] truncate lg:inline">{user.full_name}</span>
      </button>
      {open && (
        <div className="card absolute right-0 top-11 z-[1200] w-80 p-3 shadow-2xl">
          <div className="font-semibold">{user.full_name}</div>
          <div className="text-xs text-muted">{user.position} · <span className="font-mono">{user.username}</span></div>
          <div className="mt-2 text-[11px] font-semibold uppercase text-muted">Vai trò & phạm vi</div>
          <ul className="mt-1 flex flex-col gap-1">
            {user.assignments.map((a) => (
              <li key={`${a.role}@${a.domain}`} className="flex items-start gap-2 rounded-md bg-panel2 px-2 py-1 text-xs">
                <ShieldCheck size={14} className="mt-0.5 shrink-0 text-accent" />
                <span><b>{a.role_name}</b><br /><span className="text-muted">{a.domain_label}</span></span>
              </li>
            ))}
            {!user.assignments.length && <li className="text-xs text-danger">Chưa được cấp vai trò nào</li>}
          </ul>
          <div className="mt-2 text-[11px] text-muted">{user.permissions.length} quyền · PIN phê duyệt: {user.has_pin ? 'đã thiết lập' : 'chưa có'}</div>
          <div className="mt-1 text-[11px] text-muted">
            Xác thực 2 lớp:{' '}
            {user.mfa?.enabled ? <span className="font-semibold text-good">đang bật</span> : <span className="text-warn">chưa bật</span>}
          </div>
          {user.email && <div className="mt-1 text-[11px] text-muted">Email khôi phục: {user.email}</div>}
          <div className="mt-3 grid grid-cols-2 gap-1">
            <button className="btn-ghost justify-center text-xs" onClick={() => { setChanging(true); setOpen(false); }}><KeyRound size={13} /> Đổi mật khẩu</button>
            <button className="btn-ghost justify-center text-xs" onClick={() => { setMfaOpen(true); setOpen(false); }}><Smartphone size={13} /> Xác thực 2 lớp</button>
            <Link to="/cong-khai" className="btn-ghost col-span-2 justify-center text-xs" onClick={() => setOpen(false)}><Globe size={13} /> Cổng công khai</Link>
          </div>
          <button className="btn-ghost mt-1 w-full justify-center" onClick={logout}>
            <LogOut size={14} /> Đăng xuất / đổi tài khoản
          </button>
        </div>
      )}
      {changing && <ChangePasswordModal onClose={() => setChanging(false)} />}
      {mfaOpen && (
        <Suspense fallback={null}>
          <MfaModal onClose={() => setMfaOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
