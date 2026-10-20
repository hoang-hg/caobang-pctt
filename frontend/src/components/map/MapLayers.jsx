import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Circle, CircleMarker, GeoJSON, Marker, Polyline, Popup, Tooltip, useMap } from 'react-leaflet';
import { Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, YAxis } from 'recharts';
import { Phone, Send, Video, PackageMinus, PencilLine, Users } from 'lucide-react';
import clsx from 'clsx';
import L from './leafletGlobal';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import Hydrograph from '../charts/Hydrograph';
import { ReservoirHistory } from '../charts/ReservoirOpsChart';
import { useChartTheme } from '../charts/chartTheme';
import { Can, usePermission } from '../../rbac/usePermission';
import {
  blackspotIcon, cameraIcon, evacIcon, forceIcon, hazardIcon, reportIcon, reservoirIcon, sosIcon, stationIcon, stormIcon, vehicleIcon, warehouseIcon,
} from './icons';
import { ALARM, alarmLevel, CATEGORY, FORCE_TYPE, INCIDENT, LEVEL, PRIORITY, REPORT_STATUS, RES_STATUS, SKILL, SOS_STATUS, SOURCE, STATION_TYPE, VEHICLE } from '../../utils/labels';
import { ago, num } from '../../utils/format';
import { fmtVn } from '../../utils/bulletin';
import { HAZARD_LEVEL, LANDSLIDE_LEVEL, levelOf, RESERVOIR_LEVEL, risk, STOCK_LOW, stockLevel } from '../../utils/risk';
import { distanceKm } from '../../utils/geo';
import { useMediaQuery } from '../../utils/useMediaQuery';

const ll = (f) => [f.geometry.coordinates[1], f.geometry.coordinates[0]];
// Bề rộng popup: như trước trên máy tính, co theo màn hình điện thoại (chừa cột nút Công cụ / Chú giải bên phải) — 360 px còn 240 px
const POP_W = 'w-[min(18rem,calc(100vw-7.5rem))]';
const POP_W_SM = 'w-[min(16rem,calc(100vw-7.5rem))]';
const Tel = ({ phone, label = 'Gọi' }) =>
  phone ? (
    <a className="btn-ghost px-2 py-1 text-xs" href={`tel:${phone.replace(/\s/g, '')}`}><Phone size={12} /> {label}</a>
  ) : null;

function MiniSeries({ stationId, unit }) {
  const c = useChartTheme();
  const { data } = useQuery({ queryKey: ['series', stationId, 24], queryFn: () => api(`/stations/${stationId}/series`, { params: { hours: 24 } }) });
  if (!data) return <div className="h-20 animate-pulse rounded bg-panel2" />;
  return (
    <div>
      <ResponsiveContainer width="100%" height={80}>
        <LineChart data={data.observed} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
          <YAxis tick={{ fontSize: 9, fill: c.axis }} tickLine={false} axisLine={false} />
          <Line dataKey="value" stroke={c.s1} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <div className="text-[10px] text-muted">24 giờ qua ({unit})</div>
    </div>
  );
}

function StationPopup({ p }) {
  const lv = p.value == null ? 0 : alarmLevel(p.value, p.thresholds);
  const value = p.value == null ? null : `${num(p.value, p.type === 'muc_nuoc' ? 2 : 1)} ${p.unit}`;
  const chip = p.thresholds?.bd1 != null && <span className={clsx('chip', ALARM[lv].cls)}>{ALARM[lv].label}</span>;
  return (
    <div className={POP_W}>
      <div className="font-semibold">{p.name}</div>
      <div className="mb-1 text-xs text-muted">{STATION_TYPE[p.type]} · {p.id}</div>
      {p.at ? (
        // Đang xem thời điểm khác trên thanh thời gian: quá khứ = số đo, tương lai = bản tin dự báo
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Lúc {fmtVn(p.at)}:</span>
          {value ? <><span className="font-mono text-lg">{value}</span>{chip}</> : <span className="chip bg-panel2 text-muted">Không có số đo / dự báo</span>}
        </div>
      ) : value == null ? (
        // Chưa có thiết bị / chưa từng nhận số đo — KHÔNG phải "dưới BĐ I"
        <div className="mb-1"><span className="chip bg-panel2 text-muted">Chưa có số đo</span></div>
      ) : p.stale ? (
        // Mất tín hiệu: không hiện số cũ như đang đo; số cuối vượt báo động thì vẫn nêu cấp để chỉ huy biết
        <div className="mb-1 space-y-1 text-xs">
          <span className="chip bg-panel2 text-muted">Mất tín hiệu từ {fmtVn(p.time)}</span>
          <div>Số đo cuối <b className="font-mono">{value}</b> {lv > 0 && chip} — không xác nhận được hiện trạng</div>
        </div>
      ) : (
        <div className="mb-1 flex items-center gap-2">
          <span className="font-mono text-lg">{value}</span>
          {chip}
          <span className="text-[11px] text-muted">{fmtVn(p.time)}</span>
        </div>
      )}
      {p.type === 'muc_nuoc' ? <Hydrograph stationId={p.id} height={130} hours={24} compact /> : <MiniSeries stationId={p.id} unit={p.unit} />}
    </div>
  );
}

