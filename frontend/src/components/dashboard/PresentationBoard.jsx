import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { int, minutesSince, num } from '../../utils/format';
import { risk } from '../../utils/risk';
import { situationSentence } from './SituationBar';
import { evacFacts, rainFacts, sosFacts } from './kpiFacts';
import { riverSummary, ROMAN } from './RiverKpi';

const wait = (m) => (m >= 60 ? `${Math.floor(m / 60)} giờ ${m % 60} phút` : `${m} phút`);

function Tile({ label, value, note, level }) {
  return (
    <div className={clsx('flex flex-col gap-1 rounded-[18px] border-l-[6px] bg-[#16294A] p-6', level == null ? 'border-l-[#2B3F63]' : risk(level).edge)}>
      <div className="text-lg text-[#CBD5E1]">{label}</div>
      <div className="num text-6xl font-bold leading-none text-white">{value}</div>
      <div className="mt-1 text-lg leading-snug text-[#E2E8F0]">{note}</div>
    </div>
  );
}

/**
 * Màn trình chiếu "Tổng hợp" cho TV phòng điều hành (bản vẽ khung A2): câu tình hình, 4 số lớn, nguy hiểm nhất, đếm ngược tới
 * chuyên đề kế tiếp. Không dải khẩn (quyết định của chủ dự án 03/11/2026). Số thiếu thì nói rõ chưa có, không hiện "an toàn".
 * Chuyên đề khác giữ màn cũ vì cần biểu đồ, bản đồ.
 */
export default function PresentationBoard({ k, waterStations, stationsError, hotspots, area, tabs, tab, onTab, onExit, rotateSec, paused, onTogglePause }) {
  const [left, setLeft] = useState(rotateSec);
  const [now, setNow] = useState(() => new Date());
  // Đếm lại khi đổi chuyên đề hoặc tiếp tục sau tạm dừng — cùng nhịp với bộ tự chuyển ở trang Tổng quan
  useEffect(() => { setLeft(rotateSec); }, [tab, paused, rotateSec]);
  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date());
      if (!paused) setLeft((n) => Math.max(0, n - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [paused]);

  const sentence = k ? situationSentence(k, waterStations, { stationsError }) : null;
  const rain = k?.rain;
  const { known: rainKnown, level: rainLv } = rainFacts(rain);
  const sos = k?.sos || {};
  const { level: sosLv } = sosFacts(sos);
  const oldest = sos.oldest_waiting ? minutesSince(sos.oldest_waiting) : null;
  const river = riverSummary(waterStations);
  const ev = k?.evacuation || {};
  const { planned, pct } = evacFacts(ev);
  const top = (hotspots || []).filter((h) => h.level >= 2).slice(0, 5);
  const clock = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const day = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });

  return (
    <div className="flex min-h-screen flex-col gap-6 bg-[#0B1A33] p-10 text-white">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">PCTT Cao Bằng · {String(area).replace(/ Cao Bằng$/, '')}</h1>
        <span className="num text-xl text-[#CBD5E1]">{clock} · {day}</span>
        <span className="flex-1" />
        {tabs.map(([id, label]) => (
          <button key={id} type="button" onClick={() => onTab(id)} aria-pressed={tab === id} className={clsx('h-11 rounded-full px-5 text-[15px] font-semibold', tab === id ? 'bg-white text-[#0B1A33]' : 'bg-[#16294A] text-[#CBD5E1] hover:text-white')}>{label}</button>
        ))}
        <button type="button" onClick={onExit} className="h-11 rounded-xl border border-[#2B3F63] px-5 text-[15px] font-semibold hover:bg-white/5">Thoát (Esc)</button>
      </div>

      <p className="min-h-[5rem] text-[34px] font-bold leading-snug" role="status" aria-live="polite">
        {sentence ? sentence.text : 'Đang tải số liệu…'}
      </p>

      <div className="grid grid-cols-4 gap-5">
        <Tile
          label="SOS chờ"
          level={sosLv}
          value={k ? int(sos.waiting) : '–'}
          note={sos.waiting > 0 ? `${sos.overdue > 0 ? `${sos.overdue} quá hạn · ` : ''}${oldest != null ? `lâu nhất ${wait(oldest)}` : ''}` : 'Không có phiếu đang chờ'}
        />
        <Tile
          label="Mưa lớn nhất 24 giờ"
          level={rainKnown ? rainLv : null}
          value={rainKnown ? num(rain.max_24h, 0) : '–'}
          note={rainKnown ? `mm · trung bình ${num(rain.avg_24h, 1)} mm` : 'Chưa có số đo mưa'}
        />
        <Tile
          label="Trạm trên báo động"
          level={river.level}
          value={river.rows.length ? `${river.above}/${river.rows.length}` : '–'}
          note={!river.rows.length ? 'Chưa có trạm mực nước' : river.level == null ? 'Chưa đánh giá được' : river.level >= 1 ? `Cao nhất Báo động ${ROMAN[river.level]}` : 'Chưa trạm nào tới Báo động I'}
        />
        <Tile
          label="Đã sơ tán"
          value={planned ? `${pct}%` : '–'}
          note={!planned ? 'Chưa có kế hoạch sơ tán' : ev.planned_persons > 0 ? `${int(ev.evacuated_persons)} / ${int(ev.planned_persons)} người` : `${int(ev.evacuated_households)} / ${int(planned)} hộ`}
        />
      </div>

      <div className="grid flex-1 grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-5">
        <section className="rounded-[18px] bg-[#16294A] p-6" aria-label="Nguy hiểm nhất">
          <h2 className="mb-3 text-lg font-normal text-[#CBD5E1]">Nguy hiểm nhất</h2>
          {top.length ? (
            <ul className="flex flex-col gap-3">
              {top.map((h) => (
                <li key={h.id || h.name} className="flex items-baseline gap-3">
                  <span className={clsx('h-3.5 w-3.5 shrink-0 translate-y-0.5 rounded-full', risk(h.level).fill)} aria-hidden="true" />
                  <b className="shrink-0 text-2xl">{h.name}</b>
                  <span className="truncate text-lg text-[#CBD5E1]">{h.detail}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-xl text-[#CBD5E1]">Chưa ghi nhận điểm mức Cam, Đỏ trong số liệu đang có.</p>}
        </section>
        <section className="rounded-[18px] bg-[#16294A] p-6" aria-label="Tự chuyển chuyên đề">
          <h2 className="text-lg font-normal text-[#CBD5E1]">{paused ? 'Đang tạm dừng tự chuyển' : 'Tự chuyển chuyên đề sau'}</h2>
          <div className="num mt-2 text-6xl font-bold">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</div>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#2B3F63]" aria-hidden="true">
            <div className="h-full rounded-full bg-white" style={{ width: `${(left / rotateSec) * 100}%` }} />
          </div>
          <p className="mt-3 text-[15px] text-[#CBD5E1]">← → đổi chuyên đề · Space tạm dừng</p>
          <button type="button" onClick={onTogglePause} className="mt-3 h-11 rounded-xl border border-[#2B3F63] px-4 text-[15px] font-semibold hover:bg-white/5">{paused ? 'Tiếp tục tự chuyển' : 'Dừng tự chuyển'}</button>
        </section>
      </div>
    </div>
  );
}
