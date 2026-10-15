import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { MapPinned, Megaphone, Send } from 'lucide-react';
import { api } from '../../api/client';
import { usePresets, useUnits } from '../../api/hooks';
import { useStore } from '../../app/store';
import { Section } from '../common/ui';
import { ALERT_VALID_HOURS, CHANNEL, LEVEL } from '../../utils/labels';
import { useAllowedCodes } from '../../rbac/usePermission';
import { int } from '../../utils/format';

const PARAM_LABEL = {
  ten_ho: 'Tên hồ chứa', luu_luong: 'Lưu lượng xả (m³/s)', thoi_gian: 'Thời gian', song: 'Sông', dia_diem: 'Địa điểm',
  luong_mua: 'Lượng mưa (mm)', diem_so_tan: 'Điểm sơ tán', ten_suoi: 'Tên suối', so_gio: 'Số giờ', tram: 'Trạm đo',
  muc_nuoc: 'Mực nước (m)', cap_bao_dong: 'Cấp báo động', nguy_co: 'Nguy cơ', ten_bao: 'Tên bão/ATNĐ',
};
const SEV_CLS = { do: LEVEL.do.cls, cam: LEVEL.cam.cls, vang: LEVEL.vang.cls }; // thang màu rủi ro chung (utils/risk.js)

/**
 * Soạn lệnh cảnh báo (Maker): mẫu tin có tham số, vùng nhận (xã / lưu vực / vùng vẽ trên bản đồ), kênh, hiệu lực → gửi lãnh
 * đạo phê duyệt. Chỉ hiện với quyền soạn; chỉ chọn được xã trong phạm vi. Mất mạng → nút gửi tắt, nói lý do.
 */
export default function Composer({ online = true }) {
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
          <select className="input tap mt-1" value={tpl} onChange={(e) => { setTpl(e.target.value); setParams({}); setTitle(''); }}>
            <option value="">— Tự soạn —</option>
            {templates.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
          </select>
        </label>
        {template && (
          <div className="grid grid-cols-2 gap-2">
            {template.params.map((p) => (
              <input key={p} className="input tap" aria-label={PARAM_LABEL[p] || p} placeholder={PARAM_LABEL[p] || p} value={params[p] || ''} onChange={(e) => setParams((x) => ({ ...x, [p]: e.target.value }))} />
            ))}
          </div>
        )}
        <input className="input tap" aria-label="Tiêu đề lệnh" placeholder="Tiêu đề lệnh" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea aria-label="Nội dung tin nhắn" className="input min-h-[110px]" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Nội dung tin nhắn" />
        <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-muted">
          <span>{body.length} ký tự · {Math.max(1, Math.ceil(body.length / 70))} SMS (Unicode)</span>
          <span className="flex flex-wrap gap-1">
            {['do', 'cam', 'vang'].map((s) => (
              <button key={s} type="button" aria-pressed={severity === s} className={clsx('chip tap min-h-[32px] px-3', severity === s ? SEV_CLS[s] : 'bg-panel2')} onClick={() => setSeverity(s)}>{LEVEL[s].label}</button>
            ))}
          </span>
        </div>

        <div>
          <div className="mb-1 font-medium">Vùng nhận cảnh báo</div>
          {polygon ? (
            <div className="flex items-center gap-2 rounded-lg border border-accent/50 bg-accent/10 p-2 text-xs">
              <MapPinned size={16} className="text-accent" /> Vùng khoanh từ bản đồ giám sát ({alertDraft.stats?.area_km2} km²)
              <button type="button" className="tap ml-auto rounded px-2 font-semibold text-danger" onClick={() => setAlertDraft(null)}>Bỏ</button>
            </div>
          ) : (
            <>
              <div className="mb-1 flex flex-wrap gap-1">
                {presets.filter((p) => p.kind === 'luu_vuc').map((p) => (
                  <button key={p.code} type="button" className="chip tap min-h-[32px] bg-panel2 hover:bg-accent/15" onClick={() => setCodes(p.unit_codes)}>{p.name}</button>
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
          <select className="input tap w-auto py-1" value={validHours} onChange={(e) => setValidHours(Number(e.target.value))} aria-label="Thời hạn hiệu lực">
            {ALERT_VALID_HOURS.map(([h, label]) => <option key={h} value={h}>{label} kể từ khi duyệt</option>)}
          </select>
          <span className="text-[11px] text-muted">Hết hạn thì thôi hiện cho người dân; còn nguy hiểm thì gia hạn, hết sớm thì kết thúc.</span>
        </label>

        <div>
          <div className="mb-1 font-medium">Kênh phát</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CHANNEL).map(([k, v]) => (
              <label key={k} className={clsx('chip tap min-h-[32px] cursor-pointer px-2.5 py-1', channels.includes(k) ? 'bg-accent text-white' : 'bg-panel2')}>
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
        <button type="button" className="btn-danger tap justify-center" title={!online ? 'Mất mạng — chưa gửi được' : undefined} disabled={sending || !online || !auth || !title || body.length < 10 || !channels.length || (!codes.length && !polygon)} onClick={submit}>
          <Send size={15} /> Gửi Lãnh đạo phê duyệt
        </button>
        {!auth && <div className="text-xs text-danger">Đăng nhập (tài khoản Trực ban) để soạn lệnh.</div>}
      </div>
    </Section>
  );
}
