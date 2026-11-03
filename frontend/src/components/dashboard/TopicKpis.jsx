import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CloudRain, Compass, CloudSun, Mountain, Construction, Map as MapIcon } from 'lucide-react';
import { api } from '../../api/client';
import { useAreaQuery } from '../../api/hooks';
import { useStore } from '../../app/store';
import { num } from '../../utils/format';
import { alarmLevel } from '../../utils/labels';
import { rainLevel } from '../../utils/risk';
import StatCard from './StatCard';

const shortStation = (name) => (name || '').replace(/^Trạm đo mưa\s+/i, '');
const LS_LEVEL = { do: 3, cam: 2, vang: 1 };

/**
 * Hàng 3 ô số riêng của thẻ chuyên đề trên Tổng quan máy tính (bản vẽ desktop, khung A4 Mưa lớn · A5 Sạt lở, lũ quét) —
 * nằm trên biểu đồ của thẻ. Chỉ dùng truy vấn đã có (cùng khoá với biểu đồ / hộp chọn địa bàn — TanStack gộp, không gọi
 * thêm): /dashboard/kpis, /dashboard/communes, /forecast/areas, /dashboard/landslide-sensors, /dashboard/landslide-risk.
 * Thiếu số liệu → ô viền đứt "chưa có số liệu", không bao giờ tô xanh như "an toàn".
 */
export default function TopicKpis({ tab, k }) {
  const codes = useStore((s) => s.filter.codes);
  const isRain = tab === 'mua_lon';
  const isSlide = tab === 'sat_lo';
  // Tình hình từng xã (mưa dự báo 24 giờ tới theo xã) — cùng khoá với hộp chọn địa bàn
  const communesQ = useQuery({ queryKey: ['communes-status'], queryFn: () => api('/dashboard/communes'), enabled: isRain, staleTime: 30_000, refetchInterval: isRain ? 60_000 : false });
  const { data: fcAreas } = useAreaQuery('forecast-areas', '/forecast/areas', { hours: 72 }, { refetchInterval: 10 * 60_000, enabled: isRain });
  const { data: sensors } = useAreaQuery('landslide-sensors', '/dashboard/landslide-sensors', { hours: 48 }, { refetchInterval: 60_000, enabled: isSlide });
  const { data: lsRisk } = useAreaQuery('landslide', '/dashboard/landslide-risk', {}, { refetchInterval: 60_000, enabled: isSlide });

  const rainCommunes = useMemo(() => {
    const rows = (communesQ.data || []).filter((r) => !codes.length || codes.includes(r.code));
    const known = rows.filter((r) => r.rain_24h != null);
    const heavy = known.filter((r) => Number(r.rain_24h) >= 100);
    const lv = known.reduce((m, r) => Math.max(m, rainLevel(r.rain_24h) || 0), 0);
    return { total: rows.length, known: known.length, heavy: heavy.length, level: known.length ? lv : null };
  }, [communesQ.data, codes]);

  if (isRain) {
    const rain = k?.rain;
    const known = rain?.avg_24h != null;
    const top = fcAreas?.length ? fcAreas.reduce((m, a) => (Number(a.p50) > Number(m.p50) ? a : m)) : null;
    return (
      <div className="grid grid-cols-3 gap-3" aria-label="Chỉ số mưa lớn">
        <StatCard
          compact
          icon={CloudRain}
          title="Mưa trung bình 24 giờ"
          level={known ? rainLevel(rain.max_24h) : null}
          value={known ? num(rain.avg_24h, 1) : '–'}
          unit={known ? 'mm' : undefined}
          footer={known
            ? <>Lớn nhất <b className="font-semibold text-ink">{num(rain.max_24h, 1)} mm</b>{rain.max_station ? ` · ${shortStation(rain.max_station)}` : ''}</>
            : 'Chưa có số đo mưa trong vùng đang xem'}
        />
        <StatCard
          compact
          icon={CloudSun}
          title="Xã có thể mưa rất to"
          level={rainCommunes.level}
          value={rainCommunes.known ? rainCommunes.heavy : '–'}
          unit={rainCommunes.known ? `/ ${rainCommunes.total} xã` : undefined}
          footer={rainCommunes.known ? '≥ 100 mm trong 24 giờ tới (dự báo)' : communesQ.isError ? 'Không tải được dự báo theo xã' : 'Chưa có dự báo mưa theo xã'}
        />
        <StatCard
          compact
          icon={MapIcon}
          title="Dự báo 3 ngày tới"
          level={top ? undefined : null}
          value={top ? num(top.p50, 0) : '–'}
          unit={top ? 'mm' : undefined}
          footer={top ? <>nhiều nhất · {top.name} (có thể tới {num(top.p90, 0)} mm)</> : 'Chưa có bản dự báo 3 ngày'}
        />
      </div>
    );
  }

  if (isSlide) {
    const ls = k?.landslides;
    const blockedNames = (ls?.points || []).filter((p) => p.traffic_status === 'cam_duong').map((p) => p.name);
    const sensorRows = (sensors?.sensors || []).map((s) => (s.value == null || s.thresholds?.bd1 == null ? null : alarmLevel(Number(s.value), s.thresholds)));
    const sensorsOver = sensorRows.filter((lv) => lv >= 1);
    const pts = lsRisk?.points || [];
    const hit = pts.filter((p) => LS_LEVEL[p.risk]);
    const hitCommunes = new Set(hit.map((p) => p.admin_name).filter(Boolean));
    return (
      <div className="grid grid-cols-3 gap-3" aria-label="Chỉ số sạt lở, lũ quét">
        <StatCard
          compact
          icon={Construction}
          title="Điểm cấm đường"
          level={ls ? (ls.blocked_count ? 3 : 0) : null}
          value={ls ? ls.blocked_count : '–'}
          unit={ls ? 'điểm' : undefined}
          footer={!ls ? 'Chưa tải được danh mục điểm sạt lở' : blockedNames.length ? blockedNames.join(', ') : `${ls.warning_count || 0} điểm đang cảnh báo`}
        />
        <StatCard
          compact
          icon={Compass}
          title="Cảm biến vượt ngưỡng"
          level={sensorRows.length ? Math.max(0, ...sensorRows.map((lv) => lv ?? 0)) : null}
          value={sensorRows.length ? sensorsOver.length : '–'}
          unit={sensorRows.length ? `/ ${sensorRows.length}` : undefined}
          footer={sensorRows.length ? 'nghiêng taluy · độ ẩm đất' : 'Chưa có cảm biến trong vùng đang xem'}
        />
        <StatCard
          compact
          icon={Mountain}
          title="Xã vượt ngưỡng mưa sạt lở"
          level={pts.length ? hit.reduce((m, p) => Math.max(m, LS_LEVEL[p.risk]), 0) : null}
          value={pts.length ? hitCommunes.size : '–'}
          unit={pts.length ? 'xã' : undefined}
          footer={pts.length ? `${hit.length}/${pts.length} trạm mưa vượt đường ngưỡng` : 'Chưa có số đo mưa 3 ngày qua'}
        />
      </div>
    );
  }
  return null;
}
