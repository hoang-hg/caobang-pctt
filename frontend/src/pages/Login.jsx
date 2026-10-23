import { lazy, Suspense, useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck, LogIn, Loader2, UserRound, Lock, Eye, EyeOff, AlertCircle, KeyRound, Smartphone, Map as MapIcon, Siren,
  Megaphone,
} from 'lucide-react';
import { api } from '../api/client';
import { useStore } from '../app/store';
import { CodeInput, MfaSetup } from '../components/account/Mfa';
import { BrandLockup } from '../components/layout/BrandMark';
import ProvinceArt from '../components/layout/ProvinceArt';
import { useMediaQuery } from '../utils/useMediaQuery';

// Vào nhanh chế độ giả lập: CHỈ máy dev (app/store.js) — bản build chạy thật không có khối này
const DemoLoginPanel = import.meta.env.DEV ? lazy(() => import('../components/common/DemoLoginPanel')) : null;

const REMEMBER_KEY = 'cb_pctt_saved_login';

// Ba việc chính của hệ thống (cột trái, máy tính) — biểu tượng trùng mục menu cùng việc (components/layout/nav.js)
const WORK = [
  { icon: MapIcon, text: 'Giám sát mưa, mực nước sông, hồ trên bản đồ' },
  { icon: Siren, text: 'Nhận tin báo cứu nạn, điều đội cứu hộ' },
  { icon: Megaphone, text: 'Ban hành cảnh báo khẩn cấp tới người dân' },
];

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
        className="btn-primary justify-center rounded-xl py-2.5 text-base font-semibold"
        disabled={busy || (recovery ? code.replace(/[\s-]/g, '').length !== 8 : code.length !== 6)}
      >
        {busy ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />} Xác nhận
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

  // Máy tính: cột trái vẽ ranh giới tỉnh và 56 xã (tải dữ liệu ranh giới chỉ khi màn đủ rộng — điện thoại không tải thêm)
  const wide = useMediaQuery('(min-width: 1024px)');

  return (
    <div className="flex min-h-screen flex-col bg-bg lg:flex-row">
      {/* Cột trái (máy tính): ranh giới tỉnh và các xã từ dữ liệu của hệ thống — không dùng ảnh chụp ô bản đồ / ảnh trên mạng.
          Dính đỉnh, cao đúng 1 màn hình: cột phải dài (cài xác thực 2 lớp) vẫn thấy đủ cột trái. Nền xanh đêm như khối đầu
          trang Tổng quan; lưới chấm mờ dần + quầng sáng sau hình tỉnh tạo chiều sâu (màu chuyển chỉ trong khối có
          data-mau-chuyen — docs/ke-hoach-lam-moi-giao-dien.md mục 1.3) */}
      {wide ? (
        <aside data-mau-chuyen="" className="hero-brand sticky top-0 isolate flex h-screen w-[46%] shrink-0 flex-col gap-7 overflow-hidden p-10 text-slate-200">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(rgb(148_163_184/0.16)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(75%_60%_at_50%_42%,black,transparent)]" />
          <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[42%] -z-10 aspect-square w-[90%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(37_99_235/0.35),transparent)]" />
          <BrandLockup />
          <ProvinceArt className="min-h-0 w-full flex-1 text-slate-300 drop-shadow-[0_0_14px_rgb(59_130_246/0.45)]" />
          <div className="max-w-md">
            <h1 className="text-balance text-[26px] font-bold leading-tight text-white xl:text-3xl">Điều hành phòng chống thiên tai và tìm kiếm cứu nạn</h1>
            <p className="mt-3 text-base text-slate-300">Tỉnh Cao Bằng · 56 xã, phường · trực 24/7</p>
            <ul className="mt-6 flex flex-col gap-3 [@media(max-height:640px)]:hidden">
              {WORK.map((w) => (
                <li key={w.text} className="flex items-center gap-3 text-[15px] leading-snug text-slate-200">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] text-sky-300 ring-1 ring-inset ring-white/10" aria-hidden="true">
                    <w.icon size={18} />
                  </span>
                  {w.text}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-slate-400">Hình: ranh giới tỉnh và các xã, phường từ dữ liệu của hệ thống.</p>
        </aside>
      ) : (
        // Điện thoại, máy tính bảng: dải xanh đêm trên cùng, thẻ đăng nhập đè lên mép dưới dải
        <header data-mau-chuyen="" className="hero-brand px-4 pb-14 pt-6 text-slate-200 sm:px-8">
          <div className="mx-auto max-w-sm">
            <BrandLockup />
            <h1 className="mt-5 text-balance text-xl font-bold leading-snug text-white">Điều hành phòng chống thiên tai và tìm kiếm cứu nạn</h1>
          </div>
        </header>
      )}

      <main className="relative flex flex-1 justify-center px-4 pb-8 max-lg:-mt-9 sm:px-8 lg:items-center lg:py-8">
        <div className="w-full max-w-sm">
          <div className="card p-5 sm:p-7">
            <h2 className="text-2xl font-bold text-ink">Đăng nhập</h2>
            <p className="mt-1 text-sm text-ink-2">Dành cho cán bộ Ban Chỉ huy tỉnh, xã, phường.</p>

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
                <div className="rounded-xl bg-danger/10 border border-danger/30 p-3 text-sm text-danger font-medium flex items-start gap-2.5" role="alert">
                  <AlertCircle size={16} className="shrink-0 mt-0.5 text-danger" />
                  <span className="flex-1 leading-relaxed">{error}</span>
                </div>
              )}

              {/* Input Tài khoản / Email */}
              <div>
                <label className="block text-sm font-medium text-ink-2 mb-1.5">
                  Tên đăng nhập hoặc email công vụ
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
                  <label className="text-sm font-medium text-ink-2">
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
                <label className="tap flex items-center gap-2 cursor-pointer select-none text-sm text-ink-2 hover:text-ink transition-colors">
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
                className="btn-primary justify-center py-2.5 rounded-xl font-semibold text-base mt-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? (
                  <>
                    <Loader2 size={18} className="animate-spin mr-1" />
                    <span>Đang đăng nhập…</span>
                  </>
                ) : (
                  <>
                    <LogIn size={18} />
                    <span>Đăng nhập</span>
                  </>
                )}
              </button>
            </form>
            )}
          </div>

          {DemoLoginPanel && <Suspense fallback={null}><DemoLoginPanel /></Suspense>}

          <p className="mt-5 px-1 text-sm text-ink-2">
            Bạn là người dân?{' '}
            <Link to="/cong-khai" className="font-medium text-accent hover:underline">Vào Cổng cảnh báo thiên tai</Link>
          </p>
          <p className="mt-2 px-1 text-xs text-muted">
            Chưa có tài khoản: liên hệ Văn phòng thường trực BCH tỉnh. Quyền hạn theo cấp được giao (tỉnh, xã / phường).
          </p>
        </div>
      </main>
    </div>
  );
}
