import { useQueryClient } from '@tanstack/react-query';
import { CloudOff, RotateCw } from 'lucide-react';
import { ago, time } from '../../utils/format';
import { useOnline } from '../../utils/useOnline';

/**
 * Mất mạng: số liệu trên màn hình là lần tải cuối — nói rõ lúc nào và việc gì chưa làm được, để không ai đọc số cũ như số
 * hiện tại. Màu trung tính (không dùng thang màu rủi ro: mất mạng không phải mức nguy hiểm của thiên tai). Nút "Thử lại"
 * (bản vẽ desktop khung M2) tải lại các số liệu đang hiện.
 */
export default function ConnectionBanner({ updatedAt }) {
  const online = useOnline();
  const qc = useQueryClient();
  if (online) return null;
  return (
    <div role="alert" className="card flex items-center gap-2 border-ink/30 bg-panel2 px-3 py-2 text-xs text-ink">
      <CloudOff size={16} className="shrink-0" aria-hidden="true" />
      <p className="leading-snug">
        <b>Mất kết nối mạng</b> — số liệu đang hiện là lần tải {updatedAt ? `lúc ${time(updatedAt)} (${ago(updatedAt)})` : 'trước'},
        chưa cập nhật. Báo cáo nhanh / phiếu SOS chưa gửi được tới khi có mạng — việc khẩn hãy gọi điện cho trực ban.
      </p>
      <button type="button" onClick={() => qc.refetchQueries({ type: 'active' })} className="btn-secondary tap ml-auto shrink-0 px-3 py-1 text-xs">
        <RotateCw size={13} aria-hidden="true" /> Thử lại
      </button>
    </div>
  );
}
