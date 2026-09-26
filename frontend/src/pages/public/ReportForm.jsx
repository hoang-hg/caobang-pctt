import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, Marker, useMap, useMapEvents } from 'react-leaflet';
import { Camera, CheckCircle2, LocateFixed, Loader2, Send, Trash2 } from 'lucide-react';
import { Modal } from '../../components/common/ui';
import { BaseLayer } from '../../components/map/MapTools';
import { pinIcon } from '../../components/map/icons';
import { api } from '../../api/client';

const MAX_PHOTOS = 3;
const MAX_MB = 8;

function Picker({ value, onChange }) {
  const map = useMap();
  useMapEvents({ click: (e) => onChange({ lat: e.latlng.lat, lon: e.latlng.lng }) });
  // Vị trí đổi (VD bấm “Vị trí của tôi”) → đưa bản đồ tới đó để người dân thấy đúng chỗ đã chọn
  useEffect(() => {
    if (value && !map.getBounds().pad(-0.2).contains([value.lat, value.lon])) {
      map.flyTo([value.lat, value.lon], Math.max(map.getZoom(), 14), { duration: 0.6 });
    }
  }, [value, map]);
  return value ? <Marker position={[value.lat, value.lon]} icon={pinIcon('!', '#dc2626')} /> : null;
}

/** Người dân gửi phản ánh hiện trường kèm ảnh — hiển thị công khai sau khi cán bộ xác minh. */
export default function ReportForm({ onClose, myLocation }) {
  const { data: categories = [] } = useQuery({ queryKey: ['pub-cats'], queryFn: () => api('/public/report-categories'), staleTime: Infinity });
  const [f, setF] = useState({ category: 'ngap', description: '', address: '', reporter_name: '', reporter_phone: '', website: '' });
  const [pos, setPos] = useState(myLocation ? { lat: myLocation.lat, lon: myLocation.lon } : null);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => () => files.forEach((x) => URL.revokeObjectURL(x.url)), [files]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const addFiles = (list) => {
    setError('');
    const next = [...files];
    for (const file of list) {
      if (next.length >= MAX_PHOTOS) { setError(`Tối đa ${MAX_PHOTOS} ảnh`); break; }
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setError('Chỉ nhận ảnh JPEG, PNG, WebP'); continue; }
      if (file.size > MAX_MB * 1024 * 1024) { setError(`Ảnh tối đa ${MAX_MB} MB`); continue; }
      next.push({ file, url: URL.createObjectURL(file) });
    }
    setFiles(next);
  };

  const useGps = () => {
    setLocating(true);
    navigator.geolocation?.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lon: p.coords.longitude }); setLocating(false); },
      () => { setError('Không lấy được vị trí — hãy chạm lên bản đồ để chọn'); setLocating(false); },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    const form = new FormData();
    Object.entries(f).forEach(([k, v]) => { if (v) form.append(k, v); });
    form.append('lat', String(pos.lat));
    form.append('lon', String(pos.lon));
    files.forEach((x) => form.append('photos', x.file, x.file.name));
    try {
      const res = await fetch('/api/v1/public/reports', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : res.status === 429 ? 'Bạn gửi quá nhiều phản ánh, vui lòng thử lại sau' : 'Gửi không thành công, kiểm tra lại thông tin');
      setDone(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Modal open onClose={onClose} title="Đã gửi phản ánh" footer={<button className="btn-primary" onClick={onClose}>Đóng</button>}>
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <CheckCircle2 size={40} className="text-good" />
          <div className="text-lg font-semibold">Mã phản ánh: {done.code}</div>
          <p className="text-sm text-ink-2">{done.message}</p>
        </div>
      </Modal>
    );
  }

  const valid = f.description.trim().length >= 10 && pos;
  return (
    <Modal open wide onClose={onClose} title="Gửi phản ánh hiện trường"
      footer={<>
        <span className="mr-auto self-center text-xs text-muted">Nguy hiểm đến tính mạng? Gọi ngay <a href="tel:112" className="font-bold text-danger">112</a></span>
        <button className="btn-ghost" onClick={onClose}>Huỷ</button>
        <button className="btn-danger" disabled={!valid || busy} onClick={submit}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Gửi</button>
      </>}>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2 text-sm">
          <label>Loại sự việc
            <select className="input mt-1" value={f.category} onChange={set('category')}>
              {categories.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </label>
          <label>Mô tả (ít nhất 10 ký tự)
            <textarea className="input mt-1 min-h-[90px]" maxLength={1000} placeholder="VD: Nước ngập sâu khoảng 50 cm trên đường liên thôn, xe máy không qua được" value={f.description} onChange={set('description')} />
          </label>
          <label>Địa chỉ / mô tả vị trí (tuỳ chọn)<input className="input mt-1" maxLength={200} value={f.address} onChange={set('address')} placeholder="Thôn, tổ dân phố, gần cầu…" /></label>
          <div className="grid grid-cols-2 gap-2">
            <label>Họ tên (tuỳ chọn)<input className="input mt-1" maxLength={100} value={f.reporter_name} onChange={set('reporter_name')} /></label>
            <label>SĐT để cán bộ liên hệ<input className="input mt-1" inputMode="tel" maxLength={20} value={f.reporter_phone} onChange={set('reporter_phone')} /></label>
          </div>
          <p className="text-[11px] text-muted">Họ tên, số điện thoại chỉ cán bộ xác minh mới xem được, không hiển thị công khai.</p>
          {/* honeypot: ẩn với người dùng, bot tự điền sẽ bị từ chối */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" value={f.website} onChange={set('website')} aria-hidden="true" />
          <div>
            <div className="mb-1">Ảnh hiện trường (tối đa {MAX_PHOTOS})</div>
            <div className="flex flex-wrap gap-2">
              {files.map((x, i) => (
                <div key={x.url} className="relative">
                  <img src={x.url} alt={`Ảnh ${i + 1}`} className="h-20 w-20 rounded-lg object-cover" />
                  <button className="absolute -right-1 -top-1 rounded-full bg-danger p-1 text-white" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="Xoá ảnh"><Trash2 size={11} /></button>
                </div>
              ))}
              {files.length < MAX_PHOTOS && (
                <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-line text-xs text-muted hover:border-accent">
                  <Camera size={20} /> Thêm ảnh
                  <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple className="hidden" onChange={(e) => { addFiles([...e.target.files]); e.target.value = ''; }} />
                </label>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between">
            <span>Vị trí sự việc {pos ? <span className="text-xs text-good">✓ đã chọn</span> : <span className="text-xs text-danger">chưa chọn</span>}</span>
            <button className="btn-ghost px-2 py-1 text-xs" onClick={useGps} disabled={locating}>{locating ? <Loader2 size={12} className="animate-spin" /> : <LocateFixed size={12} />} Vị trí của tôi</button>
          </div>
          <div className="h-72 overflow-hidden rounded-lg border border-line">
            <MapContainer center={pos ? [pos.lat, pos.lon] : [22.75, 106.05]} zoom={pos ? 14 : 8.5} zoomSnap={0.25} className="h-full w-full">
              <BaseLayer basemap="auto" />
              <Picker value={pos} onChange={setPos} />
            </MapContainer>
          </div>
          <p className="text-[11px] text-muted">Chạm lên bản đồ để chọn đúng nơi xảy ra sự việc.</p>
        </div>
      </div>
      {error && <div className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
    </Modal>
  );
}
