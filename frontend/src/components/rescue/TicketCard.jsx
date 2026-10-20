import clsx from 'clsx';
import {
  Ban, CheckCircle2, HandHelping, Inbox, Link2, LifeBuoy, MapPin, MapPinCheck, Navigation, Pencil, Phone, Send, Timer, TriangleAlert,
} from 'lucide-react';
import { Progress } from '../common/ui';
import { usePermission } from '../../rbac/usePermission';
import { INCIDENT, PRIORITY, SOURCE, VULNERABLE } from '../../utils/labels';
import { time } from '../../utils/format';
import { risk, sosLevel } from '../../utils/risk';
import { hasActiveTeam } from '../../utils/sla';
import { COLUMNS, etaText, isCommuneSupport, waitText } from './rescueFacts';

const BTN = 'tap inline-flex min-h-[32px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-xs font-semibold';

/**
 * Thẻ một phiếu cứu hộ (bảng điều phối, danh sách trên điện thoại). Vạch trái theo mức ưu tiên (thang chung: cấp 1 Đỏ, 2 Cam,
 * 3 Vàng), nhãn mức ghi cả chữ ("Cấp 1 · Đỏ"); xã xin chi viện → dải đỏ trên đầu thẻ. Thời gian chờ viết thành câu theo hạn
 * phản hồi ("Chờ 5 phút — quá hạn 2 phút"); quá hạn → viền đỏ + nhãn "Quá hạn" nhấp nháy (tắt khi hệ điều hành bật giảm
 * chuyển động). Mỗi bước MỘT nút chính to: "Điều đội" (quyền dispatch.create) / "Nhận phiếu" (chỉ có sos.update) → "Đội đã
 * đến" khi đội đang đi → "Xác nhận đã cứu"; rồi các nút phụ (bản đồ, gọi, link nhiệm vụ, huỷ lệnh, chuyển cột). Nút ≥ 44 px
 * trên màn cảm ứng; mất mạng → nút ghi tắt, nói lý do. `fresh`: phiếu vừa đến khi đang xem → trượt vào một lần.
 */
