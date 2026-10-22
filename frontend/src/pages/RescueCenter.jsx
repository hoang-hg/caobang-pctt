import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Columns3, Home, Inbox, List, Navigation } from 'lucide-react';
import { api } from '../api/client';
import { useAreaQuery, useUnits } from '../api/hooks';
import { useStore } from '../app/store';
import { ErrorState, Pager, Section, Segmented, Skeleton } from '../components/common/ui';
import FilterToolbar from '../components/common/FilterToolbar';
import UrgentStrip from '../components/common/UrgentStrip';
import PageHeader from '../components/common/PageHeader';
import RoleTips from '../components/common/RoleTips';
import { PAGE } from '../components/layout/page';
import DispatchModal from '../components/common/DispatchModal';
import { MissionLinkModal } from '../components/common/MissionLink';
import CancelDispatchModal from '../components/common/CancelDispatchModal';
import CloseTicketModal from '../components/common/CloseTicketModal';
import EditTicketModal from '../components/common/EditTicketModal';
import QuickActionBar from '../components/common/QuickActionBar';
import ConnectionBanner from '../components/dashboard/ConnectionBanner';
import QuickIncidentModal from '../components/dashboard/QuickIncidentModal';
import { unitLabel } from '../components/dashboard/CommuneView';
import Evacuation, { EvacuationModal } from '../components/rescue/Evacuation';
import Intake from '../components/rescue/Intake';
import RescueBoard from '../components/rescue/RescueBoard';
import RescueKpis from '../components/rescue/RescueKpis';
import RescueMap from '../components/rescue/RescueMap';
import SosTrend from '../components/rescue/SosTrend';
import TicketTable from '../components/rescue/TicketTable';
import {
  COLUMN_KEYS, FILTERS, SORTS, matchTicket, optionCounts, rescueAlerts, sortTickets, ticketFacts,
} from '../components/rescue/rescueFacts';
import { Can, useAllowedCodes, usePermission } from '../rbac/usePermission';
import { INCIDENT, PRIORITY, VULNERABLE, sosStatusLabel, sourceLabel } from '../utils/labels';
import { dateTime, foldVi, vnFileStamp } from '../utils/format';
import { exportExcel } from '../utils/exportExcel';
import { exportSnapshotPdf } from '../utils/exportPdf';
import { useMediaQuery } from '../utils/useMediaQuery';
import { useOnline } from '../utils/useOnline';
import { usePaged } from '../utils/usePaged';
import { useNewKeys } from '../utils/useNewKeys';

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const VIEWS = [['bang', 'Bảng điều phối', Columns3], ['danh_sach', 'Danh sách', List]];
// Kỳ tra cứu của Danh sách (?ky=): phiếu đang mở + phiếu xong trong kỳ — báo cáo tuần / tháng. Bảng điều phối luôn 48 giờ
const PERIODS = [['', '48 giờ', 48], ['7n', '7 ngày', 24 * 7], ['30n', '30 ngày', 24 * 30]];
const minutes = (from, to) => (from && to ? Math.round((new Date(to) - new Date(from)) / 60000) : '');

