import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, Marker, useMap, useMapEvents } from 'react-leaflet';
import {
  CheckCircle2, LocateFixed, Loader2, Send, Trash2, MapPin, AlertCircle, ShieldCheck, ImagePlus, Search, Waves, AlertTriangle,
  Copy, Siren, Package, Camera, ChevronLeft, PhoneCall, Minus, Plus,
} from 'lucide-react';
import { Confirm, Modal } from '../../components/common/ui';
import Turnstile from '../../components/common/Turnstile';
import { citizenApi } from '../../api/citizen';
import { useCitizen } from '../../app/citizenSession';
import CitizenAuth from './CitizenAuth';
import { BaseLayer, ProvinceMask } from '../../components/map/MapTools';
import { pinIcon } from '../../components/map/icons';
import { api } from '../../api/client';
import { useUnits, useUnitsGeo } from '../../api/hooks';
import { communeAt } from '../../utils/geo';
import clsx from 'clsx';

const MAX_PHOTOS = 3;
const MAX_MB = 8;

// Một chức năng gửi yêu cầu (README §7.2): cần cứu người / cần tiếp tế → máy chủ tạo phiếu SOS ngay, vào thẳng bảng điều hành
// cứu hộ (cán bộ gọi lại xác minh); báo tin hiện trường → phản ánh chờ cán bộ duyệt rồi mới hiện trên cổng
const KINDS = {
  cuu_nguoi: {
    category: 'mac_ket',
    short: 'Cần cứu người',
    hint: 'Mắc kẹt, bị thương, nhà sập — lực lượng gọi lại ngay',
    title: 'Yêu cầu cứu người',
    submit: 'Gửi yêu cầu cứu người',
    icon: Siren,
    cls: 'border-danger/50 hover:bg-danger/10',
    iconCls: 'text-danger',
  },
  tiep_te: {
    category: 'tiep_te',
    short: 'Cần tiếp tế',
    hint: 'Bị cô lập, hết nước uống, lương thực, thuốc',
    title: 'Yêu cầu tiếp tế',
    submit: 'Gửi yêu cầu tiếp tế',
    icon: Package,
    cls: 'border-serious/50 hover:bg-serious/10',
    iconCls: 'text-serious',
  },
  bao_tin: {
    category: null, // người dân chọn loại sự việc
    short: 'Báo tin hiện trường',
    hint: 'Sạt lở, ngập, cây đổ, đường hỏng… kèm ảnh',
    title: 'Gửi phản ánh hiện trường thiên tai',
    submit: 'Gửi phản ánh ngay',
    icon: Camera,
    cls: 'border-line hover:bg-panel2',
    iconCls: 'text-accent',
  },
};
const RESCUE_CODES = ['mac_ket', 'tiep_te']; // loại tạo phiếu SOS — không nằm trong danh sách "báo tin"
const INCIDENTS = [['ngap_lut', 'Ngập lụt'], ['sat_lo', 'Sạt lở'], ['lu_quet', 'Lũ quét'], ['sap_nha', 'Sập nhà'], ['cap_cuu', 'Cần cấp cứu']];
const VULNERABLE = [['nguoi_gia', 'Người già'], ['tre_em', 'Trẻ em'], ['thuong_nang', 'Người bị thương nặng'], ['thai_phu', 'Phụ nữ mang thai']];
const AUTH_REASON = {
  cuu_nguoi: 'Cần tài khoản người dân để gửi yêu cầu cứu người — lực lượng gọi lại số điện thoại của tài khoản để xác minh. Đăng ký trong khoảng 1 phút.',
  tiep_te: 'Cần tài khoản người dân để gửi yêu cầu tiếp tế — cán bộ gọi lại số điện thoại của tài khoản để xác nhận. Đăng ký trong khoảng 1 phút.',
  bao_tin: 'Cần tài khoản người dân để gửi phản ánh, yêu cầu cứu hộ — đăng nhập, hoặc đăng ký trong khoảng 1 phút. Cán bộ dùng số điện thoại để liên hệ xác minh.',
};
const digits = (s) => (s || '').replace(/\D/g, '');

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

