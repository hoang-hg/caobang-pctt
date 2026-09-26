import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, Marker, useMap, useMapEvents } from 'react-leaflet';
import { Camera, CheckCircle2, LocateFixed, Loader2, Send, Trash2, MapPin, AlertCircle, ShieldCheck, Sparkles, ImagePlus, Search } from 'lucide-react';
import { Modal } from '../../components/common/ui';
import { BaseLayer } from '../../components/map/MapTools';
import { pinIcon } from '../../components/map/icons';
import { api } from '../../api/client';
import clsx from 'clsx';

const MAX_PHOTOS = 3;
const MAX_MB = 8;

function Picker({ value, onChange }) {
  const map = useMap();
  useMapEvents({ click: (e) => onChange({ lat: e.latlng.lat, lon: e.latlng.lng }) });
  
  useEffect(() => {
    if (value && !map.getBounds().pad(-0.2).contains([value.lat, value.lon])) {
      map.flyTo([value.lat, value.lon], Math.max(map.getZoom(), 14), { duration: 0.6 });
    }
  }, [value, map]);
  return value ? <Marker position={[value.lat, value.lon]} icon={pinIcon('!', '#dc2626')} /> : null;
}

/** Người dân gửi phản ánh hiện trường kèm ảnh — hiển thị công khai sau khi cán bộ xác minh. */
export default function ReportForm({ onClose, myLocation, onTrack }) {
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
      if (next.length >= MAX_PHOTOS) { setError(`Bạn chỉ có thể đính kèm tối đa ${MAX_PHOTOS} ảnh`); break; }
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setError('Chỉ chấp nhận định dạng ảnh JPEG, PNG, WebP'); continue; }
      if (file.size > MAX_MB * 1024 * 1024) { setError(`Kích thước mỗi ảnh tối đa ${MAX_MB} MB`); continue; }
      next.push({ file, url: URL.createObjectURL(file) });
    }
    setFiles(next);
  };

  const useGps = () => {
    setLocating(true);
    setError('');
    navigator.geolocation?.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lon: p.coords.longitude }); setLocating(false); },
      () => { setError('Không lấy được vị trí GPS — Hãy chạm lên bản đồ để đánh dấu nơi xảy ra sự việc'); setLocating(false); },
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
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : res.status === 429 ? 'Bạn gửi quá nhiều phản ánh trong thời gian ngắn, vui lòng thử lại sau' : 'Gửi không thành công, vui lòng kiểm tra lại thông tin');
      setDone(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Modal
        open
        onClose={onClose}
        title="Gửi phản ánh thành công"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            {onTrack && (
              <button
                className="btn bg-accent text-white hover:brightness-110 px-4 py-2 text-xs sm:text-sm font-semibold flex items-center gap-1.5 shadow-sm"
                onClick={() => {
                  onClose();
                  onTrack(done.code, f.reporter_phone);
                }}
              >
                <Search size={15} />
                <span>Theo dõi tiến độ phiếu này</span>
              </button>
            )}
            <button className="btn-ghost px-4 py-2 text-xs sm:text-sm" onClick={onClose}>
              Đóng
            </button>
          </div>
        }
      >
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-good/15 text-good">
            <CheckCircle2 size={40} />
          </div>
          <div className="text-xl font-bold text-ink">Đã tiếp nhận phản ánh</div>
          <div className="rounded-xl bg-panel2 p-3 text-sm flex flex-col items-center gap-1 max-w-sm w-full border border-line">
            <div>Mã phản ánh: <b className="font-mono text-base text-accent">{done.code}</b></div>
            <div className="text-xs text-muted">
              Lưu lại mã này. Tra cứu tiến độ trên Cổng công khai bằng mã phiếu và số điện thoại bạn đã nhập (nếu có).
            </div>
          </div>
          <p className="max-w-md text-sm text-ink-2 leading-relaxed">
            {done.message || 'Cảm ơn bạn. Cán bộ địa phương sẽ xác minh phản ánh; nếu nguy hiểm đến tính mạng hãy gọi ngay 112.'}
          </p>
        </div>
      </Modal>
    );
  }

  const validDesc = f.description.trim().length >= 10;
  const validPos = !!pos;
  const valid = validDesc && validPos;

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Gửi phản ánh hiện trường thiên tai"
      footer={
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between w-full gap-2">
          <span className="text-xs text-muted">
            Nguy hiểm đến tính mạng? Gọi ngay <a href="tel:112" className="font-bold text-danger">112</a>
          </span>
          <div className="flex items-center justify-end gap-2">
            <button className="btn-ghost" onClick={onClose}>Huỷ</button>
            <button
              className="btn-danger px-5"
              disabled={!valid || busy}
              onClick={submit}
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
              <span>{busy ? 'Đang gửi…' : 'Gửi phản ánh ngay'}</span>
            </button>
          </div>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        {/* Cột 1: Thông tin mô tả & Ảnh */}
        <div className="flex flex-col gap-3 text-sm">
          <div>
            <label className="block text-xs font-semibold uppercase text-muted mb-1">
              Loại sự việc <span className="text-danger">*</span>
            </label>
            <select
              className="input"
              value={f.category}
              onChange={set('category')}
            >
              {categories.map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold uppercase text-muted">
                Mô tả hiện trường <span className="text-danger">*</span>
              </label>
              <span className={clsx('text-[11px]', f.description.trim().length < 10 ? 'text-amber-500 font-medium' : 'text-good')}>
                {f.description.trim().length < 10 ? `Tối thiểu 10 ký tự (${f.description.trim().length}/10)` : '✓ Đủ độ dài'}
              </span>
            </div>
            <textarea
              className="input min-h-[95px] leading-relaxed"
              maxLength={1000}
              placeholder="VD: Nước sông Bằng đang dâng cao tràn qua đường liên thôn khoảng 40cm, đoạn gần cầu sắt có nguy cơ sạt lở lề đường, xe máy không qua được..."
              value={f.description}
              onChange={set('description')}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-muted mb-1">
              Địa chỉ / Điểm mốc nhận biết (tuỳ chọn)
            </label>
            <input
              className="input"
              maxLength={200}
              value={f.address}
              onChange={set('address')}
              placeholder="Gần trường học, ngã ba, cột mốc Km..."
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold uppercase text-muted mb-1">Họ tên của bạn</label>
              <input className="input" maxLength={100} value={f.reporter_name} onChange={set('reporter_name')} placeholder="Tuỳ chọn" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-muted mb-1">Số điện thoại</label>
              <input className="input" inputMode="tel" maxLength={20} value={f.reporter_phone} onChange={set('reporter_phone')} placeholder="Để cán bộ liên hệ" />
            </div>
          </div>

          <p className="-mt-1 flex items-center gap-1 text-[11px] text-muted">
            <ShieldCheck size={12} className="shrink-0 text-good" /> Họ tên, số điện thoại chỉ cán bộ xác minh mới xem được, không hiển thị công khai.
          </p>

          {/* Honeypot chống bot tự động */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" value={f.website} onChange={set('website')} aria-hidden="true" />

          {/* Đính kèm ảnh */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold uppercase text-muted mb-1.5">
              <span>Ảnh chụp hiện trường (Tối đa {MAX_PHOTOS})</span>
              <span className="text-[11px] normal-case text-muted">Rõ ràng, dung lượng &lt; 8MB</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {files.map((x, i) => (
                <div key={x.url} className="relative group">
                  <img src={x.url} alt={`Ảnh ${i + 1}`} className="h-20 w-20 rounded-xl object-cover border border-line shadow-sm" />
                  <button
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-danger p-1 text-white shadow hover:scale-110 transition-transform"
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    aria-label="Xoá ảnh này"
                    title="Xoá ảnh"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              {files.length < MAX_PHOTOS && (
                <label className="flex h-20 w-24 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-panel2/50 text-xs text-muted hover:border-accent hover:text-accent hover:bg-accent/5 transition-all">
                  <ImagePlus size={22} className="mb-0.5" />
                  <span className="text-[11px] font-medium">+ Thêm ảnh</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    multiple
                    className="hidden"
                    onChange={(e) => { addFiles([...e.target.files]); e.target.value = ''; }}
                  />
                </label>
              )}
            </div>
          </div>
        </div>

        {/* Cột 2: Chọn vị trí trên bản đồ */}
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-muted flex items-center gap-1.5">
              <MapPin size={14} className={pos ? 'text-good' : 'text-danger'} />
              <span>Vị trí sự việc: {pos ? <b className="text-good font-mono">{pos.lat.toFixed(4)}, {pos.lon.toFixed(4)}</b> : <span className="text-danger">Chưa chọn</span>}</span>
            </span>
            <button
              className="btn-ghost px-2.5 py-1 text-xs text-accent border-accent/30 bg-accent/5 hover:bg-accent/10"
              onClick={useGps}
              disabled={locating}
              type="button"
            >
              {locating ? <Loader2 size={13} className="animate-spin" /> : <LocateFixed size={13} />}
              <span>Lấy vị trí của tôi</span>
            </button>
          </div>

          <div className="h-72 overflow-hidden rounded-xl border border-line shadow-inner relative">
            <MapContainer center={pos ? [pos.lat, pos.lon] : [22.75, 106.05]} zoom={pos ? 14 : 8.5} zoomSnap={0.25} className="h-full w-full">
              <BaseLayer basemap="auto" />
              <Picker value={pos} onChange={setPos} />
            </MapContainer>
            {!pos && (
              <div className="absolute inset-x-0 bottom-2 z-[500] flex justify-center pointer-events-none">
                <span className="bg-black/70 text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm shadow">
                  Chạm lên bản đồ để đánh dấu nơi xảy ra sự cố
                </span>
              </div>
            )}
          </div>

          <div className="rounded-xl bg-panel2/70 p-2.5 text-xs text-muted flex items-start gap-2 border border-line/60">
            <AlertCircle size={15} className="text-accent shrink-0 mt-0.5" />
            <span>Hãy chấm đúng điểm xảy ra ngập hoặc sạt trượt trên bản đồ. Điều này giúp lực lượng cứu hộ và cán bộ địa bàn định vị chính xác nhất.</span>
          </div>

          {!valid && (
            <div className="text-xs text-amber-500 font-medium">
              Vui lòng hoàn thành: {!validDesc && '• Nhập mô tả ít nhất 10 ký tự '} {!validPos && '• Chấm vị trí sự việc trên bản đồ'}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-xl bg-danger/10 border border-danger/20 px-3 py-2 text-xs font-semibold text-danger flex items-center gap-2">
          <AlertCircle size={15} />
          <span>{error}</span>
        </div>
      )}
    </Modal>
  );
}
