import { Eye, Send } from 'lucide-react';
import { COMMUNE_SUPPORT_TAG, durWords, isCommuneSupport } from './rescueFacts';
import { usePermission } from '../../rbac/usePermission';

// Nội dung yêu cầu của xã (QuickIncidentModal) nối các câu bằng ". ": tách phần "Cần: …", bỏ thẻ đầu và câu ký tên ở cuối
function parseRequest(t) {
  const parts = String(t.raw_message || '').replace(COMMUNE_SUPPORT_TAG, '').trim().split(/\.\s+/).map((x) => x.trim()).filter(Boolean);
  const need = parts.find((x) => x.startsWith('Cần:'));
  const desc = parts.filter((x) => x !== need && !x.startsWith('(Yêu cầu chi viện của')).join('. ');
  return { need: need ? need.replace(/^Cần:\s*/, '').replace(/\.$/, '') : '—', desc };
}

function Row({ t, now, online, onDispatch, onOpen }) {
  const canDispatch = usePermission('dispatch', 'create', t.admin_code);
  const commune = isCommuneSupport(t);
  const { need, desc } = commune ? parseRequest(t) : { need: t.field_note || 'Thêm lực lượng', desc: t.address || t.admin_name };
  const since = commune ? t.received_at : t.field_at || t.received_at;
  return (
    <tr className="border-t border-line align-top">
      <td className="px-3 py-2.5">
        <b className="block text-ink">{commune ? t.admin_name : t.force_name || 'Đội tại hiện trường'}</b>
        <span className="num text-xs text-muted">{t.code}</span>
      </td>
      <td className="px-3 py-2.5 text-ink">{need}</td>
      <td className="px-3 py-2.5 text-ink-2">{desc}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-ink-2">{durWords(Math.max(0, (now - new Date(since).getTime()) / 1000))}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right">
        <span className="inline-flex gap-1.5">
          {canDispatch && t.status !== 'hoan_thanh' && (
            <button type="button" className="btn-primary tap h-9 rounded-xl px-3 text-[13px]" disabled={!online} title={online ? undefined : 'Mất mạng — chưa ghi được'} onClick={() => onDispatch(t)}>
              <Send size={13} aria-hidden="true" /> Điều đội
            </button>
          )}
          {onOpen && <button type="button" className="btn-secondary tap h-9 rounded-xl px-3 text-[13px]" onClick={() => onOpen(t)} aria-label={`Xem phiếu ${t.code}`}><Eye size={13} aria-hidden="true" /> Xem</button>}
        </span>
      </td>
    </tr>
  );
}

/**
 * Xã xin chi viện · Đội cần chi viện dạng bảng (máy tính ≥ 1280 px — bản vẽ khung C11): mở khi lọc "Cần chú ý" đúng hai tình huống
 * này. Một dòng một yêu cầu: từ đâu, cần gì, mô tả, chờ bao lâu, điều đội. Danh sách theo đúng bộ lọc của trang.
 */
export default function SupportTable({ rows, title, now, online, onDispatch, onOpen, empty }) {
  return (
    <section className="sheet flex flex-col gap-3 p-5" aria-label={title}>
      <h2 className="text-[15px] font-bold text-ink">{title} <span className="num font-normal text-ink-2">· {rows.length}</span></h2>
      {rows.length ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-bold text-ink-2">
              <th className="px-3 py-2 font-bold">Từ</th>
              <th className="px-3 py-2 font-bold">Cần</th>
              <th className="px-3 py-2 font-bold">Mô tả</th>
              <th className="px-3 py-2 font-bold">Chờ</th>
              <th className="px-3 py-2"><span className="sr-only">Thao tác</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => <Row key={t.id} t={t} now={now} online={online} onDispatch={onDispatch} onOpen={onOpen} />)}
          </tbody>
        </table>
      ) : <p className="py-6 text-center text-sm text-muted">{empty}</p>}
    </section>
  );
}
