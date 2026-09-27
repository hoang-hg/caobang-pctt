import { useState } from 'react';
import { Check, Copy, Download, Loader2, QrCode, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { Modal } from '../common/ui';

/** Ô nhập mã 6 số (hoặc mã khôi phục khi `recovery`). */
export function CodeInput({ value, onChange, recovery = false, autoFocus = true }) {
  return (
    <input
      className="input text-center font-mono text-lg tracking-[0.3em]"
      value={value}
      onChange={(e) => onChange(recovery ? e.target.value : e.target.value.replace(/\D/g, '').slice(0, 6))}
      inputMode={recovery ? 'text' : 'numeric'}
      autoComplete="one-time-code"
      placeholder={recovery ? 'xxxx-xxxx' : '123456'}
      maxLength={recovery ? 12 : 6}
      autoFocus={autoFocus}
      aria-label={recovery ? 'Mã khôi phục' : 'Mã 6 số trong ứng dụng xác thực'}
    />
  );
}

/** 10 mã khôi phục — chỉ hiện 1 lần; bắt buộc xác nhận đã lưu trước khi đi tiếp. */
export function RecoveryCodes({ codes, onDone, doneLabel = 'Hoàn tất' }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = `Mã khôi phục xác thực 2 lớp — BCH PCTT & TKCN Cao Bằng\nMỗi mã dùng 1 lần khi mất điện thoại.\n\n${codes.join('\n')}\n`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch { /* trình duyệt chặn clipboard */ }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ma-khoi-phuc-pctt.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-ink-2">
        Lưu các <b>mã khôi phục</b> dưới đây ở nơi an toàn (in ra giấy, két). Mất điện thoại → dùng 1 mã thay cho mã 6 số;
        mỗi mã dùng được 1 lần. Mã chỉ hiện <b>một lần</b>.
      </p>
      <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-panel2 p-3 font-mono text-sm">
        {codes.map((c) => <span key={c}>{c}</span>)}
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn-ghost flex-1 justify-center" onClick={copy}>
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Đã sao chép' : 'Sao chép'}
        </button>
        <button type="button" className="btn-ghost flex-1 justify-center" onClick={download}>
          <Download size={15} /> Tải tệp .txt
        </button>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        Tôi đã lưu các mã khôi phục ở nơi an toàn
      </label>
      <button type="button" className="btn-primary justify-center" disabled={!saved} onClick={onDone}>
        <ShieldCheck size={15} /> {doneLabel}
      </button>
    </div>
  );
}

/**
 * Cài đặt xác thực 2 lớp: tạo mã QR → quét bằng ứng dụng → nhập mã đầu tiên → lưu mã khôi phục.
 * `challenge`: phiếu từ /auth/login khi vai trò bắt buộc (chưa đăng nhập); bỏ trống = tài khoản đang đăng nhập tự bật.
 * `onDone({ token, user })` sau khi người dùng xác nhận đã lưu mã khôi phục.
 */
