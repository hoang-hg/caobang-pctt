import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStore } from '../app/store';
import { hasPermission } from '../rbac/permissions';
import { playAlarm } from '../utils/audio';
import { time } from '../utils/format';
import { INCIDENT } from '../utils/labels';
import { api } from './client';

const HEARTBEAT_MS = 25_000; // gửi "ping"; máy chủ trả "pong" kèm giờ máy chủ (app/main.py)
const DEAD_MS = 60_000; // không nhận được gì ngần này → kết nối đã chết (mạng rớt im lặng) → nối lại
const CATCH_UP_MARGIN_MS = 60_000; // tìm lại lùi thêm 1 phút trước tin cuối cùng nhận được (tin đã báo thì bỏ qua)

/** Người duyệt được lệnh cảnh báo: quyền phê duyệt + đã cấp PIN ký (trực ban cấp tỉnh chưa cấp PIN không duyệt được). */
const approver = (u) => hasPermission(u?.permissions, 'alert', 'approve') && !!u?.has_pin;

const sosToast = (t) => ({
  tone: t.priority === 1 ? 'danger' : 'warn',
  title: `SOS mới ${t.code}`,
  body: `${INCIDENT[t.incident_type]} – ${t.address || t.admin_name || ''} (${t.trapped_count} người)`,
});

