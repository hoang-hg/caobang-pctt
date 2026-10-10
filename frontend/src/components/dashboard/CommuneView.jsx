import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { BookUser, Home, MapPinned, PhoneCall, Shield, Siren, Users } from 'lucide-react';
import { api } from '../../api/client';
import { useAreaQuery } from '../../api/hooks';
import { usePermission } from '../../rbac/usePermission';
import { ErrorState, Progress, Skeleton } from '../common/ui';
import { FORCE_TYPE, INCIDENT, PRIORITY, SOS_STATUS } from '../../utils/labels';
import { dateTime, int, minutesSince, pct } from '../../utils/format';
import { slaState } from '../../utils/sla';

export const unitLabel = (u) => (u ? `${u.unit_type === 'phuong' ? 'Phường' : 'Xã'} ${u.name}` : '');

/** Khung một mục của góc nhìn xã: tiêu đề + nội dung. Đang tải / lỗi tải (`q` = kết quả useQuery) → khung tải / lỗi kèm
 * "Thử lại" — không nói "chưa có dữ liệu" khi thực ra chưa biết; tải xong mà trống thì ghi rõ cần nhập gì (`empty`). */
function Panel({ icon: Icon, title, right, empty, q, children, className }) {
  let body = empty ? <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-muted">{empty}</p> : children;
  if (q && !q.data) body = q.isError ? <ErrorState onRetry={q.refetch}>Không tải được dữ liệu</ErrorState> : <Skeleton height={72} />;
  return (
    <section className={clsx('card flex min-w-0 flex-col gap-2 p-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="card-title">
          <Icon size={15} className="text-accent" aria-hidden="true" /> {title}
        </h3>
        {right}
      </div>
      {body}
    </section>
  );
}

const flatten = (nodes) => nodes.flatMap((n) => [n, ...flatten(n.children || [])]);

/**
 * Góc nhìn cấp xã/phường: chọn 1 xã trong phạm vi được giao (danh sách 56 xã thật, mã CB-…); KPI, biểu đồ, nhật ký phía
 * trên đã lọc theo xã này (bộ lọc chung). Mỗi mục đọc API thật, chưa có dữ liệu thì nói rõ cần nhập gì — không có số mẫu.
 * Thao tác ghi (cập nhật sơ tán, điều động) làm ở trang nghiệp vụ tương ứng, ở đây chỉ dẫn link. `children` (KPI của xã)
 * hiện ngay dưới ô chọn xã, trước các mục chi tiết.
 */
export default function CommuneView({ code, units, onChange, children }) {
  const unit = units.find((u) => u.code === code);
  const canEvac = usePermission('evacuation', 'update', code);
  const canRes = usePermission('resource', 'view', code);
  const canSos = usePermission('sos', 'view', code);
  const canContacts = usePermission('contact', 'view');

  const evacQ = useAreaQuery('evacuation', '/evacuation', {}, { refetchInterval: 30_000 });
  const sosQ = useAreaQuery('sos', '/sos', {}, { refetchInterval: 20_000, enabled: canSos });
  const forcesQ = useAreaQuery('forces', '/resources/forces', {}, { enabled: canRes });
  const contactsQ = useQuery({
    queryKey: ['contacts'],
    queryFn: () => api('/alerts/contacts'),
    staleTime: 5 * 60_000,
    enabled: canContacts,
  });
  const hamletsQ = useQuery({
    queryKey: ['units', 'thon'],
    queryFn: () => api('/admin-units', { params: { level: 'thon' } }),
    staleTime: Infinity,
  });

  const evac = evacQ.data;
  const progress = evac?.progress?.find((p) => p.code === code);
  const sites = (evac?.sites || []).filter((s) => s.admin_code === code);
  const open = (sosQ.data || []).filter((t) => t.admin_code === code && t.status !== 'hoan_thanh');
  const localForces = forcesQ.data || []; // đóng quân trong ranh giới xã (kể cả đơn vị cấp tỉnh — ghi rõ cấp)
  const book = useMemo(() => flatten(contactsQ.data || []).filter((c) => c.admin_code === code && c.level !== 'tinh'), [contactsQ.data, code]);
  const myHamlets = (hamletsQ.data || []).filter((h) => h.parent_code === code);

  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-wider text-muted">Góc nhìn cấp xã / phường</div>
          <h2 className="text-lg font-black text-ink">{unitLabel(unit) || 'Chọn xã/phường'}</h2>
          {unit && (
            <p className="text-xs text-muted">
              Dân số {int(unit.population)} · {int(unit.households)} hộ (dữ liệu nền)
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          <span>Xã/phường</span>
          <select className="input tap w-auto min-w-[220px] py-1 text-xs" value={code || ''} onChange={(e) => onChange(e.target.value)} aria-label="Chọn xã/phường">
            {!code && <option value="">— Chọn —</option>}
            {units.map((u) => (
              <option key={u.code} value={u.code}>{unitLabel(u)}</option>
            ))}
          </select>
        </label>
      </div>

      {!unit ? (
        <p className="card border-dashed p-4 text-center text-sm text-muted">
          Chọn một xã/phường để xem tiến độ sơ tán, điểm sơ tán, phiếu SOS, lực lượng và danh bạ của xã đó.
        </p>
      ) : (
        <>
          {children}

          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3 [&>*]:min-w-0">
            <Panel
              icon={Home}
              title="Tiến độ sơ tán"
              q={evacQ}
              right={canEvac && canSos && <Link to="/cuu-ho" className="touch-hit text-xs font-semibold text-accent hover:underline">Cập nhật →</Link>}
              empty={!progress && 'Xã chưa cập nhật kế hoạch / tiến độ sơ tán (Điều hành cứu hộ → Giám sát sơ tán nhân dân)'}
            >
              {progress && (
                <div className="flex flex-col gap-2 text-xs">
                  <div className="flex items-baseline justify-between">
                    <span className="text-muted">Hộ đã sơ tán / kế hoạch</span>
                    <b className="font-mono text-base text-ink">
                      {int(progress.evacuated_households)}/{int(progress.planned_households)}
                    </b>
                  </div>
                  <Progress value={pct(progress.evacuated_households, progress.planned_households)} tone="good" />
                  <div className="flex justify-between text-muted">
                    <span>Nhân khẩu: <b className="font-mono text-ink">{int(progress.evacuated_persons)}/{int(progress.planned_persons)}</b></span>
                    <span>Cập nhật {dateTime(progress.updated_at)}</span>
                  </div>
                </div>
              )}
            </Panel>

            <Panel
              icon={MapPinned}
              title={`Điểm sơ tán · ${sites.length}`}
              q={evacQ}
              empty={!sites.length && 'Chưa có điểm sơ tán của xã trong dữ liệu (nhập loại "Điểm sơ tán")'}
            >
              <ul className="scroll-thin flex max-h-56 flex-col gap-2 overflow-y-auto pr-1 print:max-h-none print:overflow-visible">
                {sites.map((s) => {
                  const p = pct(s.current_occupancy, s.capacity);
                  return (
                    <li key={s.id} className="text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="truncate font-medium text-ink">{s.name}</span>
                        <span className="shrink-0 font-mono text-muted">{int(s.current_occupancy)}/{int(s.capacity)} người</span>
                      </div>
                      <Progress value={p} tone={p >= 100 ? 'danger' : p >= 80 ? 'warn' : 'good'} className="mt-1" />
                    </li>
                  );
                })}
              </ul>
            </Panel>

            {canSos && (
              <Panel
                icon={Siren}
                title={`Phiếu SOS đang mở · ${open.length}`}
                q={sosQ}
                right={<Link to="/cuu-ho" className="touch-hit text-xs font-semibold text-accent hover:underline">Điều phối →</Link>}
                empty={!open.length && 'Không có phiếu SOS đang mở ở xã này'}
              >
                <ul className="scroll-thin flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1 print:max-h-none print:overflow-visible">
                  {open.map((t) => {
                    const waited = minutesSince(t.received_at);
                    const late = !!slaState(t, Date.now())?.breached; // cùng quy tắc với KPI quá hạn (utils/sla)
                    return (
                      <li key={t.id} className={clsx('rounded-md border px-2 py-1.5 text-xs', late ? 'border-danger/60 bg-danger/10' : 'border-line')}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-semibold text-ink">{t.code}</span>
                          <span className={clsx('chip px-1.5 py-0 text-[10px]', PRIORITY[t.priority]?.cls)}>{PRIORITY[t.priority]?.short}</span>
                        </div>
                        <div className="text-ink-2">
                          {INCIDENT[t.incident_type]} · {t.trapped_count ?? '?'} người · {SOS_STATUS[t.status]}
                        </div>
                        <div className={late ? 'font-semibold text-danger' : 'text-muted'}>
                          Tiếp nhận {waited} phút trước{late && ' — quá hạn phản hồi'}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            )}

            {canRes && (
              <Panel icon={Shield} title={`Lực lượng tại xã · ${localForces.length}`} q={forcesQ} empty={!localForces.length && 'Chưa có dữ liệu lực lượng của xã (nhập loại "Lực lượng")'}>
                <ul className="scroll-thin flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1 print:max-h-none print:overflow-visible">
                  {localForces.map((f) => (
                    <li key={f.id} className="text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="truncate font-medium text-ink">{f.name}</span>
                        <span className="shrink-0 font-mono text-muted">{int(f.personnel_ready)}/{int(f.personnel_total)} sẵn sàng</span>
                      </div>
                      <div className="flex justify-between gap-2 text-muted">
                        <span className="truncate">
                          {FORCE_TYPE[f.org_type] || f.org_type}
                          {f.level === 'tinh' && ' (cấp tỉnh)'}
                          {f.commander ? ` · ${f.commander}` : ''}
                        </span>
                        {f.contact_phone && (
                          <a href={`tel:${f.contact_phone}`} className="tap inline-flex shrink-0 items-center font-semibold text-accent">
                            <PhoneCall size={11} className="mr-0.5 inline" />
                            {f.contact_phone}
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            {canContacts && (
              <Panel icon={BookUser} title="Danh bạ BCH xã / thôn" q={contactsQ} empty={!book.length && 'Chưa có danh bạ cấp xã trong dữ liệu (nhập loại "Danh bạ & đường dây nóng")'}>
                <ul className="scroll-thin flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1 print:max-h-none print:overflow-visible">
                  {book.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{c.full_name}</span>
                        <span className="block truncate text-muted">{c.position}{c.org ? ` · ${c.org}` : ''}</span>
                      </span>
                      {c.phone && (
                        <a href={`tel:${c.phone}`} className="tap inline-flex shrink-0 items-center font-semibold text-accent">
                          <PhoneCall size={11} className="mr-0.5 inline" />
                          {c.phone}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            <Panel icon={Users} title={`Xóm / tổ dân phố · ${myHamlets.length}`} q={hamletsQ} empty={!myHamlets.length && 'Chưa có danh sách xóm chính thức của xã (nhập loại "Xóm / tổ dân phố")'}>
              <div className="flex flex-wrap gap-1.5">
                {myHamlets.map((h) => (
                  <span key={h.code} className="chip bg-panel2 text-ink-2">{h.name}</span>
                ))}
              </div>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
