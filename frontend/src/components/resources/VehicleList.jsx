import clsx from 'clsx';
import { MapContainer, Marker, Popup } from 'react-leaflet';
import { Fuel, MapPin, Pencil, Phone, Wrench } from 'lucide-react';
import { EmptyState, ErrorState, Progress, Section, Skeleton, SortTh, StatusDot } from '../common/ui';
import { BaseLayer, MapResize } from '../map/MapTools';
import { vehicleIcon } from '../map/icons';
import { Can, usePermission } from '../../rbac/usePermission';
import { RES_STATUS, VEHICLE, VEHICLE_CAT } from '../../utils/labels';
import { dateTime, int, time } from '../../utils/format';
import { STOCK_LOW, stockLevel } from '../../utils/risk';
import { StatusChip } from './ForceList';
import { depotPct } from './resourceFacts';

const BTN = 'tap inline-flex min-h-[36px] whitespace-nowrap items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold';
const tel = (phone) => `tel:${String(phone).replace(/\s/g, '')}`;

/** Trạng thái + nhiệm vụ: chưa có GPS nên không vẽ thanh tiến độ giả — ghi đang đến (ETA) / đã đến (trực ban ghi khi đội báo). */
function StatusText({ v }) {
  return (
    <>
      <div className="flex items-center gap-1.5 text-sm">
        {v.status === 'bao_duong' ? <Wrench size={13} className="shrink-0 text-danger" aria-hidden="true" /> : <StatusDot cls={RES_STATUS[v.status]?.dot} />}
        {RES_STATUS[v.status]?.label || v.status}
      </div>
      {v.status === 'nhiem_vu' && v.mission_code && (
        <div className="mt-0.5 text-xs text-muted">
          {v.mission_code} · {v.mission_status === 'da_den' ? `đã đến lúc ${time(v.mission_arrived_at)}` : `đang đến, ETA ${time(v.mission_eta)}`}
        </div>
      )}
      {v.status === 'bao_duong' && v.status_note && <div className="mt-0.5 text-xs text-muted">{v.status_note}</div>}
    </>
  );
}

/** Nhiên liệu theo thang chung: dưới 20 % Đỏ (không được gợi ý điều động), dưới 50 % Vàng; chưa ai báo → Xám, không ghi số giả. */
function FuelBar({ v }) {
  if (v.fuel_level == null) {
    return <div className="flex items-center gap-1 text-xs text-muted" title="Chưa ai báo mức nhiên liệu"><Fuel size={12} aria-hidden="true" /> Chưa báo nhiên liệu</div>;
  }
  const lv = stockLevel(v.fuel_level);
  return (
    <div title={v.fuel_updated_at ? `Báo lúc ${dateTime(v.fuel_updated_at)}` : undefined}>
      <div className={clsx('flex items-center gap-1 text-xs', lv === 3 && 'font-bold text-danger')}>
        <Fuel size={12} aria-hidden="true" /> {v.fuel_level}%{lv === 3 && <span className="font-semibold"> · không gợi ý điều động</span>}
      </div>
      <Progress className="mt-1" value={v.fuel_level} level={lv} />
    </div>
  );
}

/**
 * Phương tiện & trang thiết bị (thiết kế C.3): nhóm đường thủy / đường bộ / thiết bị, trạng thái (xanh sẵn sàng · vàng nhiệm
 * vụ + mã phiếu, ETA · đỏ hỏng / bảo dưỡng + lý do), vạch nhiên liệu. "Báo tình trạng" chỉ với tài khoản có quyền ở xã của
 * đơn vị quản lý. Máy tính: bảng; điện thoại, iPad dọc: thẻ, nút ≥ 44 px.
 */
