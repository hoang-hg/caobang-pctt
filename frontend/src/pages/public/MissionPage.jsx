import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  AlertTriangle, CheckCircle2, Clock, Copy, LifeBuoy, Loader2, MapPin, Navigation, Phone, RefreshCw, Send,
  ShieldAlert, Siren, Truck, Users,
} from 'lucide-react';
import { useStore } from '../../app/store';
import { FIELD_REPORT, PRIORITY, VEHICLE, VULNERABLE } from '../../utils/labels';
import { dateTime, time } from '../../utils/format';

/** Mã nhiệm vụ nằm sau dấu # của đường dẫn: trình duyệt không gửi phần này lên máy chủ (không vào nhật ký truy cập,
 * không lọt qua Referer khi bấm sang Google Maps) — trang đọc mã rồi gửi trong header X-Mission-Token. */
const readToken = () => {
  try {
    return decodeURIComponent(window.location.hash.slice(1)).trim();
  } catch {
    return '';
  }
};

class MissionError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Không dùng api() chung: không gửi token đăng nhập (trang dành cho đội không có tài khoản), cần header riêng. */
async function call(token, body) {
  let res;
  try {
    res = await fetch(body ? '/api/v1/mission/report' : '/api/v1/mission', {
      method: body ? 'POST' : 'GET',
      headers: { 'X-Mission-Token': token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new MissionError(0, 'Mất kết nối mạng');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = typeof data?.detail === 'string' ? data.detail : res.status === 422 ? 'Thông tin chưa hợp lệ — kiểm tra lại' : `Lỗi máy chủ (${res.status})`;
    throw new MissionError(res.status, detail);
  }
  return data;
}

const ENDED = [404, 410];

// Bản lưu trên chính điện thoại trưởng nhóm: vùng sóng yếu, trình duyệt trong Zalo hay tải lại trang sau khi chuyển sang
// Google Maps → mất sóng lúc đó vẫn xem được điểm SOS, SĐT người báo. Xoá khi link đóng; bản quá hạn link bị bỏ.
const STORE_KEY = 'pctt_missions';
function loadSaved() {
  try {
    const all = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    const now = Date.now();
    return Object.fromEntries(Object.entries(all).filter(([, v]) => new Date(v?.data?.expires_at).getTime() > now));
  } catch {
    return {};
  }
}
function saveMission(token, data) {
  try {
    const all = loadSaved();
    if (data) all[token] = { savedAt: Date.now(), data };
    else delete all[token];
    localStorage.setItem(STORE_KEY, JSON.stringify(all));
  } catch {
    /* trình duyệt chặn lưu trữ: chỉ mất bản dự phòng khi mất sóng */
  }
}

async function fetchMission(token) {
  try {
    const data = await call(token);
    saveMission(token, data);
    return data;
  } catch (e) {
    if (ENDED.includes(e.status)) saveMission(token, null);
    throw e;
  }
}
const KIND_TONE = { arrived: 'text-accent', rescued: 'text-good', need_support: 'text-danger' };

function Screen({ children }) {
  return (
    <div className="h-full overflow-y-auto scroll-thin">
      <main className="mx-auto flex max-w-xl flex-col gap-3 p-3 pb-10 sm:p-5">{children}</main>
    </div>
  );
}

function Notice({ icon: Icon, tone, title, children }) {
  return (
    <Screen>
      <div className="card mt-8 flex flex-col items-center gap-2 p-6 text-center">
        <Icon size={36} className={tone} />
        <h1 className="text-lg font-bold text-ink">{title}</h1>
        <div className="text-sm text-ink-2">{children}</div>
      </div>
    </Screen>
  );
}

/** Link nhiệm vụ cho trưởng nhóm hiện trường (không đăng nhập, không lấy vị trí): xem điểm SOS, chỉ đường, gọi người
 * báo tin, báo "đã đến" / "đã cứu an toàn" / "cần chi viện" về trung tâm (app/api/v1/mission.py). */
export default function MissionPage() {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const [token, setToken] = useState(readToken);
  const [form, setForm] = useState(null); // null | 'rescued' | 'need_support'
  const [people, setPeople] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState('');

  useEffect(() => {
    document.title = 'Nhiệm vụ cứu hộ – PCTT Cao Bằng';
    const onHash = () => setToken(readToken());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const saved = useMemo(() => (token ? loadSaved()[token] : undefined), [token]);
  const { data: m, error, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['mission', token],
    queryFn: () => fetchMission(token),
    enabled: !!token,
    initialData: saved?.data,
    initialDataUpdatedAt: saved?.savedAt,
    staleTime: 0, // bản lưu chỉ để xem tạm — mở trang là hỏi máy chủ ngay (mặc định toàn app: 15 giây)
    refetchOnWindowFocus: true, // quay lại từ Google Maps / cuộc gọi → cập nhật ngay
    // Tự làm mới: trực ban có thể đã xác nhận hoàn thành, vùng nguy hiểm mới trên tuyến. Link đã đóng → thôi hỏi
    refetchInterval: (q) => (ENDED.includes(q.state.error?.status) ? false : 30_000),
    retry: (n, e) => (e.status === 0 || e.status >= 500) && n < 2,
  });

  if (!token) {
    return (
      <Notice icon={ShieldAlert} tone="text-warn" title="Thiếu mã nhiệm vụ">
        Mở đúng đường dẫn trực ban gửi qua Zalo / SMS (gồm cả phần sau dấu #).
      </Notice>
    );
  }
  if (error && ENDED.includes(error.status)) {
    return error.status === 410 ? (
      <Notice icon={CheckCircle2} tone="text-good" title="Link nhiệm vụ đã đóng">{error.message}</Notice>
    ) : (
      <Notice icon={ShieldAlert} tone="text-danger" title="Link không dùng được">{error.message}</Notice>
    );
  }
  if (isLoading) {
    return <Notice icon={Loader2} tone="animate-spin text-accent" title="Đang tải nhiệm vụ…" />;
  }
  if (!m) {
    return (
      <Notice icon={AlertTriangle} tone="text-warn" title="Chưa tải được nhiệm vụ">
        <p>{error?.message || 'Lỗi không xác định'} — kiểm tra sóng điện thoại rồi thử lại.</p>
        <button type="button" className="btn-primary mt-3" onClick={() => refetch()}><RefreshCw size={15} /> Thử lại</button>
      </Notice>
    );
  }

  const pr = PRIORITY[m.priority] || PRIORITY[2];
  const arrived = m.status === 'da_den';
  const coords = `${m.lat.toFixed(5)}, ${m.lon.toFixed(5)}`;
  const maps = `https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lon}&travelmode=driving`;
  const danger = m.hazards.length > 0 || m.warnings.length > 0 || !m.route_safe;

  const copy = (text, what) => {
    if (!navigator.clipboard) {
      toast({ tone: 'danger', title: 'Không sao chép được — chép tay' });
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => toast({ tone: 'good', title: `Đã sao chép ${what}` }),
      () => toast({ tone: 'danger', title: 'Không sao chép được — chép tay' }),
    );
  };

  const toggle = (kind) => {
    setForm((f) => (f === kind ? null : kind));
    setNote('');
    setPeople('');
    setSendError('');
  };

  const send = async (body) => {
    setBusy(true);
    setSendError('');
    try {
      const res = await call(token, body);
      qc.setQueryData(['mission', token], res);
      saveMission(token, res);
      setForm(null);
      setNote('');
      setPeople('');
      toast({ tone: 'good', title: 'Đã gửi về trung tâm', body: FIELD_REPORT[body.kind] });
    } catch (e) {
      if (ENDED.includes(e.status)) {
        saveMission(token, null);
        refetch();
      }
      setSendError(e.status === 0
        ? 'Chưa gửi được: mất kết nối mạng. Bấm gửi lại khi có sóng, hoặc gọi điện báo trực ban.'
        : e.message);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    send(form === 'rescued'
      ? { kind: 'rescued', people_safe: Number(people), note: note.trim() || null }
      : { kind: 'need_support', note: note.trim() });
  };

  return (
    <Screen>
      <header className="card overflow-hidden">
        <div className="flex items-center gap-2 bg-danger px-4 py-2.5 text-white">
          <Siren size={18} />
          <b className="text-sm uppercase tracking-wide">Lệnh cứu hộ khẩn</b>
          <span className="ml-auto font-mono text-sm font-bold">{m.code}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
          <span className={clsx('chip', pr.cls)}>{pr.label}</span>
          <span className={clsx('chip', arrived ? 'bg-good/15 text-good' : 'bg-warn/15 text-warn')}>
            {arrived ? `Đã đến lúc ${time(m.arrived_at)}` : `Đang di chuyển · dự kiến tới ${time(m.eta)}`}
          </span>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-warn bg-warn/10 p-2 text-sm text-ink">
          Mất kết nối — đang hiện thông tin lúc {time(dataUpdatedAt)}. Có sóng trở lại trang tự cập nhật.
        </div>
      )}

      <section className="card p-4">
        <div className="text-lg font-bold text-ink">
          {m.incident_label} · <span className="text-danger">{m.trapped_count} người</span>
        </div>
        {!!m.vulnerable?.length && (
          <div className="mt-1 flex flex-wrap gap-1">
            {m.vulnerable.map((v) => <span key={v} className="chip bg-danger/15 text-danger">{VULNERABLE[v] || v}</span>)}
          </div>
        )}
        <div className="mt-2 flex items-start gap-1.5 text-sm text-ink-2">
          <MapPin size={15} className="mt-0.5 shrink-0 text-accent" />
          <span className="min-w-0">{m.address || m.admin_name}{m.address && m.admin_name ? ` (${m.admin_name})` : ''}</span>
        </div>
        {m.raw_message && <p className="mt-2 rounded-lg bg-panel2 p-2 text-sm italic text-ink-2 [overflow-wrap:anywhere]">“{m.raw_message}”</p>}
        <div className="mt-2 text-xs text-muted">Nhận tin lúc {dateTime(m.received_at)}</div>
      </section>

      <section className="card flex flex-col gap-2 p-4">
        <a className="btn-primary w-full py-3 text-base" href={maps} target="_blank" rel="noopener noreferrer">
          <Navigation size={18} /> Chỉ đường tới điểm SOS
        </a>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">Toạ độ</span>
          <b className="font-mono">{coords}</b>
          <button type="button" className="btn-ghost ml-auto shrink-0 px-2 py-1 text-xs" onClick={() => copy(coords, 'toạ độ')}>
            <Copy size={13} /> Sao chép
          </button>
        </div>
        {danger ? (
          <div className="rounded-lg border-2 border-danger/60 bg-danger/5 p-3 text-sm">
            <div className="flex items-center gap-1.5 font-semibold text-danger"><AlertTriangle size={15} /> Nguy hiểm trên lộ trình đề xuất</div>
            <ul className="ml-4 mt-1 list-disc space-y-0.5 text-ink-2">
              {m.hazards.map((h) => <li key={h}>Vùng nguy hiểm: {h}</li>)}
              {m.warnings.map((w) => <li key={w}>{w}</li>)}
              {!m.hazards.length && !m.route_safe && <li>Lúc phát lệnh, lộ trình buộc đi qua vùng nguy hiểm</li>}
            </ul>
            <p className="mt-1.5 text-xs text-muted">
              Google Maps không biết vùng sạt lở, ngập lụt — đối chiếu các điểm trên, hỏi người dân địa phương trước khi qua
              ngầm tràn, đường đèo.
            </p>
          </div>
        ) : (
          <p className="text-xs text-good">
            Chưa ghi nhận vùng nguy hiểm trên lộ trình đề xuất{m.distance_km ? ` (${m.distance_km} km)` : ''}. Vẫn quan sát kỹ khi di chuyển.
          </p>
        )}
      </section>

      <section className="card flex flex-col gap-2 p-4">
        <h2 className="card-title"><Users size={14} /> Báo cáo về trung tâm</h2>
        {arrived ? (
          <div className="flex items-center gap-1.5 rounded-lg bg-good/10 p-2.5 text-sm font-medium text-good">
            <CheckCircle2 size={16} /> Đã báo đến hiện trường lúc {time(m.arrived_at)}
          </div>
        ) : (
          <button type="button" className="btn-primary w-full py-3 text-base" disabled={busy} onClick={() => send({ kind: 'arrived' })}>
            {busy && !form ? <Loader2 size={18} className="animate-spin" /> : <MapPin size={18} />} Đã đến hiện trường
          </button>
        )}
        <button type="button" className={clsx('w-full py-3 text-base', form === 'rescued' ? 'btn-soft' : 'btn-good')} disabled={busy} onClick={() => toggle('rescued')}>
          <CheckCircle2 size={18} /> Đã cứu an toàn
        </button>
        {form === 'rescued' && (
          <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg border border-good/50 bg-good/5 p-3 text-sm">
            <label className="flex flex-col gap-1">
              Số người đã đưa tới nơi an toàn
              <input
                className="input text-base"
                type="number"
                inputMode="numeric"
                min={0}
                max={10000}
                required
                autoFocus
                value={people}
                onChange={(e) => setPeople(e.target.value)}
              />
              <span className="text-xs text-muted">Tin báo ban đầu: {m.trapped_count} người mắc kẹt. Không tìm thấy ai: ghi 0 và ghi chú.</span>
            </label>
            <label className="flex flex-col gap-1">
              Ghi chú (nếu có)
              <textarea className="input" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: 1 người bị thương đã chuyển trạm y tế xã" />
            </label>
            <p className="text-xs text-muted">Phiếu chỉ đóng khi trực ban xác nhận — trực ban có thể gọi lại hỏi thêm.</p>
            <button className="btn-good py-2.5" disabled={busy || people === ''}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Gửi báo cáo đã cứu
            </button>
          </form>
        )}
        <button type="button" className={clsx('w-full py-3 text-base', form === 'need_support' ? 'btn-soft' : 'btn-danger')} disabled={busy} onClick={() => toggle('need_support')}>
          <LifeBuoy size={18} /> Cần chi viện
        </button>
        {form === 'need_support' && (
          <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg border border-danger/50 bg-danger/5 p-3 text-sm">
            <label className="flex flex-col gap-1">
              Cần chi viện gì?
              <textarea
                className="input text-base"
                rows={3}
                maxLength={500}
                required
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="VD: thêm 1 xuồng và cáng; có người bị thương nặng; nước xiết không tiếp cận được"
              />
            </label>
            <button className="btn-danger py-2.5" disabled={busy || note.trim().length < 3}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Gửi yêu cầu chi viện
            </button>
          </form>
        )}
        {sendError && <p className="rounded-lg border border-danger/50 bg-danger/5 p-2 text-sm text-danger">{sendError}</p>}
      </section>

      <section className="card flex flex-col gap-2 p-4">
        <h2 className="card-title"><Phone size={14} /> Liên lạc</h2>
        {m.reporter_phone ? (
          <a className="btn-good w-full justify-start gap-3 px-4 py-2.5 text-left" href={`tel:${m.reporter_phone.replace(/\s/g, '')}`}>
            <Phone size={20} className="shrink-0" />
            <span className="min-w-0">
              <span className="block text-xs font-normal">Gọi người báo tin{m.reporter_name ? ` · ${m.reporter_name}` : ''}</span>
              <b className="font-mono text-base">{m.reporter_phone}</b>
            </span>
          </a>
        ) : (
          <p className="text-sm text-muted">Người báo tin không để lại số điện thoại.</p>
        )}
        {m.hotlines.map((h) => (
          <a key={h.phone} className="btn-ghost w-full justify-between gap-3 py-2" href={`tel:${h.phone.replace(/\s/g, '')}`}>
            <span className="min-w-0 truncate">{h.org}</span>
            <b className="shrink-0 font-mono">{h.phone}</b>
          </a>
        ))}
      </section>

      <section className="card p-4 text-sm">
        <h2 className="card-title"><Truck size={14} /> Lực lượng được điều động</h2>
        <div className="mt-1 font-semibold text-ink">{m.force_name}</div>
        <div className="text-ink-2">
          {m.personnel} người
          {m.vehicles.length > 0 && ` · ${m.vehicles.map((v) => `${VEHICLE[v.vehicle_type] || v.vehicle_type} ${v.code}`).join(', ')}`}
        </div>
        {m.supplies.length > 0 && (
          <div className="mt-1 text-ink-2">
            Vật tư: {m.supplies.map((s) => `${s.name} ${s.quantity}${s.unit ? ` ${s.unit}` : ''}`).join(', ')}
            {m.warehouse_name && ` (xuất từ ${m.warehouse_name})`}
          </div>
        )}
        <div className="mt-1 text-xs text-muted">
          Phát lệnh {dateTime(m.dispatched_at)}{m.dispatched_by ? ` — ${m.dispatched_by}` : ''}{m.distance_km ? ` · ${m.distance_km} km` : ''}
        </div>
      </section>

      {m.reports.length > 0 && (
        <section className="card p-4 text-sm">
          <h2 className="card-title"><Clock size={14} /> Đã báo</h2>
          <ul className="mt-1 flex flex-col gap-1.5">
            {m.reports.map((r) => (
              <li key={`${r.created_at}-${r.kind}`} className="flex gap-2">
                <span className="w-12 shrink-0 font-mono text-xs leading-5 text-muted">{time(r.created_at)}</span>
                <span className="min-w-0">
                  <b className={KIND_TONE[r.kind]}>{FIELD_REPORT[r.kind] || r.kind}</b>
                  {r.kind === 'rescued' && ` — ${r.people_safe} người`}
                  {r.via === 'staff' && <span className="text-muted"> (trực ban ghi)</span>}
                  {r.note && <span className="block text-ink-2 [overflow-wrap:anywhere]">{r.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="flex flex-col items-center gap-2 px-1 text-center text-xs text-muted">
        <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} /> Cập nhật lúc {time(dataUpdatedAt)}
        </button>
        <p>
          Link chỉ dành cho đội được điều động — không chuyển tiếp. Hết hiệu lực lúc {dateTime(m.expires_at)} hoặc khi trực
          ban xác nhận hoàn thành. Trang không lấy vị trí điện thoại của bạn; thông tin nhiệm vụ lưu tạm trên máy để xem
          khi mất sóng, tự xoá khi link đóng.
        </p>
      </footer>
    </Screen>
  );
}