// Màu theo NHÓM hàng (như biểu đồ phân bổ kho) — kho thiếu một nhóm thì các nhóm khác không đổi màu
const CAT_SERIES = { luong_thuc: 's1', nuoc_uong: 's2', do_dung: 's3', y_te: 's4' };

function WarehousePopup({ p, onIssue }) {
  const c = useChartTheme();
  const cats = Object.entries(p.categories || {});
  const lv = stockLevel(p.pct);
  return (
    <div className={POP_W_SM}>
      <div className="font-semibold">{p.name}</div>
      {p.pct == null ? (
        <div className="text-xs text-muted">Chưa có số liệu tồn kho (nhập bằng loại dữ liệu “Tồn kho”)</div>
      ) : (
        <div className="text-xs text-muted">Tồn kho trung bình {p.pct}% định mức{p.min_pct != null && ` · thấp nhất ${p.min_pct}%`}</div>
      )}
      {p.low_items > 0 && (
        <div className="mt-0.5 text-xs font-semibold text-danger">{p.low_items} mặt hàng dưới {STOCK_LOW}% định mức (cạn kiệt)</div>
      )}
      {p.pct != null && <div className="flex items-center gap-2">
        <div className="h-24 w-24">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={[{ v: Math.min(p.pct, 100) }, { v: Math.max(0, 100 - p.pct) }]} dataKey="v" innerRadius={26} outerRadius={40} startAngle={90} endAngle={-270} stroke="none" isAnimationActive={false}>
                <Cell fill={risk(lv).hex} />
                <Cell fill={c.shortage} />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="flex-1 space-y-0.5 text-xs">
          {cats.map(([k, v]) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: c[CAT_SERIES[k]] || c.muted }} />
              {CATEGORY[k]}
              <b className={clsx('ml-auto font-mono', v < STOCK_LOW && 'text-danger')}>{v}%</b>
            </li>
          ))}
        </ul>
      </div>}
      <div className="mt-2 flex gap-1">
        <Can I="inventory" a="issue" scope={p.admin_code}>
          <button className="btn-primary px-2 py-1 text-xs" onClick={() => onIssue(p)}><PackageMinus size={12} /> Ra lệnh xuất kho</button>
        </Can>
        <Tel phone={p.phone} label="Thủ kho" />
      </div>
    </div>
  );
}

function SosPopup({ p, onDispatch }) {
  const pr = PRIORITY[p.priority] || PRIORITY[2];
  return (
    <div className={POP_W}>
      <div className="flex items-center gap-2">
        <b>{p.code}</b>
        <span className={clsx('chip', pr?.cls)}>{pr?.short}</span>
        <span className="chip bg-panel2">{SOS_STATUS[p.status] || p.status}</span>
      </div>
      <div className="mt-1 text-sm font-medium">{INCIDENT[p.incident_type] || p.incident_type} · {p.trapped_count} người</div>
      <div className="text-xs text-muted">{p.address} · {SOURCE[p.source]} · {ago(p.received_at)}</div>
      {p.raw_message && <p className="mt-1 text-xs italic">“{p.raw_message}”</p>}
      {p.status !== 'thuc_thi' && (
        <Can I="dispatch" a="create" scope={p.admin_code}>
          <button className="btn-danger mt-2 px-2 py-1 text-xs" onClick={() => onDispatch(p)}><Send size={12} /> Điều đội</button>
        </Can>
      )}
      <p className="mt-1 text-[11px] text-muted">Mẹo: kéo biểu tượng đội cứu hộ thả vào điểm SOS để điều động nhanh.</p>
    </div>
  );
}

export const INCIDENT_TYPE = { sat_lo: 'Sạt lở', giao_thong: 'Sự cố giao thông', ha_tang: 'Sự cố hạ tầng' };
const POINT_SOURCE = { import: 'bản đồ điểm nguy hiểm', officer: 'cán bộ đánh dấu', report: 'từ phản ánh của người dân' };

