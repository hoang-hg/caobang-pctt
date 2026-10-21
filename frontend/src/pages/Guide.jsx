import { useEffect } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowDown, ArrowRight, Info, Printer } from 'lucide-react';
import EmptyArt from '../components/common/EmptyArt';
import PageHeader from '../components/common/PageHeader';
import { Segmented } from '../components/common/ui';
import { PAGE } from '../components/layout/page';
import { COLUMNS } from '../components/rescue/rescueFacts';
import { useStore } from '../app/store';
import { useGuideRole } from '../rbac/usePermission';
import { GUIDE_ROLES, RESPONSE_LEVELS, SCENARIOS } from '../utils/guides';
import { NO_DATA, RISK, risk } from '../utils/risk';

/** Cuộn tới thẻ tình huống (khung cuộn là <main>, không phải cửa sổ); hệ điều hành bật giảm chuyển động → nhảy thẳng. */
const jump = (id) => {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  el.querySelector('h3')?.focus({ preventScroll: true });
};

/** Một tình huống: hình nét đơn (`art` — EmptyArt; chưa có thì biểu tượng), khi nào gặp, các bước nối nhau theo thứ tự làm,
 * lưu ý, nút mở thẳng màn hình xử lý. */
function Scenario({ s }) {
  return (
    <article id={s.id} aria-labelledby={`${s.id}-t`} className="card flex scroll-mt-3 flex-col gap-3 p-4 break-inside-avoid motion-safe:animate-enter">
      <div className="flex items-start gap-3">
        {s.art ? (
          <EmptyArt name={s.art} className="h-11 w-[66px] shrink-0 text-muted sm:h-12 sm:w-[72px]" />
        ) : (
          <s.icon size={24} strokeWidth={1.75} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <h3 id={`${s.id}-t`} tabIndex={-1} className="text-base font-semibold leading-snug text-ink outline-none">{s.title}</h3>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">
            <span className="font-semibold text-ink-2">Khi nào:</span> {s.when}
          </p>
        </div>
      </div>
      <ol className="flex flex-col" aria-label={`Các bước: ${s.title}`}>
        {s.steps.map((t, i) => (
          <li key={t} className="relative flex gap-3 pb-3 last:pb-0">
            {/* Đường nối các bước: đọc theo thứ tự từ trên xuống như sơ đồ quy trình */}
            {i < s.steps.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-[13px] top-7 w-px bg-line" />}
            <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-accent bg-panel text-[13px] font-bold text-accent">
              {i + 1}
            </span>
            <span className="min-w-0 pt-1 text-sm leading-snug text-ink-2">{t}</span>
          </li>
        ))}
      </ol>
      {s.note && (
        <p className="flex gap-2 rounded-lg bg-panel2 px-3 py-2 text-[13px] leading-snug text-ink-2">
          <Info size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
          <span>{s.note}</span>
        </p>
      )}
      <Link to={s.to} className="btn-secondary tap mt-auto self-start px-3 py-1.5 text-sm no-print">
        {s.cta} <ArrowRight size={15} aria-hidden="true" />
      </Link>
    </article>
  );
}

/** Quy ước dùng chung mọi trang: màu mức nguy hiểm, mức ưu tiên phiếu cứu hộ, các bước của một phiếu (tên cột lấy từ bảng
 * điều phối — đổi tên cột thì ở đây đổi theo). */
function Conventions() {
  return (
    <section aria-labelledby="quy-uoc" className="card break-inside-avoid p-4">
      <h2 id="quy-uoc" className="text-base font-semibold text-ink">Quy ước chung trên mọi màn hình</h2>
      <div className="mt-3 grid gap-5 lg:grid-cols-3">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Màu mức nguy hiểm</h3>
          <ul className="flex flex-col gap-1.5">
            {[...RISK].reverse().concat(NO_DATA).map((r) => (
              <li key={r.name} className="flex items-center gap-2.5 text-sm text-ink-2">
                <span className={clsx('chip w-12 justify-center py-0.5 text-xs font-bold', r.chip, r.level === null && 'border border-dashed border-muted')}>{r.name}</span>
                {r.meaning}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[13px] leading-snug text-muted">Xám là chưa có số liệu hoặc mất tín hiệu — không phải an toàn.</p>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Mức ưu tiên phiếu cứu hộ</h3>
          <ul className="flex flex-col gap-2.5">
            {RESPONSE_LEVELS.map((p) => (
              <li key={p.name} className="flex gap-2.5 text-sm leading-snug text-ink-2">
                <span className={clsx('chip h-fit shrink-0 py-0.5 text-xs font-bold', risk(p.level).chip)}>{p.name}</span>
                <span>
                  {p.meaning}. <b className="font-semibold text-ink">Phản hồi trong {p.minutes} phút.</b>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Các bước của một phiếu cứu hộ</h3>
          <ol className="flex flex-col">
            {COLUMNS.map((c, i) => (
              <li key={c.key} className="flex flex-col">
                <div className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2">
                  <c.icon size={16} className="shrink-0 text-accent" aria-hidden="true" />
                  <div className="min-w-0">
                    <b className="block text-sm font-semibold text-ink">{c.title}</b>
                    <span className="text-[13px] leading-snug text-muted">{c.hint}</span>
                  </div>
                </div>
                {i < COLUMNS.length - 1 && <ArrowDown size={14} className="mx-auto my-0.5 text-muted" aria-hidden="true" />}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/**
 * Hướng dẫn xử lý theo vai trò (thiết kế Part 1 A–G): cán bộ cấp tỉnh (lãnh đạo BCH, trực ban), cán bộ cấp xã, quản trị hệ
 * thống. Mở ra là hướng dẫn của vai trò tài khoản đang dùng; xem được vai trò khác (?vai=). "Bạn đang gặp việc gì?" → chạm
 * một tình huống, cuộn tới các bước; mỗi tình huống có nút mở thẳng màn hình xử lý. In được (tập huấn cán bộ mới).
 */
export default function Guide() {
  const own = useGuideRole();
  const [params, setParams] = useSearchParams();
  const wanted = params.get('vai');
  const role = GUIDE_ROLES.some((r) => r.value === wanted) ? wanted : own;
  const info = GUIDE_ROLES.find((r) => r.value === role);
  const list = SCENARIOS[role];
  const mine = useStore((s) => s.auth?.user?.assignments?.[0]);
  const { hash } = useLocation();

  // Mở từ liên kết có #tình-huống → cuộn tới thẻ đó
  useEffect(() => {
    if (hash) requestAnimationFrame(() => jump(decodeURIComponent(hash.slice(1))));
  }, [hash, role]);

  const setRole = (v) => setParams((p) => {
    const next = new URLSearchParams(p);
    if (v === own) next.delete('vai'); else next.set('vai', v);
    return next;
  }, { replace: true });

  return (
    <div className={PAGE}>
      <PageHeader
        title="Hướng dẫn xử lý"
        short="Hướng dẫn"
        meta={mine ? [
          <span key="tk">Tài khoản của bạn: <b className="font-semibold text-ink-2">{mine.role_name}</b> · {mine.domain_label}</span>,
        ] : []}
        description="Việc thường gặp, làm theo từng bước đúng quy trình điều hành phòng chống thiên tai của tỉnh. Nút dưới mỗi việc mở thẳng màn hình xử lý."
        actions={(
          <button type="button" onClick={() => window.print()} className="btn-secondary tap h-9 px-3" title="In hướng dẫn để tập huấn, dán tại phòng trực">
            <Printer size={15} aria-hidden="true" /> <span className="max-sm:hidden">In hướng dẫn</span>
          </button>
        )}
      />

      <div className="flex flex-col gap-1.5 no-print">
        <Segmented
          label="Hướng dẫn cho"
          value={role}
          onChange={setRole}
          touch
          className="self-start"
          options={GUIDE_ROLES.map((r) => ({
            value: r.value,
            label: r.value === own ? `${r.label} (bạn)` : r.label,
            short: r.short,
            icon: r.icon,
          }))}
        />
        <p className="text-[13px] leading-snug text-muted">
          {info.who}.
          {role !== own && ' Bạn đang xem hướng dẫn của vai trò khác.'}
          {role === 'quan_tri' && ' Quản trị hệ thống làm được mọi việc của cán bộ cấp tỉnh — xem thêm hướng dẫn "Cán bộ cấp tỉnh".'}
        </p>
      </div>

      <section aria-labelledby="chon-viec" className="no-print">
        <h2 id="chon-viec" className="mb-2 text-base font-semibold text-ink">Bạn đang gặp việc gì?</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {list.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => jump(s.id)}
              className="card tap flex min-h-[56px] items-center gap-3 px-3 py-2.5 text-left text-sm font-semibold text-ink hover:border-accent"
            >
              <s.icon size={20} strokeWidth={1.75} className="shrink-0 text-accent" aria-hidden="true" />
              <span className="min-w-0 flex-1 leading-snug">{s.title}</span>
              <ArrowDown size={15} className="shrink-0 text-muted" aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>

      <div key={role} className="grid grid-cols-1 gap-3 lg:grid-cols-2 [&>*]:min-w-0 print:block print:[&>*]:mb-3">
        {list.map((s) => <Scenario key={s.id} s={s} />)}
      </div>

      <Conventions />
    </div>
  );
}
