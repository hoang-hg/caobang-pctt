import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Megaphone, ShieldCheck, Send, Users, Phone, PhoneCall, ChevronRight, ChevronDown, Radio, KeyRound, XCircle, History, BookUser, Bot, MapPinned,
  TimerReset, BellOff,
} from 'lucide-react';
import { api } from '../api/client';
import { usePresets, useUnits } from '../api/hooks';
import { useStore } from '../app/store';
import { Empty, Modal, Section, Tabs } from '../components/common/ui';
import { ALERT_VALID_HOURS, CHANNEL, LEVEL, broadcastStatus, notIntegrated } from '../utils/labels';
import { useAllowedCodes, usePermission } from '../rbac/usePermission';
import { dateTime, int, pct, time } from '../utils/format';

const PARAM_LABEL = {
  ten_ho: 'Tên hồ chứa', luu_luong: 'Lưu lượng xả (m³/s)', thoi_gian: 'Thời gian', song: 'Sông', dia_diem: 'Địa điểm',
  luong_mua: 'Lượng mưa (mm)', diem_so_tan: 'Điểm sơ tán', ten_suoi: 'Tên suối', so_gio: 'Số giờ', tram: 'Trạm đo',
  muc_nuoc: 'Mực nước (m)', cap_bao_dong: 'Cấp báo động', nguy_co: 'Nguy cơ', ten_bao: 'Tên bão/ATNĐ',
};
const SEV_CLS = { do: LEVEL.do.cls, cam: LEVEL.cam.cls, vang: LEVEL.vang.cls }; // thang màu rủi ro chung (utils/risk.js)