function HazardPopup({ p }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const canClose = usePermission('incident', 'update', p.admin_code) && p.source !== 'import';
  const close = async () => {
    if (!window.confirm(`Kết thúc sự cố "${p.name}"? Điểm sẽ ẩn khỏi bản đồ và cổng công khai.`)) return;
    try {
      await api(`/map/incidents/${p.id}/close`, { method: 'POST' });
      toast({ tone: 'good', title: 'Đã kết thúc sự cố', body: p.name });
      qc.invalidateQueries({ queryKey: ['map-layers'] });
    } catch (e) {
      toast({ tone: 'danger', title: 'Không kết thúc được', body: e.message });
    }
  };
  return (
    <div className="w-64">
      <b>{p.name}</b>
      <div className="text-xs text-muted">{INCIDENT_TYPE[p.type] || p.type} · {ago(p.reported_at)} · {POINT_SOURCE[p.source] || p.source}</div>
      {p.description && <p className="text-xs">{p.description}</p>}
      {p.expires_at && <div className="text-[11px] text-muted">Tự ẩn lúc {fmtVn(p.expires_at)}</div>}
      {canClose && <button className="btn-ghost mt-1 px-2 py-1 text-xs" onClick={close}>Kết thúc sự cố</button>}
    </div>
  );
}

const SAME_SPOT_M = 300; // điểm nguy hiểm đã nhập cách điểm đen ≤ 300 m = cùng một chỗ

/**
 * Điểm đen sạt lở, đèo dốc (danh mục — /dashboard/kpis → landslides.points, trạng thái tính từ vùng nguy hiểm, đường bị
 * chia cắt, cảm biến) gộp với điểm nguy hiểm đã nhập từ tệp (`hazard_points` nguồn import) nằm cùng chỗ (≤ 300 m): một tam
 * giác, màu = mức cao hơn của trạng thái giám sát và mức đã nhập — "chưa có số liệu giám sát" không che mất mức Đỏ đã nhập.
 * → { list: [{ p, near, level }], merged: Set id điểm đã nhập được gộp (không vẽ riêng khi lớp điểm đen đang bật) }.
 * Sự cố do cán bộ / phản ánh đánh dấu không gộp — vẫn là điểm riêng, kết thúc được.
 */
export function blackspotStates(points, hazardFeatures) {
  const imported = (hazardFeatures || []).filter((f) => f.properties.source === 'import');
  const merged = new Set();
  const list = (points || []).filter((p) => p.lat != null && p.lon != null).map((p) => {
    const near = imported
      .filter((f) => distanceKm(p.lat, p.lon, f.geometry.coordinates[1], f.geometry.coordinates[0]) * 1000 <= SAME_SPOT_M)
      .map((f) => f.properties);
    near.forEach((h) => merged.add(h.id));
    const levels = [levelOf(LANDSLIDE_LEVEL, p.traffic_status), ...near.map((h) => levelOf(HAZARD_LEVEL, h.level))].filter((x) => x != null);
    return { p, near, level: levels.length ? Math.max(...levels) : null };
  });
  return { list, merged };
}

function BlackspotPopup({ p, near, level }) {
  const sc = risk(level);
  return (
    <div className={POP_W}>
      <div className="flex items-start justify-between gap-2">
        <b className="leading-snug">{p.name}</b>
        <span className={clsx('chip shrink-0 text-[10px] font-bold', sc.chip)}>{sc.name}</span>
      </div>
      <div className="text-xs text-muted">
        {p.category_label}{p.road_name ? ` · ${p.road_name}` : ''}{p.admin_name ? ` · ${p.admin_name}` : ''}
      </div>
      <div className="mt-1.5 text-xs">
        Giám sát: <b className={risk(levelOf(LANDSLIDE_LEVEL, p.traffic_status)).text}>{p.traffic_label}</b>
      </div>
      <ul className="mt-1 space-y-0.5 text-[11px] text-ink-2">
        {p.tilt_info && (
          <li>
            Nghiêng taluy <b className="font-mono">+{p.tilt_info.current_tilt_deg}°</b>
            {p.tilt_info.alarm_threshold != null && ` (ngưỡng BĐ III ${p.tilt_info.alarm_threshold}°)`} · {p.tilt_info.sensor_name}
          </li>
        )}
        {p.soil_info && <li>{p.soil_info.status_text} · {p.soil_info.sensor_name}</li>}
        {p.rain_info && <li>Mưa 24 giờ <b className="font-mono">{num(p.rain_info.rain_24h_mm, 1)} mm</b> · {p.rain_info.station_name}</li>}
        {!p.monitored && <li className="text-muted">Chưa có cảm biến nghiêng / độ ẩm đất báo số đo trong 6 giờ qua</li>}
      </ul>
      {near.length > 0 && (
        <div className="mt-1.5 border-t border-line pt-1 text-[11px]">
          <div className="font-semibold text-ink">Bản đồ điểm nguy hiểm (đã nhập) tại đây:</div>
          {near.map((h) => (
            <div key={h.id}>{h.name} — {INCIDENT_TYPE[h.type] || h.type}, nguy cơ <b>{LEVEL[h.level]?.label || h.level}</b></div>
          ))}
        </div>
      )}
      {p.response_action && <p className="mt-1.5 text-[11px] text-muted">{p.response_action}</p>}
    </div>
  );
}

