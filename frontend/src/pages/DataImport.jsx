import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Globe2, Loader2, ShieldCheck, Upload } from 'lucide-react';
import { api, apiDownload, apiUpload } from '../api/client';
import { useStore } from '../app/store';
import { Empty, KpiCard } from '../components/common/ui';

const GEOMETRY = { point: 'Điểm (vĩ độ, kinh độ)', polygon: 'Vùng — chỉ GeoJSON', none: 'Không có vị trí' };

/** Nhập dữ liệu chính thức từ tệp: chọn loại → tải mẫu → kiểm tra (không ghi gì) → nhập (1 transaction). */
export default function DataImport() {
  const { data: datasets = [], isLoading } = useQuery({
    queryKey: ['import-datasets'],
    queryFn: () => api('/data-import/datasets'),
    staleTime: Infinity,
  });
  const [name, setName] = useState(null);
  const ds = datasets.find((d) => d.name === name) || datasets[0];
  return (
    <div className="flex flex-col gap-3 p-3">
      <div>
        <h1 className="text-lg font-bold">Nhập dữ liệu chính thức</h1>
        <p className="text-xs text-muted">
          Điểm sơ tán, vùng nguy hiểm, danh bạ, trạm quan trắc, kho, lực lượng… từ tệp CSV / Excel (.xlsx) / GeoJSON. Bấm
          “Kiểm tra” trước — hệ thống chỉ ghi khi tệp không còn lỗi, và ghi toàn bộ hoặc không ghi gì.
        </p>
      </div>
      {isLoading ? (
        <Empty>Đang tải…</Empty>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
          <nav className="card flex flex-col gap-0.5 p-2" aria-label="Loại dữ liệu">
            {datasets.map((d) => (
              <button
                key={d.name}
                onClick={() => setName(d.name)}
                className={clsx(
                  'flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm',
                  d.name === ds?.name ? 'bg-accent/15 font-semibold text-accent' : 'hover:bg-panel2',
                )}
              >
                <span className="truncate">{d.label}</span>
                {d.public && <Globe2 size={14} className="shrink-0 text-muted" aria-label="Hiện trên cổng công khai" />}
              </button>
            ))}
          </nav>
          {ds && <DatasetPanel key={ds.name} ds={ds} />}
        </div>
      )}
    </div>
  );
}

