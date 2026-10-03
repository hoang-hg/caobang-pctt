import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis, Cell } from 'recharts';
import { useAreaQuery } from '../../api/hooks';
import { LEVEL } from '../../utils/labels';
import { axisProps, Legend, useChartTheme } from './chartTheme';

const RISK_ORDER = ['do', 'cam', 'vang', 'an_toan'];

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload.find((x) => x.payload?.name)?.payload;
  if (!p) return null;
  return (
    <div className="card px-3 py-2 text-xs shadow-lg">
      <div className="font-semibold">{p.name}</div>
      <div className="text-muted">{p.admin_name}</div>
      <div className="mt-1">Mưa tích lũy 72h: <b className="font-mono">{p.rain_72h} mm</b></div>
      <div>Cường độ hiện tại: <b className="font-mono">{p.intensity} mm/h</b></div>
      {p.tilt_nearby != null && <div>Độ nghiêng cảm biến gần nhất: <b className="font-mono">{p.tilt_nearby}°</b></div>}
      <div className="mt-1"><span className={`chip ${LEVEL[p.risk]?.cls || 'bg-panel2'}`}>Nguy cơ {LEVEL[p.risk]?.label || p.risk || 'Theo dõi'}</span></div>
    </div>
  );
}

/** Ngưỡng kích hoạt sạt lở: mưa tích lũy 3 ngày (x) vs cường độ mưa hiện tại (y), phân loại Đỏ/Cam/Vàng. */
export default function LandslideScatter({ height = 250 }) {
  const c = useChartTheme();
  const { data } = useAreaQuery('landslide', '/dashboard/landslide-risk', {}, { refetchInterval: 60_000 });
  if (!data) return <div style={{ height }} className="animate-pulse rounded-lg bg-panel2" />;
  const color = { do: c.danger, cam: c.serious, vang: c.warn, an_toan: c.good };
  const yMax = Math.max(30, Math.ceil((Math.max(...data.points.map((p) => p.intensity || 0)) * 1.4) / 10) * 10);
  const counts = Object.fromEntries(RISK_ORDER.map((k) => [k, data.points.filter((p) => p.risk === k).length]));

  return (
    <div>
      <Legend
        items={[
          ...RISK_ORDER.map((k) => ({ label: `${LEVEL[k].label} (${counts[k]})`, color: color[k] })),
          { label: 'Ngưỡng kích hoạt Cam / Đỏ', color: c.axis, dashed: true },
        ]}
      />
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart margin={{ top: 10, right: 12, bottom: 12, left: -8 }}>
          <CartesianGrid stroke={c.grid} />
          <XAxis dataKey="rain_72h" type="number" domain={[0, 600]} ticks={[0, 150, 300, 450, 600]} {...axisProps(c)}
            label={{ value: 'Mưa tích lũy 72h (mm)', position: 'insideBottom', offset: -6, fill: c.axis, fontSize: 10 }} />
          <YAxis dataKey="intensity" type="number" domain={[0, yMax]} allowDataOverflow width={48} {...axisProps(c)}
            label={{ value: 'mm/h', angle: -90, position: 'insideLeft', fill: c.axis, fontSize: 10, dx: 16 }} />
          <Tooltip content={<Tip />} cursor={{ strokeDasharray: '3 3', stroke: c.axis }} />
          <Line data={data.thresholds.cam} dataKey="intensity" stroke={c.serious} strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} legendType="none" tooltipType="none" />
          <Line data={data.thresholds.do} dataKey="intensity" stroke={c.danger} strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} legendType="none" tooltipType="none" />
          <Scatter data={data.points} isAnimationActive={false}>
            {data.points.map((p) => (
              <Cell key={p.id} fill={color[p.risk]} stroke={c.panel} strokeWidth={2} r={7} />
            ))}
          </Scatter>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
