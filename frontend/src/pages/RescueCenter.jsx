import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Bot, CheckCircle2, Clock, MapPin, Phone, Send, Sparkles, Timer, Inbox, Loader2, Navigation, Home } from 'lucide-react';
import { api } from '../api/client';
import { useAreaQuery } from '../api/hooks';
import { useStore } from '../app/store';
import { Empty, Progress, Section } from '../components/common/ui';
import DispatchModal from '../components/common/DispatchModal';
import { INCIDENT, PRIORITY, SOS_STATUS, SOURCE, VULNERABLE } from '../utils/labels';
import { int, pct, time } from '../utils/format';

const COLUMNS = [
  { key: 'moi', title: 'Chờ xử lý', hint: 'Tín hiệu mới – cần tiếp nhận', tone: 'border-t-danger' },
  { key: 'dieu_phoi', title: 'Đang điều phối', hint: 'Đã xác minh, đang chỉ định lực lượng', tone: 'border-t-serious' },
  { key: 'thuc_thi', title: 'Đang thực thi', hint: 'Lực lượng đang tiếp cận hiện trường', tone: 'border-t-warn' },
  { key: 'hoan_thanh', title: 'Hoàn thành', hint: 'Đã cứu an toàn – lưu hồ sơ', tone: 'border-t-good' },
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
  const pr = PRIORITY[t.priority];
  const waitingSec = (now - new Date(t.received_at).getTime()) / 1000;
  const slaSec = t.sla_minutes * 60;
  const breached = t.status === 'moi' && waitingSec > slaSec;
  const etaSec = t.eta ? (new Date(t.eta).getTime() - now) / 1000 : null;
  return (
    <div
      draggable={t.status !== 'hoan_thanh'}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)}
      className={clsx('card cursor-grab border-l-4 p-2.5 active:cursor-grabbing', { 1: 'border-l-danger', 2: 'border-l-serious', 3: 'border-l-warn' }[t.priority], breached && 'ring-2 ring-danger')}
    >
      <div className="flex items-center gap-2">
        <b className="text-sm">{t.code}</b>
        <span className={clsx('chip', pr.cls)}>{pr.short}</span>
        <span className="ml-auto text-[11px] text-muted">{SOURCE[t.source]}</span>
      </div>
      <div className="mt-1 text-sm font-medium">{INCIDENT[t.incident_type]} · {t.trapped_count} người</div>
      <div className="text-xs text-muted">{t.address || t.admin_name}{t.admin_name && t.address !== t.admin_name ? ` (${t.admin_name})` : ''}</div>
      {!!t.vulnerable?.length && (
        <div className="mt-1 flex flex-wrap gap-1">{t.vulnerable.map((v) => <span key={v} className="chip bg-danger/15 text-danger">{VULNERABLE[v]}</span>)}</div>
      )}
      {t.raw_message && <p className="mt-1 line-clamp-2 text-xs italic text-ink-2">“{t.raw_message}”</p>}

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {t.status === 'moi' && (
          <span className={clsx('inline-flex items-center gap-1 font-mono', breached ? 'font-bold text-danger' : 'text-ink-2')} title={`SLA phản hồi cấp ${t.priority}: ${t.sla_minutes} phút`}>
            <Timer size={12} className={breached ? 'animate-blink' : ''} /> {mmss(waitingSec)} / SLA {t.sla_minutes}′{breached && ' · QUÁ HẠN'}
          </span>
        )}
        {t.status === 'thuc_thi' && t.force_name && (
          <div className="w-full">
            <div className="flex items-center gap-1 text-ink-2"><Navigation size={12} /> {t.force_name}</div>
            <div className="mt-1 flex items-center gap-2">
              <Progress value={(t.progress || 0) * 100} tone="warn" className="flex-1" />
              <span className="font-mono">{t.dispatch_status === 'da_den' ? 'Đã đến' : etaSec > 0 ? `ETA ${mmss(etaSec)}` : 'Sắp đến'}</span>
            </div>
            {!t.route_safe && <div className="text-[11px] text-danger">⚠ Lộ trình qua vùng nguy hiểm</div>}
          </div>
        )}
        {t.status === 'hoan_thanh' && <span className="inline-flex items-center gap-1 text-good"><CheckCircle2 size={12} /> {time(t.resolved_at)}</span>}
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => onFocus(t)}><MapPin size={12} /> Bản đồ</button>
        {t.reporter_phone && <a className="btn-ghost px-2 py-0.5 text-xs" href={`tel:${t.reporter_phone.replace(/\s/g, '')}`}><Phone size={12} /> Gọi</a>}
        {(t.status === 'moi' || t.status === 'dieu_phoi') && (
          <button className="btn-danger px-2 py-0.5 text-xs" onClick={() => onDispatch(t)}><Send size={12} /> Điều phối</button>
        )}
        {t.status === 'thuc_thi' && (
          <button className="btn px-2 py-0.5 text-xs bg-good text-white" onClick={() => onResolve(t)}><CheckCircle2 size={12} /> Đã cứu an toàn</button>
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

  const analyze = async () => {
    setBusy(true);
    try {
      setParsed(await api('/sos/parse', { method: 'POST', body: { text } }));
    } finally {
      setBusy(false);
    }
  };
  const create = async () => {
    try {
      const t = await api('/sos', { method: 'POST', body: { raw_message: text, source, reporter_phone: phone || null } });
      toast({ tone: 'good', title: `Đã tạo phiếu ${t.code}`, body: `${INCIDENT[t.incident_type]} – ${t.address}` });
      setText('');
      setParsed(null);
      qc.invalidateQueries({ queryKey: ['sos'] });
    } catch (e) {
      toast({ tone: 'danger', title: 'Không tạo được phiếu', body: e.message });
    }
  };

  return (
    <Section title="Tiếp nhận đa kênh & phân loại AI" right={<Bot size={16} className="text-accent" />}>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <select className="input w-auto" value={source} onChange={(e) => setSource(e.target.value)} aria-label="Kênh">
            {['ZALO', 'APP', 'HOTLINE', 'CAN_BO'].map((s) => <option key={s} value={s}>{SOURCE[s]}</option>)}
          </select>
          <input className="input" placeholder="SĐT người báo" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <textarea
          className="input min-h-[84px]"
          placeholder="Dán tin nhắn cầu cứu của người dân (Zalo, SMS…). VD: Nước ngập đến mái nhà ở tổ Sông Bằng phường Nùng Trí Cao, 4 người có 1 cụ già"
          value={text}
          onChange={(e) => { setText(e.target.value); setParsed(null); }}
        />
        <div className="flex gap-2">
          <button className="btn-ghost" disabled={text.length < 8 || busy} onClick={analyze}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Bóc tách thông tin
          </button>
          <button className="btn-danger ml-auto" disabled={text.length < 8} onClick={create}><Inbox size={14} /> Tạo phiếu SOS</button>
        </div>
        {parsed && (
          <div className="rounded-lg bg-panel2 p-2 text-xs">
            <div className="mb-1 font-semibold text-accent">Kết quả ({parsed.engine === 'rules' ? 'bộ luật offline' : 'mô hình ngôn ngữ'}):</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              <span className="text-muted">Loại sự cố</span><b>{INCIDENT[parsed.incident_type]}</b>
              <span className="text-muted">Mức ưu tiên</span><b>{PRIORITY[parsed.priority].label}</b>
              <span className="text-muted">Số người</span><b>{parsed.trapped_count}{parsed.counted_households ? ' (quy đổi từ số hộ)' : ''}</b>
              <span className="text-muted">Nhóm yếu thế</span><b>{parsed.vulnerable.map((v) => VULNERABLE[v]).join(', ') || '–'}</b>
              <span className="text-muted">Địa điểm</span><b className={clsx(!parsed.place && 'text-danger')}>{parsed.place ? `${parsed.place.name} (${parsed.place.lat.toFixed(4)}, ${parsed.place.lon.toFixed(4)})` : 'Chưa xác định – cần bổ sung'}</b>
            </div>
            <pre className="mt-2 max-h-28 overflow-auto rounded bg-panel p-2 font-mono text-[10px] scroll-thin">{JSON.stringify(parsed, null, 1)}</pre>
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
    <Section title="Giám sát sơ tán tại điểm nóng" right={<span className="text-xs text-muted">{int(totDone)}/{int(totPlanned)} hộ</span>}>
      <div className="flex flex-col gap-3">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase text-muted">Tiến độ di dời theo xã (thấp nhất trước)</div>
          <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1 scroll-thin">
            {data.progress.map((r) => {
              const p = pct(r.evacuated_households, r.planned_households);
              return (
                <div key={r.code} className="text-xs">
                  <div className="flex justify-between"><span>{r.name}</span><span className="font-mono">{r.evacuated_households}/{r.planned_households} hộ · {p}%</span></div>
                  <Progress value={p} tone={p < 50 ? 'danger' : p < 80 ? 'warn' : 'good'} />
                </div>
              );
            })}
            {!data.progress.length && <Empty />}
          </div>
        </div>
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase text-muted">Sức chứa điểm sơ tán (tránh quá tải)</div>
          <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1 scroll-thin">
            {data.sites.map((s) => {
              const p = pct(s.current_occupancy, s.capacity);
              return (
                <div key={s.id} className="text-xs">
                  <div className="flex justify-between gap-2"><span className="flex items-center gap-1 truncate"><Home size={11} />{s.name}</span><span className={clsx('font-mono', p >= 100 && 'font-bold text-danger')}>{s.current_occupancy}/{s.capacity}</span></div>
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
  const { setFocus, toast, auth } = useStore();
  const now = useNow();
  const { data: tickets = [] } = useAreaQuery('sos', '/sos', {}, { refetchInterval: 20_000 });
  const [dispatch, setDispatch] = useState(null);
  const [over, setOver] = useState(null);

  const move = async (id, status) => {
    const t = tickets.find((x) => x.id === id);
    if (!t || t.status === status) return;
    if (!auth) {
      toast({ tone: 'warn', title: 'Cần đăng nhập để cập nhật trạng thái phiếu' });
      return;
    }
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

  const counts = Object.fromEntries(COLUMNS.map((c) => [c.key, tickets.filter((t) => t.status === c.key).length]));
  const overdue = tickets.filter((t) => t.status === 'moi' && (now - new Date(t.received_at)) / 60000 > t.sla_minutes).length;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-lg font-bold">Trung tâm Điều hành Cứu hộ & Điểm nóng khẩn cấp</h1>
          <p className="text-xs text-muted">Kéo thả phiếu giữa các cột để chuyển trạng thái · SLA phản hồi: Cấp 1 &lt; 3′, Cấp 2 &lt; 15′, Cấp 3 &lt; 60′</p>
        </div>
        {overdue > 0 && <span className="chip animate-blink bg-danger px-3 py-1 text-sm text-white"><Clock size={14} /> {overdue} phiếu quá hạn SLA</span>}
      </div>

      <div className="grid gap-3 2xl:grid-cols-[1fr_360px]">
        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => (
            <div
              key={col.key}
              onDragOver={(e) => { e.preventDefault(); setOver(col.key); }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); move(e.dataTransfer.getData('text/plain'), col.key); }}
              className={clsx('card flex max-h-[calc(100vh-11rem)] min-h-[300px] flex-col border-t-4', col.tone, over === col.key && 'ring-2 ring-accent')}
            >
              <div className="px-3 pb-2 pt-2.5">
                <div className="flex items-center justify-between font-semibold">{col.title}<span className="chip bg-panel2">{counts[col.key]}</span></div>
                <div className="text-[11px] text-muted">{col.hint}</div>
              </div>
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 scroll-thin">
                {tickets.filter((t) => t.status === col.key).map((t) => (
                  <TicketCard key={t.id} t={t} now={now} onDispatch={setDispatch} onResolve={(x) => move(x.id, 'hoan_thanh')} onFocus={onFocus} />
                ))}
                {!counts[col.key] && <div className="py-6 text-center text-xs text-muted">Trống</div>}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <Intake />
          <Evacuation />
        </div>
      </div>

      {dispatch && <DispatchModal ticket={dispatch} onClose={() => setDispatch(null)} />}
      <p className="text-[11px] text-muted">Trạng thái hiển thị: {Object.values(SOS_STATUS).join(' → ')}. Phiếu hoàn thành hiển thị trong 48 giờ.</p>
    </div>
  );
}
