import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  CloudRain, Waves, Home, Siren, Users, Ship, FileDown, Loader2, MapPin, X, ArrowUpRight,
  Droplets, Mountain, LayoutDashboard
} from 'lucide-react';
import { useAreaQuery } from '../api/hooks';
import { useStore } from '../app/store';
import { KpiCard, Progress, Section } from '../components/common/ui';
import EventLog from '../components/common/EventLog';
import Hydrograph from '../components/charts/Hydrograph';
import RainfallChart from '../components/charts/RainfallChart';
import LandslideScatter from '../components/charts/LandslideScatter';
import SuppliesChart from '../components/charts/SuppliesChart';
import AreaForecastChart from '../components/charts/AreaForecastChart';
import ForecastBulletinModal from '../components/charts/ForecastBulletinModal';
import { usePermission } from '../rbac/usePermission';
import { ALARM, alarmLevel } from '../utils/labels';
import { int, num, pct } from '../utils/format';
import { exportSnapshotPdf } from '../utils/exportPdf';
import ReservoirMonitor from './public/ReservoirMonitor';
import LandslideMonitor, { maxTiltText } from './public/LandslideMonitor';

function RiverKpi({ rivers = [] }) {
  const worst = rivers.reduce((m, r) => Math.max(m, alarmLevel(r.value, r.thresholds)), 0);
  return (
    <KpiCard
      label="Mực nước sông"
      value={ALARM[worst].label}
      icon={Waves}
      tone={['good', 'warn', 'serious', 'danger'][worst]}
    >
      <div className="mt-2 flex flex-col gap-1 border-t border-line/60 pt-2">
        {rivers.map((r) => {
          const lv = alarmLevel(r.value, r.thresholds);
          return (
            <div key={r.id} className="flex items-center justify-between text-xs py-0.5">
              <span className="truncate max-w-[80px] font-medium text-ink-2">{r.river}</span>
              <span className="font-mono text-ink font-semibold">{num(r.value, 2)} m</span>
              <span className={clsx('chip text-[10px] py-0 px-1.5', ALARM[lv].cls)}>
                {lv ? `BĐ ${['', 'I', 'II', 'III'][lv]}` : 'Dưới BĐ I'}
              </span>
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
  const { filter, clearFilter } = useStore();
  const filterLabel = filter.label;
  const isFiltered = filter.codes.length > 0;
  const [stationId, setStationId] = useState('CB-WL-01');
  const [activeMode, setActiveMode] = useState('tong_hop'); // tong_hop | hochua | satlo
  const [exporting, setExporting] = useState(false);
  const [bulletinOpen, setBulletinOpen] = useState(false);
  const canForecast = usePermission('monitoring', 'update', '*');
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
    <div className="flex flex-col gap-3.5 p-3.5 sm:p-5">
      {/* Tiêu đề trang & Thanh công cụ nhanh */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-ink flex items-center gap-2">
              <span>Tổng quan tác chiến</span>
              <span className="text-muted font-normal">/</span>
              <span className="text-accent">{filterLabel}</span>
            </h1>
            <p className="text-xs text-muted mt-0.5">Số liệu khí tượng thủy văn, cảnh báo và điều phối cứu hộ cập nhật thời gian thực</p>
          </div>

          {isFiltered && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent border border-accent/30 shadow-sm animate-in fade-in">
              <MapPin size={12} />
              <span>Đang lọc theo: <b>{filterLabel}</b></span>
              <button
                onClick={clearFilter}
                className="ml-1 rounded-full p-0.5 hover:bg-accent hover:text-white transition-colors"
                title="Bỏ lọc, xem toàn tỉnh"
              >
                <X size={12} />
              </button>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 no-print">
          <Link to="/ban-do" className="btn-ghost text-xs hidden sm:inline-flex">
            <span>Mở bản đồ giám sát</span>
            <ArrowUpRight size={13} />
          </Link>
          <button
            className="btn-primary text-xs shadow-sm"
            onClick={doExport}
            disabled={exporting}
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
            <span>Xuất PDF báo cáo nhanh</span>
          </button>
        </div>
      </div>

      {/* Thanh chuyển đổi chuyên đề tác chiến Ban Chỉ huy */}
      <div className="flex items-center gap-2 border-b border-line pb-2.5 overflow-x-auto scroll-thin">
        {[
          { id: 'tong_hop', label: 'Tác chiến tổng hợp', icon: LayoutDashboard },
          {
            id: 'hochua',
            label: 'Chuyên đề: Hồ chứa & Xả lũ',
            icon: Droplets,
            badge: k?.reservoirs?.spill_count ? `${k.reservoirs.spill_count} hồ xả` : null,
            badgeCls: k?.reservoirs?.emergency_count > 0 ? 'bg-danger text-white animate-pulse' : 'bg-amber-500 text-white',
          },
          {
            id: 'satlo',
            label: 'Chuyên đề: Sạt trượt & Đường đèo',
            icon: Mountain,
            badge: k?.landslides?.blocked_count ? `${k.landslides.blocked_count} điểm cấm` : null,
            badgeCls: 'bg-danger text-white animate-pulse',
          },
        ].map((m) => {
          const Icon = m.icon;
          const active = activeMode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setActiveMode(m.id)}
              className={clsx(
                'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap border',
                active
                  ? 'bg-accent text-white border-accent shadow-md shadow-accent/20'
                  : 'bg-panel text-ink-2 hover:bg-panel2 border-line hover:text-ink'
              )}
            >
              <Icon size={15} />
              <span>{m.label}</span>
              {m.badge && (
                <span className={clsx('px-1.5 py-0.5 rounded-full text-[10px] font-bold shadow-sm', m.badgeCls || 'bg-amber-500 text-white')}>
                  {m.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* CHUYÊN ĐỀ 1: HỒ CHỨA & XẢ LŨ */}
      {activeMode === 'hochua' && (
        <div className="card p-4 sm:p-5 bg-panel border-line shadow-sm space-y-4">
          <div className="pb-3 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-sky-600">Bảng điều hành tác chiến chuyên sâu</span>
              <h2 className="text-lg font-bold text-ink flex items-center gap-2 mt-0.5">
                <Droplets className="text-sky-600" size={20} />
                Giám Sát Vận Hành Hồ Chứa & Cảnh Báo Xả Lũ Tỉnh Cao Bằng
              </h2>
            </div>
            <Link to="/ban-do" className="btn-ghost text-xs self-start sm:self-auto">
              Mở bản đồ chuyên đề →
            </Link>
          </div>
          <ReservoirMonitor onSelectOnMap={() => window.location.href = '/ban-do'} />
        </div>
      )}

      {/* CHUYÊN ĐỀ 2: SẠT TRƯỢT & ĐƯỜNG ĐÈO */}
      {activeMode === 'satlo' && (
        <div className="card p-4 sm:p-5 bg-panel border-line shadow-sm space-y-4">
          <div className="pb-3 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-danger">Bảng điều hành tác chiến chuyên sâu</span>
              <h2 className="text-lg font-bold text-ink flex items-center gap-2 mt-0.5">
                <Mountain className="text-danger" size={20} />
                Bản Đồ Điểm Đen Sạt Trượt & Trạng Thái Đường Đèo Tỉnh Cao Bằng
              </h2>
            </div>
            <Link to="/ban-do" className="btn-ghost text-xs self-start sm:self-auto">
              Mở bản đồ chuyên đề →
            </Link>
          </div>
          <LandslideMonitor onSelectOnMap={() => window.location.href = '/ban-do'} />
        </div>
      )}

      {/* CHUYÊN ĐỀ TỔNG HỢP MULTI-HAZARD */}
      {activeMode === 'tong_hop' && (
        <div ref={ref} className="grid gap-3.5 bg-bg xl:grid-cols-[1fr_350px]">
          <div className="flex min-w-0 flex-col gap-3.5">
            {/* 2 Bảng chuyên đề tác chiến nổi bật */}
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Chuyên đề 1: Hồ chứa & Xả lũ */}
              <div
                onClick={() => setActiveMode('hochua')}
                className="card p-3.5 cursor-pointer border-l-4 border-l-sky-500 hover:border-sky-600 hover:shadow-md transition-all group bg-gradient-to-r from-sky-500/5 to-transparent"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600 group-hover:scale-105 transition-transform">
                      <Droplets size={18} />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-sky-600">Chuyên đề trọng tâm 1</span>
                      <h3 className="font-bold text-sm text-ink group-hover:text-accent">Hồ Chứa & Cảnh Báo Xả Lũ</h3>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-accent group-hover:underline flex items-center gap-0.5">
                    Mở tác chiến <ArrowUpRight size={12} />
                  </span>
                </div>
                <div className="mt-3 flex items-baseline justify-between text-xs border-t border-line/60 pt-2">
                  <div className="text-muted">
                    Đang mở xả tràn: <b className="text-amber-600 font-mono font-bold">{k?.reservoirs?.spill_count ?? '–'} / {k?.reservoirs?.total ?? '–'} hồ</b>
                  </div>
                  <div className="text-muted">
                    Tổng xả hạ du: <b className="font-mono text-ink font-bold">{k ? Math.round(k.reservoirs?.total_outflow ?? 0) : '–'} m³/s</b>
                  </div>
                </div>
              </div>

              {/* Chuyên đề 2: Sạt trượt & Đường đèo */}
              <div
                onClick={() => setActiveMode('satlo')}
                className="card p-3.5 cursor-pointer border-l-4 border-l-danger hover:border-red-600 hover:shadow-md transition-all group bg-gradient-to-r from-danger/5 to-transparent"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-danger/15 text-danger group-hover:scale-105 transition-transform">
                      <Mountain size={18} />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-danger">Chuyên đề trọng tâm 2</span>
                      <h3 className="font-bold text-sm text-ink group-hover:text-danger">Sạt Trượt & Đường Đèo</h3>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-danger group-hover:underline flex items-center gap-0.5">
                    Mở tác chiến <ArrowUpRight size={12} />
                  </span>
                </div>
                <div className="mt-3 flex items-baseline justify-between text-xs border-t border-line/60 pt-2">
                  <div className="text-muted">
                    Tắc đường / Cấm xe: <b className="text-danger font-mono font-bold">{k?.landslides?.blocked_count ?? '–'} vị trí</b>
                  </div>
                  <div className="text-muted">
                    Độ nghiêng taluy: <b className="font-mono text-danger font-bold">{maxTiltText(k?.landslides?.points)}</b>
                  </div>
                </div>
              </div>
            </div>

            {/* Khối chỉ số nhanh (KPIs) */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
            <KpiCard
              label="Mưa TB 24h"
              value={num(k?.rain?.avg_24h, 1)}
              unit="mm"
              icon={CloudRain}
              tone={k?.rain?.max_24h > 150 ? 'serious' : undefined}
              sub={<>Cực đại: <b className="font-mono text-ink">{num(k?.rain?.max_24h, 1)} mm</b> ({k?.rain?.max_station?.replace('Trạm đo mưa ', '')})</>}
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
              <Progress value={pct(k?.evacuation?.evacuated_households, k?.evacuation?.planned_households)} tone="good" className="mt-2" />
            </KpiCard>

            <KpiCard
              label="SOS chờ xử lý"
              value={int(k?.sos?.waiting)}
              icon={Siren}
              tone={waitOverdue ? 'danger' : k?.sos?.waiting ? 'warn' : undefined}
              blink={waitOverdue}
              sub={
                waitOverdue
                  ? <span className="font-semibold text-danger">{k.sos.overdue} phiếu quá hạn SLA (cấp 1: 3′, cấp 2: 15′, cấp 3: 60′)</span>
                  : `${int(k?.sos?.in_progress)} đang điều phối · ${int(k?.sos?.resolved_24h)} hoàn thành`
              }
            />

            <KpiCard
              label="Lực lượng ứng trực"
              value={`${int(k?.forces?.ready)}/${int(k?.forces?.on_mission)}`}
              icon={Users}
              sub={
                <span className="flex items-center gap-1">
                  <Ship size={12} className="text-accent" /> Xuồng/xe lội nước: <b className="font-mono text-ink">{int(k?.vehicles?.special_active)}/{int(k?.vehicles?.special_total)}</b>
                </span>
              }
            />
          </div>

          {/* Khối biểu đồ phân tích chuyên sâu */}
          <div className="grid gap-3.5 lg:grid-cols-2">
            <Section
              title="Biểu đồ thủy văn (Hydrograph)"
              right={
                <div className="flex items-center gap-2">
                  <select
                    className="input w-auto py-1 px-2.5 text-xs border border-line"
                    value={activeStation}
                    onChange={(e) => setStationId(e.target.value)}
                    aria-label="Chọn trạm thủy văn"
                  >
                    {stations.map((s) => (
                      <option key={s.id} value={s.id}>{s.name.replace('Trạm thủy văn ', '')}</option>
                    ))}
                  </select>
                  {canForecast && stations.length > 0 && (
                    <button className="btn-ghost whitespace-nowrap px-2.5 py-1 text-xs" onClick={() => setBulletinOpen(true)}>
                      Nhập bản tin dự báo
                    </button>
                  )}
                </div>
              }
            >
              <Hydrograph stationId={activeStation} height={250} />
              {bulletinOpen && (
                <ForecastBulletinModal stations={stations} stationId={activeStation} onClose={() => setBulletinOpen(false)} />
              )}
            </Section>

            <Section title="Cường độ mưa & dự báo 3 giờ tới">
              <RainfallChart height={270} />
            </Section>

            <Section title="Dự báo mưa 72 giờ theo xã – tổ hợp ECMWF + GFS (P10–P90)" className="lg:col-span-2">
              <AreaForecastChart height={230} />
            </Section>

            <Section title="Ngưỡng kích hoạt sạt lở đất (mưa tích luỹ 72h vs cường độ)">
              <LandslideScatter height={240} />
            </Section>

            <Section title="Phân bổ vật tư cứu trợ theo kho (% định mức dự trữ)">
              <SuppliesChart height={240} />
            </Section>
          </div>
        </div>

        {/* Cột Nhật ký sự kiện & luồng cảnh báo */}
        <Section
          title="Nhật ký sự kiện & cảnh báo"
          className="xl:max-h-[calc(100vh-8.5rem)]"
          right={
            <span className="badge-live">LIVE</span>
          }
        >
          <EventLog className="max-h-[70vh] xl:max-h-none xl:h-full" limit={50} />
        </Section>
      </div>
      )}
    </div>
  );
}
