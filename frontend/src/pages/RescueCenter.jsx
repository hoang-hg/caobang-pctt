import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Bot, CheckCircle2, Clock, MapPin, Phone, Send, Sparkles, Timer, Inbox, Loader2, Navigation, Home,
  Search
} from 'lucide-react';
import { api } from '../api/client';
import { useAreaQuery } from '../api/hooks';
import { useStore } from '../app/store';
import { Empty, Progress, Section } from '../components/common/ui';
import DispatchModal from '../components/common/DispatchModal';
import { Can, usePermission } from '../rbac/usePermission';
import { INCIDENT, PRIORITY, SOURCE, VULNERABLE } from '../utils/labels';
import { int, pct, time } from '../utils/format';

const COLUMNS = [
  { key: 'moi', title: 'Chờ xử lý', hint: 'Tín hiệu mới – cần tiếp nhận ngay', tone: 'border-t-danger', bgHint: 'bg-danger/5' },
  { key: 'dieu_phoi', title: 'Đang điều phối', hint: 'Đã xác minh, đang giao lực lượng', tone: 'border-t-serious', bgHint: 'bg-serious/5' },
  { key: 'thuc_thi', title: 'Đang thực thi', hint: 'Lực lượng đang tiếp cận hiện trường', tone: 'border-t-warn', bgHint: 'bg-warn/5' },
  { key: 'hoan_thanh', title: 'Đã cứu an toàn', hint: 'Đã đưa người tới nơi an toàn', tone: 'border-t-good', bgHint: 'bg-good/5' },
];

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const mmss = (sec) => {
  const s = Math.max(0, Math.floor(Math.abs(sec)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
};

function TicketCard({ t, now, onDispatch, onResolve, onFocus }) {
  const canUpdate = usePermission('sos', 'update', t.admin_code);
  const pr = PRIORITY[t.priority];
  const waitingSec = (now - new Date(t.received_at).getTime()) / 1000;
  const slaSec = t.sla_minutes * 60;
  const breached = t.status === 'moi' && waitingSec > slaSec;
  const etaSec = t.eta ? (new Date(t.eta).getTime() - now) / 1000 : null;

  return (
    <div
      draggable={canUpdate && t.status !== 'hoan_thanh'}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)}
      className={clsx(
        'card p-3 shadow-sm hover:shadow-md transition-all border-l-4 cursor-grab active:cursor-grabbing select-none',
        !canUpdate && 'cursor-default',
        { 1: 'border-l-danger bg-danger/[0.03]', 2: 'border-l-serious bg-serious/[0.03]', 3: 'border-l-warn bg-warn/[0.03]' }[t.priority],
        breached && 'ring-2 ring-danger animate-pulse'
      )}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <b className="text-sm font-bold text-ink">{t.code}</b>
        <span className={clsx('chip text-[10px] font-bold py-0.5', pr.cls)}>{pr.short}</span>
        <span className="ml-auto text-[11px] text-muted font-medium">{SOURCE[t.source]}</span>
      </div>

      <div className="text-sm font-semibold text-ink flex items-center gap-1.5">
        <span>{INCIDENT[t.incident_type]}</span>
        <span className="text-muted font-normal">·</span>
        <span className="text-danger font-bold">{t.trapped_count} người</span>
      </div>

      <div className="text-xs text-muted flex items-start gap-1 mt-1">
        <MapPin size={12} className="shrink-0 mt-0.5 text-accent" />
        <span className="truncate">{t.address || t.admin_name}{t.admin_name && t.address !== t.admin_name ? ` (${t.admin_name})` : ''}</span>
      </div>

      {!!t.vulnerable?.length && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {t.vulnerable.map((v) => (
            <span key={v} className="chip bg-danger/15 text-danger text-[10px] font-medium">
              {VULNERABLE[v]}
            </span>
          ))}
        </div>
      )}

      {t.raw_message && (
        <p className="mt-1.5 line-clamp-2 text-xs italic text-ink-2 bg-panel2/60 p-1.5 rounded-lg border border-line/40">
          “{t.raw_message}”
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs pt-2 border-t border-line/50">
        {t.status === 'moi' && (
          <span
            className={clsx('inline-flex items-center gap-1 font-mono text-[11px]', breached ? 'font-bold text-danger' : 'text-ink-2')}
            title={`SLA tiếp nhận cấp ${t.priority}: ${t.sla_minutes} phút`}
          >
            <Timer size={13} className={breached ? 'animate-bounce text-danger' : 'text-muted'} />
            <span>Chờ: {mmss(waitingSec)} / SLA {t.sla_minutes}′{breached && ' · QUÁ HẠN'}</span>
          </span>
        )}

        {t.status === 'thuc_thi' && t.force_name && (
          <div className="w-full space-y-1">
            <div className="flex items-center gap-1 text-ink-2 font-medium text-xs">
              <Navigation size={12} className="text-accent" />
              <span className="truncate">{t.force_name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Progress value={(t.progress || 0) * 100} tone="warn" className="flex-1" />
              <span className="font-mono text-[11px] text-ink font-semibold">
                {t.dispatch_status === 'da_den' ? 'Đã đến nơi' : etaSec > 0 ? `ETA ${mmss(etaSec)}` : 'Sắp đến'}
              </span>
            </div>
            {!t.route_safe && <div className="text-[11px] font-medium text-danger">⚠ Lộ trình buộc qua vùng nguy hiểm</div>}
          </div>
        )}

        {t.status === 'hoan_thanh' && (
          <span className="inline-flex items-center gap-1 text-good text-xs font-semibold">
            <CheckCircle2 size={13} /> Đã xử lý lúc {time(t.resolved_at)}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 pt-1">
        <button
          className="btn-ghost px-2 py-1 text-xs"
          onClick={() => onFocus(t)}
          title="Xem vị trí cứu hộ trên bản đồ"
        >
          <MapPin size={12} /> Bản đồ
        </button>

        {t.reporter_phone && (
          <a
            className="btn-ghost px-2 py-1 text-xs text-accent"
            href={`tel:${t.reporter_phone.replace(/\s/g, '')}`}
            title="Gọi cho người báo tin"
          >
            <Phone size={12} /> Gọi
          </a>
        )}

        {(t.status === 'moi' || t.status === 'dieu_phoi') && (
          <Can I="dispatch" a="create" scope={t.admin_code}>
            <button
              className="btn-danger ml-auto px-2.5 py-1 text-xs shadow-sm font-semibold"
              onClick={() => onDispatch(t)}
            >
              <Send size={12} /> Điều phối
            </button>
          </Can>
        )}

        {t.status === 'thuc_thi' && (
          <Can I="sos" a="resolve" scope={t.admin_code}>
            <button
              className="btn-good ml-auto px-2.5 py-1 text-xs shadow-sm font-semibold"
              onClick={() => onResolve(t)}
            >
              <CheckCircle2 size={12} /> Đã an toàn
            </button>
          </Can>
        )}
      </div>
    </div>
  );
}

function Intake() {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const [text, setText] = useState('');
  const [source, setSource] = useState('ZALO');
  const [phone, setPhone] = useState('');
  const [parsed, setParsed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false); // chống bấm đúp → 2 phiếu SOS trùng

  const analyze = async () => {
    setBusy(true);
    try {
      setParsed(await api('/sos/parse', { method: 'POST', body: { text } }));
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    setCreating(true);
    try {
      const t = await api('/sos', { method: 'POST', body: { raw_message: text, source, reporter_phone: phone || null } });
      toast({ tone: 'good', title: `Đã tạo phiếu ${t.code}`, body: `${INCIDENT[t.incident_type]} – ${t.address}` });
      if (t.possible_duplicates?.length) {
        // Cùng SĐT hoặc cách < 200 m trong 30 phút, chưa hoàn thành → kiểm tra trước khi điều thêm đội
        toast({ tone: 'warn', title: `${t.code} có thể trùng với ${t.possible_duplicates.join(', ')}`, body: 'Kiểm tra trước khi điều động — tránh điều 2 đội tới cùng một nơi.', duration: 12000 });
      }
      setText('');
      setParsed(null);
      setPhone('');
      qc.invalidateQueries({ queryKey: ['sos'] });
    } catch (e) {
      toast({ tone: 'danger', title: 'Không tạo được phiếu', body: e.message });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Section title="Tiếp nhận đa kênh & Bóc tách AI" right={<Bot size={16} className="text-accent" />}>
      <div className="flex flex-col gap-2.5">
        <div className="flex gap-2">
          <select
            className="input w-auto text-xs"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            aria-label="Kênh tiếp nhận"
          >
            {['ZALO', 'APP', 'HOTLINE', 'CAN_BO'].map((s) => (
              <option key={s} value={s}>{SOURCE[s]}</option>
            ))}
          </select>
          <input
            className="input text-xs"
            placeholder="Số điện thoại người báo tin..."
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <textarea
          className="input min-h-[85px] text-xs leading-relaxed"
          placeholder="Dán tin nhắn cầu cứu từ người dân (Zalo, SMS, gọi điện). Ví dụ: Nước ngập đến mái nhà ở xóm Pác Bó xã Trường Hà, 5 người có 1 cụ già và 2 trẻ em đang leo lên xà nhà..."
          value={text}
          onChange={(e) => { setText(e.target.value); setParsed(null); }}
        />

        <div className="flex items-center gap-2">
          <button
            className="btn-ghost text-xs px-3 py-1.5"
            disabled={text.length < 8 || busy}
            onClick={analyze}
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} className="text-accent" />}
            <span>Bóc tách thông tin</span>
          </button>
          <button
            className="btn-danger ml-auto text-xs px-3 py-1.5 font-semibold"
            disabled={text.length < 8 || creating}
            onClick={create}
          >
            <Inbox size={13} />
            <span>Tạo phiếu SOS</span>
          </button>
        </div>

        {parsed && (
          <div className="rounded-xl bg-panel2 p-3 text-xs space-y-1.5 border border-line">
            <div className="font-semibold text-accent flex items-center justify-between">
              <span>Phân loại tự động ({parsed.engine === 'rules' ? 'Quy tắc' : 'Mô hình AI'}):</span>
              <span className="chip bg-panel text-ink-2 text-[10px]">{parsed.priority ? `Ưu tiên cấp ${parsed.priority}` : ''}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <span className="text-muted">Loại sự cố:</span><b>{INCIDENT[parsed.incident_type]}</b>
              <span className="text-muted">Mức ưu tiên:</span><b>{PRIORITY[parsed.priority].label}</b>
              <span className="text-muted">Số người:</span><b>{parsed.trapped_count} người</b>
              <span className="text-muted">Nhóm yếu thế:</span><b>{parsed.vulnerable.map((v) => VULNERABLE[v]).join(', ') || 'Không'}</b>
              <span className="text-muted">Địa bàn:</span><b className={clsx(!parsed.place && 'text-danger')}>{parsed.place ? `${parsed.place.name}` : 'Cần cán bộ xác minh toạ độ'}</b>
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

function Evacuation() {
  const { data } = useAreaQuery('evacuation', '/evacuation', {}, { refetchInterval: 30_000 });
  if (!data) return null;
  const totPlanned = data.progress.reduce((s, r) => s + r.planned_households, 0);
  const totDone = data.progress.reduce((s, r) => s + r.evacuated_households, 0);

  return (
    <Section title="Giám sát sơ tán nhân dân" right={<span className="text-xs font-mono font-semibold text-ink">{int(totDone)}/{int(totPlanned)} hộ</span>}>
      <div className="flex flex-col gap-3">
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase text-muted">Tiến độ di dời theo xã (thấp nhất trước)</div>
          <div className="flex max-h-48 flex-col gap-2 overflow-y-auto pr-1 scroll-thin">
            {data.progress.map((r) => {
              const p = pct(r.evacuated_households, r.planned_households);
              return (
                <div key={r.code} className="text-xs">
                  <div className="flex justify-between mb-0.5">
                    <span className="font-medium text-ink truncate">{r.name}</span>
                    <span className="font-mono text-muted">{r.evacuated_households}/{r.planned_households} hộ ({p}%)</span>
                  </div>
                  <Progress value={p} tone={p < 50 ? 'danger' : p < 80 ? 'warn' : 'good'} />
                </div>
              );
            })}
            {!data.progress.length && <Empty />}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase text-muted">Sức chứa các điểm sơ tán</div>
          <div className="flex max-h-48 flex-col gap-2 overflow-y-auto pr-1 scroll-thin">
            {data.sites.map((s) => {
              const p = pct(s.current_occupancy, s.capacity);
              return (
                <div key={s.id} className="text-xs">
                  <div className="flex justify-between gap-2 mb-0.5">
                    <span className="flex items-center gap-1 truncate text-ink"><Home size={11} className="text-good shrink-0" />{s.name}</span>
                    <span className={clsx('font-mono font-semibold', p >= 100 && 'text-danger')}>{s.current_occupancy}/{s.capacity}</span>
                  </div>
                  <Progress value={p} tone={p >= 100 ? 'danger' : p > 85 ? 'warn' : 'accent'} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Section>
  );
}

export default function RescueCenter() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { setFocus, toast } = useStore();
  const now = useNow();
  const { data: tickets = [] } = useAreaQuery('sos', '/sos', {}, { refetchInterval: 20_000 });
  const [dispatch, setDispatch] = useState(null);
  const [over, setOver] = useState(null);
  const [filterText, setFilterText] = useState('');

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

  const onFocus = (t) => {
    setFocus({ lat: t.lat, lon: t.lon, zoom: 15, label: t.code });
    navigate('/ban-do');
  };

  // Lọc vé theo từ khoá tìm kiếm
  const filteredTickets = useMemo(() => {
    if (!filterText.trim()) return tickets;
    const q = filterText.toLowerCase();
    return tickets.filter((t) =>
      t.code?.toLowerCase().includes(q) ||
      t.address?.toLowerCase().includes(q) ||
      t.admin_name?.toLowerCase().includes(q) ||
      t.raw_message?.toLowerCase().includes(q) ||
      t.reporter_phone?.includes(q)
    );
  }, [tickets, filterText]);

  const counts = Object.fromEntries(COLUMNS.map((c) => [c.key, filteredTickets.filter((t) => t.status === c.key).length]));
  const overdue = tickets.filter((t) => t.status === 'moi' && (now - new Date(t.received_at)) / 60000 > t.sla_minutes).length;

  return (
    <div className="flex flex-col gap-3.5 p-3.5 sm:p-5">
      {/* Tiêu đề & Cảnh báo SLA */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink flex items-center gap-2">
            <span>Trung tâm Điều hành Cứu hộ Khẩn cấp</span>
          </h1>
          <p className="text-xs text-muted mt-0.5">
            Kéo thả phiếu giữa các cột để phân luồng · Chuẩn SLA: Cấp 1 &lt; 3′, Cấp 2 &lt; 15′, Cấp 3 &lt; 60′
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Ô lọc nhanh phiếu */}
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-2 text-muted" />
            <input
              className="input pl-8 py-1 text-xs w-48 sm:w-64"
              placeholder="Tìm mã SOS, SĐT, địa bàn..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
          </div>

          {overdue > 0 && (
            <span className="chip bg-danger text-white px-3 py-1 text-xs font-bold animate-pulse shadow-sm shadow-danger/30">
              <Clock size={14} /> {overdue} phiếu quá hạn SLA
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-3.5 2xl:grid-cols-[1fr_370px]">
        {/* Bảng Kanban 4 cột */}
        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => (
            <div
              key={col.key}
              onDragOver={(e) => { e.preventDefault(); setOver(col.key); }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); move(e.dataTransfer.getData('text/plain'), col.key); }}
              className={clsx(
                'card flex max-h-[calc(100vh-11rem)] min-h-[360px] flex-col border-t-4 transition-all',
                col.tone,
                over === col.key ? 'ring-2 ring-accent border-dashed bg-accent/5' : 'bg-panel'
              )}
            >
              <div className="px-3.5 py-3 border-b border-line/60">
                <div className="flex items-center justify-between font-bold text-sm text-ink">
                  <span>{col.title}</span>
                  <span className="chip bg-panel2 text-xs font-semibold px-2 py-0.5">{counts[col.key]}</span>
                </div>
                <div className="text-[11px] text-muted mt-0.5">{col.hint}</div>
              </div>

              <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-2.5 scroll-thin">
                {filteredTickets
                  .filter((t) => t.status === col.key)
                  .map((t) => (
                    <TicketCard
                      key={t.id}
                      t={t}
                      now={now}
                      onDispatch={setDispatch}
                      onResolve={(x) => move(x.id, 'hoan_thanh')}
                      onFocus={onFocus}
                    />
                  ))}
                {!counts[col.key] && (
                  <div className="flex flex-col items-center justify-center py-12 text-xs text-muted text-center">
                    <CheckCircle2 size={24} className="text-muted/40 mb-1" />
                    <span>Không có phiếu trong cột này</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Cột phải: Tiếp nhận & Giám sát sơ tán */}
        <div className="flex flex-col gap-3.5">
          <Can I="sos" a="create"><Intake /></Can>
          <Evacuation />
        </div>
      </div>

      {dispatch && <DispatchModal ticket={dispatch} onClose={() => setDispatch(null)} />}
    </div>
  );
}
