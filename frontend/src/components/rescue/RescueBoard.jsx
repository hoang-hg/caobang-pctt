import { useState } from 'react';
import clsx from 'clsx';
import { CheckCircle2 } from 'lucide-react';
import { Tabs } from '../common/ui';
import { COLUMNS } from './rescueFacts';
import TicketCard from './TicketCard';

const EMPTY = {
  moi: 'Không có phiếu chờ xử lý',
  dieu_phoi: 'Không có phiếu đang điều phối',
  thuc_thi: 'Không có đội đang thực thi',
  hoan_thanh: 'Chưa có phiếu hoàn thành trong 48 giờ qua',
};

/**
 * Bảng điều phối 4 cột (thiết kế D.2: Chờ xử lý → Đang điều phối → Đang thực thi → Đã cứu an toàn). Từ 1280 px: đủ 4 cột,
 * kéo thả phiếu giữa các cột, mỗi cột cuộn riêng. Nhỏ hơn (điện thoại, iPad): thẻ chọn cột (số phiếu, chấm Đỏ khi cột có
 * phiếu quá hạn) rồi danh sách phiếu của cột — không cuộn lồng nhau, không phải lướt qua 3 cột mới tới cột cần xem. Cột
 * theo trạng thái, KHÔNG tô màu rủi ro (màu Đỏ / Cam / Vàng dành cho mức ưu tiên của từng phiếu).
 */
export default function RescueBoard({ tickets, factsOf, wide, column, onColumn, filtered, cardProps, onDrop }) {
  const [over, setOver] = useState(null);
  const byCol = Object.fromEntries(COLUMNS.map((c) => [c.key, tickets.filter((t) => t.status === c.key)]));
  const overdueIn = (key) => byCol[key].filter((t) => factsOf(t).overdue).length;
  const empty = (key) => (
    <div className="flex flex-col items-center justify-center py-10 text-center text-xs text-muted">
      <CheckCircle2 size={22} className="mb-1 text-muted/40" aria-hidden="true" />
      {filtered ? 'Không có phiếu khớp bộ lọc trong cột này' : EMPTY[key]}
    </div>
  );
  const cards = (key) => byCol[key].map((t) => <TicketCard key={t.id} t={t} x={factsOf(t)} compact={wide} {...cardProps} />);

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
            return { value: c.key, label: c.title, short: c.short, icon: c.icon, count: byCol[c.key].length, alert: late ? { level: 3, text: `${late} phiếu quá hạn SLA` } : undefined };
          })}
        />
        <p className="-mt-1 text-[11px] text-muted">{col.hint}</p>
        {byCol[col.key].length ? <div className="grid gap-2.5 md:grid-cols-2">{cards(col.key)}</div> : empty(col.key)}
      </div>
    );
  }

  return (
    <div className="grid min-w-0 grid-cols-4 gap-3">
      {COLUMNS.map((c) => {
        const late = overdueIn(c.key);
        return (
          <section
            key={c.key}
            aria-label={`${c.title} — ${byCol[c.key].length} phiếu`}
            onDragOver={(e) => { e.preventDefault(); setOver(c.key); }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); onDrop(e.dataTransfer.getData('text/plain'), c.key); }}
            className={clsx(
              'card flex max-h-[calc(100vh-12rem)] min-h-[360px] min-w-0 flex-col transition-all print:max-h-none print:min-h-0',
              over === c.key ? 'border-dashed bg-accent/5 ring-2 ring-accent' : 'bg-panel',
            )}
          >
            <div className="border-b border-line/60 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-sm font-bold text-ink">
                <c.icon size={15} className={c.key === 'hoan_thanh' ? 'text-good' : 'text-accent'} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                {late > 0 && <span className="chip bg-danger px-1.5 py-0 text-[10px] font-bold text-white" title={`${late} phiếu quá hạn SLA`}>{late} quá hạn</span>}
                <span className="chip bg-panel2 px-2 py-0.5 text-xs font-semibold">{byCol[c.key].length}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-muted">{c.hint}</div>
            </div>
            <div className="scroll-thin flex flex-1 flex-col gap-2.5 overflow-y-auto p-2.5 print:overflow-visible">
              {byCol[c.key].length ? cards(c.key) : empty(c.key)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
