import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { CheckCircle2, Download, FileSpreadsheet, FileUp, Globe2, Inbox, Loader2, PencilLine, Send, ShieldCheck, Upload } from 'lucide-react';
import { api, apiDownload, apiUpload } from '../api/client';
import { useUnits } from '../api/hooks';
import { useStore } from '../app/store';
import { Empty, KpiCard, Tabs } from '../components/common/ui';
import { useAllowedCodes, usePermission } from '../rbac/usePermission';
import RecordForm from './DataImportForm';
import Submissions, { IssueTable, PreviewTable } from './DataSubmissions';

const GEOMETRY = { point: 'Điểm (vĩ độ, kinh độ)', polygon: 'Vùng — chỉ GeoJSON', none: 'Không có vị trí' };

/**
 * Nhập dữ liệu chính thức. Cấp tỉnh (data.import): nhập thẳng + duyệt hồ sơ xã gửi. Xã/phường (data.submit): gửi dữ
 * liệu của xã mình → cấp tỉnh phê duyệt rồi mới ghi / hiển thị. Nhập bằng tệp (CSV / Excel / GeoJSON) hoặc điền trực
 * tiếp trên web; luôn "Kiểm tra" trước — không ghi gì khi còn lỗi.
 */
export default function DataImport() {
  const canImport = usePermission('data', 'import', '*');
  const [params, setParams] = useSearchParams();
  const code = params.get('ho-so');
  const [tab, setTab] = useState(code ? 'ho-so' : 'nhap');
  const { data: datasets = [], isLoading } = useQuery({
    queryKey: ['import-datasets'],
    queryFn: () => api('/data-import/datasets'),
    staleTime: Infinity,
  });
  const { data: subs } = useQuery({
    queryKey: ['submissions', 'counts'],
    queryFn: () => api('/data-import/submissions', { params: { limit: 1 } }),
    refetchInterval: 60_000,
  });
  const pending = subs?.counts?.cho_duyet || 0;
  const [name, setName] = useState(null);
  const ds = datasets.find((d) => d.name === name) || datasets[0];
  const open = (c) => {
    setParams(c ? { 'ho-so': c } : {}, { replace: true });
    setTab('ho-so');
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <div>
        <h1 className="text-lg font-bold">{canImport ? 'Nhập dữ liệu chính thức' : 'Gửi dữ liệu của xã/phường'}</h1>
        <p className="text-xs text-muted">
          {canImport
            ? 'Điểm sơ tán, vùng nguy hiểm, danh bạ, trạm quan trắc, kho, lực lượng… từ tệp CSV / Excel (.xlsx) / GeoJSON hoặc điền trực tiếp. Bấm “Kiểm tra” trước — hệ thống chỉ ghi khi dữ liệu không còn lỗi, và ghi toàn bộ hoặc không ghi gì. Hồ sơ xã/phường gửi được duyệt ở tab bên cạnh.'
            : 'Điểm sơ tán, xóm, danh bạ, kho, lực lượng… của xã/phường bạn phụ trách. Dữ liệu được gửi lên cấp tỉnh phê duyệt; chỉ sau khi được duyệt mới hiển thị trên hệ thống và cổng công khai.'}
        </p>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'nhap', label: canImport ? 'Nhập dữ liệu' : 'Gửi dữ liệu', icon: FileUp },
          { value: 'ho-so', label: canImport ? 'Hồ sơ xã/phường gửi' : 'Hồ sơ đã gửi', icon: Inbox, count: pending || null },
        ]}
      />
      {tab === 'ho-so' ? (
        <Submissions canImport={canImport} code={code} onOpen={open} />
      ) : isLoading ? (
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
          {ds && <DatasetPanel key={ds.name} ds={ds} submitMode={!canImport} onSubmitted={open} />}
        </div>
      )}
    </div>
  );
}

