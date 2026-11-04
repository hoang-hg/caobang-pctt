import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { CheckCircle2, Inbox, MapPin, MapPinCheck, Phone, Send, X } from 'lucide-react';
import { useEscapeToClose } from '../common/ui';
import { usePermission } from '../../rbac/usePermission';
import { CLOSE_REASON, FIELD_REPORT, INCIDENT, ITEM_NAME, PRIORITY, VULNERABLE, sosStatusLabel, sourceLabel } from '../../utils/labels';
import { dateTime, time } from '../../utils/format';
import { hasActiveTeam } from '../../utils/sla';
import { waitText } from './rescueFacts';

const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

/**
 * Diễn biến của phiếu dựng từ các mốc giờ phiếu đã có (nhận tin, nhận phiếu, điều đội, đội đến, trưởng nhóm báo, xong /
 * đóng) — không cần API lịch sử riêng. Mới nhất ở cuối (đọc từ trên xuống như nhật ký).
 */
function timeline(t) {
  const items = [
    t.received_at && { at: t.received_at, who: sourceLabel(t), what: t.request_code ? `Người dân gửi yêu cầu ${t.request_code}` : 'Nhận tin báo, tạo phiếu' },
    t.acknowledged_at && { at: t.acknowledged_at, who: 'Trực ban', what: `Nhận phiếu, xếp Cấp ${t.priority} · ${PRIORITY[t.priority]?.short || ''}` },
    t.dispatched_at && {
      at: t.dispatched_at,
      who: 'Trực ban',
      what: `Điều ${t.force_name || 'đội'}${t.distance_km != null ? ` · ${t.distance_km} km` : ''}${t.route_safe === false ? ' · đường qua vùng nguy hiểm' : ''}`,
      accent: true,
    },
    t.arrived_at && { at: t.arrived_at, who: t.force_name || 'Đội', what: 'Đã đến hiện trường', accent: true },
    t.field_at && t.field_kind && t.field_kind !== 'arrived' && {
      at: t.field_at,
      who: t.field_via === 'staff' ? 'Trực ban' : 'Trưởng nhóm (link nhiệm vụ)',
      what: t.field_kind === 'rescued'
        ? `Báo đã cứu ${t.field_people_safe ?? ''} người — chờ xác nhận${t.field_note ? `: ${t.field_note}` : ''}`
        : `${FIELD_REPORT[t.field_kind] || t.field_kind}${t.field_note ? `: ${t.field_note}` : ''}`,
      danger: t.field_kind === 'need_support',
    },
    t.resolved_at && {
      at: t.resolved_at,
      who: 'Trực ban',
      what: t.close_reason ? `Đóng không cần cứu — ${(CLOSE_REASON[t.close_reason] || t.close_reason).toLowerCase()}` : 'Xác nhận đã cứu xong',
      good: !t.close_reason,
    },
  ].filter(Boolean);
  return items.sort((a, b) => new Date(a.at) - new Date(b.at));
}

/**
 * Chi tiết một phiếu cứu hộ — ngăn bên phải (máy tính ≥ 1280 px, bản vẽ desktop khung C3): mã · loại sự cố · số người, kênh
 * và giờ mở; nhãn mức / bước / nhóm yếu thế; nội dung tin gốc; người báo, vị trí, đội, trưởng nhóm, vật tư; diễn biến. Chân
 * ngăn: "Không cần cứu…" (khi chưa có đội), gọi trưởng nhóm / người báo, nút bước kế tiếp (cùng quy tắc với thẻ phiếu).
 * Phiếu cập nhật trực tiếp theo danh sách đang tải lại; Esc / bấm nền mờ để đóng.
 */
