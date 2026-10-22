import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { PhoneCall } from 'lucide-react';
import { api } from '../../api/client';
import { citizenApi } from '../../api/citizen';
import { useUnits } from '../../api/hooks';
import { useCitizen } from '../../app/citizenSession';
import Turnstile from '../../components/common/Turnstile';

const PASSWORD_HINT = 'Ít nhất 8 ký tự, có cả chữ và số';

/** Ô nhập có nhãn (htmlFor) — trình đọc màn hình đọc đúng, kiểm thử tìm theo nhãn. */
function Field({ id, label, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-ink-2">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

/**
 * Đăng nhập / đăng ký / quên mật khẩu / đổi mật khẩu tạm của NGƯỜI DÂN (Đ5 — docs/ke-hoach-lam-moi-giao-dien.md mục 11).
 * Luôn có "Đang nguy hiểm? Gọi ngay 112" trên cùng — người gặp nạn không bị kẹt ở bước đăng ký. `onDone(session)` khi đã
 * có phiên dùng được (đăng nhập, đăng ký, đổi xong mật khẩu). `initial`: 'login' | 'register' | 'change' (đang đăng nhập,
 * tự đổi mật khẩu); `reason`: một câu vì sao cần đăng nhập (VD "để gửi phản ánh").
 */
export default function CitizenAuth({ initial = 'login', reason, onDone }) {
  const session = useCitizen((s) => s.session);
  const setSession = useCitizen((s) => s.setSession);
  const mustChange = !!session?.account?.must_change_password;
  const [mode, setMode] = useState(mustChange ? 'change' : initial);
  const [f, setF] = useState({ full_name: '', phone: '', password: '', email: '', admin_code: '', consent: false, website: '', old_password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const { data: units = [] } = useUnits();
  const communes = useMemo(() => [...units].sort((a, b) => a.name.localeCompare(b.name, 'vi')), [units]);
  const { data: pubConfig } = useQuery({ queryKey: ['pub-config'], queryFn: () => api('/public/config'), staleTime: Infinity });
  const siteKey = pubConfig?.turnstile_site_key;
  const [token, setToken] = useState('');
  const [tokenRound, setTokenRound] = useState(0);
  const onTurnstileError = useCallback(() => setError('Không tải được bước xác minh chống spam — thử lại sau ít phút. Nguy hiểm: gọi ngay 112.'), []);

  const go = (m) => { setMode(m); setError(''); setInfo(''); };
  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e.message);
      if (siteKey) { setToken(''); setTokenRound((n) => n + 1); }
    } finally {
      setBusy(false);
    }
  };
  const finish = (s) => {
    setSession(s);
    if (!s.account.must_change_password) onDone?.(s);
    else go('change');
  };

  const login = () => run(async () => finish(await citizenApi('/public/account/login', { method: 'POST', body: { phone: f.phone, password: f.password } })));
  const register = () => run(async () => finish(await citizenApi('/public/account/register', {
    method: 'POST',
    body: {
      full_name: f.full_name, phone: f.phone, password: f.password, email: f.email || null, admin_code: f.admin_code || null,
      consent: f.consent, website: f.website, turnstile_token: token || null,
    },
  })));
  const forgot = () => run(async () => {
    const r = await citizenApi('/public/account/forgot', { method: 'POST', body: { email: f.email } });
    setInfo(r.message);
  });
  const change = () => run(async () => {
    const s = await citizenApi('/public/account/change-password', { method: 'POST', body: { old_password: f.old_password, new_password: f.password } });
    setSession(s);
    onDone?.(s);
  });

  const tab = (m, label) => (
    <button
      type="button"
      onClick={() => go(m)}
      aria-pressed={mode === m}
      className={clsx('tap flex-1 rounded-lg px-3 text-sm font-semibold', mode === m ? 'bg-panel text-accent shadow-sm' : 'text-muted hover:text-ink')}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Người gặp nạn không phải đăng ký: gọi ngay */}
      <a href="tel:112" className="flex items-center justify-between gap-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger">
        <span className="font-semibold">Đang nguy hiểm? Gọi ngay 112 — không cần tài khoản</span>
        <span className="btn shrink-0 bg-danger px-3 py-1.5 text-xs font-bold text-white"><PhoneCall size={14} aria-hidden="true" /> Gọi 112</span>
      </a>
      {reason && mode !== 'change' && <p className="text-sm text-ink-2">{reason}</p>}

      {mode !== 'change' && mode !== 'forgot' && (
        <div className="flex gap-1 rounded-xl bg-panel2 p-1" role="group" aria-label="Đăng nhập hoặc đăng ký">
          {tab('login', 'Đăng nhập')}
          {tab('register', 'Đăng ký tài khoản')}
        </div>
      )}

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          ({ login, register, forgot, change })[mode]();
        }}
      >
        {mode === 'change' && mustChange && (
          <p className="rounded-lg bg-warn/15 px-3 py-2 text-sm text-ink">
            Bạn đang dùng mật khẩu tạm do cán bộ đặt lại — đặt mật khẩu của riêng bạn để tiếp tục.
          </p>
        )}
        {mode === 'register' && (
          <Field id="cd-name" label="Họ tên">
            <input id="cd-name" className="input" maxLength={100} autoComplete="name" value={f.full_name} onChange={set('full_name')} required />
          </Field>
        )}
        {(mode === 'login' || mode === 'register') && (
          <Field id="cd-phone" label="Số điện thoại" hint={mode === 'register' ? 'Dùng để đăng nhập và để cán bộ liên hệ khi xử lý phản ánh' : undefined}>
            <input id="cd-phone" className="input" inputMode="tel" autoComplete="tel" maxLength={20} value={f.phone} onChange={set('phone')} required />
          </Field>
        )}
        {mode === 'change' && (
          <Field id="cd-old" label={mustChange ? 'Mật khẩu tạm cán bộ đã đọc cho bạn' : 'Mật khẩu hiện tại'}>
            <input id="cd-old" type="password" className="input" autoComplete="current-password" value={f.old_password} onChange={set('old_password')} required />
          </Field>
        )}
        {mode !== 'forgot' && (
          <Field id="cd-pass" label={mode === 'change' ? 'Mật khẩu mới' : 'Mật khẩu'} hint={mode === 'login' ? undefined : PASSWORD_HINT}>
            <input
              id="cd-pass"
              type="password"
              className="input"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={f.password}
              onChange={set('password')}
              required
            />
          </Field>
        )}
        {(mode === 'register' || mode === 'forgot') && (
          <Field
            id="cd-email"
            label={mode === 'register' ? 'Email (không bắt buộc)' : 'Email đã khai khi đăng ký'}
            hint={mode === 'register' ? 'Để tự lấy lại mật khẩu khi quên' : undefined}
          >
            <input id="cd-email" type="email" className="input" autoComplete="email" maxLength={120} value={f.email} onChange={set('email')} required={mode === 'forgot'} />
          </Field>
        )}
        {mode === 'register' && (
          <>
            <Field id="cd-xa" label="Xã / phường đang ở (không bắt buộc)">
              <select id="cd-xa" className="input" value={f.admin_code} onChange={set('admin_code')}>
                <option value="">— Chọn xã / phường —</option>
                {communes.map((u) => <option key={u.code} value={u.code}>{u.name}</option>)}
              </select>
            </Field>
            <label className="flex items-start gap-2 text-xs leading-relaxed text-ink-2">
              <input type="checkbox" className="mt-0.5" checked={f.consent} onChange={set('consent')} />
              <span>
                Tôi đồng ý cho Ban Chỉ huy Phòng chống thiên tai &amp; Tìm kiếm cứu nạn tỉnh Cao Bằng dùng họ tên, số điện thoại
                của tôi để liên hệ, xử lý phản ánh (Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân). Không công khai.
              </span>
            </label>
            {/* Trường ẩn chống bot tự động */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" value={f.website} onChange={set('website')} aria-hidden="true" />
            {siteKey && <Turnstile key={tokenRound} siteKey={siteKey} onToken={setToken} onError={onTurnstileError} />}
          </>
        )}
        {mode === 'forgot' && (
          <p className="text-xs text-muted">
            Không khai email khi đăng ký: gọi đường dây nóng của Ban Chỉ huy (mục "Sơ tán &amp; đường dây nóng") — cán bộ đặt
            mật khẩu tạm và đọc cho bạn.
          </p>
        )}

        {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        {info && <p role="status" className="rounded-lg bg-good/10 px-3 py-2 text-sm text-ink">{info}</p>}

        <button
          type="submit"
          className="btn-primary justify-center py-2.5 text-sm font-semibold"
          disabled={busy || (mode === 'register' && (!f.consent || (siteKey && !token)))}
        >
          {busy ? 'Đang xử lý…' : { login: 'Đăng nhập', register: 'Đăng ký', forgot: 'Gửi đường dẫn đặt lại', change: 'Đổi mật khẩu' }[mode]}
        </button>
      </form>

      {mode === 'login' && (
        <button type="button" onClick={() => go('forgot')} className="self-start text-xs font-semibold text-accent hover:underline">
          Quên mật khẩu?
        </button>
      )}
      {mode === 'forgot' && (
        <button type="button" onClick={() => go('login')} className="self-start text-xs font-semibold text-accent hover:underline">
          Quay lại đăng nhập
        </button>
      )}
    </div>
  );
}
