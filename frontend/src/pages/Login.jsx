import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ShieldAlert, LogIn, Loader2, UserRound } from 'lucide-react';
import { api } from '../api/client';
import { useStore } from '../app/store';

/** Màn hình đăng nhập — bắt buộc trước khi vào hệ thống điều hành. */
export default function Login() {
  const setAuth = useStore((s) => s.setAuth);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: demo } = useQuery({ queryKey: ['demo-accounts'], queryFn: () => api('/auth/demo-accounts'), retry: 0, staleTime: Infinity });

  const login = async (u, p) => {
    setBusy(true);
    setError('');
    try {
      setAuth(await api('/auth/login', { method: 'POST', body: { username: u, password: p } }));
      // chuyển trang do route /dang-nhap (AfterLogin) đảm nhận theo ?next=
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-bg p-4">
      <div className="grid w-full max-w-4xl gap-4 md:grid-cols-[1fr_1.1fr]">
        <form
          className="card flex flex-col gap-3 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            login(username, password);
          }}
        >
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-danger text-white"><ShieldAlert size={24} /></div>
            <div>
              <div className="font-bold">BCH PCTT & TKCN tỉnh Cao Bằng</div>
              <div className="text-xs text-muted">Hệ thống điều hành phòng chống thiên tai</div>
            </div>
          </div>
          <label className="text-sm">
            Tên đăng nhập
            <input className="input mt-1" autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="text-sm">
            Mật khẩu
            <input className="input mt-1" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
          <button className="btn-primary justify-center py-2" disabled={!username || !password || busy}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />} Đăng nhập
          </button>
          <div className="flex justify-between text-xs">
            <Link to="/quen-mat-khau" className="text-accent hover:underline">Quên mật khẩu?</Link>
            <Link to="/" className="text-muted hover:underline">← Cổng thông tin công khai</Link>
          </div>
          <p className="text-xs text-muted">Quyền thao tác được cấp theo vai trò và phạm vi địa bàn (toàn tỉnh, cụm hoặc xã/phường).</p>
        </form>

        {demo?.length > 0 && (
          <div className="card p-4">
            <div className="mb-2 text-sm font-semibold">Tài khoản demo — bấm để đăng nhập nhanh</div>
            <div className="flex flex-col gap-1.5">
              {demo.map((a) => (
                <button
                  key={a.username}
                  type="button"
                  disabled={busy}
                  onClick={() => login(a.username, a.password)}
                  className="flex items-center gap-3 rounded-lg border border-line p-2 text-left hover:border-accent hover:bg-panel2"
                >
                  <UserRound size={18} className="shrink-0 text-accent" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{a.full_name} <span className="font-mono text-xs text-muted">({a.username})</span></span>
                    <span className="block truncate text-xs text-muted">{a.role_name} · {a.domain_label}{a.pin ? ` · PIN ${a.pin}` : ''}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