export default function TicketDrawer({ t, x, online, onClose, onDispatch, onMove, onArrived, onResolve, onFocus, onCloseTicket }) {
  useEscapeToClose(true, onClose);
  const closeRef = useRef(null);
  useEffect(() => { closeRef.current?.focus(); }, [t.id]);
  const canUpdate = usePermission('sos', 'update', t.admin_code);
  const canResolve = usePermission('sos', 'resolve', t.admin_code);
  const canDispatch = usePermission('dispatch', 'create', t.admin_code);
  const pr = PRIORITY[t.priority] || PRIORITY[2];
  const off = !online ? 'Mất mạng — chưa ghi được' : undefined;
  const doing = t.status === 'thuc_thi';
  const waiting = t.status === 'moi' || t.status === 'dieu_phoi';
  const arrived = t.dispatch_status === 'da_den';
  const rescued = doing && t.field_kind === 'rescued';
  const supplies = Object.entries(t.dispatch_supplies || {}).filter(([, n]) => n > 0);
  const wait = waitText(t, x?.sla);
  const now = Date.now();
  const btn = 'tap inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-4 text-sm font-semibold';

  let primary = null;
  if (waiting && canDispatch) {
    primary = <button type="button" className={clsx('btn-primary', btn)} onClick={() => onDispatch(t)} disabled={!online} title={off}><Send size={15} aria-hidden="true" /> Điều đội</button>;
  } else if (t.status === 'moi' && canUpdate) {
    primary = <button type="button" className={clsx('btn-primary', btn)} onClick={() => onMove(t, 'dieu_phoi')} disabled={!online} title={off}><Inbox size={15} aria-hidden="true" /> Nhận phiếu</button>;
  } else if (doing && !arrived && !rescued && canUpdate && t.dispatch_id) {
    primary = <button type="button" className={clsx('btn-primary', btn)} onClick={() => onArrived(t)} disabled={!online} title={off}><MapPinCheck size={15} aria-hidden="true" /> Đội đã đến</button>;
  } else if (doing && canResolve) {
    primary = <button type="button" className={clsx('btn-primary', btn)} onClick={() => onResolve(t)} disabled={!online} title={off}><CheckCircle2 size={15} aria-hidden="true" /> Xác nhận đã cứu</button>;
  }
  const call = t.force_phone && doing
    ? { href: t.force_phone, label: 'Gọi trưởng nhóm' }
    : t.reporter_phone ? { href: t.reporter_phone, label: 'Gọi người báo tin' } : null;

  const fact = (label, value) => (
    <div className="min-w-0">
      <dt className="text-xs font-bold text-ink-2">{label}</dt>
      <dd className="mt-0.5 text-[15px] text-ink [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[1500] flex justify-end bg-black/40" onMouseDown={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="chi-tiet-phieu"
        onMouseDown={(e) => e.stopPropagation()}
        className="flex h-full w-[600px] max-w-full flex-col bg-panel shadow-2xl motion-safe:animate-enter"
      >
        <header className="flex items-start gap-3 border-b border-line px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="chi-tiet-phieu" className="text-xl font-bold leading-tight text-ink">
              {t.code} · {INCIDENT[t.incident_type] || t.incident_type} · {t.trapped_count ?? 0} người
            </h2>
            <p className="mt-0.5 text-[13px] text-ink-2">Kênh: {sourceLabel(t)} · mở {sameDay(t.received_at, now) ? time(t.received_at) : dateTime(t.received_at)}{t.event_name ? ` · ${t.event_name}` : ''}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Đóng chi tiết phiếu" className="tap-sq flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line text-ink-2 hover:bg-panel2">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={clsx('chip py-0.5 text-xs font-bold', pr.cls)} title={pr.label}>Cấp {t.priority} · {pr.short}</span>
            <span className="chip bg-accent/10 py-0.5 text-xs font-semibold text-accent">{sosStatusLabel(t)}</span>
            {x?.overdue && <span className="chip bg-danger py-0.5 text-xs font-bold text-white">Quá hạn</span>}
            {(t.vulnerable || []).map((v) => <span key={v} className="chip bg-panel2 py-0.5 text-xs font-semibold text-ink">{VULNERABLE[v] || v}</span>)}
          </div>
          {wait && <p className={clsx('-mt-2 text-sm font-semibold', x?.overdue ? 'text-danger' : 'text-ink-2')}>{wait}</p>}
          {t.raw_message && <blockquote className="rounded-[14px] bg-panel2 px-4 py-3 text-[15px] leading-relaxed text-ink">“{t.raw_message}”</blockquote>}
          {t.request_code && (
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
              <span>Yêu cầu của người dân <b className="num text-ink">{t.request_code}</b></span>
              {t.request_photo_urls?.map((p, i) => (
                <a key={p.thumb} href={p.full} target="_blank" rel="noreferrer" className="tap-sq block overflow-hidden rounded-lg border border-line hover:border-accent" title={`Ảnh ${i + 1} người dân gửi — mở cỡ lớn`}>
                  <img src={p.thumb} alt={`Ảnh ${i + 1} của ${t.request_code}`} className="h-14 w-14 object-cover" loading="lazy" />
                </a>
              ))}
            </div>
          )}

          <dl className="grid grid-cols-2 gap-x-5 gap-y-3">
            {fact('Người báo', <>{t.reporter_name ? <b>{t.reporter_name}</b> : 'Chưa ghi tên'}{t.reporter_phone ? ` · ${t.reporter_phone}` : ''}</>)}
            {fact('Vị trí', (
              <>
                {t.address || t.admin_name}{t.admin_name && t.address && t.address !== t.admin_name ? ` (${t.admin_name})` : ''}
                {t.lat != null && (
                  <button type="button" onClick={() => onFocus(t)} className="tap ml-1 inline-flex items-center gap-1 rounded text-sm font-semibold text-accent hover:underline">
                    <MapPin size={14} aria-hidden="true" /> Xem trên bản đồ
                  </button>
                )}
              </>
            ))}
            {fact('Đội', t.force_name || <span className="text-muted">Chưa điều đội</span>)}
            {fact('Trưởng nhóm', t.force_phone || <span className="text-muted">—</span>)}
            {supplies.length > 0 && fact('Vật tư mang theo', `${supplies.map(([c, n]) => `${ITEM_NAME[c] || c} ${n}`).join(' · ')}${t.supplies_warehouse ? ` — xuất ${t.supplies_warehouse}` : ''}`)}
            {t.notes && fact('Ghi chú', t.notes)}
          </dl>

          <section aria-labelledby="dien-bien-phieu">
            <h3 id="dien-bien-phieu" className="mb-2 text-xs font-bold text-ink-2">Diễn biến</h3>
            <ol className="relative ml-1.5 border-l-2 border-line">
              {timeline(t).map((e) => (
                <li key={`${e.at}-${e.what}`} className="relative pb-3.5 pl-5 last:pb-0">
                  <span
                    className={clsx('absolute -left-[7px] top-1.5 h-3 w-3 rounded-full ring-2 ring-panel', e.danger ? 'bg-danger' : e.good ? 'bg-good' : e.accent ? 'bg-accent' : 'bg-muted')}
                    aria-hidden="true"
                  />
                  <div className="text-[13px] text-ink-2"><b className="num text-ink">{sameDay(e.at, now) ? time(e.at) : dateTime(e.at)}</b> · {e.who}</div>
                  <div className="text-[15px] text-ink [overflow-wrap:anywhere]">{e.what}</div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-line px-6 py-4">
          {canUpdate && t.status !== 'hoan_thanh' && !hasActiveTeam(t) && (
            <button type="button" className={clsx('btn-secondary', btn, 'font-normal')} onClick={() => onCloseTicket(t)} disabled={!online} title={off || 'Trùng phiếu khác, không xác minh được, người gặp nạn đã tự an toàn'}>
              Không cần cứu…
            </button>
          )}
          <span className="flex-1" />
          {call && (
            <a className={clsx('btn-secondary', btn, 'font-normal')} href={`tel:${call.href.replace(/\s/g, '')}`}>
              <Phone size={15} aria-hidden="true" /> {call.label}
            </a>
          )}
          {primary}
        </footer>
      </aside>
    </div>,
    document.body,
  );
}
