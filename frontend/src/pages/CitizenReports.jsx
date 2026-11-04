import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Camera, Check, X, Siren, MapPin, Phone, RotateCcw, CheckCheck, Inbox, Search, ZoomIn, Pencil, Loader2 } from 'lucide-react';
import { api } from '../api/client';
import { useAreaQuery } from '../api/hooks';
import { useStore } from '../app/store';
import { EmptyState, ErrorState, Modal, Segmented, Skeleton, Tabs } from '../components/common/ui';
import IncidentModal from '../components/map/IncidentModal';
import PageHeader from '../components/common/PageHeader';
import RoleTips from '../components/common/RoleTips';
import { PAGE } from '../components/layout/page';
import { usePermission, useScopeLabel } from '../rbac/usePermission';
import { ago, dateTime } from '../utils/format';
import { useNewKeys } from '../utils/useNewKeys';
import { INCIDENT, VULNERABLE } from '../utils/labels';
import { useMediaQuery } from '../utils/useMediaQuery';

const STATUS = {
  cho_duyet: { label: 'Chờ duyệt', cls: 'bg-warn text-black' },
  da_duyet: { label: 'Đã duyệt (công khai)', cls: 'bg-good text-black font-semibold' },
  da_xu_ly: { label: 'Đã xử lý', cls: 'bg-accent text-white' },
  tu_choi: { label: 'Từ chối', cls: 'bg-panel2 text-muted' },
};
// Nhãn ngắn cho thẻ trạng thái của cột danh sách hẹp (máy tính, bản vẽ khung F)
const SHORT = { cho_duyet: 'Chờ duyệt', da_duyet: 'Đã duyệt', da_xu_ly: 'Đã xử lý', tu_choi: 'Từ chối' };