/** Bước đầu của "Gửi yêu cầu": Gọi 112 trên cùng, rồi 3 việc người dân có thể cần. */
function KindChooser({ onPick, onClose }) {
  return (
    <Modal open onClose={onClose} title="Gửi yêu cầu">
      <div className="flex flex-col gap-3 text-sm">
        <a
          href="tel:112"
          className="tap flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-danger px-3 py-2.5 text-sm font-bold text-white shadow-sm hover:brightness-110"
        >
          <PhoneCall size={16} aria-hidden="true" /> Đang nguy hiểm đến tính mạng? Gọi ngay 112
        </a>
        <p className="text-muted">Hoặc chọn việc bạn cần — gửi kèm vị trí và ảnh:</p>
        <div className="grid gap-2">
          {Object.entries(KINDS).map(([k, v]) => (
            <button
              key={k}
              type="button"
              onClick={() => onPick(k)}
              className={clsx('tap flex min-h-[64px] items-center gap-3 rounded-xl border bg-panel p-3 text-left transition-colors', v.cls)}
            >
              <v.icon size={26} className={clsx('shrink-0', v.iconCls)} aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-base font-bold text-ink">{v.short}</span>
                <span className="block text-xs text-muted">{v.hint}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-muted">
          Cần cứu người, cần tiếp tế: yêu cầu tới thẳng bảng điều hành cứu hộ, cán bộ gọi lại để xác minh. Báo tin hiện trường:
          cán bộ xác minh trước khi hiện trên bản đồ của cổng.
        </p>
      </div>
    </Modal>
  );
}

/**
 * "Gửi yêu cầu" — một chức năng cho người dân: chọn Cần cứu người / Cần tiếp tế / Báo tin hiện trường (`initialKind` mở thẳng
 * một loại, VD nút "Cần cứu hộ khẩn cấp"), rồi biểu mẫu kèm ảnh, vị trí. Cứu người / tiếp tế tạo phiếu SOS ngay (bắt buộc số
 * điện thoại); báo tin hiện trường hiển thị công khai sau khi cán bộ xác minh.
 */
export default function ReportForm({ onClose, myLocation, onTrack, initialKind = '' }) {
  const [kind, setKind] = useState(KINDS[initialKind] ? initialKind : '');
  const { data: categories = [] } = useQuery({ queryKey: ['pub-cats'], queryFn: () => api('/public/report-categories'), staleTime: Infinity });
  const reportCats = categories.filter((c) => !RESCUE_CODES.includes(c.code));
  const [f, setF] = useState({ category: 'ngap', description: '', address: '', hamlet: '', reporter_name: '', reporter_phone: '', website: '' });
  // Cần cứu người: chuyện gì đang xảy ra (bắt buộc — quyết định mức ưu tiên), số người, nhóm cần ưu tiên
  const [incident, setIncident] = useState('');
  const [people, setPeople] = useState('');
  const [vulnerable, setVulnerable] = useState([]);
  const [pos, setPos] = useState(myLocation ? { lat: myLocation.lat, lon: myLocation.lon } : null);
  // Xã / phường: tự xác định theo điểm đã chấm (ranh giới xã đã tải sẵn, không gọi máy chủ); người dân đổi được
  const { data: geo } = useUnitsGeo();
  const { data: units = [] } = useUnits();
  const communes = useMemo(() => [...units].sort((a, b) => a.name.localeCompare(b.name, 'vi')), [units]);
  const [xa, setXa] = useState('');
  const [xaManual, setXaManual] = useState(false);
  useEffect(() => {
    if (pos && geo && !xaManual) setXa(communeAt(geo, pos.lat, pos.lon) || '');
  }, [pos, geo, xaManual]);
  useEffect(() => setF((x) => (x.hamlet ? { ...x, hamlet: '' } : x)), [xa]); // đổi xã → chọn lại xóm
  // Tên xóm / tổ dân phố mới của xã (nhập bằng công cụ "Xóm / tổ dân phố")
  const { data: hamlets = [] } = useQuery({
    queryKey: ['pub-hamlets', xa],
    queryFn: () => api('/public/hamlets', { params: { xa } }),
    enabled: !!xa,
    staleTime: 10 * 60_000,
  });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [locating, setLocating] = useState(false);
  const [askClose, setAskClose] = useState(false);
  // Chống bot (Cloudflare Turnstile) — chỉ khi backend bật TURNSTILE_SITE_KEY
  const { data: pubConfig } = useQuery({ queryKey: ['pub-config'], queryFn: () => api('/public/config'), staleTime: Infinity });
  const siteKey = pubConfig?.turnstile_site_key;
  // Tài khoản người dân (Đ5): đăng nhập → họ tên, số điện thoại lấy từ tài khoản, phiếu vào "Phiếu của tôi". Bắt buộc đăng
  // nhập (citizen_account_required) mà chưa đăng nhập / đang dùng mật khẩu tạm → hiện khung đăng nhập thay biểu mẫu
  const session = useCitizen((s) => s.session);
  const setSession = useCitizen((s) => s.setSession);
  const needAuth = (!!pubConfig?.citizen_account_required && !session) || !!session?.account?.must_change_password;
  const [token, setToken] = useState('');
  const [tokenRound, setTokenRound] = useState(0);
  const onTurnstileError = useCallback(
    () => setError('Không tải được bước xác minh chống spam — hãy thử lại sau ít phút. Nguy hiểm đến tính mạng: gọi ngay 112.'),
    [],
  );

  // Thu hồi URL xem trước khi đóng biểu mẫu (ảnh bị xoá thì thu hồi ngay lúc xoá). KHÔNG thu hồi mỗi lần danh sách đổi:
  // như vậy thu hồi cả ảnh vẫn đang hiển thị.
  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(() => () => filesRef.current.forEach((x) => URL.revokeObjectURL(x.url)), []);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const toggleVulnerable = (v) => setVulnerable((xs) => (xs.includes(v) ? xs.filter((x) => x !== v) : [...xs, v]));

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

  const k = KINDS[kind];
  const rescue = kind === 'cuu_nguoi' || kind === 'tiep_te';

  const submit = async () => {
    setBusy(true);
    setError('');
    const form = new FormData();
    form.append('category', k.category || f.category);
    ['description', 'address', 'hamlet', 'reporter_name', 'reporter_phone', 'website'].forEach((key) => {
      if (f[key]) form.append(key, f[key]);
    });
    if (kind === 'cuu_nguoi') {
      form.append('incident_type', incident);
      if (people !== '') form.append('trapped_count', String(people));
      vulnerable.forEach((v) => form.append('vulnerable', v));
    }
    form.append('lat', String(pos.lat));
    form.append('lon', String(pos.lon));
    files.forEach((x) => form.append('photos', x.file, x.file.name));
    if (token) form.append('turnstile_token', token);
    try {
      // Có phiên người dân thì gửi kèm token người dân; phiên hết hạn (401) → citizenApi xoá phiên → hiện khung đăng nhập
      setDone(await citizenApi('/public/reports', { method: 'POST', form }));
    } catch (e) {
      setError(e.message);
      if (siteKey) { setToken(''); setTokenRound((n) => n + 1); } // token đã dùng → lấy token mới
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    const sos = !!done.sos_code;
    return (
      <Modal
        open
        onClose={onClose}
        title={sos ? 'Đã gửi yêu cầu' : 'Gửi phản ánh thành công'}
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            {onTrack && (
              <button
                className="btn bg-accent text-white hover:brightness-110 px-4 py-2 text-xs sm:text-sm font-semibold flex items-center gap-1.5 shadow-sm"
                onClick={() => {
                  onClose();
                  onTrack(done.track_code || done.code, session ? session.account.phone : f.reporter_phone);
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
          <div className={clsx('flex h-16 w-16 items-center justify-center rounded-full', sos ? 'bg-danger/15 text-danger' : 'bg-good/15 text-good')}>
            {sos ? <Siren size={36} /> : <CheckCircle2 size={40} />}
          </div>
          <div className="text-xl font-bold text-ink">{sos ? 'Đã chuyển tới bảng điều hành cứu hộ' : 'Đã tiếp nhận phản ánh'}</div>
          <div className="rounded-xl bg-panel2 p-3 text-sm flex flex-col items-center gap-1 max-w-sm w-full border border-line">
            <div>{sos ? 'Mã yêu cầu' : 'Mã phản ánh'}: <b className="font-mono text-base text-ink">{done.code}</b></div>
            {sos && <div className="text-xs text-muted">Phiếu cứu hộ <b className="font-mono text-ink">{done.sos_code}</b> — tra mã nào cũng ra cùng tiến độ</div>}
            {done.track_code && (
              <div className="flex items-center gap-1.5">
                Mã tra cứu: <b className="font-mono text-base text-accent select-all">{done.track_code}</b>
                <button
                  type="button"
                  className="text-muted hover:text-accent"
                  title="Sao chép mã tra cứu"
                  aria-label="Sao chép mã tra cứu"
                  onClick={() => navigator.clipboard?.writeText(done.track_code)}
                >
                  <Copy size={14} />
                </button>
              </div>
            )}
            <div className="text-xs text-muted">
              {session
                ? 'Phiếu đã vào mục "Phiếu của tôi" (Tra cứu phiếu) — xem tiến độ không cần nhập mã.'
                : f.reporter_phone.trim()
                ? 'Chụp màn hình hoặc lưu lại mã tra cứu. Tra cứu tiến độ bằng mã tra cứu, hoặc mã phiếu kèm số điện thoại bạn đã nhập.'
                : 'Chụp màn hình hoặc lưu lại mã tra cứu — bạn không để lại số điện thoại nên đây là cách duy nhất để xem tiến độ. Mã này không được cấp lại.'}
            </div>
          </div>
          <p className="max-w-md text-sm text-ink-2 leading-relaxed">
            {done.message || 'Cảm ơn bạn. Cán bộ địa phương sẽ xác minh phản ánh; nếu nguy hiểm đến tính mạng hãy gọi ngay 112.'}
          </p>
          {sos && (
            <a href="tel:112" className="tap inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-danger/50 px-4 text-sm font-bold text-danger hover:bg-danger/10">
              <PhoneCall size={16} aria-hidden="true" /> Nguy hiểm tăng lên? Gọi ngay 112
            </a>
          )}
        </div>
      </Modal>
    );
  }

  if (!kind) return <KindChooser onPick={setKind} onClose={onClose} />;

  if (needAuth) {
    return (
      <Modal open onClose={onClose} title={k.title}>
        <CitizenAuth initial="login" reason={AUTH_REASON[kind]} />
      </Modal>
    );
  }

  const validDesc = f.description.trim().length >= 10;
  const validPos = !!pos;
  const validToken = !siteKey || !!token;
  const validIncident = kind !== 'cuu_nguoi' || !!incident;
  // Cứu người / tiếp tế vào thẳng bảng cứu hộ → lực lượng phải gọi lại được (đã đăng nhập: số của tài khoản)
  const validPhone = !rescue || !!session || digits(f.reporter_phone).length >= 9;
  const valid = validDesc && validPos && validToken && validIncident && validPhone;
  // Đã gõ / chọn gì đó → chạm nhầm ra ngoài, Esc, "Huỷ" phải hỏi lại: người đang gặp nạn mất cả biểu mẫu là nguy hiểm
  const movedPos = !!pos && (!myLocation || pos.lat !== myLocation.lat || pos.lon !== myLocation.lon);
  const dirty = !!(
    f.description.trim() || f.address.trim() || f.reporter_name.trim() || f.reporter_phone.trim()
    || files.length || incident || people || vulnerable.length || movedPos
  );
  const requestClose = () => (dirty ? setAskClose(true) : onClose());
  const gpsQuick = (
    <div className="flex flex-col gap-1 md:hidden">
      <button type="button" className="btn-secondary tap w-full py-2.5 text-sm font-semibold" onClick={useGps} disabled={locating}>
        {locating
          ? <Loader2 size={16} className="motion-safe:animate-spin" aria-hidden="true" />
          : <LocateFixed size={16} className="text-accent" aria-hidden="true" />}
        <span>{pos ? 'Lấy lại vị trí của tôi' : 'Lấy vị trí của tôi'}</span>
      </button>
      <p className="text-[11px] text-muted">
        {pos ? 'Đã có vị trí — kiểm tra, chỉnh lại trên bản đồ phía dưới nếu cần.' : 'Đang ở nơi cần giúp thì bấm nút trên; không thì chấm trên bản đồ phía dưới.'}
      </p>
    </div>
  );
  const chip = (on) => clsx(
    'chip tap min-h-[36px] border px-3 text-xs font-semibold',
    on ? 'border-danger bg-danger text-white' : 'border-line bg-panel2/60 text-ink hover:bg-panel2',
  );

  return (
    <>
    <Modal
      open
      wide
      onClose={requestClose}
      title={k.title}
      footer={
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between w-full gap-2">
          <span className="text-xs text-muted">
            Nguy hiểm đến tính mạng? Gọi ngay <a href="tel:112" className="font-bold text-danger">112</a>
          </span>
          <div className="flex items-center justify-end gap-2">
            <button type="button" className="btn-ghost tap" onClick={requestClose}>Huỷ</button>
            <button
              type="button"
              className="btn-danger tap px-5 max-sm:flex-1"
              disabled={!valid || busy}
              onClick={submit}
            >
              {busy ? <Loader2 size={16} className="motion-safe:animate-spin" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
              <span>{busy ? 'Đang gửi…' : k.submit}</span>
            </button>
          </div>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        {/* Cột 1: Thông tin mô tả & Ảnh */}
        <div className="flex flex-col gap-3 text-sm">
          <button type="button" className="touch-hit -mb-1 inline-flex w-fit items-center gap-1 text-xs font-semibold text-accent hover:underline" onClick={() => setKind('')}>
            <ChevronLeft size={14} aria-hidden="true" /> Đổi loại yêu cầu
          </button>

          {rescue && (
            <p className="rounded-xl border border-danger/30 bg-danger/10 p-2.5 text-xs leading-relaxed text-ink">
              Yêu cầu tới <b>thẳng bảng điều hành cứu hộ</b>. Giữ điện thoại bên mình — cán bộ gọi lại để xác minh rồi điều lực
              lượng. Đang nguy hiểm đến tính mạng: gọi ngay <a href="tel:112" className="font-bold text-danger">112</a>.
            </p>
          )}

          {kind === 'tiep_te' && gpsQuick}

          {kind === 'cuu_nguoi' && (
            <>
              <fieldset>
                <legend className="mb-1.5 text-xs font-semibold text-muted">
                  Chuyện gì đang xảy ra? <span className="text-danger">*</span>
                </legend>
                <div className="flex flex-wrap gap-1.5">
                  {INCIDENTS.map(([code, label]) => (
                    <button key={code} type="button" className={chip(incident === code)} aria-pressed={incident === code} onClick={() => setIncident(code)}>
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
              {gpsQuick}
              <div>
                <label htmlFor="so-nguoi" className="mb-1 block text-xs font-semibold text-muted">Số người cần cứu (nếu biết)</label>
                <div className="flex items-center gap-1.5">
                  <button type="button" className="btn-ghost tap-sq h-9 w-9 p-0" aria-label="Bớt 1 người" onClick={() => setPeople((n) => (n === '' || Number(n) <= 1 ? '' : String(Number(n) - 1)))}>
                    <Minus size={14} aria-hidden="true" />
                  </button>
                  <input
                    id="so-nguoi"
                    className="input tap tap-field num h-9 w-20 text-center"
                    inputMode="numeric"
                    value={people}
                    onChange={(e) => setPeople(digits(e.target.value).slice(0, 4))}
                    placeholder="—"
                  />
                  <button type="button" className="btn-ghost tap-sq h-9 w-9 p-0" aria-label="Thêm 1 người" onClick={() => setPeople((n) => String(Math.min(9999, Number(n || 0) + 1)))}>
                    <Plus size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <fieldset>
                <legend className="mb-1.5 text-xs font-semibold text-muted">Có ai cần ưu tiên?</legend>
                <div className="flex flex-wrap gap-1.5">
                  {VULNERABLE.map(([code, label]) => (
                    <button key={code} type="button" className={chip(vulnerable.includes(code))} aria-pressed={vulnerable.includes(code)} onClick={() => toggleVulnerable(code)}>
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </>
          )}

          {kind === 'bao_tin' && (
            <fieldset>
              <legend className="block text-xs font-semibold text-muted mb-1.5">
                Loại sự việc trọng tâm <span className="text-danger">*</span>
              </legend>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <button
                  type="button"
                  aria-pressed={f.category === 'ngap'}
                  onClick={() => setF((x) => ({ ...x, category: 'ngap' }))}
                  className={clsx(
                    'tap flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-colors text-left cursor-pointer',
                    f.category === 'ngap'
                      ? 'border-accent bg-accent/10 text-accent ring-2 ring-accent/20'
                      : 'border-line bg-panel2/60 text-ink hover:bg-panel2'
                  )}
                >
                  <Waves size={18} className="text-accent shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="truncate">Lũ, Ngập lụt</div>
                    <div className="text-[11px] text-muted font-normal truncate">Ngập đường, nước sông dâng</div>
                  </div>
                </button>

                <button
                  type="button"
                  aria-pressed={f.category === 'sat_lo' || f.category === 'lu_quet'}
                  onClick={() => setF((x) => ({ ...x, category: 'sat_lo' }))}
                  className={clsx(
                    'tap flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-colors text-left cursor-pointer',
                    f.category === 'sat_lo' || f.category === 'lu_quet'
                      ? 'border-warn bg-warn/10 text-warn ring-2 ring-warn/20'
                      : 'border-line bg-panel2/60 text-ink hover:bg-panel2'
                  )}
                >
                  <AlertTriangle size={18} className="text-warn shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="truncate">Sạt lở, Lũ quét</div>
                    <div className="text-[11px] text-muted font-normal truncate">Sạt đèo, vách núi, lũ ống</div>
                  </div>
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <label htmlFor="loai-khac" className="text-muted shrink-0 text-[11px]">Hoặc chọn loại khác:</label>
                <select
                  id="loai-khac"
                  className="input tap tap-field py-1 px-2 text-xs flex-1"
                  value={f.category}
                  onChange={set('category')}
                >
                  {reportCats.map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
              </div>
            </fieldset>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="mo-ta-yeu-cau" className="text-xs font-semibold text-muted">
                {kind === 'tiep_te' ? 'Cần gì, cho bao nhiêu người?' : kind === 'cuu_nguoi' ? 'Mô tả tình hình' : 'Mô tả hiện trường'}{' '}
                <span className="text-danger">*</span>
              </label>
              <span className={clsx('text-[11px]', f.description.trim().length < 10 ? 'text-warn font-medium' : 'text-good')}>
                {f.description.trim().length < 10 ? `Tối thiểu 10 ký tự (${f.description.trim().length}/10)` : '✓ Đủ độ dài'}
              </span>
            </div>
            <textarea
              id="mo-ta-yeu-cau"
              className="input tap-field min-h-[95px] leading-relaxed"
              maxLength={1000}
              placeholder={
                kind === 'tiep_te'
                  ? 'VD: Xóm bị cô lập 3 ngày, 12 hộ hết gạo và nước sạch, có 1 người cần thuốc huyết áp…'
                  : kind === 'cuu_nguoi'
                  ? 'VD: Nhà cuối xóm Nà Rì, nước đã lên tới gác, có 2 cụ già và 1 cháu nhỏ chưa ra được…'
                  : 'VD: Nước sông Bằng đang dâng cao tràn qua đường liên thôn khoảng 40cm, đoạn gần cầu sắt có nguy cơ sạt lở lề đường, xe máy không qua được...'
              }
              value={f.description}
              onChange={set('description')}
            />
          </div>

          <div>
            <label htmlFor="diem-moc" className="block text-xs font-semibold text-muted mb-1">
              Địa chỉ / Điểm mốc nhận biết (tuỳ chọn)
            </label>
            <input
              id="diem-moc"
              className="input tap tap-field"
              maxLength={200}
              value={f.address}
              onChange={set('address')}
              placeholder="Gần trường học, ngã ba, cột mốc Km..."
            />
          </div>

          {session ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel2 px-3 py-2 text-sm">
              <span>Gửi bằng tài khoản: <b>{session.account.full_name}</b> · <span className="num">{session.account.phone}</span></span>
              <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={() => setSession(null)}>
                Không phải bạn? Đăng xuất
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="ho-ten" className="block text-xs font-semibold text-muted mb-1">Họ tên của bạn</label>
                <input id="ho-ten" className="input tap tap-field" autoComplete="name" maxLength={100} value={f.reporter_name} onChange={set('reporter_name')} placeholder="Tuỳ chọn" />
              </div>
              <div>
                <label htmlFor="so-dien-thoai" className="block text-xs font-semibold text-muted mb-1">
                  Số điện thoại {rescue && <span className="text-danger">*</span>}
                </label>
                <input id="so-dien-thoai" className="input tap tap-field" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} value={f.reporter_phone} onChange={set('reporter_phone')} placeholder={rescue ? 'Để lực lượng gọi lại' : 'Để cán bộ liên hệ'} />
              </div>
            </div>
          )}

          <p className="-mt-1 flex items-center gap-1 text-[11px] text-muted">
            <ShieldCheck size={12} className="shrink-0 text-good" />
            {rescue
              ? 'Họ tên, số điện thoại chỉ cán bộ, lực lượng cứu hộ xem được. Yêu cầu không hiện trên cổng công khai tới khi cán bộ xác minh; vị trí trên cổng được làm tròn.'
              : 'Họ tên, số điện thoại chỉ cán bộ xác minh mới xem được, không hiển thị công khai. Nội dung được cán bộ xem lại trước khi công khai; vị trí trên cổng được làm tròn.'}
          </p>

          {/* Honeypot chống bot tự động */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" value={f.website} onChange={set('website')} aria-hidden="true" />
          {siteKey && <Turnstile key={tokenRound} siteKey={siteKey} onToken={setToken} onError={onTurnstileError} />}

          {/* Đính kèm ảnh */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-muted mb-1.5">
              <span>Ảnh chụp hiện trường (Tối đa {MAX_PHOTOS}{rescue ? ', không bắt buộc' : ''})</span>
              <span className="text-[11px] normal-case text-muted">Rõ ràng, dung lượng &lt; 8MB</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {files.map((x, i) => (
                <div key={x.url} className="relative group">
                  <img src={x.url} alt={`Ảnh ${i + 1}`} className="h-20 w-20 rounded-xl object-cover border border-line shadow-sm" />
                  <button
                    type="button"
                    className="touch-hit absolute -right-1.5 -top-1.5 rounded-full bg-danger p-1 text-white shadow hover:brightness-110"
                    onClick={() => { URL.revokeObjectURL(x.url); setFiles(files.filter((_, j) => j !== i)); }}
                    aria-label="Xoá ảnh này"
                    title="Xoá ảnh"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              {files.length < MAX_PHOTOS && (
                <label className="flex h-20 w-24 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-panel2/50 text-xs text-muted hover:border-accent hover:text-accent hover:bg-accent/5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25 transition-colors">
                  <ImagePlus size={22} className="mb-0.5" aria-hidden="true" />
                  <span className="text-[11px] font-medium">+ Thêm ảnh</span>
                  {/* sr-only chứ không `hidden`: ô ẩn hẳn thì không Tab tới được — người dùng bàn phím không thêm được ảnh */}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    multiple
                    className="sr-only"
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
            <span className="text-xs font-semibold text-muted flex items-center gap-1.5">
              <MapPin size={14} className={pos ? 'text-good' : 'text-danger'} />
              <span>Vị trí sự việc: {pos ? <b className="text-good font-mono">{pos.lat.toFixed(4)}, {pos.lon.toFixed(4)}</b> : <span className="text-danger">Chưa chọn</span>}</span>
            </span>
            <button
              className="btn-ghost tap px-2.5 py-1 text-xs text-accent border-accent/30 bg-accent/5 hover:bg-accent/10"
              onClick={useGps}
              disabled={locating}
              type="button"
            >
              {locating ? <Loader2 size={13} className="motion-safe:animate-spin" aria-hidden="true" /> : <LocateFixed size={13} aria-hidden="true" />}
              <span>Lấy vị trí của tôi</span>
            </button>
          </div>

          <div className="h-72 overflow-hidden rounded-xl border border-line shadow-inner relative">
            <MapContainer center={pos ? [pos.lat, pos.lon] : [22.75, 106.05]} zoom={pos ? 14 : 8.5} zoomSnap={0.25} className="h-full w-full">
              <BaseLayer basemap="street" showNav={false} />
              <ProvinceMask basemap="street" />
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
            <span>
              {rescue
                ? 'Hãy chấm đúng nơi người đang cần giúp — lực lượng đi theo điểm này. Đang ở đó thì bấm "Lấy vị trí của tôi".'
                : 'Hãy chấm đúng điểm xảy ra ngập hoặc sạt trượt trên bản đồ. Điều này giúp lực lượng cứu hộ và cán bộ địa bàn định vị chính xác nhất.'}
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label htmlFor="xa-phuong" className="block text-xs font-semibold text-muted mb-1">Xã / phường</label>
              <select
                id="xa-phuong"
                className="input tap tap-field"
                value={xa}
                onChange={(e) => { setXa(e.target.value); setXaManual(true); }}
              >
                <option value="">— Chọn xã / phường —</option>
                {communes.map((u) => (
                  <option key={u.code} value={u.code}>{u.unit_type === 'phuong' ? 'Phường' : 'Xã'} {u.name}</option>
                ))}
              </select>
              {xa && !xaManual && <div className="mt-1 text-[11px] text-muted">Tự xác định theo điểm đã chấm — sai thì chọn lại</div>}
            </div>
            <div>
              <label htmlFor="xom" className="block text-xs font-semibold text-muted mb-1">Xóm / tổ dân phố (tuỳ chọn)</label>
              <select id="xom" className="input tap tap-field" value={f.hamlet} onChange={set('hamlet')} disabled={!xa || !hamlets.length}>
                <option value="">
                  {!xa ? '— Chọn xã / phường trước —' : hamlets.length ? '— Không rõ / không có trong danh sách —' : 'Xã chưa có danh sách xóm'}
                </option>
                {hamlets.map((h) => (
                  <option key={h.code} value={h.code}>{h.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-xs text-warn font-medium" aria-live="polite">
            {!valid && (
              <>
                Vui lòng hoàn thành: {!validIncident && '• Chọn chuyện gì đang xảy ra '} {!validDesc && '• Nhập mô tả ít nhất 10 ký tự '}{' '}
                {!validPos && '• Chấm vị trí sự việc trên bản đồ '} {!validPhone && '• Nhập số điện thoại để lực lượng gọi lại '}{' '}
                {!validToken && '• Hoàn tất bước xác minh chống spam'}
              </>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-3 rounded-xl bg-danger/10 border border-danger/20 px-3 py-2 text-xs font-semibold text-danger flex items-center gap-2">
          <AlertCircle size={15} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </Modal>
    {askClose && (
      <Confirm
        title="Bỏ yêu cầu đang soạn?"
        confirmLabel="Bỏ yêu cầu"
        cancelLabel="Tiếp tục soạn"
        danger
        onConfirm={onClose}
        onClose={() => setAskClose(false)}
      >
        Nội dung, ảnh và vị trí bạn đã nhập sẽ mất, yêu cầu chưa được gửi đi. Nguy hiểm đến tính mạng: gọi ngay 112.
      </Confirm>
    )}
    </>
  );
}
