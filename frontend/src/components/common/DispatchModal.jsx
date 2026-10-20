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
import { FORCE_TYPE, INCIDENT, ITEM_NAME, PRIORITY, SKILL, VEHICLE, VULNERABLE } from '../../utils/labels';

const STEPS = ['Chọn đội', 'Vật tư mang theo', 'Xác nhận'];
const STEP_FIELDS = [['force', 'personnel'], ['warehouse'], []];
const touchCls = 'min-h-[44px] sm:min-h-0';

/**
 * Lệnh điều động (thiết kế C.3, D.3): hệ thống gợi ý nhu cầu + đội, phương tiện gần nhất → phát lệnh. Ba bước:
 * 1. Chọn đội — đội gợi ý viết thành câu (loại lực lượng · cách bao xa · số người sẵn sàng · kỹ năng), phương tiện, quân số
 *    bằng nút −/+ (không vượt số người sẵn sàng của đội);
 * 2. Vật tư mang theo — nhu cầu hệ thống gợi ý, kho xuất (gần nhất, đủ hàng lên đầu) hoặc chỉ ghi nhu cầu;
 * 3. Xác nhận — tóm tắt lệnh rồi mới phát (không hoàn tác được: đổi trạng thái đội, trừ kho, gửi lệnh).
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
  const refs = { force: useRef(null), personnel: useRef(null), warehouse: useRef(null) };
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [warehouseId, setWarehouseId] = useState(''); // '' = chỉ ghi nhu cầu vật tư, không trừ kho
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

  const supplies = useMemo(() => match?.needs.supplies || {}, [match]);
  const stores = useMemo(() => {
    if (!ticket) return [];
    return allWarehouses
      .filter((w) => !issueCodes || issueCodes.includes(w.admin_code))
      .map((w) => {
        const stock = Object.fromEntries(w.items.map((i) => [i.item_code, i.quantity]));
        const short = Object.entries(supplies).filter(([code, n]) => n > 0 && (stock[code] || 0) < n).map(([code]) => code);
        return { ...w, km: distanceKm(ticket.lat, ticket.lon, w.lat, w.lon), short };
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

  let footer;
  if (result) {
    footer = <button className="btn-primary" onClick={onClose}>Đóng</button>;
  } else if (step === 0) {
    footer = (
      <>
        {!allowed && <span className="mr-auto self-center text-xs text-danger">Bạn không có quyền điều động tại địa bàn này</span>}
        <button type="button" className={clsx('btn-ghost', touchCls)} onClick={onClose}>Huỷ</button>
        <button type="button" className={clsx('btn-primary', touchCls)} disabled={!ready} onClick={next}>
          Tiếp: vật tư mang theo <ChevronRight size={15} aria-hidden="true" />
        </button>
      </>
    );
  } else {
    footer = (
      <>
        <button type="button" className={clsx('btn-ghost sm:mr-auto', touchCls)} onClick={() => setStep(step - 1)} disabled={busy}>
          <ChevronLeft size={15} aria-hidden="true" /> Quay lại
        </button>
        {step === 1 ? (
          <button type="button" className={clsx('btn-primary', touchCls)} disabled={!ready} onClick={next}>
            Tiếp: xác nhận <ChevronRight size={15} aria-hidden="true" />
          </button>
        ) : (
          <button type="button" className={clsx('btn-danger', touchCls)} disabled={!ready || busy} onClick={submit}>
            {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />} Phát lệnh điều động
          </button>
        )}
      </>
    );
  }

  return (
    <Modal open wide onClose={onClose} title={`Lệnh điều động – ${ticket.code}`} footer={footer}>
      <div className="mb-3 rounded-lg bg-panel2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={clsx('chip', pr?.cls)}>{pr?.label}</span>
          <span className="font-semibold">{INCIDENT[ticket.incident_type] || ticket.incident_type}</span>
          <span className="text-sm text-ink-2">· {ticket.address || ticket.admin_name}</span>
          <span className="text-sm text-ink-2">· {ticket.trapped_count} người</span>
          {(ticket.vulnerable || []).map((v) => <span key={v} className="chip bg-danger/15 text-danger">{VULNERABLE[v] || v}</span>)}
        </div>
        {ticket.raw_message && <p className="mt-1 text-sm italic text-ink-2">“{ticket.raw_message}”</p>}
      </div>

      {result ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-good"><CheckCircle2 size={20} aria-hidden="true" /> <b>Đã ghi lệnh điều động {ticket.code}</b></div>
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <div className="card p-2"><div className="text-xs text-muted">Quãng đường</div><b className="num">{result.route.distance_km} km</b></div>
            <div className="card p-2"><div className="text-xs text-muted">Dự kiến đến sau</div><b className="num">{result.route.duration_min} phút</b></div>
            <div className="card p-2">
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
          <div className={clsx('rounded-lg p-3 text-sm', result.notification.sent ? 'border border-accent/40 bg-accent/10' : 'border-2 border-warn bg-warn/10')}>
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
                <a className={clsx('btn-primary px-3 py-1 text-xs', touchCls)} href={`tel:${result.notification.to.replace(/\s/g, '')}`}>
                  <Phone size={13} aria-hidden="true" /> Gọi trưởng nhóm
                </a>
              )}
              <button type="button" className={clsx('btn-secondary px-3 py-1 text-xs', touchCls)} onClick={() => copyOrder(result.notification.message)}>
                <ClipboardCopy size={13} aria-hidden="true" /> Sao chép lệnh gửi Zalo
              </button>
            </div>
          </div>
          {result.notification.mission_url && (
            <MissionLinkBox url={result.notification.mission_url} expiresAt={result.notification.mission_expires_at} />
          )}
        </div>
      ) : !allowed ? (
        <div className="rounded-lg border border-warn/60 bg-warn/10 p-3 text-sm text-ink">
          Phiếu đã chuyển sang <b>Đang tìm đội</b>. Tài khoản của bạn không có quyền phát lệnh điều động tại địa bàn này —
          báo trực ban tỉnh để điều đội.
        </div>
      ) : matchError ? (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-danger/50 bg-danger/5 p-3 text-sm">
          <span>Không tải được danh sách đội: {matchError.message}</span>
          <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => refetch()}>Thử lại</button>
        </div>
      ) : isLoading || !match ? (
        <div className="flex items-center gap-2 py-8 text-muted"><Loader2 className="animate-spin" size={16} aria-hidden="true" /> Đang tìm đội, phương tiện gần nhất…</div>
      ) : (
        <>
          {/* Bước: bấm được để quay lại bước đã qua (không nhảy cóc sang bước chưa điền) */}
          <ol className="mb-3 flex gap-1.5 text-xs" aria-label="Các bước lệnh điều động">
            {STEPS.map((s, i) => (
              <li key={s} className="min-w-0 flex-1">
                <button
                  type="button"
                  disabled={i > step || busy}
                  onClick={() => setStep(i)}
                  aria-current={i === step ? 'step' : undefined}
                  className={clsx(
                    'flex w-full items-center justify-center gap-1 rounded-lg px-2 py-1.5 font-semibold',
                    touchCls,
                    i === step ? 'bg-accent text-white' : i < step ? 'bg-good/15 text-good hover:bg-good/25' : 'bg-panel2 text-muted',
                  )}
                >
                  {i < step && <Check size={12} aria-hidden="true" />} {i + 1}. {s}
                </button>
              </li>
            ))}
          </ol>

          {step === 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="mb-1 text-sm font-semibold">Đội gần nhất <span className="font-normal text-muted">(trong bán kính {match.radius_km} km)</span></h4>
                {presetMissing && <p className="mb-1 text-xs text-warn">Đội được kéo thả không còn người sẵn sàng trong bán kính — chọn đội khác.</p>}
                <div
                  ref={refs.force}
                  tabIndex={-1}
                  role="radiogroup"
                  aria-label="Đội cứu hộ"
                  aria-invalid={!!err('force')}
                  aria-describedby="loi-don-vi"
                  className={clsx('flex flex-col gap-1.5 rounded-lg outline-none', err('force') && 'ring-1 ring-danger')}
                >
                  {match.forces.map((f, i) => (
                    <label key={f.id} className={clsx('card flex cursor-pointer gap-2 p-2', forceId === f.id && 'border-accent ring-1 ring-accent')}>
                      <input type="radio" name="force" checked={forceId === f.id} onChange={() => setForceId(f.id)} className="mt-1 h-5 w-5 shrink-0 sm:h-auto sm:w-auto" />
                      <div className="min-w-0 flex-1 text-sm">
                        <div className="flex flex-wrap items-center gap-1.5 font-medium">
                          {f.name}
                          {i === 0 && <span className="chip bg-accent/15 py-0 text-[11px] font-semibold text-accent">Gợi ý</span>}
                        </div>
                        {/* Gợi ý viết thành câu: loại lực lượng — cách bao xa — bao nhiêu người sẵn sàng */}
                        <div className="text-xs text-ink-2">
                          {FORCE_TYPE[f.org_type] || 'Lực lượng'} — cách {f.distance_km} km — {f.personnel_ready} người sẵn sàng
                        </div>
                        {f.skill_match.length > 0 && (
                          <div className="mt-0.5 text-xs text-good">Có: {f.skill_match.map((s) => SKILL[s] || s).join(', ').toLowerCase()}</div>
                        )}
                      </div>
                      <a href={`tel:${f.contact_phone.replace(/\s/g, '')}`} className="flex h-10 w-10 shrink-0 items-center justify-center self-start rounded-lg text-accent hover:bg-accent/10" title={`Gọi ${f.commander}`} aria-label={`Gọi ${f.commander}`} onClick={(e) => e.stopPropagation()}>
                        <Phone size={16} aria-hidden="true" />
                      </a>
                    </label>
                  ))}
                  {!match.forces.length && <p className="text-sm text-danger">Không còn đội sẵn sàng trong bán kính tìm.</p>}
                </div>
                <FieldError id="loi-don-vi">{err('force')}</FieldError>
              </div>
              <div>
                <h4 className="mb-1 text-sm font-semibold">Phương tiện rảnh gần nhất</h4>
                <div className="scroll-thin flex max-h-64 flex-col gap-1 overflow-y-auto">
                  {match.vehicles.map((v) => (
                    <label key={v.id} className={clsx('flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-panel2', touchCls)}>
                      <input
                        type="checkbox"
                        className="h-5 w-5 shrink-0 sm:h-auto sm:w-auto"
                        checked={vehicleIds.includes(v.id)}
                        onChange={(e) => setVehicleIds((ids) => (e.target.checked ? [...ids, v.id] : ids.filter((x) => x !== v.id)))}
                      />
                      <span className="text-sm"><b>{v.code}</b> {VEHICLE[v.vehicle_type]}</span>
                      <span className="ml-auto text-xs text-muted">cách {v.distance_km} km · nhiên liệu {v.fuel_level == null ? 'chưa rõ' : `${v.fuel_level}%`}</span>
                    </label>
                  ))}
                  {!match.vehicles.length && <p className="text-sm text-muted">Không có phương tiện chuyên dụng rảnh trong bán kính.</p>}
                </div>
                <div className="mt-3 text-sm">
                  <label htmlFor="quan-so-dieu-dong">Số người đi * {force && <span className="text-muted">(tối đa {force.personnel_ready})</span>}</label>
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
                </div>
                <FieldError id="loi-quan-so">{err('personnel')}</FieldError>
                {force && match.needs.personnel > force.personnel_ready ? (
                  <p className="mt-1 text-[11px] font-semibold text-warn">
                    Hệ thống gợi ý {match.needs.personnel} người nhưng đội này chỉ còn {force.personnel_ready} người sẵn sàng —
                    số người đã hạ theo; cần thêm thì điều thêm đội khác sau khi phát lệnh.
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-muted">Hệ thống gợi ý: {match.needs.personnel} người.</p>
                )}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="mb-1 text-sm font-semibold">Hệ thống gợi ý mang theo</h4>
                <ul className="mb-3 space-y-0.5 text-sm text-ink-2">
                  <li>• {match.needs.personnel} cán bộ, chiến sĩ</li>
                  {Object.entries(match.needs.vehicles).map(([t, n]) => <li key={t}>• {n} {VEHICLE[t]}</li>)}
                  {Object.entries(match.needs.supplies).map(([code, n]) => <li key={code}>• {n} {ITEM_NAME[code] || code}</li>)}
                </ul>
              </div>
              <div>
                {Object.keys(supplies).length > 0 ? (
                  <label className="flex flex-col gap-1 text-sm">
                    Lấy vật tư từ kho
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
                          Xuất từ {w.name} · {w.km.toFixed(1)} km{w.short.length ? ` · thiếu ${w.short.map((c) => ITEM_NAME[c] || c).join(', ')}` : ' · đủ hàng'}
                        </option>
                      ))}
                    </select>
                    <FieldError id="loi-kho">{err('warehouse')}</FieldError>
                    {!err('warehouse') && (
                      <span className="text-[11px] text-muted">
                        {chosen ? 'Tồn kho bị trừ cùng lúc phát lệnh.' : 'Không chọn kho: nhớ xuất kho riêng khi đội nhận hàng.'}
                      </span>
                    )}
                  </label>
                ) : (
                  <p className="text-sm text-muted">Phiếu này không cần mang vật tư.</p>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="mb-1 text-sm font-semibold">Tóm tắt lệnh — kiểm tra trước khi phát</h4>
                <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 rounded-lg border border-line p-3 text-sm">
                  <dt className="text-muted">Đội</dt>
                  <dd><b>{force?.name || '—'}</b>{force && <span className="text-muted"> · cách {force.distance_km} km</span>}</dd>
                  <dt className="text-muted">Số người</dt>
                  <dd>{personnelText} người</dd>
                  <dt className="text-muted">Phương tiện</dt>
                  <dd>{chosenVehicles.length ? chosenVehicles.map((v) => `${v.code} ${VEHICLE[v.vehicle_type] || ''}`.trim()).join(', ') : 'Không kèm phương tiện'}</dd>
                  <dt className="text-muted">Vật tư</dt>
                  <dd>
                    {Object.keys(supplies).length === 0 ? 'Không có' : chosen ? `Xuất từ ${chosen.name}` : 'Chỉ ghi nhu cầu — không trừ kho'}
                  </dd>
                </dl>
              </div>
              <div className="flex flex-col gap-2 text-xs text-ink-2">
                <p className="flex gap-2 rounded-lg bg-panel2 p-2">
                  <Route size={16} className="shrink-0 text-accent" aria-hidden="true" />
                  Hệ thống tự vạch đường đi trên mạng đường của tỉnh, né đoạn sạt lở, lũ quét, ngập sâu đang có hiệu lực — sau khi
                  phát lệnh sẽ nói rõ đường có an toàn không.
                </p>
                <p className="flex gap-2 text-muted">
                  {match.forces.length ? <ShieldCheck size={14} className="shrink-0 text-good" aria-hidden="true" /> : <TriangleAlert size={14} className="shrink-0 text-warn" aria-hidden="true" />}
                  Phát lệnh xong: đội, phương tiện chuyển sang “Đang làm nhiệm vụ”, phiếu sang cột “Đội đang đến”; gọi hoặc gửi lệnh cho trưởng nhóm.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
