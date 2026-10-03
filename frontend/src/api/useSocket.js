import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStore } from '../app/store';
import { playAlarm } from '../utils/audio';
import { INCIDENT } from '../utils/labels';

/** Kết nối WebSocket /ws: nhận sự kiện realtime và làm mới dữ liệu tương ứng (không cần F5). */
export function useSocket() {
  const qc = useQueryClient();
  const token = useStore((s) => s.auth?.token);

  useEffect(() => {
    if (!token) return undefined;
    let ws;
    let retry;
    let closed = false;
    const last = {};
    const throttle = (key, ms, fn) => {
      const now = Date.now();
      if (!last[key] || now - last[key] > ms) {
        last[key] = now;
        fn();
      }
    };
    const inv = (...keys) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    const { setWsStatus, applyGps, toast } = useStore.getState();

    const handle = ({ event, data }) => {
      switch (event) {
        case 'reading.new':
          throttle('readings', 10_000, () => inv('kpis', 'stations', 'rainfall', 'landslide'));
          throttle('series', 30_000, () => inv('series'));
          break;
        case 'sos.new':
          inv('sos', 'kpis', 'map-layers');
          if (useStore.getState().soundOn && data.priority <= 2) playAlarm(data.priority);
          toast({
            tone: data.priority === 1 ? 'danger' : 'warn',
            title: `SOS mới ${data.code}`,
            body: `${INCIDENT[data.incident_type]} – ${data.address || data.admin_name || ''} (${data.trapped_count} người)`,
          });
          break;
        case 'field.report': // trưởng nhóm báo từ link nhiệm vụ (/nhiem-vu)
          inv('sos', 'kpis', 'map-layers');
          if (data.kind === 'need_support') {
            if (useStore.getState().soundOn) playAlarm(1);
            toast({ tone: 'danger', title: `${data.code}: ${data.force_name} cần chi viện`, body: data.note || '' });
          } else if (data.kind === 'rescued') {
            toast({
              tone: 'good',
              title: `${data.code}: đội báo đã cứu ${data.people_safe}${data.trapped_count ? `/${data.trapped_count}` : ''} người`,
              body: 'Gọi xác nhận rồi bấm “Xác nhận hoàn thành” trên thẻ phiếu',
            });
          } else {
            toast({ tone: 'good', title: `${data.force_name} đã đến hiện trường ${data.code}` });
          }
          break;
        case 'sos.updated':
        case 'dispatch.updated':
          inv('sos', 'kpis', 'map-layers', 'forces', 'vehicles', 'resources-summary');
          break;
        case 'gps.update':
          if (data.length) applyGps(data);
          else inv('vehicles', 'map-layers');
          throttle('gps', 15_000, () => inv('sos'));
          break;
        case 'log.new':
          qc.setQueriesData({ queryKey: ['logs'] }, (old) => (Array.isArray(old) ? [data, ...old].slice(0, 60) : old));
          break;
        case 'inventory.changed':
          throttle('inv', 5_000, () => inv('warehouses', 'supplies', 'resources-summary', 'evacuation', 'kpis', 'fuel', 'map-layers'));
          break;
        case 'broadcast.updated':
          inv('broadcasts', 'audit');
          if (data.status === 'pending_approval') {
            toast({ tone: 'warn', title: `Lệnh cảnh báo ${data.code} chờ phê duyệt`, body: data.title || '' });
          }
          break;
        case 'reservoir.updated': // trực ban nhập số liệu vận hành hồ
          inv('pub-reservoirs', 'kpis', 'map-layers');
          break;
        case 'evacuation.updated': // xã / trực ban cập nhật tiến độ sơ tán, số người ở điểm sơ tán
          inv('evacuation', 'kpis', 'map-layers');
          break;
        case 'hazard.updated': // cán bộ đánh dấu / kết thúc điểm sự cố trên bản đồ
          inv('map-layers');
          break;
        case 'storm.updated': // trực ban nhập / kết thúc bản tin bão
          inv('storm');
          break;
        case 'forecast.updated': // trực ban nhập / gỡ bản tin dự báo mực nước KTTV
          inv('series');
          break;
        case 'hazard.new':
          inv('map-layers');
          toast({ tone: 'danger', title: 'Cảm biến vượt ngưỡng', body: data.name });
          break;
        case 'data.imported': // nhập dữ liệu chính thức → mọi màn hình tải lại
          qc.invalidateQueries();
          break;
        case 'submission.updated': // hồ sơ dữ liệu xã gửi (chỉ người có quyền duyệt nhận)
          inv('submissions', 'submission');
          if (data.status === 'cho_duyet') toast({ tone: 'warn', title: `Hồ sơ dữ liệu ${data.code} chờ phê duyệt` });
          break;
        case 'source.updated':
          inv('int-sources', 'int-monitor', 'forecast-areas', 'forecast-series', 'rainfall');
          break;
        case 'ingest.log':
          throttle('ingest', 5_000, () => inv('int-monitor', 'int-devices'));
          break;
        case 'report.new':
          inv('reports');
          if (data.category === 'mac_ket') {
            // Có người mắc kẹt: báo như SOS — trước đây chỉ thông báo vàng, không chuông như phản ánh "cây đổ"
            if (useStore.getState().soundOn) playAlarm(1);
            toast({ tone: 'danger', title: `Phản ánh KHẨN ${data.code}: có người mắc kẹt`, body: `${data.admin_name || ''} — duyệt và chuyển SOS ngay`, duration: 15000 });
          } else {
            toast({ tone: 'warn', title: `Phản ánh mới ${data.code}`, body: `${data.admin_name || ''} · ${data.photos} ảnh — chờ duyệt` });
          }
          break;
        case 'report.updated':
          inv('reports');
          break;
        case 'call.new':
          inv('hotline');
          break;
        default:
      }
    };

    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${window.location.host}/ws?token=${encodeURIComponent(token)}`);
      setWsStatus('connecting');
      ws.onopen = () => setWsStatus('online');
      ws.onmessage = (e) => {
        try {
          handle(JSON.parse(e.data));
        } catch {
          /* bỏ qua gói lỗi */
        }
      };
      ws.onclose = (e) => {
        setWsStatus('offline');
        if (e.code === 4401) return; // token hết hạn / quyền đã đổi — chờ đăng nhập lại
        if (!closed) retry = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, [qc, token]);
}
