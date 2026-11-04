import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '../../api/client';
import { useUnits } from '../../api/hooks';
import { useStore } from '../../app/store';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import ExportMenu from '../common/ExportMenu';
import FilterToolbar from '../common/FilterToolbar';
import { ErrorState, Pager, Skeleton, SortTh } from '../common/ui';
import { CHANNEL, LEVEL, broadcastStatus } from '../../utils/labels';
import { dateTime, foldVi, int, pct, vnFileStamp } from '../../utils/format';
import { exportExcel } from '../../utils/exportExcel';
import { exportSnapshotPdf } from '../../utils/exportPdf';
import { risk } from '../../utils/risk';
import { useMediaQuery } from '../../utils/useMediaQuery';
import { usePaged } from '../../utils/usePaged';
import {
  CHANNEL_SHORT, FILTERS, PHASES, PHASE_LABEL, SEVERITY_LEVEL, SORTS, broadcastFacts, leftText, matchBroadcast, optionCounts, sortBroadcasts,
} from './alertFacts';

const deliveredPct = (b) => {
  const vals = Object.values(b.metrics || {}).filter((v) => v?.integrated !== false && v?.target);
  if (!vals.length) return null;
  const t = vals.reduce((m, v) => m + v.target, 0);
  return pct(vals.reduce((m, v) => m + (v.delivered || 0), 0), t);
};

function Row({ b, x, pdf }) {
  const dp = deliveredPct(b);
  return (
    <tr className={clsx(x.pending && 'bg-warn/10')}>
      <td className={clsx('whitespace-nowrap border-l-4', risk(SEVERITY_LEVEL[b.severity]).edge)}>
        <b className="font-mono text-ink">{b.code}</b>
        {b.auto_generated && <div className="text-xs text-ink-2">Máy đề xuất</div>}
      </td>
      <td><span className={clsx('chip whitespace-nowrap', LEVEL[b.severity]?.cls)}>{LEVEL[b.severity]?.label}</span></td>
      <td className="max-w-[20rem]">
        <div className="font-medium text-ink [overflow-wrap:anywhere]">{b.title}</div>
        <div className={clsx('text-xs text-muted [overflow-wrap:anywhere]', !pdf && 'line-clamp-1')}>{b.message_body}</div>
      </td>
      <td className="whitespace-nowrap"><span className={clsx('chip', broadcastStatus(b).cls)}>{x.pending ? PHASE_LABEL.cho_duyet : broadcastStatus(b).label}</span></td>
      <td className="whitespace-nowrap text-xs">
        {b.target_admin_codes?.length || 0} xã
        <div className="font-mono text-muted">{int(b.audience?.households)} hộ</div>
      </td>
      <td className="text-xs">{(b.channels || []).map((c) => CHANNEL_SHORT[c] || c).join(' · ')}{dp != null && <div className="font-mono text-muted">nhận {dp}%</div>}</td>
      <td className="whitespace-nowrap text-xs">{b.created_by_name || 'Hệ thống'}<div className="text-muted">{dateTime(b.created_at)}</div></td>
      <td className="text-xs">
        {b.status === 'rejected'
          ? <span className="text-danger [overflow-wrap:anywhere]">Trả lại: {b.rejected_reason}</span>
          : b.approved_by_name ? <>{b.approved_by_name}<div className="text-muted">{dateTime(b.approved_at)}</div></> : <span className="text-muted">—</span>}
      </td>
      <td className="whitespace-nowrap text-xs">
        {b.ended_at ? <>Kết thúc<div className="text-muted">{dateTime(b.ended_at)}</div></>
          : b.valid_until ? <>{x.live ? 'Đến' : 'Hết'} {dateTime(b.valid_until)}</> : <span className="text-muted">—</span>}
      </td>
    </tr>
  );
}

/**
 * Dòng bảng gọn trên máy tính (bản vẽ khung D5): gộp vùng · hộ · kênh và soạn · duyệt để bảng vừa khung, tình trạng kèm một dòng
 * nói rõ (còn bao lâu / hết lúc nào / lý do trả lại, kết thúc). Bản PDF vẫn dùng bảng đủ cột.
 */
