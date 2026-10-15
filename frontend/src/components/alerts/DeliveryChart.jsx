import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axisProps, Legend, useChartTheme } from '../charts/chartTheme';
import { CHANNEL } from '../../utils/labels';
import { int, pct } from '../../utils/format';

const ROW_H = 36;
const ORDER = ['SMS', 'CELL_BROADCAST', 'ZALO_OA', 'PUSH', 'LOA'];

/** Hộp chú thích một kênh: số tuyệt đối (đã nhận / đã gửi / cần gửi / đã xem) — thanh chỉ cho thấy phần trăm. */
function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="card px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-ink">{r.name}</div>
      <div className="font-mono text-ink-2">Đã nhận {int(r.delivered)} / {int(r.target)} ({r.pDelivered}%)</div>
      <div className="font-mono text-ink-2">Đã gửi {int(r.sent)} ({pct(r.sent, r.target)}%)</div>
      {r.read != null && <div className="font-mono text-ink-2">Đã xem {int(r.read)} ({pct(r.read, r.target)}%)</div>}
    </div>
  );
}

/**
 * Bảng giám sát tỉ lệ chuyển giao (thiết kế E.4): mỗi kênh một thanh 0–100% (một trục — số người nhận các kênh chênh hàng
 * nghìn lần nên so phần trăm), cộng mọi cảnh báo đang hiệu lực: đã nhận (đậm) · đã gửi chưa nhận (nhạt) · chưa gửi (xám), số
 * % đã nhận ở cuối thanh; hộp chú thích ghi số tuyệt đối, đã xem (Zalo / ứng dụng). Kênh chưa tích hợp cổng gửi tin → nói
 * thẳng chưa có số liệu, không vẽ tỉ lệ giả.
 */
export default function DeliveryChart({ broadcasts, factsOf }) {
  const c = useChartTheme();
  const live = broadcasts.filter((b) => factsOf(b).live);
  const portal = live.filter((b) => factsOf(b).portalOnly).length;
  const acc = {};
  for (const b of live) {
    for (const [ch, v] of Object.entries(b.metrics || {})) {
      if (v?.integrated === false) continue;
      const a = (acc[ch] ||= { target: 0, sent: 0, delivered: 0, read: null });
      a.target += v.target || 0;
      a.sent += v.sent || 0;
      a.delivered += v.delivered || 0;
      if (v.read != null) a.read = (a.read || 0) + v.read;
    }
  }
  const data = ORDER.filter((ch) => acc[ch]?.target).map((ch) => {
    const a = acc[ch];
    const pDelivered = pct(a.delivered, a.target);
    const pSent = Math.max(0, pct(a.sent, a.target) - pDelivered);
    return { name: CHANNEL[ch], ...a, pDelivered, pSent, pRest: Math.max(0, 100 - pDelivered - pSent) };
  });
  const label = `Tỉ lệ đã nhận theo kênh: ${data.map((d) => `${d.name} ${d.pDelivered}%`).join('; ')}`;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="text-sm font-semibold text-ink">Chuyển giao theo kênh <span className="text-xs font-normal text-muted">· {live.length} cảnh báo đang hiệu lực</span></h3>
      {portal > 0 && (
        <p className="rounded-lg border border-dashed border-warn/70 bg-warn/10 p-2 text-xs text-ink-2">
          <b className="text-ink">{portal} cảnh báo chưa có số liệu chuyển giao</b> — kênh SMS / Zalo / Cell Broadcast chưa tích hợp cổng gửi tin:
          tin mới được công bố trên cổng công khai và bản nhẹ, chưa tới điện thoại người dân.
        </p>
      )}
      {data.length ? (
        <>
          <Legend
            items={[
              { label: 'Đã nhận', color: c.s1 },
              { label: 'Đã gửi, chưa nhận', color: `${c.s1}59` },
              { label: 'Chưa gửi', color: c.shortage },
            ]}
          />
          <div role="img" aria-label={label}>
            <ResponsiveContainer width="100%" height={data.length * ROW_H + 28}>
              <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 4 }} barCategoryGap="28%">
                <CartesianGrid stroke={c.grid} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} {...axisProps(c)} />
                <YAxis type="category" dataKey="name" width={104} interval={0} {...axisProps(c)} />
                <Tooltip content={<Tip />} cursor={{ fill: c.grid, opacity: 0.35 }} />
                <Bar dataKey="pDelivered" name="Đã nhận" stackId="a" fill={c.s1} stroke={c.panel} strokeWidth={2} isAnimationActive={false} />
                <Bar dataKey="pSent" name="Đã gửi, chưa nhận" stackId="a" fill={c.s1} fillOpacity={0.35} stroke={c.panel} strokeWidth={2} isAnimationActive={false} />
                <Bar dataKey="pRest" name="Chưa gửi" stackId="a" fill={c.shortage} stroke={c.panel} strokeWidth={2} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  <LabelList
                    dataKey="pDelivered"
                    content={({ x, y, width, height: h, index }) => (
                      <text x={x + width + 6} y={y + h / 2} dy={4} fontSize={11} fill={c.ink} fontFamily="ui-monospace, monospace">{data[index].pDelivered}%</text>
                    )}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : !portal && (
        <p className="py-6 text-center text-xs text-muted">{live.length ? 'Chưa có số liệu giao nhận' : 'Không có cảnh báo đang hiệu lực'}</p>
      )}
    </div>
  );
}
