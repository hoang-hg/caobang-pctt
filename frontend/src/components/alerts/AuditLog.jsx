import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import FilterToolbar from '../common/FilterToolbar';
import { FieldError, ErrorState, Pager, Skeleton, SortTh } from '../common/ui';
import { foldVi, int, vnFileStamp } from '../../utils/format';
import { exportExcel } from '../../utils/exportExcel';
import { exportSnapshotPdf } from '../../utils/exportPdf';
import { useMediaQuery } from '../../utils/useMediaQuery';
import { usePaged } from '../../utils/usePaged';
import { AUDIT_GROUPS, auditAction, auditDetail } from './alertFacts';

const MAX_ROWS = 5000; // như AUDIT_MAX_ROWS (backend)
const RANGES = [['1n', '24 giờ', 1], ['7n', '7 ngày', 7], ['30n', '30 ngày', 30], ['90n', '90 ngày', 90], ['tuy_chon', 'Tuỳ chọn']];
const RESULTS = [['ok', 'Thành công'], ['loi', 'Thất bại (sai PIN, sai mã…)']];
const SORTS = [['moi', 'Mới nhất'], ['cu', 'Cũ nhất']];
const stamp = (t) => new Date(t).toLocaleString('vi-VN');
const dayStart = (iso) => new Date(`${iso}T00:00:00+07:00`);
const isoDay = (d) => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10); // ngày theo giờ Việt Nam

/**
 * Nhật ký pháp lý (thiết kế E.4): ai làm gì, lúc nào, trên đối tượng nào — truy xuất, rút kinh nghiệm sau thiên tai. Chọn
 * khoảng (24 giờ / 7 / 30 / 90 ngày / tuỳ chọn — tải tối đa 5.000 thao tác mới nhất của khoảng), tìm không dấu, lọc nhóm thao
 * tác / kết quả / người thực hiện kèm số dòng, xếp, phân trang; Excel / PDF mọi dòng đang lọc. Máy tính: bảng; điện thoại:
 * thẻ. Chỉ tài khoản có quyền "Xem nhật ký" (máy chủ kiểm tra).
 */
