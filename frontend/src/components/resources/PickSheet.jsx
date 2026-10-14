import { useState } from 'react';
import clsx from 'clsx';
import { ChevronRight, Search, X } from 'lucide-react';
import { EmptyState, Modal } from '../common/ui';
import { risk } from '../../utils/risk';
import { foldVi } from '../../utils/format';

/**
 * Chọn nhanh một mục cho thao tác hiện trường (kho để xuất / nhập hàng, phương tiện để báo tình trạng) — mở từ thanh dưới
 * đáy điện thoại. Dòng to ≥ 52 px, vạch trái theo mức (thang rủi ro chung), ô tìm không dấu khi danh sách dài (> 6 mục).
 * Nơi gọi xếp sẵn mục khẩn lên đầu. `items`: [{ id, title, sub, level, right, search }].
 */
export default function PickSheet({ title, hint, items, empty, onPick, onClose }) {
  const [q, setQ] = useState('');
  const nq = foldVi(q.trim());
  const list = nq ? items.filter((it) => foldVi(it.search || it.title).includes(nq)) : items;
  return (
    <Modal open onClose={onClose} title={title}>
      {hint && <p className="mb-2 text-xs text-muted">{hint}</p>}
      {items.length > 6 && (
        <div className="relative mb-2">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            className="input tap min-h-[40px] pl-8 pr-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo tên, số hiệu, xã/phường…"
            aria-label="Tìm trong danh sách chọn"
            enterKeyHint="search"
          />
          {q && (
            <button type="button" className="tap-sq absolute right-0.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-muted" onClick={() => setQ('')} aria-label="Xoá ô tìm">
              <X size={14} />
            </button>
          )}
        </div>
      )}
      {!items.length ? <EmptyState>{empty}</EmptyState> : !list.length ? <EmptyState>Không có mục khớp “{q.trim()}”</EmptyState> : (
        <ul className="flex flex-col gap-1.5" aria-label={title}>
          {list.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => onPick(it)}
                className={clsx('card tap flex min-h-[52px] w-full items-center gap-2.5 border-l-4 px-3 py-2 text-left hover:border-accent', risk(it.level).edge)}
              >
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm text-ink">{it.title}</b>
                  {it.sub && <span className="block truncate text-xs text-muted">{it.sub}</span>}
                </span>
                {it.right}
                <ChevronRight size={16} className="shrink-0 text-muted" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
