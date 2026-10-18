import clsx from 'clsx';
import { MapPin, RefreshCw } from 'lucide-react';
import ExportMenu from './ExportMenu';

/**
 * Đầu trang dùng chung các trang điều hành — cùng chỗ, cùng cỡ chữ trên mọi trang, chuyển trang không phải tìm lại nút:
 * - Trái: tiêu đề (`title`; `short` = tiêu đề ngắn trên điện thoại; `before` = nút "Quay lại" phía trên tiêu đề) và dòng
 *   ngữ cảnh: địa bàn đang xem (`scope` — chữ, hoặc nút có "Bỏ lọc"), giờ số liệu (`time`; chưa có giờ → `timeNote`, VD
 *   "Đang tải số liệu…"), thông tin riêng của trang (`meta` — mảng; mục nào chỉ hiện trên màn lớn thì tự bọc lớp ẩn);
 *   `description`: một câu giải thích trang dài hơn (dưới dòng ngữ cảnh, điện thoại gọn 2 dòng).
 * - Phải: thao tác riêng của trang (`actions` — nhiều nhất MỘT nút chính tô màu), menu "Xuất" (`exports` — ExportMenu),
 *   nút "Làm mới" (`onRefresh`, `refreshing`).
 * `children`: hàng dưới tiêu đề chiếm trọn bề ngang (VD thang màu, ô chọn lưu vực).
 */
export default function PageHeader({
  title, short, before, scope, time, timeNote, meta = [], description, actions, exports, onRefresh, refreshing, children, className,
}) {
  const facts = [
    scope && (
      <span key="scope" className="inline-flex min-w-0 max-w-full items-center gap-1 font-semibold text-accent">
        <MapPin size={12} className="shrink-0" aria-hidden="true" />
        {typeof scope === 'string' ? <span className="truncate">{scope}</span> : scope}
      </span>
    ),
    time !== undefined && (
      <span key="time" className="whitespace-nowrap">
        {time ? <>Số liệu lúc <b className="num font-semibold text-ink-2">{time}</b></> : timeNote}
      </span>
    ),
    ...meta,
  ].filter(Boolean);

  return (
    <header className={clsx('flex flex-col gap-2', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {before}
          <h1 className="text-[17px] font-bold leading-tight tracking-tight text-ink sm:text-xl">
            {short ? (
              <>
                <span className="sm:hidden">{short}</span>
                <span className="max-sm:hidden">{title}</span>
              </>
            ) : title}
          </h1>
          {facts.length > 0 && (
            <p className="facts mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
              {facts.map((f, i) => (typeof f === 'string' ? <span key={`f${i}`}>{f}</span> : f))}
            </p>
          )}
          {description && <p className="mt-1 max-w-4xl text-xs leading-relaxed text-muted max-sm:line-clamp-2">{description}</p>}
        </div>
        {(actions || exports?.length || onRefresh) && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 no-print">
            {actions}
            {exports?.length > 0 && <ExportMenu items={exports} />}
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                aria-label="Làm mới số liệu"
                title="Làm mới số liệu"
                className="btn-secondary tap-sq h-9 min-w-[36px] px-2.5"
              >
                <RefreshCw size={15} className={clsx(refreshing && 'animate-spin')} aria-hidden="true" />
                <span className="hidden xl:inline">Làm mới</span>
              </button>
            )}
          </div>
        )}
      </div>
      {children}
    </header>
  );
}
