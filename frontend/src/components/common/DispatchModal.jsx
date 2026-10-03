import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Send, Phone, Route, ShieldCheck, TriangleAlert, Loader2, CheckCircle2 } from 'lucide-react';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { Modal } from './ui';
import { MissionLinkBox } from './MissionLink';
import { useAllowedCodes, usePermission } from '../../rbac/usePermission';
import { distanceKm } from '../../utils/geo';
import { FORCE_TYPE, INCIDENT, PRIORITY, SKILL, VEHICLE, VULNERABLE } from '../../utils/labels';

const ITEM_NAME = {
  AO_PHAO: 'Áo phao', TUI_SO_CUU: 'Túi sơ cứu', DEN_PIN: 'Đèn pin', BAT_TRAI: 'Bạt che', THUOC_CO_BAN: 'Cơ số thuốc',
  MI_TOM: 'Mì tôm (thùng)', NUOC_CHAI: 'Nước (thùng)', CLORAMIN_B: 'Cloramin B (kg)',
};

/** Lệnh điều động: gợi ý nhu cầu + khớp nối lực lượng/phương tiện gần nhất → phát lệnh khẩn cấp. */
export default function DispatchModal({ ticket, presetForceId, onClose }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const allowed = usePermission('dispatch', 'create', ticket?.admin_code);
  const [forceId, setForceId] = useState(presetForceId || null);
  const [vehicleIds, setVehicleIds] = useState([]);
  const [personnel, setPersonnel] = useState(3);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [warehouseId, setWarehouseId] = useState(''); // '' = chỉ ghi nhu cầu vật tư, không trừ kho
  const issueCodes = useAllowedCodes('inventory', 'issue'); // null = toàn tỉnh
  const { data: allWarehouses = [] } = useQuery({
    queryKey: ['warehouses', 'dispatch'],
    queryFn: () => api('/resources/warehouses'),
    enabled: !!ticket,
  });

  const { data: match, isLoading } = useQuery({
    queryKey: ['match', ticket?.id],
    queryFn: () => api(`/sos/${ticket.id}/match`),
    enabled: !!ticket,
  });

  useEffect(() => {
    if (!match) return;
    setPersonnel(match.needs.personnel);
    if (!presetForceId && match.forces[0]) setForceId(match.forces[0].id);
    const wanted = Object.entries(match.needs.vehicles);
    const picks = [];
    for (const [type, n] of wanted) {
      match.vehicles.filter((v) => v.vehicle_type === type).slice(0, n).forEach((v) => picks.push(v.id));
    }
    if (!picks.length && match.vehicles[0]) picks.push(match.vehicles[0].id);
    setVehicleIds(picks);
  }, [match, presetForceId]);

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

  const submit = async () => {
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
      toast({ tone: 'good', title: `Đã phát lệnh điều động ${ticket.code}`, body: `ETA ${res.route.duration_min} phút · ${res.route.distance_km} km` });
    } catch (e) {
      toast({ tone: 'danger', title: 'Không phát được lệnh', body: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`Lệnh điều động – ${ticket.code}`}
      footer={
        result ? (
          <button className="btn-primary" onClick={onClose}>Đóng</button>
        ) : (
          <>
            {!allowed && <span className="mr-auto self-center text-xs text-danger">Bạn không có quyền điều động tại địa bàn này</span>}
            <button className="btn-ghost" onClick={onClose}>Huỷ</button>
            <button className="btn-danger" disabled={!allowed || !forceId || busy || chosen?.short.length > 0} onClick={submit}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Phát lệnh khẩn cấp
            </button>
          </>
        )
      }
    >
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
          <div className="flex items-center gap-2 text-good"><CheckCircle2 size={20} /> <b>Đã ghi lệnh điều động {ticket.code}</b></div>
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <div className="card p-2"><div className="text-xs text-muted">Quãng đường</div><b className="font-mono">{result.route.distance_km} km</b></div>
            <div className="card p-2"><div className="text-xs text-muted">Thời gian tiếp cận (ETA)</div><b className="font-mono">{result.route.duration_min} phút</b></div>
            <div className="card p-2">
              <div className="text-xs text-muted">Lộ trình</div>
              <b className={result.route.safe ? 'text-good' : 'text-danger'}>
                {result.route.safe ? 'Né vùng nguy hiểm đã ghi nhận' : `⚠ Đi qua vùng nguy hiểm${result.route.hazards?.length ? `: ${result.route.hazards.join(', ')}` : ''}`}
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
          {result.notification.sent ? (
            <div className="rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm">
              <div className="text-xs font-semibold text-accent">Đã gửi lệnh tới trưởng nhóm {result.notification.to}</div>
              <div className="mt-1 font-mono text-[13px] [overflow-wrap:anywhere]">{result.notification.message}</div>
            </div>
          ) : (
            // Chưa tích hợp SMS / Push: hệ thống KHÔNG tự báo cho đội — trực ban phải gọi / nhắn ngay
            <div className="rounded-lg border-2 border-warn bg-warn/10 p-3 text-sm">
              <div className="flex items-center gap-1.5 font-semibold text-ink">
                <TriangleAlert size={15} className="text-warn" /> Hệ thống chưa gửi tin cho đội — gọi hoặc nhắn trưởng nhóm ngay
              </div>
              <div className="mt-1 font-mono text-[13px] [overflow-wrap:anywhere]">{result.notification.message}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {result.notification.to && (
                  <a className="btn-primary px-3 py-1 text-xs" href={`tel:${result.notification.to.replace(/\s/g, '')}`}>
                    <Phone size={13} /> Gọi {result.notification.to}
                  </a>
                )}
                <button
                  type="button"
                  className="btn-ghost px-3 py-1 text-xs"
                  onClick={() => navigator.clipboard?.writeText(result.notification.message).then(
                    () => toast({ tone: 'good', title: 'Đã sao chép nội dung lệnh — dán vào Zalo / SMS' }),
                    () => toast({ tone: 'danger', title: 'Không sao chép được — chép tay nội dung trên' }),
                  )}
                >
                  <Send size={13} /> Sao chép nội dung lệnh
                </button>
              </div>
            </div>
          )}
          {result.notification.mission_url && (
            <MissionLinkBox url={result.notification.mission_url} expiresAt={result.notification.mission_expires_at} />
          )}
        </div>
      ) : isLoading || !match ? (
        <div className="flex items-center gap-2 py-8 text-muted"><Loader2 className="animate-spin" size={16} /> Đang quét lực lượng trong bán kính…</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h4 className="mb-1 text-sm font-semibold">Nhu cầu hệ thống gợi ý</h4>
            <ul className="mb-3 space-y-0.5 text-sm text-ink-2">
              <li>• {match.needs.personnel} cán bộ, chiến sĩ</li>
              {Object.entries(match.needs.vehicles).map(([t, n]) => <li key={t}>• {n} {VEHICLE[t]}</li>)}
              {Object.entries(match.needs.supplies).map(([code, n]) => <li key={code}>• {n} {ITEM_NAME[code] || code}</li>)}
            </ul>
            {Object.keys(supplies).length > 0 && (
              <label className="mb-3 flex flex-col gap-1 text-sm">
                Vật tư mang theo
                <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                  <option value="">Chỉ ghi nhu cầu — không trừ kho</option>
                  {stores.map((w) => (
                    <option key={w.id} value={w.id}>
                      Xuất từ {w.name} · {w.km.toFixed(1)} km{w.short.length ? ` · thiếu ${w.short.map((c) => ITEM_NAME[c] || c).join(', ')}` : ' · đủ hàng'}
                    </option>
                  ))}
                </select>
                {chosen?.short.length > 0 ? (
                  <span className="text-[11px] text-danger">Kho này không đủ hàng — chọn kho khác hoặc chỉ ghi nhu cầu.</span>
                ) : (
                  <span className="text-[11px] text-muted">
                    {chosen ? 'Tồn kho bị trừ cùng lúc phát lệnh.' : 'Không chọn kho: nhớ xuất kho riêng khi đội nhận hàng.'}
                  </span>
                )}
              </label>
            )}
            <h4 className="mb-1 text-sm font-semibold">Lực lượng gần nhất <span className="font-normal text-muted">(bán kính {match.radius_km} km)</span></h4>
            {presetMissing && <p className="mb-1 text-xs text-warn">Đơn vị được kéo thả không còn quân số sẵn sàng trong bán kính — chọn đơn vị khác.</p>}
            <div className="flex flex-col gap-1.5">
              {match.forces.map((f) => (
                <label key={f.id} className={clsx('card flex cursor-pointer gap-2 p-2', forceId === f.id && 'border-accent ring-1 ring-accent')}>
                  <input type="radio" name="force" checked={forceId === f.id} onChange={() => setForceId(f.id)} className="mt-1" />
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="font-medium">{f.name}</div>
                    <div className="text-xs text-muted">
                      {FORCE_TYPE[f.org_type]} · cách {f.distance_km} km · sẵn sàng {f.personnel_ready} người
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {f.skill_match.map((s) => <span key={s} className="chip bg-good/15 text-good">{SKILL[s]}</span>)}
                    </div>
                  </div>
                  <a href={`tel:${f.contact_phone.replace(/\s/g, '')}`} className="self-start text-accent" title={`Gọi ${f.commander}`} onClick={(e) => e.stopPropagation()}>
                    <Phone size={16} />
                  </a>
                </label>
              ))}
              {!match.forces.length && <p className="text-sm text-danger">Không còn lực lượng sẵn sàng trong bán kính quét.</p>}
            </div>
          </div>
          <div>
            <h4 className="mb-1 text-sm font-semibold">Phương tiện phù hợp gần nhất</h4>
            <div className="flex max-h-64 flex-col gap-1 overflow-y-auto scroll-thin">
              {match.vehicles.map((v) => (
                <label key={v.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-panel2">
                  <input
                    type="checkbox"
                    checked={vehicleIds.includes(v.id)}
                    onChange={(e) => setVehicleIds((ids) => (e.target.checked ? [...ids, v.id] : ids.filter((x) => x !== v.id)))}
                  />
                  <span className="text-sm"><b>{v.code}</b> {VEHICLE[v.vehicle_type]}</span>
                  <span className="ml-auto text-xs text-muted">{v.distance_km} km · ⛽ {v.fuel_level == null ? 'chưa rõ' : `${v.fuel_level}%`}</span>
                </label>
              ))}
              {!match.vehicles.length && <p className="text-sm text-muted">Không có phương tiện chuyên dụng rảnh trong bán kính.</p>}
            </div>
            <label className="mt-3 block text-sm">
              Quân số điều động
              <input type="number" min={1} className="input mt-1 w-28" value={personnel} onChange={(e) => setPersonnel(Number(e.target.value))} />
            </label>
            <div className="mt-3 flex gap-2 rounded-lg bg-panel2 p-2 text-xs text-ink-2">
              <Route size={16} className="shrink-0 text-accent" />
              Hệ thống tự vạch lộ trình trên mạng đường tỉnh, né đoạn giao cắt vùng sạt lở / lũ quét / ngập sâu còn hiệu lực (PostGIS).
            </div>
            <div className="mt-2 flex gap-2 text-xs text-muted">
              {match.forces.length ? <ShieldCheck size={14} className="text-good" /> : <TriangleAlert size={14} className="text-warn" />}
              Trạng thái lực lượng & phương tiện tự chuyển sang “Đang làm nhiệm vụ” sau khi phát lệnh.
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