function DatasetPanel({ ds, submitMode, onSubmitted }) {
  const toast = useStore((s) => s.toast);
  const qc = useQueryClient();
  const [method, setMethod] = useState('file'); // file | form
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('upsert');
  const [report, setReport] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState('');
  // Xã/phường được chọn trong form: hồ sơ của xã chỉ các xã mình phụ trách; cấp tỉnh: mọi xã
  const { data: units = [] } = useUnits();
  const allowed = useAllowedCodes('data', submitMode ? 'submit' : 'import');
  const communes = useMemo(
    () => units.filter((u) => !allowed || allowed.includes(u.code)).sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    [units, allowed],
  );

  const clear = () => { setReport(null); setResult(null); setConfirmed(false); };
  const form = (f = file) => {
    const fd = new FormData();
    fd.append('file', f);
    fd.append('mode', mode);
    return fd;
  };
  const check = async (f = file) => {
    setBusy('validate');
    clear();
    try {
      setReport(await apiUpload(`/data-import/datasets/${ds.name}/validate`, form(f)));
    } catch (e) {
      toast({ tone: 'danger', title: 'Không đọc được dữ liệu', body: e.message, duration: 9000 });
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
  const submit = async () => {
    setBusy('submit');
    try {
      const fd = form();
      fd.append('name', ds.name);
      if (note.trim()) fd.append('note', note.trim());
      const res = await apiUpload('/data-import/submissions', fd);
      qc.invalidateQueries({ queryKey: ['submissions'] });
      toast({ tone: 'good', title: `Đã gửi hồ sơ ${res.code}`, body: 'Chờ cấp tỉnh phê duyệt — dữ liệu hiển thị sau khi được duyệt.' });
      onSubmitted(res.code);
    } catch (e) {
      if (e.data?.report) setReport(e.data.report);
      toast({ tone: 'danger', title: 'Chưa gửi', body: e.message, duration: 9000 });
    } finally {
      setBusy('');
    }
  };
  const destructive = mode === 'replace' && report?.deletes > 0;
  const ready = report?.ok && !result && (!destructive || confirmed) && !busy;

  return (
    <section className="card flex min-w-0 flex-col gap-3 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold">{ds.label}</h2>
          <p className="text-xs text-ink-2">{ds.description}</p>
          <p className="mt-1 text-xs text-muted">
            Vị trí: {GEOMETRY[ds.geometry]} · Định dạng: {ds.formats.join(', ')}
            {ds.update_only && ' · Chỉ cập nhật bản ghi đã có'}
            {!submitMode && ds.submittable && ' · Xã/phường gửi được (cấp tỉnh duyệt)'}
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

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Cách nhập:</span>
        <button className={clsx('chip px-3 py-1', method === 'file' ? 'bg-accent text-white' : 'bg-panel2')} onClick={() => { setMethod('file'); clear(); }}>
          <FileSpreadsheet size={13} /> Tải tệp lên
        </button>
        <button className={clsx('chip px-3 py-1', method === 'form' ? 'bg-accent text-white' : 'bg-panel2')} onClick={() => { setMethod('form'); clear(); }}>
          <PencilLine size={13} /> Điền trực tiếp
        </button>
      </div>

      {ds.replaceable && (
        <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <legend className="mb-1">Chế độ</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="mode" checked={mode === 'upsert'} onChange={() => { setMode('upsert'); clear(); }} />
            Thêm mới & cập nhật
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="mode" checked={mode === 'replace'} onChange={() => { setMode('replace'); clear(); }} />
            Thay toàn bộ{submitMode ? ' trong xã mình' : ''} (xoá bản ghi không có trong dữ liệu gửi)
          </label>
        </fieldset>
      )}

      {method === 'file' ? (
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
          <button className="btn-primary" disabled={!file || !!busy} onClick={() => check()}>
            {busy === 'validate' ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />} Kiểm tra tệp
          </button>
        </div>
      ) : (
        <RecordForm ds={ds} communes={communes} onReady={(f) => { setFile(f); check(f); }} />
      )}

      {report && <ReportView report={report} />}

      {report?.ok && !result && (
        <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
          {submitMode && (
            <label className="flex flex-col gap-1 text-sm">
              Ghi chú gửi cấp tỉnh (không bắt buộc)
              <textarea className="input min-h-[56px]" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="VD: Cập nhật theo phương án ứng phó năm 2026 của UBND xã" />
            </label>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {destructive ? (
              <label className="flex items-center gap-2 text-sm text-danger">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                Tôi hiểu {report.deletes} bản ghi hiện có sẽ bị xoá{submitMode ? ' khi được duyệt' : ''}
              </label>
            ) : (
              <span className="flex items-center gap-2 text-sm text-good">
                <ShieldCheck size={16} /> Dữ liệu hợp lệ — sẵn sàng {submitMode ? 'gửi' : 'nhập'}
              </span>
            )}
            {submitMode ? (
              <button className={destructive ? 'btn-danger' : 'btn-primary'} disabled={!ready} onClick={submit}>
                {busy === 'submit' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Gửi cấp tỉnh phê duyệt
              </button>
            ) : (
              <button className={destructive ? 'btn-danger' : 'btn-primary'} disabled={!ready} onClick={apply}>
                {busy === 'apply' ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Nhập vào hệ thống
              </button>
            )}
          </div>
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
        <IssueTable title={`${report.error_count} lỗi — sửa dữ liệu rồi kiểm tra lại`} tone="danger" issues={report.errors} total={report.error_count} />
      )}
      {report.warning_count > 0 && (
        <IssueTable title={`${report.warning_count} cảnh báo`} tone="warn" issues={report.warnings} total={report.warning_count} />
      )}
      <PreviewTable rows={report.preview} title={`Xem trước ${report.preview.length} dòng đầu (giá trị sau chuẩn hoá)`} />
    </div>
  );
}