export default function AuditLog() {
  const toast = useStore((s) => s.toast);
  const isLg = useMediaQuery('(min-width: 1024px)');
  const [params, setParams] = useSearchParams();
  const range = RANGES.find(([k]) => k === params.get('ky')) || RANGES[1];
  const today = isoDay(new Date());
  const [from, setFrom] = useState(() => isoDay(new Date(Date.now() - 7 * 86400e3)));
  const [to, setTo] = useState(today);
  const rangeErr = range[0] === 'tuy_chon' && (!from || !to || from > to) ? 'Chọn ngày bắt đầu không sau ngày kết thúc' : null;
  const since = range[0] === 'tuy_chon' ? (from && dayStart(from)) : new Date(Date.now() - range[2] * 86400e3);
  const until = range[0] === 'tuy_chon' && to ? new Date(dayStart(to).getTime() + 86400e3) : null;
  // Khoá truy vấn theo ngày (không theo phút) — tránh tải lại liên tục; nút "Làm mới" của trình duyệt / sự kiện mới vẫn cập nhật
  const key = range[0] === 'tuy_chon' ? `${from}_${to}` : `${range[0]}_${today}`;
  const query = useQuery({
    queryKey: ['audit', key],
    queryFn: () => api('/alerts/audit', { params: { limit: MAX_ROWS, since: since.toISOString(), ...(until && { until: until.toISOString() }) } }),
    enabled: !rangeErr,
  });
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState({ nhom: '', kq: '', nguoi: '' });
  const [sort, setSort] = useState('moi');
  const [pageSize, setPageSize] = useState(() => (window.innerWidth >= 1024 ? 50 : 20));
  const [pdf, setPdf] = useState(false);
  const ref = useRef(null);

  const all = (query.data || []).map((a) => ({ ...a, act: auditAction(a.action), text: auditDetail(a.details) }));
  const actors = [...new Set(all.map((a) => a.actor_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  const fields = [
    { key: 'nhom', label: 'Nhóm thao tác', all: 'Mọi nhóm thao tác', options: [...AUDIT_GROUPS, ['khac', 'Khác']] },
    { key: 'kq', label: 'Kết quả', all: 'Mọi kết quả', options: RESULTS },
    { key: 'nguoi', label: 'Người thực hiện', all: 'Mọi người thực hiện', options: actors.map((n) => [n, n]) },
  ];
  const nq = foldVi(q.trim());
  const searched = nq ? all.filter((a) => [a.actor_name, a.act.label, a.action, a.entity_id, a.text].some((f) => f && foldVi(f).includes(nq))) : all;
  const match = (a, f) => (!f.nhom || a.act.group === f.nhom) && (!f.kq || (f.kq === 'loi') === a.act.failed) && (!f.nguoi || a.actor_name === f.nguoi);
  const rows = searched.filter((a) => match(a, filters)).sort((a, b) => (sort === 'cu' ? 1 : -1) * (Date.parse(a.time) - Date.parse(b.time)));
  const counts = Object.fromEntries(fields.map((f) => {
    const others = { ...filters, [f.key]: '' };
    const base = searched.filter((a) => match(a, others));
    return [f.key, Object.fromEntries(f.options.map(([v]) => [v, base.filter((a) => match(a, { ...others, [f.key]: v })).length]))];
  }));
  const paged = usePaged(rows, pageSize, `${key}|${nq}|${JSON.stringify(filters)}|${sort}|${pageSize}`, pdf);
  const rangeLabel = range[0] === 'tuy_chon' ? `từ ${from.split('-').reverse().join('/')} đến ${to.split('-').reverse().join('/')}` : `${range[1]} qua`;
  const failed = rows.filter((a) => a.act.failed).length;

  const doExcel = async () => {
    if (!rows.length) return;
    try {
      await exportExcel(rows.map((a) => ({
        'Thời gian': stamp(a.time), 'Người thực hiện': a.actor_name, 'Thao tác': a.act.label, 'Mã thao tác': a.action,
        'Kết quả': a.act.failed ? 'Thất bại' : 'Thành công', 'Đối tượng': a.entity || '', 'Mã đối tượng': a.entity_id || '', 'Chi tiết': a.text,
      })), { sheet: 'Nhat ky phap ly', filename: `nhat-ky-phap-ly-${vnFileStamp(new Date(), true)}.xlsx` });
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
      const active = fields.filter((f) => filters[f.key]).map((f) => f.options.find(([v]) => v === filters[f.key])?.[1]);
      await exportSnapshotPdf(ref.current, {
        title: 'NHẬT KÝ PHÁP LÝ – HỆ THỐNG PCTT & TKCN TỈNH CAO BẰNG',
        subtitle: [rangeLabel, `${rows.length} thao tác`, ...active, q.trim() && `tìm "${q.trim()}"`, `in lúc ${at.toLocaleString('vi-VN')}`].filter(Boolean).join(' · '),
        filename: `nhat-ky-phap-ly-${vnFileStamp(at, true)}.pdf`,
        layoutWidth: 1280,
      });
    } catch (e) {
      toast({ tone: 'danger', title: 'Không xuất được PDF', body: e.message });
    } finally {
      setPdf(false);
    }
  };

  let body;
  if (rangeErr) body = null;
  else if (query.isLoading) body = <Skeleton height={360} />;
  else if (query.isError && !query.data) body = <ErrorState height={200} onRetry={query.refetch}>Không tải được nhật ký pháp lý</ErrorState>;
  else if (!rows.length) {
    body = <p className="card p-6 text-center text-xs text-muted">{all.length ? 'Không có thao tác khớp ô tìm / bộ lọc.' : `Không có thao tác nào trong ${rangeLabel}.`}</p>;
  } else if (isLg || pdf) {
    body = (
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <SortTh k={sort === 'moi' ? 'moi' : 'cu'} dir={sort === 'moi' ? 'descending' : 'ascending'} sort={sort} onSort={() => setSort(sort === 'moi' ? 'cu' : 'moi')} pdf={pdf}>Thời gian</SortTh>
              <th scope="col">Người thực hiện</th>
              <th scope="col">Thao tác</th>
              <th scope="col">Đối tượng</th>
              <th scope="col">Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {(pdf ? rows : paged.visible).map((a) => (
              <tr key={a.id} className={clsx(a.act.failed && 'bg-danger/5')}>
                <td className="whitespace-nowrap font-mono text-xs">{stamp(a.time)}</td>
                <td className="text-sm">{a.actor_name}</td>
                <td className="text-sm">
                  {a.act.label}
                  {a.act.failed && <span className="chip ml-1.5 bg-danger text-white">Thất bại</span>}
                </td>
                <td className="font-mono text-xs [overflow-wrap:anywhere]">{a.entity_id}</td>
                <td className={clsx('max-w-md text-xs text-muted [overflow-wrap:anywhere]', !pdf && 'line-clamp-2')} title={a.text}>{a.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } else {
    body = (
      <ul className="flex flex-col gap-2">
        {paged.visible.map((a) => (
          <li key={a.id} className={clsx('card min-w-0 p-2.5 text-xs', a.act.failed && 'border-danger/50 bg-danger/5')}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <b className="text-sm text-ink">{a.act.label}</b>
              {a.act.failed && <span className="chip bg-danger text-white">Thất bại</span>}
              <span className="ml-auto whitespace-nowrap font-mono text-muted">{stamp(a.time)}</span>
            </div>
            <div className="mt-0.5 text-ink-2">{a.actor_name}{a.entity_id ? <> · <span className="font-mono [overflow-wrap:anywhere]">{a.entity_id}</span></> : null}</div>
            {a.text && <div className="mt-0.5 line-clamp-3 text-muted [overflow-wrap:anywhere]">{a.text}</div>}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-col gap-2 p-2 no-print">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Khoảng thời gian">
          <span className="mr-1 text-xs font-medium text-muted">Khoảng</span>
          {RANGES.map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={range[0] === k}
              onClick={() => setParams((p) => { const n = new URLSearchParams(p); if (k === '7n') n.delete('ky'); else n.set('ky', k); return n; }, { replace: true })}
              className={clsx('tap inline-flex min-h-[32px] items-center rounded-lg px-2.5 text-xs font-semibold', range[0] === k ? 'bg-accent text-white' : 'bg-panel2/70 text-muted hover:text-ink')}
            >
              {label}
            </button>
          ))}
        </div>
        {range[0] === 'tuy_chon' && (
          <div className="flex flex-wrap items-end gap-2 text-xs">
            <label className="flex flex-col gap-1">Từ ngày<input type="date" className={clsx('input tap min-h-[36px] w-auto', rangeErr && 'border-danger')} value={from} max={today} onChange={(e) => setFrom(e.target.value)} aria-invalid={!!rangeErr} aria-describedby="loi-khoang-ngay" /></label>
            <label className="flex flex-col gap-1">Đến ngày<input type="date" className={clsx('input tap min-h-[36px] w-auto', rangeErr && 'border-danger')} value={to} max={today} onChange={(e) => setTo(e.target.value)} aria-invalid={!!rangeErr} aria-describedby="loi-khoang-ngay" /></label>
            <FieldError id="loi-khoang-ngay">{rangeErr}</FieldError>
          </div>
        )}
      </div>
      <FilterToolbar
        fields={fields}
        sorts={SORTS}
        placeholder="Tìm người, thao tác, mã đối tượng, chi tiết…"
        q={q}
        onSearch={setQ}
        filters={filters}
        counts={query.data ? counts : null}
        onFilter={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
        onClear={() => { setFilters({ nhom: '', kq: '', nguoi: '' }); setQ(''); }}
        sort={sort}
        onSort={setSort}
        shown={rows.length}
        total={all.length}
        noun="thao tác"
        onExcel={doExcel}
        onPdf={doPdf}
        exporting={pdf}
      />
      {query.data && (
        <p className="text-[11px] text-muted">
          {int(all.length)} thao tác {rangeLabel}{failed ? <> · <b className="text-danger">{failed} thất bại</b></> : ''}
          {all.length >= MAX_ROWS && ` — chỉ tải ${int(MAX_ROWS)} thao tác mới nhất, thu hẹp khoảng ngày để xem đủ`}
        </p>
      )}
      <div ref={ref} className="flex flex-col gap-2 bg-bg">
        {body}
        {!pdf && rows.length > 0 && <Pager paged={paged} size={pageSize} sizes={[20, 50, 100]} onSize={setPageSize} noun="thao tác" />}
      </div>
    </div>
  );
}
