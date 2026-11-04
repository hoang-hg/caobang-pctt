import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, Loader2, LogOut, Mail } from 'lucide-react';
import { api } from '../api/client';
import { useStore } from '../app/store';
import { Modal } from '../components/common/ui';
import { BrandLockup } from '../components/layout/BrandMark';
import AuthAside from '../components/layout/AuthAside';
import { useMediaQuery } from '../utils/useMediaQuery';

export const PASSWORD_HINT = 'Tối thiểu 8 ký tự, gồm cả chữ và số';
export const weakPassword = (p) => p.length < 8 || !/\d/.test(p) || !/[A-Za-zÀ-ỹ]/.test(p);

/** Khung chung các trang tài khoản (đổi mật khẩu lần đầu, quên / đặt lại mật khẩu): dải xanh đêm có biểu trưng như trang
 * Đăng nhập trên điện thoại, thẻ nội dung đè lên mép dưới dải (màu chuyển chỉ trong khối có data-mau-chuyen). */
function Shell({ title, children, footer }) {
  // Máy tính ≥ 1024 px (bản vẽ khung L4, L5, L8): cùng bố cục trang Đăng nhập — cột trái xanh đêm, thẻ giữa cột phải
  const wide = useMediaQuery('(min-width: 1024px)');
  const foot = (
    <div className="mt-4 flex justify-between text-sm">
      {footer || (
        <>
          <Link to="/dang-nhap" className="tap text-accent hover:underline">‹ Quay lại đăng nhập</Link>
          <Link to="/" className="tap text-muted hover:underline">Cổng thông tin công khai</Link>
        </>
      )}
    </div>
  );
  if (wide) {
    return (
      <div className="flex min-h-full bg-bg">
        <AuthAside />
        <main className="flex flex-1 items-center justify-center px-8 py-8">
          <div className="card h-fit w-full max-w-[440px] rounded-[18px] p-8">
            <h2 className="mb-4 text-[22px] font-bold text-ink">{title}</h2>
            {children}
            {foot}
          </div>
        </main>
      </div>
    );
  }
  return (
    <div className="flex min-h-full flex-col bg-bg">
      <header data-mau-chuyen="" className="hero-brand px-4 pb-16 pt-6 text-slate-200 sm:pb-24 sm:pt-10">
        <BrandLockup className="mx-auto max-w-md" />
      </header>
      <main className="relative -mt-10 flex flex-1 justify-center px-4 pb-8 sm:-mt-14">
        <div className="card h-fit w-full max-w-md p-6">
          <h1 className="mb-3 text-xl font-bold text-ink">{title}</h1>
          {children}
          {foot}
        </div>
      </main>
    </div>
  );
}

/** Tài khoản cấp trên vừa tạo / vừa đặt lại mật khẩu: phải đặt mật khẩu của riêng mình rồi mới vào hệ thống (máy chủ chặn
 * mọi chức năng khác tới lúc đó — app/auth.py). */
