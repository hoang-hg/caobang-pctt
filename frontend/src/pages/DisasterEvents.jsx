import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Flag, Plus, RefreshCw } from 'lucide-react';
import { api, useAreaParams } from '../api/client';
import { useUnits } from '../api/hooks';
import { useStore } from '../app/store';
import { EmptyState, ErrorState, Skeleton } from '../components/common/ui';
import ConnectionBanner from '../components/dashboard/ConnectionBanner';
import EventFormModal, { EndEventModal } from '../components/events/EventFormModal';
import EventReport from '../components/events/EventReport';
import { areaText, HAZARD, period } from '../components/events/eventFacts';
import { int } from '../utils/format';
import { useMediaQuery } from '../utils/useMediaQuery';
import { useOnline } from '../utils/useOnline';
import { usePermission } from '../rbac/usePermission';

const unitLabel = (u) => `${u.unit_type === 'phuong' ? 'Phường' : 'Xã'} ${u.name}`;

/** Một đợt trong danh sách: mã, trạng thái, tên, loại, thời gian, vùng, số phiếu / người được cứu / cảnh báo. */
function EventItem({ e, names, selected, onOpen }) {
  const H = HAZARD[e.hazard] || HAZARD.khac;
  const open = !e.ended_at;
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`${e.code} ${e.name} — ${open ? 'đang diễn ra' : 'đã kết thúc'}`}
        onClick={() => onOpen(e.code)}
        className={clsx(
          'card tap flex w-full min-w-0 flex-col gap-1 border-l-4 p-3 text-left hover:border-accent',
          open ? 'border-l-accent' : 'border-l-line',
          selected && 'ring-2 ring-accent',
        )}
      >
        <span className="flex w-full items-center gap-1.5">
          <span className="chip bg-panel2 font-mono text-[11px] text-ink-2">{e.code}</span>
          <span className={clsx('chip text-[11px] font-semibold', open ? 'bg-accent text-white' : 'bg-panel2 text-muted')}>{open ? 'Đang diễn ra' : 'Đã kết thúc'}</span>
          <ChevronRight size={15} className="ml-auto shrink-0 text-muted" aria-hidden="true" />
        </span>
        <span className="text-sm font-semibold leading-snug text-ink">{e.name}</span>
        <span className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-ink-2">
          <H.icon size={12} aria-hidden="true" /> {H.label} · {areaText(e.admin_codes, names)}
        </span>
        <span className="text-[11px] text-muted">{period(e)}</span>
        <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-2">
          <span><b className="font-mono text-ink">{int(e.sos)}</b> phiếu SOS</span>
          <span><b className="font-mono text-ink">{int(e.rescued)}</b> người được cứu</span>
          <span><b className="font-mono text-ink">{int(e.alerts)}</b> cảnh báo</span>
        </span>
      </button>
    </li>
  );
}

/**
 * Đợt thiên tai & báo cáo (thiết kế E.4 "rút kinh nghiệm sau thiên tai", DB5 — docs/csdl-viec-con-lai.md). Mở đợt khi bắt đầu
 * mưa lũ / sạt lở diện rộng → phiếu SOS, lệnh điều động, cảnh báo, vùng nguy hiểm, sổ kho ở vùng ảnh hưởng tự gắn vào đợt;
 * cuối đợt có ngay báo cáo (Excel / PDF). Máy tính: danh sách đợt bên trái, báo cáo bên phải; dưới 1024 px (điện thoại, iPad
 * dọc — 2 cột): danh sách → chạm mở báo cáo (?dot=…, nút "Tất cả đợt" / Quay lại). Mở / sửa / kết thúc đợt: quyền event.manage
 * (cấp tỉnh); xem: mọi tài khoản, số liệu theo phạm vi được giao.
 */