export function MfaSetup({ challenge = null, onDone }) {
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const call = async (path, body, then) => {
    setBusy(true);
    setError('');
    try {
      then(await api(path, { method: 'POST', body }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return <RecoveryCodes codes={result.recovery_codes} onDone={() => onDone({ token: result.token, user: result.user })} />;
  }
  return (
    <div className="flex flex-col gap-3 text-sm">
      {!setup ? (
        <>
          <p className="text-ink-2">
            Cài ứng dụng xác thực trên điện thoại (<b>Google Authenticator</b>, <b>Microsoft Authenticator</b> hoặc tương tự).
            Mỗi lần đăng nhập, ngoài mật khẩu cần thêm mã 6 số ứng dụng hiện ra — lộ mật khẩu vẫn không vào được tài khoản.
          </p>
          <button type="button" className="btn-primary justify-center" disabled={busy}
            onClick={() => call('/auth/mfa/setup', { challenge }, setSetup)}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <QrCode size={15} />} Tạo mã QR
          </button>
        </>
      ) : (
        <form className="flex flex-col gap-3"
          onSubmit={(e) => { e.preventDefault(); call('/auth/mfa/enable', { challenge, code }, setResult); }}>
          <div className="flex items-start gap-2 text-ink-2">
            <Smartphone size={16} className="mt-0.5 shrink-0 text-accent" />
            <span>Mở ứng dụng → <b>Thêm tài khoản</b> → <b>Quét mã QR</b>:</span>
          </div>
          <img src={setup.qr} alt="Mã QR cài đặt xác thực 2 lớp" className="mx-auto h-48 w-48 rounded-lg bg-white p-1" />
          <details className="text-xs text-muted">
            <summary className="cursor-pointer">Không quét được? Nhập khoá thủ công</summary>
            <div className="mt-1 break-all rounded bg-panel2 p-2 font-mono text-ink">{setup.secret.match(/.{1,4}/g).join(' ')}</div>
          </details>
          <label className="flex flex-col gap-1">
            Nhập mã 6 số ứng dụng đang hiện
            <CodeInput value={code} onChange={setCode} />
          </label>
          <button className="btn-primary justify-center" disabled={code.length !== 6 || busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Xác nhận & bật
          </button>
        </form>
      )}
      {error && <div className="text-danger">{error}</div>}
    </div>
  );
}

/** Quản lý xác thực 2 lớp của tài khoản đang đăng nhập (mở từ menu tài khoản). */
export default function MfaModal({ onClose }) {
  const { auth, setAuth, toast } = useStore();
  const mfa = auth?.user?.mfa || {};
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [codes, setCodes] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const act = async (kind, path, body, then) => {
    setBusy(kind);
    setError('');
    try {
      then(await api(path, { method: 'POST', body }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };
  const refreshMe = async () => {
    try {
      setAuth({ ...auth, user: await api('/auth/me') });
    } catch { /* bỏ qua */ }
  };

  let body;
  if (!mfa.enabled) {
    body = (
      <MfaSetup
        onDone={(session) => {
          setAuth(session);
          toast({ tone: 'good', title: 'Đã bật xác thực 2 lớp', body: 'Các phiên đăng nhập trên thiết bị khác đã bị đăng xuất' });
          onClose();
        }}
      />
    );
  } else if (codes) {
    body = <RecoveryCodes codes={codes} doneLabel="Đóng" onDone={() => { refreshMe(); onClose(); }} />;
  } else {
    body = (
      <div className="flex flex-col gap-4 text-sm">
        <div className="flex items-center gap-2 rounded-lg bg-good/10 p-3 text-good">
          <ShieldCheck size={18} /> Đang bật · còn {mfa.recovery_left} mã khôi phục
          {mfa.required && <span className="text-xs text-muted">(bắt buộc theo vai trò)</span>}
        </div>
        <label className="flex flex-col gap-1">
          Mã 6 số hiện tại (để tạo mã khôi phục mới hoặc tắt)
          <CodeInput value={code} onChange={setCode} />
        </label>
        <button className="btn-ghost justify-center" disabled={code.length !== 6 || !!busy}
          onClick={() => act('codes', '/auth/mfa/recovery-codes', { code }, (r) => setCodes(r.recovery_codes))}>
          {busy === 'codes' ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Tạo bộ mã khôi phục mới
        </button>
        {mfa.required ? (
          <p className="text-xs text-muted">
            Vai trò của bạn bắt buộc xác thực 2 lớp. Mất điện thoại mà hết mã khôi phục: đề nghị quản trị cấp trên đặt lại.
          </p>
        ) : (
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <label className="flex flex-col gap-1">
              Mật khẩu
              <input className="input" type="password" autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} />
            </label>
            <button className="btn-danger justify-center" disabled={code.length !== 6 || !password || !!busy}
              onClick={() => act('off', '/auth/mfa/disable', { code, password }, (session) => {
                setAuth(session);
                toast({ tone: 'warn', title: 'Đã tắt xác thực 2 lớp' });
                onClose();
              })}>
              {busy === 'off' ? <Loader2 size={15} className="animate-spin" /> : <ShieldOff size={15} />} Tắt xác thực 2 lớp
            </button>
          </div>
        )}
      </div>
    );
  }
  return (
    <Modal open onClose={onClose} title="Xác thực 2 lớp">
      {body}
      {error && <div className="mt-2 text-sm text-danger">{error}</div>}
    </Modal>
  );
}
