import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, PhoneCall, ShieldAlert } from 'lucide-react';
import { citizenApi } from '../../api/citizen';

/**
 * Đặt lại mật khẩu tài khoản người dân từ đường dẫn trong email (Đ5): /cong-khai/dat-lai-mat-khau?token=… — hiệu lực 30
 * phút, dùng một lần (máy chủ kiểm). Xong → về cổng đăng nhập bằng mật khẩu mới.
 */
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setDone((await citizenApi('/public/account/reset', { method: 'POST', body: { token, password } })).message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-start justify-center bg-bg p-4 pt-12 text-ink">
      <div className="card w-full max-w-md p-5">
        <div className="mb-4 flex items-center gap-2.5">
          <ShieldAlert size={26} className="shrink-0 text-danger" aria-hidden="true" />
          <div>
            <h1 className="text-lg font-bold">Đặt mật khẩu mới</h1>
            <p className="text-xs text-muted">Tài khoản người dân — cổng cảnh báo thiên tai tỉnh Cao Bằng</p>
          </div>
        </div>
        <a href="tel:112" className="mb-4 flex items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
          <PhoneCall size={15} aria-hidden="true" /> Đang nguy hiểm? Gọi ngay 112 — không cần tài khoản
        </a>
        {done ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 size={36} className="text-good" aria-hidden="true" />
            <p role="status" className="text-sm">{done}</p>
            <Link to="/cong-khai" className="btn-primary px-4 py-2 text-sm">Về cổng cảnh báo</Link>
          </div>
        ) : !token ? (
          <p role="alert" className="text-sm text-danger">
            Đường dẫn thiếu mã đặt lại — mở lại đường dẫn trong thư, hoặc gửi yêu cầu mới ở mục Đăng nhập → Quên mật khẩu.
          </p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <div>
              <label htmlFor="rp-pass" className="mb-1 block text-xs font-semibold text-ink-2">Mật khẩu mới</label>
              <input id="rp-pass" type="password" className="input" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <p className="mt-1 text-[11px] text-muted">Ít nhất 8 ký tự, có cả chữ và số</p>
            </div>
            {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
            <button type="submit" className="btn-primary justify-center py-2.5 text-sm font-semibold" disabled={busy}>
              {busy ? 'Đang lưu…' : 'Đặt mật khẩu mới'}
            </button>
            <Link to="/cong-khai" className="self-start text-xs font-semibold text-accent hover:underline">Về cổng cảnh báo</Link>
          </form>
        )}
      </div>
    </div>
  );
}
