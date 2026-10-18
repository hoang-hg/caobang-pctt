import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { BookUser, History, Megaphone, Radio, ScrollText, ShieldCheck, XCircle } from 'lucide-react';
import { api } from '../api/client';
import { useUnits } from '../api/hooks';
import { useStore } from '../app/store';
import { EmptyState, ErrorState, Section, ShowMore, Skeleton, Tabs } from '../components/common/ui';
import QuickActionBar from '../components/common/QuickActionBar';
import UrgentStrip from '../components/common/UrgentStrip';
import PageHeader from '../components/common/PageHeader';
import { PAGE } from '../components/layout/page';
import ConnectionBanner from '../components/dashboard/ConnectionBanner';
import QuickIncidentModal from '../components/dashboard/QuickIncidentModal';
import { unitLabel } from '../components/dashboard/CommuneView';
import AlertKpis from '../components/alerts/AlertKpis';
import AlertMap from '../components/alerts/AlertMap';
import DeliveryChart from '../components/alerts/DeliveryChart';
import { ApproveModal, ManageModal } from '../components/alerts/AlertModals';
import { LiveCard, PendingCard, RejectedCard } from '../components/alerts/BroadcastCards';
import BroadcastHistory from '../components/alerts/BroadcastHistory';
import Composer from '../components/alerts/Composer';
import ContactDirectory from '../components/alerts/ContactDirectory';
import HotlinePanel from '../components/alerts/HotlinePanel';
import AuditLog from '../components/alerts/AuditLog';
import { alertAlerts, broadcastFacts, sortBroadcasts } from '../components/alerts/alertFacts';
import { useAllowedCodes, usePermission } from '../rbac/usePermission';
import { useOnline } from '../utils/useOnline';
import { useShowMore } from '../utils/useShowMore';

function useNow(ms) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const TAB_IDS = ['phat', 'lich_su', 'danh_ba', 'nhat_ky'];
const scrollTo = (id) => requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })));

/**
 * Cảnh báo khẩn cấp & Hotline (thiết kế E). Trên cùng: dải thông tin khẩn (lệnh chờ duyệt — Đỏ khi Rất cao hoặc chờ quá 10
 * phút, cảnh báo Rất cao đang hiệu lực, sắp hết hiệu lực, chưa tới điện thoại người dân…) → 4 ô chỉ số → 4 thẻ trên địa chỉ
 * trang (?tab=): Phát cảnh báo (chờ phê duyệt · soạn lệnh · đang hiệu lực · bị từ chối) · Lịch sử lệnh (tìm, lọc, Excel /
 * PDF) · Danh bạ & Tổng đài · Nhật ký pháp lý (quyền xem nhật ký). Không tải được danh sách lệnh → nói rõ, KHÔNG ghi "không có
 * lệnh chờ duyệt"; mất mạng → dải báo, nút ghi tắt. Nút ký duyệt / gia hạn / kết thúc theo quyền máy chủ trả về từng lệnh.
 */
