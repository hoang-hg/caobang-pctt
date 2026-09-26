import { useEffect, useState } from 'react';
import { Moon, Sun, Volume2, VolumeX, Wifi, WifiOff, ShieldAlert } from 'lucide-react';
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
    <div className="hidden text-right leading-tight xl:block">
      <div className="font-mono text-base font-semibold tabular-nums">{now.toLocaleTimeString('vi-VN')}</div>
      <div className="text-[11px] text-muted">{now.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
    </div>
  );
}

export default function Header() {
  const { theme, toggleTheme, wsStatus, soundOn, toggleSound } = useStore();
  return (
    <header className="no-print flex h-14 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
      <div className="flex items-center gap-2 pr-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-danger text-white">
          <ShieldAlert size={20} />
        </div>
        <div className="hidden leading-tight md:block">
          <div className="text-sm font-bold">BCH PCTT & TKCN tỉnh Cao Bằng</div>
          <div className="text-[11px] text-muted">Trung tâm Điều hành Phòng chống thiên tai & Tìm kiếm cứu nạn</div>
        </div>
      </div>
      <AdminFilter />
      <OmniSearch />
      <div className="ml-auto flex items-center gap-2">
        <Clock />
        <span
          className={clsx('chip', wsStatus === 'online' ? 'bg-good/15 text-good' : 'bg-danger/15 text-danger')}
          title="Kết nối thời gian thực (WebSocket)"
        >
          {wsStatus === 'online' ? <Wifi size={12} /> : <WifiOff size={12} />}
          <span className="hidden sm:inline">{wsStatus === 'online' ? 'Trực tuyến' : wsStatus === 'connecting' ? 'Đang nối…' : 'Mất kết nối'}</span>
        </span>
        <button className="btn-ghost px-2" onClick={toggleSound} title={soundOn ? 'Tắt âm báo SOS' : 'Bật âm báo SOS'}>
          {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
        <button className="btn-ghost px-2" onClick={toggleTheme} title="Chuyển chế độ Sáng/Tối">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <UserMenu />
      </div>
    </header>
  );
}
