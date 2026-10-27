import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FileDown, FileSpreadsheet, Flag, Loader2, Megaphone, Package, Pencil, Siren, Truck, Users, House } from 'lucide-react';
import { api, useAreaParams } from '../../api/client';
import { useUnits } from '../../api/hooks';
import { useStore } from '../../app/store';
import StatCard from '../dashboard/StatCard';
import { axisProps, ChartTooltip, Legend, useChartTheme } from '../charts/chartTheme';
import { EmptyState, ErrorState, Skeleton } from '../common/ui';
import { INCIDENT, LEVEL } from '../../utils/labels';
import { int, vnFileStamp } from '../../utils/format';
import { exportExcelSheets } from '../../utils/exportExcel';
import { exportSnapshotPdf } from '../../utils/exportPdf';
import { useMediaQuery } from '../../utils/useMediaQuery';
import { areaText, HAZARD, period, when } from './eventFacts';

const unitLabel = (u) => `${u.unit_type === 'phuong' ? 'Phường' : 'Xã'} ${u.name}`;
const BROADCAST_STATUS = { pending_approval: 'Chờ duyệt', sending: 'Đang phát', sent: 'Đã phát', rejected: 'Bị từ chối', draft: 'Nháp' };
const ZONE = { sat_lo: 'Sạt lở', ngap: 'Ngập', lu_quet: 'Lũ quét' };
const dm = (iso) => {
  const [, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}`;
};
const pad = (n) => String(n).padStart(2, '0');
const hm = (t) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const dmh = (t) => {
  const d = new Date(t);
  return `${d.getDate()}/${d.getMonth() + 1} ${pad(d.getHours())}h`;
};
const dmOf = (t) => {
  const d = new Date(t);
  return `${d.getDate()}/${d.getMonth() + 1}`;
};

/** Một bảng của báo cáo: máy tính / PDF dạng bảng, điện thoại dạng danh sách gọn (cột đầu là tiêu đề dòng). */
function ReportTable({ title, cols, rows, empty, asTable }) {
  return (
    <section className="card min-w-0 p-3" aria-label={title}>
      <h3 className="mb-2 text-sm font-semibold text-ink">{title} <span className="font-mono text-xs font-normal text-muted">({rows.length})</span></h3>
      {!rows.length ? (
        <p className="py-3 text-center text-xs text-muted">{empty}</p>
      ) : asTable ? (
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>{cols.map((c) => <th key={c.key} scope="col" className={clsx(c.num && 'text-right')}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.key ?? i}>
                  {cols.map((c) => <td key={c.key} className={clsx('text-sm', c.num && 'text-right font-mono')}>{c.render ? c.render(r) : r[c.key]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r, i) => (
            <li key={r.key ?? i} className="rounded-lg bg-panel2/60 px-2.5 py-1.5 text-xs">
              <div className="font-semibold text-ink">{cols[0].render ? cols[0].render(r) : r[cols[0].key]}</div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-ink-2">
                {cols.slice(1).map((c) => (
                  <span key={c.key}>{c.label}: <b className="font-mono">{c.render ? c.render(r) : r[c.key]}</b></span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Phiếu SOS nhận theo ngày, cột chồng theo cấp ưu tiên (thang màu chung, Cấp 1 Đỏ ở đáy; chú giải kèm số từng cấp). */
function SosPerDay({ days }) {
  const c = useChartTheme();
  const parts = [
    { key: 'p1', label: 'Cấp 1 · Đỏ', color: c.danger },
    { key: 'p2', label: 'Cấp 2 · Cam', color: c.serious },
    { key: 'p3', label: 'Cấp 3 · Vàng', color: c.warn },
  ];
  const sum = (k) => days.reduce((m, d) => m + d[k], 0);
  const label = `Phiếu SOS theo ngày: ${days.map((d) => `${dm(d.day)} ${d.p1 + d.p2 + d.p3}`).join('; ')}`;
  return (
    <section className="card min-w-0 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold text-ink">Phiếu SOS theo ngày</h3>
        <Legend items={parts.map((p) => ({ label: `${p.label}: ${sum(p.key)}`, color: p.color }))} />
      </div>
      {days.length ? (
        <div role="img" aria-label={label}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={days} margin={{ top: 12, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%" maxBarSize={56}>
              <CartesianGrid stroke={c.grid} vertical={false} />
              <XAxis dataKey="day" tickFormatter={dm} interval="preserveStartEnd" {...axisProps(c)} />
              <YAxis allowDecimals={false} width={38} {...axisProps(c)} />
              <Tooltip
                cursor={{ fill: c.grid, opacity: 0.35 }}
                labelFormatter={(d) => `Ngày ${dm(d)}`}
                contentStyle={{ background: c.panel, border: `1px solid ${c.grid}`, borderRadius: 8, fontSize: 12, color: c.ink }}
              />
              {parts.map((p, i) => (
                <Bar key={p.key} dataKey={p.key} name={p.label} stackId="sos" fill={p.color} stroke={c.panel} strokeWidth={2} radius={i === parts.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState height={120}>Chưa có phiếu SOS nào trong đợt (trong vùng đang xem)</EmptyState>
      )}
    </section>
  );
}

/**
 * Diễn biến sơ tán trong đợt (lịch sử sơ tán, DB8): tổng số hộ đã sơ tán của các xã theo mốc giờ — đường bậc thang (số giữ
 * nguyên tới lần cập nhật sau; xã không cập nhật trong đợt tính số đang ghi lúc bắt đầu), kế hoạch nét đứt.
 */
function EvacuationTimeline({ points }) {
  const c = useChartTheme();
  const data = points.map((p) => ({ ...p, ts: Date.parse(p.time) }));
  const any = data.some((p) => p.households > 0);
  const span = data.length ? data[data.length - 1].ts - data[0].ts : 0;
  const tick = span <= 86400e3 ? hm : span <= 15 * 86400e3 ? dmh : dmOf;
  const peak = data.reduce((m, p) => (p.households > m.households ? p : m), data[0] || { households: 0 });
  const last = data[data.length - 1];
  const label = any
    ? `Diễn biến sơ tán: đầu đợt ${int(data[0].households)} hộ, cao nhất ${int(peak.households)} hộ lúc ${when(peak.ts)}, `
      + `cuối ${int(last.households)} hộ; kế hoạch ${int(last.planned_households)} hộ`
    : '';
  return (
    <section className="card min-w-0 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold text-ink">Diễn biến sơ tán</h3>
        {any && <Legend items={[{ label: 'Đã sơ tán (hộ)', color: c.s1, line: true }, { label: 'Kế hoạch (hộ)', color: c.muted, dashed: true }]} />}
      </div>
      {any ? (
        <div role="img" aria-label={label}>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 4 }}>
              <CartesianGrid stroke={c.grid} vertical={false} />
              <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={tick} minTickGap={32} {...axisProps(c)} />
              <YAxis allowDecimals={false} width={48} tickFormatter={(v) => typeof v === 'number' && v >= 1000 ? `${(v / 1000).toLocaleString('vi-VN')}k` : v} {...axisProps(c)} />
              <Tooltip
                cursor={{ stroke: c.axis, strokeDasharray: '3 3' }}
                content={(
                  <ChartTooltip
                    labelFormatter={(t) => when(t)}
                    rows={(pl) => {
                      const p = pl[0].payload;
                      return [
                        { name: 'Đã sơ tán', value: p.households, unit: ' hộ', color: c.s1 },
                        { name: 'Số người', value: p.persons, unit: ' người', color: c.s1 },
                        { name: 'Kế hoạch', value: p.planned_households, unit: ' hộ', color: c.muted },
                      ];
                    }}
                  />
                )}
              />
              <Area type="stepAfter" dataKey="households" name="Đã sơ tán" stroke={c.s1} strokeWidth={2} fill={c.s1} fillOpacity={0.15} dot={data.length === 1} activeDot={{ r: 4, stroke: c.panel, strokeWidth: 2 }} isAnimationActive={false} />
              <Line type="stepAfter" dataKey="planned_households" name="Kế hoạch" stroke={c.muted} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState height={120}>Chưa có xã nào ghi số sơ tán trong đợt (trong vùng đang xem)</EmptyState>
      )}
    </section>
  );
}

/**
 * Báo cáo theo đợt thiên tai (DB5): thông tin đợt, 6 ô chỉ số (phiếu SOS, người được cứu, lệnh điều động, cảnh báo, hộ sơ tán
 * cao nhất, vật tư đã cấp), phiếu SOS theo ngày, diễn biến sơ tán, bảng SOS theo xã / vật tư / sơ tán / cảnh báo / vùng nguy
 * hiểm. Số liệu theo phạm vi được giao và bộ lọc địa bàn. Excel nhiều trang tính, PDF. Sửa / kết thúc đợt: quyền event.manage.
 */
export default function EventReport({ code, canManage, onEdit, onEnd }) {
  const toast = useStore((s) => s.toast);
  const isLg = useMediaQuery('(min-width: 1024px)');
  const { data: units = [] } = useUnits();
  const names = useMemo(() => new Map(units.map((u) => [u.code, unitLabel(u)])), [units]);
  const area = useAreaParams();
  // Khoá gồm mã đợt + vùng đang lọc (useAreaQuery không đưa đường dẫn vào khoá — các đợt sẽ dùng chung bản lưu)
  const q = useQuery({
    queryKey: ['event-summary', code, area.admin_codes || 'CB'],
    queryFn: () => api(`/events/${encodeURIComponent(code)}/summary`, { params: area }),
    refetchInterval: 60_000,
  });
  const [pdf, setPdf] = useState(false);
  const ref = useRef(null);

  if (q.isLoading) return <Skeleton height={520} />;
  if (q.isError && !q.data) {
    return (
      <ErrorState height={220} onRetry={q.refetch}>
        {q.error?.status === 404 ? `Không có đợt ${code} trong phạm vi được giao` : 'Không tải được báo cáo đợt thiên tai'}
      </ErrorState>
    );
  }
  const s = q.data;
  const e = s.event;
  const H = HAZARD[e.hazard] || HAZARD.khac;
  const open = !e.ended_at;
  const peakHouseholds = s.evacuation.reduce((m, r) => m + r.peak_households, 0);
  const peakPersons = s.evacuation.reduce((m, r) => m + r.peak_persons, 0);
  const issuedTypes = s.supplies.filter((r) => r.issued > 0).length;
  const sev = (k) => s.alerts.filter((a) => a.severity === k && ['sending', 'sent'].includes(a.status)).length;
  const sent = s.alerts.filter((a) => ['sending', 'sent'].includes(a.status)).length;
  const asTable = isLg || pdf;
  const areaName = areaText(e.admin_codes, names);

  const doExcel = async () => {
    try {
      await exportExcelSheets([
        {
          name: 'Tong hop',
          rows: [
            ['Mã đợt', e.code], ['Tên đợt', e.name], ['Loại thiên tai', H.label], ['Thời gian', period(e)], ['Vùng ảnh hưởng', areaName],
            ['Phiếu SOS', s.sos.total], ['Phiếu còn mở', s.sos.open], ['Người mắc kẹt', s.sos.trapped], ['Người đã cứu an toàn', s.sos.rescued],
            ['Tiếp nhận trung vị (phút)', s.sos.median_ack_min ?? ''], ['Lệnh điều động', s.dispatch.orders], ['Lệnh đã huỷ', s.dispatch.cancelled],
            ['Quân số điều động', s.dispatch.personnel], ['Lệnh cảnh báo đã phát', sent], ['Hộ sơ tán (cao nhất)', peakHouseholds],
            ['Người sơ tán (cao nhất)', peakPersons], ['Phạm vi số liệu', s.scoped ? 'Theo phạm vi được giao / vùng đang lọc' : 'Toàn tỉnh'],
          ].map(([k, v]) => ({ 'Chỉ tiêu': k, 'Giá trị': v })),
        },
        {
          name: 'SOS theo xa',
          rows: s.sos.by_commune.map((r) => ({ 'Xã/phường': unitLabel(r), 'Phiếu SOS': r.sos, 'Còn mở': r.open, 'Người mắc kẹt': r.trapped })),
        },
        {
          name: 'Vat tu',
          rows: s.supplies.map((r) => ({
            'Mã': r.item_code, 'Mặt hàng': r.name || r.item_code, 'Đơn vị': r.unit || '', 'Đã xuất': r.issued, 'Hoàn trả': r.returned,
            'Thực cấp': r.issued - r.returned, 'Nhập thêm': r.received,
          })),
        },
        {
          name: 'So tan',
          rows: s.evacuation.map((r) => ({
            'Xã/phường': unitLabel(r), 'Hộ sơ tán cao nhất': r.peak_households, 'Hộ theo kế hoạch': r.planned_households,
            'Người sơ tán cao nhất': r.peak_persons, 'Người theo kế hoạch': r.planned_persons,
          })),
        },
        {
          name: 'Dien bien so tan',
          rows: (s.evacuation_timeline || []).map((p) => ({
            'Thời điểm': when(p.time), 'Hộ đã sơ tán': p.households, 'Người đã sơ tán': p.persons, 'Hộ theo kế hoạch': p.planned_households,
          })),
        },
        {
          name: 'Canh bao',
          rows: s.alerts.map((a) => ({
            'Mã lệnh': a.code, 'Tiêu đề': a.title, 'Mức': LEVEL[a.severity]?.label || a.severity, 'Trạng thái': BROADCAST_STATUS[a.status] || a.status,
            'Thời gian': when(a.time), 'Số xã nhận': a.communes,
          })),
        },
      ], { filename: `bao-cao-${e.code}-${vnFileStamp(new Date(), true)}.xlsx` });
    } catch (err) {
      toast({ tone: 'danger', title: 'Không xuất được tệp Excel', body: err.message });
    }
  };
  const doPdf = async () => {
    if (pdf) return;
    setPdf(true);
    try {
      await new Promise((resolve) => { requestAnimationFrame(() => requestAnimationFrame(resolve)); });
      const at = new Date();
      await exportSnapshotPdf(ref.current, {
        title: `BÁO CÁO ĐỢT THIÊN TAI ${e.code} – ${e.name.toUpperCase()}`,
        subtitle: [H.label, period(e), areaName, s.scoped && 'theo phạm vi được giao', `in lúc ${at.toLocaleString('vi-VN')}`].filter(Boolean).join(' · '),
        filename: `bao-cao-${e.code}-${vnFileStamp(at, true)}.pdf`,
        layoutWidth: 1280,
      });
    } catch (err) {
      toast({ tone: 'danger', title: 'Không xuất được PDF', body: err.message });
    } finally {
      setPdf(false);
    }
  };

  const zones = s.hazards.map((z) => ({ key: `${z.key}-${z.level}`, ...z }));
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="card flex flex-col gap-2 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="chip bg-panel2 font-mono text-[11px] text-ink-2">{e.code}</span>
              <span className={clsx('chip text-[11px] font-semibold', open ? 'bg-accent text-white' : 'bg-panel2 text-muted')}>{open ? 'Đang diễn ra' : 'Đã kết thúc'}</span>
            </div>
            <h2 className="mt-1 text-base font-bold leading-snug text-ink">{e.name}</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-2">
              <span className="inline-flex items-center gap-1"><H.icon size={13} aria-hidden="true" /> {H.label}</span>
              <span aria-hidden="true">·</span><span>{period(e)}</span>
              <span aria-hidden="true">·</span><span>{areaName}</span>
            </p>
            {(e.note || e.end_note || e.created_by_name) && (
              <p className="mt-1 text-[11px] text-muted">
                {e.created_by_name && <>Mở bởi {e.created_by_name}{e.ended_by_name ? ` · kết thúc bởi ${e.ended_by_name}` : ''}. </>}
                {e.note && <>{e.note}. </>}
                {e.end_note && <>Kết thúc: {e.end_note}.</>}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-1.5 no-print">
            {canManage && (
              <button type="button" className="btn-ghost tap px-2.5 text-xs" onClick={() => onEdit(e)}><Pencil size={13} aria-hidden="true" /> Sửa</button>
            )}
            {canManage && open && (
              <button type="button" className="btn-primary tap px-2.5 text-xs" onClick={() => onEnd(e)}><Flag size={13} aria-hidden="true" /> Kết thúc đợt</button>
            )}
            <button type="button" className="btn-ghost tap px-2.5 text-xs" onClick={doExcel}><FileSpreadsheet size={13} aria-hidden="true" /> Excel</button>
            <button type="button" className="btn-ghost tap px-2.5 text-xs" onClick={doPdf} disabled={pdf}>
              {pdf ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <FileDown size={13} aria-hidden="true" />} PDF
            </button>
          </div>
        </div>
        {s.scoped && <p className="text-[11px] text-muted">Số liệu trong phạm vi được giao / vùng đang lọc ở thanh trên cùng.</p>}
      </div>

      <div ref={ref} className="flex flex-col gap-3 bg-bg">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 2xl:grid-cols-6" role="group" aria-label="Chỉ số của đợt">
          <StatCard compact footerRows icon={Siren} title="Phiếu SOS" value={int(s.sos.total)} unit="phiếu" footer={[s.sos.open ? `${int(s.sos.open)} còn mở` : s.sos.total ? 'Đã xử lý hết' : 'Chưa có phiếu', s.sos.median_ack_min != null && `tiếp nhận ~${s.sos.median_ack_min}′`].filter(Boolean).join(' · ')} />
          <StatCard compact footerRows icon={Users} title="Người được cứu" value={int(s.sos.rescued)} unit={`/ ${int(s.sos.trapped)}`} footer="đã cứu / mắc kẹt" />
          <StatCard compact footerRows icon={Truck} title="Lệnh điều động" value={int(s.dispatch.orders - s.dispatch.cancelled)} unit="lệnh" footer={`${int(s.dispatch.personnel)} người${s.dispatch.cancelled ? ` · ${s.dispatch.cancelled} đã huỷ` : ''}`} />
          <StatCard compact footerRows icon={Megaphone} title="Cảnh báo đã phát" value={int(sent)} unit="lệnh" footer={sent ? `Rất cao ${sev('do')} · Cao ${sev('cam')} · Trung bình ${sev('vang')}` : 'Chưa phát lệnh nào'} />
          <StatCard compact footerRows icon={House} title="Sơ tán cao nhất" value={int(peakHouseholds)} unit="hộ" footer={`${int(peakPersons)} người · ${s.evacuation.length} xã`} />
          <StatCard compact footerRows icon={Package} title="Vật tư đã cấp" value={int(issuedTypes)} unit="mặt hàng" footer="theo sổ xuất – nhập kho" />
        </div>

        <div className={clsx('grid gap-3', asTable && 'xl:grid-cols-2')}>
          <SosPerDay days={s.sos.per_day} />
          <EvacuationTimeline points={s.evacuation_timeline || []} />
          <ReportTable
            asTable={asTable}
            title="Phiếu SOS theo xã/phường"
            empty="Chưa có phiếu SOS nào trong đợt"
            rows={s.sos.by_commune.map((r) => ({ key: r.code, ...r }))}
            cols={[
              { key: 'name', label: 'Xã/phường', render: unitLabel },
              { key: 'sos', label: 'Phiếu', num: true },
              { key: 'open', label: 'Còn mở', num: true },
              { key: 'trapped', label: 'Mắc kẹt', num: true },
            ]}
          />
          <ReportTable
            asTable={asTable}
            title="Vật tư đã cấp (sổ xuất – nhập kho)"
            empty="Chưa xuất vật tư nào trong đợt"
            rows={s.supplies.map((r) => ({ key: r.item_code, ...r }))}
            cols={[
              { key: 'name', label: 'Mặt hàng', render: (r) => `${r.name || r.item_code}${r.unit ? ` (${r.unit})` : ''}` },
              { key: 'issued', label: 'Đã xuất', num: true, render: (r) => int(r.issued) },
              { key: 'returned', label: 'Hoàn trả', num: true, render: (r) => int(r.returned) },
              { key: 'net', label: 'Thực cấp', num: true, render: (r) => int(r.issued - r.returned) },
              { key: 'received', label: 'Nhập thêm', num: true, render: (r) => int(r.received) },
            ]}
          />
          <ReportTable
            asTable={asTable}
            title="Sơ tán — số cao nhất trong đợt"
            empty="Chưa có xã nào cập nhật sơ tán trong đợt"
            rows={s.evacuation.map((r) => ({ key: r.code, ...r }))}
            cols={[
              { key: 'name', label: 'Xã/phường', render: unitLabel },
              { key: 'peak_households', label: 'Hộ', num: true, render: (r) => `${int(r.peak_households)} / ${int(r.planned_households)}` },
              { key: 'peak_persons', label: 'Người', num: true, render: (r) => `${int(r.peak_persons)} / ${int(r.planned_persons)}` },
            ]}
          />
          <ReportTable
            asTable={asTable}
            title="Lệnh cảnh báo trong đợt"
            empty="Chưa có lệnh cảnh báo nào trong đợt"
            rows={s.alerts.map((a) => ({ key: a.code, ...a }))}
            cols={[
              { key: 'title', label: 'Lệnh', render: (a) => `${a.code} · ${a.title}` },
              { key: 'severity', label: 'Mức', render: (a) => LEVEL[a.severity]?.label || a.severity },
              { key: 'status', label: 'Trạng thái', render: (a) => BROADCAST_STATUS[a.status] || a.status },
              { key: 'time', label: 'Lúc', render: (a) => when(a.time) },
            ]}
          />
          <ReportTable
            asTable={asTable}
            title="Vùng nguy hiểm khoanh trong đợt"
            empty="Chưa khoanh vùng nguy hiểm nào trong đợt"
            rows={zones}
            cols={[
              { key: 'key', label: 'Loại', render: (z) => ZONE[z.key] || z.key },
              { key: 'level', label: 'Mức', render: (z) => LEVEL[z.level]?.label || z.level },
              { key: 'n', label: 'Số vùng', num: true },
            ]}
          />
        </div>
        {s.sos.by_type.length > 0 && (
          <p className="text-[11px] text-muted">
            Loại sự cố: {s.sos.by_type.map((t) => `${INCIDENT[t.key] || t.key} ${t.n}`).join(' · ')}
          </p>
        )}
      </div>
    </div>
  );
}
