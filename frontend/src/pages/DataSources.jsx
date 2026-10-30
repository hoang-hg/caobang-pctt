import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Activity, CircleDashed, CloudSun, Copy, Cpu, KeyRound, Play, Plus, Power, Radio, Settings2, Trash2, Wifi, WifiOff,
} from 'lucide-react';
import { api } from '../api/client';
import { useStore } from '../app/store';
import { Confirm, Empty, EmptyState, ErrorState, Modal, Skeleton, Tabs } from '../components/common/ui';
import PageHeader from '../components/common/PageHeader';
import RoleTips from '../components/common/RoleTips';
import { PAGE } from '../components/layout/page';
import { usePermission } from '../rbac/usePermission';
import { STATION_TYPE } from '../utils/labels';
import { risk } from '../utils/risk';
import { ago, dateTime, int, time } from '../utils/format';

/**
 * Nguồn dữ liệu & thiết bị đo (thiết kế mục G — quan trắc). Mỗi nguồn / thiết bị MỘT câu trạng thái bằng lời ("Đang lấy số
 * liệu đều — lần cuối 12 phút trước", "Mất tín hiệu từ 03:10"); chi tiết kỹ thuật (mã, khoá, địa chỉ máy chủ, câu lệnh gửi
 * thử, cấu hình) giấu trong "Nâng cao". Thao tác khó quay lại (tắt nguồn, cấp khoá mới, xoá thiết bị) hỏi xác nhận nói rõ
 * hậu quả.
 */
const PULL = ['open_meteo', 'openweather', 'ige_truotlo'];
// Cổng đẩy ↔ giao thức của thiết bị gửi qua cổng đó
const PUSH_PROTOCOL = { http_ingest: 'http', mqtt: 'mqtt', chirpstack: 'lorawan' };
// Tên đời thường theo loại nguồn (tên trong hệ thống — thường có tên hãng, giao thức — nằm ở "Nâng cao")
const TYPE = {
  open_meteo: { name: 'Dự báo mưa quốc tế', label: 'Nhiều mô hình dự báo, hệ thống tự lấy', tech: 'Open-Meteo (ECMWF IFS, NOAA GEFS) · kéo theo chu kỳ', icon: CloudSun },
  openweather: { name: 'Dự báo thời tiết quốc tế', label: 'Hệ thống tự lấy', tech: 'OpenWeather · kéo theo chu kỳ', icon: CloudSun },
  ige_truotlo: { name: 'Trạm đo mưa của Viện Địa công nghệ và Môi trường', label: 'Mưa đo thật 10 phút / lần, hệ thống tự lấy', tech: 'API hệ thống Cảnh báo đa thiên tai (canhbaothientai.org.vn) · kéo theo chu kỳ', icon: CloudSun },
  http_ingest: { name: 'Cổng nhận số đo qua mạng di động', label: 'Thiết bị đo tự gửi lên qua 4G / NB-IoT', tech: 'HTTP · thiết bị đẩy lên', icon: Cpu },
  mqtt: { name: 'Cổng nhận số đo qua máy chủ tin nhắn', label: 'Thiết bị đo tự gửi lên qua máy chủ tin nhắn (MQTT)', tech: 'MQTT · thiết bị đẩy lên', icon: Radio },
  chirpstack: { name: 'Cổng nhận số đo từ thiết bị LoRa', label: 'Thiết bị đo gửi qua sóng vô tuyến tầm xa (LoRa)', tech: 'LoRaWAN webhook (ChirpStack / TTN) · đẩy lên', icon: Radio },
};
const nameOfSource = (s) => TYPE[s.type]?.name || s.name;
const PROTOCOL = {
  http: 'Mạng di động 4G / NB-IoT (HTTP)',
  mqtt: 'Máy chủ tin nhắn (MQTT)',
  lorawan: 'Sóng LoRa (LoRaWAN — ChirpStack / TTN)',
};
// Nguồn số đo của trạm quan trắc (monitoring_stations.source)
const STATION_SOURCE = { iot: 'số liệu thật từ thiết bị', simulator: 'số liệu mô phỏng', external: 'chờ lắp thiết bị (nhập từ tệp)' };

/** Giờ "từ lúc nào": hôm nay chỉ ghi giờ (03:10), ngày khác ghi kèm ngày. */
const since = (t) => (new Date(t).toDateString() === new Date().toDateString() ? time(t) : dateTime(t));
const every = (s) => (s >= 3600 ? `${Math.round(s / 3600)} giờ` : `${Math.round(s / 60)} phút`);

