import { lazy, Suspense, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, LogOut, UserCircle2, ShieldCheck, KeyRound, Globe, Smartphone, Volume2, VolumeX, Monitor, Sun, Moon } from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ChangePasswordModal } from '../../pages/AccountPages';
import { useStore } from '../../app/store';
import { useClickOutside } from '../../utils/useClickOutside';
import { useMediaQuery } from '../../utils/useMediaQuery';

// Tách chunk: menu nằm trong gói tải đầu (cả cổng công khai) — chỉ tải phần xác thực 2 lớp khi mở
const MfaModal = lazy(() => import('../account/Mfa'));
// Giao diện (thiết kế F.2–F.3): Theo máy (theo hệ điều hành) · Sáng · Tối
const THEMES = [['system', 'Theo máy', Monitor], ['light', 'Sáng', Sun], ['dark', 'Tối', Moon]];

/** Thông tin tài khoản đang đăng nhập + vai trò/phạm vi được giao. */
/** Chữ viết tắt của tên: chữ đầu của từ đầu + từ cuối, viết hoa ("Hoàng Văn Sạt" → HS). */
const initials = (name = '') => {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return w.length ? (w[0][0] + (w.length > 1 ? w[w.length - 1][0] : '')).toLocaleUpperCase('vi') : '';
};