function DeskRow({ b, x, unitName, now }) {
  const dp = deliveredPct(b);
  const names = (b.target_admin_codes || []).map(unitName);
  const left = x.live && b.valid_until ? Date.parse(b.valid_until) - now : null;
  return (
    <tr className={clsx(x.pending && 'bg-warn/10')}>
      <td className={clsx('whitespace-nowrap border-l-4', risk(SEVERITY_LEVEL[b.severity]).edge)}>
        <b className="font-mono text-ink">{b.code}</b>
        {b.auto_generated && <div className="text-xs text-ink-2">Máy đề xuất</div>}
      </td>
      <td><span className={clsx('chip whitespace-nowrap', LEVEL[b.severity]?.cls)}>{LEVEL[b.severity]?.label}</span></td>
      <td className="max-w-[22rem]">
        <div className="font-medium text-ink [overflow-wrap:anywhere]">{b.title}</div>
        <div className="line-clamp-1 text-xs text-muted [overflow-wrap:anywhere]" title={b.message_body}>{b.message_body}</div>
      </td>
      <td className="text-xs">
        <div className="text-sm text-ink">{names.length > 2 ? `${names.length} xã` : names.length ? names.join(', ') : 'Vùng vẽ'} · <span className="num">{int(b.audience?.households)}</span> hộ</div>
        <div className="text-muted">{(b.channels || []).map((c) => CHANNEL_SHORT[c] || c).join(' · ')}{dp != null ? ` · nhận ${dp}%` : ''}</div>
      </td>
      <td className="text-xs">
        <span className={clsx('chip whitespace-nowrap', broadcastStatus(b).cls)}>{x.pending ? PHASE_LABEL.cho_duyet : broadcastStatus(b).label}</span>
        <div className={clsx('mt-1 [overflow-wrap:anywhere]', b.status === 'rejected' ? 'text-danger' : x.soon ? 'font-semibold text-serious' : 'text-muted')}>
          {b.status === 'rejected' ? `Trả lại: ${b.rejected_reason}`
            : b.ended_at ? `Kết thúc ${dateTime(b.ended_at)}${b.end_note ? `: ${b.end_note}` : ''}`
              : left != null ? `còn ${leftText(left)}`
                : b.valid_until ? `Hết ${dateTime(b.valid_until)}` : ''}
        </div>
      </td>
      <td className="whitespace-nowrap text-xs">
        {b.created_by_name || 'Hệ thống'} <span className="text-muted">{dateTime(b.created_at)}</span>
        {b.approved_by_name && b.status !== 'rejected' && <div>Duyệt: {b.approved_by_name} <span className="text-muted">{dateTime(b.approved_at)}</span></div>}
      </td>
    </tr>
  );
}

