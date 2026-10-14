import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Bot, Inbox, Loader2, Sparkles } from 'lucide-react';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { Section } from '../common/ui';
import { INCIDENT, PRIORITY, SOURCE, VULNERABLE } from '../../utils/labels';

/** Tiếp nhận đa kênh & bóc tách tin nhắn (thiết kế D.1): trực ban dán tin Zalo / SMS / lời gọi, kiểm tra phân loại rồi tạo phiếu. */
export default function Intake() {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const [text, setText] = useState('');
  const [source, setSource] = useState('ZALO');
  const [phone, setPhone] = useState('');
  const [parsed, setParsed] = useState(null);
  const [edit, setEdit] = useState(null); // kết quả bóc tách trực ban đã sửa (mức ưu tiên, số người, loại, nhóm yếu thế)
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false); // chống bấm đúp → 2 phiếu SOS trùng

  const analyze = async () => {
    setBusy(true);
    try {
      const p = await api('/sos/parse', { method: 'POST', body: { text } });
      setParsed(p);
      setEdit({ incident_type: p.incident_type, priority: p.priority, trapped_count: String(p.trapped_count ?? 0), vulnerable: p.vulnerable || [] });
    } catch (e) {
      // Trước đây lỗi (mất mạng, máy chủ) bị nuốt — nút quay xong không báo gì
      toast({ tone: 'danger', title: 'Không bóc tách được tin nhắn', body: e.message });
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    setCreating(true);
    try {
      // Đã bóc tách: gửi kết quả trực ban đã kiểm tra / sửa; chưa bóc tách: máy chủ tự bóc tách từ nội dung
      const fields = edit
        ? { incident_type: edit.incident_type, priority: edit.priority, vulnerable: edit.vulnerable, trapped_count: edit.trapped_count === '' ? null : Number(edit.trapped_count) }
        : {};
      const t = await api('/sos', { method: 'POST', body: { raw_message: text, source, reporter_phone: phone || null, ...fields } });
      toast({ tone: 'good', title: `Đã tạo phiếu ${t.code}`, body: `${INCIDENT[t.incident_type]} – ${t.address}` });
      if (t.possible_duplicates?.length) {
        // Cùng SĐT hoặc cách < 200 m trong 30 phút, chưa hoàn thành → kiểm tra trước khi điều thêm đội
        toast({ tone: 'warn', title: `${t.code} có thể trùng với ${t.possible_duplicates.join(', ')}`, body: 'Kiểm tra trước khi điều động — tránh điều 2 đội tới cùng một nơi.', duration: 12000 });
      }
      setText('');
      setParsed(null);
      setEdit(null);
      setPhone('');
      qc.invalidateQueries({ queryKey: ['sos'] });
    } catch (e) {
      toast({ tone: 'danger', title: 'Không tạo được phiếu', body: e.message });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Section title="Tiếp nhận đa kênh & Bóc tách AI" right={<Bot size={16} className="text-accent" />}>
      <div className="flex flex-col gap-2.5">
        <div className="flex gap-2">
          <select
            className="input tap w-auto text-xs"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            aria-label="Kênh tiếp nhận"
          >
            {['ZALO', 'APP', 'HOTLINE', 'CAN_BO'].map((s) => (
              <option key={s} value={s}>{SOURCE[s]}</option>
            ))}
          </select>
          <input
            className="input tap text-xs"
            placeholder="Số điện thoại người báo tin..."
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <textarea
          className="input min-h-[85px] text-xs leading-relaxed"
          placeholder="Dán tin nhắn cầu cứu từ người dân (Zalo, SMS, gọi điện). Ví dụ: Nước ngập đến mái nhà ở xóm Pác Bó xã Trường Hà, 5 người có 1 cụ già và 2 trẻ em đang leo lên xà nhà..."
          value={text}
          onChange={(e) => { setText(e.target.value); setParsed(null); setEdit(null); }}
        />

        <div className="flex items-center gap-2">
          <button
            className="btn-ghost tap text-xs px-3 py-1.5"
            disabled={text.length < 8 || busy}
            onClick={analyze}
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} className="text-accent" />}
            <span>Bóc tách thông tin</span>
          </button>
          <button
            className="btn-danger tap ml-auto text-xs px-3 py-1.5 font-semibold"
            disabled={text.length < 8 || creating}
            onClick={create}
          >
            <Inbox size={13} />
            <span>Tạo phiếu SOS</span>
          </button>
        </div>

        {parsed && edit && (
          // Kết quả bóc tách SỬA ĐƯỢC trước khi tạo phiếu: quy tắc / mô hình có thể đánh giá thấp (VD mắc kẹt trên mái là Cấp 1)
          <div className="rounded-xl bg-panel2 p-3 text-xs space-y-2 border border-line">
            <div className="font-semibold text-accent">
              Phân loại tự động ({parsed.engine === 'rules' ? 'Quy tắc' : 'Mô hình AI'}) — kiểm tra, sửa nếu cần rồi tạo phiếu
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-0.5">
                <span className="text-muted">Loại sự cố</span>
                <select className="input tap py-1 text-xs" value={edit.incident_type} onChange={(e) => setEdit({ ...edit, incident_type: e.target.value })}>
                  {Object.entries(INCIDENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-muted">Mức ưu tiên</span>
                <select className="input tap py-1 text-xs" value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: Number(e.target.value) })}>
                  {[1, 2, 3].map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-muted">Số người</span>
                <input className="input tap py-1 text-xs" type="number" min={0} value={edit.trapped_count} onChange={(e) => setEdit({ ...edit, trapped_count: e.target.value })} />
              </label>
              <div className="flex flex-col gap-0.5">
                <span className="text-muted">Địa bàn</span>
                <b className={clsx('py-1', !parsed.place && 'text-danger')}>{parsed.place ? parsed.place.name : 'Cần cán bộ xác minh toạ độ'}</b>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted">Nhóm yếu thế:</span>
              {Object.entries(VULNERABLE).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={edit.vulnerable.includes(k)}
                  className={clsx('chip tap px-2 py-0.5', edit.vulnerable.includes(k) ? 'bg-danger text-white' : 'bg-panel text-ink-2')}
                  onClick={() => setEdit({ ...edit, vulnerable: edit.vulnerable.includes(k) ? edit.vulnerable.filter((x) => x !== k) : [...edit.vulnerable, k] })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
