import { Cloud, CloudLightning, Droplets, Mountain, Snowflake, TriangleAlert, Waves } from 'lucide-react';

/** Loại thiên tai của đợt — khớp HAZARDS (backend/app/api/v1/events.py). */
export const HAZARD = {
  mua_lon: { label: 'Mưa lớn', icon: Cloud },
  lu_lut: { label: 'Lũ, ngập lụt', icon: Waves },
  lu_quet: { label: 'Lũ quét', icon: Droplets },
  sat_lo: { label: 'Sạt lở đất', icon: Mountain },
  bao: { label: 'Bão, áp thấp nhiệt đới', icon: CloudLightning },
  ret_hai: { label: 'Rét hại, sương muối', icon: Snowflake },
  khac: { label: 'Khác', icon: TriangleAlert },
};
export const HAZARD_KEYS = Object.keys(HAZARD);
export const MAX_BACKDATE_DAYS = 30; // như MAX_BACKDATE_DAYS (backend)

const pad = (n) => String(n).padStart(2, '0');
/** "08:30 12/9/2026" — giờ máy (Việt Nam). */
export const when = (t) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};
/** Khoảng thời gian của đợt: "từ 08:30 12/9/2026 — đang diễn ra" / "08:30 12/9 → 17:00 15/9/2026 (3 ngày 8 giờ)". */
export function period(e, now = Date.now()) {
  const start = Date.parse(e.started_at);
  const end = e.ended_at ? Date.parse(e.ended_at) : now;
  const min = Math.max(0, Math.round((end - start) / 60_000));
  const h = Math.round(min / 60);
  const span = min < 60 ? `${min} phút` : h >= 48 ? `${Math.floor(h / 24)} ngày${h % 24 ? ` ${h % 24} giờ` : ''}` : `${h} giờ`;
  return e.ended_at ? `${when(e.started_at)} → ${when(e.ended_at)} (${span})` : `từ ${when(e.started_at)} — đang diễn ra (${span})`;
}
/** Vùng ảnh hưởng: "Toàn tỉnh" / tên xã (≤ 3) / "N xã/phường". `names`: mã → tên xã. */
export function areaText(codes, names) {
  if (!codes?.length) return 'Toàn tỉnh';
  if (codes.length <= 3) return codes.map((c) => names.get(c) || c).join(', ');
  return `${codes.length} xã/phường`;
}
/** Giá trị datetime-local (giờ máy) ↔ ISO có múi giờ. */
export const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
