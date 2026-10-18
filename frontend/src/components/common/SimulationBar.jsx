import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Check, ChevronDown, Droplets, FlaskConical, Mountain, Power, UserCheck, Waves } from 'lucide-react';
import { useStore } from '../../app/store';
import { simulationEngine } from '../../api/simulationEngine';
import { DEMO_ROLES, demoAuth } from '../../api/demoUsers';

const SCENARIOS = [
  { id: 'normal', label: 'Như dữ liệu đã ghi', desc: 'Đợt mưa lũ dựng sẵn, chưa thêm diễn biến', icon: Check },
  { id: 'lu_quet', label: 'Lũ sông Bằng Giang vượt BĐ III', desc: 'Trạm thủy văn Cao Bằng vượt báo động III', icon: Waves },
  { id: 'sat_lo', label: 'Sạt lở mới tại Tĩnh Túc', desc: 'Thêm phiếu SOS khẩn cấp sinh tử: 8 người mắc kẹt', icon: Mountain },
  { id: 'xa_lu', label: 'Thủy điện Bạch Đằng xả lũ lớn', desc: 'Mở hết cửa xả, hạ du sông Bằng Giang báo động', icon: Droplets },
];

/**
 * Điều khiển CHẾ ĐỘ GIẢ LẬP trên thanh trên cùng — CHỈ máy dev (Header nạp lười trong nhánh import.meta.env.DEV): chọn kịch
 * bản thiên tai, đổi vai trò (đúng 3 vai trò thật — api/demoUsers.js), tắt giả lập (thoát phiên giả lập, về đăng nhập thật).
 */
export default function SimulationBar() {
  const qc = useQueryClient();
  const simulationMode = useStore((s) => s.simulationMode);
  const scenario = useStore((s) => s.simulationScenario);
  const auth = useStore((s) => s.auth);
  const { setSimulationMode, setSimulationScenario, setAuth, toast } = useStore.getState();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  if (!simulationMode) return null;
  const current = SCENARIOS.find((s) => s.id === scenario) || SCENARIOS[0];
  const activeRole = DEMO_ROLES.find((r) => r.user.id === auth?.user?.id)?.key;

  const pickScenario = (id) => {
    simulationEngine.triggerScenario(id);
    setSimulationScenario(id);
    qc.invalidateQueries();
    setOpen(false);
    toast({ tone: id === 'normal' ? 'info' : 'warn', title: 'Giả lập: đã đổi kịch bản', body: SCENARIOS.find((s) => s.id === id)?.label });
  };
  const pickRole = (key) => {
    setAuth(demoAuth(key));
    qc.invalidateQueries();
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Chế độ giả lập (chỉ máy dev) — chọn kịch bản, đổi vai trò, tắt giả lập"
        className="touch-hit flex items-center gap-1.5 rounded-lg border border-warn/50 bg-warn/15 px-2 py-1 text-xs font-bold text-warn"
      >
        <FlaskConical size={14} aria-hidden="true" />
        <span className="max-sm:hidden">Giả lập · {current.label}</span>
        <ChevronDown size={12} className={clsx('transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="card absolute right-0 top-full z-[1200] mt-2 w-80 p-2 shadow-2xl">
          <div className="px-2 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Kịch bản thiên tai</div>
          {SCENARIOS.map((s) => (
            <button key={s.id} type="button" role="menuitemradio" aria-checked={s.id === current.id} onClick={() => pickScenario(s.id)}
              className={clsx('tap flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-panel2', s.id === current.id && 'bg-accent/10')}>
              <s.icon size={15} className={clsx('mt-0.5 shrink-0', s.id === current.id ? 'text-accent' : 'text-muted')} aria-hidden="true" />
              <span className="min-w-0">
                <span className={clsx('block text-xs font-semibold', s.id === current.id ? 'text-accent' : 'text-ink')}>{s.label}</span>
                <span className="block text-[11px] text-muted">{s.desc}</span>
              </span>
            </button>
          ))}
          <div className="mt-1 flex items-center gap-1 border-t border-line px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
            <UserCheck size={12} aria-hidden="true" /> Xem với vai trò
          </div>
          {DEMO_ROLES.map((r) => (
            <button key={r.key} type="button" role="menuitemradio" aria-checked={r.key === activeRole} onClick={() => pickRole(r.key)}
              className={clsx('tap flex w-full flex-col rounded-lg px-2 py-1.5 text-left hover:bg-panel2', r.key === activeRole && 'bg-accent/10')}>
              <span className={clsx('text-xs font-semibold', r.key === activeRole ? 'text-accent' : 'text-ink')}>{r.label}</span>
              <span className="text-[11px] text-muted">{r.hint}</span>
            </button>
          ))}
          <button type="button" onClick={() => setSimulationMode(false)}
            className="tap mt-1 flex w-full items-center gap-2 rounded-lg border-t border-line px-2 pt-2 text-left text-xs font-semibold text-danger hover:bg-danger/10">
            <Power size={14} aria-hidden="true" /> Tắt giả lập (thoát phiên giả lập)
          </button>
        </div>
      )}
    </div>
  );
}
