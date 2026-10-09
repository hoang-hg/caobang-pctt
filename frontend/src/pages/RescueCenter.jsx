import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Bot, CheckCircle2, Clock, MapPin, Phone, Send, Sparkles, Timer, Inbox, Loader2, Navigation, Home,
  Search, LifeBuoy, Link2, Ban, Pencil
} from 'lucide-react';
import { api } from '../api/client';
import { useAreaQuery, useUnits } from '../api/hooks';
import { useStore } from '../app/store';
import { Empty, Modal, Progress, Section } from '../components/common/ui';
import DispatchModal from '../components/common/DispatchModal';
import OccupancyModal from '../components/common/OccupancyModal';
import { MissionLinkModal } from '../components/common/MissionLink';
import CancelDispatchModal from '../components/common/CancelDispatchModal';
import EditTicketModal from '../components/common/EditTicketModal';
import { Can, useAllowedCodes, usePermission } from '../rbac/usePermission';
import { INCIDENT, PRIORITY, SOURCE, VULNERABLE } from '../utils/labels';
import { int, pct, time } from '../utils/format';
import { hasActiveTeam, slaState } from '../utils/sla';

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

function TicketCard({ t, now, onDispatch, onResolve, onFocus, onArrived, onLink, onCancel, onEdit, onMove }) {
  const canUpdate = usePermission('sos', 'update', t.admin_code);
  const canResolve = usePermission('sos', 'resolve', t.admin_code);
  const pr = PRIORITY[t.priority] || PRIORITY[2];
  const sla = slaState(t, now);
  const breached = !!sla?.breached;
  // Chuyển trạng thái không cần kéo thả (điện thoại, bàn phím). Đang có đội thực hiện → không về "Chờ xử lý" / "Đang
  // điều phối" (máy chủ chặn, phải huỷ lệnh trước); "Đã cứu an toàn" cần quyền xác nhận hoàn thành
  const targets = COLUMNS.filter(
    (c) => c.key !== t.status && !(hasActiveTeam(t) && (c.key === 'moi' || c.key === 'dieu_phoi')) && (c.key !== 'hoan_thanh' || canResolve)
  );
  const etaSec = t.eta ? (new Date(t.eta).getTime() - now) / 1000 : null;
  // Tiến độ: đã đến = 100%; bộ mô phỏng có tiến độ thật; chạy thật chưa có GPS → ước tính theo giờ xuất phát và ETA
  const arrived = t.dispatch_status === 'da_den';
  const span = t.dispatched_at && t.eta ? new Date(t.eta) - new Date(t.dispatched_at) : 0;
  const estimated = !arrived && !(t.progress > 0);
  const progress = arrived ? 100 : t.progress > 0 ? t.progress * 100 : span > 0 ? Math.min(95, (100 * (now - new Date(t.dispatched_at))) / span) : 0;
  // Báo cáo gần nhất của trưởng nhóm qua link nhiệm vụ ("đã đến" đã hiện ở thanh tiến độ)
  const active = t.status === 'thuc_thi';
  const needSupport = active && t.field_kind === 'need_support';
  const rescued = active && t.field_kind === 'rescued';
  const missionOpen = active && t.dispatch_id && (t.dispatch_status === 'dang_di' || t.dispatch_status === 'da_den');

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
        {canUpdate && t.status !== 'hoan_thanh' && (
          <button className="text-muted hover:text-accent" onClick={() => onEdit(t)} title="Sửa mức ưu tiên, số người, nhóm yếu thế" aria-label={`Sửa phiếu ${t.code}`}>
            <Pencil size={12} />
          </button>
        )}
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
        {sla && (
          <span
            className={clsx('inline-flex items-center gap-1 font-mono text-[11px]', breached ? 'font-bold text-danger' : 'text-ink-2')}
            title={
              t.status === 'moi'
                ? `SLA tiếp nhận cấp ${t.priority}: ${t.sla_minutes} phút`
                : `Chưa có đội nào được điều động — SLA cấp ${t.priority}: ${t.sla_minutes} phút kể từ lúc chuyển sang “Đang điều phối”`
            }
          >
            <Timer size={13} className={breached ? 'animate-bounce text-danger' : 'text-muted'} />
            <span>{sla.label}: {mmss(sla.waitedSec)} / SLA {t.sla_minutes}′{breached && ' · QUÁ HẠN'}</span>
          </span>
        )}

        {t.status === 'thuc_thi' && t.force_name && (
          <div className="w-full space-y-1">
            <div className="flex items-center gap-1 text-ink-2 font-medium text-xs">
              <Navigation size={12} className="text-accent" />
              <span className="truncate">{t.force_name}</span>
            </div>
            <div className="flex items-center gap-2" title={estimated ? 'Ước tính theo giờ xuất phát và ETA (chưa có GPS)' : undefined}>
              <Progress value={progress} tone={arrived ? 'good' : 'warn'} className="flex-1" />
              <span className="font-mono text-[11px] text-ink font-semibold">
                {arrived ? `Đã đến ${time(t.arrived_at)}` : etaSec > 0 ? `ETA ${mmss(etaSec)}` : 'Quá ETA'}
              </span>
            </div>
            {!arrived && canUpdate && t.dispatch_id && (
              <button className="btn-ghost w-full justify-center px-2 py-1 text-xs" onClick={() => onArrived(t)}>
                <CheckCircle2 size={12} /> Đội báo đã đến hiện trường
              </button>
            )}
            {!t.route_safe && <div className="text-[11px] font-medium text-danger">⚠ Lộ trình buộc qua vùng nguy hiểm</div>}
            {needSupport && (
              <div className="rounded-md border border-danger/50 bg-danger/10 px-2 py-1 text-[11px] text-danger [overflow-wrap:anywhere]">
                <b>Đội cần chi viện</b> ({time(t.field_at)}){t.field_note ? `: ${t.field_note}` : ''}
              </div>
            )}
            {rescued && (
              <div className="rounded-md border border-good/50 bg-good/10 px-2 py-1 text-[11px] text-good [overflow-wrap:anywhere]">
                <b>
                  Đội báo đã cứu {t.trapped_count ? `${t.field_people_safe}/${t.trapped_count}` : t.field_people_safe} người
                </b>{' '}
                ({time(t.field_at)}) — chờ xác nhận{t.field_note ? `: ${t.field_note}` : ''}
              </div>
            )}
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

        {canUpdate && t.status !== 'hoan_thanh' && targets.length > 0 && (
          <select
            className="input w-auto py-1 pl-2 text-xs"
            value=""
            onChange={(e) => e.target.value && onMove(t, e.target.value)}
            aria-label={`Chuyển trạng thái phiếu ${t.code}`}
            title="Chuyển phiếu sang cột khác (thay cho kéo thả — dùng được trên điện thoại)"
          >
            <option value="">Chuyển trạng thái…</option>
            {targets.map((c) => <option key={c.key} value={c.key}>{c.title}</option>)}
          </select>
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

        {missionOpen && (
          <Can I="dispatch" a="create" scope={t.admin_code}>
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => onLink(t)} title="Cấp lại link nhiệm vụ cho trưởng nhóm">
              <Link2 size={12} /> Link
            </button>
            <button className="btn-ghost px-2 py-1 text-xs text-danger" onClick={() => onCancel(t)} title="Huỷ lệnh điều động (nhầm lực lượng, đội không tiếp cận được…)">
              <Ban size={12} /> Huỷ lệnh
            </button>
          </Can>
        )}

        {needSupport && (
          <Can I="dispatch" a="create" scope={t.admin_code}>
            <button className="btn-danger px-2 py-1 text-xs font-semibold" onClick={() => onDispatch(t)} title="Điều thêm lực lượng chi viện">
              <LifeBuoy size={12} /> Chi viện
            </button>
          </Can>
        )}

        {t.status === 'thuc_thi' && (
          <Can I="sos" a="resolve" scope={t.admin_code}>
            <button
              className={clsx('btn-good ml-auto px-2.5 py-1 text-xs shadow-sm font-semibold', rescued && 'ring-2 ring-good/40')}
              onClick={() => onResolve(t)}
            >
              <CheckCircle2 size={12} /> {rescued ? 'Xác nhận hoàn thành' : 'Đã an toàn'}
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
  const [edit, setEdit] = useState(null); // kết quả bóc tách trực ban đã sửa (mức ưu tiên, số người, loại, nhóm yếu thế)
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false); // chống bấm đúp → 2 phiếu SOS trùng

  const analyze = async () => {
    setBusy(true);
    try {
      const p = await api('/sos/parse', { method: 'POST', body: { text } });
      setParsed(p);
      setEdit({ incident_type: p.incident_type, priority: p.priority, trapped_count: String(p.trapped_count ?? 0), vulnerable: p.vulnerable || [] });
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    setCreating(true);
    try {
      // Đã bóc tách: gửi kết quả trực ban đã kiểm tra / sửa; chưa bóc tách: máy chủ tự bóc tách từ nội dung
      const fields = edit
        ? { incident_type: edit.incident_type, priority: edit.priority, vulnerable: edit.vulnerable, trapped_count: edit.trapped_count === '' ? null : Number(edit.trapped_count) }
        : {};
      const t = await api('/sos', { method: 'POST', body: { raw_message: text, source, reporter_phone: phone || null, ...fields } });
      toast({ tone: 'good', title: `Đã tạo phiếu ${t.code}`, body: `${INCIDENT[t.incident_type]} – ${t.address}` });
      if (t.possible_duplicates?.length) {
        // Cùng SĐT hoặc cách < 200 m trong 30 phút, chưa hoàn thành → kiểm tra trước khi điều thêm đội
        toast({ tone: 'warn', title: `${t.code} có thể trùng với ${t.possible_duplicates.join(', ')}`, body: 'Kiểm tra trước khi điều động — tránh điều 2 đội tới cùng một nơi.', duration: 12000 });
      }
      setText('');
      setParsed(null);
      setEdit(null);
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
          onChange={(e) => { setText(e.target.value); setParsed(null); setEdit(null); }}
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

        {parsed && edit && (
          // Kết quả bóc tách SỬA ĐƯỢC trước khi tạo phiếu: quy tắc / mô hình có thể đánh giá thấp (VD mắc kẹt trên mái là Cấp 1)
          <div className="rounded-xl bg-panel2 p-3 text-xs space-y-2 border border-line">
            <div className="font-semibold text-accent">
              Phân loại tự động ({parsed.engine === 'rules' ? 'Quy tắc' : 'Mô hình AI'}) — kiểm tra, sửa nếu cần rồi tạo phiếu
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-0.5">
                <span className="text-muted">Loại sự cố</span>
                <select className="input py-1 text-xs" value={edit.incident_type} onChange={(e) => setEdit({ ...edit, incident_type: e.target.value })}>
                  {Object.entries(INCIDENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-muted">Mức ưu tiên</span>
                <select className="input py-1 text-xs" value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: Number(e.target.value) })}>
                  {[1, 2, 3].map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-muted">Số người</span>
                <input className="input py-1 text-xs" type="number" min={0} value={edit.trapped_count} onChange={(e) => setEdit({ ...edit, trapped_count: e.target.value })} />
              </label>
              <div className="flex flex-col gap-0.5">
                <span className="text-muted">Địa bàn</span>
                <b className={clsx('py-1', !parsed.place && 'text-danger')}>{parsed.place ? parsed.place.name : 'Cần cán bộ xác minh toạ độ'}</b>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted">Nhóm yếu thế:</span>
              {Object.entries(VULNERABLE).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={edit.vulnerable.includes(k)}
                  className={clsx('chip px-2 py-0.5', edit.vulnerable.includes(k) ? 'bg-danger text-white' : 'bg-panel text-ink-2')}
                  onClick={() => setEdit({ ...edit, vulnerable: edit.vulnerable.includes(k) ? edit.vulnerable.filter((x) => x !== k) : [...edit.vulnerable, k] })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

const EVAC_FIELDS = [
  ['planned_households', 'Hộ phải sơ tán (kế hoạch)'],
  ['evacuated_households', 'Hộ đã sơ tán an toàn'],
  ['planned_persons', 'Nhân khẩu phải sơ tán'],
  ['evacuated_persons', 'Nhân khẩu đã sơ tán'],
];

/** Xã / trực ban cập nhật kế hoạch và tiến độ sơ tán (quyền evacuation.update tại xã đó) → KPI "Sơ tán an toàn" của
 * Dashboard cập nhật ngay. Kết thúc đợt: nhập số đã sơ tán = 0. */
function EvacuationModal({ row, onClose }) {
  const qc = useQueryClient();
  const toast = useStore((st) => st.toast);
  const { data: units = [] } = useUnits();
  const allowed = useAllowedCodes('evacuation', 'update');
  const choices = units.filter((u) => !allowed || allowed.includes(u.code));
  const [code, setCode] = useState(row?.code || '');
  const [f, setF] = useState(() => Object.fromEntries(EVAC_FIELDS.map(([k]) => [k, row?.[k] ?? ''])));
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const unit = units.find((u) => u.code === code);
  const n = (k) => Number(f[k]);
  const filled = EVAC_FIELDS.every(([k]) => f[k] !== '' && Number.isInteger(n(k)) && n(k) >= 0);
  const problem = !filled
    ? null
    : n('planned_persons') < n('planned_households') || n('evacuated_persons') < n('evacuated_households')
      ? 'Số nhân khẩu không thể ít hơn số hộ'
      : unit?.households && Math.max(n('planned_households'), n('evacuated_households')) > unit.households
        ? `Vượt tổng số hộ của xã (${int(unit.households)})`
        : null;
  const submit = async () => {
    setBusy(true);
    try {
      await api(`/evacuation/${encodeURIComponent(code)}`, {
        method: 'PUT',
        body: { ...Object.fromEntries(EVAC_FIELDS.map(([k]) => [k, n(k)])), source: source || null },
      });
      toast({ tone: 'good', title: `Đã cập nhật sơ tán ${unit?.name || code}` });
      qc.invalidateQueries({ queryKey: ['evacuation'] });
      qc.invalidateQueries({ queryKey: ['kpis'] });
      onClose();
    } catch (e) {
      toast({ tone: 'danger', title: 'Không cập nhật được', body: e.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={row ? `Cập nhật sơ tán – ${row.name}` : 'Cập nhật sơ tán'}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" disabled={!code || !filled || !!problem || busy} onClick={submit}>Lưu số liệu</button>
        </>
      }
    >
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        {!row && (
          <label className="flex flex-col gap-1 sm:col-span-2">
            Xã / phường *
            <select className="input" value={code} onChange={(e) => setCode(e.target.value)}>
              <option value="">— Chọn xã —</option>
              {choices.map((u) => <option key={u.code} value={u.code}>{u.name}</option>)}
            </select>
          </label>
        )}
        {EVAC_FIELDS.map(([k, label]) => (
          <label key={k} className="flex flex-col gap-1">
            {label} *
            <input className="input" type="number" min="0" step="1" value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} />
          </label>
        ))}
        <label className="flex flex-col gap-1 sm:col-span-2">
          Nguồn báo cáo
          <input className="input" maxLength={200} placeholder="VD: Báo cáo UBND xã lúc 14h" value={source} onChange={(e) => setSource(e.target.value)} />
        </label>
        {problem && <p className="text-xs text-danger sm:col-span-2">{problem}</p>}
        <p className="text-[11px] text-muted sm:col-span-2">
          {unit?.households ? `Xã có ${int(unit.households)} hộ, ${int(unit.population)} nhân khẩu. ` : ''}
          Kết thúc đợt sơ tán: nhập số đã sơ tán = 0. Thao tác được ghi nhật ký.
        </p>
      </div>
    </Modal>
  );
}

function EvacuationRow({ r, onEdit }) {
  const canEdit = usePermission('evacuation', 'update', r.code);
  const p = pct(r.evacuated_households, r.planned_households);
  return (
    <div className="text-xs">
      <div className="flex justify-between gap-2 mb-0.5">
        <span className="font-medium text-ink truncate">{r.name}</span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-muted" title={`Cập nhật ${time(r.updated_at)}`}>{r.evacuated_households}/{r.planned_households} hộ ({p}%)</span>
          {canEdit && <button className="text-accent hover:underline" onClick={() => onEdit(r)}>Sửa</button>}
        </span>
      </div>
      <Progress value={p} tone={p < 50 ? 'danger' : p < 80 ? 'warn' : 'good'} />
    </div>
  );
}

function SiteRow({ s, onEdit }) {
  const canEdit = usePermission('evacuation', 'update', s.admin_code);
  const p = pct(s.current_occupancy, s.capacity);
  return (
    <div className="text-xs">
      <div className="flex justify-between gap-2 mb-0.5">
        <span className="flex items-center gap-1 truncate text-ink"><Home size={11} className="text-good shrink-0" />{s.name}</span>
        <span className="flex shrink-0 items-center gap-2">
          <span className={clsx('font-mono font-semibold', p >= 100 && 'text-danger')}>{s.current_occupancy}/{s.capacity}</span>
          {canEdit && <button className="text-accent hover:underline" onClick={() => onEdit(s)}>Sửa</button>}
        </span>
      </div>
      <Progress value={p} tone={p >= 100 ? 'danger' : p > 85 ? 'warn' : 'accent'} />
    </div>
  );
}

function Evacuation() {
  const { data } = useAreaQuery('evacuation', '/evacuation', {}, { refetchInterval: 30_000 });
  const canUpdate = usePermission('evacuation', 'update');
  const [editing, setEditing] = useState(null); // null | 'new' | dòng tiến độ
  const [site, setSite] = useState(null); // điểm sơ tán đang cập nhật số người
  if (!data) return null;
  const totPlanned = data.progress.reduce((s, r) => s + r.planned_households, 0);
  const totDone = data.progress.reduce((s, r) => s + r.evacuated_households, 0);

  return (
    <Section title="Giám sát sơ tán nhân dân" right={<span className="text-xs font-mono font-semibold text-ink">{int(totDone)}/{int(totPlanned)} hộ</span>}>
      <div className="flex flex-col gap-3">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase text-muted">
            Tiến độ di dời theo xã (thấp nhất trước)
            {canUpdate && (
              <button className="normal-case text-accent hover:underline" onClick={() => setEditing('new')}>+ Cập nhật xã</button>
            )}
          </div>
          <div className="flex max-h-48 flex-col gap-2 overflow-y-auto pr-1 scroll-thin">
            {data.progress.map((r) => <EvacuationRow key={r.code} r={r} onEdit={setEditing} />)}
            {!data.progress.length && <Empty>Chưa có xã nào báo tiến độ sơ tán</Empty>}
          </div>
        </div>

        {editing && <EvacuationModal row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
        {site && <OccupancyModal site={site} onClose={() => setSite(null)} />}

        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase text-muted">Sức chứa các điểm sơ tán</div>
          <div className="flex max-h-48 flex-col gap-2 overflow-y-auto pr-1 scroll-thin">
            {data.sites.map((s) => <SiteRow key={s.id} s={s} onEdit={setSite} />)}
            {!data.sites.length && <Empty>Chưa có điểm sơ tán trong phạm vi</Empty>}
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
  const [linkFor, setLinkFor] = useState(null);
  const [cancelFor, setCancelFor] = useState(null);
  const [editFor, setEditFor] = useState(null);
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
  const overdue = tickets.filter((t) => slaState(t, now)?.breached).length;

  return (
    <div className="flex flex-col gap-3.5 p-3.5 sm:p-5">
      {/* Tiêu đề & Cảnh báo SLA */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink flex items-center gap-2">
            <span>Trung tâm Điều hành Cứu hộ Khẩn cấp</span>
          </h1>
          <p className="text-xs text-muted mt-0.5">
            Kéo thả phiếu giữa các cột hoặc chọn “Chuyển trạng thái” trên thẻ · Chuẩn SLA chờ xử lý / chờ điều động: Cấp 1 &lt; 3′,
            Cấp 2 &lt; 15′, Cấp 3 &lt; 60′
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
        <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => (
            <div
              key={col.key}
              onDragOver={(e) => { e.preventDefault(); setOver(col.key); }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); move(e.dataTransfer.getData('text/plain'), col.key); }}
              className={clsx(
                'card flex max-h-[calc(100vh-11rem)] min-h-[360px] flex-col border-t-4 transition-all print:max-h-none print:min-h-0',
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

              <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-2.5 scroll-thin print:overflow-visible">
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
                      onArrived={onArrived}
                      onLink={setLinkFor}
                      onCancel={setCancelFor}
                      onEdit={setEditFor}
                      onMove={(x, status) => move(x.id, status)}
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
      {linkFor && <MissionLinkModal ticket={linkFor} onClose={() => setLinkFor(null)} />}
      {cancelFor && <CancelDispatchModal ticket={cancelFor} onClose={() => setCancelFor(null)} />}
      {editFor && <EditTicketModal ticket={editFor} onClose={() => setEditFor(null)} />}
    </div>
  );
}
