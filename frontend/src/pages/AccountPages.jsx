import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, Loader2, LogOut, Mail } from 'lucide-react';
import { api } from '../api/client';
import { useStore } from '../app/store';
import { Modal } from '../components/common/ui';
import { BrandLockup } from '../components/layout/BrandMark';

export const PASSWORD_HINT = 'Tối thiểu 8 ký tự, gồm cả chữ và số';
export const weakPassword = (p) => p.length < 8 || !/\d/.test(p) || !/[A-Za-zÀ-ỹ]/.test(p);

/** Khung chung các trang tài khoản (đổi mật khẩu lần đầu, quên / đặt lại mật khẩu): dải xanh đêm có biểu trưng như trang
 * Đăng nhập trên điện thoại, thẻ nội dung đè lên mép dưới dải (màu chuyển chỉ trong khối có data-mau-chuyen). */
function Shell({ title, children, footer }) {
  return (
    <div className="flex min-h-full flex-col bg-bg">
      <header data-mau-chuyen="" className="hero-brand px-4 pb-16 pt-6 text-slate-200 sm:pb-24 sm:pt-10">
        <BrandLockup className="mx-auto max-w-md" />
      </header>
      <main className="relative -mt-10 flex flex-1 justify-center px-4 pb-8 sm:-mt-14">
        <div className="card h-fit w-full max-w-md p-6">
          <h1 className="mb-3 text-xl font-bold text-ink">{title}</h1>
          {children}
          <div className="mt-4 flex justify-between text-xs">
            {footer || (
              <>
                <Link to="/dang-nhap" className="text-accent hover:underline">← Đăng nhập</Link>
                <Link to="/" className="text-muted hover:underline">Cổng thông tin công khai</Link>
              </>
            )}
          </div>
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
      title="Đặt mật khẩu của riêng bạn"
      footer={
        <button type="button" className="inline-flex items-center gap-1 text-muted hover:underline" onClick={logout}>
          <LogOut size={12} /> Đăng xuất
        </button>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-3 text-sm">
        <p className="text-ink-2">
          Tài khoản <b className="font-mono">{auth?.user?.username}</b> đang dùng mật khẩu do cấp trên đặt. Đặt mật khẩu mới chỉ
          mình bạn biết để tiếp tục sử dụng hệ thống.
        </p>
        <label>Mật khẩu hiện tại (cấp trên đã giao)<input className="input mt-1" type="password" autoComplete="current-password" autoFocus value={cur} onChange={(e) => setCur(e.target.value)} /></label>
        <label>Mật khẩu mới<input className="input mt-1" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        <label>Nhập lại mật khẩu mới<input className="input mt-1" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
        <div className={pw && weakPassword(pw) ? 'text-xs text-warn' : 'text-xs text-muted'}>{PASSWORD_HINT}</div>
        {pw2 && pw !== pw2 && <div className="text-xs text-danger">Mật khẩu nhập lại không khớp</div>}
        {error && <div className="text-danger">{error}</div>}
        <button className="btn-primary justify-center" disabled={!cur || weakPassword(pw) || pw !== pw2 || busy}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Đặt mật khẩu và tiếp tục
        </button>
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
        <div className="rounded-lg bg-good/10 p-3 text-sm"><Mail size={16} className="mr-1 inline text-good" />{msg}</div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3 text-sm">
          <p className="text-ink-2">Nhập tên đăng nhập hoặc email của tài khoản. Hệ thống sẽ gửi liên kết đặt lại mật khẩu (hiệu lực 30 phút) tới email đã đăng ký.</p>
          <input className="input" autoFocus placeholder="Tên đăng nhập hoặc email" value={login} onChange={(e) => setLogin(e.target.value)} />
          {error && <div className="text-danger">{error}</div>}
          <button className="btn-primary justify-center" disabled={login.length < 3 || busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} Gửi liên kết</button>
          <p className="text-xs text-muted">Tài khoản chưa có email: liên hệ quản trị cấp trên để được đặt lại mật khẩu.</p>
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
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell title="Đặt lại mật khẩu">
      {!token ? <div className="text-sm text-danger">Liên kết không hợp lệ.</div> : (
        <form onSubmit={submit} className="flex flex-col gap-3 text-sm">
          <label>Mật khẩu mới<input className="input mt-1" type="password" autoComplete="new-password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} /></label>
          <label>Nhập lại mật khẩu mới<input className="input mt-1" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
          <div className={pw && weakPassword(pw) ? 'text-xs text-warn' : 'text-xs text-muted'}>{PASSWORD_HINT}</div>
          {pw2 && pw !== pw2 && <div className="text-xs text-danger">Mật khẩu nhập lại không khớp</div>}
          {error && <div className="text-danger">{error}</div>}
          <button className="btn-primary justify-center" disabled={weakPassword(pw) || pw !== pw2 || busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Đặt mật khẩu mới</button>
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
