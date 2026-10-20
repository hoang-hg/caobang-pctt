import clsx from 'clsx';
import { MapPin, Send } from 'lucide-react';
import { SortTh } from '../common/ui';
import { usePermission } from '../../rbac/usePermission';
import { INCIDENT, PRIORITY, SOS_STATUS, SOURCE } from '../../utils/labels';
import { dateTime, time } from '../../utils/format';
import { risk, sosLevel } from '../../utils/risk';
import { etaText, waitText } from './rescueFacts';
import TicketCard from './TicketCard';

const BTN = 'tap inline-flex min-h-[32px] items-center justify-center gap-1 whitespace-nowrap rounded-lg px-2 text-xs font-semibold';

function Row({ t, x, now, pdf, online, onDispatch, onFocus }) {
  const canDispatch = usePermission('dispatch', 'create', t.admin_code);
  const pr = PRIORITY[t.priority] || PRIORITY[2];
  const waiting = t.status === 'moi' || t.status === 'dieu_phoi';
  const etaSec = t.eta ? (new Date(t.eta).getTime() - now) / 1000 : null;
  return (
    <tr className={clsx(x.overdue && 'bg-danger/5')}>
      <td className={clsx('whitespace-nowrap border-l-4', risk(sosLevel(t.priority)).edge)}>
        <b className="num text-ink">{t.code}</b>
        <div className="text-xs text-muted">{SOURCE[t.source] || t.source}</div>
      </td>
      <td><span className={clsx('chip whitespace-nowrap py-0.5 text-[11px] font-bold', pr.cls)} title={pr.label}>Cấp {t.priority} · {pr.short}</span></td>
      <td>
        {INCIDENT[t.incident_type] || t.incident_type}
        <div className={clsx('text-xs font-semibold', t.trapped_count ? 'text-danger' : 'text-muted')}>{t.trapped_count ?? 0} người</div>
      </td>
      <td className="max-w-[16rem]">
        <div className={clsx('text-sm', !pdf && 'line-clamp-2')}>{t.address || t.admin_name}</div>
        {t.admin_name && t.address !== t.admin_name && <div className="text-xs text-muted">{t.admin_name}</div>}
      </td>
      <td className="whitespace-nowrap text-sm">{SOS_STATUS[t.status] || t.status}</td>
      <td className="text-xs">
        {x.sla
          ? <span className={clsx(x.overdue ? 'font-bold text-danger' : 'text-ink-2')} title={`Hạn phản hồi cấp ${t.priority}: ${t.sla_minutes} phút`}>{waitText(t, x.sla)}</span>
          : <span className="text-muted">—</span>}
      </td>
      <td className="whitespace-nowrap text-xs">{dateTime(t.received_at)}</td>
      <td className="text-xs">
        {t.force_name ? (
          <>
            <div className="max-w-[12rem] truncate">{t.force_name}</div>
            <div className="text-muted">
              {t.status === 'hoan_thanh' ? `cứu xong lúc ${time(t.resolved_at)}` : t.dispatch_status === 'da_den' ? (t.arrived_at ? `đã đến lúc ${time(t.arrived_at)}` : 'đã đến') : etaSec != null ? etaText(etaSec).toLowerCase() : ''}
            </div>
          </>
        ) : <span className="text-muted">Chưa có đội</span>}
      </td>
      {!pdf && (
        <td className="no-print whitespace-nowrap">
          <div className="flex justify-end gap-1">
            {waiting && canDispatch && (
              <button type="button" className={clsx('btn-primary', BTN)} onClick={() => onDispatch(t)} disabled={!online} title={!online ? 'Mất mạng — chưa ghi được' : 'Chọn đội, phương tiện gần nhất và phát lệnh'}>
                <Send size={12} aria-hidden="true" /> Điều đội
              </button>
            )}
            {t.lat != null && (
              <button type="button" className={clsx('btn-ghost tap-sq px-2', BTN)} onClick={() => onFocus(t)} title="Xem trên Bản đồ giám sát" aria-label={`Xem ${t.code} trên bản đồ`}>
                <MapPin size={13} aria-hidden="true" />
              </button>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}

/**
 * Chế độ "Danh sách" của Điều hành cứu hộ: mọi phiếu đang lọc (mọi trạng thái) để rà soát và lập báo cáo — máy tính: bảng
 * (bấm tiêu đề cột để xếp), dòng quá hạn phản hồi nền đỏ nhạt; điện thoại, iPad dọc: thẻ phiếu như bảng điều phối. Phân trang,
 * xuất Excel / PDF làm ở trang (mọi dòng đang lọc, không chỉ trang đang xem). `pdf`: bảng đủ cột, bỏ nút.
 */
export default function TicketTable({ rows, asTable, pdf, sort, onSort, factsOf, now, cardProps }) {
  if (!asTable) {
    return <div className="grid gap-2.5 md:grid-cols-2">{rows.map((t) => <TicketCard key={t.id} t={t} x={factsOf(t)} fresh={!!cardProps.isNew?.(t.id)} {...cardProps} />)}</div>;
  }
  return (
    <div className="card overflow-x-auto">
      <table className="table-base">
        <caption className="sr-only">Phiếu cứu hộ — {rows.length} phiếu</caption>
        <thead>
          <tr>
            <th scope="col">Phiếu</th>
            <SortTh k="uu_tien" sort={sort} onSort={onSort} pdf={pdf}>Mức</SortTh>
            <SortTh k="nhieu_nguoi" dir="descending" sort={sort} onSort={onSort} pdf={pdf}>Sự cố · người</SortTh>
            <th scope="col">Địa điểm</th>
            <th scope="col">Bước</th>
            <SortTh k="cho_lau" dir="descending" sort={sort} onSort={onSort} pdf={pdf}>Thời gian chờ</SortTh>
            <SortTh k="moi_nhat" dir="descending" sort={sort} onSort={onSort} pdf={pdf}>Nhận lúc</SortTh>
            <th scope="col">Đội · giờ tới</th>
            {!pdf && <th scope="col" className="no-print"><span className="sr-only">Thao tác</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => <Row key={t.id} t={t} x={factsOf(t)} now={now} pdf={pdf} online={cardProps.online} onDispatch={cardProps.onDispatch} onFocus={cardProps.onFocus} />)}
        </tbody>
      </table>
    </div>
  );
}
