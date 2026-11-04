import { useState } from 'react';
import { X } from 'lucide-react';
import { useStore } from '../../app/store';

/**
 * Nhắc bật chuông SOS (bản vẽ desktop khung M1b): trình duyệt chặn âm thanh tới lần bấm đầu tiên → thẻ nổi giữa trên "Bấm để
 * bật chuông SOS". Bấm bất kỳ đâu trên trang là chuông mở (watchAudioUnlock — App.jsx) và thẻ tự mất; "✕" ẩn trong lần mở
 * trang này. Chỉ máy tính ≥ 1024 px (điện thoại đã có dòng nhắc ở thanh trạng thái), chỉ khi chuông đang bật, không khi
 * trình chiếu. Nút đóng cùng tên "Đóng thông báo" với các thẻ nổi khác.
 */
export default function BellReminder() {
  const soundOn = useStore((s) => s.soundOn);
  const audioReady = useStore((s) => s.audioReady);
  const presentation = useStore((s) => s.presentation);
  const [hidden, setHidden] = useState(false);
  if (!soundOn || audioReady || presentation || hidden) return null;
  return (
    <div
      role="status"
      className="no-print card fixed left-1/2 top-[84px] z-[1900] flex w-[26rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 gap-3 rounded-[16px] border-l-4 border-l-accent p-4 shadow-[0_10px_30px_rgb(15_23_42/0.18)] max-lg:hidden"
    >
      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold text-ink">Bấm để bật chuông SOS</div>
        <p className="mt-0.5 text-sm leading-snug text-ink-2">
          Trình duyệt chặn âm thanh tới lần bấm đầu tiên. Bấm bất kỳ đâu trên trang để nghe chuông khi có SOS mới.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setHidden(true)}
        className="tap-sq -mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-panel2 hover:text-ink"
        aria-label="Đóng thông báo"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
