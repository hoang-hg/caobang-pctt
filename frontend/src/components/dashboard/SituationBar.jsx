import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { AlertTriangle, DatabaseZap, Info, ShieldAlert, Siren } from 'lucide-react';
import { num } from '../../utils/format';
import { riverState, ROMAN } from './RiverKpi';

const NOTE = 'Tổng hợp tự động từ số liệu hệ thống — không phải cấp độ rủi ro thiên tai do cơ quan có thẩm quyền công bố';

/**
 * Các tình huống đáng chú ý lấy từ số liệu thật (KPI + trạm mực nước): trạm vượt báo động, SOS quá hạn / cấp 1, điểm
 * sạt lở cấm đường / cảnh báo, hồ xả, mưa ≥ 50 mm/24h (ngưỡng như utils/stations). Sắp xếp theo mức 3 → 1.
 */
export function situationItems(k, waterStations) {
  const items = [];
  for (const s of waterStations) {
    const st = riverState(s);
    if (st.level >= 1) {
      const where = s.river ? `Sông ${s.river}` : s.name;
      items.push({ level: st.level, text: `${where} trên BĐ ${ROMAN[st.level]} (${num(st.value, 2)} m${st.stale ? ', số đo cũ' : ''})` });
    }
  }
  const sos = k?.sos || {};
  if (sos.overdue > 0) items.push({ level: 3, text: `${sos.overdue} phiếu SOS quá hạn phản hồi` });
  if (sos.critical > 0) items.push({ level: 3, text: `${sos.critical} phiếu SOS cấp 1 chưa xong` });
  const rs = k?.reservoirs || {};
  if (rs.emergency_count > 0) items.push({ level: 3, text: `${rs.emergency_count} hồ xả khẩn cấp` });
  const ls = k?.landslides || {};
  if (ls.blocked_count > 0) items.push({ level: 2, text: `${ls.blocked_count} điểm sạt lở cấm đường` });
  const rain = k?.rain;
  const at = rain?.max_station ? ` tại ${rain.max_station.replace(/^Trạm đo mưa\s+/i, '')}` : '';
  if (rain?.max_24h >= 100) items.push({ level: 2, text: `Mưa rất to ${num(rain.max_24h, 1)} mm/24h${at}` });
  else if (rain?.max_24h >= 50) items.push({ level: 1, text: `Mưa to ${num(rain.max_24h, 1)} mm/24h${at}` });
  if (ls.warning_count > 0) items.push({ level: 1, text: `${ls.warning_count} điểm sạt lở cảnh báo` });
  const spilling = (rs.spill_count || 0) - (rs.emergency_count || 0);
  if (spilling > 0) items.push({ level: 1, text: `${spilling} hồ đang xả điều tiết` });
  return items.sort((a, b) => b.level - a.level);
}

/**
 * Dải tình huống đầu Dashboard. Mức 2–3: dải đỏ / cam dính trên cùng khi cuộn (thông tin khẩn luôn thấy). Không có
 * tình huống: nói "chưa ghi nhận" kèm độ phủ số đo — không nói "an toàn"; chưa có số đo trạm: dải xám chỉ chỗ nhập.
 */
export default function SituationBar({ k, waterStations, rainKnown, canReport, onReport, canImport }) {
  const items = situationItems(k, waterStations);
  const worst = items[0]?.level || 0;
  const fresh = waterStations.filter((s) => {
    const st = riverState(s);
    return !st.noData && !st.stale;
  }).length;
  const hasData = fresh > 0 || rainKnown;
  const noDataNote = !hasData && 'chưa có số đo trạm mực nước / đo mưa';

  if (worst >= 2) {
    return (
      <div
        className={clsx(
          'sticky top-0 z-30 -mx-3.5 -mt-3.5 mb-1 flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 text-xs text-white shadow-lg sm:-mx-5 sm:-mt-5 sm:px-5 print:static',
          worst === 3 ? 'bg-danger' : 'bg-serious',
        )}
        role="status"
        title={NOTE}
      >
        <div className="flex min-w-0 items-start gap-2">
          <Siren size={16} className={clsx('mt-0.5 shrink-0', worst === 3 && 'animate-pulse')} />
          <p className="min-w-0 leading-snug">
            <b className="mr-1.5 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider">
              {worst === 3 ? 'Khẩn cấp' : 'Cần chú ý'}
            </b>
            {items.map((it) => it.text).join(' · ')}
            {noDataNote && <span className="opacity-80"> · {noDataNote}</span>}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2 no-print">
          {(k?.sos?.overdue > 0 || k?.sos?.waiting > 0) && (
            <Link
              to="/cuu-ho"
              className="flex items-center gap-1 rounded-lg border border-white/40 bg-white/15 px-2.5 py-1 text-xs font-bold text-white shadow-sm transition hover:bg-white/25 active:scale-95"
              title="Mở bảng điều hành cứu hộ để xử lý các phiếu SOS"
            >
              <Siren size={13} className="animate-pulse" />
              Xử lý {k.sos.overdue > 0 ? `${k.sos.overdue} SOS quá hạn` : `${k.sos.waiting} SOS chờ`} →
            </Link>
          )}
          {canReport && (
            <button
              type="button"
              onClick={onReport}
              className="flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-black text-danger shadow-sm active:scale-95"
            >
              <ShieldAlert size={13} /> Báo cáo nhanh
            </button>
          )}
        </div>
      </div>
    );
  }

  if (worst === 1) {
    return (
      <div className="card flex items-start gap-2 border-warn/60 bg-warn/10 px-3 py-2 text-xs text-ink" role="status" title={NOTE}>
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />
        <p className="leading-snug">
          <b className="mr-1 text-warn">Theo dõi:</b>
          {items.map((it) => it.text).join(' · ')}
          {noDataNote && <span className="text-muted"> · {noDataNote}</span>}
        </p>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="card flex flex-wrap items-center gap-2 border-dashed px-3 py-2 text-xs text-muted" role="status">
        <DatabaseZap size={15} className="shrink-0" />
        <span className="min-w-0 flex-1">
          Chưa có số đo trạm mực nước / đo mưa trong vùng đang xem — Dashboard chưa đánh giá được tình hình mưa, lũ.
        </span>
        <Link to={canImport ? '/nhap-du-lieu' : '/nguon-du-lieu'} className="font-semibold text-accent hover:underline">
          {canImport ? 'Nhập danh mục trạm →' : 'Xem nguồn dữ liệu →'}
        </Link>
      </div>
    );
  }

  return (
    <div className="card flex items-start gap-2 px-3 py-2 text-xs text-ink-2" role="status" title={NOTE}>
      <Info size={15} className="mt-0.5 shrink-0 text-muted" />
      <span>
        Chưa ghi nhận trạm vượt báo động, SOS quá hạn, sạt lở cấm đường, hồ xả hay mưa ≥ 50 mm/24h trong vùng đang xem
        {waterStations.length > 0 && ` · ${fresh}/${waterStations.length} trạm mực nước có số đo trong 60 phút qua`}.
      </span>
    </div>
  );
}