export default function DisasterEvents() {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const isLg = useMediaQuery('(min-width: 1024px)');
  const online = useOnline();
  const canManage = usePermission('event', 'manage');
  const area = useAreaParams();
  const { data: units = [] } = useUnits();
  const names = useMemo(() => new Map(units.map((u) => [u.code, unitLabel(u)])), [units]);
  const [params, setParams] = useSearchParams();
  const selected = params.get('dot');
  const [form, setForm] = useState(null); // { event } — null event = mở đợt mới
  const [ending, setEnding] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const q = useQuery({
    queryKey: ['events', area.admin_codes || 'CB'],
    queryFn: () => api('/events', { params: area }),
    refetchInterval: 60_000,
  });
  const events = q.data || [];
  const live = events.filter((e) => !e.ended_at);
  // Máy tính: chưa chọn → báo cáo của đợt đầu danh sách (đang diễn ra lên đầu)
  const current = selected || (isLg ? events[0]?.code : null);
  const openEvent = (code) => setParams(code ? { dot: code } : {}, { replace: isLg });
  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([qc.invalidateQueries({ queryKey: ['events'] }), qc.invalidateQueries({ queryKey: ['event-summary'] })]);
    setRefreshing(false);
  };
  const newEvent = () => {
    if (!online) {
      toast({ tone: 'danger', title: 'Mất mạng — chưa mở được đợt' });
      return;
    }
    setForm({ event: null });
  };

  let list;
  if (q.isLoading) list = <Skeleton height={320} />;
  else if (q.isError && !q.data) list = <ErrorState height={200} onRetry={q.refetch}>Không tải được danh sách đợt thiên tai</ErrorState>;
  else if (!events.length) {
    list = (
      <EmptyState height={200}>
        <p className="font-semibold text-ink-2">Chưa có đợt thiên tai nào</p>
        <p className="mt-1">
          Khi bắt đầu mưa lũ, sạt lở diện rộng, mở đợt để hệ thống tự gom phiếu SOS, lệnh điều động, cảnh báo, vật tư theo đợt — cuối đợt có
          ngay báo cáo.{!canManage && ' Cấp tỉnh mở đợt.'}
        </p>
        {canManage && (
          <button type="button" className="btn-primary tap mx-auto mt-3" onClick={newEvent}><Plus size={15} aria-hidden="true" /> Mở đợt thiên tai</button>
        )}
      </EmptyState>
    );
  } else {
    list = (
      <ul className="grid gap-2 md:grid-cols-2 lg:grid-cols-1" aria-label="Các đợt thiên tai">
        {events.map((e) => <EventItem key={e.code} e={e} names={names} selected={e.code === current} onOpen={openEvent} />)}
      </ul>
    );
  }

  const showReport = !!current && (isLg || !!selected);
  return (
    <div className="flex flex-col gap-3 p-3 pb-8">
      <ConnectionBanner updatedAt={q.dataUpdatedAt || null} />
      {/* Đợt đang diễn ra luôn trên cùng — chạm mở báo cáo */}
      {live.length > 0 && !(showReport && !isLg) && (
        <div role="status" aria-label="Đợt thiên tai đang diễn ra" className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-sm">
          <Flag size={15} className="shrink-0 text-accent" aria-hidden="true" />
          <span className="font-semibold text-ink">Đang diễn ra:</span>
          {live.map((e) => (
            <button key={e.code} type="button" className="tap rounded-md px-1.5 text-left font-medium text-accent hover:underline" onClick={() => openEvent(e.code)}>
              {e.code} · {e.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {showReport && !isLg ? (
            <button type="button" className="btn-ghost tap mb-1 px-2 text-xs" onClick={() => openEvent(null)}>
              <ChevronLeft size={14} aria-hidden="true" /> Tất cả đợt
            </button>
          ) : null}
          <h1 className="text-base font-bold leading-tight sm:text-lg">Đợt thiên tai & báo cáo</h1>
          <p className="mt-0.5 text-[11px] text-muted">
            Gom phiếu SOS, lệnh điều động, cảnh báo, vật tư theo đợt để báo cáo, rút kinh nghiệm{area.admin_codes ? ' · số liệu theo vùng đang lọc' : ''}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {canManage && (
            <button type="button" className="btn-primary tap px-3 text-xs sm:text-sm" onClick={newEvent} disabled={!online} title={online ? undefined : 'Mất mạng — chưa mở được đợt'}>
              <Plus size={15} aria-hidden="true" /> <span className="max-sm:hidden">Mở đợt thiên tai</span><span className="sm:hidden">Mở đợt</span>
            </button>
          )}
          <button type="button" onClick={refresh} disabled={refreshing} className="btn-ghost tap-sq h-9 min-w-[36px] px-2.5 text-xs" aria-label="Làm mới số liệu" title="Làm mới số liệu">
            <RefreshCw size={14} className={clsx(refreshing && 'animate-spin')} aria-hidden="true" />
          </button>
        </div>
      </div>

      {isLg ? (
        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          <div className="min-w-0">{list}</div>
          <div className="min-w-0">
            {current ? (
              <EventReport key={current} code={current} canManage={canManage} onEdit={(e) => setForm({ event: e })} onEnd={setEnding} />
            ) : !q.isLoading && events.length ? <EmptyState height={200}>Chọn một đợt để xem báo cáo</EmptyState> : null}
          </div>
        </div>
      ) : showReport ? (
        <EventReport key={current} code={current} canManage={canManage} onEdit={(e) => setForm({ event: e })} onEnd={setEnding} />
      ) : list}

      {form && <EventFormModal event={form.event} onClose={() => setForm(null)} onSaved={(e) => openEvent(e.code)} />}
      {ending && <EndEventModal event={ending} onClose={() => setEnding(null)} />}
    </div>
  );
}
