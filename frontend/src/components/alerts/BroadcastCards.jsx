import clsx from 'clsx';
import { BellOff, Clock, CornerUpLeft, MapPin, Radio, Send, ShieldCheck, TimerReset, Users } from 'lucide-react';
import { CHANNEL, LEVEL, broadcastStatus, notIntegrated } from '../../utils/labels';
import { dateTime, int, pct, time } from '../../utils/format';
import { risk } from '../../utils/risk';
import { CHANNEL_SHORT, LONG_WAIT_MIN, SEVERITY_LEVEL, leftText, waitText } from './alertFacts';

const BTN = 'tap inline-flex min-h-[36px] items-center justify-center gap-1.5 px-3 text-xs font-semibold';
const OFFLINE = 'Mất mạng — chưa thực hiện được';
// Đơn vị người nhận của từng kênh (kết quả gửi viết thành câu)
const REACH_UNIT = { SMS: 'thuê bao', CELL_BROADCAST: 'máy trong vùng', ZALO_OA: 'người theo dõi', PUSH: 'máy cài ứng dụng', LOA: 'loa' };

/** Mã · mức · trạng thái · (máy đề xuất) · giờ — xuống hàng gọn trên điện thoại, không vỡ chữ trong chip. */
function Head({ b, status = true, pending = false, at }) {
  const sev = LEVEL[b.severity];
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <b className="num whitespace-nowrap text-sm">{b.code}</b>
      {sev && <span className={clsx('chip whitespace-nowrap', sev.cls)}>{sev.label}</span>}
      {status && <span className={clsx('chip whitespace-nowrap', broadcastStatus(b).cls)}>{broadcastStatus(b).label}</span>}
      {/* Bản nháp hệ thống tự sinh từ cảm biến / dự báo vượt ngưỡng (thiết kế E.2) — không bao giờ tự phát */}
      {b.auto_generated && (
        <span className="chip whitespace-nowrap border border-warn bg-warn/20 text-ink" title={b.trigger_source ? `Nguồn: ${b.trigger_source}` : undefined}>
          {pending ? 'Máy đề xuất — cần người duyệt' : 'Máy đề xuất'}
        </span>
      )}
      {at && <span className="ml-auto whitespace-nowrap text-[11px] text-muted">{at}</span>}
    </div>
  );
}

/** Hộ · xã · kênh (tên ngắn) — một dòng chữ nhỏ, xuống hàng khi hẹp. */
function Meta({ b, extra }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
      <span className="inline-flex items-center gap-1"><Users size={12} aria-hidden="true" /> {int(b.audience?.households)} hộ</span>
      <span className="inline-flex items-center gap-1"><MapPin size={12} aria-hidden="true" /> {b.target_geom && !b.target_admin_codes?.length ? 'vùng vẽ' : `${b.target_admin_codes?.length || 0} xã`}</span>
      <span className="inline-flex min-w-0 items-center gap-1"><Radio size={12} aria-hidden="true" /> <span className="[overflow-wrap:anywhere]">{(b.channels || []).map((c) => CHANNEL_SHORT[c] || c).join(' · ')}</span></span>
      {extra}
    </div>
  );
}

/**
 * Lệnh chờ duyệt (thiết kế E.4 — người soạn / người duyệt). Tin xem trước đúng như người dân nhận (khung tin nhắn), vùng nhận
 * (tên xã), số hộ, kênh; lãnh đạo có quyền: "Duyệt bằng PIN" (nút chính) và "Trả lại" kèm lý do — trọn hàng trên điện thoại.
 * Người soạn / không có quyền thấy lý do vì sao chưa duyệt được. `unitName(code)` → tên xã.
 */