/** Câu trạng thái + mức (thang rủi ro chung: 0 ổn, 2 cần xử lý, 3 lỗi; null = chưa có / đã tắt) của một nguồn. */
function sourceState(s, devices) {
  if (!s.enabled) return { level: null, chip: 'Đã tắt', text: 'Đã tắt — hệ thống không nhận số liệu từ nguồn này.' };
  if (PULL.includes(s.type)) {
    if (s.status === 'ok') {
      const rows = s.stats?.rows != null ? ` (${int(s.stats.rows)} số liệu${s.stats.units ? ` cho ${s.stats.units} xã` : ''})` : '';
      return { level: 0, chip: 'Bình thường', text: `Đang lấy số liệu đều — lần cuối ${ago(s.last_success_at)}${rows}.` };
    }
    if (s.status === 'loi') {
      return {
        level: 3,
        chip: 'Lỗi',
        text: `Không lấy được số liệu${s.last_run_at ? ` lúc ${since(s.last_run_at)}` : ''} — ${s.last_success_at ? `lần lấy được gần nhất ${ago(s.last_success_at)}` : 'chưa lấy được lần nào'}.`,
      };
    }
    return { level: null, chip: 'Chưa chạy', text: 'Chưa lấy số liệu lần nào.' };
  }
  if (s.type === 'mqtt' && s.status === 'loi') return { level: 3, chip: 'Lỗi', text: 'Mất kết nối máy chủ tin nhắn — thiết bị gửi qua cổng này không vào được hệ thống.' };
  const mine = devices.filter((d) => d.enabled && d.protocol === PUSH_PROTOCOL[s.type]);
  const on = mine.filter((d) => d.status === 'truc_tuyen');
  const last = mine.map((d) => d.last_seen_at).filter(Boolean).sort().at(-1);
  if (!mine.length) return { level: null, chip: 'Chưa có thiết bị', text: 'Cổng đang mở — chưa có thiết bị nào đăng ký gửi qua cổng này.' };
  if (!on.length) return { level: 2, chip: 'Không có số đo', text: `${mine.length} thiết bị đăng ký nhưng không thiết bị nào đang gửi số đo${last ? ` — lần cuối ${ago(last)}` : ''}.` };
  return {
    level: on.length < mine.length ? 1 : 0,
    chip: 'Đang nhận',
    text: `${on.length}/${mine.length} thiết bị đang gửi số đo qua cổng này — lần cuối ${ago(last)}.`,
  };
}

/** Câu trạng thái một thiết bị: "Đang gửi số đo — lần cuối 2 phút trước" / "Mất tín hiệu từ 03:10". */
function deviceState(d) {
  if (!d.enabled) return { level: null, icon: Power, text: 'Đã tắt — không nhận số đo từ thiết bị này' };
  if (d.status === 'truc_tuyen') return { level: 0, icon: Wifi, text: `Đang gửi số đo — lần cuối ${ago(d.last_seen_at)}` };
  if (d.status === 'mat_tin_hieu') return { level: 2, icon: WifiOff, text: `Mất tín hiệu từ ${since(d.last_seen_at)} (${ago(d.last_seen_at)})` };
  return { level: null, icon: CircleDashed, text: 'Chưa gửi số đo lần nào' };
}

