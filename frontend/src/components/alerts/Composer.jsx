import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Check, ChevronLeft, ChevronRight, CloudRainWind, Dam, House, Loader2, MapPinned, Megaphone, Mountain, Pencil, Search, Send, Smartphone, Tornado,
  Waves, X,
} from 'lucide-react';
import { api } from '../../api/client';
import { usePresets, useUnits } from '../../api/hooks';
import { useStore } from '../../app/store';
import { FieldError, Section, ShowMore, Skeleton, StepChips } from '../common/ui';
import { ALERT_VALID_HOURS, CHANNEL, LEVEL } from '../../utils/labels';
import { useAllowedCodes } from '../../rbac/usePermission';
import { foldVi, int } from '../../utils/format';
import { HIDDEN_TEMPLATE_CODES } from '../../utils/hazardScope';
import { risk } from '../../utils/risk';
import { useShowMore } from '../../utils/useShowMore';
import { SEVERITY_LEVEL } from './alertFacts';

const STEPS = ['Nội dung', 'Vùng nhận', 'Kênh & gửi'];
const PARAM_LABEL = {
  ten_ho: 'Tên hồ chứa', luu_luong: 'Lưu lượng xả (m³/s)', thoi_gian: 'Thời gian', song: 'Sông', dia_diem: 'Địa điểm',
  luong_mua: 'Lượng mưa (mm)', diem_so_tan: 'Điểm sơ tán', ten_suoi: 'Tên suối', so_gio: 'Số giờ', tram: 'Trạm đo',
  muc_nuoc: 'Mực nước (m)', cap_bao_dong: 'Cấp báo động', nguy_co: 'Nguy cơ', ten_bao: 'Tên bão/ATNĐ',
};
const NUMERIC = new Set(['luu_luong', 'luong_mua', 'so_gio', 'muc_nuoc']);
// Ví dụ trong ô điền — người mới thấy ngay phải ghi gì, ghi kiểu nào
const PARAM_EXAMPLE = {
  ten_ho: 'VD: Thủy điện Bảo Lâm 1', luu_luong: 'VD: 1200', thoi_gian: 'VD: 14 giờ ngày 21/10', song: 'VD: Gâm',
  dia_diem: 'VD: xã Bảo Lâm, xã Lý Bôn', luong_mua: 'VD: 215', diem_so_tan: 'VD: Trường THCS Nà Pồng', ten_suoi: 'VD: Nà Ngần',
  so_gio: 'VD: 6', tram: 'VD: Bằng Giang', muc_nuoc: 'VD: 182,5', cap_bao_dong: 'VD: II', nguy_co: 'VD: lũ quét, sạt lở',
  ten_bao: 'VD: bão số 3',
};
// Thẻ mẫu tin (thiết kế E.1): hình + tên việc + dùng khi nào; xếp việc hay gặp lên trước, "Tự soạn" cuối
const TEMPLATE_CARD = {
  XA_LU: { icon: Dam, when: 'Thủy điện, hồ chứa mở cửa xả', order: 1 },
  SAT_LO: { icon: Mountain, when: 'Di dời hộ dưới taluy, sườn đồi', order: 2 },
  BAO_ATND: { icon: Tornado, when: 'Hoàn lưu bão gây mưa rất to', order: 3 }, // đang ẩn — utils/hazardScope.js
  LU_QUET: { icon: CloudRainWind, when: 'Nguy cơ lũ quét trên suối', order: 4 },
  NGAP: { icon: Waves, when: 'Mực nước sông vượt báo động', order: 5 },
  CHUAN_BI_SO_TAN: { icon: House, when: 'Dự báo mưa lớn — sẵn sàng sơ tán', order: 6 },
};
// Người nhận theo kênh — như channel_target (backend services/broadcast.py)
const REACH = {
  SMS: ['subscribers', 'thuê bao'], CELL_BROADCAST: ['subscribers', 'máy trong vùng phủ sóng'], ZALO_OA: ['zalo_followers', 'người theo dõi Zalo'],
  PUSH: ['app_users', 'người dùng ứng dụng'], LOA: ['speakers', 'loa phường / xã'],
};
const DEFAULT_CHANNELS = ['SMS', 'CELL_BROADCAST', 'ZALO_OA', 'LOA'];
const MAX_BODY = 1000; // như BroadcastIn.message_body (backend)
const sms = (n) => Math.max(1, Math.ceil(n / 70)); // tin Unicode: 70 ký tự / SMS
const big = 'tap min-h-[44px] text-sm sm:min-h-0';

