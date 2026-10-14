import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axisProps, Legend, useChartTheme } from '../charts/chartTheme';
import { FORCE_TYPE, RES_STATUS, VEHICLE_CAT } from '../../utils/labels';
import { int } from '../../utils/format';

const ROW_H = 34;

/** Hộp chú thích khi rê / chạm một cột: số và % của từng phần, tổng. Chữ dùng màu chữ, ô màu bên cạnh mang nhận diện. */
function Tip({ active, payload, parts, unit }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="card px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-ink">{row.name}</div>
      {parts.map((p) => (
        <div key={p.key} className="flex items-center gap-2 py-0.5 text-ink-2">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} aria-hidden="true" />
          {p.label}
          <span className="ml-auto pl-3 font-mono font-semibold text-ink">
            {int(row[p.key])} {unit}{row.total ? ` · ${Math.round((100 * row[p.key]) / row.total)}%` : ''}
          </span>
        </div>
      ))}
      <div className="mt-1 border-t border-line/60 pt-1 text-muted">Tổng {int(row.total)} {unit}</div>
    </div>
  );
}

/**
 * Cột chồng nằm ngang (một trục): mỗi hàng một nhóm, các phần theo tình trạng — màu trạng thái của thiết kế C (xanh sẵn
 * sàng · vàng nhiệm vụ · đỏ hỏng / bảo dưỡng; xám = chưa sẵn sàng), luôn kèm chú giải và hộp chú thích (không chỉ dựa vào
 * màu). Nhãn cuối cột: "sẵn sàng / tổng". Danh sách bên dưới là bảng số liệu đầy đủ.
 */
function StackedBars({ data, parts, unit, label }) {
  const c = useChartTheme();
  const height = data.length * ROW_H + 28;
  return (
    <div className="flex flex-col gap-2">
      <Legend items={parts.map((p) => ({ label: p.label, color: p.color }))} />
      <div role="img" aria-label={label}>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }} barCategoryGap="28%">
            <CartesianGrid stroke={c.grid} horizontal={false} />
            <XAxis type="number" allowDecimals={false} {...axisProps(c)} />
            <YAxis type="category" dataKey="name" width={96} interval={0} {...axisProps(c)} />
            <Tooltip content={<Tip parts={parts} unit={unit} />} cursor={{ fill: c.grid, opacity: 0.35 }} />
            {parts.map((p, i) => (
              <Bar
                key={p.key}
                dataKey={p.key}
                name={p.label}
                stackId="a"
                fill={p.color}
                stroke={c.panel}
                strokeWidth={2}
                radius={i === parts.length - 1 ? [0, 4, 4, 0] : 0}
                isAnimationActive={false}
              >
                {i === parts.length - 1 && (
                  <LabelList
                    dataKey="total"
                    position="right"
                    content={({ x, y, width, height: h, index }) => (
                      <text x={x + width + 6} y={y + h / 2} dy={4} fontSize={11} fill={c.ink} fontFamily="ui-monospace, monospace">
                        {int(data[index].ready)}/{int(data[index].total)}
                      </text>
                    )}
                  />
                )}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Quân số theo loại lực lượng (thiết kế C.1): sẵn sàng / đang nhiệm vụ / chưa sẵn sàng — từ danh sách đơn vị đang lọc. */
export function ForceReadinessChart({ forces }) {
  const c = useChartTheme();
  const groups = {};
  for (const f of forces) {
    const g = (groups[f.org_type] ||= { name: FORCE_TYPE[f.org_type] || f.org_type, ready: 0, mission: 0, total: 0 });
    g.ready += f.personnel_ready || 0;
    g.mission += f.personnel_on_mission || 0;
    g.total += f.personnel_total || 0;
  }
  const data = Object.values(groups)
    .map((g) => ({ ...g, rest: Math.max(0, g.total - g.ready - g.mission) }))
    .sort((a, b) => b.total - a.total);
  const parts = [
    { key: 'ready', label: RES_STATUS.san_sang.label, color: c.good },
    { key: 'mission', label: RES_STATUS.nhiem_vu.label, color: c.warn },
    { key: 'rest', label: 'Chưa sẵn sàng', color: c.shortage },
  ];
  return <StackedBars data={data} parts={parts} unit="người" label={`Quân số theo loại lực lượng: ${data.map((d) => `${d.name} ${d.ready}/${d.total} sẵn sàng`).join('; ')}`} />;
}

/** Phương tiện theo nhóm (đường thủy / đường bộ / thiết bị) và tình trạng (thiết kế C.3) — từ danh sách đang lọc. */
export function VehicleStatusChart({ vehicles }) {
  const c = useChartTheme();
  const data = Object.entries(VEHICLE_CAT)
    .map(([cat, name]) => {
      const list = vehicles.filter((v) => v.category === cat);
      const n = (s) => list.filter((v) => v.status === s).length;
      return { name, ready: n('san_sang'), mission: n('nhiem_vu'), broken: n('bao_duong'), total: list.length };
    })
    .filter((d) => d.total > 0);
  const parts = [
    { key: 'ready', label: RES_STATUS.san_sang.label, color: c.good },
    { key: 'mission', label: RES_STATUS.nhiem_vu.label, color: c.warn },
    { key: 'broken', label: RES_STATUS.bao_duong.label, color: c.danger },
  ];
  return <StackedBars data={data} parts={parts} unit="chiếc" label={`Phương tiện theo nhóm: ${data.map((d) => `${d.name} ${d.ready}/${d.total} sẵn sàng`).join('; ')}`} />;
}