function Composer() {
  const qc = useQueryClient();
  const { auth, toast, alertDraft, setAlertDraft } = useStore();
  const { data: templates = [] } = useQuery({ queryKey: ['templates'], queryFn: () => api('/alerts/templates'), staleTime: Infinity });
  const { data: allUnits = [] } = useUnits();
  const { data: allPresets = [] } = usePresets();
  // Chỉ soạn được cho xã trong phạm vi alert.create
  const allowed = useAllowedCodes('alert', 'create');
  const units = allowed ? allUnits.filter((u) => allowed.includes(u.code)) : allUnits;
  const presets = allowed
    ? allPresets.filter((p) => p.unit_codes.every((c) => allowed.includes(c)))
    : allPresets;
  const [tpl, setTpl] = useState('');
  const [params, setParams] = useState({});
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [severity, setSeverity] = useState('cam');
  const [validHours, setValidHours] = useState(48); // hết hạn → thôi hiện cho người dân; gia hạn / kết thúc sớm được
  const [codes, setCodes] = useState([]);
  const [channels, setChannels] = useState(['SMS', 'CELL_BROADCAST', 'ZALO_OA', 'LOA']);
  const [audience, setAudience] = useState(null);
  const polygon = alertDraft?.polygon || null;

  const template = templates.find((t) => t.code === tpl);
  useEffect(() => {
    if (!template) return;
    let b = template.body;
    for (const p of template.params) b = b.replaceAll(`{${p}}`, params[p] || `{${p}}`);
    setBody(b);
    setSeverity(template.severity);
    if (!title) setTitle(template.name);
  }, [template, params]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!polygon && !codes.length) {
      setAudience(null);
      return;
    }
    api('/alerts/audience', { method: 'POST', body: { admin_codes: codes, polygon } }).then(setAudience).catch(() => setAudience(null));
  }, [codes, polygon]);

  // "Soạn lại từ lệnh này" (lệnh bị từ chối): điền lại nội dung, sửa theo lý do rồi gửi lại
  useEffect(() => {
    const p = alertDraft?.prefill;
    if (!p) return;
    setTpl('');
    setParams({});
    setTitle(p.title);
    setBody(p.body);
    setSeverity(p.severity);
    setChannels(p.channels);
    setValidHours(p.validHours);
    setCodes(p.codes);
    setAlertDraft(null);
  }, [alertDraft, setAlertDraft]);

  const unfilled = template?.params.filter((p) => !params[p]) || [];
  const [sending, setSending] = useState(false); // bấm đúp → 2 lệnh cảnh báo trùng chờ duyệt
  const submit = async () => {
    setSending(true);
    try {
      const res = await api('/alerts/broadcasts', {
        method: 'POST',
        body: { title, message_body: body, template_code: tpl || null, severity, admin_codes: codes, polygon, channels, valid_hours: validHours },
      });
      toast({ tone: 'good', title: `Đã gửi lệnh ${res.code} chờ Lãnh đạo phê duyệt` });
      qc.invalidateQueries({ queryKey: ['broadcasts'] });
      setAlertDraft(null);
      setTpl('');
      setParams({});
      setTitle('');
      setBody('');
      setCodes([]);
    } catch (e) {
      toast({ tone: 'danger', title: 'Không gửi được', body: e.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <Section title="Soạn lệnh cảnh báo (Maker)" right={<Megaphone size={16} className="text-accent" />}>
      <div className="flex flex-col gap-2 text-sm">
        <label>
          Mẫu tin dựng sẵn
          <select className="input mt-1" value={tpl} onChange={(e) => { setTpl(e.target.value); setParams({}); setTitle(''); }}>
            <option value="">— Tự soạn —</option>
            {templates.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
          </select>
        </label>
        {template && (
          <div className="grid grid-cols-2 gap-2">
            {template.params.map((p) => (
              <input key={p} className="input" placeholder={PARAM_LABEL[p] || p} value={params[p] || ''} onChange={(e) => setParams((x) => ({ ...x, [p]: e.target.value }))} />
            ))}
          </div>
        )}
        <input className="input" placeholder="Tiêu đề lệnh" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="input min-h-[110px]" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Nội dung tin nhắn" />
        <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-muted">
          <span>{body.length} ký tự · {Math.max(1, Math.ceil(body.length / 70))} SMS (Unicode)</span>
          <span className="flex flex-wrap gap-1">
            {['do', 'cam', 'vang'].map((s) => (
              <button key={s} className={clsx('chip', severity === s ? SEV_CLS[s] : 'bg-panel2')} onClick={() => setSeverity(s)}>{LEVEL[s].label}</button>
            ))}
          </span>
        </div>

        <div>
          <div className="mb-1 font-medium">Vùng nhận cảnh báo</div>
          {polygon ? (
            <div className="flex items-center gap-2 rounded-lg border border-accent/50 bg-accent/10 p-2 text-xs">
              <MapPinned size={16} className="text-accent" /> Vùng khoanh từ bản đồ giám sát ({alertDraft.stats?.area_km2} km²)
              <button className="ml-auto text-danger" onClick={() => setAlertDraft(null)}>Bỏ</button>
            </div>
          ) : (
            <>
              <div className="mb-1 flex flex-wrap gap-1">
                {presets.filter((p) => p.kind === 'luu_vuc').map((p) => (
                  <button key={p.code} className="chip bg-panel2 hover:bg-accent/15" onClick={() => setCodes(p.unit_codes)}>{p.name}</button>
                ))}
              </div>
              <select
                multiple
                className="input h-28"
                value={codes}
                onChange={(e) => setCodes(Array.from(e.target.selectedOptions).map((o) => o.value))}
                aria-label="Chọn xã/phường"
              >
                {/* 56 xã/phường hiện hành, xếp theo tên — không kèm địa bàn huyện cũ */}
                {[...units].sort((a, b) => a.name.localeCompare(b.name, 'vi')).map((u) => (
                  <option key={u.code} value={u.code}>{u.unit_type === 'phuong' ? 'Phường' : 'Xã'} {u.name}</option>
                ))}
              </select>
              <div className="text-[11px] text-muted">Giữ Ctrl để chọn nhiều xã. Hoặc vẽ vùng trên Bản đồ giám sát.</div>
            </>
          )}
        </div>

        <label className="flex flex-wrap items-center gap-2">
          <span className="font-medium">Hiệu lực</span>
          <select className="input w-auto py-1" value={validHours} onChange={(e) => setValidHours(Number(e.target.value))} aria-label="Thời hạn hiệu lực">
            {ALERT_VALID_HOURS.map(([h, label]) => <option key={h} value={h}>{label} kể từ khi duyệt</option>)}
          </select>
          <span className="text-[11px] text-muted">Hết hạn thì thôi hiện cho người dân; còn nguy hiểm thì gia hạn, hết sớm thì kết thúc.</span>
        </label>

        <div>
          <div className="mb-1 font-medium">Kênh phát</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CHANNEL).map(([k, v]) => (
              <label key={k} className={clsx('chip cursor-pointer px-2.5 py-1', channels.includes(k) ? 'bg-accent text-white' : 'bg-panel2')}>
                <input type="checkbox" className="hidden" checked={channels.includes(k)} onChange={(e) => setChannels((c) => (e.target.checked ? [...c, k] : c.filter((x) => x !== k)))} />
                {v}
              </label>
            ))}
          </div>
        </div>

        {audience && (
          <div className="grid grid-cols-3 gap-2 rounded-lg bg-panel2 p-2 text-center text-xs">
            <div><div className="font-mono text-base font-semibold">{int(audience.households)}</div>hộ dân</div>
            <div><div className="font-mono text-base font-semibold">{int(audience.subscribers)}</div>thuê bao</div>
            <div><div className="font-mono text-base font-semibold">{int(audience.speakers)}</div>loa phường/xã</div>
          </div>
        )}
        {unfilled.length > 0 && <div className="text-xs text-warn">Chưa điền: {unfilled.map((p) => PARAM_LABEL[p]).join(', ')}</div>}
        <button className="btn-danger justify-center" disabled={sending || !auth || !title || body.length < 10 || !channels.length || (!codes.length && !polygon)} onClick={submit}>
          <Send size={15} /> Gửi Lãnh đạo phê duyệt
        </button>
        {!auth && <div className="text-xs text-danger">Đăng nhập (tài khoản Trực ban) để soạn lệnh.</div>}
      </div>
    </Section>
  );
}

function ApproveModal({ b, onClose }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const [pin, setPin] = useState('');
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState('approve');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      if (mode === 'approve') {
        const res = await api(`/alerts/broadcasts/${b.id}/approve`, { method: 'POST', body: { pin } });
        toast(notIntegrated(res)
          ? { tone: 'good', title: `Đã phê duyệt ${b.code} – đã công bố trên cổng công khai`, body: 'Kênh SMS / Zalo / Cell Broadcast chưa tích hợp: tin CHƯA gửi tới điện thoại người dân.' }
          : { tone: 'good', title: `Đã phê duyệt – bắt đầu phát ${b.code}` });
      } else {
        await api(`/alerts/broadcasts/${b.id}/reject`, { method: 'POST', body: { reason } });
        toast({ tone: 'info', title: `Đã từ chối ${b.code}` });
      }
      qc.invalidateQueries({ queryKey: ['broadcasts'] });
      onClose();
    } catch (e) {
      toast({ tone: 'danger', title: 'Không thực hiện được', body: e.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Phê duyệt lệnh ${b.code}`}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Đóng</button>
          {mode === 'approve'
            ? <button className="btn-danger" disabled={busy || pin.length < 4} onClick={run}><ShieldCheck size={15} /> Xác nhận phát lệnh</button>
            : <button className="btn-ghost text-danger" disabled={busy || reason.length < 3} onClick={run}><XCircle size={15} /> Từ chối</button>}
        </>
      }
    >
      <div className="mb-3 rounded-lg bg-panel2 p-3 text-sm">
        <div className="font-semibold">{b.title}</div>
        <p className="mt-1 whitespace-pre-wrap">{b.message_body}</p>
        <div className="mt-2 text-xs text-muted">
          Kênh: {b.channels.map((c) => CHANNEL[c]).join(', ')} · Vùng: {b.target_admin_codes.length} xã · {int(b.audience?.households)} hộ, {int(b.audience?.subscribers)} thuê bao
        </div>
        <div className="text-xs text-muted">Người soạn: {b.created_by_name || 'Hệ thống (tự động)'} · {dateTime(b.created_at)}</div>
      </div>
      <div className="mb-2 flex gap-2">
        <button className={clsx('chip px-3 py-1', mode === 'approve' ? 'bg-accent text-white' : 'bg-panel2')} onClick={() => setMode('approve')}>Phê duyệt</button>
        <button className={clsx('chip px-3 py-1', mode === 'reject' ? 'bg-danger text-white' : 'bg-panel2')} onClick={() => setMode('reject')}>Từ chối</button>
      </div>
      {mode === 'approve' ? (
        <label className="block text-sm">
          <span className="flex items-center gap-1"><KeyRound size={14} /> Mã PIN ký duyệt của bạn</span>
          <input type="password" inputMode="numeric" autoFocus className="input mt-1 w-40 font-mono tracking-widest" value={pin} onChange={(e) => setPin(e.target.value)} />
        </label>
      ) : (
        <input className="input" placeholder="Lý do từ chối" value={reason} onChange={(e) => setReason(e.target.value)} />
      )}
    </Modal>
  );
}

function Delivery({ b }) {
  const m = b.metrics || {};
  if (notIntegrated(b)) {
    return (
      <div className="rounded-lg border border-dashed border-warn/60 bg-warn/5 p-2 text-xs text-ink-2">
        <b className="text-ink">Chưa gửi tới điện thoại người dân.</b> Kênh {Object.keys(m).map((c) => CHANNEL[c]).join(', ')} chưa
        tích hợp cổng gửi tin — lệnh chỉ được công bố trên cổng công khai và bản nhẹ. Phát qua kênh chính thức (loa,
        nhà mạng, Zalo của tỉnh) theo quy trình hiện hành.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {Object.entries(m).map(([ch, v]) => (
        <div key={ch} className="text-xs">
          <div className="flex justify-between">
            <span className="font-medium">{CHANNEL[ch]}</span>
            <span className="font-mono text-muted">
              gửi {int(v.sent)}/{int(v.target)} · nhận {pct(v.delivered, v.target)}%{v.read != null ? ` · đã xem ${pct(v.read, v.target)}%` : ''}
            </span>
          </div>
          <div className="relative mt-0.5 h-2 overflow-hidden rounded-full bg-panel2">
            <div className="absolute inset-y-0 left-0 bg-accent/35" style={{ width: `${pct(v.sent, v.target)}%` }} />
            <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${pct(v.delivered, v.target)}%` }} />
            {v.read != null && <div className="absolute inset-y-0 left-0 bg-good" style={{ width: `${pct(v.read, v.target)}%` }} />}
          </div>
        </div>
      ))}
      <div className="flex gap-3 text-[11px] text-muted">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent/35" />Đã gửi</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent" />Đã nhận</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-good" />Đã xem (Zalo/App)</span>
      </div>
    </div>
  );
}

