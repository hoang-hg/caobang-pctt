import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LogIn, LogOut, UserCircle2 } from 'lucide-react';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { ROLE } from '../../utils/labels';
import { useClickOutside } from '../../utils/useClickOutside';

/** Đăng nhập nhanh bằng tài khoản demo để thử quy trình Maker–Checker. */
export default function UserMenu() {
  const { auth, setAuth, toast } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));
  const { data: demo = [] } = useQuery({ queryKey: ['demo-accounts'], queryFn: () => api('/auth/demo-accounts'), staleTime: Infinity });

  const login = async (acc) => {
    try {
      const res = await api('/auth/login', { method: 'POST', body: { username: acc.username, password: acc.password } });
      setAuth(res);
      setOpen(false);
      toast({ tone: 'good', title: `Đăng nhập: ${res.user.full_name}`, body: ROLE[res.user.role] });
    } catch (e) {
      toast({ tone: 'danger', title: 'Đăng nhập thất bại', body: e.message });
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button className="btn-ghost" onClick={() => setOpen((o) => !o)}>
        {auth ? <UserCircle2 size={16} /> : <LogIn size={16} />}
        <span className="hidden max-w-[9rem] truncate lg:inline">{auth ? auth.user.full_name : 'Đăng nhập'}</span>
      </button>
      {open && (
        <div className="card absolute right-0 top-11 z-[1200] w-80 p-2 shadow-2xl">
          {auth && (
            <div className="mb-2 rounded-lg bg-panel2 p-2 text-sm">
              <div className="font-semibold">{auth.user.full_name}</div>
              <div className="text-xs text-muted">{auth.user.position}</div>
              <div className="mt-1 text-xs text-accent">{ROLE[auth.user.role]}</div>
            </div>
          )}
          <div className="px-1 pb-1 text-[11px] font-semibold uppercase text-muted">Tài khoản demo</div>
          {demo.map((a) => (
            <button key={a.username} className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-panel2" onClick={() => login(a)}>
              <span>
                <span className="block text-sm">{a.full_name}</span>
                <span className="block text-xs text-muted">{ROLE[a.role]}{a.pin ? ` · PIN ${a.pin}` : ''}</span>
              </span>
              <LogIn size={14} className="text-muted" />
            </button>
          ))}
          {auth && (
            <button className="btn-ghost mt-2 w-full justify-center" onClick={() => { setAuth(null); setOpen(false); }}>
              <LogOut size={14} /> Đăng xuất
            </button>
          )}
        </div>
      )}
    </div>
  );
}
