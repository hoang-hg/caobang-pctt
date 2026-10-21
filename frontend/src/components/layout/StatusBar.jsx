import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Globe, Moon, Sun, Volume2, VolumeX } from 'lucide-react';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { usePermission } from '../../rbac/usePermission';
import { useMediaQuery } from '../../utils/useMediaQuery';

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="num whitespace-nowrap text-slate-200">
      <b className="font-semibold">{now.toLocaleTimeString('vi-VN')}</b>
      <span className="text-slate-400"> · {now.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
    </span>
  );
}

// Cùng điều kiện với `lg:tall:` của Tailwind (tailwind.config.js) — Header ẩn các nút trùng bằng chính điều kiện đó
const STATUS_BAR_QUERY = '(min-width: 1024px) and (min-height: 860px)';

const WS = {
  online: ['bg-green-400', 'text-green-300', 'Đang trực — kết nối tức thì'],
  connecting: ['bg-amber-400', 'text-amber-300', 'Đang nối lại…'],
  offline: ['bg-red-400', 'text-red-300', 'Mất kết nối — số liệu có thể chưa mới'],
};

/**
 * Thanh trạng thái dưới cùng — màn rộng ≥ 1024 px và cao ≥ 860 px (`lg:tall:`; docs/ke-hoach-lam-moi-giao-dien.md mục 5,
 * như trang tham khảo): cảm giác trung tâm đang trực. Kết nối tức thì · chuông SOS (bấm bật / tắt; trình duyệt chặn âm thanh
 * thì nhắc bấm) · nguồn số liệu (chỉ tài khoản được xem nguồn dữ liệu; nguồn lỗi → chữ đỏ, bấm mở trang Nguồn dữ liệu) ·
 * cổng người dân · nền Sáng / Tối · đồng hồ. Màn hẹp hoặc thấp hơn (laptop 1366×768): các nút này ở thanh trên / menu tài
 * khoản như cũ (Header) — thanh không được vẽ (không vẽ rồi ẩn: khỏi gọi nguồn số liệu mỗi phút trên điện thoại). Nền tối cố định.
 */
export default function StatusBar() {
  const { theme, toggleTheme, wsStatus, soundOn, toggleSound, audioReady } = useStore();
  const show = useMediaQuery(STATUS_BAR_QUERY);
  const canSources = usePermission('integration', 'view');
  const { data: sources } = useQuery({
    queryKey: ['int-sources'],
    queryFn: () => api('/integrations/sources'),
    enabled: canSources && show,
    refetchInterval: 60_000,
  });
  if (!show) return null;
  const [dot, text, label] = WS[wsStatus] || WS.offline;
  const on = (sources || []).filter((s) => s.enabled);
  const broken = on.filter((s) => s.status === 'loi').length;

  return (
    <footer
      className="no-print flex h-8 shrink-0 items-center gap-4 border-t border-black/30 bg-[#0f172a] px-4 text-xs text-slate-300"
      aria-label="Thanh trạng thái"
    >
      <span className={clsx('flex items-center gap-1.5 font-medium', text)} role="status">
        <span className={clsx('h-2 w-2 shrink-0 rounded-full', dot)} aria-hidden="true" /> {label}
      </span>
      <button
        type="button"
        onClick={toggleSound}
        className={clsx('flex h-6 items-center gap-1.5 rounded px-1.5 hover:bg-white/10', soundOn ? 'text-slate-200' : 'text-slate-400')}
        aria-label="Bật tắt âm báo SOS"
        aria-pressed={soundOn}
        title={soundOn ? 'Bấm để tắt chuông SOS' : 'Bấm để bật chuông SOS'}
      >
        {soundOn ? <Volume2 size={13} aria-hidden="true" /> : <VolumeX size={13} aria-hidden="true" />}
        Chuông SOS: {soundOn ? 'bật' : 'tắt'}
      </button>
      {soundOn && !audioReady && (
        <span className="text-amber-300" title="Trình duyệt chặn âm thanh tới khi bấm vào trang">Bấm vào trang một lần để chuông kêu được</span>
      )}
      {canSources && sources && (
        broken > 0 ? (
          <Link to="/nguon-du-lieu" className="font-medium text-red-300 hover:underline">
            {broken} nguồn số liệu đang lỗi — xem
          </Link>
        ) : (
          <span className="text-slate-400">{on.length} nguồn số liệu bình thường</span>
        )
      )}

      <span className="ml-auto flex items-center gap-3">
        <Link
          to="/cong-khai"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-slate-300 hover:text-white hover:underline"
          title="Mở Cổng thông tin dành cho người dân (thẻ mới)"
        >
          <Globe size={13} aria-hidden="true" /> Cổng người dân
        </Link>
        <button
          type="button"
          onClick={toggleTheme}
          className="flex h-6 items-center gap-1.5 rounded px-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
          aria-label="Nền tối"
          aria-pressed={theme === 'dark'}
          title={theme === 'dark' ? 'Chuyển sang nền Sáng' : 'Chuyển sang nền Tối'}
        >
          {theme === 'dark' ? <Sun size={13} aria-hidden="true" /> : <Moon size={13} aria-hidden="true" />}
          Nền {theme === 'dark' ? 'Tối' : 'Sáng'}
        </button>
        <Clock />
      </span>
    </footer>
  );
}
