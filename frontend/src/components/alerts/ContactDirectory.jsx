import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { BookUser, ChevronDown, ChevronRight, Phone, Radio } from 'lucide-react';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import FilterToolbar from '../common/FilterToolbar';
import { EmptyState, ErrorState, Section, ShowMore, Skeleton } from '../common/ui';
import { foldVi, vnFileStamp } from '../../utils/format';
import { exportExcel } from '../../utils/exportExcel';
import { exportSnapshotPdf } from '../../utils/exportPdf';
import { useShowMore } from '../../utils/useShowMore';

const STATUS = { truc: ['Đang trực', 'bg-good'], san_sang: ['Sẵn sàng', 'bg-accent'], vang: ['Vắng', 'bg-muted'] };
const LEVELS = { tinh: 'Cấp tỉnh', xa: 'Cấp xã', thon: 'Thôn / tổ' };
const FILTERS = [
  { key: 'cap', label: 'Cấp', all: 'Mọi cấp', options: Object.entries(LEVELS) },
  { key: 'tt', label: 'Trạng thái', all: 'Mọi trạng thái', options: Object.entries(STATUS).map(([k, [l]]) => [k, l]) },
];
const flatten = (nodes, path = []) => nodes.flatMap((n) => [{ ...n, path }, ...flatten(n.children || [], [...path, n.full_name])]);
const tel = (p) => `tel:${String(p || '').replace(/[^\d+]/g, '')}`;

function Status({ s }) {
  const [label, dot] = STATUS[s] || ['Chưa rõ', 'bg-line'];
  return <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-ink-2"><span className={clsx('h-2 w-2 rounded-full', dot)} aria-hidden="true" />{label}</span>;
}