function DatasetPanel({ ds }) {
  const toast = useStore((s) => s.toast);
  const qc = useQueryClient();
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('upsert');
  const [report, setReport] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const clear = () => { setReport(null); setResult(null); setConfirmed(false); };
  const form = () => {
    const f = new FormData();
    f.append('file', file);
    f.append('mode', mode);
    return f;
  };
  const check = async () => {
    setBusy('validate');
    clear();
    try {
      setReport(await apiUpload(`/data-import/datasets/${ds.name}/validate`, form()));
    } catch (e) {
      toast({ tone: 'danger', title: 'Không đọc được tệp', body: e.message, duration: 9000 });
    } finally {
      setBusy('');
    }
  };
  const apply = async () => {
    setBusy('apply');
    try {
      const res = await apiUpload(`/data-import/datasets/${ds.name}/apply`, form());
      setReport(res.report);
      setResult(res.result);
      qc.invalidateQueries();
      toast({
        tone: 'good',
        title: `Đã nhập ${ds.label}`,
        body: `${res.result.created} mới · ${res.result.updated} cập nhật · ${res.result.deleted} xoá`,
      });
    } catch (e) {
      if (e.data?.report) setReport(e.data.report);
      toast({ tone: 'danger', title: 'Chưa nhập', body: e.message, duration: 9000 });
    } finally {
      setBusy('');
    }
  };
  const destructive = mode === 'replace' && report?.deletes > 0;
  const canApply = report?.ok && !result && (!destructive || confirmed) && !busy;

  return (
    <section className="card flex min-w-0 flex-col gap-3 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold">{ds.label}</h2>
          <p className="text-xs text-ink-2">{ds.description}</p>
          <p className="mt-1 text-xs text-muted">
            Vị trí: {GEOMETRY[ds.geometry]} · Định dạng: {ds.formats.join(', ')}
            {ds.update_only && ' · Chỉ cập nhật bản ghi đã có'}
          </p>
        </div>
        <button
          className="btn-ghost shrink-0"
          onClick={() => apiDownload(`/data-import/datasets/${ds.name}/template`, `mau_${ds.name}`).catch((e) =>
            toast({ tone: 'danger', title: 'Không tải được tệp mẫu', body: e.message }))}
        >
          <Download size={15} /> Tải tệp mẫu
        </button>
      </div>

      <details className="rounded-lg bg-panel2 p-2 text-xs">
        <summary className="cursor-pointer font-medium">Các cột ({ds.fields.length}) — tên cột viết có dấu cũng được</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left">
            <thead className="text-muted">
              <tr><th className="py-1 pr-2">Cột</th><th className="pr-2">Ý nghĩa</th><th className="pr-2">Giá trị hợp lệ</th></tr>
            </thead>
            <tbody>
              {ds.fields.map((f) => (
                <tr key={f.name} className="border-t border-line align-top">
                  <td className="py-1 pr-2 font-mono">{f.name}{f.required && <span className="text-danger"> *</span>}</td>
                  <td className="pr-2">{f.label}</td>
                  <td className="pr-2 text-ink-2">{f.choices.length ? f.choices.join(', ') : f.example && `VD ${f.example}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          Tệp dữ liệu
          <input
            type="file"
            className="input"
            accept={ds.formats.join(',')}
            onChange={(e) => { setFile(e.target.files?.[0] || null); clear(); }}
          />
        </label>
        {ds.replaceable && (
          <fieldset className="flex flex-col gap-1 text-sm">
            <legend className="mb-1">Chế độ</legend>
            <label className="flex items-center gap-2">
              <input type="radio" name="mode" checked={mode === 'upsert'} onChange={() => { setMode('upsert'); clear(); }} />
              Thêm mới & cập nhật
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="mode" checked={mode === 'replace'} onChange={() => { setMode('replace'); clear(); }} />
              Thay toàn bộ (xoá bản ghi không có trong tệp)
            </label>
          </fieldset>
        )}
        <button className="btn-primary" disabled={!file || !!busy} onClick={check}>
          {busy === 'validate' ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />} Kiểm tra tệp
        </button>
      </div>

      {report && <ReportView report={report} />}

      {report?.ok && !result && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3">
          {destructive ? (
            <label className="flex items-center gap-2 text-sm text-danger">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              Tôi hiểu {report.deletes} bản ghi hiện có sẽ bị xoá
            </label>
          ) : (
            <span className="flex items-center gap-2 text-sm text-good"><ShieldCheck size={16} /> Tệp hợp lệ — sẵn sàng nhập</span>
          )}
          <button className={destructive ? 'btn-danger' : 'btn-primary'} disabled={!canApply} onClick={apply}>
            {busy === 'apply' ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Nhập vào hệ thống
          </button>
        </div>
      )}

      {result && (
        <div className="flex items-center gap-2 rounded-lg bg-good/10 p-3 text-sm text-good">
          <CheckCircle2 size={18} />
          Đã nhập: {result.created} bản ghi mới, {result.updated} cập nhật, {result.deleted} xoá. Nhật ký đã được ghi.
        </div>
      )}
    </section>
  );
}

function ReportView({ report }) {
  const columns = report.preview.length ? Object.keys(report.preview[0]) : [];
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <KpiCard label="Tổng dòng" value={report.total} />
        <KpiCard label="Hợp lệ" value={report.valid} tone={report.ok ? 'good' : 'warn'} />
        <KpiCard label="Thêm mới" value={report.creates} />
        <KpiCard label="Cập nhật" value={report.updates} />
        <KpiCard label="Xoá" value={report.deletes} tone={report.deletes ? 'danger' : undefined} />
      </div>
      {report.error_count > 0 && (
        <IssueTable title={`${report.error_count} lỗi — sửa tệp rồi kiểm tra lại`} tone="danger" issues={report.errors} total={report.error_count} />
      )}
      {report.warning_count > 0 && (
        <IssueTable title={`${report.warning_count} cảnh báo`} tone="warn" issues={report.warnings} total={report.warning_count} />
      )}
      {columns.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-medium">Xem trước {report.preview.length} dòng đầu (giá trị sau chuẩn hoá)</summary>
          <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-line">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-panel text-muted">
                <tr>{columns.map((c) => <th key={c} className="px-2 py-1 font-mono">{c}</th>)}</tr>
              </thead>
              <tbody>
                {report.preview.map((row) => (
                  <tr key={row.dong} className="border-t border-line">
                    {columns.map((c) => <td key={c} className="whitespace-nowrap px-2 py-1">{formatCell(row[c])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

function IssueTable({ title, tone, issues, total }) {
  return (
    <div className={clsx('rounded-lg border p-2 text-xs', tone === 'danger' ? 'border-danger/50 bg-danger/5' : 'border-warn/50 bg-warn/5')}>
      <div className={clsx('mb-1 flex items-center gap-1.5 font-semibold', tone === 'danger' ? 'text-danger' : 'text-warn')}>
        <AlertTriangle size={14} /> {title}
      </div>
      <div className="max-h-60 overflow-auto">
        <table className="w-full text-left">
          <tbody>
            {issues.map((i, k) => (
              <tr key={k} className="border-t border-line/60 align-top">
                <td className="w-16 py-1 pr-2 text-muted">{i.row ? `Dòng ${i.row}` : 'Tệp'}</td>
                <td className="w-28 pr-2 font-mono">{i.field || ''}</td>
                <td>{i.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > issues.length && <div className="mt-1 text-muted">… và {total - issues.length} mục khác</div>}
    </div>
  );
}

function formatCell(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'có' : 'không';
  return String(value);
}