function useRun() {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  return async (fn, ok) => {
    try {
      const res = await fn();
      if (ok) toast({ tone: 'good', title: ok });
      ['int-sources', 'int-devices', 'int-monitor', 'forecast-areas', 'forecast-series', 'stations'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      return res ?? true;
    } catch (e) {
      toast({ tone: 'danger', title: 'Không thực hiện được', body: e.message, duration: 9000 });
      return null;
    }
  };
}

function CopyBox({ label, value }) {
  const toast = useStore((s) => s.toast);
  return (
    <div className="text-xs">
      <div className="mb-0.5 text-muted">{label}</div>
      <div className="flex items-start gap-2 rounded-lg bg-panel2 p-2 font-mono">
        <pre className="min-w-0 flex-1 whitespace-pre-wrap break-all">{value}</pre>
        <button type="button" className="touch-hit shrink-0 text-accent" title="Sao chép" aria-label={`Sao chép: ${label}`} onClick={() => { navigator.clipboard?.writeText(value); toast({ title: 'Đã sao chép' }); }}>
          <Copy size={14} />
        </button>
      </div>
    </div>
  );
}

/** Khối "Nâng cao" — chi tiết cho kỹ thuật viên, mặc định gập. */
function Advanced({ children, label = 'Nâng cao — dành cho kỹ thuật viên' }) {
  return (
    <details className="rounded-lg border border-line text-sm">
      <summary className="tap cursor-pointer px-3 py-2 font-medium text-ink-2">{label}</summary>
      <div className="flex flex-col gap-2 px-3 pb-3">{children}</div>
    </details>
  );
}

const Dot = ({ level }) => <span className={clsx('inline-block h-2.5 w-2.5 shrink-0 rounded-full', risk(level).fill)} aria-hidden="true" />;

function SourceModal({ source, onClose }) {
  const run = useRun();
  const [cfg, setCfg] = useState(JSON.stringify(source.config, null, 2));
  const [interval, setInterval] = useState(source.poll_interval_s || '');
  const [secret, setSecret] = useState('');
  const pull = PULL.includes(source.type);
  let parsed = null;
  try { parsed = JSON.parse(cfg); } catch { /* chưa hợp lệ */ }
  const save = async () => {
    const body = { config: parsed, ...(pull && interval ? { poll_interval_s: Number(interval) } : {}), ...(secret ? { secret } : {}) };
    if (await run(() => api(`/integrations/sources/${source.id}`, { method: 'PATCH', body }), 'Đã lưu cấu hình nguồn')) onClose();
  };
  return (
    <Modal open wide onClose={onClose} title={`Cấu hình – ${source.name}`}
      footer={<><button className="btn-ghost" onClick={onClose}>Huỷ</button><button className="btn-primary" disabled={!parsed} onClick={save}>Lưu</button></>}>
      <div className="grid gap-3 text-sm md:grid-cols-2">
        <label className="md:col-span-2">Cấu hình (JSON)
          <textarea className={clsx('input mt-1 min-h-[180px] font-mono text-xs', !parsed && 'ring-2 ring-danger')} value={cfg} onChange={(e) => setCfg(e.target.value)} />
        </label>
        {pull && (
          <label>Chu kỳ lấy số liệu (giây, ≥ 300)
            <input className="input mt-1" type="number" min={300} value={interval} onChange={(e) => setInterval(e.target.value)} />
          </label>
        )}
        {/* API trạm mưa của Viện là API công khai — không có khoá */}
        {pull && source.type !== 'ige_truotlo' && (
          <label>Khoá truy cập (API key) {source.has_secret && <span className="text-muted">(đang có: {source.secret_hint})</span>}
            <input className="input mt-1" type="password" placeholder={source.type === 'open_meteo' ? 'Tuỳ chọn — gói thương mại' : 'Bắt buộc'} value={secret} onChange={(e) => setSecret(e.target.value)} />
            {source.secret_from_env && (
              <span className="mt-1 block text-xs text-warn">Khoá đang đặt trong tệp .env của máy chủ — sửa ở đây sẽ bị ghi đè khi hệ thống khởi động lại.</span>
            )}
          </label>
        )}
      </div>
      {source.type === 'open_meteo' && (
        <p className="mt-2 text-xs text-muted">
          models: <code>ecmwf_ifs025</code> (ECMWF IFS 51 thành phần), <code>gfs025</code> (NOAA GEFS 31 thành phần) ·
          alert_24h_mm: ngưỡng mưa 24 giờ (khả năng cao nhất) để tự sinh nháp “Chuẩn bị sơ tán” · heavy_mm_h: ngưỡng tính xác suất
          mưa lớn. Gói miễn phí chỉ cho mục đích phi thương mại — cơ quan triển khai chính thức nên mua gói có khoá truy cập.
        </p>
      )}
      {source.type === 'openweather' && <p className="mt-2 text-xs text-muted">targets: <code>rain_stations</code> (xã có trạm mưa, tiết kiệm lượt) hoặc <code>all</code> (56 xã).</p>}
    </Modal>
  );
}

function PushInfo({ source }) {
  const host = window.location.origin;
  if (source.type === 'http_ingest') {
    return (
      <>
        <CopyBox label="1 thiết bị — khoá riêng (X-Device-Key)" value={`curl -X POST ${host}/api/v1/ingest/readings \\\n  -H "Content-Type: application/json" -H "X-Device-Key: <khoá thiết bị>" \\\n  -d '{"device_id":"<mã>","value":12.5,"time":"2026-09-26T08:00:00Z"}'`} />
        <CopyBox label="Nền tảng hãng đẩy nhiều thiết bị (Bearer token nguồn)" value={`curl -X POST ${host}/api/v1/ingest/batch \\\n  -H "Authorization: Bearer <token nguồn IOT_HTTP>" -H "Content-Type: application/json" \\\n  -d '[{"device_id":"<mã 1>","value":3.2},{"device_id":"<mã 2>","value":181.4}]'`} />
      </>
    );
  }
  if (source.type === 'mqtt') {
    return <CopyBox label={`Topic ${source.config.topic} · payload JSON`} value={`mosquitto_pub -h <broker> -p 1883 -t caobang/pctt/<mã thiết bị>/readings -m '{"value":0.42}'`} />;
  }
  if (source.type === 'chirpstack') {
    return <CopyBox label="ChirpStack v4: Integrations → HTTP (event up) · TTN v3: Webhooks — header Authorization" value={`${host}/api/v1/ingest/lorawan\nAuthorization: Bearer <token nguồn LORAWAN>`} />;
  }
  return null;
}

function SourcesTab({ sources, devices }) {
  const canManage = usePermission('integration', 'manage', '*');
  const run = useRun();
  const [edit, setEdit] = useState(null);
  const [token, setToken] = useState(null);
  const [busy, setBusy] = useState(null);
  const [ask, setAsk] = useState(null); // { kind: 'off' | 'token', source }

  const runNow = async (s) => {
    setBusy(s.id);
    await run(() => api(`/integrations/sources/${s.id}/run`, { method: 'POST' }), `Đã lấy số liệu: ${nameOfSource(s)}`);
    setBusy(null);
  };
  const toggle = async (s) => {
    setBusy(s.id);
    await run(() => api(`/integrations/sources/${s.id}`, { method: 'PATCH', body: { enabled: !s.enabled } }), s.enabled ? `Đã tắt: ${nameOfSource(s)}` : `Đã bật lại: ${nameOfSource(s)}`);
    setBusy(null);
    setAsk(null);
  };
  const rotate = async (s) => {
    setBusy(s.id);
    const r = await run(() => api(`/integrations/sources/${s.id}/rotate-token`, { method: 'POST' }), 'Đã cấp khoá mới cho cổng');
    setBusy(null);
    setAsk(null);
    if (r?.token) setToken({ title: `Khoá mới: ${nameOfSource(s)}`, value: r.token });
  };

  if (!sources.length) {
    return (
      <EmptyState art="du-lieu" className="py-10">
        Chưa có nguồn số liệu nào được khai báo. Nguồn dự báo và cổng nhận số đo được thêm khi cài đặt hệ thống — báo quản trị hệ thống.
      </EmptyState>
    );
  }
  return (
    <ul className="grid gap-3 xl:grid-cols-2" aria-label="Các nguồn dữ liệu">
      {sources.map((s) => {
        const T = TYPE[s.type] || { name: s.name, label: '', tech: s.type, icon: Activity };
        const st = sourceState(s, devices);
        const pull = PULL.includes(s.type);
        return (
          <li key={s.id} className={clsx('card flex min-w-0 flex-col gap-3 p-4', st.level === 3 && 'border-danger/60')}>
            <div className="flex items-start gap-3">
              <span className="icon-tile mt-0.5 h-10 w-10" aria-hidden="true"><T.icon size={20} strokeWidth={1.75} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{T.name}</h3>
                  <span className={clsx('chip text-xs', st.level === 3 ? 'bg-danger/15 text-danger' : st.level === 0 ? 'bg-good/15 text-good' : st.level != null ? 'bg-warn/15 text-warn' : 'bg-panel2 text-muted')}>{st.chip}</span>
                </div>
                <p className="text-sm text-ink-2">{T.label}{pull && s.poll_interval_s ? ` mỗi ${every(s.poll_interval_s)} một lần` : ''}</p>
                <p className="mt-1.5 flex items-start gap-2 text-sm font-medium" data-trang-thai="">
                  <span className="mt-1.5"><Dot level={st.level} /></span>
                  <span>{st.text}</span>
                </p>
              </div>
            </div>
            {canManage && (
              <div className="flex flex-wrap gap-2">
                {pull && (
                  <button type="button" className={st.level === 3 ? 'btn-primary' : 'btn-secondary'} disabled={busy === s.id || !s.enabled} onClick={() => runNow(s)}>
                    <Play size={14} /> {busy === s.id ? 'Đang lấy số liệu…' : st.level === 3 ? 'Thử lại ngay' : 'Lấy số liệu ngay'}
                  </button>
                )}
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={busy === s.id}
                  onClick={() => (s.enabled ? setAsk({ kind: 'off', source: s }) : toggle(s))}
                >
                  <Power size={14} /> {s.enabled ? 'Tắt nguồn' : 'Bật lại nguồn'}
                </button>
              </div>
            )}
            <Advanced>
              <p className="text-xs text-muted">Tên trong hệ thống: {s.name} · mã <span className="font-mono text-ink-2">{s.code}</span> · {T.tech}</p>
              {pull && (
                <p className="text-xs text-muted">
                  Lần chạy: {s.last_run_at ? dateTime(s.last_run_at) : '—'} · thành công: {s.last_success_at ? dateTime(s.last_success_at) : '—'}
                  {s.stats?.duration_s ? ` · ${s.stats.duration_s} giây` : ''}
                </p>
              )}
              {s.type === 'mqtt' && s.enabled && <p className="text-xs text-muted">Máy chủ tin nhắn: {s.connected ? 'đã kết nối' : 'chưa kết nối'}</p>}
              {/* Lỗi thường kèm URL dài không dấu cách (VD Open-Meteo 503) — ngắt dòng ở bất kỳ ký tự nào, không kéo rộng thẻ */}
              {s.last_error && (
                <div className="rounded bg-danger/10 px-2 py-1 font-mono text-[11px] text-danger [overflow-wrap:anywhere]">
                  Lỗi gần nhất (gửi đơn vị kỹ thuật): {s.last_error}
                </div>
              )}
              {!pull && s.has_secret && <p className="text-xs text-muted">Khoá của cổng: <span className="font-mono">{s.secret_hint}</span></p>}
              <PushInfo source={s} />
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-ghost text-sm" onClick={() => setEdit(s)}><Settings2 size={14} /> Cấu hình</button>
                  {['http_ingest', 'chirpstack'].includes(s.type) && (
                    <button type="button" className="btn-ghost text-sm" onClick={() => setAsk({ kind: 'token', source: s })}><KeyRound size={14} /> Cấp khoá mới cho cổng</button>
                  )}
                </div>
              )}
            </Advanced>
          </li>
        );
      })}
      {edit && <SourceModal source={edit} onClose={() => setEdit(null)} />}
      {token && <SecretModal {...token} onClose={() => setToken(null)} />}
      {ask?.kind === 'off' && (
        <Confirm
          title={`Tắt nguồn "${nameOfSource(ask.source)}"?`}
          confirmLabel="Tắt nguồn"
          danger
          busy={busy === ask.source.id}
          onConfirm={() => toggle(ask.source)}
          onClose={() => setAsk(null)}
        >
          <p>Hệ thống ngừng nhận số liệu từ nguồn này cho tới khi bật lại{PULL.includes(ask.source.type) ? ' — biểu đồ, bản đồ dự báo mưa không cập nhật nữa' : ' — số đo của các thiết bị gửi qua cổng này không vào hệ thống'}.</p>
          <p>Số liệu đã nhận trước đó vẫn giữ nguyên.</p>
        </Confirm>
      )}
      {ask?.kind === 'token' && (
        <Confirm
          title={`Cấp khoá mới cho "${nameOfSource(ask.source)}"?`}
          confirmLabel="Cấp khoá mới"
          danger
          busy={busy === ask.source.id}
          onConfirm={() => rotate(ask.source)}
          onClose={() => setAsk(null)}
        >
          <p>Khoá cũ hết hiệu lực ngay: hệ thống của hãng thiết bị đang dùng khoá cũ sẽ bị từ chối cho tới khi được cài khoá mới.</p>
          <p>Khoá mới chỉ hiện một lần — chuẩn bị sẵn chỗ lưu trước khi bấm.</p>
        </Confirm>
      )}
    </ul>
  );
}

