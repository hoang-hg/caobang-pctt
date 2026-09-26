import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  CloudSun, Cpu, Activity, Play, KeyRound, Plus, Trash2, Power, Settings2, Copy, Radio, Wifi, WifiOff, CircleDashed,
} from 'lucide-react';
import { api } from '../api/client';
import { useStore } from '../app/store';
import { Empty, KpiCard, Modal, Tabs } from '../components/common/ui';
import { usePermission } from '../rbac/usePermission';
import { STATION_TYPE } from '../utils/labels';
import { ago, dateTime, int } from '../utils/format';

const TYPE = {
  open_meteo: { label: 'Dự báo tổ hợp (kéo)', icon: CloudSun },
  openweather: { label: 'Dự báo (kéo)', icon: CloudSun },
  http_ingest: { label: 'IoT HTTP (đẩy)', icon: Cpu },
  mqtt: { label: 'IoT MQTT (đẩy)', icon: Radio },
  chirpstack: { label: 'LoRaWAN webhook (đẩy)', icon: Radio },
};
const SRC_STATUS = {
  ok: ['Hoạt động', 'bg-good text-white'],
  loi: ['Lỗi', 'bg-danger text-white'],
  chua_chay: ['Chưa chạy', 'bg-panel2 text-muted'],
  tat: ['Đã tắt', 'bg-panel2 text-muted'],
};
const DEV_STATUS = {
  truc_tuyen: ['Trực tuyến', 'text-good', Wifi],
  mat_tin_hieu: ['Mất tín hiệu', 'text-danger', WifiOff],
  chua_ket_noi: ['Chưa kết nối', 'text-muted', CircleDashed],
};

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
        <button className="shrink-0 text-accent" title="Sao chép" onClick={() => { navigator.clipboard?.writeText(value); toast({ title: 'Đã sao chép' }); }}>
          <Copy size={14} />
        </button>
      </div>
    </div>
  );
}

function SourceModal({ source, onClose }) {
  const run = useRun();
  const [cfg, setCfg] = useState(JSON.stringify(source.config, null, 2));
  const [interval, setInterval] = useState(source.poll_interval_s || '');
  const [secret, setSecret] = useState('');
  const pull = ['open_meteo', 'openweather'].includes(source.type);
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
          <label>Chu kỳ lấy dữ liệu (giây, ≥ 300)
            <input className="input mt-1" type="number" min={300} value={interval} onChange={(e) => setInterval(e.target.value)} />
          </label>
        )}
        {pull && (
          <label>API key {source.has_secret && <span className="text-muted">(đang có: {source.secret_hint})</span>}
            <input className="input mt-1" type="password" placeholder={source.type === 'open_meteo' ? 'Tuỳ chọn — gói thương mại' : 'Bắt buộc'} value={secret} onChange={(e) => setSecret(e.target.value)} />
          </label>
        )}
      </div>
      {source.type === 'open_meteo' && (
        <p className="mt-2 text-xs text-muted">
          models: <code>ecmwf_ifs025</code> (ECMWF IFS 51 thành phần), <code>gfs025</code> (NOAA GEFS 31 thành phần) ·
          alert_24h_mm: ngưỡng mưa 24 giờ (P50) để tự sinh nháp “Chuẩn bị sơ tán” · heavy_mm_h: ngưỡng tính xác suất mưa lớn.
          Gói miễn phí chỉ cho mục đích phi thương mại — cơ quan triển khai chính thức nên mua gói có API key.
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
      <div className="mt-2 grid gap-2">
        <CopyBox label="1 thiết bị — khoá riêng (X-Device-Key)" value={`curl -X POST ${host}/api/v1/ingest/readings \\\n  -H "Content-Type: application/json" -H "X-Device-Key: <khoá thiết bị>" \\\n  -d '{"device_id":"<mã>","value":12.5,"time":"2026-09-26T08:00:00Z"}'`} />
        <CopyBox label="Nền tảng hãng đẩy nhiều thiết bị (Bearer token nguồn)" value={`curl -X POST ${host}/api/v1/ingest/batch \\\n  -H "Authorization: Bearer <token nguồn IOT_HTTP>" -H "Content-Type: application/json" \\\n  -d '[{"device_id":"<mã 1>","value":3.2},{"device_id":"<mã 2>","value":181.4}]'`} />
      </div>
    );
  }
  if (source.type === 'mqtt') {
    return <div className="mt-2"><CopyBox label={`Topic ${source.config.topic} · payload JSON`} value={`mosquitto_pub -h <broker> -p 1883 -t caobang/pctt/<mã thiết bị>/readings -m '{"value":0.42}'`} /></div>;
  }
  if (source.type === 'chirpstack') {
    return <div className="mt-2"><CopyBox label="ChirpStack v4: Integrations → HTTP (event up) · TTN v3: Webhooks — header Authorization" value={`${host}/api/v1/ingest/lorawan\nAuthorization: Bearer <token nguồn LORAWAN>`} /></div>;
  }
  return null;
}