function ReportPopup({ p, onIncident }) {
  const navigate = useNavigate();
  const canIncident = usePermission('incident', 'update', p.admin_code);
  const st = REPORT_STATUS[p.status];
  return (
    <div className={POP_W_SM}>
      <div className="flex flex-wrap items-center gap-1.5">
        <b>{p.category_label}</b>
        {st && <span className={clsx('chip text-[10px]', st.cls)}>{st.label}</span>}
      </div>
      <div className="text-xs text-muted">{p.code} · {ago(p.created_at)} · {p.address || p.hamlet_name || p.admin_name}</div>
      <p className="mt-1 text-xs">{p.description}</p>
      {p.n_photos > 0 && <div className="text-[11px] text-muted">{p.n_photos} ảnh — xem ở trang Phản ánh</div>}
      {p.to_sos && <div className="text-[11px] font-semibold text-danger">Đã chuyển thành phiếu SOS</div>}
      <div className="mt-2 flex flex-wrap gap-1">
        {p.has_incident ? (
          <span className="chip bg-panel2">Đã có điểm sự cố</span>
        ) : (
          canIncident && p.incident_type && (
            <button className="btn-primary px-2 py-1 text-xs" onClick={() => onIncident({ lat: p.lat, lon: p.lon, report: p })}>Tạo điểm sự cố</button>
          )
        )}
        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => navigate('/phan-anh')}>Mở trang Phản ánh</button>
      </div>
    </div>
  );
}

/**
 * Popup hồ chứa (thiết kế B.3 "popup: chi tiết, biểu đồ mini, nút hành động nhanh"): trạng thái, số liệu vận hành, diễn biến
 * 48 giờ (mực nước so MNDBT, Q đến / Q xả — chỉ tải khi mở popup, dùng chung truy vấn với tab Hồ chứa của Tổng quan), nút
 * "Cập nhật vận hành" (trực ban có quyền monitoring.update, như tab Hồ chứa) và mở tab Hồ chứa.
 */