function Card({ b, x }) {
  const dp = deliveredPct(b);
  return (
    <article className={clsx('card min-w-0 border-l-4 p-3 text-xs', risk(SEVERITY_LEVEL[b.severity]).edge)} aria-label={`${b.code} — ${PHASE_LABEL[x.phase] || broadcastStatus(b).label}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <b className="font-mono text-sm">{b.code}</b>
        <span className={clsx('chip whitespace-nowrap', LEVEL[b.severity]?.cls)}>{LEVEL[b.severity]?.label}</span>
        <span className={clsx('chip whitespace-nowrap', broadcastStatus(b).cls)}>{x.pending ? PHASE_LABEL.cho_duyet : broadcastStatus(b).label}</span>
        {b.auto_generated && <span className="chip whitespace-nowrap border border-warn bg-warn/20 text-ink">Máy đề xuất</span>}
      </div>
      <h3 className="mt-1 text-sm font-semibold text-ink [overflow-wrap:anywhere]">{b.title}</h3>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-muted">
        <span>{b.target_admin_codes?.length || 0} xã · {int(b.audience?.households)} hộ</span>
        <span>{(b.channels || []).map((c) => CHANNEL_SHORT[c] || c).join(' · ')}{dp != null ? ` · nhận ${dp}%` : ''}</span>
      </div>
      <div className="mt-1 text-muted">
        Soạn {dateTime(b.created_at)} — {b.created_by_name || 'hệ thống'}
        {b.approved_by_name && b.status !== 'rejected' && <> · duyệt {dateTime(b.approved_at)} — {b.approved_by_name}</>}
      </div>
      {b.status === 'rejected' && <div className="mt-1 text-danger [overflow-wrap:anywhere]">Trả lại ({b.approved_by_name || 'lãnh đạo'}): {b.rejected_reason}</div>}
      {b.ended_at && <div className="mt-1 text-muted [overflow-wrap:anywhere]">Kết thúc {dateTime(b.ended_at)}{b.end_note ? `: ${b.end_note}` : ''}</div>}
    </article>
  );
}

/**
 * Lịch sử lệnh cảnh báo (thiết kế E.4 — truy xuất, rút kinh nghiệm): 200 lệnh gần nhất trong phạm vi được xem, tìm không dấu
 * (mã, tiêu đề, nội dung, người soạn / duyệt), lọc trạng thái / mức / kênh / nguồn kèm số lệnh (trên địa chỉ trang), xếp,
 * phân trang; Excel / PDF mọi lệnh đang lọc. Máy tính: bảng; điện thoại, iPad dọc: thẻ. Đang tải / lỗi / trống nói rõ.
 */
export default function BroadcastHistory({ now, scopeLabel, onManage }) {
  // Máy tính ≥ 1280 px (bản vẽ khung D5): một khối — thẻ trạng thái, ô tìm + lọc + Xuất, bảng gọn; lệnh sắp hết hiệu lực có
  // nút Gia hạn / Kết thúc ngay dưới bảng
  const desk = useMediaQuery('(min-width: 1280px)');
  const toast = useStore((s) => s.toast);
  const { data: units = [] } = useUnits();
  const isLg = useMediaQuery('(min-width: 1024px)');
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(FILTERS.map((f) => [f.key, f.options.some(([v]) => v === params.get(f.key)) ? params.get(f.key) : '']));
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(SORTS[0][0]);
  const [pageSize, setPageSize] = useState(() => (window.innerWidth >= 1024 ? 20 : 10));
  const [pdf, setPdf] = useState(false);
  const contentRef = useRef(null);
  const query = useQuery({ queryKey: ['broadcasts', 'lich-su'], queryFn: () => api('/alerts/broadcasts', { params: { limit: 200 } }), refetchInterval: 60_000 });
  const all = query.data || [];
  const facts = new Map(all.map((b) => [b.id, broadcastFacts(b, now)]));
  const factsOf = (b) => facts.get(b.id) || broadcastFacts(b, now);
  const nq = foldVi(q.trim());
  const searched = nq
    ? all.filter((b) => [b.code, b.title, b.message_body, b.created_by_name, b.approved_by_name, b.trigger_source].some((f) => f && foldVi(f).includes(nq)))
    : all;
  const rows = sortBroadcasts(searched.filter((b) => matchBroadcast(b, filters, factsOf(b))), sort, factsOf);
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, optionCounts(searched, filters, f.key, factsOf)]));
  const paged = usePaged(rows, pageSize, `${nq}|${JSON.stringify(filters)}|${sort}|${pageSize}`, pdf);
  const setParam = (patch) => setParams((p) => {
    const next = new URLSearchParams(p);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    return next;
  }, { replace: true });
  const clearAll = () => {
    setParams((p) => {
      const next = new URLSearchParams(p);
      FILTERS.forEach((f) => next.delete(f.key));
      return next;
    }, { replace: true });
    setQ('');
  };
  const unitName = (c) => units.find((u) => u.code === c)?.name || c;

  const doExcel = async () => {
    if (!rows.length) return;
    try {
      await exportExcel(rows.map((b) => {
        const x = factsOf(b);
        return {
          'Mã lệnh': b.code, 'Mức': LEVEL[b.severity]?.label || b.severity, 'Tiêu đề': b.title, 'Nội dung tin': b.message_body,
          'Trạng thái': x.pending ? PHASE_LABEL.cho_duyet : broadcastStatus(b).label, 'Nguồn': b.auto_generated ? `Máy đề xuất (${b.trigger_source || 'trạm'})` : 'Cán bộ soạn',
          'Xã/phường nhận': (b.target_admin_codes || []).map(unitName).join(', '), 'Số hộ': b.audience?.households ?? '',
          'Thuê bao': b.audience?.subscribers ?? '', 'Loa': b.audience?.speakers ?? '', 'Kênh': (b.channels || []).map((c) => CHANNEL[c] || c).join(', '),
          'Đã nhận (%)': deliveredPct(b) ?? '', 'Người soạn': b.created_by_name || 'Hệ thống', 'Soạn lúc': dateTime(b.created_at),
          'Người duyệt / từ chối': b.approved_by_name || '', 'Duyệt lúc': b.approved_at ? dateTime(b.approved_at) : '',
          'Hiệu lực đến': b.valid_until ? dateTime(b.valid_until) : '', 'Kết thúc lúc': b.ended_at ? dateTime(b.ended_at) : '',
          'Lý do từ chối / thông báo kết thúc': b.rejected_reason || b.end_note || '',
        };
      }), { sheet: 'Lenh canh bao', filename: `lenh-canh-bao-${vnFileStamp(new Date(), true)}.xlsx` });
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
      const active = FILTERS.filter((f) => filters[f.key]).map((f) => f.options.find(([v]) => v === filters[f.key])?.[1]);
      await exportSnapshotPdf(contentRef.current, {
        title: 'BÁO CÁO LỆNH CẢNH BÁO KHẨN CẤP – TỈNH CAO BẰNG',
        subtitle: [scopeLabel, `${rows.length} lệnh`, ...active, q.trim() && `tìm "${q.trim()}"`, at.toLocaleString('vi-VN')].filter(Boolean).join(' · '),
        filename: `lenh-canh-bao-${vnFileStamp(at, true)}.pdf`,
        layoutWidth: 1280,
      });
    } catch (e) {
      toast({ tone: 'danger', title: 'Không xuất được PDF', body: e.message });
    } finally {
      setPdf(false);
    }
  };

  const activeFilters = FILTERS.some((f) => filters[f.key]) || !!nq;
  let body;
  if (query.isLoading) body = <Skeleton height={320} />;
  else if (query.isError && !query.data) body = <ErrorState height={200} onRetry={query.refetch}>Không tải được lịch sử lệnh cảnh báo</ErrorState>;
  else if (!rows.length) {
    body = (
      <p className="card p-6 text-center text-xs text-muted">
        {activeFilters ? 'Không có lệnh khớp ô tìm / bộ lọc.' : 'Chưa có lệnh cảnh báo nào trong phạm vi bạn được xem.'}
      </p>
    );
  } else if (desk && !pdf) {
    body = (
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <SortTh>Mã</SortTh>
              <SortTh>Mức</SortTh>
              <SortTh>Tiêu đề · nội dung</SortTh>
              <SortTh k="nhieu_ho" dir="descending" sort={sort} onSort={setSort}>Vùng nhận · kênh</SortTh>
              <SortTh k="uu_tien" sort={sort} onSort={setSort}>Tình trạng</SortTh>
              <SortTh k="moi_nhat" dir="descending" sort={sort} onSort={setSort}>Soạn · duyệt</SortTh>
            </tr>
          </thead>
          <tbody>{paged.visible.map((b) => <DeskRow key={b.id} b={b} x={factsOf(b)} unitName={unitName} now={now} />)}</tbody>
        </table>
      </div>
    );
  } else if (isLg || pdf) {
    body = (
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <SortTh pdf={pdf}>Mã</SortTh>
              <SortTh pdf={pdf}>Mức</SortTh>
              <SortTh pdf={pdf}>Tiêu đề · nội dung</SortTh>
              <SortTh k="uu_tien" sort={sort} onSort={setSort} pdf={pdf}>Trạng thái</SortTh>
              <SortTh k="nhieu_ho" dir="descending" sort={sort} onSort={setSort} pdf={pdf}>Vùng · hộ</SortTh>
              <SortTh pdf={pdf}>Kênh</SortTh>
              <SortTh k="moi_nhat" dir="descending" sort={sort} onSort={setSort} pdf={pdf}>Soạn</SortTh>
              <SortTh pdf={pdf}>Duyệt</SortTh>
              <SortTh k="het_han" sort={sort} onSort={setSort} pdf={pdf}>Hiệu lực</SortTh>
            </tr>
          </thead>
          <tbody>{(pdf ? rows : paged.visible).map((b) => <Row key={b.id} b={b} x={factsOf(b)} pdf={pdf} />)}</tbody>
        </table>
      </div>
    );
  } else {
    body = <div className="grid gap-2 md:grid-cols-2">{paged.visible.map((b) => <Card key={b.id} b={b} x={factsOf(b)} />)}</div>;
  }

  const soonRows = all.filter((b) => factsOf(b).soon && b.can_manage);
  if (desk) {
    const phase = FILTERS.find((f) => f.key === 'tt');
    const ttCounts = counts.tt || {};
    return (
      <section aria-label="Lịch sử lệnh" className="sheet flex flex-col gap-3 p-4">
        <div className="seg-track self-start" role="group" aria-label={phase.label}>
          {[['', 'Tất cả'], ...PHASES].map(([v, label]) => (
            <button key={v || 'tat-ca'} type="button" aria-pressed={filters.tt === v} onClick={() => setParam({ tt: v })} className={clsx('tap seg-item min-h-[40px]', filters.tt === v && 'seg-item-on')}>
              {label}{v && query.data && ttCounts[v] ? <span className="num text-muted"> ({ttCounts[v]})</span> : ''}
            </button>
          ))}
        </div>
        <FilterToolbar
          inline
          fields={FILTERS.filter((f) => f.key !== 'tt')}
          sorts={[]}
          placeholder="Tìm mã lệnh, tiêu đề, nội dung, người soạn…"
          q={q}
          onSearch={setQ}
          filters={filters}
          counts={query.data ? counts : null}
          onFilter={(key, value) => setParam({ [key]: value })}
          onClear={clearAll}
          shown={rows.length}
          total={all.length}
          noun="lệnh"
        >
          <ExportMenu
            title={`Xuất ${rows.length} lệnh đang lọc`}
            buttonClass="btn-secondary tap h-11 rounded-xl px-4"
            items={[
              { key: 'xlsx', label: 'Bảng Excel', hint: `${rows.length} lệnh đang lọc`, icon: FileSpreadsheet, onClick: doExcel, disabled: !rows.length },
              { key: 'pdf', label: 'Báo cáo PDF', hint: 'Bảng đủ cột, khổ A4 ngang', icon: FileDown, onClick: doPdf, disabled: !rows.length, busy: pdf },
            ]}
          />
        </FilterToolbar>
        <div ref={contentRef} className="flex flex-col gap-2 bg-panel">
          {body}
          {!pdf && rows.length > 0 && <Pager paged={paged} size={pageSize} onSize={setPageSize} noun="lệnh" />}
        </div>
        {onManage && soonRows.map((b) => (
          <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-[14px] bg-panel2 p-3.5">
            <b className="text-sm text-ink">{b.code} sắp hết hiệu lực</b>
            <span className="text-[13px] text-ink-2">còn {leftText(Date.parse(b.valid_until) - now)}</span>
            <span className="flex-1" />
            <button type="button" className="btn-secondary tap h-10 rounded-xl px-4" onClick={() => onManage({ b, mode: 'extend' })}>Gia hạn…</button>
            <button type="button" className="btn-secondary tap h-10 rounded-xl px-4" onClick={() => onManage({ b, mode: 'end' })}>Kết thúc…</button>
          </div>
        ))}
        <p className="rounded-[14px] border border-dashed border-line p-3 text-[13px] leading-normal text-ink-2">
          Gia hạn / kết thúc cần quyền duyệt và mã PIN. Lệnh đã hết hạn không gia hạn được — soạn lệnh mới.
          {all.length >= 200 && ' Hiện 200 lệnh gần nhất; lệnh cũ hơn tra trong Nhật ký pháp lý.'}
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <FilterToolbar
        fields={FILTERS}
        sorts={SORTS}
        placeholder="Tìm mã lệnh, tiêu đề, nội dung, người soạn…"
        q={q}
        onSearch={setQ}
        filters={filters}
        counts={query.data ? counts : null}
        onFilter={(key, value) => setParam({ [key]: value })}
        onClear={clearAll}
        sort={sort}
        onSort={setSort}
        shown={rows.length}
        total={all.length}
        noun="lệnh"
        onExcel={doExcel}
        onPdf={doPdf}
        exporting={pdf}
      />
      <div ref={contentRef} className="flex flex-col gap-2 bg-bg">
        {body}
        {!pdf && rows.length > 0 && <Pager paged={paged} size={pageSize} onSize={setPageSize} noun="lệnh" />}
      </div>
      {all.length >= 200 && <p className="text-[11px] text-muted">Hiện 200 lệnh gần nhất. Lệnh cũ hơn tra trong Nhật ký pháp lý.</p>}
    </div>
  );
}
