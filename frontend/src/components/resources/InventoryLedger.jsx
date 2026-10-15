import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { api, useAreaParams } from '../../api/client';
import { useStore } from '../../app/store';
import FilterToolbar from '../common/FilterToolbar';
import { ErrorState, Pager, Skeleton, SortTh } from '../common/ui';
import { foldVi, int, vnFileStamp } from '../../utils/format';
import { exportExcel } from '../../utils/exportExcel';
import { exportSnapshotPdf } from '../../utils/exportPdf';
import { useMediaQuery } from '../../utils/useMediaQuery';
import { usePaged } from '../../utils/usePaged';

const MAX_ROWS = 5000; // như MOVES_MAX_ROWS (backend)
const RANGES = [[7, '7 ngày'], [30, '30 ngày'], [90, '90 ngày']];
// Lý do ghi sổ (resources.inventory_moves.reason — trigger migration 0024)
export const MOVE_REASON = {
  nhap: 'Nhập hàng',
  xuat: 'Xuất cấp phát',
  xuat_dieu_dong: 'Kèm lệnh điều động',
  hoan_tra: 'Hoàn trả (huỷ lệnh)',
  nhap_du_lieu: 'Nhập tệp / kiểm kê',
  khoi_tao: 'Tồn đầu kỳ',
  mo_phong: 'Bộ mô phỏng',
  khac: 'Khác',
};
const SORTS = [['moi', 'Mới nhất'], ['cu', 'Cũ nhất']];
const stamp = (t) => new Date(t).toLocaleString('vi-VN');
const signed = (n) => (n > 0 ? `+${int(n)}` : `−${int(-n)}`);
const who = (m) => [m.actor_name, m.ticket_code].filter(Boolean).join(' · ');

/**
 * Sổ xuất – nhập kho (thiết kế C, DB7 — docs/csdl-viec-con-lai.md): mỗi lần tồn kho đổi số lượng là một dòng — nhập hàng, xuất
 * cấp phát (nơi nhận), vật tư kèm lệnh điều động (mã phiếu SOS), hoàn trả khi huỷ lệnh, nhập tệp. Trả lời "đã cấp bao nhiêu
 * cho đâu, ai xuất, lúc nào". 7 / 30 / 90 ngày (tối đa 5.000 dòng mới nhất), tìm không dấu, lọc kho / lý do / mặt hàng kèm số
 * dòng, xếp, phân trang, Excel / PDF. Máy tính: bảng; điện thoại: thẻ. Theo phạm vi được giao và bộ lọc địa bàn (máy chủ lọc).
 * `warehouse` / `onWarehouse`: kho đang xem (nút "Sổ xuất – nhập" ở thẻ kho đặt sẵn); `known`: danh sách kho của trang (tên kho
 * cho ô lọc, kể cả kho chưa có dòng sổ nào).
 */
