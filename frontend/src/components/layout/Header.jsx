import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Moon, Sun, Volume2, VolumeX, ShieldAlert, Globe, Menu, X } from 'lucide-react';
import clsx from 'clsx';
import { useStore } from '../../app/store';
import AdminFilter from '../common/AdminFilter';
import OmniSearch from '../common/OmniSearch';
import UserMenu from '../common/UserMenu';

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="hidden text-right leading-tight xl:block pl-2 border-l border-line/60">
      <div className="font-mono text-sm font-semibold tabular-nums text-ink">{now.toLocaleTimeString('vi-VN')}</div>
      <div className="text-[11px] text-muted">{now.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
    </div>
  );
}

export default function Header() {
  const { theme, toggleTheme, wsStatus, soundOn, toggleSound, mobileMenuOpen, setMobileMenuOpen } = useStore();

  return (
    <header className="no-print sticky top-0 z-[1100] flex h-14 shrink-0 items-center gap-2 border-b border-line bg-panel/95 px-3 backdrop-blur-md">
      {/* Nút mở menu trên Mobile */}
      <button
        className="btn-ghost p-1.5 lg:hidden text-ink-2"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        aria-label="Mở danh mục điều hướng"
        title="Danh mục menu"
      >
        {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Logo & Tiêu đề cơ quan */}
      <Link to="/dashboard" className="flex items-center gap-2.5 pr-2 transition-opacity hover:opacity-90">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-danger to-red-700 text-white shadow-sm shadow-danger/25">
          <ShieldAlert size={20} />
        </div>
        <div className="hidden leading-tight sm:block">
          <div className="text-sm font-bold tracking-tight text-ink flex items-center gap-1.5">
            BCH PCTT & TKCN Cao Bằng
            <span className="hidden xl:inline-block rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-semibold text-danger">TOC</span>
          </div>
          <div className="text-[11px] text-muted truncate max-w-[280px]">Trung tâm Điều hành Phòng chống thiên tai</div>
        </div>
      </Link>

      {/* Bộ lọc địa phương */}
      <div className="hidden sm:block">
        <AdminFilter />
      </div>

      {/* Tìm kiếm toàn diện */}
      <div className="min-w-0 flex-1 max-w-sm">
        <OmniSearch />
      </div>

      {/* Cụm công cụ bên phải */}
      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        {/* Nút xem Cổng công khai cho người dân */}
        <Link
          to="/cong-khai"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost hidden md:inline-flex text-xs px-2.5 py-1.5 text-accent border-accent/30 bg-accent/5 hover:bg-accent/10"
          title="Mở Cổng thông tin công khai dành cho người dân"
        >
          <Globe size={14} className="shrink-0" />
          <span className="font-semibold">Cổng người dân</span>
        </Link>

        {/* Trạng thái kết nối WebSocket Realtime */}
        <span
          className={clsx(
            'chip text-[11px] font-medium py-1 px-2.5 transition-colors',
            wsStatus === 'online' ? 'bg-good/15 text-good border-good/30' : wsStatus === 'connecting' ? 'bg-warn/15 text-warn border-warn/30' : 'bg-danger/15 text-danger border-danger/30'
          )}
          title={`Kết nối thời gian thực: ${wsStatus === 'online' ? 'Đang hoạt động' : wsStatus === 'connecting' ? 'Đang kết nối lại' : 'Mất kết nối'}`}
        >
          <span className={clsx('h-2 w-2 rounded-full shrink-0', wsStatus === 'online' ? 'bg-good animate-pulse' : wsStatus === 'connecting' ? 'bg-warn animate-ping' : 'bg-danger')} />
          <span className="hidden md:inline font-mono">{wsStatus === 'online' ? 'Trực tuyến' : wsStatus === 'connecting' ? 'Đang nối…' : 'Mất kết nối'}</span>
        </span>

        {/* Nút bật/tắt âm báo SOS */}
        <button
          className={clsx('btn-ghost p-2 transition-colors', soundOn ? 'text-accent' : 'text-muted')}
          onClick={toggleSound}
          title={soundOn ? 'Âm báo SOS: BẬT (bấm để tắt)' : 'Âm báo SOS: TẮT (bấm để bật)'}
          aria-label="Bật tắt âm báo SOS"
        >
          {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>

        {/* Nút đổi giao diện Sáng / Tối */}
        <button
          className="btn-ghost p-2 transition-transform active:rotate-45"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Chuyển sang nền Sáng' : 'Chuyển sang nền Tối'}
          aria-label="Đổi nền sáng tối"
        >
          {theme === 'dark' ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-indigo-500" />}
        </button>

        {/* Đồng hồ số */}
        <Clock />

        {/* Menu thông tin tài khoản */}
        <UserMenu />
      </div>
    </header>
  );
}