function ReservoirPopup({ p, lv, onOperate }) {
  const navigate = useNavigate();
  const canUpdate = usePermission('monitoring', 'update', '*');
  const noData = p.status_code === 'chua_co_so_lieu';
  // Điện thoại: biểu đồ thu gọn sau nút (popup cao quá vùng bản đồ còn trống); máy tính, iPad: hiện sẵn
  const roomy = useMediaQuery('(min-width: 768px)');
  const [chart, setChart] = useState(roomy);
  const map = useMap();
  // Mở biểu đồ bằng nút làm popup cao lên → canh lại cho lọt khung (Leaflet chỉ tự kéo bản đồ lúc mở popup)
  useEffect(() => {
    if (!chart || roomy) return undefined;
    const id = setTimeout(() => map.eachLayer((l) => { if (l instanceof L.Popup && l.isOpen()) l.update(); }), 60);
    return () => clearTimeout(id);
  }, [chart, roomy, map]);
  return (
    <div className={POP_W}>
      <b>{p.name}</b>
      <div className="text-xs text-muted">Sông {p.river}{p.capacity_mw ? ` · ${p.capacity_mw} MW` : ''}</div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {p.status_label && <span className={clsx('chip text-[11px]', risk(lv).chip)}>{p.status_label}</span>}
        {p.operating_at && (
          <span className={clsx('text-[11px]', p.stale ? 'font-semibold text-warn' : 'text-muted')}>
            Số liệu lúc {fmtVn(p.operating_at)}{p.stale ? ' — đã cũ' : ''}
          </span>
        )}
      </div>
      {noData ? (
        <p className="mt-1 text-xs text-muted">
          Chưa có số liệu vận hành (mực nước, cửa xả, lưu lượng){canUpdate ? ' — nhập khi đơn vị quản lý hồ báo về' : ''}. MNDBT {num(p.normal_level, 1)} m.
        </p>
      ) : (
        <>
          <table className="mt-1 w-full text-xs">
            <tbody>
              <tr><td>Mực nước hồ</td><td className="text-right font-mono">{num(p.current_level, 2)} m</td></tr>
              <tr><td>MNDBT</td><td className="text-right font-mono">{num(p.normal_level, 1)} m</td></tr>
              <tr><td>Lưu lượng về</td><td className="text-right font-mono">{num(p.inflow_m3s)} m³/s</td></tr>
              <tr><td>Lưu lượng xả</td><td className="text-right font-mono font-semibold">{num(p.outflow_m3s)} m³/s</td></tr>
              <tr><td>Cửa xả mở</td><td className="text-right font-mono">{p.spill_gates_open}/{p.spill_gates}</td></tr>
            </tbody>
          </table>
          <div className="mt-1.5 border-t border-line pt-1.5">
            {/* Nút giữ nguyên trong DOM (chỉ đổi chữ): React gỡ phần tử vừa bấm trước khi sự kiện lan tới bản đồ → Leaflet
                thấy cú bấm "ngoài popup" và đóng popup */}
            {!roomy && (
              <button
                type="button"
                className="btn-ghost tap w-full justify-center px-2 py-1 text-xs"
                aria-expanded={chart}
                onClick={() => setChart((v) => !v)}
              >
                {chart ? 'Thu gọn diễn biến 48 giờ' : 'Xem diễn biến 48 giờ (mực nước, lưu lượng)'}
              </button>
            )}
            {chart && <ReservoirHistory reservoir={p} compact />}
          </div>
        </>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        {canUpdate && (
          <button type="button" className="btn-primary px-2 py-1 text-xs" onClick={() => onOperate(p)}>
            <PencilLine size={12} aria-hidden="true" /> Cập nhật vận hành
          </button>
        )}
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => navigate('/dashboard?tab=ho_chua')}>Mở tab Hồ chứa</button>
      </div>
    </div>
  );
}

/**
 * Popup xuồng, xe, thiết bị (thiết kế B.3 "nút hành động nhanh — VD gọi điện cho tài xế"): chưa có số người lái (BD9) → gọi
 * chỉ huy đơn vị quản lý phương tiện (số trên lớp Lực lượng, API /map/layers trả kèm).
 */
function VehiclePopup({ p }) {
  return (
    <div className="w-60">
      <b>{p.code}</b> – {VEHICLE[p.vehicle_type]}
      <div className="text-xs text-muted">{p.force_name || 'Chưa gắn đơn vị'}{p.capacity ? ` · chở ${p.capacity} người` : ''}</div>
      <div className="text-xs">{RES_STATUS[p.status].label} · Nhiên liệu {p.fuel_level == null ? 'chưa cập nhật' : `${p.fuel_level}%`}</div>
      <div className="mt-2 flex flex-wrap gap-1"><Tel phone={p.force_phone} label="Gọi chỉ huy đơn vị" /></div>
      <p className="mt-1 text-[11px] text-muted">
        {p.force_phone
          ? `Chưa có số người lái — gọi chỉ huy ${p.force_commander || 'đơn vị'} để liên lạc với phương tiện.`
          : 'Chưa có số điện thoại người lái hay đơn vị quản lý phương tiện.'}
      </p>
    </div>
  );
}

function EvacPopup({ p, onOccupancy }) {
  const canUpdate = usePermission('evacuation', 'update', p.admin_code);
  return (
    <div className="w-56">
      <b>{p.name}</b>
      <div className="text-sm">Đang chứa: <b className={clsx('font-mono', p.current_occupancy > p.capacity && 'text-danger')}>{p.current_occupancy}/{p.capacity}</b> người</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {canUpdate && <button className="btn-primary px-2 py-1 text-xs" onClick={() => onOccupancy(p)}><Users size={12} /> Cập nhật số người</button>}
        <Tel phone={p.contact_phone} />
      </div>
    </div>
  );
}

/** Vùng ngập theo kịch bản: mực nước trạm tại thời điểm đang xem (hiện tại = số đo còn tín hiệu; thanh thời gian = số đo
 * quá khứ / bản tin dự báo) so với ngưỡng của vùng. → [{ p, level, active }]; level null = chưa có số liệu → không tô. */
export function floodScenarioStates(data, timeline) {
  const stations = Object.fromEntries((data?.stations.features || []).map((f) => [f.properties.id, f.properties]));
  return (data?.flood_scenarios?.features || []).map((f) => {
    const p = f.properties;
    const st = stations[p.station_id];
    const level = timeline ? (timeline.values?.[p.station_id] ?? null) : st && !st.stale ? st.value : null;
    return { f, p, level, active: level != null && p.trigger != null && level >= p.trigger };
  });
}

const ROMAN = { 1: 'I', 2: 'II', 3: 'III' };

/**
 * Các lớp của bản đồ giám sát. `popupPad`: khoảng đệm khi popup tự kéo bản đồ cho lọt khung — chừa các bảng nổi (thanh công
 * cụ, bảng cảnh báo, thanh thời gian, nút góc phải), không để đầu popup bị che.
 */
export default function MapLayers({
  data, layers, timeline, blackspots, popupPad, onDispatch, onCamera, onIssue, onIncident, onOccupancy, onReservoirOp,
}) {
  const pad = popupPad || {};
  const map = useMap();
  const gps = useStore((s) => s.gps);
  const theme = useStore((s) => s.theme);
  const toast = useStore((s) => s.toast);
  const canDispatch = usePermission('dispatch', 'create');

  const openSos = useMemo(() => data?.sos.features || [], [data]);
  const scenarios = useMemo(() => floodScenarioStates(data, timeline), [data, timeline]);

  // Kéo–thả đội cứu hộ vào điểm SOS → mở lệnh điều động
  const onForceDrop = (force, marker) => {
    const dropped = marker.getLatLng();
    const pt = map.latLngToContainerPoint(dropped);
    let best = null;
    for (const s of openSos) {
      const d = pt.distanceTo(map.latLngToContainerPoint(ll(s)));
      if (d < 48 && (!best || d < best.d)) best = { d, s };
    }
    marker.setLatLng(gps[force.id] || ll({ geometry: { coordinates: [force.lon, force.lat] } }));
    if (best) onDispatch(best.s.properties, force.id);
    else toast({ tone: 'info', title: 'Thả biểu tượng đội cứu hộ trùng lên một điểm SOS để điều động' });
  };

  if (!data) return null;
  const pos = (f) => gps[f.properties.id] || ll(f);

  return (
    <>
      {layers.roads && (
        <GeoJSON
          key={`roads-${theme}-${data.roads.features.filter((f) => f.properties.blocked).length}`}
          data={data.roads}
          style={(f) => ({ color: f.properties.blocked ? LEVEL.do.color : theme === 'dark' ? '#fbbf24' : '#b45309', weight: f.properties.blocked ? 4 : 2, opacity: 0.7, dashArray: f.properties.blocked ? '4 4' : undefined })}
          onEachFeature={(f, l) => l.bindTooltip(`${f.properties.road_name}${f.properties.blocked ? ' – đoạn bị chặn (vùng nguy hiểm)' : ''}`, { sticky: true })}
        />
      )}

      {/* Nhóm 2: vùng nguy hiểm */}
      {data.hazard_zones.features
        .filter((f) => (f.properties.type === 'ngap' ? layers.flood : layers.landslide))
        .map((f) => {
          const p = f.properties;
          const flood = p.type === 'ngap';
          const depthOpacity = flood ? Math.min(0.7, 0.2 + (p.depth_m || 0.5) * 0.2) : 0.25;
          return (
            <GeoJSON
              key={`${p.id}-${theme}`}
              data={f}
              style={{
                color: flood ? '#1d4ed8' : (LEVEL[p.level]?.color || LEVEL.do.color),
                weight: flood ? 1 : 2,
                fillColor: flood ? '#2563eb' : (LEVEL[p.level]?.color || LEVEL.do.color),
                fillOpacity: depthOpacity,
                dashArray: p.source === 'sensor' ? '5 4' : undefined,
              }}
            >
              <Popup {...pad}>
                <b>{p.name}</b>
                <div className="text-xs text-muted">{flood ? `Độ sâu ngập ~${p.depth_m} m` : `Nguy cơ ${LEVEL[p.level]?.label || p.level || 'Cảnh báo'}`} · nguồn: {p.source === 'sensor' ? 'cảm biến IoT (tự động)' : p.source === 'model' ? 'mô hình nội suy DEM' : 'thủ công'}</div>
                <div className="text-xs">Hiệu lực đến {new Date(p.valid_until).toLocaleString('vi-VN')}</div>
              </Popup>
            </GeoJSON>
          );
        })}

      {layers.floodScenario &&
        scenarios
          .filter((s) => s.active)
          .map(({ f, p, level }) => (
            <GeoJSON key={`fs-${p.id}-${theme}`} data={f} style={{ color: '#1e40af', weight: 1, fillColor: '#2563eb', fillOpacity: 0.28 }}>
              <Popup {...pad}>
                <b>{p.name}</b>
                <div className="text-xs">
                  Kịch bản ngập khi {p.station_name} {p.alarm_level ? `đạt BĐ ${ROMAN[p.alarm_level]}` : 'đạt'} ({p.trigger} m) — mực nước
                  {timeline ? ` lúc ${fmtVn(timeline.time)}` : ' hiện tại'} <b className="font-mono">{level} m</b>
                </div>
                {p.depth_m != null && <div className="text-xs text-muted">Độ sâu ngập điển hình ~{p.depth_m} m</div>}
              </Popup>
            </GeoJSON>
          ))}

      {layers.hazardPoints &&
        data.hazard_points.features
          .filter((f) => !(layers.blackspots && blackspots?.merged.has(f.properties.id))) // đã gộp vào tam giác điểm đen
          .map((f) => (
            <Marker key={f.properties.id} position={ll(f)} icon={hazardIcon(f.properties.type, f.properties.level)}>
              <Popup {...pad}><HazardPopup p={f.properties} /></Popup>
            </Marker>
          ))}

      {layers.blackspots &&
        (blackspots?.list || []).map(({ p, near, level }) => (
          <Marker key={`bs-${p.code}`} position={[p.lat, p.lon]} icon={blackspotIcon(level)} title={`${p.name} — ${p.traffic_label}`} zIndexOffset={300}>
            <Popup {...pad}><BlackspotPopup p={p} near={near} level={level} /></Popup>
          </Marker>
        ))}

      {layers.reports &&
        (data.reports?.features || []).map((f) => (
          <Marker key={f.properties.id} position={ll(f)} icon={reportIcon(f.properties.status)}>
            <Popup {...pad}><ReportPopup p={f.properties} onIncident={onIncident} /></Popup>
          </Marker>
        ))}

      {/* Nhóm 1: thủy văn – khí tượng */}
      {layers.stations &&
        data.stations.features.map((f) => {
          const p = f.properties;
          // Thanh thời gian: chỉ giá trị tại thời điểm đó (không có → xám, không lấy số hiện tại thay); hiện tại: số đo
          // mới nhất, cũ quá 60 phút = mất tín hiệu (viền nét đứt, không ghi số; số cuối vượt BĐ thì giữ màu báo động)
          const value = timeline ? (timeline.values?.[p.id] ?? null) : p.value;
          const stale = !timeline && p.stale;
          const lv = value == null ? null : alarmLevel(value, p.thresholds);
          const label = value == null || stale ? undefined : p.type === 'muc_nuoc' ? value.toFixed(1) : p.type === 'luong_mua' ? Math.round(value) : value.toFixed(1);
          return (
            <Marker key={p.id} position={ll(f)} icon={stationIcon(p.type, stale && !lv ? null : lv, label, stale)}>
              <Popup {...pad}><StationPopup p={{ ...p, value, stale, at: timeline?.time }} /></Popup>
            </Marker>
          );
        })}

      {layers.reservoirs &&
        data.reservoirs.features.map((f) => {
          const p = f.properties;
          // Trạng thái theo cách tính của Dashboard (map_layers.py → services/reservoirs.py); chưa có số liệu → Xám
          const lv = levelOf(RESERVOIR_LEVEL, p.status_code);
          return (
            <Marker key={p.id} position={ll(f)} icon={reservoirIcon(p.spill_gates_open, lv, p.outflow_m3s)}>
              <Popup {...pad}><ReservoirPopup p={p} lv={lv} onOperate={onReservoirOp} /></Popup>
            </Marker>
          );
        })}

      {/* Nhóm 3: lực lượng & vật tư */}
      {layers.warehouses &&
        data.warehouses.features.map((f) => (
          <Marker key={f.properties.id} position={ll(f)} icon={warehouseIcon(f.properties.min_pct ?? f.properties.pct)}>
            <Popup {...pad}><WarehousePopup p={f.properties} onIssue={onIssue} /></Popup>
          </Marker>
        ))}

      {layers.evac &&
        data.evacuation_sites.features.map((f) => {
          const p = f.properties;
          return (
            <Marker key={p.id} position={ll(f)} icon={evacIcon(p.current_occupancy / p.capacity)}>
              <Popup {...pad}><EvacPopup p={p} onOccupancy={onOccupancy} /></Popup>
            </Marker>
          );
        })}

      {layers.vehicles &&
        data.vehicles.features.map((f) => {
          const p = f.properties;
          return (
            <Marker key={p.id} position={pos(f)} icon={vehicleIcon(p)}>
              <Popup {...pad}><VehiclePopup p={p} /></Popup>
            </Marker>
          );
        })}

      {layers.forces &&
        data.forces.features.map((f) => {
          const p = f.properties;
          return (
            <Marker
              key={p.id}
              position={pos(f)}
              icon={forceIcon(p.status)}
              draggable={canDispatch}
              eventHandlers={{ dragend: (e) => onForceDrop(p, e.target) }}
              zIndexOffset={500}
            >
              <Tooltip direction="top" offset={[0, -14]}>{p.name}</Tooltip>
              <Popup {...pad}>
                <div className={POP_W_SM}>
                  <b>{p.name}</b>
                  <div className="text-xs text-muted">{FORCE_TYPE[p.org_type]} · {p.commander}</div>
                  <div className="text-xs">Sẵn sàng {p.personnel_ready} · Nhiệm vụ {p.personnel_on_mission} · 📻 {p.radio_freq}</div>
                  <div className="mt-1 flex flex-wrap gap-1">{p.skills.map((s) => <span key={s} className="chip bg-panel2">{SKILL[s]}</span>)}</div>
                  <div className="mt-2"><Tel phone={p.contact_phone} label="Gọi chỉ huy" /></div>
                  <p className="mt-1 text-[11px] text-muted">Kéo biểu tượng này thả vào điểm SOS để điều động.</p>
                </div>
              </Popup>
            </Marker>
          );
        })}

      {layers.routes &&
        data.routes.features.map((f) => (
          <Polyline
            key={f.properties.id}
            positions={f.geometry.coordinates.map(([x, y]) => [y, x])}
            pathOptions={{ color: f.properties.route_safe ? LEVEL.an_toan.color : LEVEL.cam.color, weight: 4, dashArray: '10 6', opacity: 0.9 }}
          >
            <Tooltip sticky>{f.properties.force_name} → {f.properties.ticket_code} ({Math.round(f.properties.progress * 100)}%)</Tooltip>
          </Polyline>
        ))}

      {layers.cameras &&
        data.cameras.features.map((f) => (
          <Marker key={f.properties.id} position={ll(f)} icon={cameraIcon()}>
            <Popup {...pad}>
              <b>{f.properties.name}</b>
              <div className="mt-1"><button className="btn-primary px-2 py-1 text-xs" onClick={() => onCamera(f.properties)}><Video size={12} /> Xem trực tiếp</button></div>
            </Popup>
          </Marker>
        ))}

      {/* Nhóm 4: SOS */}
      {layers.sos &&
        openSos.map((f) => {
          const p = f.properties;
          return (
            <Marker key={p.id} position={ll(f)} icon={sosIcon(p.priority, p.status)} zIndexOffset={1000}>
              <Popup {...pad}><SosPopup p={p} onDispatch={(t) => onDispatch(t)} /></Popup>
            </Marker>
          );
        })}
    </>
  );
}

/** Bão / ATNĐ: bản tin trực ban nhập (hoặc kịch bản của bộ mô phỏng); chạy thật chưa có bản tin → API 404, lớp bị khoá. */
export const stormQuery = { queryKey: ['storm'], queryFn: () => api('/map/storm-track'), staleTime: 5 * 60_000, retry: false };

/** Vị trí tâm bão tại thời điểm t: nội suy tuyến tính giữa hai mốc kề; ngoài khoảng các mốc → null (không vẽ tâm). */
function stormPosition(pts, t) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const [ta, tb] = [Date.parse(a.time), Date.parse(b.time)];
    if (t >= ta && t <= tb) {
      const k = tb === ta ? 0 : (t - ta) / (tb - ta);
      return { lat: a.lat + (b.lat - a.lat) * k, lon: a.lon + (b.lon - a.lon) * k, near: k < 0.5 ? a : b };
    }
  }
  return null;
}