export default function Alerts() {
  const qc = useQueryClient();
  const online = useOnline();
  const now = useNow(30_000);
  const auth = useStore((s) => s.auth);
  const toast = useStore((s) => s.toast);
  const alertDraft = useStore((s) => s.alertDraft);
  const setAlertDraft = useStore((s) => s.setAlertDraft);
  const me = auth?.user?.id;
  const [params, setParams] = useSearchParams();
  const canAudit = usePermission('audit', 'view', '*');
  const canCreate = usePermission('alert', 'create');
  const canApprove = usePermission('alert', 'approve');
  const canReport = usePermission('sos', 'create');
  const [reportOpen, setReportOpen] = useState(false);
  const tab = TAB_IDS.includes(params.get('tab')) && (params.get('tab') !== 'nhat_ky' || canAudit) ? params.get('tab') : 'phat';
  const [approve, setApprove] = useState(null);
  const [manage, setManage] = useState(null); // { b, mode: 'extend' | 'end' }
  const [refreshing, setRefreshing] = useState(false);
  // Bản đồ + chuyển giao: mặc định thu gọn để danh sách lệnh chờ duyệt & soạn lệnh lên ngay tầm mắt
  const [overviewOpen, setOverviewOpen] = useState(false);

  // Tài khoản xã: tiêu đề là xã của mình (như Tổng quan), không ghi "Toàn tỉnh"
  const scope = useAllowedCodes('alert', 'view');
  const { data: units = [] } = useUnits();
  const scopeUnit = scope?.length === 1 ? units.find((u) => u.code === scope[0]) : null;
  const scopeLabel = scope === null ? 'Toàn tỉnh Cao Bằng' : scopeUnit ? unitLabel(scopeUnit) : `${scope.length} xã/phường được giao`;
  const role = auth?.user?.assignments?.map((a) => a.role_name).join(', ');

  const bq = useQuery({ queryKey: ['broadcasts'], queryFn: () => api('/alerts/broadcasts'), refetchInterval: 15_000 });
  const list = bq.data || [];
  const facts = new Map(list.map((b) => [b.id, broadcastFacts(b, now)]));
  const factsOf = (b) => facts.get(b.id) || broadcastFacts(b, now);
  const pending = sortBroadcasts(list.filter((b) => factsOf(b).pending), 'uu_tien', factsOf);
  const live = list.filter((b) => factsOf(b).live).sort((a, b) => factsOf(a).left - factsOf(b).left);
  const past = list.filter((b) => ['ket_thuc', 'het_han'].includes(factsOf(b).phase)).slice(0, 4);
  const rejected = list.filter((b) => b.status === 'rejected' && now - Date.parse(b.approved_at || b.created_at) < 3 * 86400e3).slice(0, 5);
  const liveMore = useShowMore(live, 6, 'live');
  const alerts = alertAlerts({ broadcasts: list, factsOf, me, now });

  const setTab = (t, replace = false) => setParams((p) => {
    const next = new URLSearchParams(p);
    if (t === 'phat') next.delete('tab'); else next.set('tab', t);
    return next;
  }, { replace });
  // Dải khẩn / ô chỉ số → thẻ "Phát cảnh báo", cuộn tới khối
  const go = ({ anchor }) => {
    if (tab !== 'phat') setTab('phat');
    scrollTo(anchor);
  };
  // Bản nháp từ Bản đồ giám sát (vùng vẽ) / bảng tác chiến / "Soạn lại" → mở thẻ soạn, cuộn tới form
  useEffect(() => {
    if (!alertDraft) return;
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.delete('tab');
      return next;
    }, { replace: true });
    scrollTo('soan-canh-bao');
  }, [alertDraft, setParams]);
  const redraft = (b) => {
    setAlertDraft({
      prefill: { title: b.title, body: b.message_body, severity: b.severity, codes: b.target_admin_codes, channels: b.channels, validHours: b.valid_hours },
    });
    toast({ tone: 'info', title: `Đã điền lại nội dung lệnh ${b.code}`, body: 'Sửa theo lý do từ chối, kiểm tra vùng nhận rồi gửi lại' });
  };
  const refresh = async () => {
    setRefreshing(true);
    try {
      await qc.refetchQueries({ queryKey: ['broadcasts'], type: 'active' });
    } finally {
      setRefreshing(false);
    }
  };

  let lists;
  if (bq.isLoading) lists = <Skeleton className="order-1" height={320} />;
  else if (bq.isError && !bq.data) {
    // Không tải được: nói rõ, KHÔNG hiện "không có lệnh chờ duyệt" (lãnh đạo hiểu nhầm là không có việc)
    lists = <ErrorState className="order-1" height={200} onRetry={bq.refetch}>Không tải được danh sách lệnh cảnh báo — không có nghĩa là không có lệnh chờ duyệt</ErrorState>;
  } else {
    lists = (
      <>
        <Section id="cho-duyet" className="order-1 scroll-mt-20" title={`Chờ phê duyệt · ${pending.length}`} right={<ShieldCheck size={16} className="text-serious" aria-hidden="true" />}>
          {pending.length ? (
            <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {pending.map((b) => <PendingCard key={b.id} b={b} x={factsOf(b)} me={me} online={online} onApprove={setApprove} />)}
            </div>
          ) : <EmptyState height={72}>Không có lệnh chờ phê duyệt</EmptyState>}
        </Section>
        <Section
          id="dang-hieu-luc"
          className="order-3 scroll-mt-20"
          title={`Đang hiệu lực · ${live.length} — giám sát chuyển giao`}
          right={<Radio size={16} className="text-accent" aria-hidden="true" />}
        >
          <div className="flex flex-col gap-2">
            {live.length ? (
              <>
                <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  {liveMore.visible.map((b) => <LiveCard key={b.id} b={b} x={factsOf(b)} online={online} onManage={setManage} />)}
                </div>
                <ShowMore list={liveMore} step={6} noun="cảnh báo" />
              </>
            ) : <EmptyState height={72}>Không có cảnh báo đang hiệu lực</EmptyState>}
            {past.length > 0 && (
              <>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold uppercase text-muted">
                  Đã kết thúc / hết hiệu lực gần đây
                  <button type="button" className="tap rounded px-2 normal-case text-accent hover:bg-accent/10" onClick={() => setTab('lich_su')}>Xem tất cả trong Lịch sử lệnh</button>
                </div>
                <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  {past.map((b) => <LiveCard key={b.id} b={b} x={factsOf(b)} online={online} onManage={setManage} />)}
                </div>
              </>
            )}
          </div>
        </Section>
        {rejected.length > 0 && (
          <Section id="bi-tu-choi" className="order-4 scroll-mt-20" title={`Bị từ chối gần đây · ${rejected.length}`} right={<XCircle size={16} className="text-danger" aria-hidden="true" />}>
            <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {rejected.map((b) => (
                <RejectedCard key={b.id} b={b} mine={b.created_by === me} onRedraft={canCreate && b.created_by === me ? redraft : null} />
              ))}
            </div>
          </Section>
        )}
      </>
    );
  }

  return (
    <div className={PAGE}>
      {/* Thông tin khẩn luôn trên cùng (Cam / Đỏ dính khi cuộn) + mất mạng */}
      <UrgentStrip
        label="Thông tin khẩn cảnh báo"
        items={alerts.map((it) => ({ ...it, onClick: () => go(it.go) }))}
        calm="Chưa có việc gấp: không lệnh chờ phê duyệt, không cảnh báo sắp hết hiệu lực"
        failed={bq.isError && !bq.data ? ['danh sách lệnh cảnh báo'] : []}
        onRetry={bq.refetch}
        loading={bq.isLoading}
      />
      <ConnectionBanner updatedAt={bq.dataUpdatedAt || null} />

      <PageHeader
        title="Cảnh báo khẩn cấp & Hotline"
        short="Cảnh báo & Hotline"
        scope={scopeLabel}
        meta={[
          role && <span key="role">{auth.user.full_name} — {role}</span>,
          <span key="mc" className="hidden md:inline">Maker–Checker: người soạn ≠ người duyệt, ký bằng PIN · mọi thao tác ghi nhật ký pháp lý</span>,
        ]}
        onRefresh={refresh}
        refreshing={refreshing}
      />

      <AlertKpis query={bq} broadcasts={list} factsOf={factsOf} onGo={go} />

      <Tabs
        fit
        label="Phần của trang Cảnh báo"
        value={tab}
        onChange={(t) => setTab(t)}
        tabs={[
          { value: 'phat', label: 'Phát cảnh báo', short: 'Phát tin', icon: Megaphone, count: pending.length || undefined, alert: pending.length ? { level: 2, text: `${pending.length} lệnh chờ phê duyệt` } : undefined },
          { value: 'lich_su', label: 'Lịch sử lệnh', short: 'Lịch sử', icon: History },
          { value: 'danh_ba', label: 'Danh bạ & Tổng đài', short: 'Danh bạ', icon: BookUser },
          ...(canAudit ? [{ value: 'nhat_ky', label: 'Nhật ký pháp lý', short: 'Nhật ký', icon: ScrollText }] : []),
        ]}
      />

      {tab === 'phat' && (
        <>
          {/* Lãnh đạo: vùng đang có cảnh báo (xã tô theo mức nặng nhất) + chuyển giao theo kênh — cùng danh sách lệnh của ô chỉ
              số. Chỉ ở thẻ này: Lịch sử / Danh bạ / Nhật ký là việc tra cứu, không đẩy xuống dưới khối bản đồ (iPad dọc ~600 px) */}
          <Section title="Bản đồ vùng cảnh báo & chuyển giao" collapsible open={overviewOpen} onToggle={() => setOverviewOpen((v) => !v)} className="no-print">
            {overviewOpen && (bq.data ? (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <AlertMap broadcasts={list} factsOf={factsOf} />
                <DeliveryChart broadcasts={list} factsOf={factsOf} />
              </div>
            ) : bq.isError ? <ErrorState height={120} onRetry={bq.refetch}>Không tải được danh sách lệnh cảnh báo</ErrorState> : <Skeleton height={240} />)}
          </Section>
          <div className={clsx('flex flex-col gap-3', canCreate && 'xl:grid xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)] xl:items-start')}>
            {/* Điện thoại: chờ phê duyệt → soạn lệnh → đang hiệu lực → bị từ chối (lãnh đạo duyệt bằng điện thoại không phải cuộn
                qua form soạn); máy tính: form cột trái, danh sách cột phải */}
            {canCreate && <div id="soan-canh-bao" className="order-2 min-w-0 scroll-mt-20 xl:order-1"><Composer online={online} /></div>}
            <div className={clsx('contents', canCreate && 'xl:order-2 xl:flex xl:min-w-0 xl:flex-col xl:gap-3')}>
              {lists}
            </div>
          </div>
        </>
      )}
      {tab === 'lich_su' && <BroadcastHistory now={now} scopeLabel={scopeLabel} />}
      {tab === 'danh_ba' && (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px] [&>*]:min-w-0">
          <ContactDirectory scopeLabel={scopeLabel} />
          <HotlinePanel online={online} />
        </div>
      )}
      {tab === 'nhat_ky' && canAudit && <AuditLog />}

      {approve && <ApproveModal b={approve} onClose={() => setApprove(null)} />}
      {/* Điện thoại: việc hay làm ở vùng ngón cái (khung chung với Tổng quan, Bản đồ, Vật tư, Cứu hộ). Cấp tỉnh: Chờ duyệt (số =
          lệnh chờ) · Soạn lệnh; tài khoản chỉ xem: Đang phát (số = sắp hết hạn) · Lịch sử. Danh bạ cho mọi tài khoản */}
      <QuickActionBar
        slots={[
          canApprove
            ? { key: 'cho-duyet', label: 'Chờ duyệt', icon: ShieldCheck, badge: pending.length, onClick: () => go({ anchor: 'cho-duyet' }) }
            : { key: 'dang-phat', label: 'Đang phát', icon: Radio, badge: live.filter((b) => factsOf(b).soon).length, onClick: () => go({ anchor: 'dang-hieu-luc' }) },
          canCreate
            ? { key: 'soan', label: 'Soạn lệnh', icon: Megaphone, onClick: () => go({ anchor: 'soan-canh-bao' }) }
            : { key: 'lich-su', label: 'Lịch sử', icon: History, onClick: () => setTab('lich_su') },
          { key: 'danh-ba', label: 'Danh bạ', icon: BookUser, onClick: () => setTab('danh_ba'), active: tab === 'danh_ba' },
        ]}
        onSos={canReport ? () => setReportOpen(true) : null}
      />
      {canReport && <QuickIncidentModal open={reportOpen} onClose={() => setReportOpen(false)} />}
      {manage && <ManageModal b={manage.b} mode={manage.mode} onClose={() => setManage(null)} />}
    </div>
  );
}
