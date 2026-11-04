import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCopy, Loader2, Phone, Route, Send, ShieldCheck, TriangleAlert } from 'lucide-react';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { FieldError, Modal } from './ui';
import { MissionLinkBox } from './MissionLink';
import QtyStepper from './QtyStepper';
import { useAllowedCodes, usePermission } from '../../rbac/usePermission';
import { distanceKm } from '../../utils/geo';
import { risk, sosLevel } from '../../utils/risk';
import { slaState } from '../../utils/sla';
import { durWords } from '../rescue/rescueFacts';
import { FORCE_TYPE, INCIDENT, ITEM_NAME, PRIORITY, SKILL, VEHICLE, VULNERABLE } from '../../utils/labels';

const STEPS = ['Chọn đội', 'Vật tư mang theo', 'Xác nhận'];
const STEP_FIELDS = [['force', 'personnel'], ['supplies', 'warehouse'], []];
const touchCls = 'min-h-[44px]';
const label = 'mb-1.5 text-xs font-bold text-ink-2';

/**
 * Lệnh điều động (thiết kế C.3, D.3): hệ thống gợi ý nhu cầu + đội, phương tiện gần nhất → phát lệnh. Ba bước:
 * 1. Chọn đội — đội gợi ý viết thành câu (loại lực lượng · cách bao xa · số người sẵn sàng · kỹ năng), phương tiện, quân số
 *    bằng nút −/+ (không vượt số người sẵn sàng của đội);
 * 2. Vật tư mang theo — nhu cầu hệ thống gợi ý, kho xuất (gần nhất, đủ hàng lên đầu) hoặc chỉ ghi nhu cầu;
 * 3. Xác nhận — tóm tắt lệnh rồi mới phát (không hoàn tác được: đổi trạng thái đội, trừ kho, gửi lệnh).
 * Bản vẽ desktop C2 – C2c: tiêu đề "Điều đội cho SOS-…" + "Bước n/3", thanh bước vòng số nối vạch, tóm tắt phiếu có vạch màu
 * mức ưu tiên; bước 2 sửa được số lượng từng mặt hàng (gợi ý theo loại sự cố và số người), ghi "kho còn" khi đã chọn kho.
 * Sau khi phát: quãng đường, giờ dự kiến tới, đường đi có an toàn không — nói bằng câu; nút "Gọi trưởng nhóm", "Sao chép lệnh
 * gửi Zalo", link nhiệm vụ. Lỗi hiện ngay dưới ô; bấm "Tiếp" / "Phát lệnh" khi còn thiếu → hiện lỗi, đưa con trỏ tới ô lỗi.
 */
