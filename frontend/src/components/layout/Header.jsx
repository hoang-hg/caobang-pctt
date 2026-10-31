import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Moon, Sun, Volume2, VolumeX, ShieldAlert, Globe, Menu, X } from 'lucide-react';
import clsx from 'clsx';
import { useStore } from '../../app/store';
import { usePermission } from '../../rbac/usePermission';
import AdminFilter from '../common/AdminFilter';
import OmniSearch from '../common/OmniSearch';
import UserMenu from '../common/UserMenu';
import BrandMark from './BrandMark';
import TopNav from './TopNav';
import { useNavBadges } from './Sidebar';

// Điều khiển chế độ giả lập (app/store.js): chunk riêng kèm dữ liệu mẫu — chỉ tải khi đang bật giả lập
const SimulationBar = lazy(() => import('../common/SimulationBar'));
// Báo cáo nhanh → tạo phiếu SOS: một nút cố định trên thanh trên cùng ở mọi trang (máy tính bảng, máy tính); điện thoại dùng
// "Báo SOS" ở thanh thao tác dưới cùng. Hộp thoại chỉ tải khi bấm
const QuickIncidentModal = lazy(() => import('../dashboard/QuickIncidentModal'));

// Đồng hồ trên thanh trên: từ 1536 px khi KHÔNG có thanh trạng thái dưới cùng (dưới đó nhường chỗ cho menu ngang); màn đủ cao
// thì đồng hồ ở thanh trạng thái (StatusBar)
function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="hidden border-l border-line/60 pl-2 text-right leading-tight 2xl:block 2xl:tall:hidden">
      <div className="num text-sm font-semibold text-ink">{now.toLocaleTimeString('vi-VN')}</div>
      <div className="text-[11px] text-muted">{now.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
    </div>
  );
}

