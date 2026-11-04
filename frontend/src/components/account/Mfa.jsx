import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Check, Copy, Download, Loader2, QrCode, ShieldCheck, ShieldOff } from 'lucide-react';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { Modal } from '../common/ui';

/**
 * Ô nhập mã 6 số (hoặc mã khôi phục khi `recovery`). Mã số hiện thành 6 ô (bản vẽ khung L2) nhưng vẫn là MỘT ô nhập trong suốt
 * phủ lên trên — dán cả mã, tự điền từ tin nhắn, trình đọc màn hình và phím xoá chạy như ô thường.
 */
export function CodeInput({ value, onChange, recovery = false, autoFocus = true }) {
  const [focused, setFocused] = useState(autoFocus);
  if (recovery) {
    return (
      <input
        className="input text-center font-mono text-lg tracking-[0.3em]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="text"
        autoComplete="one-time-code"
        placeholder="xxxx-xxxx"
        maxLength={12}
        autoFocus={autoFocus}
        aria-label="Mã khôi phục"
      />
    );
  }
  return (
    <div className="relative">
      <input
        className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        autoFocus={autoFocus}
        aria-label="Mã 6 số trong ứng dụng xác thực"
      />
      <div className="grid grid-cols-6 gap-2" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={clsx('flex h-12 items-center justify-center rounded-xl border bg-panel font-mono text-xl font-bold text-ink', focused && i === Math.min(value.length, 5) ? 'border-accent ring-2 ring-accent/30' : 'border-line')}>
            {value[i] || ''}
          </span>
        ))}
      </div>
    </div>
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

  // Cài bắt buộc lúc đăng nhập (có challenge — bản vẽ khung L3): hiện mã QR ngay, không qua nút "Tạo mã QR"
  const started = useRef(false);
  useEffect(() => {
    if (!challenge || started.current) return;
    started.current = true;
    call('/auth/mfa/setup', { challenge }, setSetup);
  }, [challenge]); // chỉ một lần khi mở

  if (result) {
    return <RecoveryCodes codes={result.recovery_codes} onDone={() => onDone({ token: result.token, user: result.user })} />;
  }
  return (
    <div className="flex flex-col gap-3 text-sm">
      {!setup && challenge && busy ? (
        <div className="flex items-center gap-2 py-6 text-muted"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Đang tạo mã QR…</div>
      ) : !setup ? (
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
          <div className="flex flex-wrap items-center gap-3.5">
            <img src={setup.qr} alt="Mã QR cài đặt xác thực 2 lớp" className="mx-auto h-40 w-40 shrink-0 rounded-xl border border-line bg-white p-1" />
            <ol className="min-w-[12rem] flex-1 list-decimal space-y-1 pl-5 leading-relaxed text-ink-2">
              <li>Cài <b className="text-ink">Google Authenticator</b> hoặc <b className="text-ink">Microsoft Authenticator</b></li>
              <li>Mở ứng dụng → <b className="text-ink">Thêm tài khoản</b> → <b className="text-ink">Quét mã QR</b></li>
              <li>Nhập mã 6 số đang hiện</li>
            </ol>
          </div>
          <details className="text-xs text-muted">
            <summary className="cursor-pointer">Không quét được? Nhập khoá thủ công</summary>
            <div className="mt-1 break-all rounded bg-panel2 p-2 font-mono text-ink">{setup.secret.match(/.{1,4}/g).join(' ')}</div>
          </details>
          <label className="flex flex-col gap-1">
            Nhập mã 6 số ứng dụng đang hiện
            <CodeInput value={code} onChange={setCode} />
          </label>
          <button className="btn-primary justify-center" disabled={code.length !== 6 || busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Bật xác thực 2 lớp
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
        <dl className="border-b border-line">
          <div className="flex gap-3 border-t border-line py-2.5"><dt className="w-36 shrink-0 text-ink-2">Trạng thái</dt><dd><b className="text-good">Đã bật</b>{mfa.required ? ' (bắt buộc theo vai trò)' : ''}</dd></div>
          <div className="flex gap-3 border-t border-line py-2.5"><dt className="w-36 shrink-0 text-ink-2">Mã khôi phục còn</dt><dd className="num font-semibold text-ink">{mfa.recovery_left} mã</dd></div>
        </dl>
        <label className="flex flex-col gap-1">
          Mã 6 số hiện tại (để tạo mã khôi phục mới hoặc tắt)
          <CodeInput value={code} onChange={setCode} />
        </label>
        <button className="btn-ghost justify-center" disabled={code.length !== 6 || !!busy}
          onClick={() => act('codes', '/auth/mfa/recovery-codes', { code }, (r) => setCodes(r.recovery_codes))}>
          {busy === 'codes' ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Tạo bộ mã khôi phục mới
        </button>
        <p className="rounded-[14px] border border-dashed border-line p-3 text-[13px] leading-normal text-ink-2">
          Tạo bộ mới thì bộ cũ hết hiệu lực.
          {mfa.required ? ' Vai trò của bạn bắt buộc xác thực 2 lớp nên không tắt được. Mất điện thoại mà hết mã khôi phục: nhờ cấp trên đặt lại xác thực 2 lớp.' : ''}
        </p>
        {!mfa.required && (
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
    <Modal open size="md" onClose={onClose} title="Xác thực 2 lớp" subtitle={auth?.user?.username}>
      {body}
      {error && <div className="mt-2 text-sm text-danger">{error}</div>}
    </Modal>
  );
}