export default function VehicleList({ rows, asTable, pdf, sort, onSort, online, onEdit, onMap }) {
  if (asTable) {
    const editBtn = (v) => (
      <Can I="vehicle" a="update" scope={v.admin_code}>
        <button type="button" className={clsx('btn-ghost', BTN)} onClick={() => onEdit(v)} disabled={!online} title={!online ? 'Mất mạng — chưa ghi được' : 'Báo tình trạng, mức nhiên liệu'}>
          <Pencil size={13} aria-hidden="true" /> Cập nhật
        </button>
      </Can>
    );
    return (
      <div className="card overflow-x-auto">
        <table className="table-base">
          <caption className="sr-only">Phương tiện, trang thiết bị — {rows.length} chiếc</caption>
          <thead>
            <tr>
              <SortTh k="so_hieu" sort={sort} onSort={onSort} pdf={pdf}>Số hiệu</SortTh>
              <SortTh k="mac_dinh" sort={sort} onSort={onSort} pdf={pdf}>Loại · nhóm</SortTh>
              <th scope="col">Đơn vị quản lý</th>
              <SortTh k="tinh_trang" sort={sort} onSort={onSort} pdf={pdf}>Trạng thái</SortTh>
              <SortTh k="nhien_lieu" sort={sort} onSort={onSort} pdf={pdf}>Nhiên liệu</SortTh>
              {!pdf && <th scope="col" className="no-print"><span className="sr-only">Thao tác</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id}>
                <td className="whitespace-nowrap font-mono font-semibold">{v.code}</td>
                <td>
                  {VEHICLE[v.vehicle_type] || v.vehicle_type}{v.capacity ? <span className="text-xs text-muted"> · {v.capacity} chỗ</span> : ''}
                  <div className="text-xs text-muted">{VEHICLE_CAT[v.category]}</div>
                </td>
                <td className="text-sm">
                  {v.force_name}
                  {v.contact_phone && <a href={tel(v.contact_phone)} className="tap flex items-center gap-1 text-xs text-accent hover:underline"><Phone size={11} aria-hidden="true" />{v.contact_phone}</a>}
                </td>
                <td><StatusText v={v} /></td>
                <td className="w-40"><FuelBar v={v} /></td>
                {!pdf && (
                  <td className="no-print whitespace-nowrap">
                    <div className="flex justify-end gap-1">
                      {editBtn(v)}
                      {v.lat != null && (
                        <button type="button" className={clsx('btn-ghost tap-sq', BTN, 'px-2')} onClick={() => onMap(v.lat, v.lon, v.code)} title="Xem trên Bản đồ giám sát" aria-label={`Xem ${v.code} trên bản đồ`}>
                          <MapPin size={14} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <ul className="grid gap-2 md:grid-cols-2" aria-label="Phương tiện, trang thiết bị">
      {rows.map((v) => <VehicleCard key={v.id} v={v} online={online} onEdit={onEdit} onMap={onMap} />)}
    </ul>
  );
}

/** Thẻ một phương tiện (điện thoại, iPad dọc). Có nút "Báo tình trạng" thì Gọi, Bản đồ chỉ còn biểu tượng trên điện thoại. */
function VehicleCard({ v, online, onEdit, onMap }) {
  const canEdit = usePermission('vehicle', 'update', v.admin_code);
  const side = clsx('btn-ghost flex-1', BTN, canEdit && 'tap-sq max-sm:w-11 max-sm:flex-none max-sm:px-0');
  return (
    <li className="card flex flex-col gap-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <b className="font-mono text-ink">{v.code}</b>{' '}
          <span className="text-sm">{VEHICLE[v.vehicle_type] || v.vehicle_type}</span>
          {v.capacity ? <span className="text-xs text-muted"> · {v.capacity} chỗ</span> : null}
          <span className="block text-xs text-muted">{VEHICLE_CAT[v.category]} · {v.force_name}</span>
        </div>
        <StatusChip status={v.status} />
      </div>
      {(v.mission_code || (v.status === 'bao_duong' && v.status_note)) && (
        <div className="text-xs text-muted">
          {v.status === 'nhiem_vu' && v.mission_code
            ? `${v.mission_code} · ${v.mission_status === 'da_den' ? `đã đến lúc ${time(v.mission_arrived_at)}` : `đang đến, ETA ${time(v.mission_eta)}`}`
            : v.status_note}
        </div>
      )}
      <FuelBar v={v} />
      <div className="mt-auto flex gap-2 pt-1 no-print">
        {canEdit && (
          <button type="button" className={clsx('btn-ghost flex-1', BTN)} onClick={() => onEdit(v)} disabled={!online} title={!online ? 'Mất mạng — chưa ghi được' : 'Báo tình trạng, mức nhiên liệu'}>
            <Pencil size={13} aria-hidden="true" /> Báo tình trạng
          </button>
        )}
        {v.contact_phone && (
          <a href={tel(v.contact_phone)} className={side} title={`Gọi đơn vị quản lý — ${v.contact_phone}`} aria-label={`Gọi đơn vị quản lý ${v.code}`}>
            <Phone size={13} aria-hidden="true" /> <span className={clsx(canEdit && 'max-sm:hidden')}>Gọi</span>
          </a>
        )}
        {v.lat != null && (
          <button type="button" className={side} onClick={() => onMap(v.lat, v.lon, v.code)} aria-label={`Xem ${v.code} trên bản đồ`}>
            <MapPin size={13} aria-hidden="true" /> <span className={clsx(canEdit && 'max-sm:hidden')}>Bản đồ</span>
          </button>
        )}
      </div>
    </li>
  );
}

/** Vị trí phương tiện (đúng danh sách đang lọc) — bản đồ nhỏ trong thẻ Phương tiện (thiết kế C.3). */
export function VehicleMap({ rows, className }) {
  const located = rows.filter((v) => v.lat != null);
  return (
    <Section title="Vị trí phương tiện" right={<span className="text-[11px] text-muted">{located.length}/{rows.length} có vị trí</span>} bodyClass="pb-3" className={className}>
      <div className="h-56 overflow-hidden rounded-lg sm:h-72">
        <MapContainer center={[22.75, 106.05]} zoom={8} className="h-full w-full" scrollWheelZoom={false}>
          <BaseLayer basemap="auto" />
          <MapResize />
          {located.map((v) => (
            <Marker key={v.id} position={[v.lat, v.lon]} icon={vehicleIcon(v)}>
              <Popup><b>{v.code}</b> {VEHICLE[v.vehicle_type]}<br />{v.force_name}<br />{RES_STATUS[v.status]?.label}</Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </Section>
  );
}

/** Nhiên liệu dự trữ ở các điểm cấp (thiết kế C.3 — quản lý nhiên liệu): thanh theo thang chung so với sức chứa. */
export function FuelDepots({ query, online, onEdit, className }) {
  const depots = query.data || [];
  return (
    <Section id="nhien-lieu-du-tru" title="Nhiên liệu dự trữ" className={clsx('scroll-mt-20', className)}>
      {query.isLoading ? <Skeleton height={120} />
        : query.isError && !query.data ? <ErrorState height={120} onRetry={query.refetch}>Không tải được điểm cấp nhiên liệu</ErrorState>
          : !depots.length ? <EmptyState height={96}>Chưa có điểm cấp nhiên liệu trong vùng — nhập bằng loại dữ liệu “Điểm cấp nhiên liệu”</EmptyState>
            : (
              <ul className="flex flex-col divide-y divide-line/60">
                {depots.map((d) => {
                  const p = depotPct(d);
                  const lv = stockLevel(p);
                  return (
                    <li key={d.id} className="py-2 text-sm">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0">{d.name}</span>
                        <span className={clsx('shrink-0 font-mono text-xs', lv === 3 && 'font-bold text-danger')}>{int((d.gasoline_l || 0) + (d.diesel_l || 0))} / {int(d.capacity_l)} L</span>
                      </div>
                      <Progress className="my-1" value={p ?? 0} level={lv} />
                      <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                        <span>Xăng {int(d.gasoline_l)} L · Dầu {int(d.diesel_l)} L</span>
                        <span>{d.updated_at ? `cập nhật ${dateTime(d.updated_at)}` : 'theo tệp nhập'}</span>
                        {lv === 3 && <span className="font-semibold text-danger">dưới {STOCK_LOW}% sức chứa</span>}
                        <Can I="inventory" a="receive" scope={d.admin_code}>
                          <button type="button" className="btn-ghost tap ml-auto min-h-[32px] px-2.5 py-0.5 text-xs no-print" onClick={() => onEdit(d)} disabled={!online} title={!online ? 'Mất mạng — chưa ghi được' : 'Cập nhật lượng xăng, dầu dự trữ'}>
                            <Pencil size={12} aria-hidden="true" /> Cập nhật
                          </button>
                        </Can>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
    </Section>
  );
}