export default function DispatchModal({ ticket, presetForceId, onClose }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const allowed = usePermission('dispatch', 'create', ticket?.admin_code);
  const [step, setStep] = useState(0);
  const [forceId, setForceId] = useState(presetForceId || null);
  const [vehicleIds, setVehicleIds] = useState([]);
  const [personnelText, setPersonnelText] = useState('3');
  const [shown, setShown] = useState({}); // ô đã được "chạm" (bấm Tiếp / Phát lệnh) → hiện lỗi
  const refs = { force: useRef(null), personnel: useRef(null), supplies: useRef(null), warehouse: useRef(null) };
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [warehouseId, setWarehouseId] = useState(''); // '' = chỉ ghi nhu cầu vật tư, không trừ kho
  const [allForces, setAllForces] = useState(false);
  const [qty, setQty] = useState({}); // số lượng vật tư mang theo (chuỗi — để trống được), khởi tạo theo gợi ý
  const issueCodes = useAllowedCodes('inventory', 'issue'); // null = toàn tỉnh
  const { data: allWarehouses = [] } = useQuery({
    queryKey: ['warehouses', 'dispatch'],
    queryFn: () => api('/resources/warehouses'),
    enabled: !!ticket,
  });

  // Không có quyền điều động (VD cán bộ xã kéo phiếu sang "Đang tìm đội"): không gọi /match (403) — trước đây hộp
  // thoại quay "Đang quét lực lượng…" mãi
  const { data: match, isLoading, error: matchError, refetch } = useQuery({
    queryKey: ['match', ticket?.id],
    queryFn: () => api(`/sos/${ticket.id}/match`),
    enabled: !!ticket && allowed,
    retry: 1,
  });

  useEffect(() => {
    if (!match) return;
    setPersonnelText(String(match.needs.personnel));
    setQty(Object.fromEntries(Object.entries(match.needs.supplies || {}).map(([c, n]) => [c, String(n)])));
    if (!presetForceId && match.forces[0]) setForceId(match.forces[0].id);
    const wanted = Object.entries(match.needs.vehicles);
    const picks = [];
    for (const [type, n] of wanted) {
      match.vehicles.filter((v) => v.vehicle_type === type).slice(0, n).forEach((v) => picks.push(v.id));
    }
    if (!picks.length && match.vehicles[0]) picks.push(match.vehicles[0].id);
    setVehicleIds(picks);
  }, [match, presetForceId]);

  // Chọn đội ít người hơn gợi ý → quân số tự hạ về số người sẵn sàng của đội (máy chủ cũng chỉ điều tối đa chừng đó) và
  // ghi rõ dưới ô — trước đây ô vẫn ghi số gợi ý trong khi lệnh thật điều ít hơn
  useEffect(() => {
    const f = match?.forces.find((x) => x.id === forceId);
    if (!f) return;
    setPersonnelText((t) => (Number.isInteger(Number(t)) && Number(t) > f.personnel_ready ? String(f.personnel_ready) : t));
  }, [match, forceId]);

  const itemCodes = useMemo(() => Object.keys(match?.needs.supplies || {}), [match]);
  const supplies = useMemo(
    () => Object.fromEntries(itemCodes.map((c) => [c, Math.max(0, Math.trunc(Number(qty[c]) || 0))]).filter(([, n]) => n > 0)),
    [itemCodes, qty],
  );
  const qtyBad = itemCodes.find((c) => !(qty[c] !== '' && Number.isInteger(Number(qty[c])) && Number(qty[c]) >= 0));
  const stores = useMemo(() => {
    if (!ticket) return [];
    return allWarehouses
      .filter((w) => !issueCodes || issueCodes.includes(w.admin_code))
      .map((w) => {
        const stock = Object.fromEntries(w.items.map((i) => [i.item_code, i.quantity]));
        const short = Object.entries(supplies).filter(([code, n]) => n > 0 && (stock[code] || 0) < n).map(([code]) => code);
        const units = Object.fromEntries(w.items.map((i) => [i.item_code, i.unit]));
        return { ...w, km: distanceKm(ticket.lat, ticket.lon, w.lat, w.lon), short, stock, units };
      })
      .sort((a, b) => a.short.length - b.short.length || a.km - b.km);
  }, [allWarehouses, issueCodes, supplies, ticket]);
  const chosen = stores.find((w) => w.id === warehouseId);

  if (!ticket) return null;
  const pr = PRIORITY[ticket.priority] || PRIORITY[2];
  const presetMissing = presetForceId && match && !match.forces.some((f) => f.id === presetForceId);
  const force = match?.forces.find((f) => f.id === forceId);
  const personnel = Number(personnelText);
  const errors = {
    force: !force ? 'Chọn một đội' : null,
    personnel: !(Number.isInteger(personnel) && personnel >= 1)
      ? 'Quân số là số nguyên từ 1 trở lên'
      : force && personnel > force.personnel_ready ? `${force.name} chỉ còn ${force.personnel_ready} người sẵn sàng` : null,
    supplies: qtyBad ? `Số lượng ${ITEM_NAME[qtyBad] || qtyBad} là số nguyên từ 0 trở lên` : null,
    warehouse: chosen?.short.length > 0 ? 'Kho này không đủ hàng — chọn kho khác hoặc chỉ ghi nhu cầu.' : null,
  };
  // Quân số / kho: báo ngay khi chọn sai; đội: sau khi bấm Tiếp
  const err = (k) => (k === 'force' && !shown.force ? null : errors[k]);
  const guard = (i) => {
    const bad = STEP_FIELDS[i].filter((k) => errors[k]);
    if (!bad.length) return true;
    setShown((s) => ({ ...s, ...Object.fromEntries(bad.map((k) => [k, true])) }));
    refs[bad[0]].current?.focus();
    return false;
  };
  const chosenVehicles = (match?.vehicles || []).filter((v) => vehicleIds.includes(v.id));
  const next = () => guard(step) && setStep(step + 1);

  const submit = async () => {
    for (let i = 0; i < STEPS.length; i += 1) {
      if (!guard(i)) {
        setStep(i);
        return;
      }
    }
    setBusy(true);
    try {
      const res = await api('/dispatch', {
        method: 'POST',
        body: { ticket_id: ticket.id, force_id: forceId, vehicle_ids: vehicleIds, personnel, supplies, warehouse_id: warehouseId || null },
      });
      setResult(res);
      qc.invalidateQueries({ queryKey: ['sos'] });
      qc.invalidateQueries({ queryKey: ['map-layers'] });
      if (warehouseId) qc.invalidateQueries({ queryKey: ['warehouses'] });
      toast({ tone: 'good', title: `Đã phát lệnh điều động ${ticket.code}`, body: `Dự kiến đến sau ${res.route.duration_min} phút · ${res.route.distance_km} km` });
    } catch (e) {
      toast({ tone: 'danger', title: 'Không phát được lệnh', body: e.message });
    } finally {
      setBusy(false);
    }
  };
  const ready = allowed && !!match && !matchError;
  const copyOrder = (text) => navigator.clipboard?.writeText(text).then(
    () => toast({ tone: 'good', title: 'Đã sao chép lệnh — dán vào Zalo / tin nhắn gửi trưởng nhóm' }),
    () => toast({ tone: 'danger', title: 'Không sao chép được — chép tay nội dung lệnh ở trên' }),
  );

  const btnGhost = clsx('btn-secondary whitespace-nowrap', touchCls);
  const sla = slaState(ticket, Date.now()); // cùng đồng hồ chờ với thẻ phiếu (hạn phản hồi)
  const wait = sla ? durWords(sla.waitedSec) : null;
  const summary = (
    <div className={clsx('mb-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl border-l-4 bg-panel2 px-3.5 py-2.5', risk(sosLevel(ticket.priority)).edge)}>
      <span className={clsx('chip py-0.5 text-xs font-bold', pr?.cls)} title={pr?.label}>Cấp {ticket.priority} · {pr?.short}</span>
      <b className="text-sm">{INCIDENT[ticket.incident_type] || ticket.incident_type} · {ticket.trapped_count ?? 0} người</b>
      <span className="text-[13px] text-ink-2">
        {ticket.address || ticket.admin_name}{ticket.admin_name && ticket.address && ticket.address !== ticket.admin_name ? ` (${ticket.admin_name})` : ''}
        {wait && !result && ` · chờ ${wait}`}
      </span>
      {(ticket.vulnerable || []).map((v) => <span key={v} className="chip bg-danger/15 py-0 text-[11px] font-medium text-danger">{VULNERABLE[v] || v}</span>)}
    </div>
  );

  let footer;
  if (result) {
    footer = <button type="button" className={clsx('btn-primary', touchCls)} onClick={onClose}>Đóng</button>;
  } else {
    footer = (
      <>
        {step > 0 && (
          <button type="button" className={clsx(btnGhost, 'mr-auto')} onClick={() => setStep(step - 1)} disabled={busy}>
            <ChevronLeft size={15} aria-hidden="true" /> Quay lại
          </button>
        )}
        {step === 0 && !allowed && <span className="mr-auto self-center text-xs text-danger">Bạn không có quyền điều động tại địa bàn này</span>}
        {/* Điện thoại, bước 2–3: bỏ "Huỷ" (còn nút ✕) — ba nút một hàng không vừa 360 px */}
        <button type="button" className={clsx(btnGhost, step > 0 && 'max-sm:hidden')} onClick={onClose} disabled={busy}>Huỷ</button>
        {step < 2 ? (
          <button type="button" className={clsx('btn-primary', touchCls)} disabled={!ready} onClick={next}>
            {step === 0 ? 'Tiếp: vật tư mang theo' : 'Tiếp: xác nhận'} <ChevronRight size={15} aria-hidden="true" />
          </button>
        ) : (
          <button type="button" className={clsx('btn-primary', touchCls)} disabled={!ready || busy} onClick={submit}>
            {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />} Phát lệnh điều động
          </button>
        )}
      </>
    );
  }

  const row = (k, v) => (
    <div className="flex gap-3 border-t border-line py-2.5 text-sm first:border-t-0">
      <dt className="w-36 shrink-0 text-ink-2">{k}</dt>
      <dd className="min-w-0 flex-1 font-semibold">{v}</dd>
    </div>
  );

  return (
    <Modal
      open
      size="md"
      onClose={onClose}
      title={`Điều đội cho ${ticket.code}`}
      subtitle={result ? 'Đã phát lệnh' : step === 2 ? 'Bước 3/3 — kiểm tra trước khi phát lệnh' : `Bước ${step + 1}/3`}
      footer={footer}
    >
      {result ? (
        <div className="flex flex-col gap-3">
          {summary}
          <div className="flex items-center gap-2 text-good"><CheckCircle2 size={20} aria-hidden="true" /> <b>Đã ghi lệnh điều động {ticket.code}</b></div>
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-xl bg-panel2 p-2.5"><div className="text-xs text-muted">Quãng đường</div><b className="num">{result.route.distance_km} km</b></div>
            <div className="rounded-xl bg-panel2 p-2.5"><div className="text-xs text-muted">Dự kiến đến sau</div><b className="num">{result.route.duration_min} phút</b></div>
            <div className="rounded-xl bg-panel2 p-2.5">
              <div className="text-xs text-muted">Đường đi</div>
              <b className={result.route.safe ? 'text-good' : 'text-danger'}>
                {result.route.safe
                  ? 'An toàn — né mọi vùng nguy hiểm đã ghi nhận'
                  : `Phải đi qua vùng nguy hiểm${result.route.hazards?.length ? `: ${result.route.hazards.join(', ')}` : ''} — nhắc đội cẩn trọng`}
              </b>
            </div>
          </div>
          {chosen && (
            <div className="text-xs text-ink-2">
              Đã xuất từ <b>{chosen.name}</b>: {Object.entries(supplies).map(([code, n]) => `${n} ${ITEM_NAME[code] || code}`).join(', ')}
            </div>
          )}
          <div className="text-xs text-muted">
            Tuyến: {result.route.roads.join(' → ') || 'đường địa phương'}
            {result.route.offroad_km >= 0.5 && ` · ${result.route.offroad_km} km chưa có dữ liệu đường`}
          </div>
          {result.route.warnings?.length > 0 && (
            <ul className="list-inside list-disc rounded-lg border border-warn/50 bg-warn/5 p-2 text-xs text-ink-2">
              {result.route.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}
          {/* Chưa tích hợp SMS / thông báo đẩy: hệ thống KHÔNG tự báo cho đội — trực ban phải gọi / nhắn ngay */}
          <div className={clsx('rounded-xl p-3 text-sm', result.notification.sent ? 'border border-accent/40 bg-accent/10' : 'border-2 border-warn bg-warn/10')}>
            {result.notification.sent ? (
              <div className="text-xs font-semibold text-accent">Đã gửi lệnh tới trưởng nhóm {result.notification.to}</div>
            ) : (
              <div className="flex items-center gap-1.5 font-semibold text-ink">
                <TriangleAlert size={15} className="text-warn" aria-hidden="true" /> Hệ thống chưa gửi tin cho đội — gọi hoặc nhắn trưởng nhóm ngay
              </div>
            )}
            <div className="mt-1 text-[13px] [overflow-wrap:anywhere]">{result.notification.message}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {result.notification.to && (
                <a className={clsx('btn-primary px-3 text-sm', touchCls)} href={`tel:${result.notification.to.replace(/\s/g, '')}`}>
                  <Phone size={14} aria-hidden="true" /> Gọi trưởng nhóm
                </a>
              )}
              <button type="button" className={clsx('btn-secondary px-3 text-sm', touchCls)} onClick={() => copyOrder(result.notification.message)}>
                <ClipboardCopy size={14} aria-hidden="true" /> Sao chép lệnh gửi Zalo
              </button>
            </div>
          </div>
          {result.notification.mission_url && (
            <MissionLinkBox url={result.notification.mission_url} expiresAt={result.notification.mission_expires_at} />
          )}
        </div>
      ) : (
        <>
          {/* Thanh bước: vòng số nối vạch — bấm được để quay lại bước đã qua (không nhảy cóc sang bước chưa điền) */}
          <ol className="mb-4 flex items-center gap-2" aria-label="Các bước lệnh điều động">
            {STEPS.map((s, i) => (
              <li key={s} className={clsx('flex min-w-0 items-center gap-2', i < STEPS.length - 1 && 'flex-1')}>
                <button
                  type="button"
                  disabled={i >= step || busy || !match}
                  onClick={() => setStep(i)}
                  aria-current={i === step ? 'step' : undefined}
                  className={clsx('tap flex shrink-0 items-center gap-2 rounded-full text-sm disabled:opacity-100', i === step ? 'font-semibold text-accent' : i < step ? 'text-ink hover:underline' : 'text-ink-2')}
                >
                  <span
                    className={clsx(
                      'flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold',
                      i === step ? 'bg-accent text-white' : i < step ? 'bg-good text-white' : 'border border-line bg-panel text-ink-2',
                    )}
                    aria-hidden="true"
                  >
                    {i < step ? <Check size={15} strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="whitespace-nowrap max-sm:sr-only">{s}</span>
                </button>
                {i < STEPS.length - 1 && <span className="h-px min-w-4 flex-1 bg-line" aria-hidden="true" />}
              </li>
            ))}
          </ol>

          {summary}

          {!allowed ? (
            <div className="rounded-xl border border-warn/60 bg-warn/10 p-3 text-sm text-ink">
              Phiếu đã chuyển sang <b>Đang tìm đội</b>. Tài khoản của bạn không có quyền phát lệnh điều động tại địa bàn này —
              báo trực ban tỉnh để điều đội.
            </div>
          ) : matchError ? (
            <div className="flex flex-col items-start gap-2 rounded-xl border border-danger/50 bg-danger/5 p-3 text-sm">
              <span>Không tải được danh sách đội: {matchError.message}</span>
              <button type="button" className={clsx('btn-secondary px-3 text-xs', touchCls)} onClick={() => refetch()}>Thử lại</button>
            </div>
          ) : isLoading || !match ? (
            <div className="flex items-center gap-2 py-8 text-muted"><Loader2 className="animate-spin" size={16} aria-hidden="true" /> Đang tìm đội, phương tiện gần nhất…</div>
          ) : step === 0 ? (
            <>
              <div className={label}>Đội sẵn sàng gần nhất <span className="font-normal text-muted">(trong bán kính {match.radius_km} km)</span></div>
              {presetMissing && <p className="mb-1 text-xs text-warn">Đội được kéo thả không còn người sẵn sàng trong bán kính — chọn đội khác.</p>}
              <div
                ref={refs.force}
                tabIndex={-1}
                role="radiogroup"
                aria-label="Đội cứu hộ"
                aria-invalid={!!err('force')}
                aria-describedby="loi-don-vi"
                className={clsx('flex flex-col gap-2 rounded-xl outline-none', err('force') && 'ring-1 ring-danger')}
              >
                {match.forces.filter((f, i) => allForces || i < 3 || f.id === forceId).map((f, i) => (
                  <label
                    key={f.id}
                    className={clsx(
                      'flex cursor-pointer items-center gap-3 rounded-[14px] border-2 px-3.5 py-2.5 transition-colors',
                      forceId === f.id ? 'border-accent bg-accent/5' : 'border-transparent bg-panel2 hover:border-line',
                    )}
                  >
                    <input type="radio" name="force" checked={forceId === f.id} onChange={() => setForceId(f.id)} className="h-5 w-5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5 text-[15px] font-semibold leading-snug">
                        {f.name}
                        {i === 0 && <span className="chip bg-good/15 py-0 text-xs font-semibold text-good">Gợi ý</span>}
                      </span>
                      {/* Gợi ý viết thành câu: loại lực lượng · kỹ năng phù hợp · bao nhiêu người sẵn sàng */}
                      <span className="block text-[13px] text-ink-2">
                        {FORCE_TYPE[f.org_type] || 'Lực lượng'}
                        {f.skill_match.length > 0 && ` · ${f.skill_match.map((x) => SKILL[x] || x).join(', ').toLowerCase()}`} · {f.personnel_ready} người sẵn sàng
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <b className="num block">{f.distance_km} km</b>
                      <span className="text-xs text-muted">cách phiếu</span>
                    </span>
                    <a href={`tel:${f.contact_phone.replace(/\s/g, '')}`} className="tap-sq flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-accent hover:bg-accent/10" title={`Gọi ${f.commander}`} aria-label={`Gọi ${f.commander}`} onClick={(e) => e.stopPropagation()}>
                      <Phone size={16} aria-hidden="true" />
                    </a>
                  </label>
                ))}
                {!match.forces.length && <p className="text-sm text-danger">Không còn đội sẵn sàng trong bán kính tìm.</p>}
                {/* 3 đội gần nhất trước (vừa một màn hình máy tính — bản vẽ C2); bấm để xem các đội còn lại */}
                {!allForces && match.forces.length > 3 && (
                  <button type="button" className={clsx('btn-ghost self-start px-2 text-sm text-accent', touchCls)} onClick={() => setAllForces(true)}>
                    Xem thêm {match.forces.filter((f, i) => i >= 3 && f.id !== forceId).length} đội <ChevronRight size={15} aria-hidden="true" />
                  </button>
                )}
              </div>
              <FieldError id="loi-don-vi">{err('force')}</FieldError>

              <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_290px]">
                <div>
                  <div className={label}>Phương tiện rảnh gần nhất</div>
                  <div className="scroll-thin flex max-h-48 flex-col overflow-y-auto">
                    {match.vehicles.map((v) => (
                      <label key={v.id} className={clsx('flex cursor-pointer items-center gap-2.5 rounded-lg px-1 hover:bg-panel2', touchCls)}>
                        <input
                          type="checkbox"
                          className="h-5 w-5 shrink-0"
                          checked={vehicleIds.includes(v.id)}
                          onChange={(e) => setVehicleIds((ids) => (e.target.checked ? [...ids, v.id] : ids.filter((x) => x !== v.id)))}
                        />
                        <span className="text-sm">{VEHICLE[v.vehicle_type]} <b>{v.code}</b></span>
                        <span className="ml-auto text-right text-xs text-muted">{v.distance_km} km · nhiên liệu {v.fuel_level == null ? 'chưa cập nhật' : `${v.fuel_level}%`}</span>
                      </label>
                    ))}
                    {!match.vehicles.length && <p className="text-sm text-muted">Không có phương tiện chuyên dụng rảnh trong bán kính.</p>}
                  </div>
                </div>
                <div>
                  <label htmlFor="quan-so-dieu-dong" className={clsx(label, 'block')}>
                    Quân số đi * {force && <span className="font-normal text-muted">(tối đa {force.personnel_ready})</span>}
                  </label>
                  <QtyStepper
                    id="quan-so-dieu-dong"
                    ref={refs.personnel}
                    value={personnelText}
                    onChange={setPersonnelText}
                    min={1}
                    max={force?.personnel_ready}
                    steps={[1, 5]}
                    unit="người"
                    invalid={!!err('personnel')}
                    describedBy="loi-quan-so"
                  />
                  <FieldError id="loi-quan-so">{err('personnel')}</FieldError>
                  {force && match.needs.personnel > force.personnel_ready ? (
                    <p className="mt-1 text-xs font-semibold text-warn">
                      Hệ thống gợi ý {match.needs.personnel} người nhưng đội này chỉ còn {force.personnel_ready} người sẵn sàng —
                      cần thêm thì điều thêm đội khác sau khi phát lệnh.
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted">Hệ thống gợi ý: {match.needs.personnel} người.</p>
                  )}
                </div>
              </div>
            </>
          ) : step === 1 ? (
            <>
              <p className="mb-3 rounded-xl bg-panel2 px-3.5 py-2.5 text-sm text-ink-2">
                <b className="text-ink">Hệ thống gợi ý mang theo</b> theo loại sự cố ({(INCIDENT[ticket.incident_type] || ticket.incident_type).toLowerCase()})
                {' '}và {ticket.trapped_count ?? 0} người cần cứu — sửa số nếu cần.
                {Object.entries(match.needs.vehicles).length > 0 && ` Phương tiện gợi ý: ${Object.entries(match.needs.vehicles).map(([t, n]) => `${n} ${(VEHICLE[t] || t).toLowerCase()}`).join(', ')}.`}
              </p>
              {itemCodes.length ? (
                <div className="flex flex-col gap-2" role="group" aria-label="Vật tư mang theo" aria-describedby="loi-vat-tu">
                  {itemCodes.map((code) => {
                    const id = `vat-tu-${code}`;
                    const bad = code === qtyBad;
                    const lacking = chosen && (chosen.stock[code] || 0) < (supplies[code] || 0);
                    return (
                      <div key={code} className="flex items-center gap-3 rounded-[14px] bg-panel2 px-3.5 py-2">
                        <label htmlFor={id} className="min-w-0 flex-1 text-[15px] font-semibold">{ITEM_NAME[code] || code}</label>
                        <input
                          id={id}
                          ref={bad ? refs.supplies : undefined}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          className={clsx('input tap h-11 w-20 text-right font-mono text-base sm:w-24', bad && 'border-danger')}
                          value={qty[code] ?? ''}
                          onChange={(e) => setQty((q) => ({ ...q, [code]: e.target.value }))}
                          aria-invalid={bad}
                        />
                        <span className={clsx('w-20 shrink-0 text-[13px] sm:w-36', lacking ? 'font-semibold text-danger' : 'text-muted')}>
                          {chosen ? `kho còn ${chosen.stock[code] || 0}${chosen.units[code] ? ` ${chosen.units[code]}` : ''}` : `gợi ý ${match.needs.supplies[code]}`}
                        </span>
                      </div>
                    );
                  })}
                  <FieldError id="loi-vat-tu">{errors.supplies}</FieldError>
                  <label className="mt-2 flex flex-col">
                    <span className={label}>Xuất từ kho (tuỳ chọn)</span>
                    <select
                      ref={refs.warehouse}
                      className={clsx('input', touchCls, err('warehouse') && 'border-danger')}
                      value={warehouseId}
                      onChange={(e) => setWarehouseId(e.target.value)}
                      aria-invalid={!!err('warehouse')}
                      aria-describedby="loi-kho"
                    >
                      <option value="">Chỉ ghi nhu cầu — không trừ kho</option>
                      {stores.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} · cách {w.km.toFixed(1)} km{w.short.length ? ` · thiếu ${w.short.map((c) => ITEM_NAME[c] || c).join(', ')}` : ' · đủ hàng'}
                        </option>
                      ))}
                    </select>
                    <FieldError id="loi-kho">{err('warehouse')}</FieldError>
                  </label>
                  <p className="rounded-[14px] border border-dashed border-line p-3 text-[13px] leading-normal text-ink-2">
                    Chọn kho: trừ tồn kho cùng lúc phát lệnh — kho không đủ hàng thì không phát được. Không chọn kho: lệnh chỉ ghi
                    nhu cầu, trực ban tự xuất kho riêng khi đội nhận hàng.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted">Phiếu này không cần mang vật tư.</p>
              )}
            </>
          ) : (
            <>
              <dl className="border-y border-line">
                {row('Đội', force ? `${force.name} · ${personnelText} người` : '—')}
                {row('Phương tiện', chosenVehicles.length ? chosenVehicles.map((v) => `${VEHICLE[v.vehicle_type] || ''} ${v.code}`.trim()).join(', ') : 'Không kèm phương tiện')}
                {row('Vật tư', Object.keys(supplies).length
                  ? `${Object.entries(supplies).map(([c, n]) => `${ITEM_NAME[c] || c} ${n}`).join(' · ')} — ${chosen ? `xuất ${chosen.name}` : 'chỉ ghi nhu cầu, không trừ kho'}`
                  : 'Không mang vật tư')}
                {row('Đến', `${ticket.address || ticket.admin_name} (phiếu ${ticket.code})`)}
                {row('Khoảng cách', force ? `${force.distance_km} km từ vị trí đội` : '—')}
              </dl>
              <p className="mt-4 flex gap-2 rounded-[14px] bg-accent/10 p-3 text-sm text-ink">
                <Route size={17} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                <span>
                  <b>Đường đi:</b> hệ thống tự vạch trên mạng đường của tỉnh, né đoạn sạt lở, lũ quét, ngập sâu đang có hiệu lực —
                  phát lệnh xong sẽ nói rõ đường có an toàn không, quãng đường và giờ dự kiến đến.
                </span>
              </p>
              <p className="mt-3 flex gap-2 rounded-[14px] border border-dashed border-line p-3 text-[13px] leading-normal text-ink-2">
                {match.forces.length ? <ShieldCheck size={15} className="mt-0.5 shrink-0 text-good" aria-hidden="true" /> : <TriangleAlert size={15} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />}
                <span>
                  Phát lệnh xong: đội, phương tiện chuyển sang “Đang làm nhiệm vụ”, phiếu sang cột “Đội đang đến”. Bấm <b>Sao chép
                  lệnh</b> rồi dán vào Zalo / tin nhắn gửi trưởng nhóm — lệnh có link nhiệm vụ để trưởng nhóm báo đã đến, đã cứu
                  (không cần đăng nhập).
                </span>
              </p>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