function SourcesTab() {
  const canManage = usePermission('integration', 'manage', '*');
  const run = useRun();
  const { data = [] } = useQuery({ queryKey: ['int-sources'], queryFn: () => api('/integrations/sources'), refetchInterval: 20_000 });
  const [edit, setEdit] = useState(null);
  const [token, setToken] = useState(null);
  const [busy, setBusy] = useState(null);

  const runNow = async (s) => {
    setBusy(s.id);
    const res = await run(() => api(`/integrations/sources/${s.id}/run`, { method: 'POST' }), `Đồng bộ ${s.name} thành công`);
    setBusy(null);
    return res;
  };

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {data.map((s) => {
        const T = TYPE[s.type];
        const [stLabel, stCls] = SRC_STATUS[s.status] || SRC_STATUS.chua_chay;
        const pull = ['open_meteo', 'openweather'].includes(s.type);
        return (
          <div key={s.id} className={clsx('card p-4', s.status === 'loi' && 'border-danger/60')}>
            <div className="flex items-start gap-3">
              <T.icon size={22} className="mt-0.5 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <b>{s.name}</b>
                  <span className={clsx('chip', stCls)}>{stLabel}</span>
                  {s.type === 'mqtt' && s.enabled && <span className={clsx('chip', s.connected ? 'bg-good/15 text-good' : 'bg-danger/15 text-danger')}>{s.connected ? 'Đã nối broker' : 'Chưa nối broker'}</span>}
                </div>
                <div className="text-xs text-muted"><span className="font-mono">{s.code}</span> · {T.label}{pull && s.poll_interval_s ? ` · mỗi ${Math.round(s.poll_interval_s / 60)} phút` : ''}</div>
                {pull && (
                  <div className="mt-1 text-xs text-ink-2">
                    Lần chạy: {s.last_run_at ? ago(s.last_run_at) : '—'} · thành công: {s.last_success_at ? ago(s.last_success_at) : '—'}
                    {s.stats?.rows != null && <> · {int(s.stats.rows)} dòng{s.stats.units ? ` / ${s.stats.units} xã` : ''}{s.stats.duration_s ? ` · ${s.stats.duration_s}s` : ''}</>}
                  </div>
                )}
                {s.last_error && <div className="mt-1 rounded bg-danger/10 px-2 py-1 font-mono text-[11px] text-danger">{s.last_error}</div>}
                {!pull && s.has_secret && <div className="mt-1 text-xs text-muted">Token nguồn: <span className="font-mono">{s.secret_hint}</span></div>}
                <PushInfo source={s} />
              </div>
            </div>
            {canManage && (
              <div className="mt-3 flex flex-wrap gap-1 border-t border-line pt-3">
                <button className={clsx('btn px-2 py-1 text-xs', s.enabled ? 'bg-good/15 text-good' : 'btn-ghost')}
                  onClick={() => run(() => api(`/integrations/sources/${s.id}`, { method: 'PATCH', body: { enabled: !s.enabled } }), s.enabled ? 'Đã tắt nguồn' : 'Đã bật nguồn')}>
                  <Power size={12} /> {s.enabled ? 'Đang bật' : 'Đang tắt'}
                </button>
                {pull && <button className="btn-primary px-2 py-1 text-xs" disabled={busy === s.id || !s.enabled} onClick={() => runNow(s)}><Play size={12} /> {busy === s.id ? 'Đang đồng bộ…' : 'Chạy ngay'}</button>}
                <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEdit(s)}><Settings2 size={12} /> Cấu hình</button>
                {['http_ingest', 'chirpstack'].includes(s.type) && (
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={async () => {
                    if (!window.confirm('Cấp token mới? Hệ thống đang dùng token cũ sẽ bị từ chối.')) return;
                    const r = await run(() => api(`/integrations/sources/${s.id}/rotate-token`, { method: 'POST' }), 'Đã cấp token mới');
                    if (r?.token) setToken({ title: `Token nguồn ${s.code}`, value: r.token });
                  }}><KeyRound size={12} /> Cấp token mới</button>
                )}
              </div>
            )}
          </div>
        );
      })}
      {edit && <SourceModal source={edit} onClose={() => setEdit(null)} />}
      {token && <SecretModal {...token} onClose={() => setToken(null)} />}
    </div>
  );
}