export function PendingCard({ b, x, me, online, onApprove, unitName = (c) => c, fresh = false }) {
  const names = (b.target_admin_codes || []).map(unitName);
  return (
    <article
      className={clsx('card min-w-0 border-l-4 p-3', risk(SEVERITY_LEVEL[b.severity]).edge, x.waitedMin >= LONG_WAIT_MIN && 'ring-2 ring-danger', fresh && 'motion-safe:animate-enter')}
      aria-label={`${b.code} — ${LEVEL[b.severity]?.label}, chờ duyệt ${waitText(x.waitedMin)}`}
    >
      <Head b={b} status={false} pending at={dateTime(b.created_at)} />
      <h3 className="mt-1 text-sm font-semibold text-ink [overflow-wrap:anywhere]">{b.title}</h3>
      {/* Xem trước như tin người dân nhận trên điện thoại */}
      <div className="mt-1.5 rounded-xl rounded-tl-sm bg-panel2 px-3 py-2 text-xs leading-relaxed text-ink [overflow-wrap:anywhere]">
        <span className="line-clamp-4 whitespace-pre-wrap">{b.message_body}</span>
      </div>
      {names.length > 0 && (
        <p className="mt-1.5 text-xs text-ink-2 [overflow-wrap:anywhere]">
          <b className="font-semibold">Vùng nhận:</b> {names.length} xã/phường — {names.slice(0, 5).join(', ')}{names.length > 5 ? '…' : ''}
        </p>
      )}
      <Meta
        b={b}
        extra={(
          <span className={clsx('inline-flex items-center gap-1', x.waitedMin >= LONG_WAIT_MIN && 'font-semibold text-danger')}>
            <Clock size={12} aria-hidden="true" /> chờ {waitText(x.waitedMin)} · soạn: {b.created_by_name || 'hệ thống (máy đề xuất)'}
          </span>
        )}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {b.can_approve ? (
          <>
            <button
              type="button"
              className={clsx('btn-danger w-full sm:w-auto', BTN)}
              onClick={() => onApprove(b, 'approve')}
              disabled={!online}
              title={!online ? OFFLINE : 'Đọc lại tin, ký duyệt bằng mã PIN — tin phát tới người dân ngay'}
            >
              <ShieldCheck size={15} aria-hidden="true" /> Duyệt bằng PIN
            </button>
            <button
              type="button"
              className={clsx('btn-secondary w-full sm:w-auto', BTN)}
              onClick={() => onApprove(b, 'reject')}
              disabled={!online}
              title={!online ? OFFLINE : 'Chưa đồng ý — trả lại người soạn kèm lý do để sửa'}
            >
              <CornerUpLeft size={15} aria-hidden="true" /> Trả lại
            </button>
          </>
        ) : (
          <span className="text-[11px] italic text-muted">
            {b.created_by === me ? 'Lệnh bạn soạn — chờ lãnh đạo khác duyệt (người soạn không tự duyệt)' : 'Chờ lãnh đạo Ban Chỉ huy ký duyệt'}
          </span>
        )}
      </div>
    </article>
  );
}

/**
 * Kết quả gửi theo kênh, viết thành câu ("Đã tới 97% thuê bao (4.850/5.000) · 80% đã xem", "26/27 loa đã phát"). Kênh chưa
 * nối cổng gửi tin → ghi rõ "chưa gửi được qua kênh này", không bao giờ giả "đã gửi".
 */
