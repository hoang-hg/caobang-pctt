import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { Modal } from '../common/ui';
import { fmtVn, nowVn } from '../../utils/bulletin';
import { parseStormTable, stormClass } from '../../utils/stormTable';
import { stormQuery } from './MapLayers';

const SAMPLE =
  '19:00 02/10\t19,8N\t110,5E\t14\t17\t300\n13:00 03/10\t20,6N\t108,9E\t13\t16\t250\n01:00 04/10\t21,4N\t107,2E\t11\t14\t200\n13:00 04/10\t22,1N\t105,8E\t7\t9';

/** Trực ban nhập bản tin bão / ATNĐ của Trung tâm Dự báo KTTV quốc gia (quyền monitoring.update): dán bảng mốc tâm bão
 * (đã qua, hiện tại, dự báo). Bản tin mới cùng tên thay bản đang theo dõi; bão tan → "Kết thúc theo dõi". */
export default function StormBulletinModal({ onClose }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const { data: current } = useQuery({ ...stormQuery, retry: false });
  const active = (current?.storms || []).filter((s) => !s.simulated);
  const [name, setName] = useState(active[0]?.name || '');
  const [issued, setIssued] = useState(nowVn);
  const [source, setSource] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const { points, errors } = useMemo(() => parseStormTable(text), [text]);
  const issuedIso = `${issued}:00+07:00`;
  const hasCurrent = points.some((p) => p.time <= issuedIso);

  const run = async (request, done) => {
    setBusy(true);
    try {
      await request();
      toast({ tone: 'good', title: done });
      qc.invalidateQueries({ queryKey: ['storm'] });
      onClose();
    } catch (e) {
      toast({ tone: 'danger', title: 'Không lưu được bản tin bão', body: e.message });
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    run(
      () => api('/map/storm-bulletins', { method: 'POST', body: { name: name.trim(), issued_at: issuedIso, source: source || null, points } }),
      `Đã nhập bản tin ${name.trim()}`,
    );
  const end = (s) => run(() => api(`/map/storm-bulletins/${s.id}`, { method: 'DELETE' }), `Đã kết thúc theo dõi ${s.name}`);

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Bản tin bão / áp thấp nhiệt đới"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button
            className="btn-primary"
            disabled={busy || name.trim().length < 2 || points.length < 2 || errors.length > 0 || !hasCurrent}
            onClick={save}
          >
            Lưu bản tin
          </button>
        </>
      }
    >
      <div className="grid gap-4 text-sm lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          {active.length > 0 && (
            <div className="rounded-lg border border-line p-2 text-xs">
              <div className="mb-1 font-semibold">Đang theo dõi</div>
              {active.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 py-0.5">
                  <span>{s.name} · phát hành {fmtVn(s.issued_at)}</span>
                  <button className="text-danger hover:underline" disabled={busy} onClick={() => end(s)}>Kết thúc theo dõi</button>
                </div>
              ))}
            </div>
          )}
          <label className="flex flex-col gap-1">
            Tên bão / ATNĐ * <span className="text-[11px] text-muted">Trùng tên bản tin đang theo dõi → bản mới thay bản cũ</span>
            <input className="input" maxLength={120} placeholder="VD: Bão số 3 (YAGI)" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              Phát hành lúc (giờ VN) *
              <input className="input" type="datetime-local" value={issued} onChange={(e) => setIssued(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              Nguồn
              <input className="input" maxLength={200} placeholder="VD: TT Dự báo KTTV quốc gia, tin 16h" value={source} onChange={(e) => setSource(e.target.value)} />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            Dán bảng mốc tâm bão: thời điểm · vĩ độ · kinh độ · cấp gió · cấp giật · bán kính gió mạnh cấp 6 (km)
            <textarea className="input min-h-[150px] font-mono text-xs" placeholder={SAMPLE} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
            <span className="text-[11px] text-muted">
              Mỗi dòng một mốc, cột cách nhau bằng Tab (dán từ Excel) hoặc dấu ;. Hai cột cuối có thể bỏ trống. Cần ít nhất một
              mốc tại hoặc trước giờ phát hành (vị trí hiện tại).
            </span>
          </label>
        </div>
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-semibold uppercase text-muted">Xem trước</div>
          {errors.length > 0 && (
            <ul className="rounded-lg border border-danger/40 bg-danger/10 p-2 text-xs text-danger">
              {errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
          {points.length > 0 && !hasCurrent && (
            <p className="rounded-lg bg-warn/15 p-2 text-xs">Thiếu vị trí hiện tại: cần một mốc tại hoặc trước giờ phát hành.</p>
          )}
          <div className="max-h-72 overflow-y-auto rounded-lg border border-line scroll-thin">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-panel2 text-muted">
                <tr><th className="px-2 py-1 text-left">Thời điểm</th><th className="px-2 py-1 text-right">Vị trí</th><th className="px-2 py-1 text-left">Cường độ</th></tr>
              </thead>
              <tbody>
                {points.map((p) => (
                  <tr key={p.time} className="border-t border-line">
                    <td className="px-2 py-1 font-mono">{fmtVn(p.time)}{p.time > issuedIso && <span className="text-muted"> · dự báo</span>}</td>
                    <td className="px-2 py-1 text-right font-mono">{p.lat.toFixed(1)}°N {p.lon.toFixed(1)}°E</td>
                    <td className="px-2 py-1">
                      {p.wind_level != null ? `${stormClass(p.wind_level)} cấp ${p.wind_level}` : '–'}
                      {p.gust_level != null && `, giật ${p.gust_level}`}
                      {p.radius_km != null && ` · ${p.radius_km} km`}
                    </td>
                  </tr>
                ))}
                {!points.length && <tr><td colSpan={3} className="px-2 py-6 text-center text-muted">Chưa có mốc nào</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted">
            Lớp “Quỹ đạo bão” trên bản đồ vẽ đường đã qua (liền), dự báo (nét đứt) và vùng gió mạnh quanh tâm theo thanh thời gian.
            Thao tác được ghi nhật ký.
          </p>
        </div>
      </div>
    </Modal>
  );
}
