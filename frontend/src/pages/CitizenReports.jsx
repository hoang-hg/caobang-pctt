import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Camera, Check, X, Siren, MapPin, Phone, RotateCcw, CheckCheck, Inbox, Search, ZoomIn } from 'lucide-react';
import { api } from '../api/client';
import { useAreaQuery } from '../api/hooks';
import { useStore } from '../app/store';
import { Empty, Modal, Tabs } from '../components/common/ui';
import { usePermission } from '../rbac/usePermission';
import { ago, dateTime } from '../utils/format';
import { INCIDENT } from '../utils/labels';

const STATUS = {
  cho_duyet: { label: 'Chờ duyệt', cls: 'bg-warn text-black' },
  da_duyet: { label: 'Đã duyệt (công khai)', cls: 'bg-good text-white' },
  da_xu_ly: { label: 'Đã xử lý', cls: 'bg-accent text-white' },
  tu_choi: { label: 'Từ chối', cls: 'bg-panel2 text-muted' },
};

function ActionModal({ report, action, onClose }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const [note, setNote] = useState(report.public_note || '');
  const [reason, setReason] = useState('');
  const [incident, setIncident] = useState(report.category === 'sat_lo' ? 'sat_lo' : report.category === 'lu_quet' ? 'lu_quet' : 'ngap_lut');
  const [priority, setPriority] = useState(report.category === 'mac_ket' ? 1 : 2);
  const [trapped, setTrapped] = useState(0);
  const title = { approve: 'Duyệt & công khai phản ánh', reject: 'Từ chối phản ánh', resolve: 'Đánh dấu đã xử lý', sos: 'Chuyển thành phiếu SOS' }[action];

  const submit = async () => {
    try {
      if (action === 'sos') {
        const r = await api(`/reports/${report.id}/to-sos`, { method: 'POST', body: { incident_type: incident, priority, trapped_count: Number(trapped) } });
        toast({ tone: 'good', title: `Đã tạo phiếu ${r.sos_code}`, body: 'Theo dõi tại Điều hành cứu hộ' });
      } else {
        await api(`/reports/${report.id}/moderate`, { method: 'POST', body: { action, public_note: note || null, reject_reason: reason || null } });
        toast({ tone: 'good', title: `${title}: ${report.code}` });
      }
      qc.invalidateQueries({ queryKey: ['reports'] });
      onClose();
    } catch (e) {
      toast({ tone: 'danger', title: 'Không thực hiện được', body: e.message });
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${title} – ${report.code}`}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button
            className={action === 'reject' ? 'btn-ghost text-danger' : 'btn-primary'}
            disabled={action === 'reject' && reason.length < 3}
            onClick={submit}
          >
            Xác nhận
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <p className="rounded-xl bg-panel2 p-3 italic text-ink border border-line/60">
          “{report.description}”
        </p>

        {(action === 'approve' || action === 'resolve') && (
          <label className="space-y-1">
            <span className="font-semibold text-xs text-muted uppercase">Ghi chú công khai (người dân sẽ thấy trên cổng)</span>
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
          <label className="space-y-1">
            <span className="font-semibold text-xs text-muted uppercase">Lý do từ chối (lưu hồ sơ nội bộ)</span>
            <input
              className="input mt-1"
              autoFocus
              maxLength={500}
              placeholder="VD: Ảnh không liên quan, trùng phản ánh PA-…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        )}

        {action === 'sos' && (
          <div className="grid grid-cols-3 gap-2">
            <label>
              <span className="text-xs text-muted">Loại sự cố</span>
              <select className="input mt-1" value={incident} onChange={(e) => setIncident(e.target.value)}>
                {Object.entries(INCIDENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>
              <span className="text-xs text-muted">Ưu tiên</span>
              <select className="input mt-1" value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
                <option value={1}>Cấp 1 – Đỏ</option>
                <option value={2}>Cấp 2 – Cam</option>
                <option value={3}>Cấp 3 – Vàng</option>
              </select>
            </label>
            <label>
              <span className="text-xs text-muted">Số người mắc kẹt</span>
              <input className="input mt-1" type="number" min={0} value={trapped} onChange={(e) => setTrapped(e.target.value)} />
            </label>
          </div>
        )}
      </div>
    </Modal>
  );
}

function ReportCard({ r, onAction, onPhoto }) {
  const navigate = useNavigate();
  const setFocus = useStore((s) => s.setFocus);
  const canModerate = usePermission('report', 'moderate', r.admin_code);
  const st = STATUS[r.status];

  return (
    <div className={clsx('card flex flex-col gap-2.5 p-3.5 shadow-sm hover:shadow-md transition-all', r.status === 'cho_duyet' && 'border-warn/70')}>
      <div className="flex items-center gap-2">
        <b className="font-bold text-sm text-ink">{r.code}</b>
        <span className={clsx('chip text-[10px] font-bold', st.cls)}>{st.label}</span>
        <span className="chip bg-panel2 text-[10px]">{r.category_label}</span>
        <span className="ml-auto text-xs text-muted" title={dateTime(r.created_at)}>{ago(r.created_at)}</span>
      </div>

      <p className="text-sm text-ink leading-relaxed bg-panel2/40 p-2.5 rounded-lg border border-line/40">
        {r.description}
      </p>

      {r.photo_urls.length > 0 && (
        <div className="flex gap-2">
          {r.photo_urls.map((p, i) => (
            <button
              key={p.thumb}
              onClick={() => onPhoto(p.full)}
              className="relative group overflow-hidden rounded-xl border border-line hover:border-accent shadow-sm"
              title="Xem ảnh phóng to"
            >
              <img src={p.thumb} alt={`Ảnh ${i + 1} của ${r.code}`} className="h-24 w-24 object-cover group-hover:scale-105 transition-transform" loading="lazy" />
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
      {r.sos_code && <div className="text-xs font-semibold text-danger">Đã chuyển thành phiếu SOS: {r.sos_code}</div>}

      {canModerate && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2 mt-auto">
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
          {!r.sos_ticket_id && r.status !== 'tu_choi' && (
            <button className="btn-danger ml-auto px-2.5 py-1 text-xs shadow-sm font-semibold" onClick={() => onAction(r, 'sos')}>
              <Siren size={12} /> Chuyển SOS
            </button>
          )}
          {r.status === 'tu_choi' && (
            <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => onAction(r, 'reopen')}>
              <RotateCcw size={12} /> Mở lại
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function CitizenReports() {
  const [tab, setTab] = useState('cho_duyet');
  const [modal, setModal] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [search, setSearch] = useState('');
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const { data } = useAreaQuery('reports', '/reports', { status: tab }, { refetchInterval: 30_000 });
  const counts = data?.counts || {};

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

  return (
    <div className="flex flex-col gap-3.5 p-3.5 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink flex items-center gap-2">
            <span>Phản ánh hiện trường của người dân</span>
          </h1>
          <p className="text-xs text-muted mt-0.5">
            Dữ liệu tiếp nhận từ cổng công khai. Thông tin chỉ được công khai sau khi cán bộ phê duyệt; số điện thoại người gửi được bảo mật.
          </p>
        </div>

        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-2 text-muted" />
          <input
            className="input pl-8 py-1 text-xs w-48 sm:w-64"
            placeholder="Tìm phản ánh, địa bàn, SĐT..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

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

      <div className="grid gap-3.5 md:grid-cols-2 2xl:grid-cols-3">
        {filteredItems.map((r) => (
          <ReportCard key={r.id} r={r} onAction={onAction} onPhoto={setPhoto} />
        ))}
      </div>

      {filteredItems.length === 0 && (
        <Empty>
          {search ? 'Không tìm thấy phản ánh nào phù hợp' : 'Không có phản ánh ở trạng thái này trong phạm vi của bạn'}
        </Empty>
      )}

      {modal && modal.action !== 'reopen' && (
        <ActionModal report={modal.r} action={modal.action} onClose={() => setModal(null)} />
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
              className="absolute -top-3 -right-3 rounded-full bg-panel p-1.5 text-ink shadow-lg hover:scale-110 transition-transform"
              title="Đóng ảnh"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
