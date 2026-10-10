import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { CheckCircle2, CircleDashed, Cpu, DatabaseZap, PlugZap, Server } from 'lucide-react';
import { api } from '../../api/client';
import { STATION_TYPE } from '../../utils/labels';
import { ErrorState } from '../common/ui';
import { ago, dateTime, int } from '../../utils/format';

const SOURCE_KIND = { simulator: 'Bộ mô phỏng', iot: 'Thiết bị IoT', external: 'Nguồn ngoài' };
// như SRC_STATUS ở pages/DataSources.jsx (không import trang đó — kéo cả trang vào gói Dashboard)
const SRC_STATUS = {
  ok: ['Hoạt động', 'bg-good/15 text-good'],
  loi: ['Lỗi', 'bg-danger/15 text-danger'],
  chua_chay: ['Chưa chạy', 'bg-panel2 text-muted'],
  tat: ['Đã tắt', 'bg-panel2 text-muted'],
};
const FRESH_MS = 60 * 60 * 1000; // như STALE_MINUTES ở backend

/** /health nằm ngoài /api/v1 (app/main.py) — nginx và Vite đều chuyển tiếp; luôn 200, trạng thái trong `status`. */
const fetchHealth = () => fetch('/health').then((r) => r.json());

function Box({ icon: Icon, title, right, children, className }) {
  return (
    <section className={clsx('card flex min-w-0 flex-col gap-2 p-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="card-title">
          <Icon size={15} className="text-accent" /> {title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}

const Row = ({ label, children }) => (
  <div className="flex items-baseline justify-between gap-3 border-b border-line/40 py-1 text-xs last:border-0">
    <span className="text-muted">{label}</span>
    <span className="text-right font-medium text-ink">{children}</span>
  </div>
);

/**
 * Góc nhìn quản trị hệ thống (quyền integration.view): tình trạng máy chủ (/health), trạm & thiết bị, nguồn dữ liệu kéo
 * (/integrations/*) và mức sẵn có của dữ liệu nền mà Dashboard cần. Chỉ hiện số hệ thống đo được — không có số minh hoạ.
 */
export default function SystemView({ k, stations, supplies, evac, unitsCount, canImport }) {
  const { data: health, isError: healthError } = useQuery({ queryKey: ['health'], queryFn: fetchHealth, refetchInterval: 30_000 });
  const monitorQ = useQuery({ queryKey: ['int-monitor'], queryFn: () => api('/integrations/monitor'), refetchInterval: 15_000 });
  const sourcesQ = useQuery({ queryKey: ['int-sources'], queryFn: () => api('/integrations/sources'), refetchInterval: 20_000 });
  const monitor = monitorQ.data;
  const sources = sourcesQ.data || [];

  const now = Date.now();
  const byType = Object.keys(STATION_TYPE).map((type) => {
    const list = stations.filter((s) => s.type === type);
    const fresh = list.filter((s) => s.value != null && s.time && now - new Date(s.time).getTime() <= FRESH_MS).length;
    return { type, total: list.length, fresh };
  });
  const water = stations.filter((s) => s.type === 'muc_nuoc');
  const withThr = water.filter((s) => s.thresholds?.bd1 != null && s.thresholds?.bd2 != null && s.thresholds?.bd3 != null).length;
  const v = k?.vehicles || {};
  const vehicles = (v.active || 0) + (v.ready || 0) + (v.maintenance || 0);
  const readiness = [
    ['Trạm mực nước', water.length, water.length ? `${withThr}/${water.length} trạm đủ ngưỡng BĐ I–III` : 'Loại "Trạm quan trắc"'],
    ['Trạm đo mưa', byType.find((t) => t.type === 'luong_mua').total, 'Loại "Trạm quan trắc"'],
    ['Cảm biến sạt lở (nghiêng, độ ẩm đất)', byType.filter((t) => t.type === 'do_nghieng' || t.type === 'do_am_dat').reduce((n, t) => n + t.total, 0), 'Loại "Trạm quan trắc"'],
    ['Hồ chứa', k?.reservoirs?.total, k?.reservoirs?.no_data_count ? `${k.reservoirs.no_data_count} hồ chưa có số liệu vận hành` : 'Loại "Hồ chứa"'],
    ['Lực lượng', k?.forces?.units, 'Loại "Lực lượng"'],
    ['Phương tiện', vehicles, 'Loại "Phương tiện"'],
    ['Kho có định mức dự trữ', supplies?.length, 'Loại "Kho vật tư" + "Tồn kho"'],
    ['Xã đã cập nhật kế hoạch sơ tán', evac?.progress?.length, `trên ${unitsCount} xã/phường · Điều hành cứu hộ`],
    ['Điểm sơ tán', evac?.sites?.length, 'Loại "Điểm sơ tán"'],
  ];
  return (
    <div className="grid gap-3 lg:grid-cols-2 [&>*]:min-w-0">
      <Box
        icon={Server}
        title="Máy chủ & tiến trình"
        right={
          health && (
            <span className={clsx('chip px-2 py-0 text-[10px]', health.status === 'ok' ? 'bg-good/15 text-good' : 'bg-serious/15 text-serious')}>
              {health.status === 'ok' ? 'Hoạt động bình thường' : 'Suy giảm'}
            </span>
          )
        }
      >
        {healthError && <p className="text-xs text-danger">Không đọc được /health — kiểm tra kết nối tới máy chủ.</p>}
        {health && (
          <div>
            <Row label="CSDL">
              PostGIS {String(health.db?.postgis || '–').split(' ')[0]} · TimescaleDB {health.db?.timescaledb || '–'}
            </Row>
            <Row label="Redis">{health.redis === true ? 'Đã kết nối' : health.redis === false ? 'Lỗi kết nối' : 'Không dùng (máy đơn)'}</Row>
            <Row label="Tiến trình nền (worker)">
              {health.run_mode === 'api'
                ? health.worker_heartbeat_age_s != null
                  ? `nhịp ${int(health.worker_heartbeat_age_s)} giây trước`
                  : 'chưa nhận nhịp'
                : `chạy chung tiến trình (RUN_MODE=${health.run_mode})`}
            </Row>
            <Row label="Bộ mô phỏng">
              {health.simulator ? <span className="text-serious">BẬT — số đo trạm, GPS, SOS mẫu là mô phỏng</span> : 'Tắt'}
            </Row>
            <Row label="Kết nối realtime (tiến trình này)">{int(health.ws_clients)}</Row>
            <Row label="Lưu trữ ảnh">{health.storage}</Row>
          </div>
        )}
      </Box>

      <Box icon={Cpu} title="Trạm quan trắc & thiết bị IoT" right={<Link to="/nguon-du-lieu" className="touch-hit text-xs font-semibold text-accent hover:underline">Quản lý →</Link>}>
        <div>
          {byType.map((t) => (
            <Row key={t.type} label={STATION_TYPE[t.type]}>
              {t.total ? `${t.fresh}/${t.total} trạm có số đo trong 60 phút` : <span className="text-muted">chưa có trạm</span>}
            </Row>
          ))}
          {!monitor && monitorQ.isError && <ErrorState onRetry={monitorQ.refetch}>Không tải được tình trạng thiết bị IoT</ErrorState>}
          {monitor && (
            <>
              <Row label="Nguồn số đo của trạm">
                {monitor.stations.length ? monitor.stations.map((s) => `${SOURCE_KIND[s.source] || s.source}: ${s.n}`).join(' · ') : '–'}
              </Row>
              <Row label="Thiết bị IoT">
                {monitor.devices.total
                  ? `${monitor.devices.online} trực tuyến · ${monitor.devices.offline} mất tín hiệu · ${monitor.devices.never} chưa kết nối`
                  : 'chưa đăng ký thiết bị'}
              </Row>
              <Row label="Bản ghi nhận 24 giờ qua (số đo trạm + dự báo)">
                {int(monitor.last24.accepted)} nhận · {int(monitor.last24.rejected)} loại · {int(monitor.last24.errors)} lỗi
              </Row>
              <Row label="Cầu nối MQTT">{monitor.mqtt_connected ? 'Đã kết nối' : 'Chưa kết nối / tắt'}</Row>
            </>
          )}
        </div>
      </Box>

      <Box icon={DatabaseZap} title="Dữ liệu nền cho Dashboard" right={canImport && <Link to="/nhap-du-lieu" className="touch-hit text-xs font-semibold text-accent hover:underline">Nhập dữ liệu →</Link>}>
        <p className="text-[11px] text-muted">Đếm trong vùng đang xem. Thiếu dữ liệu nào thì ô tương ứng trên Dashboard hiện "chưa có".</p>
        <ul className="flex flex-col">
          {readiness.map(([label, n, hint]) => (
            <li key={label} className="flex items-center gap-2 border-b border-line/40 py-1 text-xs last:border-0">
              {n ? <CheckCircle2 size={14} className="shrink-0 text-good" /> : <CircleDashed size={14} className="shrink-0 text-muted" />}
              <span className="min-w-0 flex-1">
                <span className="text-ink">{label}</span>
                <span className="block truncate text-[11px] text-muted">{hint}</span>
              </span>
              {n ? <b className="font-mono text-ink">{int(n)}</b> : <span className="text-muted">{n == null ? '–' : 'Chưa có'}</span>}
            </li>
          ))}
        </ul>
      </Box>

      <Box icon={PlugZap} title={`Nguồn dữ liệu kéo · ${sources.length}`}>
        <ul className="flex flex-col">
          {sources.map((s) => {
            const [label, cls] = s.enabled ? SRC_STATUS[s.status] || SRC_STATUS.chua_chay : SRC_STATUS.tat;
            return (
              <li key={s.id} className="border-b border-line/40 py-1 text-xs last:border-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-ink">{s.name}</span>
                  <span className={clsx('chip shrink-0 px-1.5 py-0 text-[10px]', cls)}>{label}</span>
                </div>
                <div className="truncate text-muted" title={s.last_error || ''}>
                  {s.last_success_at ? `Lần thành công: ${ago(s.last_success_at)}` : 'Chưa có lần chạy thành công'}
                  {s.last_error && ` · ${s.last_error}`}
                </div>
              </li>
            );
          })}
          {!sourcesQ.data && sourcesQ.isError && <li><ErrorState onRetry={sourcesQ.refetch}>Không tải được danh sách nguồn dữ liệu</ErrorState></li>}
          {sourcesQ.data && !sources.length && <li className="py-3 text-center text-xs text-muted">Chưa khai báo nguồn dữ liệu</li>}
        </ul>
        {monitor?.log?.length > 0 && (
          <div className="border-t border-line/60 pt-2">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Nhật ký nhận số đo gần nhất</div>
            <ul className="flex flex-col gap-0.5">
              {monitor.log.slice(0, 6).map((l) => (
                <li key={l.id} className={clsx('truncate text-[11px]', l.level === 'error' ? 'text-danger' : 'text-ink-2')} title={l.message}>
                  <span className="font-mono text-muted">{dateTime(l.time)}</span> · {l.source} · {l.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Box>
    </div>
  );
}
