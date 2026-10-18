import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { risk } from '../../utils/risk';
import { Hint } from '../common/ui';
import { situationSentence } from './SituationBar';

/**
 * Câu tóm tắt tình hình đầu Tổng quan (ngay dưới dải khẩn) — trả lời "Đang có chuyện gì? Chỗ nào nguy hiểm nhất?" bằng
 * lời, không bắt người xem tự cộng các con số:
 * - một câu ghép từ số liệu thật (situationSentence) — chưa có số liệu thì nói chưa đánh giá được, không nói "an toàn";
 * - "Nguy hiểm nhất": điểm nóng nặng nhất (cùng danh sách với bản đồ điểm nóng — buildHotspots) + nút "Xem trên bản đồ"
 *   (bản đồ bên dưới bay tới điểm đó). Chỉ hiện khi có điểm mức Cam / Đỏ.
 * `link`: chỗ nhập số liệu khi chưa có (chỉ trang tài khoản mở được). `large`: chữ to cho chế độ trình chiếu.
 */
export default function SituationSummary({ k, waterStations, stationsError, hotspots = [], onShowWorst, link, large = false }) {
  if (!k) return null;
  const s = situationSentence(k, waterStations, { stationsError });
  const worst = hotspots[0]?.level >= 2 ? hotspots[0] : null;
  const sameLevel = worst ? hotspots.filter((h) => h.level === worst.level).length - 1 : 0;
  return (
    <div className={clsx('flex flex-col gap-1 border-l-4 pl-2.5', risk(s.level).edge)} role="status" aria-live="polite" aria-label="Tóm tắt tình hình">
      <p className={clsx('font-semibold leading-snug text-ink', large ? 'text-2xl' : 'text-sm sm:text-base')}>
        {s.text}
      </p>
      {s.noData && link && !large && (
        <Link to={link.to} className="touch-hit self-start text-[13px] font-semibold text-accent hover:underline">{link.text}</Link>
      )}
      {worst && (
        // Điện thoại: một dòng (cắt chữ thừa) + nút bản đồ gọn — dành chỗ cho 6 ô chỉ số ngay dưới
        <div className={clsx('flex items-center gap-2 text-ink-2', large ? 'text-xl' : 'text-[13px] sm:text-sm')}>
          <span className="min-w-0 flex-1 max-sm:truncate" title={`${worst.name}${worst.detail ? ` — ${worst.detail}` : ''}`}>
            <b className={clsx('font-semibold', risk(worst.level).text)}>Nguy hiểm nhất:</b>{' '}
            <b className="font-semibold text-ink">{worst.name}</b>
            {worst.detail && ` — ${worst.detail}`}
            {sameLevel > 0 && <span className="text-muted max-sm:hidden"> · còn {sameLevel} điểm mức {risk(worst.level).name} khác</span>}
          </span>
          {onShowWorst && !large && (
            <button type="button" onClick={() => onShowWorst(worst)} className="touch-hit inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-accent hover:underline no-print" aria-label="Xem trên bản đồ">
              <MapPin size={13} aria-hidden="true" /> <span className="max-sm:hidden">Xem trên</span> bản đồ
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Nút "?" giải thích mức báo động và thang màu — đặt trên dòng ngữ cảnh đầu trang (không chiếm một dòng riêng). */
export const LevelHint = () => (
  <Hint label="Mức báo động và màu">
    Báo động I, II, III: ba mức báo động lũ quy định riêng cho từng trạm thủy văn — Báo động III là nguy hiểm nhất. Màu trên
    màn hình: Đỏ khẩn cấp · Cam nguy hiểm · Vàng theo dõi · Xanh dưới ngưỡng · Xám chưa có số liệu.
  </Hint>
);
