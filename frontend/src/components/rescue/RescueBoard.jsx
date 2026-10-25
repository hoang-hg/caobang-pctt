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
              // Kiểu bảng Kanban: thân cột lõm (màu nền trang) — thẻ phiếu trắng nổi lên; đầu cột trắng có vạch màu nhấn phía
              // trên (cột đã xong: xanh lá như biểu tượng). Chiều cao kéo dài tự động cân đối khớp tuyệt đối với bảng bên phải
              'card flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-t-[3px] shadow-none transition-all print:max-h-none print:min-h-0',
              c.key === 'hoan_thanh' ? 'border-t-good' : 'border-t-accent',
              over === c.key ? 'border-dashed bg-accent/5 ring-2 ring-accent' : 'bg-bg',
            )}
          >
            <div className="border-b border-line/60 bg-panel px-3 py-2.5">
              <div className="flex items-center gap-2 text-sm font-bold text-ink">
                <span className={clsx('icon-tile h-7 w-7', c.key === 'hoan_thanh' && 'bg-good/10 text-good ring-good/20')} aria-hidden="true">
                  <c.icon size={15} />
                </span>
                <span className="min-w-0 flex-1 leading-tight">{c.title}</span>
                {late > 0 && (
                  <span className="chip inline-flex items-center gap-1 bg-danger px-1.5 py-0 text-[11px] font-bold text-white" title={`${late} phiếu quá hạn phản hồi`}>
                    <span className="inline-block h-1.5 w-1.5 animate-ping rounded-full bg-white" aria-hidden="true" />
                    {late} quá hạn
                  </span>
                )}
                <span className="chip bg-panel2 px-2 py-0.5 text-xs font-semibold">{byCol[c.key].length}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-muted">{c.hint}</div>
            </div>
            <div className="scroll-thin flex flex-1 min-h-0 flex-col gap-2 overflow-y-auto p-2 print:overflow-visible">
              {byCol[c.key].length ? cards(c.key) : empty(c.key)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