function ActionModal({ report, action, onClose }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const [note, setNote] = useState(report.public_note || '');
  const [reason, setReason] = useState('');
  const [incident, setIncident] = useState(report.category === 'sat_lo' ? 'sat_lo' : report.category === 'lu_quet' ? 'lu_quet' : 'ngap_lut');
  const [priority, setPriority] = useState(report.category === 'mac_ket' ? 1 : 2);
  const [trapped, setTrapped] = useState(''); // trống = máy chủ bóc tách từ nội dung người dân gửi
  const [parsed, setParsed] = useState(null);
  // Chuyển SOS: điền sẵn số người / mức ưu tiên / loại sự cố từ nội dung người dân viết ("3 người già mắc kẹt") —
  // trước đây mặc định 0 người → phiếu "0 người", gợi ý lực lượng theo 0 người
  useEffect(() => {
    if (action !== 'sos' || !report.description) return undefined;
    let alive = true;
    api('/sos/parse', { method: 'POST', body: { text: report.description } })
      .then((p) => {
        if (!alive) return;
        setParsed(p);
        if (p.trapped_count != null) setTrapped(String(p.trapped_count));
        if (report.category !== 'mac_ket' && p.priority) setPriority(p.priority);
        if (!['sat_lo', 'lu_quet', 'ngap'].includes(report.category) && p.incident_type) setIncident(p.incident_type);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [action, report.description, report.category]);
  const [busy, setBusy] = useState(false); // bấm đúp “Chuyển thành SOS” → 2 phiếu
  // Phần công khai: nội dung gợi ý đã che SĐT / email / số giấy tờ; vị trí mặc định làm tròn; ảnh mặc định công khai
  const publishing = action === 'approve' || action === 'resolve' || action === 'edit_public';
  const [pubDesc, setPubDesc] = useState(report.public_description || report.public_description_suggested || '');
  const [exact, setExact] = useState(!!report.exact_location);
  const [pubPhotos, setPubPhotos] = useState(report.public_photos ?? true);
  const title = {
    approve: 'Duyệt & công khai phản ánh',
    reject: 'Từ chối phản ánh',
    resolve: 'Đánh dấu đã xử lý',
    edit_public: 'Sửa phần công khai',
    sos: 'Chuyển thành phiếu SOS',
  }[action];

  const submit = async () => {
    setBusy(true);
    try {
      if (action === 'sos') {
        const r = await api(`/reports/${report.id}/to-sos`, {
          method: 'POST',
          body: { incident_type: incident, priority, trapped_count: trapped === '' ? null : Number(trapped) },
        });
        toast({ tone: 'good', title: `Đã tạo phiếu ${r.sos_code}`, body: 'Theo dõi tại Điều hành cứu hộ' });
        if (r.possible_duplicates?.length) {
          toast({ tone: 'warn', title: `${r.sos_code} có thể trùng với ${r.possible_duplicates.join(', ')}`, body: 'Kiểm tra trước khi điều động — tránh điều 2 đội tới cùng một nơi.', duration: 12000 });
        }
      } else {
        const pub = publishing ? { public_description: pubDesc.trim(), exact_location: exact, public_photos: pubPhotos } : {};
        await api(`/reports/${report.id}/moderate`, { method: 'POST', body: { action, public_note: note || null, reject_reason: reason || null, ...pub } });
        toast({ tone: 'good', title: `${title}: ${report.code}` });
      }
      qc.invalidateQueries({ queryKey: ['reports'] });
      onClose();
    } catch (e) {
      toast({ tone: 'danger', title: 'Không thực hiện được', body: e.message });
    } finally {
      setBusy(false);
    }
  };

  // Bản vẽ khung F2, F3: tiêu đề nói rõ việc, dòng tóm tắt phiếu, nút chính đúng tên việc
  const heading = {
    reject: { title: `Từ chối phản ánh ${report.code}?`, subtitle: 'Thao tác ghi vào nhật ký', confirm: 'Từ chối phản ánh' },
    sos: { title: 'Chuyển phản ánh thành phiếu SOS', subtitle: 'Phiếu mới vào cột “Mới báo” ở Cứu hộ', confirm: 'Tạo phiếu SOS' },
  }[action] || { title: `${title} – ${report.code}`, confirm: 'Xác nhận' };
  const brief = action === 'reject' || action === 'sos';
  return (
    <Modal
      open
      size={brief ? 'md' : undefined}
      onClose={onClose}
      title={heading.title}
      subtitle={heading.subtitle}
      footer={
        <>
          <button type="button" className={brief ? 'btn-secondary' : 'btn-ghost'} onClick={onClose}>Huỷ</button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || (action === 'reject' && reason.trim().length < 3) || (publishing && pubDesc.trim().length < 10)}
            onClick={submit}
          >
            {heading.confirm}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {brief && (
          <p className="rounded-[14px] bg-panel2 p-3">
            <b>{report.code} · {report.category_label}</b> · {[report.hamlet_name, report.admin_name].filter(Boolean).join(', ')} · {report.photo_urls.length ? `${report.photo_urls.length} ảnh` : 'chưa có ảnh'}
          </p>
        )}
        <div>
          {publishing && <span className="font-semibold text-xs text-muted">Nội dung người dân gửi (chỉ cán bộ xem)</span>}
          <p className={clsx('rounded-xl bg-panel2 p-3 italic text-ink border border-line/60', publishing && 'mt-1')}>
            “{report.description}”
          </p>
        </div>

        {publishing && (
          <>
            <label className="space-y-1">
              <span className="font-semibold text-xs text-muted">Nội dung công khai (người dân sẽ thấy trên cổng)</span>
              <textarea
                className="input mt-1 min-h-[80px] leading-relaxed"
                maxLength={1000}
                value={pubDesc}
                onChange={(e) => setPubDesc(e.target.value)}
              />
              <span className="block text-[11px] text-muted">
                Hệ thống đã tự che SĐT, email, số giấy tờ. Hãy bỏ tiếp <b>tên người, số nhà</b> và thông tin cá nhân khác.
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" className="mt-0.5" checked={exact} onChange={(e) => setExact(e.target.checked)} />
              <span>
                <b>Công khai vị trí chính xác</b> — chỉ chọn khi là điểm công cộng (đường, cầu, taluy, bờ sông). Không chọn:
                vị trí trên cổng được làm tròn, lệch tối đa khoảng 150 m (điểm chấm có thể là nhà người báo).
              </span>
            </label>
            {report.photo_urls.length > 0 && (
              <label className="flex items-start gap-2 text-xs">
                <input type="checkbox" className="mt-0.5" checked={pubPhotos} onChange={(e) => setPubPhotos(e.target.checked)} />
                <span>
                  <b>Công khai ảnh</b> — bỏ chọn nếu ảnh có mặt người, biển số xe, số nhà.
                </span>
              </label>
            )}
          </>
        )}

        {(action === 'approve' || action === 'resolve') && (
          <label className="space-y-1">
            <span className="font-semibold text-xs text-muted">Ghi chú công khai (người dân sẽ thấy trên cổng)</span>
            <input
              className="input mt-1"
              maxLength={500}
              placeholder="VD: Đã cử lực lượng dân quân kiểm tra và cắm biển cảnh báo"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        )}

        {action === 'approve' && (
          <p className="text-xs text-muted">Thông tin người gửi (họ tên, SĐT) KHÔNG được công khai.</p>
        )}

        {action === 'reject' && (
          <>
            <label className="space-y-1">
              <span className="font-semibold text-[13px] text-ink-2">Lý do từ chối (lưu hồ sơ nội bộ) *</span>
              <textarea
                className="input mt-1 min-h-[80px]"
                autoFocus
                maxLength={500}
                placeholder="VD: Ảnh không liên quan, trùng phản ánh PA-…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <p className="rounded-[14px] border border-dashed border-line p-3 text-[13px] leading-normal text-ink-2">
              Phản ánh bị từ chối không hiện trên cổng công khai. Lý do chỉ cán bộ thấy.
            </p>
          </>
        )}

        {action === 'sos' && (
          <>
            <div role="radiogroup" aria-label="Loại sự cố">
              <div className="mb-1 font-semibold text-[13px] text-ink-2">Loại sự cố</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(INCIDENT).map(([k, v]) => (
                  <button key={k} type="button" role="radio" aria-checked={incident === k} onClick={() => setIncident(k)} className={clsx('tap h-10 rounded-xl border px-3.5 text-sm font-medium', incident === k ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-panel text-ink-2 hover:border-accent')}>{v}</button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 font-semibold text-[13px] text-ink-2">Mức ưu tiên</div>
                <Segmented label="Mức ưu tiên" value={priority} onChange={setPriority} options={[{ value: 1, label: 'Cấp 1 · Đỏ' }, { value: 2, label: 'Cấp 2 · Cam' }, { value: 3, label: 'Cấp 3 · Vàng' }]} />
              </div>
              <label>
                <span className="font-semibold text-[13px] text-ink-2">Số người cần cứu</span>
                <input className="input mt-1" type="number" min={0} value={trapped} placeholder="Để trống: máy đọc từ nội dung" onChange={(e) => setTrapped(e.target.value)} />
              </label>
            </div>
          </>
        )}
        {action === 'sos' && parsed && (parsed.trapped_count != null || parsed.vulnerable?.length > 0) && (
          <p className="text-xs text-muted">
            Bóc tách từ nội dung người dân gửi:{parsed.trapped_count != null && <> <b>{parsed.trapped_count} người</b></>}
            {parsed.vulnerable?.length > 0 && <> · {parsed.vulnerable.map((v) => VULNERABLE[v] || v).join(', ')}</>} — kiểm tra lại
            trước khi tạo phiếu. Nội dung người dân gửi trở thành tin gốc của phiếu (đội hiện trường xem được).
          </p>
        )}

        {action === 'sos' && report.status === 'cho_duyet' && (
          <p className="rounded-[14px] border border-dashed border-line p-3 text-[13px] leading-normal text-ink-2">
            Cổng công khai chỉ hiện loại phản ánh, vị trí làm tròn (~150 m) và &quot;đã chuyển thành yêu cầu cứu hộ&quot; —
            không công khai nội dung, ảnh người dân gửi. Đọc lại rồi dùng <b>Sửa phần công khai</b> nếu muốn công khai thêm.
          </p>
        )}
      </div>
    </Modal>
  );
}

/**
 * Ô chi tiết của phản ánh CHỜ DUYỆT trên máy tính (bản vẽ desktop khung F, F4): bên trái ảnh lớn, nội dung gốc (chỉ cán bộ
 * thấy), người gửi; bên phải "Phần công khai" soạn ngay tại chỗ — nội dung (gợi ý sẵn, đã che SĐT / email / giấy tờ), vị trí
 * công khai Làm tròn / Chính xác, công khai ảnh, ghi chú công khai; chân ô: Từ chối… · Chuyển thành phiếu SOS · Duyệt và công
 * khai (gửi luôn, không qua hộp thoại). Cùng API /reports/{id}/moderate với hộp thoại cũ.
 */
function ModerateDetail({ r, onAction, onPhoto }) {
  const canIncident = usePermission('incident', 'update', r.admin_code);
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const navigate = useNavigate();
  const setFocus = useStore((s) => s.setFocus);
  const urgent = r.category === 'mac_ket';
  const [pubDesc, setPubDesc] = useState(r.public_description || r.public_description_suggested || '');
  const [exact, setExact] = useState(!!r.exact_location);
  const [pubPhotos, setPubPhotos] = useState(r.public_photos ?? true);
  const [note, setNote] = useState(r.public_note || '');
  const [busy, setBusy] = useState(false);
  const short = pubDesc.trim().length < 10;
  const approve = async () => {
    setBusy(true);
    try {
      await api(`/reports/${r.id}/moderate`, {
        method: 'POST',
        body: { action: 'approve', public_note: note.trim() || null, reject_reason: null, public_description: pubDesc.trim(), exact_location: exact, public_photos: pubPhotos },
      });
      toast({ tone: 'good', title: `Đã duyệt & công khai ${r.code}`, body: 'Người dân thấy trên bản đồ cổng công khai' });
      qc.invalidateQueries({ queryKey: ['reports'] });
    } catch (e) {
      toast({ tone: 'danger', title: 'Không thực hiện được', body: e.message });
    } finally {
      setBusy(false);
    }
  };
  const seg = (on) => clsx('tap h-10 rounded-[9px] px-3.5 text-sm', on ? 'bg-panel font-semibold text-ink shadow-sm' : 'text-ink-2 hover:text-ink');
  return (
    <section aria-label={`Phản ánh ${r.code}`} className={clsx('card flex flex-col gap-4 p-5', urgent && 'border-danger ring-1 ring-danger/40')}>
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="text-lg font-bold text-ink">{r.code} · {r.category_label}</h2>
        {urgent && <span className="chip bg-danger text-xs font-bold text-white">Khẩn</span>}
        <span className={clsx('chip text-xs font-bold', STATUS.cho_duyet.cls)}>{STATUS.cho_duyet.label}</span>
        <span className="ml-auto text-[13px] text-muted" title={dateTime(r.created_at)}>gửi {ago(r.created_at)} · {r.admin_name}</span>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-3">
          {r.photo_urls.length > 0 ? (
            <div className="grid grid-cols-2 gap-2.5">
              {r.photo_urls.map((p, i) => (
                <button key={p.thumb} type="button" onClick={() => onPhoto(p.full)} className="group relative overflow-hidden rounded-xl border border-line hover:border-accent" title="Xem ảnh phóng to">
                  <img src={p.full} alt={`Ảnh ${i + 1} của ${r.code}`} className="h-44 w-full object-cover" loading="lazy" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white opacity-0 transition-opacity group-hover:opacity-100"><ZoomIn size={16} aria-hidden="true" /></span>
                </button>
              ))}
            </div>
          ) : <p className="rounded-xl border border-dashed border-line p-3 text-[13px] text-muted">Người gửi không kèm ảnh.</p>}
          <div className="text-xs font-bold text-ink-2">Nội dung gốc — chỉ cán bộ thấy</div>
          <p className="rounded-xl bg-panel2 px-3.5 py-3 text-sm leading-relaxed text-ink">{r.description}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-2">
            <button type="button" className="flex items-center gap-1 font-medium text-accent hover:underline" onClick={() => { setFocus({ lat: r.lat, lon: r.lon, zoom: 15, label: r.code }); navigate('/ban-do'); }}>
              <MapPin size={13} aria-hidden="true" /> {r.hamlet_name ? `${r.hamlet_name} · ` : ''}{r.address ? `${r.address}, ` : ''}{r.admin_name}
            </button>
            {(r.reporter_name || r.reporter_phone) && (
              <span>
                Người gửi: <b className="text-ink">{r.reporter_name || 'ẩn danh'}</b>
                {r.reporter_phone && <> · <a className="font-mono text-accent hover:underline" href={`tel:${r.reporter_phone.replace(/\s/g, '')}`}>{r.reporter_phone}</a></>}
                {' '}— không bao giờ hiện ra cổng công khai.
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2.5" role="group" aria-label="Phần công khai">
          <label htmlFor={`cong-khai-${r.id}`} className="text-xs font-bold text-ink-2">Nội dung công khai (người dân sẽ thấy trên cổng)</label>
          <textarea
            id={`cong-khai-${r.id}`}
            className={clsx('input min-h-[110px] rounded-xl bg-panel text-sm leading-relaxed', short && pubDesc && 'border-danger')}
            maxLength={1000}
            value={pubDesc}
            onChange={(e) => setPubDesc(e.target.value)}
          />
          <span className="text-[11px] text-muted">Đã tự che SĐT, email, số giấy tờ — bỏ tiếp tên người, số nhà.</span>
          <div className="text-xs font-bold text-ink-2" id={`vi-tri-${r.id}`}>Vị trí công khai</div>
          <div className="seg-track self-start" role="radiogroup" aria-labelledby={`vi-tri-${r.id}`}>
            <button type="button" role="radio" aria-checked={!exact} className={seg(!exact)} onClick={() => setExact(false)}>Làm tròn ~150 m</button>
            <button type="button" role="radio" aria-checked={exact} className={seg(exact)} onClick={() => setExact(true)} title="Chỉ chọn khi là điểm công cộng (đường, cầu, taluy, bờ sông)">Vị trí chính xác</button>
          </div>
          {r.photo_urls.length > 0 && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={pubPhotos} onChange={(e) => setPubPhotos(e.target.checked)} />
              <span>Công khai ảnh <span className="text-muted">(bỏ chọn nếu có mặt người, biển số xe, số nhà)</span></span>
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-ink-2">Ghi chú công khai (tuỳ chọn)</span>
            <input className="input tap h-11 rounded-xl bg-panel text-sm" maxLength={500} placeholder="VD: Đã cắm biển cảnh báo" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2.5 border-t border-line pt-4">
        <button type="button" className="btn-secondary tap h-11 rounded-xl px-4" onClick={() => onAction(r, 'reject')}>Từ chối…</button>
        {canIncident && <button type="button" className="btn-secondary tap h-11 rounded-xl px-4" onClick={() => onAction(r, 'incident')}>Đánh dấu điểm sự cố…</button>}
        {!r.sos_ticket_id && (
          <button type="button" className="btn-secondary tap h-11 rounded-xl px-4" onClick={() => onAction(r, 'sos')}>
            <Siren size={15} className="text-danger" aria-hidden="true" /> Chuyển thành phiếu SOS
          </button>
        )}
        <span className="flex-1" />
        {short && <span className="text-xs text-danger">Nội dung công khai ít nhất 10 ký tự</span>}
        <button type="button" className="btn-primary tap h-11 rounded-xl px-5 font-semibold" disabled={busy || short} onClick={approve}>
          {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />} Duyệt và công khai
        </button>
      </div>
    </section>
  );
}

/**
 * Phản ánh đã công khai trong khung chi tiết máy tính (bản vẽ khung F5): phần người dân thấy trước, từng dòng; nội dung gốc và
 * người gửi vẫn ở dưới — chỉ cán bộ thấy. "Đánh dấu đã xử lý": phản ánh vẫn hiện trên cổng với nhãn đã xử lý.
 */
function PublishedDetail({ r, canModerate, onAction, onPhoto, onMap }) {
  const canIncident = usePermission('incident', 'update', r.admin_code);
  const live = r.status === 'da_duyet';
  const n = r.photo_urls.length;
  const row = (label, value) => (
    <div className="flex gap-3 border-t border-line py-2.5">
      <dt className="w-40 shrink-0 text-ink-2">{label}</dt>
      <dd className="min-w-0 flex-1 font-medium text-ink">{value}</dd>
    </div>
  );
  return (
    <div className="card flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="text-lg font-bold text-ink">{r.code} · {r.category_label}</h2>
        <span className={clsx('chip text-xs font-semibold', live ? 'bg-accent/10 text-accent' : 'bg-good/15 text-good')}>{live ? 'Đang công khai' : 'Đã xử lý'}</span>
        <span className="ml-auto text-[13px] text-muted" title={dateTime(r.created_at)}>{ago(r.created_at)} · {r.admin_name}</span>
      </div>
      <dl className="text-sm">
        {row('Phần công khai', r.public_description || r.public_description_suggested)}
        {row('Vị trí công khai', <button type="button" className="tap text-left font-medium text-accent hover:underline" onClick={onMap}>{r.exact_location ? 'Vị trí chính xác' : 'Làm tròn, lệch tối đa ~150 m'}{r.hamlet_name ? ` · ${r.hamlet_name}` : ''}</button>)}
        {row('Ảnh', n ? (r.public_photos ? `Công khai ${n} ảnh` : `Không công khai ${n} ảnh`) : 'Không có ảnh')}
        {r.public_note && row('Ghi chú công khai', r.public_note)}
        {row('Đã chuyển SOS', r.sos_code ? `${r.sos_code} — tiến độ, đóng phiếu ở trang Cứu hộ` : 'Chưa')}
        {row('Nội dung gốc', <span className="font-normal">{r.description} <span className="text-muted">(chỉ cán bộ thấy)</span></span>)}
        {(r.reporter_name || r.reporter_phone) && row('Người gửi', (
          <span className="font-normal">
            {r.reporter_name || 'ẩn danh'}
            {r.reporter_phone && <a className="num ml-2 text-accent hover:underline" href={`tel:${r.reporter_phone.replace(/\s/g, '')}`}>{r.reporter_phone}</a>}
          </span>
        ))}
        {r.moderated_by_name && row('Duyệt bởi', <span className="font-normal">{r.moderated_by_name} · {dateTime(r.moderated_at)}</span>)}
      </dl>
      {n > 0 && (
        <div className="flex gap-2">
          {r.photo_urls.map((p, i) => (
            <button key={p.thumb} type="button" onClick={() => onPhoto(p.full)} className="overflow-hidden rounded-xl border border-line hover:border-accent" title="Xem ảnh phóng to">
              <img src={p.thumb} alt={`Ảnh ${i + 1} của ${r.code}`} className="h-24 w-32 object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {canModerate && (
        <div className="mt-1 flex flex-wrap items-center gap-2.5 border-t border-line pt-4">
          <button type="button" className="btn-secondary tap h-11 rounded-xl px-4" onClick={() => onAction(r, 'edit_public')}><Pencil size={14} aria-hidden="true" /> Sửa phần công khai</button>
          {!r.sos_ticket_id && <button type="button" className="btn-secondary tap h-11 rounded-xl px-4" onClick={() => onAction(r, 'sos')}><Siren size={14} className="text-danger" aria-hidden="true" /> Chuyển thành phiếu SOS</button>}
          {canIncident && <button type="button" className="btn-secondary tap h-11 rounded-xl px-4" onClick={() => onAction(r, 'incident')}>Đánh dấu điểm sự cố…</button>}
          <span className="flex-1" />
          {live && <button type="button" className="btn-primary tap h-11 rounded-xl px-5" onClick={() => onAction(r, 'resolve')}><CheckCheck size={15} aria-hidden="true" /> Đánh dấu đã xử lý</button>}
        </div>
      )}
      <p className="rounded-[14px] border border-dashed border-line p-3 text-[13px] leading-normal text-ink-2">Đã xử lý vẫn hiện trên cổng với nhãn “đã xử lý”.</p>
    </div>
  );
}

function ReportCard({ r, onAction, onPhoto, fresh = false, large = false }) {
  const urgent = r.category === 'mac_ket' && r.status === 'cho_duyet'; // có người mắc kẹt, chưa xử lý
  const navigate = useNavigate();
  const setFocus = useStore((s) => s.setFocus);
  const canModerate = usePermission('report', 'moderate', r.admin_code);
  const st = STATUS[r.status];
  // Máy tính: phản ánh chờ duyệt → soạn phần công khai ngay trong ô (khung F4)
  if (large && canModerate && r.status === 'cho_duyet') return <ModerateDetail key={r.id} r={r} onAction={onAction} onPhoto={onPhoto} />;
  if (large && (r.status === 'da_duyet' || r.status === 'da_xu_ly')) {
    return <PublishedDetail key={r.id} r={r} canModerate={canModerate} onAction={onAction} onPhoto={onPhoto} onMap={() => { setFocus({ lat: r.lat, lon: r.lon, zoom: 15, label: r.code }); navigate('/ban-do'); }} />;
  }

  return (
    <div className={clsx('card flex flex-col gap-2.5', large ? 'p-5' : 'p-3.5', r.status === 'cho_duyet' && (urgent ? 'border-danger ring-1 ring-danger/40' : 'border-warn/70'), fresh && 'motion-safe:animate-enter')}>
      <div className="flex items-center gap-2">
        <b className="font-bold text-sm text-ink">{r.code}</b>
        {urgent && <span className="chip bg-danger text-white text-[10px] font-bold">Khẩn</span>}
        <span className={clsx('chip text-[10px] font-bold', st.cls)}>{st.label}</span>
        <span className="chip bg-panel2 text-[10px]">{r.category_label}</span>
        <span className="ml-auto text-xs text-muted" title={dateTime(r.created_at)}>{ago(r.created_at)}</span>
      </div>

      <p className="text-sm text-ink leading-relaxed bg-panel2/40 p-2.5 rounded-lg border border-line/40">
        {r.description}
      </p>

      {(r.status === 'da_duyet' || r.status === 'da_xu_ly') && (
        <div className="text-xs bg-good/5 border border-good/20 p-2 rounded-lg">
          <span className="font-semibold text-good">Trên cổng công khai:</span> {r.public_description || r.public_description_suggested}
          <div className="text-[11px] text-muted mt-0.5">
            Vị trí {r.exact_location ? 'chính xác' : 'làm tròn (lệch tối đa ~150 m)'}
            {r.photo_urls.length > 0 && ` · ${r.public_photos ? 'có' : 'không'} công khai ảnh`}
          </div>
        </div>
      )}

      {r.photo_urls.length > 0 && (
        <div className="flex gap-2">
          {r.photo_urls.map((p, i) => (
            <button
              key={p.thumb}
              onClick={() => onPhoto(p.full)}
              className="relative group overflow-hidden rounded-xl border border-line hover:border-accent shadow-sm"
              title="Xem ảnh phóng to"
            >
              <img src={large ? p.full : p.thumb} alt={`Ảnh ${i + 1} của ${r.code}`} className={large ? 'h-44 w-60 object-cover' : 'h-24 w-24 object-cover'} loading="lazy" />
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                <ZoomIn size={16} />
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2 pt-1 border-t border-line/40">
        <button
          className="flex items-center gap-1 text-accent font-medium hover:underline"
          onClick={() => { setFocus({ lat: r.lat, lon: r.lon, zoom: 15, label: r.code }); navigate('/ban-do'); }}
        >
          <MapPin size={12} /> {r.hamlet_name ? `${r.hamlet_name} · ` : ''}{r.address ? `${r.address}, ` : ''}{r.admin_name}
        </button>
        {(r.reporter_name || r.reporter_phone) && (
          <span className="flex items-center gap-1 text-muted">
            Người gửi: <b className="text-ink-2">{r.reporter_name || 'ẩn danh'}</b>
            {r.reporter_phone && (
              <a className="flex items-center gap-0.5 text-accent font-mono ml-1 hover:underline" href={`tel:${r.reporter_phone.replace(/\s/g, '')}`}>
                <Phone size={11} /> {r.reporter_phone}
              </a>
            )}
          </span>
        )}
      </div>

      {r.public_note && <div className="text-xs text-good bg-good/10 p-2 rounded-lg">Ghi chú công khai: {r.public_note}</div>}
      {r.reject_reason && <div className="text-xs text-muted bg-panel2 p-2 rounded-lg">Lý do từ chối: {r.reject_reason}</div>}
      {r.moderated_by_name && <div className="text-[11px] text-muted">Xử lý bởi {r.moderated_by_name} · {dateTime(r.moderated_at)}</div>}
      {r.sos_code && (
        <div className="text-xs font-semibold text-danger">
          Phiếu cứu hộ {r.sos_code} — tiến độ, đóng phiếu ở trang Cứu hộ; phiếu này đổi trạng thái theo
        </div>
      )}

      {canModerate && (
        // Khung chi tiết máy tính: nút cao 44 px, chữ 14 px (bản vẽ khung F)
        <div className={clsx('flex flex-wrap items-center gap-1.5 border-t border-line pt-2 mt-auto', large && 'gap-2.5 pt-4 [&_button]:min-h-[44px] [&_button]:rounded-xl [&_button]:px-4 [&_button]:text-sm')}>
          {r.status !== 'da_duyet' && r.status !== 'da_xu_ly' && (
            <button className="btn-primary px-2.5 py-1 text-xs shadow-sm font-semibold" onClick={() => onAction(r, 'approve')}>
              <Check size={12} /> Duyệt công khai
            </button>
          )}
          {r.status === 'cho_duyet' && (
            <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => onAction(r, 'reject')}>
              <X size={12} /> Từ chối
            </button>
          )}
          {r.status === 'da_duyet' && (
            <button className="btn-ghost px-2.5 py-1 text-xs text-good" onClick={() => onAction(r, 'resolve')}>
              <CheckCheck size={12} /> Đã xử lý
            </button>
          )}
          {(r.status === 'da_duyet' || r.status === 'da_xu_ly') && (
            <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => onAction(r, 'edit_public')}>
              <Pencil size={12} /> Sửa phần công khai
            </button>
          )}
          {!r.sos_ticket_id && r.status !== 'tu_choi' && (
            <button className="btn-danger ml-auto px-2.5 py-1 text-xs shadow-sm font-semibold" onClick={() => onAction(r, 'sos')}>
              <Siren size={12} /> Chuyển SOS
            </button>
          )}
          {/* Phiếu đã nối phiếu cứu hộ đổi trạng thái theo phiếu SOS — mở lại ở trang Cứu hộ (máy chủ cũng chặn) */}
          {r.status === 'tu_choi' && !r.sos_ticket_id && (
            <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => onAction(r, 'reopen')}>
              <RotateCcw size={12} /> Mở lại
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Một dòng của cột danh sách (máy tính ≥ 1280 px — bản vẽ khung F): ảnh nhỏ, mã, chấm khẩn, thời gian, nội dung một dòng,
 * xã · số ảnh. Chọn → chi tiết bên phải. */
function ReportRow({ r, selected, onSelect }) {
  const urgent = r.category === 'mac_ket' && r.status === 'cho_duyet';
  const thumb = r.photo_urls?.[0]?.thumb;
  return (
    <button
      type="button"
      onClick={() => onSelect(r.id)}
      aria-current={selected ? 'true' : undefined}
      className={clsx('tap flex w-full gap-3 rounded-[14px] p-3 text-left transition-colors', selected ? 'bg-accent/10 ring-2 ring-accent' : 'bg-panel2 hover:bg-line/50')}
    >
      {thumb
        ? <img src={thumb} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" loading="lazy" />
        : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-line/60 text-[11px] text-muted">chưa có ảnh</span>}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <b className="text-sm text-ink">{r.code}</b>
          {urgent && <span className="h-2 w-2 shrink-0 rounded-full bg-danger" aria-label="Khẩn — có người mắc kẹt" />}
          <span className="ml-auto shrink-0 text-xs text-muted" title={dateTime(r.created_at)}>{ago(r.created_at)}</span>
        </span>
        <span className="mt-0.5 block truncate text-sm text-ink">{r.description}</span>
        <span className="block truncate text-xs text-muted">
          {r.admin_name}{r.hamlet_name ? ` · ${r.hamlet_name}` : ''} · {r.photo_urls?.length ? `${r.photo_urls.length} ảnh` : 'chưa có ảnh'}
        </span>
      </span>
    </button>
  );
}

// Màn trống từng thẻ trạng thái: nói rõ chưa có gì và việc sẽ diễn ra (không để một dòng chữ xám)
const EMPTY = {
  cho_duyet: 'Không có phản ánh nào chờ duyệt. Phản ánh người dân gửi từ cổng công khai sẽ hiện ở đây — trang tự cập nhật mỗi 30 giây.',
  da_duyet: 'Chưa có phản ánh nào đang công khai trong phạm vi của bạn. Phản ánh được duyệt hiện ở đây và trên bản đồ của cổng người dân.',
  da_xu_ly: 'Chưa có phản ánh nào đã xử lý trong phạm vi của bạn.',
  tu_choi: 'Chưa có phản ánh nào bị từ chối trong phạm vi của bạn.',
};

/** Lưới phản ánh của MỘT thẻ trạng thái (vẽ lại khi đổi thẻ — đổi thẻ không tính là "mới"): phản ánh mới đến trong lúc đang
 * xem (làm mới 30 giây) → trượt vào một lần. `all` = mọi phản ánh của thẻ (ghi nhận đã thấy), `shown` = sau khi tìm. */
function ReportGrid({ all, shown, search, empty, onAction, onPhoto }) {
  const isNew = useNewKeys(all.map((r) => r.id), true);
  if (!shown.length) {
    return (
      <EmptyState art={search ? 'tim' : 'hop-thu'} className="py-10">
        {search ? `Không thấy phản ánh khớp "${search}" ở thẻ này — thử tên xã, mã phản ánh hoặc số điện thoại khác.` : empty}
      </EmptyState>
    );
  }
  return (
    <div className="grid gap-3.5 md:grid-cols-2 2xl:grid-cols-3">
      {shown.map((r) => <ReportCard key={r.id} r={r} fresh={isNew(r.id)} onAction={onAction} onPhoto={onPhoto} />)}
    </div>
  );
}

export default function CitizenReports() {
  const [tab, setTab] = useState('cho_duyet');
  const [modal, setModal] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState(null);
  // Máy tính ≥ 1280 px (bản vẽ desktop khung F): danh sách – chi tiết — cột trái thẻ trạng thái + tìm + danh sách gọn, bên phải
  // chi tiết phản ánh đang chọn (ảnh, nội dung gốc, người gửi, thao tác)
  const desk = useMediaQuery('(min-width: 1280px)');
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const reportsQ = useAreaQuery('reports', '/reports', { status: tab }, { refetchInterval: 30_000 });
  const { data } = reportsQ;
  const counts = data?.counts || {};
  const scopeLabel = useScopeLabel('report', 'view');
  const dataTime = reportsQ.dataUpdatedAt
    ? new Date(reportsQ.dataUpdatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  const onAction = async (r, action) => {
    if (action === 'reopen') {
      await api(`/reports/${r.id}/moderate`, { method: 'POST', body: { action: 'reopen' } }).catch((e) => toast({ tone: 'danger', title: e.message }));
      qc.invalidateQueries({ queryKey: ['reports'] });
      return;
    }
    setModal({ r, action });
  };

  const filteredItems = useMemo(() => {
    const list = data?.items || [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((r) =>
      r.code?.toLowerCase().includes(q) ||
      r.description?.toLowerCase().includes(q) ||
      r.admin_name?.toLowerCase().includes(q) ||
      r.reporter_phone?.includes(q) ||
      r.reporter_name?.toLowerCase().includes(q)
    );
  }, [data?.items, search]);

  const modals = (
    <>
      {modal && modal.action !== 'reopen' && (
        modal.action === 'incident' ? (
          <IncidentModal
            at={{ lat: modal.r.lat, lon: modal.r.lon, report: { ...modal.r, incident_type: modal.r.category === 'sat_lo' ? 'sat_lo' : 'giao_thong' } }}
            onClose={() => setModal(null)}
          />
        ) : <ActionModal report={modal.r} action={modal.action} onClose={() => setModal(null)} />
      )}
      {photo && (
        <div
          className="fixed inset-0 z-[1600] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in"
          onClick={() => setPhoto(null)}
        >
          <div className="relative max-h-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <img src={photo} alt="Ảnh phản ánh phóng to" className="max-h-[85vh] max-w-full rounded-2xl shadow-2xl border border-line/40" />
            <button
              onClick={() => setPhoto(null)}
              className="absolute -top-3 -right-3 rounded-full bg-panel p-1.5 text-ink shadow-lg hover:bg-panel2"
              title="Đóng ảnh"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  );

  if (desk) {
    const selected = filteredItems.find((r) => r.id === picked) || filteredItems[0];
    return (
      <div className={`${PAGE} pb-8`}>
        <h1 className="sr-only">Phản ánh hiện trường của người dân — {scopeLabel}</h1>
        <div className="grid grid-cols-[400px_minmax(0,1fr)] items-start gap-5">
          <aside aria-label="Danh sách phản ánh" className="sheet sticky top-0 flex max-h-[calc(100vh-9rem)] flex-col gap-3 p-[18px]">
            <div className="seg-track flex-wrap self-start" role="tablist" aria-label="Trạng thái phản ánh">
              {Object.keys(STATUS).map((k) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setPicked(null); }} className={clsx('seg-item px-2.5', tab === k && 'seg-item-on')} title={STATUS[k].label}>
                  {SHORT[k]}
                  {counts[k] > 0 && <span className="num rounded-full bg-panel2 px-1.5 text-xs font-semibold text-ink-2">{counts[k]}</span>}
                </button>
              ))}
            </div>
            <label className="flex h-11 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-sm focus-within:border-accent">
              <Search size={15} className="shrink-0 text-muted" aria-hidden="true" />
              <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted" placeholder="Tìm phản ánh, địa bàn, SĐT…" aria-label="Tìm phản ánh theo mã, nội dung, địa bàn, số điện thoại" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
            <div className="scroll-thin -mx-1 min-h-0 flex-1 overflow-y-auto px-1">
              {!data && reportsQ.isError ? (
                <ErrorState onRetry={() => reportsQ.refetch()}>Không tải được danh sách phản ánh — không có nghĩa là không có phản ánh mới</ErrorState>
              ) : !data ? (
                <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} height={88} />)}</div>
              ) : filteredItems.length ? (
                <ul className="flex flex-col gap-2" aria-label="Các phản ánh">
                  {filteredItems.map((r) => <li key={r.id}><ReportRow r={r} selected={r.id === selected?.id} onSelect={setPicked} /></li>)}
                </ul>
              ) : (
                <p className="py-8 text-center text-sm text-muted">{search.trim() ? `Không thấy phản ánh khớp "${search.trim()}" ở thẻ này.` : EMPTY[tab]}</p>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="flex-1">Tự cập nhật mỗi 30 giây{dataTime ? ` · lúc ${dataTime}` : ''} · tiếp nhận từ cổng công khai</span>
              <RoleTips page="phan-anh" compact />
            </div>
          </aside>
          <div className="min-w-0">
            {selected ? (
              <ReportCard key={selected.id} r={selected} large onAction={onAction} onPhoto={setPhoto} />
            ) : data ? (
              <EmptyState art="hop-thu" className="sheet py-16">Chọn một phản ánh ở cột bên trái để xem ảnh, nội dung và duyệt.</EmptyState>
            ) : null}
            <p className="mt-2 text-xs text-muted">Chỉ công khai sau khi cán bộ phê duyệt; số điện thoại người gửi không bao giờ hiện ra cổng công khai.</p>
          </div>
        </div>
        {modals}
      </div>
    );
  }

  return (
    <div className={`${PAGE} pb-8`}>
      <PageHeader
        tips={<RoleTips page="phan-anh" />}
        title="Phản ánh hiện trường của người dân"
        short="Phản ánh người dân"
        scope={scopeLabel}
        time={dataTime}
        timeNote={reportsQ.isError ? 'Chưa tải được số liệu' : 'Đang tải số liệu…'}
        description="Tiếp nhận từ cổng công khai. Chỉ công khai sau khi cán bộ phê duyệt; số điện thoại người gửi được bảo mật."
        actions={(
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              className="input tap h-9 w-36 py-1 pl-8 text-sm sm:w-64"
              placeholder="Tìm phản ánh, địa bàn, SĐT..."
              aria-label="Tìm phản ánh theo mã, nội dung, địa bàn, số điện thoại"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
      />

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={Object.entries(STATUS).map(([k, v]) => ({
          value: k,
          label: v.label,
          count: counts[k] || 0,
          icon: k === 'cho_duyet' ? Inbox : k === 'tu_choi' ? X : Camera,
        }))}
      />

      {/* Ba trạng thái rõ ràng: đang tải (không báo "không có phản ánh" khi chưa biết) · lỗi (Thử lại) · có số liệu */}
      {!data && reportsQ.isError ? (
        <ErrorState onRetry={() => reportsQ.refetch()}>
          Không tải được danh sách phản ánh — không có nghĩa là không có phản ánh mới
        </ErrorState>
      ) : !data ? (
        <div className="grid gap-3.5 md:grid-cols-2 2xl:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} height={220} />)}
        </div>
      ) : (
        <ReportGrid
          key={tab}
          all={data.items || []}
          shown={filteredItems}
          search={search.trim()}
          empty={EMPTY[tab]}
          onAction={onAction}
          onPhoto={setPhoto}
        />
      )}

      {modals}
    </div>
  );
}
