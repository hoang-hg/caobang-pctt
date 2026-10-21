import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Moon, Sun, Volume2, VolumeX, ShieldAlert, Globe, Menu, X } from 'lucide-react';
import clsx from 'clsx';
import { useStore } from '../../app/store';
import { usePermission } from '../../rbac/usePermission';
import AdminFilter from '../common/AdminFilter';
import OmniSearch from '../common/OmniSearch';
import UserMenu from '../common/UserMenu';
import { useNavBadges } from './Sidebar';

// Điều khiển chế độ giả lập: CHỈ máy dev (bản build chạy thật không có mã giả lập — app/store.js)
const SimulationBar = import.meta.env.DEV ? lazy(() => import('../common/SimulationBar')) : null;
// Báo cáo nhanh → tạo phiếu SOS: một nút cố định trên thanh trên cùng ở mọi trang (máy tính bảng, máy tính); điện thoại dùng
// "Báo SOS" ở thanh thao tác dưới cùng. Hộp thoại chỉ tải khi bấm
const QuickIncidentModal = lazy(() => import('../dashboard/QuickIncidentModal'));

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
  const { theme, toggleTheme, wsStatus, soundOn, toggleSound, mobileMenuOpen, setMobileMenuOpen, audioReady } = useStore();
  // Điện thoại: menu thu vào nút ☰ — SOS chờ xử lý / lệnh cảnh báo chờ bạn duyệt hiện số đỏ ngay trên nút
  const badges = useNavBadges();
  const urgent = badges.sos + badges.alerts;
  const canReport = usePermission('sos', 'create');
  const [reportOpen, setReportOpen] = useState(false);

  return (
    <header className="no-print sticky top-0 z-[1100] flex h-14 shrink-0 items-center gap-2 border-b border-line bg-panel/95 px-3 backdrop-blur-md">
      {/* Nút mở menu trên Mobile */}
      <button
        className="btn-ghost touch-hit relative p-1.5 lg:hidden text-ink-2"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        aria-label={urgent ? `Mở danh mục điều hướng (${urgent} việc khẩn chờ xử lý)` : 'Mở danh mục điều hướng'}
        title="Danh mục menu"
      >
        {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        {!mobileMenuOpen && urgent > 0 && (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-4 text-white">
            {urgent}
          </span>
        )}
      </button>

      {/* Logo & Tiêu đề cơ quan */}
      <Link to="/dashboard" className="touch-hit flex items-center gap-2.5 pr-2 transition-opacity hover:opacity-90">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-danger text-white">
          <ShieldAlert size={20} />
        </div>
        <div className="hidden leading-tight lg:block">
          <div className="text-sm font-bold tracking-tight text-ink flex items-center gap-1.5">
            BCH PCTT & TKCN Cao Bằng
          </div>
          <div className="text-[11px] text-muted truncate max-w-[280px]">Trung tâm Điều hành Phòng chống thiên tai</div>
        </div>
      </Link>

      {/* Bộ lọc địa phương: ở MỌI cỡ màn (trước đây dưới 1024 px nằm trong menu ☰ — chạm 2 lần mới đổi được địa bàn). Dưới
          1024 px nhãn gọn, co lại trước các nút khác; tên cơ quan chỉ hiện từ 1024 px để nhường chỗ */}
      <div className="min-w-0 max-w-[14rem] flex-1 lg:max-w-none lg:flex-none">
        <AdminFilter />
      </div>

      {/* Tìm kiếm toàn năng: từ 768 px là ô tìm; điện thoại là nút kính lúp (mở hộp tìm toàn màn) đứng cạnh cụm nút bên phải —
          trước đây điện thoại không tìm được gì */}
      <div className="ml-auto min-w-0 flex-none md:ml-0 md:max-w-sm md:flex-1">
        <OmniSearch />
      </div>

      {/* Cụm công cụ bên phải — không co (ô tìm kiếm co thay). Nhãn chữ hiện dần theo bề rộng để header không tràn và ô tìm
          kiếm luôn còn chỗ: tên cơ quan từ md, bộ lọc từ lg, đồng hồ + tên tài khoản từ xl, chữ "Cổng người dân" / "Trực
          tuyến" / "Bấm để bật chuông SOS" từ 2xl; hẹp hơn chỉ còn biểu tượng (có title / aria-label) */}
      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        {/* Điều khiển Giả lập tác chiến */}
        {SimulationBar && <Suspense fallback={null}><SimulationBar /></Suspense>}

        {canReport && (
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="btn-danger tap-sq hidden h-9 min-w-[36px] px-2.5 sm:inline-flex"
            aria-label="Báo cáo nhanh"
            title="Báo cáo nhanh hiện trường → tạo phiếu SOS"
          >
            <ShieldAlert size={15} aria-hidden="true" />
            <span className="hidden font-semibold lg:inline">Báo cáo nhanh</span>
          </button>
        )}
        {reportOpen && (
          <Suspense fallback={null}>
            <QuickIncidentModal open onClose={() => setReportOpen(false)} />
          </Suspense>
        )}

        {/* Nút xem Cổng công khai cho người dân */}
        <Link
          to="/cong-khai"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost touch-hit hidden md:inline-flex text-xs px-2.5 py-1.5 text-accent border-accent/30 bg-accent/5 hover:bg-accent/10"
          title="Mở Cổng thông tin công khai dành cho người dân"
          aria-label="Cổng người dân"
        >
          <Globe size={14} className="shrink-0" />
          <span className="hidden font-semibold 2xl:inline">Cổng người dân</span>
        </Link>

        {/* Trạng thái kết nối WebSocket Realtime. Điện thoại (dưới 640 px): chỉ hiện khi đang nối lại / mất kết nối — lúc bình
            thường nhường chỗ cho bộ lọc địa phương (tình trạng vẫn xem được trong menu tài khoản) */}
        <span
          className={clsx(
            'chip text-[11px] font-medium py-1 px-2.5 transition-colors',
            wsStatus === 'online' && 'max-sm:hidden',
            wsStatus === 'online' ? 'bg-good/15 text-good border-good/30' : wsStatus === 'connecting' ? 'bg-warn/15 text-warn border-warn/30' : 'bg-danger/15 text-danger border-danger/30'
          )}
          title={`Kết nối thời gian thực: ${wsStatus === 'online' ? 'Đang hoạt động' : wsStatus === 'connecting' ? 'Đang kết nối lại' : 'Mất kết nối'}`}
        >
          <span className={clsx('h-2 w-2 rounded-full shrink-0', wsStatus === 'online' ? 'bg-good animate-pulse' : wsStatus === 'connecting' ? 'bg-warn animate-ping' : 'bg-danger')} />
          {/* Trực tuyến: chấm xanh là đủ (chữ từ 2xl). Mất kết nối / đang nối: hiện chữ từ sm — trực ban phải thấy ngay */}
          <span className={clsx('hidden font-mono', wsStatus === 'online' ? '2xl:inline' : 'sm:inline')}>
            {wsStatus === 'online' ? 'Trực tuyến' : wsStatus === 'connecting' ? 'Đang nối…' : 'Mất kết nối'}
          </span>
        </span>

        {/* Trình duyệt đang chặn âm thanh (trang mở lại, chưa ai bấm) → chuông SOS sẽ im: nhắc bấm để mở khoá */}
        {soundOn && !audioReady && (
          <button
            type="button"
            className="chip touch-hit animate-pulse border border-warn bg-warn/15 px-2.5 py-1 text-[11px] font-semibold text-ink"
            title="Trình duyệt chặn âm thanh tới khi bấm vào trang — bấm để chuông SOS kêu được"
          >
            <VolumeX size={13} className="text-warn" /> <span className="hidden 2xl:inline">Bấm để bật chuông SOS</span>
          </button>
        )}

        {/* Nút bật/tắt âm báo SOS — điện thoại: trong menu tài khoản (nhường chỗ cho bộ lọc địa phương) */}
        <button
          className={clsx('btn-ghost touch-hit p-2 transition-colors max-sm:hidden', soundOn ? 'text-accent' : 'text-muted')}
          onClick={toggleSound}
          title={soundOn ? 'Âm báo SOS: BẬT (bấm để tắt)' : 'Âm báo SOS: TẮT (bấm để bật)'}
          aria-label="Bật tắt âm báo SOS"
        >
          {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>

        {/* Nút đổi giao diện Sáng / Tối — điện thoại: chỉ trong menu tài khoản (Theo máy / Sáng / Tối), nhường chỗ cho tên địa bàn */}
        <button
          className="btn-ghost touch-hit p-2 transition-transform active:rotate-45 max-sm:hidden"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Chuyển sang nền Sáng' : 'Chuyển sang nền Tối'}
          aria-label="Nền tối"
          aria-pressed={theme === 'dark'}
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
