import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStore } from '../app/store';
import { playAlarm } from '../utils/audio';
import { INCIDENT } from '../utils/labels';

/** Kết nối WebSocket /ws: nhận sự kiện realtime và làm mới dữ liệu tương ứng (không cần F5). */
export function useSocket() {
  const qc = useQueryClient();

  useEffect(() => {
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
          throttle('inv', 5_000, () => inv('warehouses', 'supplies', 'resources-summary', 'evacuation', 'kpis'));
          break;
        case 'broadcast.updated':
          inv('broadcasts', 'audit');
          if (data.status === 'pending_approval') {
            toast({ tone: 'warn', title: `Lệnh cảnh báo ${data.code} chờ phê duyệt`, body: data.title || '' });
          }
          break;
        case 'hazard.new':
          inv('map-layers');
          toast({ tone: 'danger', title: 'Cảm biến vượt ngưỡng', body: data.name });
          break;
        case 'call.new':
          inv('hotline');
          break;
        default:
      }
    };

    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${window.location.host}/ws`);
      setWsStatus('connecting');
      ws.onopen = () => setWsStatus('online');
      ws.onmessage = (e) => {
        try {
          handle(JSON.parse(e.data));
        } catch {
          /* bỏ qua gói lỗi */
        }
      };
      ws.onclose = () => {
        setWsStatus('offline');
        if (!closed) retry = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, [qc]);
}
