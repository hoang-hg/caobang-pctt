import { useMemo, useState } from 'react';
import { citizenApi } from '../../api/citizen';
import { useUnits } from '../../api/hooks';
import { useCitizen } from '../../app/citizenSession';

const vnDate = (t) => (t ? new Date(t).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–');

/**
 * Thông tin tài khoản người dân (bản vẽ khung N19): số điện thoại là tên đăng nhập nên chỉ xem; họ tên, email, xã đang ở sửa
 * được qua PATCH /public/account/me. Để trống email hoặc xã là bỏ thông tin đó (máy chủ nhận chuỗi rỗng).
 */
export default function CitizenProfile({ onChangePassword }) {
  const session = useCitizen((s) => s.session);
  const setSession = useCitizen((s) => s.setSession);
  const account = session.account;
  const { data: units = [] } = useUnits();
  const communes = useMemo(() => [...units].sort((a, b) => a.name.localeCompare(b.name, 'vi')), [units]);
  const [f, setF] = useState({ full_name: account.full_name || '', email: account.email || '', admin_code: account.admin_code || '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setSaved(false); };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const updated = await citizenApi('/public/account/me', { method: 'PATCH', body: f });
      setSession({ ...useCitizen.getState().session, account: updated });
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <dl className="text-sm">
        <div className="flex gap-3 border-t border-line py-2.5">
          <dt className="w-32 shrink-0 text-ink-2">Số điện thoại</dt>
          <dd className="min-w-0 flex-1"><b className="num text-ink">{account.phone}</b> <span className="text-ink-2">— là tên đăng nhập, không đổi được</span></dd>
        </div>
        <div className="flex gap-3 border-y border-line py-2.5">
          <dt className="w-32 shrink-0 text-ink-2">Ngày đăng ký</dt>
          <dd className="num font-semibold text-ink">{vnDate(account.created_at)}</dd>
        </div>
      </dl>
      <label className="block text-[13px] font-semibold text-ink" htmlFor="cd-ho-ten">Họ tên</label>
      <input id="cd-ho-ten" className="input tap -mt-2" autoComplete="name" maxLength={100} required value={f.full_name} onChange={set('full_name')} />
      <label className="block text-[13px] font-semibold text-ink" htmlFor="cd-thu">Email (để lấy lại mật khẩu)</label>
      <input id="cd-thu" type="email" className="input tap -mt-2" autoComplete="email" maxLength={120} value={f.email} onChange={set('email')} />
      <label className="block text-[13px] font-semibold text-ink" htmlFor="cd-noi-o">Xã / phường đang ở</label>
      <select id="cd-noi-o" className="input tap -mt-2" value={f.admin_code} onChange={set('admin_code')}>
        <option value="">— Chọn xã / phường —</option>
        {communes.map((u) => <option key={u.code} value={u.code}>{u.name}</option>)}
      </select>
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
      {saved && <p role="status" className="text-sm font-medium text-good">Đã lưu thông tin tài khoản.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary tap h-11 rounded-xl px-5" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu'}</button>
        <button type="button" className="btn-secondary tap h-11 rounded-xl px-4" onClick={onChangePassword}>Đổi mật khẩu</button>
      </div>
      <p className="rounded-[14px] bg-panel2 p-3 text-[13px] leading-normal text-ink-2">
        Thông tin chỉ dùng để cán bộ liên hệ khi xử lý yêu cầu của bạn — không hiện công khai.
      </p>
    </form>
  );
}