const SOON_MS = 2 * 3600e3; // lệnh còn dưới 2 giờ hiệu lực → nhắc gia hạn

function useNow(ms) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const leftText = (ms) => {
  const m = Math.max(0, Math.round(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)} giờ ${String(m % 60).padStart(2, '0')} phút` : `${m} phút`;
};

function BroadcastCard({ b, now, onManage }) {
  const left = Date.parse(b.valid_until) - now;
  const soon = b.active && left < SOON_MS;
  return (
    <div className={clsx('rounded-lg border p-2.5', soon ? 'border-warn bg-warn/5' : 'border-line')}>
      <div className="mb-1 flex items-center gap-2">
        <b className="text-sm">{b.code}</b>
        <span className={clsx('chip', broadcastStatus(b).cls)}>{broadcastStatus(b).label}</span>
        <span className="truncate text-xs">{b.title}</span>
        <span className="ml-auto whitespace-nowrap text-[11px] text-muted">{dateTime(b.sent_at || b.approved_at)}</span>
      </div>
      <div className="mb-1 text-[11px] text-muted">Duyệt: {b.approved_by_name} · Soạn: {b.created_by_name || 'Hệ thống'}</div>
      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px]">
        {b.ended_at ? (
          <span className="text-muted">
            Kết thúc {dateTime(b.ended_at)}{b.ended_by_name ? ` — ${b.ended_by_name}` : ''}{b.end_note ? `: ${b.end_note}` : ''}
          </span>
        ) : soon ? (
          <span className="font-semibold text-warn">
            <TimerReset size={12} className="mr-0.5 inline" />
            Hết hiệu lực lúc {time(b.valid_until)} (còn {leftText(left)}) — gia hạn nếu còn nguy hiểm
          </span>
        ) : b.active ? (
          <span className="font-medium text-ink-2">Hiệu lực đến {dateTime(b.valid_until)} · đang hiện cho người dân</span>
        ) : (
          <span className="text-muted">Hết hiệu lực từ {dateTime(b.valid_until)}</span>
        )}
        {b.can_manage && (
          <span className="ml-auto flex gap-1.5">
            <button className={clsx('px-2 py-0.5 text-[11px]', soon ? 'btn-primary' : 'btn-ghost')} onClick={() => onManage({ b, mode: 'extend' })}><TimerReset size={12} /> Gia hạn</button>
            <button className="btn-ghost px-2 py-0.5 text-[11px] text-danger" onClick={() => onManage({ b, mode: 'end' })}><BellOff size={12} /> Kết thúc</button>
          </span>
        )}
      </div>
      <Delivery b={b} />
    </div>
  );
}

/** Lệnh chờ duyệt — đứng đầu trang trên điện thoại (lãnh đạo duyệt bằng điện thoại không phải cuộn qua khung soạn); MỌI
 * lệnh đang hiệu lực (trước đây chỉ 6 lệnh mới nhất: lệnh sơ tán cũ hơn mất nút gia hạn / kết thúc); lệnh hết hiệu lực
 * gần đây; lệnh bị từ chối kèm lý do + "Soạn lại". `composer`: khung soạn (người có quyền soạn) — cột trái trên máy tính,
 * sau mục chờ duyệt trên điện thoại. */
function Broadcasts({ composer }) {
  const { data = [] } = useQuery({ queryKey: ['broadcasts'], queryFn: () => api('/alerts/broadcasts'), refetchInterval: 15_000 });
  const now = useNow(30_000);
  const toast = useStore((s) => s.toast);
  const setAlertDraft = useStore((s) => s.setAlertDraft);
  const me = useStore((s) => s.auth?.user?.id);
  const [approve, setApprove] = useState(null);
  const [manage, setManage] = useState(null); // { b, mode: 'extend' | 'end' }
  const pending = data.filter((b) => b.status === 'pending_approval');
  // Sắp hết hiệu lực lên đầu — lệnh cần gia hạn không bị lẫn giữa nhiều lệnh khác
  const live = data.filter((b) => b.active).sort((a, b) => Date.parse(a.valid_until) - Date.parse(b.valid_until));
  const past = data.filter((b) => (b.status === 'sending' || b.status === 'sent') && !b.active).slice(0, 4);
  const rejected = data.filter((b) => b.status === 'rejected' && now - Date.parse(b.approved_at) < 3 * 86400e3).slice(0, 5);
  const redraft = (b) => {
    setAlertDraft({
      prefill: { title: b.title, body: b.message_body, severity: b.severity, codes: b.target_admin_codes, channels: b.channels, validHours: b.valid_hours },
    });
    toast({ tone: 'info', title: `Đã điền lại nội dung lệnh ${b.code}`, body: 'Sửa theo lý do từ chối, kiểm tra vùng nhận rồi gửi lại' });
    document.getElementById('soan-canh-bao')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className={clsx('flex flex-col gap-3', composer && 'xl:grid xl:grid-cols-[420px_1fr] xl:items-start')}>
      {composer && <div id="soan-canh-bao" className="order-2 scroll-mt-16 xl:order-1">{composer}</div>}
      <div className={clsx('contents', composer && 'xl:order-2 xl:flex xl:flex-col xl:gap-3')}>
        <Section className="order-1" title={`Chờ phê duyệt (Checker) · ${pending.length}`} right={<ShieldCheck size={16} className="text-warn" />}>
          <div className="flex flex-col gap-2">
            {pending.map((b) => (
              <div key={b.id} className="rounded-lg border border-warn/50 bg-warn/5 p-2.5">
                <div className="flex items-center gap-2">
                  <b className="text-sm">{b.code}</b>
                  <span className={clsx('chip', SEV_CLS[b.severity])}>{LEVEL[b.severity]?.label}</span>
                  {b.auto_generated && <span className="chip bg-accent/15 text-accent"><Bot size={11} /> Tự động · {b.trigger_source}</span>}
                  <span className="ml-auto text-[11px] text-muted">{dateTime(b.created_at)}</span>
                </div>
                <div className="mt-1 text-sm font-medium">{b.title}</div>
                <p className="line-clamp-2 text-xs text-ink-2">{b.message_body}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                  <Users size={12} /> {int(b.audience?.households)} hộ · {b.channels.map((c) => CHANNEL[c]).join(', ')}
                  {b.can_approve ? (
                    <button className="btn-danger ml-auto px-2 py-1 text-xs" onClick={() => setApprove(b)}><ShieldCheck size={12} /> Phê duyệt</button>
                  ) : (
                    <span className="ml-auto italic">Chờ Lãnh đạo BCH xác nhận</span>
                  )}
                </div>
              </div>
            ))}
            {!pending.length && <Empty>Không có lệnh chờ duyệt</Empty>}
          </div>
        </Section>

        <Section
          className="order-3"
          title={`Đang hiệu lực · ${live.length} — giám sát chuyển giao`}
          right={<Radio size={16} className="text-accent" />}
        >
          <div className="flex flex-col gap-3">
            {live.map((b) => <BroadcastCard key={b.id} b={b} now={now} onManage={setManage} />)}
            {!live.length && <Empty>Không có cảnh báo đang hiệu lực</Empty>}
            {past.length > 0 && (
              <>
                <div className="mt-1 text-[11px] font-semibold uppercase text-muted">Đã kết thúc / hết hiệu lực gần đây</div>
                {past.map((b) => <BroadcastCard key={b.id} b={b} now={now} onManage={setManage} />)}
              </>
            )}
          </div>
        </Section>

        {rejected.length > 0 && (
          <Section className="order-4" title={`Bị từ chối gần đây · ${rejected.length}`} right={<XCircle size={16} className="text-danger" />}>
            <div className="flex flex-col gap-2">
              {rejected.map((b) => (
                <div key={b.id} className={clsx('rounded-lg border p-2.5', b.created_by === me ? 'border-danger/50 bg-danger/5' : 'border-line')}>
                  <div className="flex items-center gap-2">
                    <b className="text-sm">{b.code}</b>
                    <span className="truncate text-xs">{b.title}</span>
                    {b.created_by === me && <span className="chip bg-danger/15 text-danger">Lệnh bạn soạn</span>}
                    <span className="ml-auto whitespace-nowrap text-[11px] text-muted">{dateTime(b.approved_at)}</span>
                  </div>
                  <div className="mt-1 text-xs text-ink-2 [overflow-wrap:anywhere]">
                    <b>{b.approved_by_name || 'Lãnh đạo'}</b> từ chối: {b.rejected_reason}
                  </div>
                  {composer && (
                    <button className="btn-ghost mt-1.5 px-2 py-1 text-xs" onClick={() => redraft(b)}>
                      <Send size={12} /> Soạn lại từ lệnh này
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
      {approve && <ApproveModal b={approve} onClose={() => setApprove(null)} />}
      {manage && <ManageModal b={manage.b} mode={manage.mode} onClose={() => setManage(null)} />}
    </div>
  );
}

/** Gia hạn (thiên tai kéo dài) / kết thúc (hết nguy hiểm — ký PIN) một cảnh báo đang hiệu lực. */
function ManageModal({ b, mode, onClose }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const [hours, setHours] = useState(24);
  const [note, setNote] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const end = mode === 'end';
  const run = async () => {
    setBusy(true);
    try {
      await api(`/alerts/broadcasts/${b.id}/${end ? 'end' : 'extend'}`, { method: 'POST', body: end ? { pin, note: note.trim() } : { pin, hours } });
      toast({ tone: 'good', title: end ? `Đã kết thúc cảnh báo ${b.code}` : `Đã gia hạn cảnh báo ${b.code} thêm ${hours} giờ` });
      qc.invalidateQueries({ queryKey: ['broadcasts'] });
      onClose();
    } catch (e) {
      toast({ tone: 'danger', title: 'Không thực hiện được', body: e.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`${end ? 'Kết thúc' : 'Gia hạn'} cảnh báo – ${b.code}`}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className={end ? 'btn-danger' : 'btn-primary'} disabled={busy || pin.length < 4 || (end && note.trim().length < 3)} onClick={run}>
            {end ? <><BellOff size={15} /> Kết thúc cảnh báo</> : <><TimerReset size={15} /> Gia hạn</>}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <div className="rounded-lg bg-panel2 p-2.5">
          <b>{b.title}</b>
          <div className="text-xs text-muted">Đang hiệu lực đến {dateTime(b.valid_until)}</div>
        </div>
        {end ? (
          <>
            <p className="text-ink-2">Cảnh báo thôi hiện ngay trên cổng công khai, “Tôi đang ở đâu?”, bản nhẹ; danh sách cảnh báo của người dân ghi “đã kết thúc”.</p>
            <label className="flex flex-col gap-1">
              Lý do / thông báo kết thúc
              <input className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: Nước đã rút, dỡ bỏ lệnh sơ tán" />
            </label>
          </>
        ) : (
          <label className="flex flex-col gap-1">
            Gia hạn thêm (tính từ hạn hiện tại)
            <select className="input w-40" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              {ALERT_VALID_HOURS.map(([h, label]) => <option key={h} value={h}>{label}</option>)}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="flex items-center gap-1"><KeyRound size={14} /> Mã PIN ký duyệt của bạn</span>
          <input type="password" inputMode="numeric" className="input w-40 font-mono tracking-widest" value={pin} onChange={(e) => setPin(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}

function ContactNode({ n, depth, q }) {
  const [open, setOpen] = useState(depth === 0);
  const kids = n.children || [];
  const matches = (x) => !q || `${x.full_name} ${x.org} ${x.position}`.toLowerCase().includes(q.toLowerCase()) || (x.children || []).some(matches);
  if (!matches(n)) return null;
  const status = { truc: ['Đang trực', 'bg-good'], san_sang: ['Sẵn sàng', 'bg-accent'], vang: ['Vắng', 'bg-muted'] }[n.status];
  return (
    <div style={{ marginLeft: depth ? 14 : 0 }}>
      <div className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-panel2">
        {kids.length ? (
          <button onClick={() => setOpen((o) => !o)} className="text-muted" aria-label="Mở rộng">{open || q ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
        ) : <span className="w-3.5" />}
        <span className={clsx('h-2 w-2 shrink-0 rounded-full', status[1])} title={status[0]} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm"><b>{n.full_name}</b> <span className="text-xs text-muted">– {n.position}</span></div>
          <div className="truncate text-[11px] text-muted">{n.org}{n.radio_freq ? ` · 📻 ${n.radio_freq}` : ''}</div>
        </div>
        <a className="btn-ghost shrink-0 px-2 py-0.5 text-xs" href={`tel:${n.phone.replace(/\s/g, '')}`} title="Gọi qua tổng đài web (WebRTC/SIP)"><Phone size={12} /> {n.phone}</a>
      </div>
      {(open || q) && kids.map((c) => <ContactNode key={c.id} n={c} depth={depth + 1} q={q} />)}
    </div>
  );
}

function Hotline() {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const canContacts = usePermission('contact', 'view');
  const canHotline = usePermission('hotline', 'operate', '*');
  const { data: contacts = [] } = useQuery({ queryKey: ['contacts'], queryFn: () => api('/alerts/contacts'), staleTime: 5 * 60_000, enabled: canContacts });
  const { data: hot } = useQuery({ queryKey: ['hotline'], queryFn: () => api('/alerts/hotline'), refetchInterval: 30_000, enabled: canHotline });
  const [q, setQ] = useState('');
  const [caller, setCaller] = useState('0999 123 456');
  const [msg, setMsg] = useState('');
  const call = async (key) => {
    const r = await api('/alerts/ivr', { method: 'POST', body: { caller, key, message: msg || null } });
    toast({ tone: 'info', title: `Cuộc gọi phím ${key} → ${r.call.routed_to}`, body: r.ticket ? `Đã tạo phiếu ${r.ticket.code}` : 'Không kèm phiếu SOS' });
    setMsg('');
    qc.invalidateQueries({ queryKey: ['hotline'] });
  };
  return (
    <div className="grid gap-3 xl:grid-cols-[1fr_380px]">
      <Section title="Danh bạ phân cấp Tỉnh → Xã → Thôn" right={<BookUser size={16} className="text-accent" />}>
        <input className="input mb-2" placeholder="Tìm tên, chức vụ, đơn vị…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-[65vh] overflow-y-auto pr-1 scroll-thin">
          {contacts.map((n) => <ContactNode key={n.id} n={n} depth={0} q={q} />)}
        </div>
      </Section>
      <div className="flex flex-col gap-3">
        {canHotline ? (<>
        <Section title="Đường dây nóng">
          <div className="grid grid-cols-2 gap-2">
            {hot?.hotlines.map((h) => (
              <a key={h.number} href={`tel:${h.number}`} className="card flex items-center gap-2 p-2 hover:border-danger">
                <PhoneCall size={18} className="text-danger" />
                <div><div className="font-mono text-lg font-bold">{h.number}</div><div className="text-[11px] text-muted">{h.name}</div></div>
              </a>
            ))}
          </div>
        </Section>
        <Section title="Mô phỏng phân luồng cuộc gọi SOS (IVR)">
          <div className="flex flex-col gap-2 text-sm">
            <input className="input" value={caller} onChange={(e) => setCaller(e.target.value)} aria-label="Số gọi đến" />
            <input className="input" placeholder="Lời nhắn thoại (đã chuyển văn bản) – tuỳ chọn" value={msg} onChange={(e) => setMsg(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              {hot?.ivr.map((k) => (
                <button key={k.key} className="btn-ghost justify-start" onClick={() => call(k.key)}>
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-panel2 font-mono font-bold">{k.key}</span>
                  <span className="text-left text-xs">{k.label}<span className="block text-muted">→ {k.route}</span></span>
                </button>
              ))}
            </div>
          </div>
        </Section>
        <Section title="Cuộc gọi gần đây">
          <ul className="max-h-64 overflow-y-auto text-xs scroll-thin">
            {hot?.calls.map((c) => (
              <li key={c.id} className="flex gap-2 border-b border-line/60 py-1.5">
                <span className="font-mono text-muted">{dateTime(c.time)}</span>
                <span>{c.caller}</span>
                <span className="ml-auto text-right">
                  Phím {c.ivr_key} · {c.category}
                  <span className="block text-muted">{c.routed_to}</span>
                  {c.ticket_code && <span className="block font-semibold text-danger">→ phiếu {c.ticket_code}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Section>
        </>) : (
          <Section title="Đường dây nóng">
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[['112', 'Tìm kiếm cứu nạn'], ['114', 'Cứu nạn cứu hộ – PCCC'], ['115', 'Cấp cứu y tế'], ['113', 'Công an']].map(([n, l]) => (
                <a key={n} href={`tel:${n}`} className="card flex items-center gap-2 p-2"><PhoneCall size={18} className="text-danger" /><div><b className="font-mono text-lg">{n}</b><div className="text-[11px] text-muted">{l}</div></div></a>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">Vận hành tổng đài cần quyền “Vận hành tổng đài” (cấp toàn tỉnh).</p>
          </Section>
        )}
      </div>
    </div>
  );
}

const ACTION = {
  'broadcast.create': 'Soạn lệnh cảnh báo', 'broadcast.approve': 'Phê duyệt phát lệnh', 'broadcast.reject': 'Từ chối lệnh',
  'broadcast.approve_failed': 'Duyệt thất bại (sai PIN)',
  'broadcast.end': 'Kết thúc cảnh báo', 'broadcast.end_failed': 'Kết thúc cảnh báo thất bại (sai PIN)', 'broadcast.extend': 'Gia hạn cảnh báo',
  'broadcast.extend_failed': 'Gia hạn cảnh báo thất bại (sai PIN)',
  'dispatch.cancel': 'Huỷ lệnh điều động', 'broadcast.auto_draft': 'Tự sinh bản nháp cảnh báo', 'dispatch.create': 'Phát lệnh điều động',
  'sos.update': 'Cập nhật phiếu SOS', 'inventory.issue': 'Xuất kho', 'vehicle.status': 'Đổi trạng thái phương tiện',
};

function Audit() {
  const { data = [] } = useQuery({ queryKey: ['audit'], queryFn: () => api('/alerts/audit', { params: { limit: 200 } }) });
  return (
    <div className="card overflow-x-auto">
      <table className="table-base">
        <thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th><th>Chi tiết</th></tr></thead>
        <tbody>
          {data.map((a) => (
            <tr key={a.id}>
              <td className="whitespace-nowrap font-mono text-xs">{new Date(a.time).toLocaleString('vi-VN')}</td>
              <td>{a.actor_name}</td>
              <td>{ACTION[a.action] || a.action}</td>
              <td className="font-mono text-xs">{a.entity_id}</td>
              <td className="max-w-md truncate text-xs text-muted" title={JSON.stringify(a.details)}>{Object.entries(a.details || {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Alerts() {
  const [tab, setTab] = useState('broadcast');
  const auth = useStore((s) => s.auth);
  const alertDraft = useStore((s) => s.alertDraft);
  useEffect(() => {
    if (alertDraft) setTab('broadcast');
  }, [alertDraft]);
  const who = useMemo(
    () => (auth ? `${auth.user.full_name} · ${auth.user.assignments.map((a) => `${a.role_name} (${a.domain_label})`).join(', ')}` : ''),
    [auth],
  );
  const canAudit = usePermission('audit', 'view', '*');
  const canCreate = usePermission('alert', 'create');

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="text-lg font-bold">Cảnh báo khẩn cấp & Hotline</h1>
          <p className="text-xs text-muted">Phát tin đa kênh theo vùng · Cơ chế Maker–Checker (người soạn ≠ người duyệt, xác nhận bằng PIN) · Nhật ký pháp lý</p>
        </div>
        <span className="chip ml-auto bg-panel2 px-3 py-1">{who}</span>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'broadcast', label: 'Phát cảnh báo', icon: Megaphone },
          { value: 'hotline', label: 'Danh bạ & Tổng đài', icon: Phone },
          ...(canAudit ? [{ value: 'audit', label: 'Nhật ký pháp lý', icon: History }] : []),
        ]}
      />
      {tab === 'broadcast' && <Broadcasts composer={canCreate ? <Composer /> : null} />}
      {tab === 'hotline' && <Hotline />}
      {tab === 'audit' && canAudit && <Audit />}
    </div>
  );
}
