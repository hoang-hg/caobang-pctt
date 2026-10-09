import { CloudOff } from 'lucide-react';
import { ago, time } from '../../utils/format';
import { useOnline } from '../../utils/useOnline';

/**
 * Mất mạng: số liệu trên màn hình là lần tải cuối — nói rõ lúc nào và việc gì chưa làm được, để không ai đọc số cũ như số
 * hiện tại. Màu trung tính (không dùng thang màu rủi ro: mất mạng không phải mức nguy hiểm của thiên tai).
 */
export default function ConnectionBanner({ updatedAt }) {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="alert" className="card flex items-start gap-2 border-ink/30 bg-panel2 px-3 py-2 text-xs text-ink">
      <CloudOff size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p className="leading-snug">
        <b>Mất kết nối mạng</b> — số liệu đang hiện là lần tải {updatedAt ? `lúc ${time(updatedAt)} (${ago(updatedAt)})` : 'trước'},
        chưa cập nhật. Báo cáo nhanh / phiếu SOS chưa gửi được tới khi có mạng — việc khẩn hãy gọi điện cho trực ban.
      </p>
    </div>
  );
}
