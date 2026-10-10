import { num } from '../../utils/format';
import { ALARM, alarmLevel, INCIDENT, STATION_TYPE } from '../../utils/labels';
import { HAZARD_LEVEL, LANDSLIDE_LEVEL, levelOf, RESERVOIR_LEVEL, rainLevel } from '../../utils/risk';
import { riverName, riverSummary } from '../dashboard/RiverKpi';
import { INCIDENT_TYPE } from './MapLayers';

// Cùng mức thì theo loại: cứu người trước, rồi nước lên, hồ xả, đường cấm, mưa, cảm biến khác, sự cố
const KIND_ORDER = { sos: 0, river: 1, reservoir: 2, landslide: 3, rain: 4, sensor: 5, hazard: 6 };

/**
 * "Điểm nóng" của Bản đồ giám sát (lãnh đạo): gộp các điểm đang ở mức rủi ro từ số liệu trang ĐÃ tải — chỉ sắp xếp lại,
 * mức tính đúng như nơi khác của hệ thống:
 * - SOS cấp 1 chưa xong (Đỏ) — gộp một dòng, chỉ khi tài khoản xem được SOS;
 * - trạm mực nước trên báo động — cùng cách tính với ô "Mực nước sông" (riverSummary, /stations);
 * - cảm biến khác vượt ngưỡng của trạm (độ nghiêng, độ ẩm đất…) — như tab Cảm biến, bỏ trạm mất tín hiệu;
 * - hồ đang xả, điểm sạt lở cấm đường / cảnh báo — /dashboard/kpis (RESERVOIR_LEVEL, LANDSLIDE_LEVEL);
 * - trạm có mưa 24 giờ lớn nhất khi từ 50 mm (rainLevel) — số trên điểm trạm là cường độ mưa, không so với ngưỡng 24 giờ;
 * - sự cố cán bộ đánh dấu mức Cam, Đỏ (HAZARD_LEVEL).
 * Mỗi mục: { id, kind, level 1–3, name, detail, lat, lon, trend?, bounds? (dòng gộp nhiều điểm) }. Xếp Đỏ → Cam → Vàng,
 * cùng mức theo loại rồi theo tên.
 */
export function buildHotspots({ sos = [], canSos = false, waterStations = [], data, k }) {
  const out = [];
  const add = (it) => { if (it.lat != null && it.lon != null) out.push({ ...it, lat: Number(it.lat), lon: Number(it.lon) }); };

  if (canSos) {
    // SOS cấp 1 gộp MỘT dòng (từng phiếu ở tab Phiếu SOS) — nhiều phiếu không chiếm hết các dòng đầu, điểm nóng loại khác
    // (hồ xả, đường cấm, trạm BĐ III…) vẫn lên được; chạm dòng → bản đồ bao trọn các phiếu
    const crit = sos.filter((s) => s.priority === 1 && s.lat != null && s.lon != null);
    if (crit.length) {
      const byType = {};
      crit.forEach((s) => { const t = INCIDENT[s.incident_type] || s.incident_type; byType[t] = (byType[t] || 0) + 1; });
      const types = Object.entries(byType).sort((a, b) => b[1] - a[1]);
      const rest = types.slice(3).reduce((m, [, n]) => m + n, 0);
      out.push({
        id: 'sos-cap-1', kind: 'sos', level: 3, name: `${crit.length} phiếu SOS cấp 1 chưa xong`,
        detail: `${types.slice(0, 3).map(([t, n]) => `${t} ${n}`).join(' · ')}${rest ? ` · khác ${rest}` : ''} — từng phiếu ở tab Phiếu SOS`,
        lat: Number(crit[0].lat), lon: Number(crit[0].lon), bounds: crit.map((s) => [Number(s.lat), Number(s.lon)]),
      });
    }
  }
  riverSummary(waterStations).rows.filter((r) => r.st.level >= 1).forEach((r) => add({
    id: `river-${r.s.id}`, kind: 'river', level: r.st.level, name: riverName(r.s),
    detail: `${r.st.label} · ${num(r.st.value, 2)} m`, lat: r.s.lat, lon: r.s.lon, trend: r.trend,
  }));
  (data?.stations?.features || []).forEach(({ properties: p }) => {
    if (p.type === 'muc_nuoc' || p.stale || p.value == null) return;
    const lv = alarmLevel(p.value, p.thresholds);
    if (lv >= 1) {
      add({ id: `sensor-${p.id}`, kind: 'sensor', level: lv, name: p.name, detail: `${STATION_TYPE[p.type] || 'Cảm biến'} ${num(p.value, 2)} ${p.unit || ''} · ${ALARM[lv].label}`, lat: p.lat, lon: p.lon });
    }
  });
  (k?.reservoirs?.reservoirs || []).forEach((r) => {
    const lv = levelOf(RESERVOIR_LEVEL, r.status_code);
    if (lv >= 2) {
      add({
        id: `res-${r.id}`, kind: 'reservoir', level: lv, name: r.name,
        detail: `${r.status_label}${r.outflow_m3s != null ? ` · xả ${num(r.outflow_m3s, 0)} m³/s` : ''}${r.stale ? ' · số liệu cũ' : ''}`,
        lat: r.lat, lon: r.lon,
      });
    }
  });
  (k?.landslides?.points || []).forEach((p) => {
    const lv = levelOf(LANDSLIDE_LEVEL, p.traffic_status);
    if (lv >= 2) add({ id: `ls-${p.code || p.name}`, kind: 'landslide', level: lv, name: p.name, detail: `${lv === 3 ? 'Cấm đường' : 'Cảnh báo'}${p.road_name ? ` · ${p.road_name}` : ''}`, lat: p.lat, lon: p.lon });
  });
  const rainLv = rainLevel(k?.rain?.max_24h);
  if (rainLv >= 1) {
    const st = (data?.stations?.features || []).find((f) => f.properties.type === 'luong_mua' && f.properties.name === k.rain.max_station)?.properties;
    if (st) add({ id: `rain-${st.id}`, kind: 'rain', level: rainLv, name: st.name, detail: `Mưa ${num(k.rain.max_24h, 1)} mm/24 giờ — lớn nhất vùng đang xem`, lat: st.lat, lon: st.lon });
  }
  (data?.hazard_points?.features || []).forEach(({ properties: p }) => {
    const lv = levelOf(HAZARD_LEVEL, p.level);
    if (lv >= 2) add({ id: `hz-${p.id}`, kind: 'hazard', level: lv, name: p.name, detail: INCIDENT_TYPE[p.type] || 'Sự cố', lat: p.lat, lon: p.lon });
  });
  return out.sort((a, b) => b.level - a.level || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || String(a.name).localeCompare(String(b.name), 'vi'));
}