function SecretModal({ title, value, extra, onClose }) {
  return (
    <Modal open onClose={onClose} title={title} footer={<button className="btn-primary" onClick={onClose}>Đã lưu lại</button>}>
      <p className="mb-2 text-sm text-warn">Chỉ hiển thị một lần — sao chép và cấu hình ngay vào thiết bị / hệ thống gửi dữ liệu.</p>
      <CopyBox label="Khoá" value={value} />
      {extra && <div className="mt-2">{extra}</div>}
    </Modal>
  );
}

function DeviceModal({ onClose, onCreated }) {
  const run = useRun();
  const { data: stations = [] } = useQuery({ queryKey: ['stations', 'CB', {}], queryFn: () => api('/stations') });
  const [f, setF] = useState({ id: '', name: '', vendor: '', protocol: 'http', station_id: '', value_field: 'value', scale: 1, offset_value: 0, expected_interval_s: 600 });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const valid = /^[A-Za-z0-9._:-]{3,64}$/.test(f.id) && f.name.length > 1 && f.station_id;
  const submit = async () => {
    const res = await run(() => api('/integrations/devices', { method: 'POST', body: { ...f, scale: Number(f.scale), offset_value: Number(f.offset_value), expected_interval_s: Number(f.expected_interval_s) } }), `Đã đăng ký thiết bị ${f.id}`);
    if (res) onCreated(res, f);
  };
  return (
    <Modal open wide onClose={onClose} title="Đăng ký thiết bị IoT"
      footer={<><button className="btn-ghost" onClick={onClose}>Huỷ</button><button className="btn-primary" disabled={!valid} onClick={submit}><Plus size={15} /> Đăng ký</button></>}>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <label>Mã thiết bị {f.protocol === 'lorawan' ? '(DevEUI)' : ''}<input className="input mt-1 font-mono" value={f.id} onChange={set('id')} placeholder={f.protocol === 'lorawan' ? 'A84041000181C061' : 'CB-RAIN-TIN-01'} /></label>
        <label>Tên<input className="input mt-1" value={f.name} onChange={set('name')} placeholder="Cảm biến mưa Phja Oắc" /></label>
        <label>Hãng / model<input className="input mt-1" value={f.vendor} onChange={set('vendor')} /></label>
        <label>Giao thức
          <select className="input mt-1" value={f.protocol} onChange={set('protocol')}>
            <option value="http">HTTP (NB-IoT / 4G) — khoá riêng</option>
            <option value="mqtt">MQTT</option>
            <option value="lorawan">LoRaWAN (ChirpStack / TTN)</option>
          </select>
        </label>
        <label className="sm:col-span-2">Gắn với trạm quan trắc
          <select className="input mt-1" value={f.station_id} onChange={set('station_id')}>
            <option value="">— Chọn trạm —</option>
            {stations.map((s) => <option key={s.id} value={s.id}>{s.id} · {s.name} ({STATION_TYPE[s.type]}, {s.unit})</option>)}
          </select>
        </label>
        {f.protocol === 'lorawan' && <label>Trường giá trị trong payload giải mã<input className="input mt-1 font-mono" value={f.value_field} onChange={set('value_field')} /></label>}
        <label>Hệ số nhân (scale)<input className="input mt-1" type="number" step="any" value={f.scale} onChange={set('scale')} /></label>
        <label>Bù (offset) — VD cao độ “0” thước nước<input className="input mt-1" type="number" step="any" value={f.offset_value} onChange={set('offset_value')} /></label>
        <label>Chu kỳ gửi dự kiến (giây)<input className="input mt-1" type="number" value={f.expected_interval_s} onChange={set('expected_interval_s')} /></label>
      </div>
      <p className="mt-2 text-xs text-muted">Giá trị lưu = giá trị gửi × scale + offset. Trạm nhận số đo thật đầu tiên sẽ tự chuyển từ “mô phỏng” sang “IoT”.
        Quá 3 chu kỳ không có dữ liệu → cảnh báo mất tín hiệu.</p>
    </Modal>
  );
}

