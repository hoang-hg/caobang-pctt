import { useRef, useState } from 'react';
import { ClipboardList, KeyRound, LogOut, UserRound } from 'lucide-react';
import { useCitizen } from '../../app/citizenSession';
import { Modal, useEscapeToClose } from '../../components/common/ui';
import CitizenAuth from './CitizenAuth';

/**
 * Thanh trên của cổng: tài khoản NGƯỜI DÂN (Đ5) — chưa đăng nhập: nút "Đăng nhập"; đã đăng nhập: tên + menu (Phiếu của
 * tôi, Đổi mật khẩu, Đăng xuất). Tách hẳn nút "Cán bộ" (đăng nhập trang điều hành). Đang dùng mật khẩu tạm do cán bộ đặt
 * lại → mở khung đổi mật khẩu (đóng được; form gửi phản ánh vẫn đòi đổi trước khi gửi).
 */
export default function CitizenMenu({ onMyReports }) {
  const session = useCitizen((s) => s.session);
  const setSession = useCitizen((s) => s.setSession);
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState(null); // 'login' | 'change'
  const [skipTemp, setSkipTemp] = useState(false); // đã đóng khung đổi mật khẩu tạm trong lần mở trang này
  const box = useRef(null);
  useEscapeToClose(menu, () => setMenu(false));
  const mustChange = !!session?.account?.must_change_password;
  const authOpen = dialog === 'login' || dialog === 'change' || (mustChange && !skipTemp);
  const close = () => { setDialog(null); setSkipTemp(true); };

  const auth = authOpen && (
    <Modal open onClose={close} title={dialog === 'change' && !mustChange ? 'Đổi mật khẩu' : 'Tài khoản người dân'}>
      <CitizenAuth
        initial={dialog === 'change' ? 'change' : 'login'}
        reason="Đăng nhập để gửi phản ánh, yêu cầu cứu hộ và xem tiến độ các phiếu của bạn."
        onDone={() => setDialog(null)}
      />
    </Modal>
  );

  if (!session) {
    return (
      <>
        <button type="button" className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => setDialog('login')} aria-label="Đăng nhập tài khoản người dân">
          <UserRound size={14} aria-hidden="true" />
          <span className="hidden md:inline">Đăng nhập</span>
        </button>
        {auth}
      </>
    );
  }

  const name = session.account.full_name;
  const item = 'tap flex w-full items-center gap-2 rounded-lg px-3 text-left hover:bg-panel2';
  return (
    <div ref={box} className="relative" onBlur={(e) => { if (!box.current?.contains(e.relatedTarget)) setMenu(false); }}>
      <button
        type="button"
        className="btn-ghost max-w-[11rem] px-2.5 py-1.5 text-xs"
        onClick={() => setMenu((o) => !o)}
        aria-expanded={menu}
        aria-label={`Tài khoản người dân: ${name}`}
      >
        <UserRound size={14} aria-hidden="true" />
        <span className="hidden truncate md:inline">{name}</span>
      </button>
      {menu && (
        <div className="float-panel absolute right-0 top-full z-[1200] mt-1 w-56 p-1 text-sm" role="menu">
          <div className="border-b border-line px-3 py-2 text-xs text-muted">
            <div className="truncate font-semibold text-ink">{name}</div>
            <div className="num">{session.account.phone}</div>
          </div>
          <button type="button" role="menuitem" className={item} onClick={() => { setMenu(false); onMyReports?.(); }}>
            <ClipboardList size={15} aria-hidden="true" /> Phiếu của tôi
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => { setMenu(false); setDialog('change'); }}>
            <KeyRound size={15} aria-hidden="true" /> Đổi mật khẩu
          </button>
          <button type="button" role="menuitem" className={`${item} text-danger hover:bg-danger/10`} onClick={() => { setMenu(false); setSession(null); }}>
            <LogOut size={15} aria-hidden="true" /> Đăng xuất
          </button>
        </div>
      )}
      {auth}
    </div>
  );
}
