import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { Modal } from '../common/ui';
import { parseBulletin } from '../../utils/bulletin';
import { ALARM, alarmLevel } from '../../utils/labels';

const fmt = (iso) => new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
// Giờ Việt Nam hiện tại dạng "YYYY-MM-DDTHH:mm" cho ô datetime-local (máy trực ban có thể đặt sai múi giờ)
const nowVn = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 16);

const SAMPLE = '07:00 04/10\t180,45\n13:00 04/10\t181,10\n19:00 04/10\t181,60\n01:00 05/10\t181,20';

/** Trực ban nhập bản tin dự báo mực nước của Đài KTTV (quyền monitoring.update): dán bảng 2 cột "thời điểm – mực nước"
 * từ Excel / văn bản → Hydrograph vẽ nét đứt sau số đo thực. Bản tin mới thay toàn bộ bản tin cũ của trạm. */
export default function ForecastBulletinModal({ stations, stationId, onClose }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const [sid, setSid] = useState(stationId);
  const [text, setText] = useState('');
  const [issued, setIssued] = useState(nowVn);
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const station = stations.find((s) => s.id === sid);
  const thr = station?.thresholds || {};
  const { points, errors } = useMemo(() => parseBulletin(text), [text]);
  const peak = points.reduce((best, p) => (!best || p.value > best.value ? p : best), null);
  const { data: series } = useQuery({
    queryKey: ['series', sid, 48],
    queryFn: () => api(`/stations/${encodeURIComponent(sid)}/series`, { params: { hours: 48 } }),
    enabled: !!sid,
  });
  const current = (series?.forecast || []).filter((f) => f.model === 'KTTV');

  const run = async (request, done) => {
    setBusy(true);
    try {
      await request();
      toast({ tone: 'good', title: done });
      qc.invalidateQueries({ queryKey: ['series'] });
      onClose();
    } catch (e) {
      toast({ tone: 'danger', title: 'Không lưu được bản tin', body: e.message });
    } finally {
      setBusy(false);
    }
  };
  const url = `/stations/${encodeURIComponent(sid)}/forecast`;
  const save = () =>
    run(
      () => api(url, { method: 'PUT', body: { points, issued_at: `${issued}:00+07:00`, source: source || null } }),
      `Đã nhập bản tin dự báo ${station?.name || sid}`,
    );
  const remove = () => run(() => api(url, { method: 'DELETE' }), `Đã gỡ bản tin dự báo ${station?.name || sid}`);

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Nhập bản tin dự báo mực nước (KTTV)"
      footer={
        <>
          {current.length > 0 && (
            <button className="btn-ghost mr-auto text-danger" disabled={busy} onClick={remove}>
              Gỡ bản tin
            </button>
          )}
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" disabled={busy || !points.length || errors.length > 0 || !issued} onClick={save}>
            Lưu bản tin
          </button>
        </>
      }
    >
      <div className="grid gap-4 text-sm lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            Trạm mực nước *
            <select className="input" value={sid} onChange={(e) => setSid(e.target.value)}>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <span className="text-[11px] text-muted">
              {current.length
                ? `Đang có bản tin ${current.length} mốc, phát hành ${fmt(current[0].issued_at)} — lưu sẽ thay toàn bộ`
                : 'Trạm chưa có bản tin dự báo'}
            </span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              Phát hành lúc (giờ VN) *
              <input className="input" type="datetime-local" value={issued} onChange={(e) => setIssued(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              Nguồn
              <input className="input" maxLength={200} placeholder="VD: Đài KTTV tỉnh, bản tin 15h" value={source} onChange={(e) => setSource(e.target.value)} />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            Dán bảng dự báo: mỗi dòng một mốc, thời điểm rồi mực nước (m)
            <textarea
              className="input min-h-[180px] font-mono text-xs"
              placeholder={SAMPLE}
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
            />
            <span className="text-[11px] text-muted">
              Chọn 2 cột trong Excel rồi dán. Giờ viết 07:00 04/10, 7h 04/10/2026 hoặc 2026-10-04 07:00; mực nước 180,45 hoặc 180.45.
            </span>
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-semibold uppercase text-muted">Xem trước</div>
          {errors.length > 0 && (
            <ul className="rounded-lg border border-danger/40 bg-danger/10 p-2 text-xs text-danger">
              {errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}
              {errors.length > 8 && <li>… và {errors.length - 8} dòng lỗi khác</li>}
            </ul>
          )}
          {peak && (
            <div className="rounded-lg bg-panel2 p-2 text-xs">
              Đỉnh dự báo <b className="font-mono">{peak.value.toFixed(2)} m</b> lúc {fmt(peak.time)}{' '}
              <span className={clsx('chip ml-1', ALARM[alarmLevel(peak.value, thr)].cls)}>{ALARM[alarmLevel(peak.value, thr)].label}</span>
            </div>
          )}
          <div className="max-h-72 overflow-y-auto rounded-lg border border-line scroll-thin">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-panel2 text-muted">
                <tr><th className="px-2 py-1 text-left">Thời điểm</th><th className="px-2 py-1 text-right">Mực nước (m)</th><th className="px-2 py-1 text-right">Mức</th></tr>
              </thead>
              <tbody>
                {points.map((p) => {
                  const lv = alarmLevel(p.value, thr);
                  return (
                    <tr key={p.time} className="border-t border-line">
                      <td className="px-2 py-1 font-mono">{fmt(p.time)}</td>
                      <td className="px-2 py-1 text-right font-mono">{p.value.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right">{lv ? ALARM[lv].label : '–'}</td>
                    </tr>
                  );
                })}
                {!points.length && (
                  <tr><td colSpan={3} className="px-2 py-6 text-center text-muted">Chưa có mốc nào</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted">
            Ngưỡng của trạm: BĐ I {thr.bd1 ?? '–'} · BĐ II {thr.bd2 ?? '–'} · BĐ III {thr.bd3 ?? '–'} m. Máy chủ từ chối mốc lệch ngưỡng
            quá 50 m (gõ thừa / thiếu chữ số). Thao tác được ghi nhật ký.
          </p>
        </div>
      </div>
    </Modal>
  );
}