export default function UserMenu() {
  const { auth, setAuth, soundOn, toggleSound, wsStatus, themePref, setThemePref } = useStore();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [mfaOpen, setMfaOpen] = useState(false);
  const ref = useRef(null);
  const desk = useMediaQuery('(min-width: 1280px)');
  useClickOutside(ref, () => setOpen(false));
  const user = auth?.user;
  if (!user) return null;

  const logout = () => {
    setAuth(null);
    qc.clear();
  };

  return (
    <div className="relative" ref={ref}>
      {/* Như bản mẫu B: vòng tròn chữ viết tắt (chữ đầu của tên đầu + tên cuối: "Quản trị hệ thống" → QT); tên đầy đủ từ 1536 px */}
      <button className="touch-hit flex items-center gap-2 rounded-full text-sm font-medium text-ink-2 hover:text-ink" onClick={() => setOpen((o) => !o)} title={user.full_name} aria-label={`Tài khoản: ${user.full_name}`}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-panel text-[13px] font-bold text-accent" aria-hidden="true">
          {initials(user.full_name) || <UserCircle2 size={16} />}
        </span>
        <span className="hidden max-w-[10rem] truncate min-[1900px]:inline">{user.full_name}</span>
      </button>
      {/* Bản vẽ khung L6: thông tin chính trên đầu, mỗi việc một dòng. Âm báo, kết nối, cổng người dân ở thanh trạng thái dưới cùng */}
      {open && desk && (
        <div className="float-panel scroll-thin absolute right-0 top-11 z-[1200] max-h-[calc(100vh-4rem)] w-80 overflow-y-auto p-2">
          <div className="border-b border-line px-3 pb-2.5 pt-1.5">
            <div className="text-base font-bold text-ink">{user.full_name}</div>
            <div className="mt-0.5 text-[13px] leading-snug text-ink-2"><span className="font-mono">{user.username}</span>{user.position ? ` · ${user.position}` : ''}</div>
            {user.assignments.map((a) => <div key={`${a.role}@${a.domain}`} className="text-[13px] leading-snug text-ink-2">{a.role_name} · {a.domain_label}</div>)}
            {!user.assignments.length && <div className="text-[13px] text-danger">Chưa được cấp vai trò nào</div>}
            <div className="mt-1 text-xs text-muted">PIN phê duyệt: {user.has_pin ? 'đã thiết lập' : 'chưa có'}{user.email ? ` · Email khôi phục: ${user.email}` : ''}</div>
          </div>
          <div className="flex flex-col py-1 text-sm">
            <button type="button" className="tap flex h-10 items-center gap-2 rounded-xl px-3 text-left hover:bg-panel2" onClick={() => { setChanging(true); setOpen(false); }}><KeyRound size={15} aria-hidden="true" /> Đổi mật khẩu</button>
            <button type="button" className="tap flex h-10 items-center gap-2 rounded-xl px-3 text-left hover:bg-panel2" onClick={() => { setMfaOpen(true); setOpen(false); }}>
              <Smartphone size={15} aria-hidden="true" /> Xác thực 2 lớp · {user.mfa?.enabled ? <b className="font-semibold text-good">đã bật</b> : <span className="text-ink-2">chưa bật</span>}
            </button>
            <Link to="/huong-dan" className="tap flex h-10 items-center gap-2 rounded-xl px-3 hover:bg-panel2" onClick={() => setOpen(false)}><BookOpen size={15} aria-hidden="true" /> Hướng dẫn xử lý</Link>
          </div>
          <div className="border-t border-line px-3 py-2.5">
            <div className="text-[13px] font-semibold text-ink-2">Nền</div>
            <div className="mt-1 inline-flex gap-1 rounded-xl bg-panel2 p-1" role="group" aria-label="Giao diện">
              {THEMES.map(([value, label]) => (
                <button key={value} type="button" aria-pressed={themePref === value} className={clsx('tap h-8 rounded-lg px-3 text-sm', themePref === value ? 'bg-panel font-semibold text-ink shadow-sm' : 'text-ink-2 hover:text-ink')} onClick={() => setThemePref(value)}>{label}</button>
              ))}
            </div>
          </div>
          <div className="border-t border-line pt-1">
            <button type="button" className="tap flex h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold text-danger hover:bg-danger/10" onClick={logout}><LogOut size={15} aria-hidden="true" /> Đăng xuất</button>
          </div>
        </div>
      )}
      {open && !desk && (
        <div className="card scroll-thin absolute right-0 top-11 z-[1200] max-h-[calc(100vh-4rem)] w-80 overflow-y-auto p-3 shadow-2xl supports-[height:100dvh]:max-h-[calc(100dvh-4rem)]">
          <div className="font-semibold">{user.full_name}</div>
          <div className="text-xs text-muted">{user.position} · <span className="font-mono">{user.username}</span></div>
          <div className="mt-2 text-xs font-semibold text-muted">Vai trò & phạm vi</div>
          <ul className="mt-1 flex flex-col gap-1">
            {user.assignments.map((a) => (
              <li key={`${a.role}@${a.domain}`} className="flex items-start gap-2 rounded-md bg-panel2 px-2 py-1 text-xs">
                <ShieldCheck size={14} className="mt-0.5 shrink-0 text-accent" />
                <span><b>{a.role_name}</b><br /><span className="text-muted">{a.domain_label}</span></span>
              </li>
            ))}
            {!user.assignments.length && <li className="text-xs text-danger">Chưa được cấp vai trò nào</li>}
          </ul>
          <div className="mt-2 text-[11px] text-muted">{user.permissions.length} quyền · PIN phê duyệt: {user.has_pin ? 'đã thiết lập' : 'chưa có'}</div>
          <div className="mt-1 text-[11px] text-muted">
            Xác thực 2 lớp:{' '}
            {user.mfa?.enabled ? <span className="font-semibold text-good">đang bật</span> : <span className="text-warn">chưa bật</span>}
          </div>
          {user.email && <div className="mt-1 text-[11px] text-muted">Email khôi phục: {user.email}</div>}
          {/* Điện thoại và máy tính ≥ 1024 px: âm báo SOS, tình trạng kết nối nằm ở đây (thanh trên cùng nhường chỗ cho bộ lọc
              địa phương / menu ngang); máy tính bảng: nút trên thanh */}
          <div className="mt-3 flex flex-col gap-1 border-t border-line pt-2 sm:hidden lg:flex">
            <button type="button" className="btn-ghost tap justify-between text-xs" onClick={toggleSound} aria-pressed={soundOn}>
              <span className="flex items-center gap-1.5">{soundOn ? <Volume2 size={14} className="text-accent" /> : <VolumeX size={14} />} Âm báo SOS</span>
              <span className={soundOn ? 'font-semibold text-accent' : 'text-muted'}>{soundOn ? 'Đang bật' : 'Đang tắt'}</span>
            </button>
            <div className="flex items-center gap-1.5 px-1 text-[11px] text-muted">
              <span className={clsx('h-2 w-2 shrink-0 rounded-full', wsStatus === 'online' ? 'bg-good' : wsStatus === 'connecting' ? 'bg-warn' : 'bg-danger')} aria-hidden="true" />
              Kết nối thời gian thực: {wsStatus === 'online' ? 'đang hoạt động' : wsStatus === 'connecting' ? 'đang nối lại' : 'mất kết nối'}
            </div>
          </div>
          {/* Tối: phòng điều hành, màn hình lớn (chống chói khi nhìn lâu); Sáng: hiện trường ngoài trời, in báo cáo */}
          <div className="mt-3 border-t border-line pt-2">
            <div className="text-xs font-semibold text-muted">Giao diện</div>
            <div className="mt-1 grid grid-cols-3 gap-1" role="group" aria-label="Giao diện">
              {THEMES.map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={themePref === value}
                  className={clsx('btn-ghost tap justify-center gap-1 px-1.5 text-xs', themePref === value && 'border-accent bg-accent/10 text-accent hover:border-accent hover:bg-accent/15 hover:text-accent')}
                  onClick={() => setThemePref(value)}
                >
                  <Icon size={13} aria-hidden="true" /> {label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted">Tối: phòng điều hành, màn hình lớn. Sáng: hiện trường ngoài trời, in báo cáo. Theo máy: đổi cùng điện thoại / máy tính.</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1">
            <button className="btn-ghost tap justify-center text-xs" onClick={() => { setChanging(true); setOpen(false); }}><KeyRound size={13} /> Đổi mật khẩu</button>
            <button className="btn-ghost tap justify-center text-xs" onClick={() => { setMfaOpen(true); setOpen(false); }}><Smartphone size={13} /> Xác thực 2 lớp</button>
            <Link to="/cong-khai" className="btn-ghost tap col-span-2 justify-center text-xs" onClick={() => setOpen(false)}><Globe size={13} /> Cổng công khai</Link>
          </div>
          <button className="btn-ghost tap mt-1 w-full justify-center" onClick={logout}>
            <LogOut size={14} /> Đăng xuất / đổi tài khoản
          </button>
        </div>
      )}
      {changing && <ChangePasswordModal onClose={() => setChanging(false)} />}
      {mfaOpen && (
        <Suspense fallback={null}>
          <MfaModal onClose={() => setMfaOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
