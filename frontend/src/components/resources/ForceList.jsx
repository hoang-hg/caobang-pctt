import clsx from 'clsx';
import { ArrowUpDown, MapPin, Phone, Radio, Send, UserRound } from 'lucide-react';
import { StatusDot } from '../common/ui';
import { FORCE_TYPE, RES_STATUS, SKILL } from '../../utils/labels';
import { int } from '../../utils/format';
import { forceLevelLabel } from './resourceFacts';

const tel = (phone) => `tel:${String(phone).replace(/\s/g, '')}`;
const BTN = 'tap inline-flex min-h-[36px] whitespace-nowrap items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold';

/** Tình trạng (thiết kế C: xanh sẵn sàng · vàng nhiệm vụ · đỏ bảo dưỡng) — chấm màu kèm chữ, không chỉ dựa vào màu. */
export const StatusChip = ({ status }) => (
  <span className="chip shrink-0 border border-line bg-panel2 text-ink-2">
    <StatusDot cls={RES_STATUS[status]?.dot || 'bg-line'} />
    {RES_STATUS[status]?.label || status}
  </span>
);

/** Quân số: vạch xanh = sẵn sàng, vàng = đang làm nhiệm vụ, phần xám còn lại = chưa sẵn sàng. */
function Strength({ f }) {
  const total = Math.max(1, f.personnel_total);
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-panel2" aria-hidden="true">
      <div className="bg-good" style={{ width: `${(100 * f.personnel_ready) / total}%` }} />
      <div className="bg-warn" style={{ width: `${(100 * f.personnel_on_mission) / total}%` }} />
    </div>
  );
}

/** Tiêu đề cột bấm được để xếp (bảng máy tính) — chọn cùng cách xếp với ô "Xếp" của thanh lọc. */
export function SortTh({ k, dir = 'ascending', sort, onSort, pdf, children, className }) {
  if (!k || pdf) return <th scope="col" className={className}>{children}</th>;
  return (
    <th scope="col" className={className} aria-sort={sort === k ? dir : undefined}>
      <button type="button" className="tap inline-flex items-center gap-1 uppercase hover:text-ink" onClick={() => onSort(k)} title="Xếp theo cột này">
        {children}
        <ArrowUpDown size={11} className={sort === k ? 'text-accent' : 'opacity-40'} aria-hidden="true" />
      </button>
    </th>
  );
}

/**
 * Danh sách lực lượng (thiết kế C.1): tên, quân số tổng / sẵn sàng / nhiệm vụ, nơi đóng quân, chỉ huy + số điện thoại, kỹ
 * năng đặc thù, "Điều động nhanh" (chỉ tài khoản được ra lệnh điều động — backend kiểm tra lại). Máy tính: bảng; điện thoại,
 * iPad dọc: thẻ, nút gọi / bản đồ / điều động ≥ 44 px. `pdf`: bảng đủ cột, bỏ nút.
 */