export default function Header() {
  const { theme, toggleTheme, wsStatus, soundOn, toggleSound, mobileMenuOpen, setMobileMenuOpen, audioReady, simulationMode } = useStore();
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

      {/* Logo & tên cơ quan (khiên xanh — đỏ chỉ dành cho báo động). Máy tính: không còn menu trái (DESIGN.md, phương án B) —
          tên hệ thống 2 dòng như bản mẫu B từ 1440 px (menu ngang tự dồn mục thừa vào "Thêm") */}
      <Link to="/dashboard" className="touch-hit flex shrink-0 items-center gap-2.5 pr-1 transition-opacity hover:opacity-90">
        <BrandMark size={36} />
        <div className="hidden min-w-0 leading-tight min-[1440px]:block">
          <div className="truncate text-[15px] font-bold tracking-tight text-ink">ĐIỀU HÀNH PCTT</div>
          <div className="truncate text-xs text-muted">Tỉnh Cao Bằng</div>
        </div>
      </Link>

      <TopNav />

      {/* Bộ lọc địa phương: ở MỌI cỡ màn (trước đây dưới 1024 px nằm trong menu ☰ — chạm 2 lần mới đổi được địa bàn). Dưới
          1024 px nhãn gọn, co lại trước các nút khác; tên cơ quan chỉ hiện từ 1024 px để nhường chỗ */}
      <div className="min-w-0 max-w-[14rem] flex-1 lg:max-w-none lg:flex-none">
        <AdminFilter />
      </div>

      {/* Tìm kiếm toàn năng: từ 768 px là ô tìm; điện thoại là nút kính lúp (mở hộp tìm toàn màn) đứng cạnh cụm nút bên phải —
          trước đây điện thoại không tìm được gì */}
      <div className="ml-auto min-w-0 flex-none md:ml-0 md:max-w-sm md:flex-1 lg:w-44 lg:flex-none xl:w-52 2xl:w-72">
        <OmniSearch />
      </div>

      {/* Cụm công cụ bên phải — không co (menu ngang tự dồn mục vào "Thêm" khi chật). Máy tính ≥ 1024 px: chuông SOS, Sáng/Tối
          trong menu tài khoản, cổng người dân trong "Thêm" (nhường chỗ cho menu ngang); màn đủ cao còn có thanh trạng thái dưới
          cùng (StatusBar). Máy tính bảng: các nút đó ở đây, chỉ còn biểu tượng */}
      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        {/* Điều khiển Giả lập tác chiến */}
        {simulationMode && <Suspense fallback={null}><SimulationBar /></Suspense>}

        {canReport && (
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="btn-danger tap-sq hidden h-9 min-w-[36px] px-2.5 sm:inline-flex"
            aria-label="Báo cáo nhanh"
            title="Báo cáo nhanh hiện trường → tạo phiếu SOS"
          >
            <ShieldAlert size={15} aria-hidden="true" />
            <span className="hidden font-semibold xl:inline">Báo cáo nhanh</span>
          </button>
        )}
        {reportOpen && (
          <Suspense fallback={null}>
            <QuickIncidentModal open onClose={() => setReportOpen(false)} />
          </Suspense>
        )}

        {/* Nút xem Cổng công khai cho người dân (chỉ hiện icon) */}
        <Link
          to="/cong-khai"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost touch-hit hidden md:inline-flex lg:hidden p-2 text-accent border border-accent/30 bg-accent/5 hover:bg-accent/10 rounded-lg"
          title="Mở Cổng thông tin công khai dành cho người dân"
          aria-label="Cổng người dân"
        >
          <Globe size={16} className="shrink-0" />
        </Link>

        {/* Cảnh báo kết nối: chỉ hiện khi mất kết nối hoặc đang kết nối lại (ẩn hoàn toàn khi trực tuyến bình thường) */}
        {wsStatus !== 'online' && (
          <span
            className={clsx(
              'chip text-[11px] font-medium py-1 px-2.5 transition-colors lg:tall:hidden',
              wsStatus === 'connecting' ? 'bg-warn/15 text-warn border-warn/30' : 'bg-danger/15 text-danger border-danger/30',
            )}
            title={`Kết nối thời gian thực: ${wsStatus === 'connecting' ? 'Đang kết nối lại' : 'Mất kết nối'}`}
          >
            <span className={clsx('h-2 w-2 rounded-full shrink-0', wsStatus === 'connecting' ? 'bg-warn motion-safe:animate-ping' : 'bg-danger')} />
            <span className="hidden font-mono sm:inline">
              {wsStatus === 'connecting' ? 'Đang nối…' : 'Mất kết nối'}
            </span>
          </span>
        )}

        {/* Trình duyệt đang chặn âm thanh (trang mở lại, chưa ai bấm) → chuông SOS sẽ im: nhắc bấm để mở khoá. Màn không có
            thanh trạng thái (laptop 1366 × 768, máy tính bảng) chỉ thấy lời nhắc này ở đây — không bỏ */}
        {soundOn && !audioReady && (
          <button
            type="button"
            className="chip touch-hit border border-warn bg-warn/15 px-2.5 py-1 text-[11px] font-semibold text-ink lg:tall:hidden"
            title="Trình duyệt chặn âm thanh tới khi bấm vào trang — bấm để chuông SOS kêu được"
          >
            <VolumeX size={13} className="text-warn" /> <span className="hidden 2xl:inline">Bấm để bật chuông SOS</span>
          </button>
        )}

        {/* Nút bật/tắt âm báo SOS — điện thoại: trong menu tài khoản (nhường chỗ cho bộ lọc địa phương); màn đủ cao: thanh trạng thái */}
        <button
          className={clsx('btn-ghost touch-hit p-2 transition-colors max-sm:hidden lg:hidden', soundOn ? 'text-accent' : 'text-muted')}
          onClick={toggleSound}
          title={soundOn ? 'Âm báo SOS: BẬT (bấm để tắt)' : 'Âm báo SOS: TẮT (bấm để bật)'}
          aria-label="Bật tắt âm báo SOS"
          aria-pressed={soundOn}
        >
          {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>

        {/* Nút đổi giao diện Sáng / Tối — điện thoại: chỉ trong menu tài khoản (Theo máy / Sáng / Tối), nhường chỗ cho tên địa bàn */}
        <button
          className="btn-ghost touch-hit p-2 transition-transform active:rotate-45 max-sm:hidden lg:hidden"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Chuyển sang nền Sáng' : 'Chuyển sang nền Tối'}
          aria-label="Nền tối"
          aria-pressed={theme === 'dark'}
        >
          {theme === 'dark' ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-muted" />}
        </button>

        <Clock />

        {/* Menu thông tin tài khoản */}
        <UserMenu />
      </div>
    </header>
  );
}
