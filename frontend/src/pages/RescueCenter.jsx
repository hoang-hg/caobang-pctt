import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Columns3, List, RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import { useAreaQuery, useUnits } from '../api/hooks';
import { useStore } from '../app/store';
import { ErrorState, Pager, Skeleton } from '../components/common/ui';
import FilterToolbar from '../components/common/FilterToolbar';
import UrgentStrip from '../components/common/UrgentStrip';
import DispatchModal from '../components/common/DispatchModal';
import { MissionLinkModal } from '../components/common/MissionLink';
import CancelDispatchModal from '../components/common/CancelDispatchModal';
import EditTicketModal from '../components/common/EditTicketModal';
import ConnectionBanner from '../components/dashboard/ConnectionBanner';
import { unitLabel } from '../components/dashboard/CommuneView';
import Evacuation from '../components/rescue/Evacuation';
import Intake from '../components/rescue/Intake';
import RescueBoard from '../components/rescue/RescueBoard';
import RescueKpis from '../components/rescue/RescueKpis';
import TicketTable from '../components/rescue/TicketTable';
import {
  COLUMN_KEYS, FILTERS, SORTS, matchTicket, optionCounts, rescueAlerts, sortTickets, ticketFacts,
} from '../components/rescue/rescueFacts';
import { Can, useAllowedCodes } from '../rbac/usePermission';
import { INCIDENT, PRIORITY, SOS_STATUS, SOURCE, VULNERABLE } from '../utils/labels';
import { dateTime, foldVi, vnFileStamp } from '../utils/format';
import { exportExcel } from '../utils/exportExcel';
import { exportSnapshotPdf } from '../utils/exportPdf';
import { useMediaQuery } from '../utils/useMediaQuery';
import { useOnline } from '../utils/useOnline';
import { usePaged } from '../utils/usePaged';

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const VIEWS = [['bang', 'Bảng điều phối', Columns3], ['danh_sach', 'Danh sách', List]];
const minutes = (from, to) => (from && to ? Math.round((new Date(to) - new Date(from)) / 60000) : '');

/**
 * Trung tâm Điều hành Cứu hộ & Điểm nóng (thiết kế D). Trên cùng: dải thông tin khẩn (quá hạn SLA, cấp 1 chưa có đội, đội
 * cần chi viện, điểm sơ tán đầy…) → 4 ô chỉ số → tìm / lọc → "Bảng điều phối" 4 cột (từ 1280 px; nhỏ hơn: thẻ chọn cột) hoặc
 * "Danh sách" (bảng / thẻ, phân trang, xuất Excel / PDF mọi phiếu đang lọc) → tiếp nhận đa kênh, giám sát sơ tán.
 * Bộ lọc, cách xem, cột đang xem nằm trên địa chỉ trang (?th=qua_han&xem=danh_sach): dải khẩn / ô chỉ số dẫn thẳng tới
 * phiếu cần xử lý; Quay lại trả bộ lọc cũ. Dải khẩn, ô chỉ số, số đếm của bộ lọc và bảng dùng CÙNG danh sách phiếu, cùng
 * đồng hồ SLA. Nút ghi chỉ hiện với quyền ở đúng xã của phiếu (backend kiểm tra lại); mất mạng → tắt, nói lý do.
 */