export default function ForceList({ rows, asTable, pdf, sort, onSort, canDispatch, online, onDispatch, onMap }) {
  const dispatchBtn = (f, big) => (
    <button
      type="button"
      className={clsx('btn-primary', BTN, big && 'flex-1')}
      disabled={f.personnel_ready < 1 || !online}
      title={!online ? 'Mất mạng — chưa ra lệnh được' : f.personnel_ready < 1 ? 'Đơn vị không còn quân số sẵn sàng' : 'Chọn phiếu SOS cần đến, phát lệnh điều động'}
      onClick={() => onDispatch(f)}
    >
      <Send size={13} aria-hidden="true" /> {big ? 'Điều động' : 'Điều động nhanh'}
    </button>
  );

  if (asTable) {
    const actions = canDispatch && !pdf;
    return (
      <div className="card overflow-x-auto">
        <table className="table-base">
          <caption className="sr-only">Lực lượng cứu hộ — {rows.length} đơn vị</caption>
          <thead>
            <tr>
              <SortTh k="ten" sort={sort} onSort={onSort} pdf={pdf}>Đơn vị</SortTh>
              <SortTh k="san_sang" dir="descending" sort={sort} onSort={onSort} pdf={pdf}>Quân số</SortTh>
              <th scope="col">Vị trí đóng quân</th>
              <th scope="col">Chỉ huy & liên lạc</th>
              <th scope="col">Kỹ năng đặc thù</th>
              {actions && <th scope="col" className="no-print"><span className="sr-only">Thao tác</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.id}>
                <td>
                  <div className="flex items-center gap-2 font-medium"><StatusDot cls={RES_STATUS[f.status]?.dot} />{f.name}</div>
                  <div className="text-xs text-muted">
                    {FORCE_TYPE[f.org_type]} · {forceLevelLabel(f.level).toLowerCase()} · {f.vehicle_count} phương tiện · {RES_STATUS[f.status]?.label}
                  </div>
                </td>
                <td className="w-40 whitespace-nowrap">
                  <div className="font-mono text-sm"><b className="text-good">{int(f.personnel_ready)}</b> / {int(f.personnel_total)}</div>
                  <Strength f={f} />
                  <div className="mt-0.5 text-[11px] text-muted">sẵn sàng / tổng · {int(f.personnel_on_mission)} nhiệm vụ</div>
                </td>
                <td>
                  <div className="text-sm">{f.base_name}</div>
                  {f.lat != null && (
                    <button type="button" className="tap no-print inline-flex items-center gap-1 text-xs text-accent hover:underline" onClick={() => onMap(f.lat, f.lon, f.name)}>
                      <MapPin size={12} aria-hidden="true" /> Xem trên bản đồ
                    </button>
                  )}
                </td>
                <td className="text-sm">
                  <div>{f.commander}</div>
                  {f.contact_phone && (
                    <a href={tel(f.contact_phone)} className="tap inline-flex items-center gap-1 text-accent hover:underline"><Phone size={12} aria-hidden="true" />{f.contact_phone}</a>
                  )}
                  {f.radio_freq && <div className="flex items-center gap-1 text-xs text-muted"><Radio size={11} aria-hidden="true" /> {f.radio_freq}</div>}
                </td>
                <td>
                  <div className="flex max-w-[16rem] flex-wrap gap-1">
                    {(f.skills || []).map((sk) => <span key={sk} className="chip bg-panel2 text-ink-2">{SKILL[sk] || sk}</span>)}
                  </div>
                </td>
                {actions && <td className="no-print whitespace-nowrap">{dispatchBtn(f, false)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <ul className="grid gap-2 md:grid-cols-2" aria-label="Lực lượng cứu hộ">
      {rows.map((f) => (
        <li key={f.id} className="card flex flex-col gap-2 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <b className="block leading-snug text-ink">{f.name}</b>
              <span className="block text-xs text-muted">{FORCE_TYPE[f.org_type]} · {forceLevelLabel(f.level).toLowerCase()} · {f.vehicle_count} phương tiện</span>
            </div>
            <StatusChip status={f.status} />
          </div>
          <div className="text-xs">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-muted">Quân số</span>
              <span className="font-mono">
                <b className="text-sm text-good">{int(f.personnel_ready)}</b> sẵn sàng / {int(f.personnel_total)}
                {f.personnel_on_mission > 0 && <> · <b className="text-warn">{int(f.personnel_on_mission)}</b> nhiệm vụ</>}
              </span>
            </div>
            <Strength f={f} />
          </div>
          <div className="flex flex-col gap-1 text-xs text-ink-2">
            {f.base_name && <span className="flex items-start gap-1.5"><MapPin size={13} className="mt-px shrink-0 text-muted" aria-hidden="true" />{f.base_name}</span>}
            {f.commander && (
              <span className="flex items-start gap-1.5">
                <UserRound size={13} className="mt-px shrink-0 text-muted" aria-hidden="true" />
                <span>{f.commander}{f.radio_freq && <span className="text-muted"> · bộ đàm {f.radio_freq}</span>}</span>
              </span>
            )}
          </div>
          {f.skills?.length > 0 && (
            <div className="flex flex-wrap gap-1">{f.skills.map((sk) => <span key={sk} className="chip bg-panel2 text-ink-2">{SKILL[sk] || sk}</span>)}</div>
          )}
          <div className="mt-auto flex gap-2 pt-1 no-print">
            {f.contact_phone && (
              <a href={tel(f.contact_phone)} className={clsx('btn-ghost flex-1', BTN)} title={`Gọi ${f.commander || 'chỉ huy'} — ${f.contact_phone}`}>
                <Phone size={13} aria-hidden="true" /> Gọi
              </a>
            )}
            {f.lat != null && (
              <button type="button" className={clsx('btn-ghost flex-1', BTN)} onClick={() => onMap(f.lat, f.lon, f.name)}>
                <MapPin size={13} aria-hidden="true" /> Bản đồ
              </button>
            )}
            {canDispatch && dispatchBtn(f, true)}
          </div>
        </li>
      ))}
    </ul>
  );
}
