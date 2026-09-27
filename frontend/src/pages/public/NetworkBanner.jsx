import { useEffect, useState } from 'react';
import { CloudOff, Feather, X } from 'lucide-react';
import { useStore } from '../../app/store';
import { dateTime } from '../../utils/format';

const HINT_KEY = 'pctt_lite_hint';

/** Trình duyệt báo tiết kiệm dữ liệu hoặc mạng 2G (Network Information API — Chrome / Android; nơi khác: không biết). */
const slowNetwork = () => {
  const c = navigator.connection;
  return !!c && (c.saveData || ['slow-2g', '2g'].includes(c.effectiveType));
};

/**
 * Dải thông báo đầu cổng công khai (README 9.4):
 * - mất mạng / đang xem bản service worker đã lưu → thời điểm lưu + nhắc gọi 112;
 * - mạng chậm → gợi ý bản nhẹ /ban-nhe (tắt được trong phiên).
 */
export default function NetworkBanner() {
  const savedAt = useStore((s) => s.savedAt);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [slow] = useState(slowNetwork);
  const [hidden, setHidden] = useState(() => {
    try { return sessionStorage.getItem(HINT_KEY) === 'off'; } catch { return false; }
  });
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!online || savedAt) {
    return (
      <div role="status" className="border-b border-warn/40 bg-warn/15 px-3 py-2 text-center text-xs text-ink sm:text-sm">
        <CloudOff size={15} className="-mt-0.5 mr-1.5 inline text-warn" />
        <b>{online ? 'Mạng chậm hoặc máy chủ chưa phản hồi' : 'Mất kết nối mạng'}</b> — đang hiển thị dữ liệu{' '}
        {savedAt ? `đã lưu lúc ${dateTime(savedAt)}` : 'có thể chưa cập nhật'}. Khẩn cấp gọi{' '}
        <a href="tel:112" className="font-bold text-danger">112</a>.
      </div>
    );
  }
  if (!slow || hidden) return null;
  const hide = () => {
    try { sessionStorage.setItem(HINT_KEY, 'off'); } catch { /* bỏ qua */ }
    setHidden(true);
  };
  return (
    <div className="flex items-center justify-center gap-2 border-b border-accent/30 bg-accent/10 px-3 py-2 text-xs text-ink sm:text-sm">
      <Feather size={15} className="shrink-0 text-accent" />
      <span>
        Mạng chậm? Dùng <a href="/ban-nhe" className="font-bold text-accent underline">bản nhẹ</a> — cảnh báo, điểm sơ tán,
        đường dây nóng, dưới 50 KB.
      </span>
      <button className="p-1 text-muted hover:text-ink" onClick={hide} aria-label="Ẩn gợi ý">
        <X size={14} />
      </button>
    </div>
  );
}