function DevicesTab() {
  const canManage = usePermission('integration', 'manage', '*');
  const run = useRun();
  const { data = [] } = useQuery({ queryKey: ['int-devices'], queryFn: () => api('/integrations/devices'), refetchInterval: 15_000 });
  const [adding, setAdding] = useState(false);
  const [secret, setSecret] = useState(null);
  const host = window.location.origin;
  const exampleFor = (d, key) =>
    d.protocol === 'http'
      ? `curl -X POST ${host}/api/v1/ingest/readings -H "Content-Type: application/json" \\\n  -H "X-Device-Key: ${key || '<khoá>'}" -d '{"device_id":"${d.id}","value":1.0}'`
      : d.protocol === 'mqtt'
        ? `mosquitto_pub -h <broker> -t caobang/pctt/${d.id}/readings -m '{"value":1.0}'`
        : `DevEUI ${d.id} — payload giải mã có trường "${d.value_field}"`;

  return (
    <div className="flex flex-col gap-3">
      {canManage && <div><button className="btn-primary" onClick={() => setAdding(true)}><Plus size={15} /> Đăng ký thiết bị</button></div>}
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead><tr><th>Thiết bị</th><th>Giao thức</th><th>Trạm</th><th>Trạng thái</th><th>Giá trị gần nhất</th><th /></tr></thead>
          <tbody>
            {data.map((d) => {
              const [label, cls, Icon] = DEV_STATUS[d.status] || DEV_STATUS.chua_ket_noi;
              return (
                <tr key={d.id} className={clsx(!d.enabled && 'opacity-50')}>
                  <td><div className="font-medium">{d.name}</div><div className="font-mono text-xs text-muted">{d.id}{d.vendor ? ` · ${d.vendor}` : ''}</div></td>
                  <td className="uppercase">{d.protocol}</td>
                  <td className="text-sm">{d.station_name}<div className="text-xs text-muted">{d.station_id} · nguồn trạm: {d.station_source === 'iot' ? 'IoT thật' : 'mô phỏng'}</div></td>
                  <td><span className={clsx('flex items-center gap-1 text-sm', cls)}><Icon size={14} /> {label}</span><div className="text-xs text-muted">{d.last_seen_at ? ago(d.last_seen_at) : 'chưa có dữ liệu'}</div></td>
                  <td className="font-mono">{d.last_value ?? '–'}</td>
                  <td className="whitespace-nowrap">
                    {canManage && (
                      <div className="flex justify-end gap-1">
                        <button className="btn-ghost px-2 py-1" title={d.enabled ? 'Vô hiệu hoá' : 'Bật'} onClick={() => run(() => api(`/integrations/devices/${d.id}`, { method: 'PATCH', body: { enabled: !d.enabled } }), d.enabled ? 'Đã vô hiệu hoá' : 'Đã bật')}><Power size={14} /></button>
                        {d.protocol === 'http' && (
                          <button className="btn-ghost px-2 py-1" title="Cấp khoá mới" onClick={async () => {
                            if (!window.confirm('Cấp khoá mới? Khoá cũ sẽ bị vô hiệu.')) return;
                            const r = await run(() => api(`/integrations/devices/${d.id}/rotate-key`, { method: 'POST' }), 'Đã cấp khoá mới');
                            if (r?.api_key) setSecret({ title: `Khoá thiết bị ${d.id}`, value: r.api_key, extra: <CopyBox label="Ví dụ gửi số đo" value={exampleFor(d, r.api_key)} /> });
                          }}><KeyRound size={14} /></button>
                        )}
                        <button className="btn-ghost px-2 py-1 text-danger" title="Xoá" onClick={() => window.confirm(`Xoá thiết bị ${d.id}?`) && run(() => api(`/integrations/devices/${d.id}`, { method: 'DELETE' }), 'Đã xoá thiết bị')}><Trash2 size={14} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!data.length && <Empty>Chưa có thiết bị. Đăng ký thiết bị và gắn với trạm quan trắc để thay số liệu mô phỏng bằng số liệu thật.</Empty>}
      </div>
      {adding && (
        <DeviceModal
          onClose={() => setAdding(false)}
          onCreated={(res, f) => {
            setAdding(false);
            setSecret({ title: `Thiết bị ${res.id} đã đăng ký`, value: res.api_key || res.note, extra: <CopyBox label="Ví dụ gửi số đo" value={exampleFor({ ...f, id: res.id }, res.api_key)} /> });
          }}
        />
      )}
      {secret && <SecretModal {...secret} onClose={() => setSecret(null)} />}
    </div>
  );
}

function MonitorTab() {
  const { data } = useQuery({ queryKey: ['int-monitor'], queryFn: () => api('/integrations/monitor'), refetchInterval: 10_000 });
  if (!data) return null;
  const st = Object.fromEntries(data.stations.map((s) => [s.source, s.n]));
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Thiết bị trực tuyến" value={`${data.devices.online}/${data.devices.total}`} icon={Wifi} tone={data.devices.offline ? 'warn' : undefined}
          sub={`${data.devices.offline} mất tín hiệu · ${data.devices.never} chưa kết nối`} />
        <KpiCard label="Trạm dùng dữ liệu thật" value={`${st.iot || 0}/${(st.iot || 0) + (st.simulator || 0) + (st.external || 0)}`} icon={Cpu} sub={`${st.simulator || 0} trạm còn mô phỏng`} />
        <KpiCard label="Số đo nhận 24 giờ" value={int(data.last24.accepted)} icon={Activity} sub={`${int(data.last24.rejected)} bị loại (sai định dạng, ngoài khoảng, trùng)`} />
        <KpiCard label="Lỗi đồng bộ 24 giờ" value={int(data.last24.errors)} icon={Radio} tone={data.last24.errors ? 'danger' : undefined} sub={`MQTT broker: ${data.mqtt_connected ? 'đã kết nối' : 'chưa kết nối'}`} />
      </div>
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead><tr><th>Thời gian</th><th>Nguồn</th><th>Nội dung</th><th className="text-right">Nhận</th><th className="text-right">Loại</th></tr></thead>
          <tbody>
            {data.log.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap font-mono text-xs">{dateTime(l.time)}</td>
                <td className="font-mono text-xs">{l.source}</td>
                <td className={clsx('text-xs', l.level === 'error' ? 'text-danger' : l.level === 'warning' ? 'text-warn' : 'text-ink-2')}>{l.message}</td>
                <td className="text-right font-mono text-xs">{l.accepted || ''}</td>
                <td className="text-right font-mono text-xs">{l.rejected || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.log.length && <Empty>Chưa có hoạt động tiếp nhận</Empty>}
      </div>
    </div>
  );
}

export default function DataSources() {
  const [tab, setTab] = useState('sources');
  return (
    <div className="flex flex-col gap-3 p-3">
      <div>
        <h1 className="text-lg font-bold">Nguồn dữ liệu & Thiết bị IoT</h1>
        <p className="text-xs text-muted">Dự báo quốc tế (ECMWF, GFS, OpenWeather) · Cổng tiếp nhận IoT hiện trường HTTP / MQTT / LoRaWAN · Giám sát kết nối</p>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'sources', label: 'Nguồn dữ liệu', icon: CloudSun },
        { value: 'devices', label: 'Thiết bị IoT', icon: Cpu },
        { value: 'monitor', label: 'Giám sát kết nối', icon: Activity },
      ]} />
      {tab === 'sources' && <SourcesTab />}
      {tab === 'devices' && <DevicesTab />}
      {tab === 'monitor' && <MonitorTab />}
    </div>
  );
}
