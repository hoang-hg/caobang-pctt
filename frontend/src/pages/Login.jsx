import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldAlert,
  LogIn,
  Loader2,
  UserRound,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  AlertCircle,
  Building2,
  KeyRound,
  Smartphone,
} from 'lucide-react';
import { api } from '../api/client';
import { useStore } from '../app/store';
import { CodeInput, MfaSetup } from '../components/account/Mfa';

const REMEMBER_KEY = 'cb_pctt_saved_login';

/** Bước 2 của đăng nhập: nhập mã xác thực 2 lớp ("verify") hoặc cài đặt lần đầu khi vai trò bắt buộc ("setup"). */
function MfaStep({ mfa, onBack, onDone }) {
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (mfa.stage === 'setup') {
    return (
      <div className="mt-6 flex flex-col gap-3">
        <div className="rounded-xl border border-accent/30 bg-accent/10 p-3 text-xs leading-relaxed text-ink-2">
          <b className="text-ink">Vai trò của bạn bắt buộc xác thực 2 lớp.</b> Cài đặt một lần (khoảng 2 phút) để tiếp
          tục; phiên cài đặt hết hạn sau 5 phút.
        </div>
        <MfaSetup challenge={mfa.challenge} onDone={onDone} />
        <button type="button" className="text-xs text-muted hover:text-accent" onClick={() => onBack()}>
          ← Đăng nhập tài khoản khác
        </button>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onDone(await api('/auth/mfa/verify', { method: 'POST', body: { challenge: mfa.challenge, code } }));
    } catch (err) {
      if (err.status === 401 && /hết hạn/.test(err.message)) onBack(err.message);
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="mt-6 flex flex-col gap-4" onSubmit={submit}>
      <div className="flex items-start gap-2.5 text-sm text-ink-2">
        <Smartphone size={18} className="mt-0.5 shrink-0 text-accent" />
        <span>
          {recovery
            ? 'Nhập 1 mã khôi phục (dạng xxxx-xxxx) đã lưu khi bật xác thực 2 lớp. Mỗi mã chỉ dùng được 1 lần.'
            : 'Mở ứng dụng xác thực trên điện thoại, nhập mã 6 số của tài khoản PCTT Cao Bằng.'}
        </span>
      </div>
      <CodeInput key={String(recovery)} value={code} onChange={setCode} recovery={recovery} />
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs font-medium text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <button
        className="btn-primary justify-center rounded-xl py-2.5 text-sm font-bold"
        disabled={busy || (recovery ? code.replace(/[\s-]/g, '').length !== 8 : code.length !== 6)}
      >
        {busy ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />} XÁC NHẬN
      </button>
      <div className="flex items-center justify-between text-xs">
        <button type="button" className="text-accent hover:underline" onClick={() => { setRecovery(!recovery); setCode(''); setError(''); }}>
          {recovery ? 'Dùng mã 6 số' : 'Mất điện thoại? Dùng mã khôi phục'}
        </button>
        <button type="button" className="text-muted hover:text-ink" onClick={() => onBack()}>
          ← Quay lại
        </button>
      </div>
    </form>
  );
}

/**
 * Màn hình đăng nhập điều hành tác chiến PCTT & TKCN Cao Bằng.
 * Thiết kế bảo mật theo mô hình hệ thống quản trị trung ương:
 * - Không lộ danh sách tài khoản hay mật khẩu thử nghiệm công khai.
 * - Hỗ trợ đăng nhập linh hoạt bằng Tên đăng nhập (username) hoặc Email công vụ.
 * - Tự động ghi nhớ tài khoản theo tùy chọn của cán bộ.
 * - Phân cấp quyền tự động sau khi đăng nhập (Tổng hệ thống · Cấp Tỉnh · Cấp Xã).
 */
export default function Login() {
  const setAuth = useStore((s) => s.setAuth);

  const [username, setUsername] = useState(() => {
    try {
      return localStorage.getItem(REMEMBER_KEY) || '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(() => {
    try {
      return Boolean(localStorage.getItem(REMEMBER_KEY));
    } catch {
      return false;
    }
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mfa, setMfa] = useState(null); // { stage: 'verify' | 'setup', challenge }

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (!username.trim() || !password) return;

      setBusy(true);
      setError('');

      try {
        const cleanLogin = username.trim();
        const data = await api('/auth/login', {
          method: 'POST',
          body: { username: cleanLogin, password },
        });

        if (remember) {
          try {
            localStorage.setItem(REMEMBER_KEY, cleanLogin);
          } catch {
            /* ignore */
          }
        } else {
          try {
            localStorage.removeItem(REMEMBER_KEY);
          } catch {
            /* ignore */
          }
        }

        // Tài khoản có xác thực 2 lớp → bước 2; không thì cập nhật Auth Store (App.jsx tự chuyển hướng theo
        // ?next= hoặc /dashboard)
        if (data.mfa) setMfa({ stage: data.mfa, challenge: data.challenge });
        else setAuth(data);
      } catch (err) {
        setError(err.message || 'Tên đăng nhập hoặc mật khẩu không chính xác.');
      } finally {
        setBusy(false);
      }
    },
    [username, password, remember, setAuth]
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-bg via-bg to-panel/50 p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md">
        {/* Hộp đăng nhập chính */}
        <div className="card shadow-2xl border-line/80 bg-panel/95 backdrop-blur-md rounded-2xl p-6 sm:p-8">
          {/* Header & Logo Quốc huy / Ban chỉ huy */}
          <div className="flex flex-col items-center text-center pb-6 border-b border-line/60">
            <div className="relative mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-red-600 via-red-600 to-amber-600 text-white shadow-xl shadow-red-600/25 ring-4 ring-red-500/10">
              <ShieldAlert size={34} className="drop-shadow-sm" />
              <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-panel text-accent border border-line shadow-sm">
                <Building2 size={13} />
              </div>
            </div>

            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 font-bold tracking-wider text-[10px] uppercase mb-1">
              <span>Hệ thống chỉ huy tác chiến 24/7</span>
            </div>

            <h1 className="text-lg sm:text-xl font-extrabold text-ink tracking-tight">
              BCH PCTT & TKCN CAO BẰNG
            </h1>
            <p className="mt-1 text-xs text-muted max-w-xs leading-relaxed">
              Cổng đăng nhập xác thực tập trung & Điều hành tác chiến thiên tai đa cấp
            </p>
          </div>

          {mfa ? (
            <MfaStep
              mfa={mfa}
              onDone={(session) => setAuth({ token: session.token, user: session.user })}
              onBack={(message) => {
                setMfa(null);
                setPassword('');
                setError(message || '');
              }}
            />
          ) : (
          /* Form đăng nhập */
          <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-xl bg-danger/10 border border-danger/30 p-3 text-xs text-danger font-medium flex items-start gap-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
                <AlertCircle size={16} className="shrink-0 mt-0.5 text-danger" />
                <span className="flex-1 leading-relaxed">{error}</span>
              </div>
            )}

            {/* Input Tài khoản / Email */}
            <div>
              <label className="block text-xs font-semibold uppercase text-ink-2 mb-1.5">
                Tài khoản hoặc Email công vụ
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 pl-3.5 flex items-center text-muted">
                  <UserRound size={17} />
                </div>
                <input
                  type="text"
                  required
                  autoFocus={!username}
                  autoComplete="username"
                  placeholder="Nhập tên đăng nhập hoặc email..."
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input pl-10 py-2.5 text-sm rounded-xl font-medium focus:ring-2 focus:ring-accent/30 transition-all"
                />
              </div>
            </div>

            {/* Input Mật khẩu */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase text-ink-2">
                  Mật khẩu
                </label>
                <Link
                  to="/quen-mat-khau"
                  className="text-xs font-medium text-accent hover:text-accent/80 hover:underline transition-colors flex items-center gap-1"
                >
                  <KeyRound size={12} />
                  <span>Quên mật khẩu?</span>
                </Link>
              </div>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 pl-3.5 flex items-center text-muted">
                  <Lock size={17} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pl-10 pr-10 py-2.5 text-sm rounded-xl font-medium focus:ring-2 focus:ring-accent/30 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-muted hover:text-ink transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {/* Checkbox Ghi nhớ */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-muted hover:text-ink transition-colors">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-line text-accent focus:ring-accent/30 cursor-pointer"
                />
                <span>Ghi nhớ tài khoản trên thiết bị này</span>
              </label>
            </div>

            {/* Nút Đăng nhập */}
            <button
              type="submit"
              disabled={!username.trim() || !password || busy}
              className="btn-primary justify-center py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-accent/20 hover:shadow-accent/30 transition-all mt-1 group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? (
                <>
                  <Loader2 size={18} className="animate-spin mr-1" />
                  <span>ĐANG XÁC THỰC...</span>
                </>
              ) : (
                <>
                  <LogIn size={18} />
                  <span>ĐĂNG NHẬP HỆ THỐNG</span>
                  <ArrowRight size={16} className="ml-1 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>
          )}

          {/* Điều hướng ra Cổng công khai cho người dân */}
          <div className="mt-6 pt-4 border-t border-line/60 flex items-center justify-between text-xs text-muted">
            <Link
              to="/cong-khai"
              className="flex items-center gap-1.5 text-muted hover:text-accent font-medium transition-colors"
            >
              <ArrowLeft size={14} />
              <span>Cổng thông tin & Cứu hộ người dân</span>
            </Link>

            <span className="text-[11px] font-mono text-muted/70">v2.5 PCTT-CB</span>
          </div>
        </div>

        {/* Thông tin hỗ trợ bảo mật & phân quyền */}
        <div className="mt-4 rounded-xl bg-panel/60 border border-line/60 p-3.5 text-xs text-muted flex items-start gap-2.5 backdrop-blur-sm">
          <ShieldCheck size={18} className="text-accent shrink-0 mt-0.5" />
          <div className="text-[11px] leading-relaxed">
            <span className="font-semibold text-ink">Phân quyền đa cấp nghiêm ngặt:</span> Quyền hạn được xác thực tự động theo vai trò{' '}
            <span className="text-ink-2 font-medium">Tổng hệ thống</span>,{' '}
            <span className="text-ink-2 font-medium">Cấp Tỉnh</span> và{' '}
            <span className="text-ink-2 font-medium">Cấp Xã/Phường</span>. Cán bộ chưa có tài khoản vui lòng liên hệ Văn phòng BCH để được cấp quyền.
          </div>
        </div>
      </div>
    </div>
  );
}