function SecretModal({ title, value, extra, onClose }) {
  return (
    <Modal open onClose={onClose} title={title} footer={<button className="btn-primary" onClick={onClose}>Đã lưu lại</button>}>
      <p className="mb-2 text-sm text-warn">Chỉ hiện một lần — sao chép và cài ngay vào thiết bị / hệ thống gửi số liệu.</p>
      <CopyBox label="Khoá" value={value} />
      {extra && <div className="mt-2">{extra}</div>}
    </Modal>
  );
}

function DeviceModal({ onClose, onCreated }) {
  const run = useRun();
  const { data: stations = [] } = useQuery({ queryKey: ['stations', 'CB', {}], queryFn: () => api('/stations') });
  const [f, setF] = useState({ id: '', name: '', vendor: '', protocol: 'http', station_id: '', value_field: 'value', scale: 1, offset_value: 0, minutes: 10 });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const valid = /^[A-Za-z0-9._:-]{3,64}$/.test(f.id) && f.name.length > 1 && f.station_id && Number(f.minutes) >= 1;
  const submit = async () => {
    const { minutes, ...rest } = f;
    const body = { ...rest, scale: Number(f.scale), offset_value: Number(f.offset_value), expected_interval_s: Math.round(Number(minutes) * 60) };
    const res = await run(() => api('/integrations/devices', { method: 'POST', body }), `Đã đăng ký thiết bị ${f.name}`);
    if (res) onCreated(res, f);
  };
  return (
    <Modal open wide onClose={onClose} title="Đăng ký thiết bị đo"
      footer={<><button className="btn-ghost" onClick={onClose}>Huỷ</button><button className="btn-primary" disabled={!valid} onClick={submit}><Plus size={15} /> Đăng ký</button></>}>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <label>Tên thiết bị<input className="input mt-1" value={f.name} onChange={set('name')} placeholder="Cảm biến mưa Phja Oắc" /></label>
        <label className="sm:col-span-2">Gắn với trạm đo
          <select className="input mt-1" value={f.station_id} onChange={set('station_id')}>
            <option value="">— Chọn trạm —</option>
            {stations.map((s) => <option key={s.id} value={s.id}>{s.name} ({STATION_TYPE[s.type]}, {s.unit})</option>)}
          </select>
        </label>
        <label>Thiết bị gửi số liệu qua
          <select className="input mt-1" value={f.protocol} onChange={set('protocol')}>
            {Object.entries(PROTOCOL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label>Mã thiết bị {f.protocol === 'lorawan' ? '(DevEUI ghi trên thiết bị)' : '(ghi trên thiết bị / do hãng cấp)'}
          <input className="input mt-1 font-mono" value={f.id} onChange={set('id')} placeholder={f.protocol === 'lorawan' ? 'A84041000181C061' : 'CB-RAIN-TIN-01'} />
        </label>
        <label>Thiết bị gửi số đo mỗi (phút)
          <input className="input mt-1" type="number" min={1} value={f.minutes} onChange={set('minutes')} />
        </label>
        <label>Hãng sản xuất<input className="input mt-1" value={f.vendor} onChange={set('vendor')} /></label>
      </div>
      <p className="mt-2 text-sm text-ink-2">Quá 3 lần không thấy số đo (VD 30 phút với chu kỳ 10 phút) → hệ thống báo mất tín hiệu cho trực ban.
        Trạm nhận số đo thật đầu tiên tự chuyển sang dùng số liệu của thiết bị.</p>
      <div className="mt-3">
        <Advanced label="Nâng cao — hiệu chỉnh số đo">
          <div className="grid gap-3 sm:grid-cols-2">
            {f.protocol === 'lorawan' && <label>Trường giá trị trong payload giải mã<input className="input mt-1 font-mono" value={f.value_field} onChange={set('value_field')} /></label>}
            <label>Hệ số nhân (scale)<input className="input mt-1" type="number" step="any" value={f.scale} onChange={set('scale')} /></label>
            <label>Bù (offset) — VD cao độ “0” thước nước<input className="input mt-1" type="number" step="any" value={f.offset_value} onChange={set('offset_value')} /></label>
          </div>
          <p className="text-xs text-muted">Giá trị lưu = giá trị gửi × hệ số + bù.</p>
        </Advanced>
      </div>
    </Modal>
  );
}

function DevicesTab({ devices }) {
  const canManage = usePermission('integration', 'manage', '*');
  const run = useRun();
  const [adding, setAdding] = useState(false);
  const [secret, setSecret] = useState(null);
  const [ask, setAsk] = useState(null); // { kind: 'key' | 'delete', device }
  const [busy, setBusy] = useState(false);
  const host = window.location.origin;
  const exampleFor = (d, key) =>
    d.protocol === 'http'
      ? `curl -X POST ${host}/api/v1/ingest/readings -H "Content-Type: application/json" \\\n  -H "X-Device-Key: ${key || '<khoá>'}" -d '{"device_id":"${d.id}","value":1.0}'`
      : d.protocol === 'mqtt'
        ? `mosquitto_pub -h <broker> -t caobang/pctt/${d.id}/readings -m '{"value":1.0}'`
        : `DevEUI ${d.id} — payload giải mã có trường "${d.value_field}"`;
  const confirm = async () => {
    const d = ask.device;
    setBusy(true);
    if (ask.kind === 'key') {
      const r = await run(() => api(`/integrations/devices/${d.id}/rotate-key`, { method: 'POST' }), 'Đã cấp khoá mới');
      if (r?.api_key) setSecret({ title: `Khoá mới của ${d.name}`, value: r.api_key, extra: <CopyBox label="Ví dụ gửi số đo" value={exampleFor(d, r.api_key)} /> });
    } else {
      await run(() => api(`/integrations/devices/${d.id}`, { method: 'DELETE' }), `Đã xoá thiết bị ${d.name}`);
    }
    setBusy(false);
    setAsk(null);
  };

  return (
    <div className="flex flex-col gap-3">
      {canManage && <div><button type="button" className="btn-primary" onClick={() => setAdding(true)}><Plus size={15} /> Đăng ký thiết bị đo</button></div>}
      {!devices.length ? (
        <EmptyState art="du-lieu" className="py-10">
          Chưa có thiết bị đo. {canManage ? 'Bấm "Đăng ký thiết bị đo"' : 'Quản trị hệ thống đăng ký thiết bị'} và gắn với trạm đo để thay số liệu mô phỏng bằng số liệu thật.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Các thiết bị đo">
          {devices.map((d) => {
            const st = deviceState(d);
            return (
              <li key={d.id} className={clsx('card flex min-w-0 flex-col gap-2 p-3 md:flex-row md:items-start md:gap-4', !d.enabled && 'opacity-70')}>
                <div className="min-w-0 md:w-1/3">
                  <h3 className="font-semibold">{d.name}</h3>
                  <p className="text-sm text-ink-2">Gắn với {d.station_name}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className={clsx('flex items-start gap-1.5 text-sm font-medium', risk(st.level).text)} data-trang-thai="">
                    <st.icon size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> <span>{st.text}</span>
                  </p>
                  {d.last_value != null && <p className="text-sm text-ink-2">Số đo gần nhất: <b className="num text-ink">{d.last_value}</b></p>}
                  <div className="mt-2">
                    <Advanced>
                      <p className="text-xs text-muted">
                        Mã <span className="font-mono text-ink-2">{d.id}</span>{d.vendor ? ` · ${d.vendor}` : ''} · gửi qua {PROTOCOL[d.protocol] || d.protocol}
                        {' '}· mỗi {every(d.expected_interval_s)} · trạm {d.station_id} đang dùng {STATION_SOURCE[d.station_source] || d.station_source}
                      </p>
                      <CopyBox label="Ví dụ gửi số đo" value={exampleFor(d)} />
                      {canManage && d.protocol === 'http' && (
                        <div><button type="button" className="btn-ghost text-sm" onClick={() => setAsk({ kind: 'key', device: d })}><KeyRound size={14} /> Cấp khoá mới</button></div>
                      )}
                    </Advanced>
                  </div>
                </div>
                {canManage && (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-ghost text-sm"
                      onClick={() => run(() => api(`/integrations/devices/${d.id}`, { method: 'PATCH', body: { enabled: !d.enabled } }), d.enabled ? `Đã tắt ${d.name}` : `Đã bật ${d.name}`)}
                    >
                      <Power size={14} /> {d.enabled ? 'Tắt' : 'Bật'}
                    </button>
                    <button type="button" className="btn-ghost text-sm text-danger" onClick={() => setAsk({ kind: 'delete', device: d })}>
                      <Trash2 size={14} /> Xoá
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {adding && (
        <DeviceModal
          onClose={() => setAdding(false)}
          onCreated={(res, f) => {
            setAdding(false);
            setSecret({ title: `Đã đăng ký ${f.name}`, value: res.api_key || res.note, extra: <CopyBox label="Ví dụ gửi số đo" value={exampleFor({ ...f, id: res.id }, res.api_key)} /> });
          }}
        />
      )}
      {secret && <SecretModal {...secret} onClose={() => setSecret(null)} />}
      {ask?.kind === 'key' && (
        <Confirm title={`Cấp khoá mới cho ${ask.device.name}?`} confirmLabel="Cấp khoá mới" danger busy={busy} onConfirm={confirm} onClose={() => setAsk(null)}>
          <p>Khoá cũ hết hiệu lực ngay: thiết bị không gửi được số đo cho tới khi được cài khoá mới (trạm sẽ báo mất tín hiệu).</p>
          <p>Khoá mới chỉ hiện một lần — chuẩn bị sẵn chỗ lưu trước khi bấm.</p>
        </Confirm>
      )}
      {ask?.kind === 'delete' && (
        <Confirm title={`Xoá thiết bị ${ask.device.name}?`} confirmLabel="Xoá thiết bị" danger busy={busy} onConfirm={confirm} onClose={() => setAsk(null)}>
          <p>{ask.device.station_name} ngừng nhận số đo từ thiết bị này. Số đo đã nhận vẫn giữ nguyên.</p>
          <p>Trạm không còn thiết bị nào thì chuyển sang "chờ lắp thiết bị". Muốn dùng lại phải đăng ký và cài khoá mới.</p>
        </Confirm>
      )}
    </div>
  );
}

function MonitorTab({ sources, devices }) {
  const { data, isError, refetch } = useQuery({ queryKey: ['int-monitor'], queryFn: () => api('/integrations/monitor'), refetchInterval: 10_000 });
  if (!data) return isError ? <ErrorState onRetry={() => refetch()}>Không tải được tình trạng nhận số liệu</ErrorState> : <Skeleton height={320} />;
  const st = Object.fromEntries(data.stations.map((s) => [s.source, s.n]));
  const stations = (st.iot || 0) + (st.simulator || 0) + (st.external || 0);
  const nameOf = (src) => {
    if (src?.startsWith('device:')) return devices.find((d) => d.id === src.slice(7))?.name || src.slice(7);
    const s = sources.find((x) => x.code === src);
    return s ? nameOfSource(s) : src;
  };
  const lines = [
    {
      level: data.devices.offline ? 2 : data.devices.total ? 0 : null,
      text: data.devices.total
        ? `${data.devices.online}/${data.devices.total} thiết bị đang gửi số đo${data.devices.offline ? ` — ${data.devices.offline} mất tín hiệu` : ''}${data.devices.never ? `, ${data.devices.never} chưa gửi lần nào` : ''}.`
        : 'Chưa có thiết bị đo nào đăng ký.',
    },
    {
      level: stations && st.iot === stations ? 0 : null,
      text: `${st.iot || 0}/${stations} trạm đo dùng số liệu thật từ thiết bị${[st.simulator && `${st.simulator} trạm còn số liệu mô phỏng`, st.external && `${st.external} trạm chờ lắp thiết bị`].filter(Boolean).map((x) => ` — ${x}`).join('')}.`,
    },
    {
      level: data.last24.accepted ? 0 : null,
      text: `24 giờ qua nhận ${int(data.last24.accepted)} số đo${data.last24.rejected ? ` — ${int(data.last24.rejected)} số bị loại (sai định dạng, ngoài khoảng đo, trùng)` : ''}.`,
    },
    {
      level: data.last24.errors ? 3 : 0,
      text: data.last24.errors ? `${int(data.last24.errors)} lần lấy số liệu bị lỗi trong 24 giờ — xem thẻ "Nguồn số liệu".` : 'Không có lần lấy số liệu nào bị lỗi trong 24 giờ.',
    },
  ];
  return (
    <div className="flex flex-col gap-3">
      <ul className="card flex flex-col gap-2 p-4 text-sm" aria-label="Tóm tắt nhận số liệu">
        {lines.map((l) => (
          <li key={l.text} className="flex items-start gap-2"><span className="mt-1.5"><Dot level={l.level} /></span><span>{l.text}</span></li>
        ))}
      </ul>
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead><tr><th>Lúc</th><th>Nguồn</th><th>Diễn biến</th><th className="text-right">Nhận</th><th className="text-right">Bị loại</th></tr></thead>
          <tbody>
            {data.log.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap text-xs">{dateTime(l.time)}</td>
                <td className="text-xs">{nameOf(l.source)}</td>
                <td className={clsx('text-xs', l.level === 'error' ? 'text-danger' : l.level === 'warning' ? 'text-warn' : 'text-ink-2')}>{l.message}</td>
                <td className="num text-right text-xs">{l.accepted || ''}</td>
                <td className="num text-right text-xs">{l.rejected || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.log.length && <Empty>Chưa có hoạt động nhận số liệu</Empty>}
      </div>
    </div>
  );
}

export default function DataSources() {
  const [tab, setTab] = useState('sources');
  const sourcesQ = useQuery({ queryKey: ['int-sources'], queryFn: () => api('/integrations/sources'), refetchInterval: 20_000 });
  const devicesQ = useQuery({ queryKey: ['int-devices'], queryFn: () => api('/integrations/devices'), refetchInterval: 15_000 });
  const sources = sourcesQ.data || [];
  const devices = devicesQ.data || [];
  // Chưa tải xong / không tải được: nói rõ — không hiện "Chưa có nguồn / thiết bị" khi thực ra chưa biết
  const gate = (q, what, node) => (q.data ? node : q.isError
    ? <ErrorState onRetry={() => q.refetch()}>Không tải được {what} — không có nghĩa là chưa có</ErrorState>
    : <Skeleton height={260} />);
  const dataTime = sourcesQ.dataUpdatedAt
    ? new Date(sourcesQ.dataUpdatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;
  const broken = sources.filter((s) => s.enabled && sourceState(s, devices).level === 3).length;
  const lost = devices.filter((d) => d.enabled && d.status === 'mat_tin_hieu').length;
  return (
    <div className={`${PAGE} pb-8`}>
      <PageHeader
        tips={<RoleTips page="nguon-du-lieu" />}
        title="Nguồn dữ liệu & thiết bị đo"
        short="Nguồn dữ liệu"
        time={dataTime}
        timeNote={sourcesQ.isError ? 'Chưa tải được số liệu' : 'Đang tải số liệu…'}
        description="Số liệu dự báo và trạm đo hiện trường về hệ thống từ đâu, có đang về đều không."
      />
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'sources', label: 'Nguồn số liệu', icon: CloudSun, alert: broken ? { level: 3, text: `${broken} nguồn đang lỗi` } : undefined },
        { value: 'devices', label: 'Thiết bị đo', icon: Cpu, alert: lost ? { level: 2, text: `${lost} thiết bị mất tín hiệu` } : undefined },
        { value: 'monitor', label: 'Tình trạng nhận số liệu', short: 'Tình trạng', icon: Activity },
      ]} />
      {tab === 'sources' && gate(sourcesQ, 'danh sách nguồn số liệu', <SourcesTab sources={sources} devices={devices} />)}
      {tab === 'devices' && gate(devicesQ, 'danh sách thiết bị đo', <DevicesTab devices={devices} />)}
      {tab === 'monitor' && <MonitorTab sources={sources} devices={devices} />}
    </div>
  );
}
