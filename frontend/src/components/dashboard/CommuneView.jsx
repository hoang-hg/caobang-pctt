import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { BookUser, FileUp, Home, MapPinned, PhoneCall, Send, Shield, Siren, Users } from 'lucide-react';
import { api } from '../../api/client';
import { useAreaQuery } from '../../api/hooks';
import { useIsCommuneUser, usePermission } from '../../rbac/usePermission';
import { ErrorState, Progress, Skeleton } from '../common/ui';
import { FORCE_TYPE, INCIDENT, PRIORITY, SOS_STATUS } from '../../utils/labels';
import { dateTime, int, minutesSince, pct } from '../../utils/format';
import { slaState } from '../../utils/sla';
import { EvacuationModal } from '../rescue/Evacuation';
import CommuneKpis from './CommuneKpis';

export const unitLabel = (u) => (u ? `${u.unit_type === 'phuong' ? 'Phường' : 'Xã'} ${u.name}` : '');

/** Khung một mục của góc nhìn xã: tiêu đề + nội dung. Đang tải / lỗi tải (`q` = kết quả useQuery) → khung tải / lỗi kèm
 * "Thử lại" — không nói "chưa có dữ liệu" khi thực ra chưa biết; tải xong mà trống thì ghi rõ cần nhập gì (`empty`). */
function Panel({ id, icon: Icon, title, right, empty, q, children, className }) {
  let body = empty ? <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-muted">{empty}</p> : children;
  if (q && !q.data) body = q.isError ? <ErrorState onRetry={q.refetch}>Không tải được dữ liệu</ErrorState> : <Skeleton height={72} />;
  return (
    <section id={id} className={clsx('card flex min-w-0 scroll-mt-20 flex-col gap-2 p-3', className)}>
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
 * Góc nhìn cấp xã/phường — trang chủ của tài khoản cấp xã: xã đang xem (chọn xã khi phạm vi nhiều xã — cấp tỉnh xem từng
 * xã); tài khoản cấp xã có khối "Báo cáo & xin chi viện" lên tỉnh; hàng chỉ số riêng của xã (CommuneKpis — không lấy 6 ô
 * của tỉnh, xã không có trạm thì ô nào cũng "–"); `children` (biểu đồ, nhật ký của xã) rồi các mục chi tiết, phiếu SOS
 * lên đầu. Mỗi mục đọc API thật, chưa có dữ liệu thì nói rõ cần nhập gì — không có số mẫu. `onSupport`: mở hộp thoại xin
 * chi viện (Tổng quan giữ — thanh dưới điện thoại cũng mở được).
 */
export default function CommuneView({ code, units, onChange, onSupport, children }) {
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
  const myHamlets = useMemo(() => (hamletsQ.data || []).filter((h) => h.parent_code === code), [hamletsQ.data, code]);
  const [evacOpen, setEvacOpen] = useState(false);
  // Kênh báo cáo / xin chi viện lên tỉnh: chỉ tài khoản cấp xã (cấp tỉnh xem trang này không "xin chi viện lên tỉnh")
  const isCommuneUser = useIsCommuneUser();
  const toSos = () => document.getElementById('sos-xa')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="flex flex-col gap-3">
      {/* Thẻ đầu: xã đang xem + việc chính của tài khoản cấp xã (xin chi viện — nút đỏ duy nhất; báo cáo nhanh tạo SOS đã có
          trên thanh trên cùng / "Báo SOS" ở thanh dưới điện thoại) */}
      <div className="card flex flex-wrap items-center justify-between gap-x-4 gap-y-3 p-3 sm:px-4">
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-tight text-ink">{unitLabel(unit) || 'Chọn xã/phường'}</h2>
          {unit && (
            <p className="mt-0.5 text-xs text-muted">
              Dân số <b className="num font-semibold text-ink-2">{int(unit.population)}</b> · <b className="num font-semibold text-ink-2">{int(unit.households)}</b> hộ
              {myHamlets.length > 0 && <> · {myHamlets.length} xóm / tổ dân phố</>}
            </p>
          )}
        </div>
        {/* Tài khoản một xã không có gì để chọn — chỉ phạm vi nhiều xã (cấp tỉnh) mới hiện ô chọn */}
        {units.length > 1 && (
          <label className="flex items-center gap-2 text-xs text-muted">
            <span>Xem xã/phường</span>
            <select className="input tap w-auto min-w-[200px] py-1.5 text-sm" value={code || ''} onChange={(e) => onChange(e.target.value)} aria-label="Chọn xã/phường">
              {!code && <option value="">— Chọn —</option>}
              {units.map((u) => (
                <option key={u.code} value={u.code}>{unitLabel(u)}</option>
              ))}
            </select>
          </label>
        )}
        {unit && isCommuneUser && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <button
              type="button"
              onClick={onSupport}
              className="btn-danger tap h-10 px-4 font-semibold max-sm:w-full"
              title="Yêu cầu tới thẳng bảng điều phối của trực ban tỉnh (mục &quot;Xã xin chi viện&quot;)"
            >
              <Send size={15} aria-hidden="true" /> Gửi yêu cầu chi viện lên tỉnh
            </button>
            <div className="grid flex-1 grid-cols-2 gap-2 sm:flex sm:flex-none">
              {canEvac && (
                <button type="button" onClick={() => setEvacOpen(true)} className="btn-secondary tap h-10 px-3">
                  <Home size={15} aria-hidden="true" /> Cập nhật sơ tán
                </button>
              )}
              <Link to="/nhap-du-lieu" className="btn-secondary tap h-10 px-3">
                <FileUp size={15} aria-hidden="true" /> Gửi dữ liệu
              </Link>
            </div>
          </div>
        )}
      </div>

      {!unit ? (
        <p className="card border-dashed p-4 text-center text-sm text-muted">
          Chọn một xã/phường để xem tiến độ sơ tán, điểm sơ tán, phiếu SOS, lực lượng và danh bạ của xã đó.
        </p>
      ) : (
        <>
          <CommuneKpis
            code={code}
            sosQ={sosQ}
            evacQ={evacQ}
            canSos={canSos}
            onSos={toSos}
            onEvac={canEvac ? () => setEvacOpen(true) : undefined}
          />
          {children}

          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3 [&>*]:min-w-0">
            {canSos && (
              <Panel
                id="sos-xa"
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

            <Panel
              icon={Home}
              title="Tiến độ sơ tán"
              q={evacQ}
              right={canEvac && (
                <button type="button" onClick={() => setEvacOpen(true)} className="tap text-xs font-semibold text-accent hover:underline">Cập nhật</button>
              )}
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

      {/* Cập nhật kế hoạch / số đã sơ tán của xã (cùng hộp thoại ở Điều hành cứu hộ) */}
      {evacOpen && <EvacuationModal row={progress || { code }} progress={evac?.progress} onClose={() => setEvacOpen(false)} />}
    </div>
  );
}