export default function RescueCenter() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const online = useOnline();
  const wide = useMediaQuery('(min-width: 1280px)'); // đủ 4 cột bảng điều phối
  const isLg = useMediaQuery('(min-width: 1024px)'); // danh sách dạng bảng
  const filter = useStore((s) => s.filter);
  const setFocus = useStore((s) => s.setFocus);
  const toast = useStore((s) => s.toast);
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const view = params.get('xem') === 'danh_sach' ? 'danh_sach' : 'bang';
  const column = COLUMN_KEYS.includes(params.get('cot')) ? params.get('cot') : COLUMN_KEYS[0];
  const filters = Object.fromEntries(FILTERS.map((f) => [f.key, f.options.some(([v]) => v === params.get(f.key)) ? params.get(f.key) : '']));
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(SORTS[0][0]);
  const [pageSize, setPageSize] = useState(() => (window.innerWidth >= 1024 ? 20 : 10));
  const [pdf, setPdf] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dispatch, setDispatch] = useState(null);
  const [linkFor, setLinkFor] = useState(null);
  const [cancelFor, setCancelFor] = useState(null);
  const [editFor, setEditFor] = useState(null);
  const contentRef = useRef(null);
  const boardRef = useRef(null);

  // Tài khoản xã chưa lọc: tiêu đề là xã của mình, không ghi "Toàn tỉnh" (như Tổng quan)
  const scope = useAllowedCodes('sos', 'view');
  const { data: units = [] } = useUnits();
  const scopeUnit = scope?.length === 1 ? units.find((u) => u.code === scope[0]) : null;
  const scopeLabel = filter.codes.length || scope === null ? filter.label : scopeUnit ? unitLabel(scopeUnit) : `${scope.length} xã/phường được giao`;

  const ticketsQ = useAreaQuery('sos', '/sos', {}, { refetchInterval: 20_000 });
  const evacQ = useAreaQuery('evacuation', '/evacuation', {}, { refetchInterval: 30_000 });
  const tickets = ticketsQ.data || [];

  const factsById = new Map(tickets.map((t) => [t.id, ticketFacts(t, now)]));
  const factsOf = (t) => factsById.get(t.id) || ticketFacts(t, now);
  const nq = foldVi(q.trim());
  const searched = nq
    ? tickets.filter((t) => [t.code, t.address, t.admin_name, t.raw_message, t.reporter_phone, t.force_name, INCIDENT[t.incident_type]]
      .some((f) => f && foldVi(f).includes(nq)))
    : tickets;
  const rows = sortTickets(searched.filter((t) => matchTicket(t, filters, factsOf(t))), sort, factsOf);
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, optionCounts(searched, filters, f.key, factsOf)]));
  const activeFilters = FILTERS.some((f) => filters[f.key]) || !!nq;
  const paged = usePaged(rows, pageSize, `${nq}|${JSON.stringify(filters)}|${sort}|${pageSize}`, pdf);
  const alerts = rescueAlerts({ tickets, sites: evacQ.data?.sites, factsOf });

  const setParam = (patch, replace = true) => setParams((p) => {
    const next = new URLSearchParams(p);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    return next;
  }, { replace });
  const scrollTo = (el) => requestAnimationFrame(() => requestAnimationFrame(() => el?.scrollIntoView({ behavior: 'smooth', block: 'start' })));
  // Dải khẩn / ô chỉ số → bộ lọc (một mục lịch sử: Quay lại trả về chỗ cũ); bảng hẹp: mở cột đầu tiên có phiếu khớp
  const go = (f, sortKey) => {
    const matches = tickets.filter((t) => matchTicket(t, f, factsOf(t)));
    const next = new URLSearchParams();
    if (view !== 'bang') next.set('xem', view);
    Object.entries(f).forEach(([k, v]) => v && next.set(k, v));
    const col = COLUMN_KEYS.find((k) => matches.some((t) => t.status === k));
    if (col && col !== COLUMN_KEYS[0]) next.set('cot', col);
    setParams(next);
    setQ('');
    if (sortKey) setSort(sortKey);
    scrollTo(boardRef.current);
  };
  const clearAll = () => {
    setParams(() => {
      const next = new URLSearchParams();
      if (view !== 'bang') next.set('xem', view);
      if (column !== COLUMN_KEYS[0]) next.set('cot', column);
      return next;
    }, { replace: true });
    setQ('');
  };

  const move = async (id, status) => {
    const t = tickets.find((x) => x.id === id);
    if (!t || t.status === status) return;
    try {
      if (status === 'hoan_thanh') await api(`/sos/${id}/resolve`, { method: 'POST' });
      else await api(`/sos/${id}`, { method: 'PATCH', body: { status } });
      qc.invalidateQueries({ queryKey: ['sos'] });
      if (status === 'dieu_phoi') setDispatch({ ...t, status });
    } catch (e) {
      toast({ tone: 'danger', title: 'Không cập nhật được', body: e.message });
    }
  };
  const onArrived = async (t) => {
    try {
      await api(`/dispatch/${t.dispatch_id}/arrived`, { method: 'POST' });
      qc.invalidateQueries({ queryKey: ['sos'] });
      toast({ tone: 'good', title: `${t.force_name || 'Lực lượng'} đã đến hiện trường ${t.code}` });
    } catch (e) {
      toast({ tone: 'danger', title: 'Không cập nhật được', body: e.message });
    }
  };
  const onFocus = (t) => {
    setFocus({ lat: t.lat, lon: t.lon, zoom: 15, label: t.code });
    navigate('/ban-do');
  };
  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all(['sos', 'evacuation'].map((key) => qc.refetchQueries({ queryKey: [key], type: 'active' })));
    } finally {
      setRefreshing(false);
    }
  };

  // Xuất mọi phiếu đang lọc (mọi trạng thái). Không kèm SĐT người báo tin, nội dung tin nhắn — báo cáo cấp trên không cần
  // dữ liệu cá nhân của người dân
  const doExcel = async () => {
    if (!rows.length) return;
    try {
      await exportExcel(rows.map((t) => {
        const x = factsOf(t);
        return {
          'Mã phiếu': t.code, 'Mức ưu tiên': PRIORITY[t.priority]?.label || t.priority, 'Loại sự cố': INCIDENT[t.incident_type] || t.incident_type,
          'Số người': t.trapped_count ?? '', 'Nhóm yếu thế': (t.vulnerable || []).map((v) => VULNERABLE[v] || v).join(', '),
          'Địa chỉ': t.address || '', 'Xã/phường': t.admin_name || '', 'Kênh tiếp nhận': SOURCE[t.source] || t.source,
          'Trạng thái': SOS_STATUS[t.status] || t.status, 'Nhận lúc': dateTime(t.received_at),
          'Tiếp nhận sau (phút)': minutes(t.received_at, t.acknowledged_at), 'Đang chờ (phút)': x.sla ? Math.floor(x.sla.waitedSec / 60) : '',
          'Quá hạn SLA': x.overdue ? 'Có' : '', 'Đội': t.force_name || '', 'Điều động lúc': t.dispatched_at ? dateTime(t.dispatched_at) : '',
          'Đến hiện trường lúc': t.arrived_at ? dateTime(t.arrived_at) : '', 'Hoàn thành lúc': t.resolved_at ? dateTime(t.resolved_at) : '',
          'Xử lý xong sau (phút)': minutes(t.received_at, t.resolved_at),
        };
      }), { sheet: 'Phieu SOS', filename: `phieu-sos-${vnFileStamp(new Date(), true)}.xlsx` });
    } catch (e) {
      toast({ tone: 'danger', title: 'Không xuất được tệp Excel', body: e.message });
    }
  };
  // PDF: bảng mọi phiếu đang lọc (dựng tạm dạng danh sách khổ laptop), chụp xong trả lại cách xem cũ
  const doPdf = async () => {
    if (!rows.length || pdf) return;
    setPdf(true);
    try {
      await new Promise((resolve) => { requestAnimationFrame(() => requestAnimationFrame(resolve)); });
      const at = new Date();
      const active = FILTERS.filter((f) => filters[f.key]).map((f) => f.options.find(([v]) => v === filters[f.key])?.[1]);
      await exportSnapshotPdf(contentRef.current, {
        title: 'BÁO CÁO PHIẾU CỨU HỘ (SOS) – TỈNH CAO BẰNG',
        subtitle: [scopeLabel, `${rows.length} phiếu`, ...active, q.trim() && `tìm "${q.trim()}"`, at.toLocaleString('vi-VN')].filter(Boolean).join(' · '),
        filename: `phieu-sos-${vnFileStamp(at, true)}.pdf`,
        layoutWidth: 1280,
      });
    } catch (e) {
      toast({ tone: 'danger', title: 'Không xuất được PDF', body: e.message });
    } finally {
      setPdf(false);
    }
  };

  const cardProps = {
    now, online,
    onDispatch: setDispatch,
    onResolve: (x) => move(x.id, 'hoan_thanh'),
    onFocus,
    onArrived,
    onLink: setLinkFor,
    onCancel: setCancelFor,
    onEdit: setEditFor,
    onMove: (x, status) => move(x.id, status),
  };
  const dataTime = ticketsQ.dataUpdatedAt ? new Date(ticketsQ.dataUpdatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null;
  const listView = view === 'danh_sach' || pdf;

  let body;
  if (ticketsQ.isLoading) body = <Skeleton height={360} />;
  else if (ticketsQ.isError && !ticketsQ.data) {
    // Không tải được: nói rõ, KHÔNG hiện "không có phiếu" (dễ hiểu nhầm là không ai cần cứu)
    body = <ErrorState height={220} onRetry={ticketsQ.refetch}>Không tải được danh sách phiếu SOS — không có nghĩa là không có ai cần cứu</ErrorState>;
  } else if (listView) {
    body = rows.length ? (
      <div className="flex flex-col gap-2">
        <TicketTable rows={paged.visible} asTable={isLg || pdf} pdf={pdf} sort={sort} onSort={setSort} factsOf={factsOf} now={now} cardProps={cardProps} />
        {!pdf && <Pager paged={paged} size={pageSize} onSize={setPageSize} noun="phiếu" />}
      </div>
    ) : (
      <p className="card p-6 text-center text-xs text-muted">
        {activeFilters ? 'Không có phiếu khớp ô tìm / bộ lọc.' : 'Không có phiếu SOS nào trong 48 giờ qua trong vùng đang xem.'}
      </p>
    );
  } else {
    body = (
      <RescueBoard
        tickets={rows}
        factsOf={factsOf}
        wide={wide}
        column={column}
        onColumn={(c) => setParam({ cot: c === COLUMN_KEYS[0] ? '' : c })}
        filtered={activeFilters}
        cardProps={cardProps}
        onDrop={(id, status) => move(id, status)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 pb-8">
      {/* Thông tin khẩn luôn trên cùng (Cam / Đỏ dính khi cuộn) + mất mạng */}
      <UrgentStrip
        label="Thông tin khẩn cứu hộ"
        items={alerts.map((it) => ({
          ...it,
          onClick: it.anchor ? () => scrollTo(document.getElementById(it.anchor)) : () => go(it.filter),
        }))}
        calm={tickets.length || evacQ.data?.sites.length
          ? 'Chưa ghi nhận tình huống khẩn: không phiếu nào quá hạn SLA, không phiếu cấp 1 chưa có đội, không điểm sơ tán đầy'
          : null}
        gray="Chưa có phiếu SOS, điểm sơ tán trong vùng đang xem"
        failed={[ticketsQ.isError && !ticketsQ.data && 'phiếu SOS', evacQ.isError && !evacQ.data && 'số liệu sơ tán'].filter(Boolean)}
        onRetry={() => { ticketsQ.refetch(); evacQ.refetch(); }}
        loading={ticketsQ.isLoading}
      />
      <ConnectionBanner updatedAt={ticketsQ.dataUpdatedAt || null} />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-base font-bold leading-tight sm:text-lg">
            Điều hành cứu hộ<span className="hidden sm:inline"> &amp; điểm nóng khẩn cấp</span>
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted">
            <span className="font-semibold text-accent">{scopeLabel}</span>
            <span aria-hidden="true">·</span>
            <span>{dataTime ? <>Số liệu lúc <b className="font-mono text-ink-2">{dataTime}</b></> : ticketsQ.isError ? 'Chưa tải được số liệu' : 'Đang tải số liệu…'}</span>
            <span className="hidden md:inline">· SLA chờ xử lý / chờ điều động: cấp 1 3′, cấp 2 15′, cấp 3 60′</span>
          </p>
        </div>
        <button type="button" onClick={refresh} disabled={refreshing} className="btn-ghost tap-sq h-9 min-w-[36px] shrink-0 px-2.5 text-xs" aria-label="Làm mới số liệu" title="Làm mới số liệu">
          <RefreshCw size={14} className={clsx(refreshing && 'animate-spin')} aria-hidden="true" /> <span className="hidden md:inline">Làm mới</span>
        </button>
      </div>

      <RescueKpis ticketsQ={ticketsQ} tickets={tickets} factsOf={factsOf} evacQ={evacQ} onGo={go} onEvac={() => scrollTo(document.getElementById('so-tan'))} />

      <FilterToolbar
        fields={FILTERS}
        sorts={SORTS}
        placeholder="Tìm mã SOS, SĐT, địa chỉ, nội dung tin…"
        q={q}
        onSearch={setQ}
        filters={filters}
        counts={ticketsQ.data ? counts : null}
        onFilter={(key, value) => setParam({ [key]: value })}
        onClear={clearAll}
        sort={sort}
        onSort={setSort}
        shown={rows.length}
        total={tickets.length}
        noun="phiếu"
        onExcel={doExcel}
        onPdf={doPdf}
        exporting={pdf}
      />

      <div className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_370px]">
        <div ref={boardRef} className="flex min-w-0 scroll-mt-20 flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 no-print">
            <div className="flex gap-1" role="group" aria-label="Cách xem phiếu">
              {VIEWS.map(([v, label, Icon]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setParam({ xem: v === 'bang' ? '' : v })}
                  className={clsx('tap inline-flex min-h-[32px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold', view === v ? 'bg-accent text-white' : 'bg-panel2/70 text-muted hover:text-ink')}
                >
                  <Icon size={14} aria-hidden="true" /> {label}
                </button>
              ))}
            </div>
            {view === 'bang' && wide && <span className="text-[11px] text-muted">Kéo thả phiếu giữa các cột hoặc dùng “Chuyển trạng thái” trên thẻ</span>}
          </div>
          <div ref={contentRef} className="bg-bg">{body}</div>
        </div>
        {/* Điện thoại: giám sát sơ tán trước, tiếp nhận tin (việc của trực ban ở bàn) sau; màn rộng: cột phải */}
        <aside className="flex min-w-0 flex-col gap-3">
          <Can I="sos" a="create"><div className="order-2 2xl:order-1"><Intake /></div></Can>
          <Evacuation query={evacQ} online={online} className="order-1 2xl:order-2" />
        </aside>
      </div>

      {dispatch && <DispatchModal ticket={dispatch} onClose={() => setDispatch(null)} />}
      {linkFor && <MissionLinkModal ticket={linkFor} onClose={() => setLinkFor(null)} />}
      {cancelFor && <CancelDispatchModal ticket={cancelFor} onClose={() => setCancelFor(null)} />}
      {editFor && <EditTicketModal ticket={editFor} onClose={() => setEditFor(null)} />}
    </div>
  );
}

