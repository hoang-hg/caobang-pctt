import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Copy, KeyRound, Lock, Search, Unlock } from 'lucide-react';
import { api } from '../api/client';
import { useStore } from '../app/store';
import { EmptyState, ErrorState, Modal, Skeleton } from '../components/common/ui';
import { usePermission } from '../rbac/usePermission';
import { dateTime } from '../utils/format';
import { useDebounced } from '../utils/useDebounced';

/**
 * Phân quyền › Tài khoản người dân (Đ5 — docs/ke-hoach-lam-moi-giao-dien.md mục 11): cán bộ cấp tỉnh tìm tài khoản của
 * người dân theo số điện thoại / họ tên (người dân gọi đường dây nóng), khoá tài khoản phá rối (ghi lý do), mở khoá, đặt
 * mật khẩu tạm — mật khẩu tạm chỉ hiện MỘT lần để đọc qua điện thoại, người dân phải đổi ở lần đăng nhập sau. Thao tác ghi
 * nhật ký pháp lý (tab "Nhật ký thao tác").
 */
export default function CitizenAccountsTab() {
  const canManage = usePermission('citizen', 'manage');
  const toast = useStore((s) => s.toast);
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const term = useDebounced(q.trim(), 300);
  const list = useQuery({ queryKey: ['citizens', term], queryFn: () => api('/citizens', { params: { q: term || undefined } }) });
  const [lock, setLock] = useState(null); // tài khoản đang khoá → hỏi lý do
  const [reason, setReason] = useState('');
  const [temp, setTemp] = useState(null); // { name, phone, password } — hiện một lần
  const [busy, setBusy] = useState('');

  const refresh = () => qc.invalidateQueries({ queryKey: ['citizens'] });
  const act = async (key, fn, ok) => {
    setBusy(key);
    try {
      const r = await fn();
      if (ok) toast({ tone: 'good', title: ok });
      refresh();
      return r;
    } catch (e) {
      toast({ tone: 'danger', title: e.message });
      return null;
    } finally {
      setBusy('');
    }
  };
  const doLock = async () => {
    const r = await act(`lock-${lock.id}`, () => api(`/citizens/${lock.id}`, { method: 'PATCH', body: { is_active: false, reason } }), `Đã khoá tài khoản ${lock.phone}`);
    if (r) { setLock(null); setReason(''); }
  };
  const unlock = (c) => act(`unlock-${c.id}`, () => api(`/citizens/${c.id}`, { method: 'PATCH', body: { is_active: true } }), `Đã mở khoá ${c.phone}`);
  const reset = async (c) => {
    const r = await act(`reset-${c.id}`, () => api(`/citizens/${c.id}/reset-password`, { method: 'POST' }));
    if (r) setTemp({ name: c.full_name, phone: c.phone, password: r.temp_password });
  };

  const items = list.data?.items || [];
  return (
    <section className="flex flex-col gap-3" aria-label="Tài khoản người dân">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            className="input tap pl-8"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Số điện thoại hoặc họ tên"
            aria-label="Tìm tài khoản người dân theo số điện thoại hoặc họ tên"
          />
        </label>
        {list.data && <span className="text-xs text-muted">Tổng {list.data.total} tài khoản người dân</span>}
      </div>
      <p className="text-xs text-muted">
        Người dân gọi đường dây nóng báo quên mật khẩu: tìm theo số điện thoại, bấm "Đặt mật khẩu tạm" và đọc mật khẩu tạm cho
        họ. Tài khoản báo tin giả, phá rối nhiều lần: khoá (ghi lý do) — phiên đang mở của họ hết hiệu lực ngay.
      </p>

      {list.isLoading ? (
        <Skeleton height={180} />
      ) : list.isError && !list.data ? (
        <ErrorState onRetry={() => list.refetch()}>Không tải được danh sách tài khoản người dân</ErrorState>
      ) : !items.length ? (
        <EmptyState art={term ? 'tim' : 'du-lieu'} className="py-8">
          {term ? `Không thấy tài khoản khớp "${term}"` : 'Chưa có người dân nào đăng ký tài khoản trên cổng.'}
        </EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-semibold">Người dân</th>
                <th className="px-3 py-2 font-semibold">Xã / phường</th>
                <th className="px-3 py-2 font-semibold">Phản ánh</th>
                <th className="px-3 py-2 font-semibold">Đăng ký · đăng nhập gần nhất</th>
                <th className="px-3 py-2 font-semibold">Trạng thái</th>
                {canManage && <th className="px-3 py-2 font-semibold"><span className="sr-only">Thao tác</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((c) => (
                <tr key={c.id} className="h-12">
                  <td className="px-3 py-2">
                    <div className="font-semibold text-ink">{c.full_name}</div>
                    <div className="num text-xs text-muted">{c.phone}{c.email ? ` · ${c.email}` : ''}</div>
                  </td>
                  <td className="px-3 py-2 text-ink-2">{c.admin_name || '—'}</td>
                  <td className="num px-3 py-2">{c.report_count}</td>
                  <td className="px-3 py-2 text-xs text-muted">{dateTime(c.created_at)}<br />{c.last_login_at ? dateTime(c.last_login_at) : 'chưa đăng nhập lại'}</td>
                  <td className="px-3 py-2">
                    <span className={clsx('chip text-[11px] font-semibold', c.is_active ? 'bg-good/15 text-good' : 'bg-danger/10 text-danger')}>
                      {c.is_active ? (c.must_change_password ? 'Đang dùng mật khẩu tạm' : 'Đang dùng') : 'Đã khoá'}
                    </span>
                    {!c.is_active && c.locked_reason && <div className="mt-0.5 max-w-[14rem] truncate text-xs text-muted" title={c.locked_reason}>{c.locked_reason}</div>}
                  </td>
                  {canManage && (
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        {c.is_active ? (
                          <button type="button" className="btn-ghost tap px-2.5 text-xs" disabled={!!busy} onClick={() => { setLock(c); setReason(''); }}>
                            <Lock size={13} aria-hidden="true" /> Khoá
                          </button>
                        ) : (
                          <button type="button" className="btn-ghost tap px-2.5 text-xs" disabled={!!busy} onClick={() => unlock(c)}>
                            <Unlock size={13} aria-hidden="true" /> Mở khoá
                          </button>
                        )}
                        <button type="button" className="btn-secondary tap px-2.5 text-xs" disabled={!!busy} onClick={() => reset(c)}>
                          <KeyRound size={13} aria-hidden="true" /> Đặt mật khẩu tạm
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {lock && (
        <Modal
          open
          onClose={() => setLock(null)}
          title={`Khoá tài khoản ${lock.phone}`}
          footer={(
            <div className="flex w-full justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setLock(null)}>Huỷ</button>
              <button type="button" className="btn-danger" disabled={!reason.trim() || !!busy} onClick={doLock}>Khoá tài khoản</button>
            </div>
          )}
        >
          <label htmlFor="khoa-ly-do" className="mb-1 block text-xs font-semibold text-ink-2">Lý do khoá (ghi nhật ký)</label>
          <input id="khoa-ly-do" className="input" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD báo tin giả nhiều lần" />
          <p className="mt-2 text-xs text-muted">{lock.full_name} không đăng nhập, không gửi phản ánh được tới khi mở khoá. Gọi 112 vẫn gọi được.</p>
        </Modal>
      )}

      {temp && (
        <Modal open onClose={() => setTemp(null)} title="Mật khẩu tạm — chỉ hiện một lần">
          <p className="text-sm">Đọc cho <b>{temp.name}</b> ({temp.phone}):</p>
          <div className="my-3 flex items-center justify-center gap-2">
            <b className="num select-all rounded-lg bg-panel2 px-4 py-2 text-2xl tracking-widest">{temp.password}</b>
            <button type="button" className="btn-ghost p-2" aria-label="Sao chép mật khẩu tạm" onClick={() => navigator.clipboard?.writeText(temp.password)}>
              <Copy size={16} aria-hidden="true" />
            </button>
          </div>
          <p className="text-xs text-muted">Người dân đăng nhập bằng số điện thoại + mật khẩu tạm, rồi phải đặt mật khẩu của riêng mình. Đóng hộp này thì không xem lại được.</p>
        </Modal>
      )}
    </section>
  );
}
