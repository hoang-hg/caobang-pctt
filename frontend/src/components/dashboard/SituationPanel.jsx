import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { ChevronRight, Monitor } from 'lucide-react';
import ExportMenu from '../common/ExportMenu';
import { risk } from '../../utils/risk';
import { DecisionList } from './DecisionPanel';
import { situationSentence } from './SituationBar';

/**
 * Cột "Tình hình" nền xanh đêm bên trái Tổng quan trên máy tính ≥ 1280 px (bản vẽ desktop 11/2026, khung A): trả lời trong
 * 5 giây "Đang có chuyện gì? Chỗ nào nguy hiểm nhất? Việc gì chờ tôi?" — giữ nguyên ở mọi thẻ của Tổng quan.
 * - "TÌNH HÌNH · SỐ LIỆU LÚC hh:mm" + câu tóm tắt ghép từ số liệu thật (situationSentence — chưa có số liệu thì nói chưa đánh
 *   giá được, không nói "an toàn");
 * - "NGUY HIỂM NHẤT": điểm nóng nặng nhất (cùng danh sách với bản đồ điểm nóng) — chỉ khi có điểm mức Cam / Đỏ;
 * - "VIỆC CHỜ QUYẾT ĐỊNH" (DecisionList — cùng dữ liệu với DecisionPanel);
 * - đáy cột: Trình chiếu · Xuất ▾.
 * Thay cho dải khẩn trên máy tính (chủ dự án bỏ dải khẩn ở ≥ 1024 px ngày 03/11/2026).
 */
export default function SituationPanel({
  k, kState, waterStations, stationsError, hotspots = [], time, link, onShowWorst, onPresent, exports, hint, className,
}) {
  const s = k ? situationSentence(k, waterStations, { stationsError }) : null;
  const worst = hotspots[0]?.level >= 2 ? hotspots[0] : null;
  const sameLevel = worst ? hotspots.filter((h) => h.level === worst.level).length - 1 : 0;
  return (
    <aside
      aria-label="Tình hình"
      className={clsx('dark flex min-h-0 flex-col gap-4 overflow-y-auto rounded-[18px] bg-[#0B1A33] p-5 text-white shadow-[0_10px_30px_rgb(15_23_42/0.14)] scroll-thin', className)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-bold text-[#A9B6CC]">
          Tình hình{time ? <> · số liệu lúc <span className="num">{time}</span></> : kState?.error ? ' · chưa tải được số liệu' : ' · đang tải…'}
        </div>
        {hint /* nút "?" giải thích mức báo động và thang màu */}
      </div>
      {s ? (
        <div role="status" aria-live="polite" aria-label="Tóm tắt tình hình">
          <p className="text-[17px] font-semibold leading-normal">{s.text}</p>
          {s.noData && link && (
            <Link to={link.to} className="touch-hit mt-1 inline-flex text-[13px] font-semibold text-[#93C5FD] hover:underline">{link.text}</Link>
          )}
        </div>
      ) : (
        <div className="h-20 animate-pulse rounded-xl bg-white/5" aria-hidden="true" />
      )}
      {worst && (
        <div className={clsx('rounded-[14px] border-l-[5px] bg-[#16294A] p-3.5', risk(worst.level).edge)}>
          <div className="text-xs font-bold text-[#FCA5A5]">Nguy hiểm nhất</div>
          <div className="mt-1 text-[15px] font-semibold">{worst.name}</div>
          <div className="text-[13px] leading-normal text-[#CBD5E1]">
            {worst.detail}
            {sameLevel > 0 && <> · còn {sameLevel} điểm mức {risk(worst.level).name} khác</>}
          </div>
          {onShowWorst && (
            <button type="button" onClick={() => onShowWorst(worst)} className="touch-hit mt-1 inline-flex items-center text-[13px] font-semibold text-[#93C5FD] hover:underline">
              Xem trên bản đồ <ChevronRight size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      <DecisionList k={k} kState={kState} />
      <div className="mt-auto flex gap-2 pt-1 no-print">
        <button
          type="button"
          onClick={onPresent}
          className="tap flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#2B3F63] text-sm hover:bg-white/5"
          title="Trình chiếu trên màn hình lớn phòng điều hành: nền tối, chữ số to, tự chuyển chuyên đề"
        >
          <Monitor size={15} aria-hidden="true" /> Trình chiếu
        </button>
        {exports?.length > 0 && (
          <ExportMenu
            up
            items={exports}
            className="flex-1"
            buttonClass="tap flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-[#2B3F63] text-sm text-white hover:bg-white/5"
          />
        )}
      </div>
    </aside>
  );
}