export default function TicketCard({ t, x, now, online, compact = false, fresh = false, onDispatch, onResolve, onFocus, onArrived, onLink, onCancel, onEdit, onMove }) {
  const canUpdate = usePermission('sos', 'update', t.admin_code);
  const canResolve = usePermission('sos', 'resolve', t.admin_code);
  const canDispatch = usePermission('dispatch', 'create', t.admin_code);
  const pr = PRIORITY[t.priority] || PRIORITY[2];
  const { sla, overdue } = x;
  const offline = !online ? 'Mất mạng — chưa ghi được' : undefined;
  // Đang có đội thực hiện → không về 2 cột đầu (máy chủ chặn, phải huỷ lệnh trước); "Đã cứu xong" cần quyền xác nhận
  const targets = COLUMNS.filter(
    (c) => c.key !== t.status && !(hasActiveTeam(t) && (c.key === 'moi' || c.key === 'dieu_phoi')) && (c.key !== 'hoan_thanh' || canResolve),
  );
  const etaSec = t.eta ? (new Date(t.eta).getTime() - now) / 1000 : null;
  // Tiến độ: đã đến = 100%; bộ mô phỏng có tiến độ thật; chạy thật chưa có GPS → ước tính theo giờ xuất phát và giờ dự kiến
  const arrived = t.dispatch_status === 'da_den';
  const span = t.dispatched_at && t.eta ? new Date(t.eta) - new Date(t.dispatched_at) : 0;
  const estimated = !arrived && !(t.progress > 0);
  const progress = arrived ? 100 : t.progress > 0 ? t.progress * 100 : span > 0 ? Math.min(95, (100 * (now - new Date(t.dispatched_at))) / span) : 0;
  const doing = t.status === 'thuc_thi';
  const needSupport = doing && t.field_kind === 'need_support';
  const rescued = doing && t.field_kind === 'rescued';
  const missionOpen = doing && t.dispatch_id && (t.dispatch_status === 'dang_di' || t.dispatch_status === 'da_den');
  const waiting = t.status === 'moi' || t.status === 'dieu_phoi';
  const enRoute = doing && !arrived && !rescued && canUpdate && !!t.dispatch_id; // đội đang đi, chưa báo tới
  const wait = waitText(t, sla);

  // Nút chính theo bước kế tiếp (một nút to, trọn bề ngang trên điện thoại và trong cột hẹp của bảng 4 cột)
  const wideBtn = compact ? 'w-full' : 'w-full sm:w-auto';
  const confirm = (tone) => (
    <button
      type="button"
      className={clsx(tone, BTN, tone === 'btn-good' ? wideBtn : 'w-full sm:w-auto', rescued && 'ring-2 ring-good/40')}
      onClick={() => onResolve(t)}
      disabled={!online}
      title={offline || 'Người dân đã tới nơi an toàn — đóng phiếu'}
    >
      <CheckCircle2 size={13} aria-hidden="true" /> Xác nhận đã cứu
    </button>
  );
  let primary = null;
  if (waiting && canDispatch) {
    primary = (
      <button type="button" className={clsx('btn-primary', BTN, wideBtn)} onClick={() => onDispatch(t)} disabled={!online} title={offline || 'Chọn đội, phương tiện gần nhất và phát lệnh'}>
        <Send size={13} aria-hidden="true" /> Điều đội
      </button>
    );
  } else if (t.status === 'moi' && canUpdate) {
    primary = (
      <button type="button" className={clsx('btn-primary', BTN, wideBtn)} onClick={() => onMove(t, 'dieu_phoi')} disabled={!online} title={offline || 'Đã gọi xác minh — nhận phiếu, chuyển sang "Đang tìm đội" (cấp tỉnh điều đội)'}>
        <Inbox size={13} aria-hidden="true" /> Nhận phiếu
      </button>
    );
  } else if (enRoute) {
    primary = (
      <button type="button" className={clsx('btn-primary', BTN, wideBtn)} onClick={() => onArrived(t)} disabled={!online} title={offline || 'Đội báo qua điện thoại / bộ đàm đã đến hiện trường'}>
        <MapPinCheck size={13} aria-hidden="true" /> Đội đã đến
      </button>
    );
  } else if (doing && canResolve) {
    primary = confirm('btn-good');
  }

  return (
    <article
      draggable={canUpdate && t.status !== 'hoan_thanh'}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)}
      aria-label={`${t.code} — ${INCIDENT[t.incident_type] || t.incident_type}, ${pr.label}${overdue ? ', quá hạn phản hồi' : ''}`}
      className={clsx(
        'card min-w-0 select-none border-l-4 p-3 shadow-sm transition-shadow hover:shadow-md',
        canUpdate && t.status !== 'hoan_thanh' ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
        risk(sosLevel(t.priority)).edge,
        // Quá hạn: viền đỏ cố định, chỉ nhãn 'Quá hạn' nhấp nháy — cả thẻ nhấp nháy thì không đọc được chữ, không bấm chắc tay
        overdue && 'ring-2 ring-danger',
        fresh && 'motion-safe:animate-enter',
      )}
    >
      {/* Xã xin chi viện: dải riêng trên đầu thẻ — trực ban thấy ngay giữa các phiếu người dân báo */}
      {isCommuneSupport(t) && (
        <div className="-mx-3 -mt-3 mb-2 flex items-center gap-1.5 rounded-tr-[11px] bg-danger px-3 py-1.5 text-xs font-bold text-white">
          <HandHelping size={14} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate">Xã xin chi viện{t.admin_name ? ` — ${t.admin_name}` : ''}</span>
        </div>
      )}

      {/* Nhiều nhãn (mức, quá hạn) trên điện thoại 360 px: xuống dòng, không tràn ngang */}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <b className="whitespace-nowrap text-sm font-bold text-ink" title={compact ? `Kênh: ${SOURCE[t.source] || t.source}` : undefined}>{t.code}</b>
        <span className={clsx('chip whitespace-nowrap py-0.5 text-[11px] font-bold', pr.cls)} title={pr.label}>Cấp {t.priority} · {pr.short}</span>
        {overdue && <span className="chip whitespace-nowrap bg-danger py-0.5 text-[11px] font-bold text-white motion-safe:animate-blink">Quá hạn</span>}
        {/* Cột hẹp của bảng 4 cột: bỏ tên kênh (rê lên mã phiếu để xem) — mã, mức, nhãn quá hạn nằm một dòng */}
        <span className={clsx('ml-auto truncate text-[11px] font-medium text-muted', compact && 'hidden')}>{SOURCE[t.source] || t.source}</span>
        {compact && <span className="ml-auto" />}
        {canUpdate && t.status !== 'hoan_thanh' && (
          <button
            type="button"
            className="tap-sq -my-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-panel2 hover:text-accent"
            onClick={() => onEdit(t)}
            title="Sửa mức ưu tiên, số người, nhóm yếu thế"
            aria-label={`Sửa phiếu ${t.code}`}
          >
            <Pencil size={13} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-ink">
        <span>{INCIDENT[t.incident_type] || t.incident_type}</span>
        <span className="font-normal text-muted">·</span>
        <span className={clsx('font-bold', t.trapped_count ? 'text-danger' : 'text-muted')}>{t.trapped_count ?? 0} người</span>
      </div>

      <div className="mt-1 flex items-start gap-1 text-xs text-muted">
        <MapPin size={12} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <span className="line-clamp-2">{t.address || t.admin_name}{t.admin_name && t.address !== t.admin_name ? ` (${t.admin_name})` : ''}</span>
      </div>

      {!!t.vulnerable?.length && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {t.vulnerable.map((v) => <span key={v} className="chip bg-danger/15 text-[11px] font-medium text-danger">{VULNERABLE[v] || v}</span>)}
        </div>
      )}

      {t.raw_message && (
        <p className="mt-1.5 line-clamp-2 rounded-lg border border-line/40 bg-panel2/60 p-1.5 text-xs italic text-ink-2">“{t.raw_message}”</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line/50 pt-2 text-xs">
        {wait && (
          <span
            className={clsx('inline-flex items-center gap-1', overdue ? 'font-bold text-danger' : 'text-ink-2')}
            title={t.status === 'moi'
              ? `Hạn phản hồi cấp ${t.priority}: ${t.sla_minutes} phút kể từ lúc nhận tin`
              : `Chưa có đội nào được điều — hạn cấp ${t.priority}: ${t.sla_minutes} phút kể từ lúc nhận phiếu`}
          >
            <Timer size={13} className={overdue ? 'text-danger' : 'text-muted'} aria-hidden="true" />
            {wait}
          </span>
        )}

        {doing && t.force_name && (
          <div className="w-full space-y-1">
            <div className="flex items-center gap-1 text-xs font-medium text-ink-2">
              <Navigation size={12} className="text-accent" aria-hidden="true" />
              <span className="truncate">{t.force_name}</span>
            </div>
            <div className="flex items-center gap-2" title={estimated ? 'Ước tính theo giờ xuất phát và giờ dự kiến tới (xe, xuồng chưa có định vị)' : undefined}>
              <Progress value={progress} level={arrived ? 0 : undefined} tone="accent" className="flex-1" />
              <span className={clsx('whitespace-nowrap text-[11px] font-semibold', !arrived && etaSec != null && etaSec <= -60 ? 'text-danger' : 'text-ink')}>
                {arrived ? (t.arrived_at ? `Đã đến lúc ${time(t.arrived_at)}` : 'Đã đến') : etaSec != null ? etaText(etaSec) : 'Chưa có giờ dự kiến'}
              </span>
            </div>
            {t.route_safe === false && (
              <div className="flex items-center gap-1 text-[11px] font-semibold text-serious">
                <TriangleAlert size={12} className="shrink-0" aria-hidden="true" /> Đường đi qua vùng nguy hiểm — nhắc đội cẩn trọng
              </div>
            )}
            {needSupport && (
              <div className="rounded-md border border-danger/50 bg-danger/10 px-2 py-1 text-[11px] text-danger [overflow-wrap:anywhere]">
                <b>Đội cần chi viện</b> ({time(t.field_at)}){t.field_note ? `: ${t.field_note}` : ''}
              </div>
            )}
            {rescued && (
              <div className="rounded-md border border-good/50 bg-good/10 px-2 py-1 text-[11px] text-good [overflow-wrap:anywhere]">
                <b>Đội báo đã cứu {t.trapped_count ? `${t.field_people_safe}/${t.trapped_count}` : t.field_people_safe} người</b>{' '}
                ({time(t.field_at)}) — chờ xác nhận{t.field_note ? `: ${t.field_note}` : ''}
              </div>
            )}
          </div>
        )}

        {t.status === 'hoan_thanh' && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-good">
            <CheckCircle2 size={13} aria-hidden="true" /> Đã cứu xong lúc {time(t.resolved_at)}
          </span>
        )}
      </div>

      {/* Nút chính (bước kế tiếp) — điện thoại trọn hàng, vùng ngón cái; rồi các nút phụ */}
      <div className={clsx('mt-2 flex flex-col gap-1.5 no-print', !compact && 'sm:flex-row sm:flex-wrap sm:items-center')}>
        {primary}
        {enRoute && canResolve && confirm('btn-ghost')}
        {needSupport && canDispatch && (
          <button type="button" className={clsx('btn-danger', BTN, 'w-full sm:w-auto')} onClick={() => onDispatch(t)} disabled={!online} title={offline || 'Đội tại hiện trường xin thêm lực lượng'}>
            <LifeBuoy size={13} aria-hidden="true" /> Điều thêm đội
          </button>
        )}
        <div className={clsx('flex flex-wrap items-center gap-1.5', !compact && 'sm:contents')}>
          {t.lat != null && (
            <button type="button" className={clsx('btn-ghost', BTN, compact && 'tap-sq px-2')} onClick={() => onFocus(t)} title="Xem vị trí cứu hộ trên bản đồ" aria-label={`Xem ${t.code} trên bản đồ`}>
              <MapPin size={13} aria-hidden="true" /> {!compact && 'Bản đồ'}
            </button>
          )}
          {t.reporter_phone && (
            <a className={clsx('btn-ghost text-accent', BTN, compact && 'tap-sq px-2')} href={`tel:${t.reporter_phone.replace(/\s/g, '')}`} title={`Gọi người báo tin — ${t.reporter_phone}`} aria-label={`Gọi người báo tin ${t.code}`}>
              <Phone size={13} aria-hidden="true" /> {!compact && 'Gọi'}
            </a>
          )}
          {missionOpen && canDispatch && (
            <>
              <button type="button" className={clsx('btn-ghost', BTN)} onClick={() => onLink(t)} title="Cấp lại link nhiệm vụ cho trưởng nhóm">
                <Link2 size={13} aria-hidden="true" /> Link nhiệm vụ
              </button>
              <button type="button" className={clsx('btn-ghost text-danger', BTN)} onClick={() => onCancel(t)} disabled={!online} title={offline || 'Huỷ lệnh điều động (nhầm đội, đội không tiếp cận được…)'}>
                <Ban size={13} aria-hidden="true" /> Huỷ lệnh
              </button>
            </>
          )}
          {canUpdate && t.status !== 'hoan_thanh' && targets.length > 0 && (
            <select
              className="input tap min-h-[32px] min-w-0 flex-1 py-1 pl-2 text-xs sm:w-auto sm:flex-none"
              value=""
              onChange={(e) => e.target.value && onMove(t, e.target.value)}
              disabled={!online}
              aria-label={`Chuyển phiếu ${t.code} sang bước khác`}
              title={offline || 'Chuyển phiếu sang cột khác (thay cho kéo thả — dùng được trên điện thoại)'}
            >
              <option value="">Chuyển sang…</option>
              {targets.map((c) => <option key={c.key} value={c.key}>{c.title}</option>)}
            </select>
          )}
        </div>
      </div>
    </article>
  );
}