export function FirstPasswordChange() {
  const { auth, setAuth, toast } = useStore();
  const qc = useQueryClient();
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setAuth(await api('/auth/change-password', { method: 'POST', body: { current_password: cur, new_password: pw } }));
      toast({ tone: 'good', title: 'Đã đặt mật khẩu mới', body: 'Từ nay đăng nhập bằng mật khẩu này' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const logout = () => {
    setAuth(null);
    qc.clear();
  };
  return (
    <Shell
      title="Đổi mật khẩu trước khi dùng"
      footer={
        <button type="button" className="inline-flex items-center gap-1 text-muted hover:underline" onClick={logout}>
          <LogOut size={14} /> Đăng xuất
        </button>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-3 text-sm">
        <p className="text-ink-2">
          Tài khoản <b className="font-mono">{auth?.user?.username}</b> đang dùng mật khẩu do cấp trên đặt. Đặt mật khẩu mới chỉ
          mình bạn biết để tiếp tục sử dụng hệ thống.
        </p>
        <label>Mật khẩu hiện tại (cấp trên đã giao)<input className="input tap mt-1 h-11 rounded-xl" type="password" autoComplete="current-password" autoFocus value={cur} onChange={(e) => setCur(e.target.value)} /></label>
        <label>Mật khẩu mới<input className="input tap mt-1 h-11 rounded-xl" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        <div className={pw ? (weakPassword(pw) ? 'text-xs font-semibold text-danger' : 'text-[13px] text-good') : 'text-xs text-muted'}>{pw && !weakPassword(pw) ? '✓ Mật khẩu đủ mạnh' : PASSWORD_HINT}</div>
        <label>Nhập lại mật khẩu mới<input className="input tap mt-1 h-11 rounded-xl" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
        {pw2 && pw !== pw2 && <div className="text-xs text-danger">Mật khẩu nhập lại không khớp</div>}
        {error && <div className="text-danger">{error}</div>}
        <button className="btn-primary tap h-12 justify-center rounded-xl font-semibold" disabled={!cur || weakPassword(pw) || pw !== pw2 || busy}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Đặt mật khẩu và tiếp tục
        </button>
        <p className="text-[13px] text-muted">Đổi xong, các phiên đăng nhập khác của bạn bị đăng xuất.</p>
      </form>
    </Shell>
  );
}

export function ForgotPassword() {
  const [login, setLogin] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setMsg((await api('/auth/forgot-password', { method: 'POST', body: { login } })).message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell title="Quên mật khẩu">
      {msg ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl bg-good/10 p-3.5 text-sm"><Mail size={16} className="mr-1 inline text-good" aria-hidden="true" />{msg}</div>
          <p className="rounded-[14px] border border-dashed border-line p-3 text-[13px] leading-normal text-ink-2">Tài khoản chưa khai email: nhờ cấp trên “Đặt lại mật khẩu” ở Phân quyền.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3 text-sm">
          <p className="text-ink-2">Nhập tên đăng nhập hoặc email của tài khoản. Hệ thống sẽ gửi liên kết đặt lại mật khẩu (hiệu lực 30 phút) tới email đã đăng ký.</p>
          <input className="input tap h-11 rounded-xl" autoFocus aria-label="Tên đăng nhập hoặc email" placeholder="Tên đăng nhập hoặc email" value={login} onChange={(e) => setLogin(e.target.value)} />
          {error && <div className="text-danger">{error}</div>}
          <button className="btn-primary tap h-12 justify-center rounded-xl font-semibold" disabled={login.length < 3 || busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} Gửi liên kết</button>
          <p className="rounded-[14px] border border-dashed border-line p-3 text-[13px] leading-normal text-ink-2">Tài khoản chưa khai email: nhờ cấp trên “Đặt lại mật khẩu” ở Phân quyền.</p>
        </form>
      )}
    </Shell>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useStore((s) => s.toast);
  const token = params.get('token') || '';
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false); // máy chủ trả 400: liên kết sai / hết hạn / đã dùng (bản vẽ khung L8b)
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api('/auth/reset-password', { method: 'POST', body: { token, new_password: pw } });
      toast({ tone: 'good', title: r.message });
      navigate('/dang-nhap');
    } catch (err) {
      if (err.status === 400) setExpired(true);
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell title="Đặt mật khẩu mới">
      {!token || expired ? (
        <div className="flex flex-col gap-3 text-sm">
          <p role="alert" className="rounded-xl bg-danger/10 px-3.5 py-3 font-semibold text-danger">Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn</p>
          <p className="text-ink-2">Đường dẫn chỉ dùng được một lần, trong 30 phút. Gửi yêu cầu mới, hoặc nhờ cấp trên đặt lại mật khẩu ở Phân quyền.</p>
          <Link to="/quen-mat-khau" className="btn-primary tap h-12 justify-center rounded-xl font-semibold">Gửi lại yêu cầu</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3 text-sm">
          <p className="text-ink-2">Từ đường dẫn trong email (hiệu lực 30 phút, dùng một lần).</p>
          <label>Mật khẩu mới<input className="input tap mt-1 h-11 rounded-xl" type="password" autoComplete="new-password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} /></label>
          <div className={pw ? (weakPassword(pw) ? 'text-xs font-semibold text-danger' : 'text-[13px] text-good') : 'text-xs text-muted'}>{pw && !weakPassword(pw) ? '✓ Mật khẩu đủ mạnh' : PASSWORD_HINT}</div>
          <label>Nhập lại mật khẩu mới<input className="input tap mt-1 h-11 rounded-xl" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
          {pw2 && pw !== pw2 && <div className="text-xs text-danger">Mật khẩu nhập lại không khớp</div>}
          {error && <div className="text-danger">{error}</div>}
          <p className="text-[13px] text-muted">Đặt xong: mọi phiên đăng nhập cũ bị đăng xuất; đăng nhập lại bằng mật khẩu mới.</p>
          <button className="btn-primary tap h-12 justify-center rounded-xl font-semibold" disabled={weakPassword(pw) || pw !== pw2 || busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Đặt mật khẩu mới</button>
        </form>
      )}
    </Shell>
  );
}

export function ChangePasswordModal({ onClose }) {
  const { setAuth, toast } = useStore();
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    setError('');
    try {
      setAuth(await api('/auth/change-password', { method: 'POST', body: { current_password: cur, new_password: pw } }));
      toast({ tone: 'good', title: 'Đã đổi mật khẩu', body: 'Các phiên đăng nhập trên thiết bị khác đã bị đăng xuất' });
      onClose();
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <Modal open onClose={onClose} title="Đổi mật khẩu"
      footer={<><button className="btn-ghost" onClick={onClose}>Huỷ</button><button className="btn-primary" disabled={!cur || weakPassword(pw) || pw !== pw2} onClick={submit}><KeyRound size={15} /> Đổi mật khẩu</button></>}>
      <div className="flex flex-col gap-3 text-sm">
        <label>Mật khẩu hiện tại<input className="input mt-1" type="password" autoComplete="current-password" autoFocus value={cur} onChange={(e) => setCur(e.target.value)} /></label>
        <label>Mật khẩu mới<input className="input mt-1" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        <label>Nhập lại mật khẩu mới<input className="input mt-1" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
        <div className={pw && weakPassword(pw) ? 'text-xs text-warn' : 'text-xs text-muted'}>{PASSWORD_HINT}</div>
        {pw2 && pw !== pw2 && <div className="text-xs text-danger">Mật khẩu nhập lại không khớp</div>}
        {error && <div className="text-danger">{error}</div>}
      </div>
    </Modal>
  );
}
