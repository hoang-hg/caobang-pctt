import { useState } from 'react';
import clsx from 'clsx';
import { CheckCircle2 } from 'lucide-react';
import { Tabs } from '../common/ui';
import { COLUMNS } from './rescueFacts';
import TicketCard from './TicketCard';

const EMPTY = {
  moi: 'Không có phiếu mới báo',
  dieu_phoi: 'Không có phiếu đang tìm đội',
  thuc_thi: 'Không có đội nào đang trên đường',
  hoan_thanh: 'Chưa có phiếu cứu xong trong 48 giờ qua',
};

/**
 * Bảng điều phối 4 cột (thiết kế D.2, tên đời thường: Mới báo — chưa ai nhận → Đang tìm đội → Đội đang đến → Đã cứu xong).
 * Phiếu vừa đến khi đang xem trượt vào (`cardProps.isNew`). Từ 1280 px: đủ 4 cột,
 * kéo thả phiếu giữa các cột, mỗi cột cuộn riêng. Nhỏ hơn (điện thoại, iPad): thẻ chọn cột (số phiếu, chấm Đỏ khi cột có
 * phiếu quá hạn) rồi danh sách phiếu của cột — không cuộn lồng nhau, không phải lướt qua 3 cột mới tới cột cần xem. Cột
 * theo trạng thái, KHÔNG tô màu rủi ro (màu Đỏ / Cam / Vàng dành cho mức ưu tiên của từng phiếu).
 */
export default function RescueBoard({ tickets, factsOf, wide, column, onColumn, filtered, cardProps, onDrop, height }) {
  const [over, setOver] = useState(null);
  const byCol = Object.fromEntries(COLUMNS.map((c) => [c.key, tickets.filter((t) => t.status === c.key)]));
  const overdueIn = (key) => byCol[key].filter((t) => factsOf(t).overdue).length;
  const empty = (key) => (
    <div className="flex flex-col items-center justify-center py-10 text-center text-xs text-muted">
      <CheckCircle2 size={22} className="mb-1 text-muted/40" aria-hidden="true" />
      {filtered ? 'Không có phiếu khớp bộ lọc trong cột này' : EMPTY[key]}
    </div>
  );
  const cards = (key) => byCol[key].map((t) => <TicketCard key={t.id} t={t} x={factsOf(t)} compact={wide} fresh={!!cardProps.isNew?.(t.id)} {...cardProps} />);

  if (!wide) {
    const col = COLUMNS.find((c) => c.key === column) || COLUMNS[0];
    return (
      <div className="flex flex-col gap-2.5">
        <Tabs
          fit
          label="Cột của bảng điều phối"
          value={col.key}
          onChange={onColumn}
          tabs={COLUMNS.map((c) => {
            const late = overdueIn(c.key);
            // Thẻ cột dùng tên ngắn (iPad dọc, điện thoại: 4 thẻ vừa một hàng); tên đầy đủ ghi ngay dưới
            return { value: c.key, label: c.short, icon: c.icon, count: byCol[c.key].length, alert: late ? { level: 3, text: `${late} phiếu quá hạn phản hồi` } : undefined };
          })}
        />
        <p className="-mt-1 text-xs text-muted"><b className="font-semibold text-ink-2">{col.title}</b> — {col.hint}</p>
        {byCol[col.key].length ? <div className="grid gap-2.5 md:grid-cols-2">{cards(col.key)}</div> : empty(col.key)}
      </div>
    );
  }

  return (
    <div className="grid min-w-0 grid-cols-4 gap-3 flex-1 h-full min-h-0 items-stretch">
      {COLUMNS.map((c) => {
        const late = overdueIn(c.key);
        return (
          <section
            key={c.key}
            style={{ height: height ? `${height}px` : undefined }}
            aria-label={`${c.title} — ${byCol[c.key].length} phiếu`}
            onDragOver={(e) => { e.preventDefault(); setOver(c.key); }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); onDrop(e.dataTransfer.getData('text/plain'), c.key); }}
            className={clsx(
              // Bản vẽ desktop khung C: cột nền xám lõm (bo 18 px, không viền) — thẻ phiếu trắng nổi lên; đầu cột là vòng số bước
              // + tên ngắn + "n quá hạn" + số phiếu, câu giải thích ngay dưới. Không dùng màu Đỏ / Cam / Vàng cho cột (dành cho mức
              // ưu tiên của phiếu)
              'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[18px] transition print:h-auto print:max-h-none print:min-h-0',
              // Cao bằng cột Tiếp nhận & Sơ tán khi nằm cạnh (height); không thì kéo tới đáy màn hình, phiếu cuộn trong cột
              height ? 'h-full' : 'h-[calc(100vh-12rem)] min-h-[360px] lg:tall:h-[calc(100vh-14rem)]',
              over === c.key ? 'bg-accent/10 ring-2 ring-dashed ring-accent' : 'bg-line/50',
            )}
          >
            <div className="px-3.5 pb-2 pt-3.5">
              <div className="flex items-center gap-2 text-[15px] font-bold text-ink">
                <span className={clsx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-panel text-xs font-bold', c.key === 'hoan_thanh' ? 'text-good' : 'text-accent')} aria-hidden="true">
                  {COLUMNS.indexOf(c) + 1}
                </span>
                <span className="min-w-0 flex-1 truncate leading-tight" title={c.title}>{c.name}</span>
                {late > 0 && (
                  <span className="chip inline-flex items-center gap-1 bg-danger px-2 py-0.5 text-xs font-bold text-white" title={`${late} phiếu quá hạn phản hồi`}>
                    {late} quá hạn
                  </span>
                )}
                <span className="chip min-w-[1.75rem] justify-center bg-panel px-2 py-0.5 text-xs font-semibold">{byCol[c.key].length}</span>
              </div>
              <div className="mt-1 text-xs text-ink-2">{c.lead || c.hint}</div>
            </div>
            <div className="scroll-thin flex flex-1 min-h-0 flex-col gap-2.5 overflow-y-auto px-2.5 pb-2.5 print:overflow-visible">
              {byCol[c.key].length ? cards(c.key) : empty(c.key)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