/** Kết nối WebSocket /ws: nhận sự kiện realtime và làm mới dữ liệu tương ứng (không cần F5). */
export function useSocket() {
  const qc = useQueryClient();
  // Chỉ nối lại khi đăng nhập / đăng xuất — token gia hạn định kỳ (App.jsx) không làm đứt kết nối
  const loggedIn = useStore((s) => !!s.auth?.token);

  useEffect(() => {
    if (!loggedIn) return undefined;
    let ws;
    let retry;
    let beat;
    let closed = false;
    let online = false;
    let outage = false; // đã mất kết nối (hoặc chưa nối được) — lần nối được tới thì tìm lại tin bị lỡ
    let lastMsgAt = Date.now();
    let lastServerTs = null; // giờ máy chủ của tin cuối cùng nhận được — mốc tìm lại, không lệ thuộc đồng hồ máy này
    const mountedAt = Date.now();
    const notified = new Set(); // SOS / phản ánh / yêu cầu chi viện đã báo — tìm lại không báo trùng
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
          notified.add(data.code);
          if (useStore.getState().soundOn && data.priority <= 2) playAlarm(data.priority);
          toast(sosToast(data));
          break;
        case 'field.report': // trưởng nhóm báo từ link nhiệm vụ (/nhiem-vu)
          inv('sos', 'kpis', 'map-layers');
          if (data.kind === 'need_support') {
            notified.add(`chi-vien:${data.code}`);
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
        case 'broadcast.updated': {
          inv('broadcasts', 'audit');
          const me = useStore.getState().auth?.user;
          if (data.status === 'pending_approval' && approver(me) && data.created_by !== me?.id) {
            // Chỉ người duyệt được (trước đây cả cán bộ xã cũng nhận); số đếm trên menu giữ tới khi duyệt xong
            notified.add(`duyet:${data.code}`);
            toast({ tone: 'warn', title: `Lệnh cảnh báo ${data.code} chờ bạn phê duyệt`, body: data.title || '', duration: 15000 });
          } else if (data.status === 'rejected' && data.created_by && data.created_by === me?.id) {
            toast({
              tone: 'danger',
              title: `Lệnh cảnh báo ${data.code} bị từ chối`,
              body: `${data.rejected_by ? `${data.rejected_by}: ` : ''}${data.reason || ''} — sửa bằng “Soạn lại” ở trang Cảnh báo`,
              duration: 20000,
            });
          }
          break;
        }
        case 'broadcast.expiring': // tiến trình nền nhắc trước khi cảnh báo thôi hiện cho người dân
          inv('broadcasts');
          if (approver(useStore.getState().auth?.user)) {
            toast({
              tone: 'warn',
              title: `Cảnh báo ${data.code} hết hiệu lực lúc ${time(data.valid_until)}`,
              body: `${data.title || ''} — còn nguy hiểm thì gia hạn ở trang Cảnh báo`,
              duration: 20000,
            });
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
          notified.add(data.code);
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

    // Trong lúc mất kết nối (mạng chập chờn, máy ngủ, đổi wifi / 4G…) sự kiện không tới: SOS mới không có thông báo /
    // chuông. Nối lại được → mọi màn hình tải lại; SOS còn chờ xử lý, phản ánh chờ duyệt, yêu cầu chi viện đến trong lúc
    // đó được báo như lúc nhận trực tiếp.
    const catchUp = async (since) => {
      qc.invalidateQueries();
      const perms = useStore.getState().auth?.user?.permissions;
      const after = (iso) => !!iso && Date.parse(iso) > since;
      const ring = (priority) => { if (useStore.getState().soundOn) playAlarm(priority); };
      if (hasPermission(perms, 'sos', 'view')) {
        const tickets = await api('/sos').catch(() => []);
        const missed = tickets.filter((t) => t.status === 'moi' && after(t.received_at) && !notified.has(t.code));
        missed.forEach((t) => notified.add(t.code));
        if (missed.length === 1) {
          if (missed[0].priority <= 2) ring(missed[0].priority);
          toast({ ...sosToast(missed[0]), title: `SOS mới ${missed[0].code} (đến lúc mất kết nối)`, duration: 15000 });
        } else if (missed.length > 1) {
          const top = Math.min(...missed.map((t) => t.priority));
          if (top <= 2) ring(top);
          toast({
            tone: top === 1 ? 'danger' : 'warn',
            title: `${missed.length} SOS mới đến lúc mất kết nối`,
            body: missed.map((t) => `${t.code} (Cấp ${t.priority})`).join(', '),
            duration: 15000,
          });
        }
        const support = tickets.filter(
          (t) => t.status === 'thuc_thi' && t.field_kind === 'need_support' && after(t.field_at) && !notified.has(`chi-vien:${t.code}`)
        );
        support.forEach((t) => notified.add(`chi-vien:${t.code}`));
        if (support.length) {
          ring(1);
          toast({ tone: 'danger', title: `Đội cần chi viện: ${support.map((t) => t.code).join(', ')}`, body: 'Báo trong lúc mất kết nối', duration: 15000 });
        }
      }
      if (approver(useStore.getState().auth?.user)) {
        const pend = await api('/alerts/broadcasts', { params: { status: 'pending_approval', limit: 20 } }).catch(() => []);
        const missed = pend.filter((b) => b.can_approve && after(b.created_at) && !notified.has(`duyet:${b.code}`));
        missed.forEach((b) => notified.add(`duyet:${b.code}`));
        if (missed.length) {
          toast({
            tone: 'warn',
            title: `${missed.length} lệnh cảnh báo chờ bạn phê duyệt`,
            body: `${missed.map((b) => b.code).join(', ')} — đến lúc mất kết nối`,
            duration: 15000,
          });
        }
      }
      if (hasPermission(perms, 'report', 'view')) {
        const { items = [] } = await api('/reports', { params: { status: 'cho_duyet', limit: 100 } }).catch(() => ({}));
        const missed = items.filter((r) => after(r.created_at) && !notified.has(r.code));
        missed.forEach((r) => notified.add(r.code));
        const urgent = missed.filter((r) => r.category === 'mac_ket');
        if (urgent.length) {
          ring(1);
          toast({
            tone: 'danger',
            title: `Phản ánh KHẨN có người mắc kẹt: ${urgent.map((r) => r.code).join(', ')}`,
            body: 'Đến lúc mất kết nối — duyệt và chuyển SOS ngay',
            duration: 15000,
          });
        }
        if (missed.length > urgent.length) {
          toast({ tone: 'warn', title: `${missed.length - urgent.length} phản ánh mới chờ duyệt`, body: 'Đến lúc mất kết nối' });
        }
      }
    };

    const lost = () => {
      if (online) outage = true;
      online = false;
      clearInterval(beat);
      setWsStatus('offline');
    };

    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const token = useStore.getState().auth?.token; // token mới nhất (đã gia hạn)
      ws = new WebSocket(`${proto}://${window.location.host}/ws?token=${encodeURIComponent(token || '')}`);
      setWsStatus('connecting');
      ws.onopen = () => {
        online = true;
        lastMsgAt = Date.now();
        setWsStatus('online');
        // Lần đầu nối mất hơn vài giây (mạng yếu lúc mở trang) cũng tìm lại
        if (outage || Date.now() - mountedAt > 5000) {
          const base = lastServerTs ? Date.parse(lastServerTs) : mountedAt;
          catchUp(base - CATCH_UP_MARGIN_MS);
        }
        outage = false;
        beat = setInterval(() => {
          if (Date.now() - lastMsgAt > DEAD_MS) {
            // Kết nối chết mà trình duyệt chưa biết: bỏ kết nối cũ, nối lại ngay
            const dead = ws;
            dead.onclose = null;
            dead.onmessage = null;
            dead.close();
            lost();
            if (!closed) connect();
          } else if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, HEARTBEAT_MS);
      };
      ws.onmessage = (e) => {
        lastMsgAt = Date.now();
        try {
          const msg = JSON.parse(e.data);
          if (msg.ts) lastServerTs = msg.ts;
          if (msg.event !== 'pong') handle(msg);
        } catch {
          /* bỏ qua gói lỗi */
        }
      };
      ws.onclose = (e) => {
        lost();
        if (e.code === 4401) return; // token hết hạn / quyền đã đổi — chờ đăng nhập lại
        if (!closed) retry = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      clearInterval(beat);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [qc, loggedIn]);
}