/**
 * Trung tâm Điều hành Cứu hộ & Điểm nóng (thiết kế D). Trên cùng: dải thông tin khẩn (quá hạn phản hồi, cấp 1 chưa có đội,
 * đội cần chi viện, điểm sơ tán đầy…) → 4 ô chỉ số → gợi ý theo vai trò → tìm / lọc → "Bảng điều phối" 4 cột tên đời thường
 * (Mới báo — chưa ai nhận → Đang tìm đội → Đội đang đến → Đã cứu xong; từ 1280 px; nhỏ hơn: thẻ chọn cột; phiếu vừa đến trượt
 * vào) hoặc
 * "Danh sách" (bảng / thẻ, phân trang, xuất Excel / PDF mọi phiếu đang lọc) → tiếp nhận đa kênh, giám sát sơ tán.
 * Bộ lọc, cách xem, cột đang xem nằm trên địa chỉ trang (?th=qua_han&xem=danh_sach): dải khẩn / ô chỉ số dẫn thẳng tới
 * phiếu cần xử lý; Quay lại trả bộ lọc cũ. Dải khẩn, ô chỉ số, số đếm của bộ lọc và bảng dùng CÙNG danh sách phiếu, cùng
 * hạn phản hồi. Nút ghi chỉ hiện với quyền ở đúng xã của phiếu (backend kiểm tra lại); mất mạng → tắt, nói lý do.
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
  const period = PERIODS.find(([k]) => k && k === params.get('ky')) || PERIODS[0];
  const archive = view === 'danh_sach' && period[0] !== '';
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(SORTS[0][0]);
  const [pageSize, setPageSize] = useState(() => (window.innerWidth >= 1024 ? 20 : 10));
  const [pdf, setPdf] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dispatch, setDispatch] = useState(null);
  const [linkFor, setLinkFor] = useState(null);
  const [cancelFor, setCancelFor] = useState(null);
  const [closeFor, setCloseFor] = useState(null);
  const [editFor, setEditFor] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [evacOpen, setEvacOpen] = useState(false);
  // Bản đồ + diễn biến: mặc định thu gọn để bảng điều phối SOS lên ngay tầm mắt người trực ban
  const [overviewOpen, setOverviewOpen] = useState(false);
  const contentRef = useRef(null);
  const boardRef = useRef(null);

  // Tài khoản xã chưa lọc: tiêu đề là xã của mình, không ghi "Toàn tỉnh" (như Tổng quan)
  const scope = useAllowedCodes('sos', 'view');
  const { data: units = [] } = useUnits();
  const scopeUnit = scope?.length === 1 ? units.find((u) => u.code === scope[0]) : null;
  const scopeLabel = filter.codes.length || scope === null ? filter.label : scopeUnit ? unitLabel(scopeUnit) : `${scope.length} xã/phường được giao`;
  const canReport = usePermission('sos', 'create');
  const canEvac = usePermission('evacuation', 'update');
  const evacCodes = useAllowedCodes('evacuation', 'update');

  const ticketsQ = useAreaQuery('sos', '/sos', {}, { refetchInterval: 20_000 });
  const evacQ = useAreaQuery('evacuation', '/evacuation', {}, { refetchInterval: 30_000 });
  const tickets = ticketsQ.data || [];
  // Danh sách kỳ 7 / 30 ngày: tải riêng; dải khẩn, ô chỉ số, bản đồ, diễn biến vẫn theo 48 giờ
  const archiveQ = useAreaQuery('sos', '/sos', { hours: period[2] }, { enabled: archive, refetchInterval: 60_000 });
  const listQ = archive ? archiveQ : ticketsQ;
  const listTickets = listQ.data || [];

  const factsById = new Map((archive && archiveQ.data ? listTickets : tickets).map((t) => [t.id, ticketFacts(t, now)]));
  const factsOf = (t) => factsById.get(t.id) || ticketFacts(t, now);
  const nq = foldVi(q.trim());
  const searched = nq
    ? listTickets.filter((t) => [t.code, t.address, t.admin_name, t.raw_message, t.reporter_phone, t.force_name, INCIDENT[t.incident_type]]
      .some((f) => f && foldVi(f).includes(nq)))
    : listTickets;
  const rows = sortTickets(searched.filter((t) => matchTicket(t, filters, factsOf(t))), sort, factsOf);
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, optionCounts(searched, filters, f.key, factsOf)]));
  const activeFilters = FILTERS.some((f) => filters[f.key]) || !!nq;
  const paged = usePaged(rows, pageSize, `${nq}|${JSON.stringify(filters)}|${sort}|${pageSize}|${period[0]}`, pdf);
  const alerts = rescueAlerts({ tickets, sites: evacQ.data?.sites, factsOf });
  // Phiếu vừa đến khi đang xem → trượt vào một lần (âm báo phiếu mới: api/useSocket)
  const isNew = useNewKeys(tickets.map((t) => t.id), !!ticketsQ.data);

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
    if (period[0]) next.set('ky', period[0]);
    Object.entries(f).forEach(([k, v]) => v && next.set(k, v));
    const col = COLUMN_KEYS.find((k) => matches.some((t) => t.status === k));
    if (col && col !== COLUMN_KEYS[0]) next.set('cot', col);
    setParams(next);
    setQ('');
    if (sortKey) setSort(sortKey);
    scrollTo(boardRef.current);
  };
  // Thanh thao tác nhanh → một cột của bảng điều phối, bỏ lọc (một mục lịch sử)
  const openColumn = (col) => {
    const next = new URLSearchParams();
    if (col !== COLUMN_KEYS[0]) next.set('cot', col);
    setParams(next);
    setQ('');
    scrollTo(boardRef.current);
  };
  // Bản đồ → phiếu trên bảng: tìm theo mã, mở đúng cột (một mục lịch sử)
  const openTicket = (t) => {
    const next = new URLSearchParams();
    if (view !== 'bang') next.set('xem', view);
    if (period[0]) next.set('ky', period[0]);
    if (t.status !== COLUMN_KEYS[0]) next.set('cot', t.status);
    setParams(next);
    setQ(t.code);
    scrollTo(boardRef.current);
  };
  // Tìm kiếm toàn năng → /cuu-ho?phieu=SOS-1001: mở đúng phiếu (đúng cột của bảng, ô tìm điền sẵn mã). Không có trong danh
  // sách 48 giờ (phiếu đã xong lâu hơn) → tra cứu hồ sơ 30 ngày. Thay địa chỉ (replace): nút Quay lại không mở lại phiếu
  const wanted = params.get('phieu');
  useEffect(() => {
    if (!wanted || !ticketsQ.data) return;
    const t = ticketsQ.data.find((x) => x.code === wanted);
    const next = new URLSearchParams();
    if (!t) {
      next.set('xem', 'danh_sach');
      next.set('ky', '30n');
    } else if (t.status !== COLUMN_KEYS[0]) next.set('cot', t.status);
    setParams(next, { replace: true });
    setQ(wanted);
    scrollTo(boardRef.current);
  }, [wanted, ticketsQ.data]); // eslint-disable-line react-hooks/exhaustive-deps -- chỉ chạy khi có mã cần mở / danh sách vừa tải
  const clearAll = () => {
    setParams(() => {
      const next = new URLSearchParams();
      if (view !== 'bang') next.set('xem', view);
      if (period[0]) next.set('ky', period[0]);
      if (column !== COLUMN_KEYS[0]) next.set('cot', column);
      return next;
    }, { replace: true });
    setQ('');
  };

  const move = async (id, status) => {
    const t = tickets.find((x) => x.id === id) || listTickets.find((x) => x.id === id);
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
          'Địa chỉ': t.address || '', 'Xã/phường': t.admin_name || '', 'Kênh tiếp nhận': sourceLabel(t),
          'Trạng thái': sosStatusLabel(t), 'Nhận lúc': dateTime(t.received_at),
          'Tiếp nhận sau (phút)': minutes(t.received_at, t.acknowledged_at), 'Đang chờ (phút)': x.sla ? Math.floor(x.sla.waitedSec / 60) : '',
          'Quá hạn phản hồi': x.overdue ? 'Có' : '', 'Đội': t.force_name || '', 'Điều động lúc': t.dispatched_at ? dateTime(t.dispatched_at) : '',
          'Đến hiện trường lúc': t.arrived_at ? dateTime(t.arrived_at) : '', 'Cứu xong lúc': t.resolved_at ? dateTime(t.resolved_at) : '',
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
        title: 'BÁO CÁO PHIẾU CỨU HỘ – TỈNH CAO BẰNG',
        subtitle: [scopeLabel, `${rows.length} phiếu`, archive && `đang mở + đã xong trong ${period[1]}`, ...active, q.trim() && `tìm "${q.trim()}"`, at.toLocaleString('vi-VN')].filter(Boolean).join(' · '),
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
    now, online, isNew,
    onDispatch: setDispatch,
    onResolve: (x) => move(x.id, 'hoan_thanh'),
    onFocus,
    onArrived,
    onLink: setLinkFor,
    onCancel: setCancelFor,
    onEdit: setEditFor,
    onMove: (x, status) => move(x.id, status),
    onCloseTicket: setCloseFor,
  };
  const dataTime = ticketsQ.dataUpdatedAt ? new Date(ticketsQ.dataUpdatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null;
  const listView = view === 'danh_sach' || pdf;
  // Tài khoản một xã: "Sơ tán" mở thẳng số liệu của xã mình (bỏ bước chọn xã)
  const evacUnit = evacCodes?.length === 1 ? units.find((u) => u.code === evacCodes[0]) : null;
  const evacRow = evacUnit ? evacQ.data?.progress.find((r) => r.code === evacUnit.code) || { code: evacUnit.code, name: evacUnit.name } : null;
  const waiting = tickets.filter((t) => t.status === 'moi').length;
  const fieldAsks = tickets.filter((t) => factsOf(t).needSupport || factsOf(t).rescuedPending).length;
  const offlineSlot = !online ? { disabled: true, title: 'Mất mạng — chưa ghi được' } : {};

  let body;
  if (listQ.isLoading) body = <Skeleton height={360} />;
  else if (listQ.isError && !listQ.data) {
    // Không tải được: nói rõ, KHÔNG hiện "không có phiếu" (dễ hiểu nhầm là không ai cần cứu)
    body = <ErrorState height={220} onRetry={listQ.refetch}>Không tải được danh sách phiếu SOS — không có nghĩa là không có ai cần cứu</ErrorState>;
  } else if (listView) {
    body = rows.length ? (
      <div className="flex flex-col gap-2">
        <TicketTable rows={paged.visible} asTable={isLg || pdf} pdf={pdf} sort={sort} onSort={setSort} factsOf={factsOf} now={now} cardProps={cardProps} />
        {!pdf && <Pager paged={paged} size={pageSize} onSize={setPageSize} noun="phiếu" />}
      </div>
    ) : (
      <p className="card p-6 text-center text-xs text-muted">
        {activeFilters ? 'Không có phiếu khớp ô tìm / bộ lọc.' : `Không có phiếu SOS nào trong ${period[1]} qua trong vùng đang xem.`}
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
    <div className={PAGE}>
      {/* Thông tin khẩn luôn trên cùng (Cam / Đỏ dính khi cuộn) + mất mạng */}
      <UrgentStrip
        label="Thông tin khẩn cứu hộ"
        items={alerts.map((it) => ({
          ...it,
          onClick: it.anchor ? () => scrollTo(document.getElementById(it.anchor)) : () => go(it.filter),
        }))}
        calm={tickets.length || evacQ.data?.sites.length
          ? 'Chưa ghi nhận tình huống khẩn: không phiếu nào quá hạn phản hồi, không phiếu cấp 1 chưa có đội, không điểm sơ tán đầy'
          : null}
        gray="Chưa có phiếu SOS, điểm sơ tán trong vùng đang xem"
        failed={[ticketsQ.isError && !ticketsQ.data && 'phiếu SOS', evacQ.isError && !evacQ.data && 'số liệu sơ tán'].filter(Boolean)}
        onRetry={() => { ticketsQ.refetch(); evacQ.refetch(); }}
        loading={ticketsQ.isLoading}
      />
      <ConnectionBanner updatedAt={ticketsQ.dataUpdatedAt || null} />

      <PageHeader
        title="Điều hành cứu hộ"
        scope={scopeLabel}
        time={dataTime}
        timeNote={ticketsQ.isError ? 'Chưa tải được số liệu' : 'Đang tải số liệu…'}
        meta={[<span key="sla" className="hidden md:inline">Hạn phản hồi: cấp 1 Đỏ 3 phút · cấp 2 Cam 15 phút · cấp 3 Vàng 60 phút</span>]}
        onRefresh={refresh}
        refreshing={refreshing}
      />

      <RescueKpis ticketsQ={ticketsQ} tickets={tickets} factsOf={factsOf} evacQ={evacQ} onGo={go} onEvac={() => scrollTo(document.getElementById('so-tan'))} />

      <RoleTips page="cuu-ho" />

      {/* Lãnh đạo nắm tình hình: bản đồ cứu hộ (phiếu đang mở, lộ trình + giờ dự kiến tới của đội, vùng nguy cơ, điểm sơ tán) và diễn biến
          48 giờ (phiếu theo mức, thời gian xử lý) — cùng danh sách phiếu với bảng điều phối; thu gọn được */}
      <Section
        title="Bản đồ cứu hộ & diễn biến 48 giờ"
        collapsible
        open={overviewOpen}
        onToggle={() => setOverviewOpen((v) => !v)}
        className="no-print"
      >
        {overviewOpen && (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <RescueMap tickets={tickets} factsOf={factsOf} now={now} onOpen={openTicket} />
            <SosTrend query={ticketsQ} tickets={tickets} now={now} />
          </div>
        )}
      </Section>

      <FilterToolbar
        fields={FILTERS}
        sorts={SORTS}
        placeholder="Tìm mã phiếu, số điện thoại, địa chỉ, nội dung tin…"
        q={q}
        onSearch={setQ}
        filters={filters}
        counts={listQ.data ? counts : null}
        onFilter={(key, value) => setParam({ [key]: value })}
        onClear={clearAll}
        sort={sort}
        onSort={setSort}
        shown={rows.length}
        total={listTickets.length}
        noun="phiếu"
        onExcel={doExcel}
        onPdf={doPdf}
        exporting={pdf}
      />

      <div className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_370px]">
        <div ref={boardRef} className="flex min-w-0 scroll-mt-20 flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 no-print">
            <Segmented
              label="Cách xem phiếu"
              value={view}
              onChange={(v) => setParam({ xem: v === 'bang' ? '' : v })}
              options={VIEWS.map(([v, label, icon]) => ({ value: v, label, icon }))}
            />
            {view === 'bang' && wide && <span className="text-xs text-muted">Kéo thẻ phiếu sang cột khác, hoặc chọn “Chuyển sang…” trên thẻ</span>}
            {view === 'danh_sach' && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted">Phiếu đã xong trong</span>
                <Segmented
                  label="Kỳ tra cứu: phiếu đang mở và phiếu đã xong trong"
                  value={period[0]}
                  onChange={(k) => setParam({ ky: k })}
                  options={PERIODS.map(([k, label]) => ({ value: k, label }))}
                />
              </div>
            )}
          </div>
          <div ref={contentRef} className="bg-bg">{body}</div>
        </div>
        {/* Điện thoại: giám sát sơ tán trước, tiếp nhận tin (việc của trực ban ở bàn) sau; màn rộng: cột phải */}
        <aside className="flex min-w-0 flex-col gap-3">
          <Can I="sos" a="create"><div className="order-2 2xl:order-1"><Intake online={online} /></div></Can>
          <Evacuation query={evacQ} online={online} className="order-1 2xl:order-2" />
        </aside>
      </div>

      {dispatch && <DispatchModal ticket={dispatch} onClose={() => setDispatch(null)} />}
      {linkFor && <MissionLinkModal ticket={linkFor} onClose={() => setLinkFor(null)} />}
      {cancelFor && <CancelDispatchModal ticket={cancelFor} onClose={() => setCancelFor(null)} />}
      {closeFor && <CloseTicketModal ticket={closeFor} onClose={() => setCloseFor(null)} />}
      {editFor && <EditTicketModal ticket={editFor} onClose={() => setEditFor(null)} />}
      {evacOpen && <EvacuationModal row={evacRow} progress={evacQ.data?.progress} onClose={() => setEvacOpen(false)} />}
      {/* Điện thoại: việc hay làm ở vùng ngón cái — phiếu mới báo (số = phiếu chưa ai nhận), báo sơ tán, đội đang đến (số =
          đội xin chi viện / báo đã cứu chờ xác nhận); khung chung với Tổng quan, Bản đồ, Vật tư */}
      <QuickActionBar
        slots={[
          { key: 'cho', label: 'Mới báo', icon: Inbox, onClick: () => openColumn('moi'), badge: waiting },
          canEvac
            ? { key: 'so-tan', label: 'Sơ tán', icon: Home, onClick: () => setEvacOpen(true), ...offlineSlot }
            : { key: 'so-tan', label: 'Sơ tán', icon: Home, onClick: () => scrollTo(document.getElementById('so-tan')) },
          { key: 'thuc-thi', label: 'Đang đến', icon: Navigation, onClick: () => openColumn('thuc_thi'), badge: fieldAsks },
        ]}
        onSos={canReport ? () => setReportOpen(true) : null}
      />
      {canReport && <QuickIncidentModal open={reportOpen} onClose={() => setReportOpen(false)} />}
    </div>
  );
}

