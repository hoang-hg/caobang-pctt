import { useRef, useState } from 'react';
import clsx from 'clsx';
import { CloudRain, Waves, Home, Siren, Users, Ship, FileDown, Loader2 } from 'lucide-react';
import { useAreaQuery } from '../api/hooks';
import { useStore } from '../app/store';
import { KpiCard, Progress, Section } from '../components/common/ui';
import EventLog from '../components/common/EventLog';
import Hydrograph from '../components/charts/Hydrograph';
import RainfallChart from '../components/charts/RainfallChart';
import LandslideScatter from '../components/charts/LandslideScatter';
import SuppliesChart from '../components/charts/SuppliesChart';
import AreaForecastChart from '../components/charts/AreaForecastChart';
import { ALARM, alarmLevel } from '../utils/labels';
import { int, minutesSince, num, pct } from '../utils/format';
import { exportSnapshotPdf } from '../utils/exportPdf';

function RiverKpi({ rivers = [] }) {
  const worst = rivers.reduce((m, r) => Math.max(m, alarmLevel(r.value, r.thresholds)), 0);
  return (
    <KpiCard label="Mực nước sông so với Báo động" value={ALARM[worst].label} icon={Waves} tone={['good', 'warn', 'serious', 'danger'][worst]}>
      <div className="mt-1 flex flex-col gap-0.5">
        {rivers.map((r) => {
          const lv = alarmLevel(r.value, r.thresholds);
          return (
            <div key={r.id} className="flex items-center gap-2 text-xs">
              <span className="w-20 truncate text-ink-2">{r.river}</span>
              <span className="font-mono">{num(r.value, 2)} m</span>
              <span className={clsx('chip ml-auto', ALARM[lv].cls)}>{lv ? `BĐ ${['', 'I', 'II', 'III'][lv]}` : 'Dưới BĐ I'}</span>
            </div>
          );
        })}
      </div>
    </KpiCard>
  );
}

export default function Dashboard() {
  const { data: k } = useAreaQuery('kpis', '/dashboard/kpis', {}, { refetchInterval: 30_000 });
  const { data: stations = [] } = useAreaQuery('stations', '/stations', { type: 'muc_nuoc' });
  const filterLabel = useStore((s) => s.filter.label);
  const [stationId, setStationId] = useState('CB-WL-01');
  const [exporting, setExporting] = useState(false);
  const ref = useRef(null);

  const waitOverdue = k?.sos?.overdue > 0;
  const activeStation = stations.find((s) => s.id === stationId) ? stationId : stations[0]?.id || 'CB-WL-01';

  const doExport = async () => {
    setExporting(true);
    try {
      const now = new Date();
      await exportSnapshotPdf(ref.current, {
        title: 'BÁO CÁO NHANH TÌNH HÌNH THIÊN TAI – TỈNH CAO BẰNG',
        subtitle: `Phạm vi: ${filterLabel} · Thời điểm: ${now.toLocaleString('vi-VN')} · Nguồn: Trung tâm Điều hành PCTT & TKCN tỉnh`,
        filename: `bao-cao-nhanh-pctt-cao-bang-${now.toISOString().slice(0, 16).replace(/[:T]/g, '')}.pdf`,
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="text-lg font-bold">Tổng quan tình hình – {filterLabel}</h1>
          <p className="text-xs text-muted">Số liệu khí tượng thủy văn và ứng phó cập nhật thời gian thực</p>
        </div>
        <button className="btn-ghost ml-auto no-print" onClick={doExport} disabled={exporting}>
          {exporting ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />} Xuất PDF báo cáo nhanh
        </button>
      </div>

      <div ref={ref} className="grid gap-3 bg-bg xl:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-3">
          {/* Khối chỉ số nhanh */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
            <KpiCard
              label="Mưa TB lưu vực 24h"
              value={num(k?.rain?.avg_24h, 1)}
              unit="mm"
              icon={CloudRain}
              tone={k?.rain?.max_24h > 150 ? 'serious' : undefined}
              sub={<>Cực đại: <b className="font-mono">{num(k?.rain?.max_24h, 1)} mm</b> · {k?.rain?.max_station?.replace('Trạm đo mưa ', '')}</>}
            />
            <div className="col-span-2 md:col-span-1 2xl:col-span-2">
              <RiverKpi rivers={k?.rivers} />
            </div>
            <KpiCard
              label="Sơ tán an toàn (hộ)"
              value={`${int(k?.evacuation?.evacuated_households)}/${int(k?.evacuation?.planned_households)}`}
              icon={Home}
              sub={`${int(k?.evacuation?.evacuated_persons)} / ${int(k?.evacuation?.planned_persons)} nhân khẩu`}
            >
              <Progress value={pct(k?.evacuation?.evacuated_households, k?.evacuation?.planned_households)} tone="good" className="mt-1" />
            </KpiCard>
            <KpiCard
              label="SOS chờ xử lý"
              value={int(k?.sos?.waiting)}
              icon={Siren}
              tone={waitOverdue ? 'danger' : k?.sos?.waiting ? 'warn' : undefined}
              blink={waitOverdue}
              sub={
                waitOverdue
                  ? <span className="font-semibold text-danger">{k.sos.overdue} phiếu quá 15 phút chưa tiếp nhận (lâu nhất {minutesSince(k.sos.oldest_waiting)}′)</span>
                  : `${int(k?.sos?.in_progress)} đang xử lý · ${int(k?.sos?.resolved_24h)} hoàn thành 24h`
              }
            />
            <KpiCard
              label="Lực lượng ứng trực / nhiệm vụ"
              value={`${int(k?.forces?.ready)}/${int(k?.forces?.on_mission)}`}
              icon={Users}
              sub={
                <span className="flex items-center gap-1">
                  <Ship size={12} /> Xuồng, xe lội nước hoạt động: <b className="font-mono">{int(k?.vehicles?.special_active)}/{int(k?.vehicles?.special_total)}</b>
                </span>
              }
            />
          </div>

          {/* Khối biểu đồ phân tích */}
          <div className="grid gap-3 lg:grid-cols-2">
            <Section
              title="Biểu đồ thủy văn (Hydrograph)"
              right={
                <select className="input w-auto py-1 text-xs" value={activeStation} onChange={(e) => setStationId(e.target.value)} aria-label="Chọn trạm">
                  {stations.map((s) => <option key={s.id} value={s.id}>{s.name.replace('Trạm thủy văn ', '')}</option>)}
                </select>
              }
            >
              <Hydrograph stationId={activeStation} height={250} />
            </Section>
            <Section title="Cường độ mưa & Nowcasting 3 giờ">
              <RainfallChart height={270} />
            </Section>
            <Section title="Dự báo mưa 72 giờ theo xã – tổ hợp ECMWF + GFS (P10–P90)" className="lg:col-span-2">
              <AreaForecastChart height={230} />
            </Section>
            <Section title="Ngưỡng kích hoạt sạt lở (mưa 72h vs cường độ)">
              <LandslideScatter height={240} />
            </Section>
            <Section title="Phân bổ vật tư cứu trợ theo kho (% định mức)">
              <SuppliesChart height={240} />
            </Section>
          </div>
        </div>

        {/* Nhật ký sự kiện */}
        <Section title="Nhật ký sự kiện & luồng cảnh báo" className="xl:max-h-[calc(100vh-7.5rem)]" right={<span className="chip bg-good/15 text-good">LIVE</span>}>
          <EventLog className="max-h-[70vh] xl:max-h-none xl:h-full" limit={50} />
        </Section>
      </div>
    </div>
  );
}