function StormTrack({ storm, t }) {
  const pts = storm.points;
  const done = pts.filter((p) => !p.forecast);
  const ahead = [done.at(-1), ...pts.filter((p) => p.forecast)].filter(Boolean);
  const pos = stormPosition(pts, t);
  const level = (p) => `${p.label}${p.wind_level != null ? ` cấp ${p.wind_level}` : ''}${p.gust_level != null ? `, giật ${p.gust_level}` : ''}`;
  return (
    <>
      {done.length > 1 && <Polyline positions={done.map((p) => [p.lat, p.lon])} pathOptions={{ color: '#a855f7', weight: 3 }} />}
      {ahead.length > 1 && <Polyline positions={ahead.map((p) => [p.lat, p.lon])} pathOptions={{ color: '#a855f7', weight: 3, dashArray: '8 6' }} />}
      {pts.map((p) => (
        <CircleMarker key={p.time} center={[p.lat, p.lon]} radius={4} pathOptions={{ color: '#a855f7', fillOpacity: 1 }}>
          <Tooltip>{fmtVn(p.time)} · {level(p)}{p.forecast ? ' · dự báo' : ''}</Tooltip>
        </CircleMarker>
      ))}
      {pos && (
        <>
          {pos.near.radius_km && (
            <Circle center={[pos.lat, pos.lon]} radius={pos.near.radius_km * 1000} pathOptions={{ color: '#a855f7', weight: 1, fillOpacity: 0.08 }} />
          )}
          <Marker position={[pos.lat, pos.lon]} icon={stormIcon()}>
            {/* Giữ nguyên "(kịch bản mô phỏng)" trong tên — không để quỹ đạo trình diễn trông như bão thật */}
            <Tooltip permanent direction="right" offset={[14, 0]}>{storm.name} · {level(pos.near)}</Tooltip>
          </Marker>
        </>
      )}
    </>
  );
}

/** Quỹ đạo các cơn bão đang theo dõi + vùng gió mạnh quanh tâm theo thanh thời gian. */
export function StormLayer({ offset }) {
  const { data } = useQuery(stormQuery);
  if (!data) return null;
  const t = Date.now() + offset * 3600_000;
  return data.storms.map((storm) => <StormTrack key={storm.id || storm.name} storm={storm} t={t} />);
}