export function Delivery({ b }) {
  const m = b.metrics || {};
  const chans = Object.entries(m);
  if (!chans.length) return null;
  const off = notIntegrated(b);
  return (
    <div className="flex flex-col gap-1.5">
      {off && (
        <p className="rounded-lg border border-dashed border-warn/70 bg-warn/10 p-2 text-xs text-ink-2">
          <b className="text-ink">Chưa gửi tới điện thoại người dân qua các kênh dưới đây.</b> Lệnh đã công bố trên cổng thông tin
          cho người dân và bản nhẹ — phát thêm qua loa, nhà mạng, Zalo của tỉnh theo quy trình hiện hành.
        </p>
      )}
      {chans.map(([ch, v]) => {
        const name = CHANNEL[ch] || ch;
        if (v?.integrated === false) {
          return (
            <div key={ch} className="flex flex-wrap justify-between gap-x-2 text-xs">
              <span className="font-medium">{name}</span>
              <span className="font-semibold text-serious">chưa gửi được qua kênh này</span>
            </div>
          );
        }
        const said = ch === 'LOA'
          ? `${int(v.delivered)}/${int(v.target)} loa đã phát`
          : `Đã tới ${pct(v.delivered, v.target)}% ${REACH_UNIT[ch] || 'người nhận'} (${int(v.delivered)}/${int(v.target)})`;
        return (
          <div key={ch} className="text-xs">
            <div className="flex flex-wrap justify-between gap-x-2">
              <span className="font-medium">{name}</span>
              <span className="text-ink-2">{said}{v.read != null ? ` · ${pct(v.read, v.target)}% đã xem` : ''}</span>
            </div>
            <div className="relative mt-0.5 h-2 overflow-hidden rounded-full bg-panel2" role="img" aria-label={`${name}: ${said}`}>
              <div className="absolute inset-y-0 left-0 bg-accent/35" style={{ width: `${pct(v.sent, v.target)}%` }} />
              <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${pct(v.delivered, v.target)}%` }} />
              {v.read != null && <div className="absolute inset-y-0 left-0 bg-good" style={{ width: `${pct(v.read, v.target)}%` }} />}
            </div>
          </div>
        );
      })}
      {chans.some(([, v]) => v?.integrated !== false) && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent/35" />Đã gửi đi</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent" />Đã tới máy</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-good" />Đã xem (Zalo, ứng dụng)</span>
        </div>
      )}
    </div>
  );
}

/** Cảnh báo đã duyệt: thời hạn (sắp hết → nhắc gia hạn, đếm ngược), gia hạn / kết thúc (người duyệt có PIN), kết quả gửi. */
export function LiveCard({ b, x, online, onManage, fresh = false }) {
  return (
    <article
      className={clsx('card min-w-0 border-l-4 p-3', risk(SEVERITY_LEVEL[b.severity]).edge, x.soon && 'ring-2 ring-serious', fresh && 'motion-safe:animate-enter')}
      aria-label={`${b.code} — ${LEVEL[b.severity]?.label}, ${broadcastStatus(b).label}${x.soon ? ', sắp hết hiệu lực' : ''}`}
    >
      <Head b={b} at={dateTime(b.sent_at || b.approved_at)} />
      <h3 className="mt-1 text-sm font-semibold text-ink [overflow-wrap:anywhere]">{b.title}</h3>
      <div className="mt-1 text-xs">
        {b.ended_at ? (
          <span className="text-muted">
            Kết thúc {dateTime(b.ended_at)}{b.ended_by_name ? ` — ${b.ended_by_name}` : ''}{b.end_note ? `: ${b.end_note}` : ''}
          </span>
        ) : x.soon ? (
          <span className="font-semibold text-serious">
            <TimerReset size={13} className="mr-1 inline" aria-hidden="true" />
            Hết hiệu lực lúc {time(b.valid_until)} (còn {leftText(x.left)}) — gia hạn nếu còn nguy hiểm
          </span>
        ) : x.live ? (
          <span className="font-medium text-ink-2">Hiệu lực đến {dateTime(b.valid_until)} · đang hiện cho người dân</span>
        ) : (
          <span className="text-muted">Hết hiệu lực từ {dateTime(b.valid_until)}</span>
        )}
      </div>
      <Meta b={b} extra={<span>duyệt: {b.approved_by_name || '—'} · soạn: {b.created_by_name || 'hệ thống'}</span>} />
      {b.can_manage && (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:flex">
          <button
            type="button"
            className={clsx(x.soon ? 'btn-primary' : 'btn-ghost', BTN)}
            onClick={() => onManage({ b, mode: 'extend' })}
            disabled={!online}
            title={!online ? OFFLINE : 'Gia hạn thêm khi thiên tai còn kéo dài (ký PIN)'}
          >
            <TimerReset size={14} aria-hidden="true" /> Gia hạn
          </button>
          <button
            type="button"
            className={clsx('btn-ghost text-danger', BTN)}
            onClick={() => onManage({ b, mode: 'end' })}
            disabled={!online}
            title={!online ? OFFLINE : 'Kết thúc sớm khi hết nguy hiểm (ký PIN)'}
          >
            <BellOff size={14} aria-hidden="true" /> Kết thúc
          </button>
        </div>
      )}
      <div className="mt-2.5"><Delivery b={b} /></div>
    </article>
  );
}

/** Lệnh bị trả lại: lý do của lãnh đạo; người soạn bấm "Soạn lại" để điền lại form. */
export function RejectedCard({ b, mine, onRedraft }) {
  return (
    <article className={clsx('card min-w-0 p-3', mine ? 'border-danger/50 bg-danger/5' : '')} aria-label={`${b.code} — bị trả lại`}>
      <Head b={b} at={dateTime(b.approved_at)} />
      <h3 className="mt-1 text-sm font-semibold text-ink [overflow-wrap:anywhere]">{b.title}</h3>
      <p className="mt-1 text-xs text-ink-2 [overflow-wrap:anywhere]">
        <b>{b.approved_by_name || 'Lãnh đạo'}</b> trả lại: {b.rejected_reason}
      </p>
      {mine && <span className="chip mt-1.5 bg-danger/15 text-danger">Lệnh bạn soạn</span>}
      {onRedraft && (
        <button type="button" className={clsx('btn-ghost mt-2 w-full sm:w-auto', BTN)} onClick={() => onRedraft(b)}>
          <Send size={13} aria-hidden="true" /> Soạn lại từ lệnh này
        </button>
      )}
    </article>
  );
}
