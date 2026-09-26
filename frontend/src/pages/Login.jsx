import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ShieldAlert, LogIn, Loader2, UserRound, Eye, EyeOff, KeyRound, Globe, ArrowLeft, ShieldCheck } from 'lucide-react';
import { api } from '../api/client';
import { useStore } from '../app/store';

/** Màn hình đăng nhập — bắt buộc trước khi vào hệ thống điều hành. */
export default function Login() {
  const setAuth = useStore((s) => s.setAuth);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="flex min-h-full items-center justify-center bg-bg p-4 sm:p-6">
      <div className="grid w-full max-w-4xl gap-4 md:grid-cols-[1.1fr_1.2fr] items-start">
        {/* Form đăng nhập */}
        <form
          className="card flex flex-col gap-4 p-6 sm:p-8 shadow-xl border-line"
          onSubmit={(e) => {
            e.preventDefault();
            login(username, password);
          }}
        >
          <div className="flex items-center gap-3 pb-3 border-b border-line/60">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-red-600 to-red-700 text-white shadow-md shadow-red-600/30">
              <ShieldAlert size={26} />
            </div>
            <div>
              <div className="font-bold text-base text-ink">BCH PCTT & TKCN Cao Bằng</div>
              <div className="text-xs text-muted">Hệ thống điều hành tác chiến điện tử</div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-muted mb-1">
              Tên đăng nhập
            </label>
            <input
              className="input py-2"
              autoFocus
              autoComplete="username"
              placeholder="Nhập tài khoản công vụ..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold uppercase text-muted">
                Mật khẩu
              </label>
              <Link to="/quen-mat-khau" className="text-xs text-accent hover:underline">
                Quên mật khẩu?
              </Link>
            </div>
            <div className="relative">
              <input
                className="input py-2 pr-10"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Nhập mật khẩu..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-2.5 top-2.5 text-muted hover:text-ink transition-colors"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-danger/10 border border-danger/25 px-3 py-2 text-xs font-medium text-danger">
              {error}
            </div>
          )}

          <button
            className="btn-primary justify-center py-2.5 shadow-md text-sm font-semibold mt-1"
            disabled={!username || !password || busy}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
            <span>Đăng nhập hệ thống</span>
          </button>

          <div className="flex items-center justify-between pt-2 border-t border-line/60 text-xs">
            <Link to="/cong-khai" className="text-muted hover:text-accent flex items-center gap-1">
              <ArrowLeft size={13} /> Cổng công khai cho người dân
            </Link>
          </div>

          <div className="rounded-xl bg-panel2/60 p-3 text-[11px] text-muted flex items-start gap-2">
            <ShieldCheck size={16} className="text-accent shrink-0 mt-0.5" />
            <span>Phân quyền tác chiến (RBAC) được quản lý nghiêm ngặt theo vai trò và phạm vi lãnh thổ được giao.</span>
          </div>
        </form>

        {/* Cột tài khoản Demo */}
        {demo?.length > 0 && (
          <div className="card p-5 sm:p-6 shadow-md border-line">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-line/60">
              <div className="text-sm font-bold text-ink">Tài khoản thử nghiệm (Demo)</div>
              <span className="chip bg-accent/15 text-accent text-[11px]">Bấm để đăng nhập</span>
            </div>
            <p className="text-xs text-muted mb-3">Chọn vai trò dưới đây để trải nghiệm phân quyền theo chức danh và địa bàn tương ứng:</p>
            <div className="flex flex-col gap-2 max-h-[460px] overflow-y-auto pr-1 scroll-thin">
              {demo.map((a) => (
                <button
                  key={a.username}
                  type="button"
                  disabled={busy}
                  onClick={() => login(a.username, a.password)}
                  className="flex items-center gap-3 rounded-xl border border-line p-2.5 text-left hover:border-accent hover:bg-panel2 transition-all group"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent group-hover:bg-accent group-hover:text-white transition-colors">
                    <UserRound size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-ink group-hover:text-accent truncate">{a.full_name}</span>
                      <span className="font-mono text-xs text-muted">@{a.username}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted truncate mt-0.5">
                      <span className="chip text-[10px] py-0 px-1.5 bg-panel2 text-ink-2 font-medium">{a.role_name}</span>
                      <span className="truncate">{a.domain_label}</span>
                      {a.pin && <span className="font-mono text-[10px] text-accent">PIN: {a.pin}</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
