import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis, Cell } from 'recharts';
import { useAreaQuery } from '../../api/hooks';
import { num } from '../../utils/format';
import { LEVEL } from '../../utils/labels';
import { EmptyState, ErrorState, Skeleton } from '../common/ui';
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
      <div className="mt-1">Mưa 3 ngày qua: <b className="num">{num(p.rain_72h, 1)} mm</b></div>
      <div>Cường độ hiện tại: <b className="num">{num(p.intensity, 1)} mm/giờ</b></div>
      {p.tilt_nearby != null && <div>Độ nghiêng cảm biến gần nhất: <b className="font-mono">{p.tilt_nearby}°</b></div>}
      <div className="mt-1"><span className={`chip ${LEVEL[p.risk]?.cls || 'bg-panel2'}`}>Nguy cơ {LEVEL[p.risk]?.label || p.risk || 'Theo dõi'}</span></div>
    </div>
  );
}

/** Ngưỡng kích hoạt sạt lở: mưa tích lũy 3 ngày (x) vs cường độ mưa hiện tại (y), phân loại Đỏ/Cam/Vàng.
 * Mỗi chấm là một TRẠM ĐO MƯA (không phải điểm sạt lở); đường ngưỡng là đường cong minh hoạ của backend
 * (api/v1/dashboard.py THRESHOLD_A) — chưa hiệu chỉnh theo số liệu sạt lở của tỉnh, nên ghi rõ dưới biểu đồ. */
export default function LandslideScatter({ height = 250 }) {
  const c = useChartTheme();
  const { data, isError, refetch } = useAreaQuery('landslide', '/dashboard/landslide-risk', {}, { refetchInterval: 60_000 });
  if (!data) {
    return isError ? <ErrorState height={height} onRetry={refetch}>Không tải được số liệu ngưỡng sạt lở</ErrorState> : <Skeleton height={height} />;
  }
  if (!data.points.length) {
    return (
      <EmptyState height={height}>
        Chưa có trạm đo mưa nào có số đo 3 ngày qua trong vùng đang xem — chưa đánh giá được ngưỡng sạt lở
      </EmptyState>
    );
  }
  const color = { do: c.danger, cam: c.serious, vang: c.warn, an_toan: c.good };
  const yMax = Math.max(30, Math.ceil((Math.max(...data.points.map((p) => p.intensity || 0)) * 1.4) / 10) * 10);
  const counts = Object.fromEntries(RISK_ORDER.map((k) => [k, data.points.filter((p) => p.risk === k).length]));

  return (
    <div>
      <Legend
        items={[
          ...RISK_ORDER.map((k) => ({ label: `${LEVEL[k].label} (${counts[k]})`, color: color[k] })),
          { label: 'Ngưỡng Vàng', color: c.warn, dashed: true },
          { label: 'Ngưỡng Cam', color: c.serious, dashed: true },
          { label: 'Ngưỡng Đỏ', color: c.danger, dashed: true },
        ]}
      />
      <div className="mt-1 flex items-center justify-between text-[11px] font-medium text-muted">
        <span>Trục đứng: Cường độ mưa (mm/giờ) · Trục ngang: Mưa 3 ngày qua (mm)</span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart margin={{ top: 10, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={c.grid} />
          <XAxis dataKey="rain_72h" type="number" domain={[0, 600]} ticks={[0, 150, 300, 450, 600]} {...axisProps(c)} />
          <YAxis dataKey="intensity" type="number" domain={[0, yMax]} allowDataOverflow width={38} {...axisProps(c)} />
          <Tooltip content={<Tip />} cursor={{ strokeDasharray: '3 3', stroke: c.axis }} />
          {data.thresholds?.vang && <Line data={data.thresholds.vang} dataKey="intensity" stroke={c.warn} strokeDasharray="4 3" strokeWidth={1.5} dot={false} isAnimationActive={false} legendType="none" tooltipType="none" />}
          {data.thresholds?.cam && <Line data={data.thresholds.cam} dataKey="intensity" stroke={c.serious} strokeDasharray="5 4" strokeWidth={1.6} dot={false} isAnimationActive={false} legendType="none" tooltipType="none" />}
          {data.thresholds?.do && <Line data={data.thresholds.do} dataKey="intensity" stroke={c.danger} strokeDasharray="5 4" strokeWidth={1.8} dot={false} isAnimationActive={false} legendType="none" tooltipType="none" />}
          <Scatter data={data.points} isAnimationActive={false}>
            {data.points.map((p) => (
              <Cell key={p.id} fill={color[p.risk]} stroke={c.panel} strokeWidth={2} r={7} />
            ))}
          </Scatter>
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-xs text-muted">
        Mỗi chấm là một trạm đo mưa. Đường ngưỡng là đường minh hoạ, chưa hiệu chỉnh theo số liệu sạt lở của tỉnh.
      </p>
    </div>
  );
}