/**
 * Soạn lệnh cảnh báo (người soạn — thiết kế E.1–E.2) — 3 bước, lỗi hiện ngay dưới ô:
 * (1) Nội dung: chạm thẻ mẫu tin có hình (xả lũ, sạt lở, bão…; ô điền có ví dụ, số phải là số), tiêu đề, nội dung (đếm ký tự / SMS), mức
 *     Rất cao / Cao / Trung bình theo thang màu chung;
 * (2) Vùng nhận: lưu vực chọn nhanh, chạm chọn xã (tìm không dấu, chọn cả nhóm đang lọc) hoặc vùng vẽ trên Bản đồ giám sát;
 *     số hộ / thuê bao / loa ước tính ngay;
 * (3) Kênh & gửi: mỗi kênh kèm số người nhận, hiệu lực, xem trước tin trên khung điện thoại như người dân nhận rồi gửi lãnh đạo
 *     phê duyệt.
 * Chỉ chọn được xã trong phạm vi alert.create; bấm Tiếp / Gửi khi còn lỗi → nói rõ, đưa con trỏ tới ô lỗi; mất mạng → không
 * gửi được, nói lý do. "Soạn lại" lệnh bị từ chối: điền lại cả 3 bước, mở bước xem lại.
 */
export default function Composer({ online = true }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { auth, toast, alertDraft, setAlertDraft } = useStore();
  const { data: templates = [], isLoading: tplLoading } = useQuery({ queryKey: ['templates'], queryFn: () => api('/alerts/templates'), staleTime: Infinity });
  const { data: allUnits = [] } = useUnits();
  const { data: allPresets = [] } = usePresets();
  const allowed = useAllowedCodes('alert', 'create');
  const units = [...(allowed ? allUnits.filter((u) => allowed.includes(u.code)) : allUnits)].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const presets = (allowed ? allPresets.filter((p) => p.unit_codes.every((c) => allowed.includes(c))) : allPresets).filter((p) => p.kind === 'luu_vuc');

  const [step, setStep] = useState(0);
  const [tpl, setTpl] = useState('');
  const [params, setParams] = useState({});
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [severity, setSeverity] = useState('cam');
  const [validHours, setValidHours] = useState(48);
  const [codes, setCodes] = useState([]);
  const [channels, setChannels] = useState(DEFAULT_CHANNELS);
  const [search, setSearch] = useState('');
  const [tried, setTried] = useState([false, false, false]);
  const [sending, setSending] = useState(false); // bấm đúp → 2 lệnh trùng chờ duyệt
  const polygon = alertDraft?.polygon || null;
  const refs = { title: useRef(null), body: useRef(null), area: useRef(null), channels: useRef(null) };
  const paramRefs = useRef({});

  const template = templates.find((t) => t.code === tpl);
  useEffect(() => {
    if (!template) return;
    let b = template.body;
    for (const p of template.params) b = b.replaceAll(`{${p}}`, params[p] || `{${p}}`);
    setBody(b);
    setSeverity(template.severity);
  }, [template, params]);

  const audienceQ = useQuery({
    queryKey: ['alert-audience', codes, polygon],
    queryFn: () => api('/alerts/audience', { method: 'POST', body: { admin_codes: codes, polygon } }),
    enabled: !!polygon || codes.length > 0,
    staleTime: 60_000,
  });
  const audience = (polygon || codes.length) ? audienceQ.data : null;

  // Bản nháp: vùng vẽ từ Bản đồ giám sát → mở bước Vùng nhận; "Soạn lại" lệnh bị từ chối → điền lại, mở bước xem lại
  useEffect(() => {
    const p = alertDraft?.prefill;
    if (alertDraft?.polygon && !p) {
      setStep((s) => Math.max(s, 1));
      return;
    }
    if (!p) return;
    setTpl('');
    setParams({});
    setTitle(p.title);
    setBody(p.body);
    setSeverity(p.severity);
    setChannels(p.channels);
    setValidHours(p.validHours);
    setCodes(p.codes);
    setTried([false, false, false]);
    setStep(2);
    setAlertDraft(null);
  }, [alertDraft, setAlertDraft]);

  // ---- Lỗi từng bước (hiện khi đã gõ hoặc đã bấm Tiếp / Gửi)
  const paramErr = Object.fromEntries((template?.params || []).map((p) => {
    const v = (params[p] || '').trim();
    if (!v) return [p, `Nhập ${PARAM_LABEL[p]?.toLowerCase() || p}`];
    if (NUMERIC.has(p) && !/^\d+([.,]\d+)?$/.test(v)) return [p, 'Chỉ nhập số (VD 1200 hoặc 12,5)'];
    return [p, null];
  }));
  const leftover = [...body.matchAll(/\{([a-z_]+)\}/g)].map((m) => PARAM_LABEL[m[1]] || m[1]);
  const err0 = {
    title: title.trim().length < 3 ? 'Ghi tiêu đề lệnh (ít nhất 3 ký tự)' : null,
    body: body.trim().length < 10 ? 'Ghi nội dung tin (ít nhất 10 ký tự)'
      : body.length > MAX_BODY ? `Tối đa ${int(MAX_BODY)} ký tự (đang ${int(body.length)})`
        // Chỗ trống {…} còn lại do tự gõ (tham số của mẫu tin đã báo lỗi ngay dưới ô của nó)
        : leftover.length && !Object.values(paramErr).some(Boolean) ? `Còn chỗ trống chưa điền: ${[...new Set(leftover)].join(', ')}` : null,
  };
  const err1 = { area: !codes.length && !polygon ? 'Chọn ít nhất 1 xã/phường, một lưu vực hoặc vẽ vùng trên Bản đồ giám sát' : null };
  const err2 = { channels: !channels.length ? 'Chọn ít nhất 1 kênh phát' : null };
  const stepErrors = [
    { ...Object.fromEntries(Object.entries(paramErr).map(([k, v]) => [`p_${k}`, v])), ...err0 },
    err1,
    err2,
  ];
  const valid = (i) => !Object.values(stepErrors[i]).some(Boolean);
  const show = (i, key, typed) => (tried[i] || typed ? stepErrors[i][key] : null);

  const focusFirst = (i) => {
    const key = Object.keys(stepErrors[i]).find((k) => stepErrors[i][k]);
    const el = key?.startsWith('p_') ? paramRefs.current[key.slice(2)] : refs[key]?.current;
    el?.focus();
    el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  };
  const next = () => {
    if (!valid(step)) {
      setTried((t) => t.map((v, i) => (i === step ? true : v)));
      focusFirst(step);
      return;
    }
    setStep(step + 1);
  };
  const reset = () => {
    setStep(0); setTpl(''); setParams({}); setTitle(''); setBody(''); setCodes([]); setSearch('');
    setChannels(DEFAULT_CHANNELS); setValidHours(48); setTried([false, false, false]); setAlertDraft(null);
  };
  const submit = async () => {
    const bad = [0, 1, 2].find((i) => !valid(i));
    if (bad !== undefined) {
      setTried([true, true, true]);
      setStep(bad);
      requestAnimationFrame(() => focusFirst(bad));
      return;
    }
    setSending(true);
    try {
      const res = await api('/alerts/broadcasts', {
        method: 'POST',
        body: { title: title.trim(), message_body: body, template_code: tpl || null, severity, admin_codes: codes, polygon, channels, valid_hours: validHours },
      });
      toast({ tone: 'good', title: `Đã gửi lệnh ${res.code} chờ lãnh đạo phê duyệt`, body: 'Tin chỉ tới người dân sau khi lãnh đạo (không phải người soạn) ký duyệt bằng PIN' });
      qc.invalidateQueries({ queryKey: ['broadcasts'] });
      reset();
    } catch (e) {
      toast({ tone: 'danger', title: 'Không gửi được', body: e.message });
    } finally {
      setSending(false);
    }
  };

  // ---- Bước 2: chọn xã
  const nq = foldVi(search.trim());
  const filtered = nq ? units.filter((u) => foldVi(u.name).includes(nq)) : units;
  const listed = useShowMore(filtered, 12, nq);
  const toggle = (c) => setCodes((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));
  const unitName = (c) => allUnits.find((u) => u.code === c)?.name || c;
  const preset = presets.find((p) => p.unit_codes.length === codes.length && p.unit_codes.every((c) => codes.includes(c)));

  const chip = (on) => clsx('chip tap min-h-[36px] border px-3', on ? 'border-accent bg-accent text-white' : 'border-line bg-panel2 text-ink-2 hover:bg-panel');
  const card = (on) => clsx('tap flex min-h-[56px] items-start gap-2.5 rounded-lg border-2 px-2.5 py-2 text-left text-xs', on ? 'border-accent bg-accent/10' : 'border-line bg-panel hover:border-accent/50');
  const field = (key, label, input, i, typed, help) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={`soan-${key}`} className="font-medium">{label}</label>
      {input}
      {help}
      <FieldError id={`loi-soan-${key}`}>{show(i, key, typed)}</FieldError>
    </div>
  );

  let content;
  if (step === 0) {
    content = (
      <div className="flex flex-col gap-3 text-sm">
        <div>
          <div className="mb-1 font-medium" id="mau-tin">Mẫu tin dựng sẵn</div>
          {tplLoading ? <Skeleton height={88} /> : (
            <div className="grid grid-cols-1 gap-1.5 min-[400px]:grid-cols-2" role="radiogroup" aria-labelledby="mau-tin">
              {templates.filter((t) => !HIDDEN_TEMPLATE_CODES.has(t.code)).sort((a, b) => (TEMPLATE_CARD[a.code]?.order ?? 99) - (TEMPLATE_CARD[b.code]?.order ?? 99)).map((t) => {
                const Icon = TEMPLATE_CARD[t.code]?.icon || Megaphone;
                return (
                  <button
                    key={t.code}
                    type="button"
                    role="radio"
                    aria-checked={tpl === t.code}
                    className={card(tpl === t.code)}
                    onClick={() => { setTpl(t.code); setParams({}); if (!title.trim()) setTitle(t.name); }}
                  >
                    {/* Ô biểu tượng loại tin: thẻ đang chọn màu nhấn, thẻ khác xám */}
                    <span className={clsx('icon-tile h-9 w-9', tpl !== t.code && 'bg-panel2 text-ink-2 ring-line')} aria-hidden="true">
                      <Icon size={18} strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 font-semibold text-ink [overflow-wrap:anywhere]">
                        {t.name}
                        <span className={clsx('h-2 w-2 shrink-0 rounded-full', risk(SEVERITY_LEVEL[t.severity]).fill)} title={`Mức ${LEVEL[t.severity]?.label?.toLowerCase()}`} aria-hidden="true" />
                      </span>
                      {TEMPLATE_CARD[t.code]?.when && <span className="block text-[11px] leading-snug text-muted">{TEMPLATE_CARD[t.code].when}</span>}
                    </span>
                  </button>
                );
              })}
              <button type="button" role="radio" aria-checked={!tpl} className={card(!tpl)} onClick={() => { setTpl(''); setParams({}); }}>
                <span className={clsx('icon-tile h-9 w-9', tpl && 'bg-panel2 text-ink-2 ring-line')} aria-hidden="true">
                  <Pencil size={18} strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink">Tự soạn</span>
                  <span className="block text-[11px] leading-snug text-muted">Viết tin riêng cho tình huống khác</span>
                </span>
              </button>
            </div>
          )}
        </div>
        {template && (
          <div className="grid gap-2 sm:grid-cols-2">
            {template.params.map((p) => field(
              `p_${p}`,
              PARAM_LABEL[p] || p,
              <input
                id={`soan-p_${p}`}
                ref={(el) => { paramRefs.current[p] = el; }}
                className={clsx('input tap', show(0, `p_${p}`, !!params[p]) && 'border-danger')}
                inputMode={NUMERIC.has(p) ? 'decimal' : undefined}
                placeholder={PARAM_EXAMPLE[p]}
                value={params[p] || ''}
                onChange={(e) => setParams((x) => ({ ...x, [p]: e.target.value }))}
                aria-invalid={!!show(0, `p_${p}`, !!params[p])}
                aria-describedby={`loi-soan-p_${p}`}
              />,
              0,
              !!params[p],
            ))}
          </div>
        )}
        {field('title', 'Tiêu đề lệnh *', (
          <input
            id="soan-title"
            ref={refs.title}
            className={clsx('input tap', show(0, 'title', !!title) && 'border-danger')}
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="VD: Di dời khẩn cấp khu Nà Pồng"
            aria-invalid={!!show(0, 'title', !!title)}
            aria-describedby="loi-soan-title"
          />
        ), 0, !!title)}
        {field('body', 'Nội dung tin *', (
          <textarea
            id="soan-body"
            ref={refs.body}
            className={clsx('input min-h-[120px] text-sm leading-relaxed', show(0, 'body', body.length > 0) && 'border-danger')}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Nội dung người dân nhận được: nguy cơ gì, ở đâu, làm gì ngay, gọi ai"
            aria-invalid={!!show(0, 'body', body.length > 0)}
            aria-describedby="loi-soan-body"
          />
        ), 0, body.length > 0, (
          <span className={clsx('text-[11px]', sms(body.length) > 3 ? 'font-semibold text-serious' : 'text-muted')}>
            {int(body.length)} ký tự · {sms(body.length)} SMS mỗi người nhận{sms(body.length) > 3 ? ' — tin dài, cân nhắc rút gọn' : ''}
          </span>
        ))}
        <div>
          <div className="mb-1 font-medium" id="muc-canh-bao">Mức cảnh báo</div>
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-labelledby="muc-canh-bao">
            {['do', 'cam', 'vang'].map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={severity === s}
                onClick={() => setSeverity(s)}
                className={clsx(
                  'tap flex min-h-[44px] items-center justify-center rounded-lg border-2 px-1 text-center text-xs font-semibold',
                  severity === s ? clsx(LEVEL[s].cls, 'border-transparent') : 'border-line bg-panel2/50 text-ink-2',
                )}
              >
                {LEVEL[s].label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  } else if (step === 1) {
    content = (
      <div className="flex flex-col gap-3 text-sm" ref={refs.area} tabIndex={-1}>
        {polygon ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/50 bg-accent/10 p-2.5 text-xs">
            <MapPinned size={16} className="shrink-0 text-accent" aria-hidden="true" />
            <span className="min-w-0 flex-1">Vùng khoanh trên Bản đồ giám sát ({alertDraft?.stats?.area_km2} km²) — tin phát theo vùng vẽ</span>
            <button type="button" className="btn-ghost tap px-2 text-xs text-danger" onClick={() => setAlertDraft(null)}><X size={13} aria-hidden="true" /> Bỏ vùng vẽ</button>
          </div>
        ) : (
          <>
            {presets.length > 0 && (
              <div>
                <div className="mb-1 font-medium">Lưu vực / nhóm xã chọn nhanh</div>
                <div className="flex flex-wrap gap-1.5">
                  {presets.map((p) => (
                    <button key={p.code} type="button" className={chip(preset?.code === p.code)} aria-pressed={preset?.code === p.code} onClick={() => setCodes(preset?.code === p.code ? [] : p.unit_codes)}>
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">Xã / phường nhận tin {codes.length > 0 && <span className="text-accent">· đã chọn {codes.length}</span>}</span>
                <button type="button" className="btn-ghost tap px-2.5 text-xs" onClick={() => navigate('/ban-do?cong-cu=khoanh')} title="Khoanh vùng trên Bản đồ giám sát rồi bấm “Cảnh báo vùng này”">
                  <MapPinned size={13} aria-hidden="true" /> Vẽ vùng trên bản đồ
                </button>
              </div>
              {codes.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Xã đã chọn">
                  {codes.map((c) => (
                    <button key={c} type="button" className="chip tap min-h-[32px] border border-accent bg-accent/10 px-2.5 text-accent" onClick={() => toggle(c)} aria-label={`Bỏ ${unitName(c)}`}>
                      {unitName(c)} <X size={12} aria-hidden="true" />
                    </button>
                  ))}
                  <button type="button" className="tap px-2 text-xs font-semibold text-danger" onClick={() => setCodes([])}>Bỏ chọn hết</button>
                </div>
              )}
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
                <input className="input tap min-h-[40px] pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm xã / phường…" aria-label="Tìm xã / phường nhận tin" />
              </div>
              {nq && filtered.length > 1 && (
                <button type="button" className="btn-ghost tap mt-1.5 px-2.5 text-xs" onClick={() => setCodes((cs) => [...new Set([...cs, ...filtered.map((u) => u.code)])])}>
                  <Check size={13} aria-hidden="true" /> Chọn cả {filtered.length} xã đang lọc
                </button>
              )}
              <ul className="mt-1.5 flex flex-col gap-1" aria-label="Danh sách xã / phường">
                {listed.visible.map((u) => {
                  const on = codes.includes(u.code);
                  return (
                    <li key={u.code}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => toggle(u.code)}
                        className={clsx('tap flex min-h-[40px] w-full items-center gap-2 rounded-lg border px-2.5 text-left', on ? 'border-accent bg-accent/10' : 'border-line hover:bg-panel2')}
                      >
                        <span className={clsx('flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-accent bg-accent text-white' : 'border-muted')} aria-hidden="true">{on && <Check size={11} />}</span>
                        <span className="min-w-0 flex-1 truncate">{u.unit_type === 'phuong' ? 'Phường' : 'Xã'} {u.name}</span>
                        {u.households ? <span className="num shrink-0 text-[11px] text-muted">{int(u.households)} hộ</span> : null}
                      </button>
                    </li>
                  );
                })}
                {!filtered.length && <li className="py-3 text-center text-xs text-muted">Không có xã / phường khớp “{search}”</li>}
              </ul>
              <ShowMore list={listed} step={12} noun="xã" />
            </div>
          </>
        )}
        <FieldError id="loi-soan-area">{show(1, 'area', false)}</FieldError>
        <Audience q={audienceQ} audience={audience} />
      </div>
    );
  } else {
    content = (
      <div className="flex flex-col gap-3 text-sm">
        <div ref={refs.channels} tabIndex={-1}>
          <div className="mb-1 font-medium">Kênh phát</div>
          <div className="grid grid-cols-2 gap-1.5">
            {Object.entries(CHANNEL).map(([k, v]) => {
              const on = channels.includes(k);
              const [field2, unit] = REACH[k];
              return (
                <button
                  key={k}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => setChannels((c) => (on ? c.filter((x) => x !== k) : [...c, k]))}
                  className={clsx('tap flex min-h-[48px] flex-col items-start justify-center rounded-lg border-2 px-2.5 text-left', on ? 'border-accent bg-accent/10' : 'border-line bg-panel2/50')}
                >
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                    <span className={clsx('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-accent bg-accent text-white' : 'border-muted')} aria-hidden="true">{on && <Check size={11} />}</span>
                    {v}
                  </span>
                  {audience && <span className="text-[11px] text-muted">{int(audience[field2])} {unit}</span>}
                </button>
              );
            })}
          </div>
          <FieldError id="loi-soan-channels">{show(2, 'channels', false)}</FieldError>
        </div>
        <div>
          <div className="mb-1 font-medium" id="hieu-luc">Hiệu lực (tính từ lúc lãnh đạo duyệt)</div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby="hieu-luc">
            {ALERT_VALID_HOURS.map(([h, label]) => (
              <button key={h} type="button" role="radio" aria-checked={validHours === h} className={chip(validHours === h)} onClick={() => setValidHours(h)}>{label}</button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted">Hết hạn thì thôi hiện cho người dân; còn nguy hiểm thì gia hạn, hết nguy hiểm sớm thì kết thúc.</p>
        </div>
        <div className="rounded-lg border border-line bg-panel2/40 p-2.5">
          <div className="mb-1.5 text-xs font-semibold text-muted">Xem lại trước khi gửi</div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={clsx('chip', LEVEL[severity].cls)}>{LEVEL[severity].label}</span>
            <b className="min-w-0 text-ink [overflow-wrap:anywhere]">{title || '(chưa có tiêu đề)'}</b>
          </div>
          {/* Khung điện thoại: tin đúng như người dân nhận */}
          <figure className="mx-auto mt-2 w-full max-w-[280px] rounded-[24px] border-[5px] border-ink/70 bg-panel p-2 shadow-sm">
            <figcaption className="mb-1.5 flex items-center gap-1.5 border-b border-line pb-1.5 text-[11px] font-semibold text-muted">
              <Smartphone size={12} aria-hidden="true" /> Người dân nhận được
            </figcaption>
            <p className="whitespace-pre-wrap rounded-xl rounded-tl-sm bg-panel2 px-2.5 py-2 text-xs leading-relaxed text-ink [overflow-wrap:anywhere]">{body || '(chưa có nội dung)'}</p>
            <div className="mt-1 text-right text-[11px] text-muted">{sms(body.length)} tin SMS</div>
          </figure>
          <ul className="mt-1.5 flex flex-col gap-0.5 text-xs text-ink-2">
            <li>Vùng: {polygon ? `vùng vẽ ${alertDraft?.stats?.area_km2 ?? ''} km²` : `${codes.length} xã/phường — ${codes.slice(0, 5).map(unitName).join(', ')}${codes.length > 5 ? '…' : ''}`}</li>
            {audience && <li>Người nhận: {int(audience.households)} hộ · {int(audience.subscribers)} thuê bao · {int(audience.speakers)} loa</li>}
            <li>Kênh: {channels.map((c) => CHANNEL[c]).join(', ') || '—'} · {sms(body.length)} SMS / người</li>
            <li>Hiệu lực: {ALERT_VALID_HOURS.find(([h]) => h === validHours)?.[1]} kể từ khi duyệt</li>
          </ul>
          <p className="mt-1.5 text-[11px] font-medium text-serious">Lệnh chỉ phát sau khi lãnh đạo (không phải người soạn) ký duyệt bằng PIN.</p>
        </div>
      </div>
    );
  }

  return (
    <Section title="Soạn lệnh cảnh báo" right={<Megaphone size={16} className="text-accent" aria-hidden="true" />}>
      <StepChips steps={STEPS} step={step} onStep={setStep} done={[valid(0), valid(1), valid(2)]} disabled={sending} />
      {content}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
        {step > 0 ? (
          <button type="button" className={clsx('btn-ghost', big)} onClick={() => setStep(step - 1)} disabled={sending}><ChevronLeft size={15} aria-hidden="true" /> Quay lại</button>
        ) : <span className="sm:hidden" />}
        {step < 2 ? (
          <button type="button" className={clsx('btn-primary', big)} onMouseDown={(e) => e.preventDefault()} onClick={next}>Tiếp <ChevronRight size={15} aria-hidden="true" /></button>
        ) : (
          <button
            type="button"
            className={clsx('btn-danger font-bold', big)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={submit}
            disabled={sending || !online || !auth}
            title={!online ? 'Mất mạng — chưa gửi được' : undefined}
          >
            {sending ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />} Gửi lãnh đạo phê duyệt
          </button>
        )}
      </div>
    </Section>
  );
}

/** Ước tính người nhận trong vùng: hộ · thuê bao · loa (máy chủ nội suy theo diện tích giao cắt từng xã). */
function Audience({ q, audience }) {
  if (!audience && !q.isFetching && !q.isError) return null;
  return (
    <div className="grid grid-cols-3 gap-2 rounded-lg bg-panel2 p-2 text-center text-xs" aria-live="polite">
      {q.isError && !audience ? (
        <p className="col-span-3 text-danger">Chưa ước tính được người nhận — vẫn gửi được, máy chủ tính lại khi gửi</p>
      ) : !audience ? (
        <p className="col-span-3 text-muted"><Loader2 size={13} className="mr-1 inline animate-spin" aria-hidden="true" /> Đang ước tính người nhận…</p>
      ) : (
        <>
          <div><div className="num text-base font-semibold text-ink">{int(audience.households)}</div>hộ dân</div>
          <div><div className="num text-base font-semibold text-ink">{int(audience.subscribers)}</div>thuê bao</div>
          <div><div className="num text-base font-semibold text-ink">{int(audience.speakers)}</div>loa phường/xã</div>
        </>
      )}
    </div>
  );
}