export default function InventoryLedger({ warehouse, onWarehouse, known = [] }) {
  const toast = useStore((s) => s.toast);
  const area = useAreaParams();
  const isLg = useMediaQuery('(min-width: 1024px)');
  const [days, setDays] = useState(30);
  const today = new Date().toDateString();
  const query = useQuery({
    // Khoá theo ngày (không theo phút): không tải lại liên tục; "Làm mới" của trang / mở lại khối vẫn cập nhật
    queryKey: ['inventory-moves', area.admin_codes || 'CB', days, today],
    queryFn: () => api('/resources/inventory-moves', {
      params: { ...area, limit: MAX_ROWS, since: new Date(Date.now() - days * 86400e3).toISOString() },
    }),
  });
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState({ ly_do: '', mat_hang: '' });
  const [sort, setSort] = useState('moi');
  const [pageSize, setPageSize] = useState(() => (window.innerWidth >= 1024 ? 50 : 20));
  const [pdf, setPdf] = useState(false);
  const ref = useRef(null);

  const all = query.data || [];
  const allFilters = { ...filters, kho: warehouse || '' };
  // Kho của trang + kho chỉ còn trong sổ (đã xoá khi nhập lại danh sách kho)
  const warehouses = [...new Map([...known.map((w) => [w.id, w.name]), ...all.map((m) => [m.warehouse_id || m.warehouse_code, m.warehouse_name])]).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'vi'));
  const items = [...new Map(all.map((m) => [m.item_code, m.item_name || m.item_code])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'vi'));
  const fields = [
    { key: 'kho', label: 'Kho', all: 'Mọi kho', options: warehouses },
    { key: 'ly_do', label: 'Lý do', all: 'Mọi lý do', options: Object.entries(MOVE_REASON) },
    { key: 'mat_hang', label: 'Mặt hàng', all: 'Mọi mặt hàng', options: items },
  ];
  const nq = foldVi(q.trim());
  const searched = nq
    ? all.filter((m) => [m.item_name, m.item_code, m.warehouse_name, m.note, m.actor_name, m.ticket_code].some((f) => f && foldVi(f).includes(nq)))
    : all;
  const match = (m, f) => (!f.kho || (m.warehouse_id || m.warehouse_code) === f.kho)
    && (!f.ly_do || m.reason === f.ly_do) && (!f.mat_hang || m.item_code === f.mat_hang);
  const rows = searched.filter((m) => match(m, allFilters))
    .sort((a, b) => (sort === 'cu' ? 1 : -1) * (Date.parse(a.time) - Date.parse(b.time) || a.id - b.id));
  const counts = Object.fromEntries(fields.map((f) => {
    const others = { ...allFilters, [f.key]: '' };
    const base = searched.filter((m) => match(m, others));
    return [f.key, Object.fromEntries(f.options.map(([v]) => [v, base.filter((m) => match(m, { ...others, [f.key]: v })).length]))];
  }));
  const paged = usePaged(rows, pageSize, `${days}|${nq}|${JSON.stringify(allFilters)}|${sort}|${pageSize}`, pdf);
  const setFilter = (key, value) => (key === 'kho' ? onWarehouse(value) : setFilters((f) => ({ ...f, [key]: value })));
  const clearAll = () => {
    setFilters({ ly_do: '', mat_hang: '' });
    onWarehouse('');
    setQ('');
  };
  const truncated = all.length >= MAX_ROWS;

  const doExcel = async () => {
    if (!rows.length) return;
    try {
      await exportExcel(rows.map((m) => ({
        'Thời gian': stamp(m.time), 'Mã kho': m.warehouse_code, Kho: m.warehouse_name, 'Mã mặt hàng': m.item_code,
        'Mặt hàng': m.item_name || '', 'Đơn vị': m.unit || '', 'Số lượng (+ nhập, − xuất)': m.delta, 'Tồn sau': m.quantity_after,
        'Lý do': MOVE_REASON[m.reason] || m.reason, 'Phiếu SOS': m.ticket_code || '', 'Người thao tác': m.actor_name || '',
        'Ghi chú (nơi nhận / nguồn hàng)': m.note || '',
      })), { sheet: 'So xuat nhap kho', filename: `so-xuat-nhap-kho-${vnFileStamp(new Date(), true)}.xlsx` });
    } catch (e) {
      toast({ tone: 'danger', title: 'Không xuất được tệp Excel', body: e.message });
    }
  };
  const doPdf = async () => {
    if (!rows.length || pdf) return;
    setPdf(true);
    try {
      await new Promise((resolve) => { requestAnimationFrame(() => requestAnimationFrame(resolve)); });
      const at = new Date();
      const active = fields.filter((f) => allFilters[f.key]).map((f) => f.options.find(([v]) => v === allFilters[f.key])?.[1]);
      await exportSnapshotPdf(ref.current, {
        title: 'SỔ XUẤT – NHẬP KHO VẬT TƯ PCTT & TKCN TỈNH CAO BẰNG',
        subtitle: [`${days} ngày qua`, `${rows.length} dòng`, ...active, q.trim() && `tìm "${q.trim()}"`, `in lúc ${at.toLocaleString('vi-VN')}`]
          .filter(Boolean).join(' · '),
        filename: `so-xuat-nhap-kho-${vnFileStamp(at, true)}.pdf`,
        layoutWidth: 1280,
      });
    } catch (e) {
      toast({ tone: 'danger', title: 'Không xuất được PDF', body: e.message });
    } finally {
      setPdf(false);
    }
  };

  let body;
  if (query.isLoading) body = <Skeleton height={280} />;
  else if (query.isError && !query.data) body = <ErrorState height={160} onRetry={query.refetch}>Không tải được sổ xuất – nhập kho</ErrorState>;
  else if (!rows.length) {
    body = (
      <p className="card p-6 text-center text-xs text-muted">
        {all.length ? 'Không có dòng nào khớp ô tìm / bộ lọc.' : `Không có lần xuất / nhập nào trong ${days} ngày qua. Sổ ghi từ khi cập nhật phiên bản có sổ kho.`}
      </p>
    );
  } else if (isLg || pdf) {
    body = (
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <SortTh k={sort} dir={sort === 'moi' ? 'descending' : 'ascending'} sort={sort} onSort={() => setSort(sort === 'moi' ? 'cu' : 'moi')} pdf={pdf}>Thời gian</SortTh>
              <th scope="col">Kho</th>
              <th scope="col">Mặt hàng</th>
              <th scope="col" className="text-right">Số lượng</th>
              <th scope="col" className="text-right">Tồn sau</th>
              <th scope="col">Lý do</th>
              <th scope="col">Người · phiếu SOS</th>
              <th scope="col">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {(pdf ? rows : paged.visible).map((m) => (
              <tr key={m.id}>
                <td className="whitespace-nowrap font-mono text-xs">{stamp(m.time)}</td>
                <td className="text-sm">{m.warehouse_name}</td>
                <td className="text-sm">{m.item_name || m.item_code}</td>
                <td className="whitespace-nowrap text-right font-mono text-sm font-semibold">{signed(m.delta)} <span className="text-xs font-normal text-muted">{m.unit}</span></td>
                <td className="text-right font-mono text-xs">{int(m.quantity_after)}</td>
                <td className="text-xs">{MOVE_REASON[m.reason] || m.reason}</td>
                <td className="text-xs">{who(m) || <span className="text-muted">—</span>}</td>
                <td className={clsx('max-w-xs text-xs text-muted [overflow-wrap:anywhere]', !pdf && 'line-clamp-2')} title={m.note || undefined}>{m.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } else {
    body = (
      <ul className="flex flex-col gap-2" aria-label="Sổ xuất – nhập kho">
        {paged.visible.map((m) => (
          <li key={m.id} className="card min-w-0 p-2.5 text-xs">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <b className="text-sm text-ink">{m.item_name || m.item_code}</b>
              <span className="font-mono text-sm font-semibold text-ink">{signed(m.delta)} <span className="font-sans text-xs font-normal text-muted">{m.unit}</span></span>
              <span className="ml-auto whitespace-nowrap font-mono text-muted">{stamp(m.time)}</span>
            </div>
            <div className="mt-0.5 text-ink-2">{MOVE_REASON[m.reason] || m.reason} · {m.warehouse_name} · tồn sau {int(m.quantity_after)}</div>
            {(who(m) || m.note) && <div className="mt-0.5 text-muted [overflow-wrap:anywhere]">{[who(m), m.note].filter(Boolean).join(' — ')}</div>}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Khoảng thời gian của sổ kho">
        <span className="mr-1 text-xs font-medium text-muted">Khoảng</span>
        {RANGES.map(([d, label]) => (
          <button
            key={d}
            type="button"
            aria-pressed={days === d}
            onClick={() => setDays(d)}
            className={clsx('tap rounded-md px-2.5 py-1 text-xs font-semibold', days === d ? 'bg-accent text-white' : 'bg-panel2/60 text-muted hover:text-ink')}
          >
            {label}
          </button>
        ))}
        {truncated && <span className="text-[11px] text-muted">· hiện {int(MAX_ROWS)} dòng mới nhất — chọn khoảng ngắn hơn để xem đủ</span>}
      </div>
      <FilterToolbar
        fields={fields}
        sorts={SORTS}
        placeholder="Tìm mặt hàng, nơi nhận, phiếu SOS…"
        q={q}
        onSearch={setQ}
        filters={allFilters}
        counts={query.data ? counts : null}
        onFilter={setFilter}
        onClear={clearAll}
        sort={sort}
        onSort={setSort}
        shown={rows.length}
        total={all.length}
        noun="dòng sổ"
        onExcel={doExcel}
        onPdf={doPdf}
        exporting={pdf}
      />
      <div ref={ref} className="flex flex-col gap-2 bg-bg">{body}</div>
      {!pdf && rows.length > 0 && (
        <Pager paged={paged} size={pageSize} sizes={[20, 50, 100]} onSize={setPageSize} noun="dòng" />
      )}
    </div>
  );
}