/** Một cán bộ: tên · chức vụ · đơn vị · tần số bộ đàm · SĐT (chữ), nút Gọi 44 px — không tràn ngang trên 360 px. */
function Person({ n, depth = 0, open, onToggle, kids, showPath }) {
  return (
    <div className="flex items-start gap-1.5 rounded-md py-1.5 pr-1 hover:bg-panel2/60" style={{ paddingLeft: depth ? Math.min(depth, 3) * 14 : 0 }}>
      {kids ? (
        <button
          type="button"
          onClick={onToggle}
          className="tap-sq -my-1 flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted hover:bg-panel2"
          aria-expanded={open}
          aria-label={`${open ? 'Thu gọn' : 'Mở'} cấp dưới của ${n.full_name}`}
        >
          {open ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
        </button>
      ) : depth > 0 ? <span className="w-8 shrink-0" aria-hidden="true" /> : null}
      <div className="min-w-0 flex-1">
        <div className="text-sm [overflow-wrap:anywhere]"><b className="text-ink">{n.full_name}</b> <span className="text-xs text-muted">· {n.position}</span></div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
          <span className="[overflow-wrap:anywhere]">{n.org}{n.admin_name && n.level !== 'tinh' && !String(n.org).includes(n.admin_name) ? ` · ${n.admin_name}` : ''}</span>
          {n.radio_freq && <span className="inline-flex items-center gap-0.5 whitespace-nowrap"><Radio size={11} aria-hidden="true" /> {n.radio_freq}</span>}
          <span className="whitespace-nowrap font-mono text-ink-2">{n.phone}</span>
          <Status s={n.status} />
        </div>
        {showPath && n.path?.length > 0 && <div className="truncate text-[11px] text-muted">Thuộc: {n.path.join(' › ')}</div>}
      </div>
      {n.phone && (
        <a
          className="btn-ghost tap-sq flex h-9 shrink-0 items-center gap-1 px-2.5 text-xs font-semibold text-accent"
          href={tel(n.phone)}
          aria-label={`Gọi ${n.full_name} — ${n.phone}`}
          title={`Gọi ${n.phone} (gọi trực tiếp trên điện thoại / phần mềm gọi; tổng đài web chưa tích hợp)`}
        >
          <Phone size={14} aria-hidden="true" /> <span className="max-sm:hidden">Gọi</span>
        </a>
      )}
    </div>
  );
}

function Node({ n, depth }) {
  const [open, setOpen] = useState(depth === 0);
  const kids = n.children || [];
  // Nhánh đông (VD Trưởng ban → hơn 50 chủ tịch xã): hiện dần 20 người — trang điện thoại không dài hàng nghìn px
  const shown = useShowMore(kids, 20, n.id);
  return (
    <div>
      <Person n={n} depth={depth} kids={kids.length > 0} open={open} onToggle={() => setOpen((o) => !o)} />
      {open && (
        <>
          {shown.visible.map((c) => <Node key={c.id} n={c} depth={depth + 1} />)}
          <div style={{ paddingLeft: Math.min(depth + 1, 3) * 14 }}><ShowMore list={shown} step={20} noun="cán bộ" /></div>
        </>
      )}
    </div>
  );
}

/**
 * Danh bạ khẩn cấp phân cấp Tỉnh → Xã → Thôn (thiết kế E.3): tên, chức vụ, SĐT, tần số bộ đàm, trạng thái trực (chữ, không chỉ
 * chấm màu). Không tìm / lọc: cây mở / thu gọn; tìm không dấu hoặc lọc cấp, trạng thái: danh sách phẳng kèm "Thuộc …", hiện
 * dần 20. Excel / PDF danh sách đang lọc — bản giấy dự phòng khi mất mạng. Tài khoản xã chỉ thấy cấp tỉnh + xã mình (máy chủ).
 */
export default function ContactDirectory({ scopeLabel }) {
  const toast = useStore((s) => s.toast);
  const query = useQuery({ queryKey: ['contacts'], queryFn: () => api('/alerts/contacts'), staleTime: 5 * 60_000 });
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState({ cap: '', tt: '' });
  const [pdf, setPdf] = useState(false);
  const ref = useRef(null);
  const all = flatten(query.data || []);
  const nq = foldVi(q.trim());
  const searched = nq
    ? all.filter((n) => [n.full_name, n.position, n.org, n.phone, n.radio_freq, n.admin_name].some((f) => f && foldVi(f).includes(nq)))
    : all;
  const match = (n, f) => (!f.cap || n.level === f.cap) && (!f.tt || n.status === f.tt);
  const rows = searched.filter((n) => match(n, filters));
  const counts = Object.fromEntries(FILTERS.map((f) => {
    const others = { ...filters, [f.key]: '' };
    const base = searched.filter((n) => match(n, others));
    return [f.key, Object.fromEntries(f.options.map(([v]) => [v, base.filter((n) => match(n, { ...others, [f.key]: v })).length]))];
  }));
  const flat = !!nq || !!filters.cap || !!filters.tt;
  const list = useShowMore(rows, 20, `${nq}|${filters.cap}|${filters.tt}`, pdf);
  const onDuty = all.filter((n) => n.status === 'truc').length;

  const doExcel = async () => {
    if (!rows.length) return;
    try {
      await exportExcel(rows.map((n) => ({
        'Họ tên': n.full_name, 'Chức vụ': n.position, 'Đơn vị': n.org, 'Cấp': LEVELS[n.level] || n.level, 'Xã/phường': n.admin_name || '',
        'Điện thoại': n.phone, 'Tần số bộ đàm': n.radio_freq || '', 'Trạng thái': STATUS[n.status]?.[0] || n.status, 'Thuộc': n.path.join(' › '),
      })), { sheet: 'Danh ba khan cap', filename: `danh-ba-khan-cap-${vnFileStamp(new Date(), true)}.xlsx` });
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
      await exportSnapshotPdf(ref.current, {
        title: 'DANH BẠ KHẨN CẤP PCTT & TKCN – TỈNH CAO BẰNG',
        subtitle: [scopeLabel, `${rows.length} cán bộ`, q.trim() && `tìm "${q.trim()}"`, at.toLocaleString('vi-VN')].filter(Boolean).join(' · '),
        filename: `danh-ba-khan-cap-${vnFileStamp(at, true)}.pdf`,
        layoutWidth: 1280,
      });
    } catch (e) {
      toast({ tone: 'danger', title: 'Không xuất được PDF', body: e.message });
    } finally {
      setPdf(false);
    }
  };

  let body;
  if (query.isLoading) body = <Skeleton height={320} />;
  else if (query.isError && !query.data) body = <ErrorState height={200} onRetry={query.refetch}>Không tải được danh bạ</ErrorState>;
  else if (!all.length) body = <EmptyState height={140}>Chưa có danh bạ — nhập bằng loại dữ liệu “Danh bạ” (xã gửi chờ tỉnh duyệt)</EmptyState>;
  else if (!rows.length) body = <p className="py-6 text-center text-xs text-muted">Không có cán bộ khớp ô tìm / bộ lọc.</p>;
  else if (pdf) {
    body = (
      <table className="table-base">
        <thead><tr><th>Họ tên</th><th>Chức vụ</th><th>Đơn vị</th><th>Điện thoại</th><th>Bộ đàm</th><th>Trạng thái</th></tr></thead>
        <tbody>
          {rows.map((n) => (
            <tr key={n.id}><td>{n.full_name}</td><td>{n.position}</td><td>{n.org}</td><td className="font-mono">{n.phone}</td><td>{n.radio_freq || ''}</td><td>{STATUS[n.status]?.[0]}</td></tr>
          ))}
        </tbody>
      </table>
    );
  } else if (flat) {
    body = (
      <>
        <div className="flex flex-col divide-y divide-line/60">{list.visible.map((n) => <Person key={n.id} n={n} showPath />)}</div>
        <ShowMore list={list} step={20} noun="cán bộ" />
      </>
    );
  } else body = <div className="flex flex-col">{(query.data || []).map((n) => <Node key={n.id} n={n} depth={0} />)}</div>;

  return (
    <Section
      title="Danh bạ phân cấp Tỉnh → Xã → Thôn"
      right={query.data ? <span className="text-[11px] text-muted">{all.length} cán bộ · {onDuty} đang trực</span> : <BookUser size={16} className="text-accent" aria-hidden="true" />}
    >
      <div className="flex flex-col gap-2">
        <FilterToolbar
          fields={FILTERS}
          sorts={[]}
          placeholder="Tìm tên, chức vụ, đơn vị, SĐT, tần số…"
          q={q}
          onSearch={setQ}
          filters={filters}
          counts={query.data ? counts : null}
          onFilter={(key, value) => setFilters((f) => ({ ...f, [key]: value }))}
          onClear={() => { setFilters({ cap: '', tt: '' }); setQ(''); }}
          shown={rows.length}
          total={all.length}
          noun="cán bộ"
          onExcel={doExcel}
          onPdf={doPdf}
          exporting={pdf}
        />
        <div ref={ref} className="bg-panel">{body}</div>
      </div>
    </Section>
  );
}
