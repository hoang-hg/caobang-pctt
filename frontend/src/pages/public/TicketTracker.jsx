import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Search, Clock, Truck, Check, AlertTriangle, PhoneCall,
  Loader2, RefreshCw, X, MapPin, Copy, Navigation,
  AlertCircle, Sparkles, FileText, Phone
} from 'lucide-react';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { BackButton } from '../../components/common/ui';

const STEP_COLORS = {
  yellow: {
    badge: 'bg-amber-500 text-white',
    ring: 'border-amber-500 bg-amber-500/10 text-amber-600',
    line: 'bg-amber-500',
    glow: 'ring-amber-500/30 bg-amber-500/10 text-amber-600',
  },
  orange: {
    badge: 'bg-orange-500 text-white',
    ring: 'border-orange-500 bg-orange-500/10 text-orange-600',
    line: 'bg-orange-500',
    glow: 'ring-orange-500/30 bg-orange-500/10 text-orange-600',
  },
  green: {
    badge: 'bg-emerald-600 text-white',
    ring: 'border-emerald-600 bg-emerald-500/10 text-emerald-600',
    line: 'bg-emerald-600',
    glow: 'ring-emerald-500/30 bg-emerald-500/10 text-emerald-600',
  },
  blue: {
    badge: 'bg-blue-600 text-white',
    ring: 'border-blue-600 bg-blue-500/10 text-blue-600',
    line: 'bg-blue-600',
    glow: 'ring-blue-500/30 bg-blue-500/10 text-blue-600',
  },
  red: {
    badge: 'bg-red-600 text-white',
    ring: 'border-red-600 bg-red-500/10 text-red-600',
    line: 'bg-red-600',
    glow: 'ring-red-500/30 bg-red-500/10 text-red-600',
  },
};

export default function TicketTracker({ initialCode = '', initialPhone = '', onQueryChange, onBackToMap }) {
  const toast = useStore((s) => s.toast);
  const [code, setCode] = useState(initialCode);
  const [phone, setPhone] = useState(initialPhone);
  // Chỉ tra khi người dùng bấm (hoặc được chuyển từ form phản ánh kèm mã)
  const [activeQuery, setActiveQuery] = useState(initialCode ? { code: initialCode, phone: initialPhone } : null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    if (initialCode) {
      setCode(initialCode);
      setPhone(initialPhone);
      setActiveQuery({ code: initialCode, phone: initialPhone });
    }
  }, [initialCode, initialPhone]);

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['pub-track', activeQuery?.code, activeQuery?.phone],
    // POST: SĐT không nằm trên URL / log truy cập
    queryFn: () => api('/public/track', { method: 'POST', body: { code: activeQuery.code, phone: activeQuery.phone || null } }),
    enabled: !!activeQuery && activeQuery.code.trim().length >= 3,
    // Làm mới mỗi 15s để thấy tiến độ — CHỈ khi đã tìm thấy phiếu: tra cứu không ra kết quả bị đếm để chống dò mã / SĐT,
    // tự làm mới lúc gõ nhầm sẽ tự khoá SĐT của chính người dân sau vài phút
    refetchInterval: (query) => (query.state.data?.total ? 15_000 : false),
    retry: (count, err) => err?.status !== 429 && count < 2,
  });

  const handleSearch = (e) => {
    e?.preventDefault();
    const q = { code: code.trim(), phone: phone.trim() };
    if (!q.code) return;
    setActiveQuery(q);
    setSelectedIdx(0);
    onQueryChange?.(q);
  };

  const copyCode = (code) => {
    navigator.clipboard?.writeText(code);
    toast({ title: `Đã sao chép mã ${code}` });
  };

  const items = data?.results || [];
  const currentItem = items[selectedIdx] || items[0];

  return (
    <div className="flex flex-col gap-5">
      {/* Khung tìm kiếm chính */}
      <div className="card p-4 sm:p-6 bg-gradient-to-br from-panel via-panel to-panel2 border-line shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-accent font-bold text-xs uppercase tracking-wider mb-1">
              <Sparkles size={14} />
              <span>Tra cứu trực tuyến 24/7</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-ink">
              Tra cứu tiến độ cứu hộ & phản ánh hiện trường
            </h2>
            <p className="text-xs sm:text-sm text-ink-2 mt-1 leading-relaxed">
              Nhập <b>mã phiếu</b> (dạng <code className="font-mono text-accent">SOS-1080</code>, <code className="font-mono text-accent">PA-1017</code>) và <b>số điện thoại đã dùng khi gửi</b>.
              Phản ánh không để lại số điện thoại: nhập <b>mã tra cứu</b> được cấp khi gửi (dạng <code className="font-mono text-accent">PA-1017-KXMPQR</code>), không cần số điện thoại.
            </p>
          </div>

          {onBackToMap && <BackButton onClick={onBackToMap} className="self-start" />}
        </div>

        <form onSubmit={handleSearch} className="mt-4 flex flex-col sm:flex-row gap-2 max-w-2xl">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
              <Search size={18} />
            </div>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Mã phiếu / mã tra cứu: PA-… hoặc SOS-…"
              aria-label="Mã phiếu"
              autoCapitalize="characters"
              className="input pl-10 py-2.5 text-sm sm:text-base w-full shadow-inner font-medium font-mono"
            />
          </div>
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
              <Phone size={16} />
            </div>
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="SĐT đã dùng khi gửi (nếu có)"
              aria-label="Số điện thoại đã dùng khi gửi"
              autoComplete="tel"
              className="input pl-9 pr-9 py-2.5 text-sm sm:text-base w-full shadow-inner font-medium"
            />
            {(code || phone) && (
              <button
                type="button"
                onClick={() => { setCode(''); setPhone(''); }}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted hover:text-ink"
                aria-label="Xoá"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={!code.trim() || isLoading}
            className="btn bg-accent text-white hover:brightness-110 font-bold px-6 py-2.5 text-sm flex items-center justify-center gap-2 shadow-sm"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            <span>Tra cứu</span>
          </button>
        </form>

      </div>

      {/* Vùng hiển thị Kết quả */}
      {isLoading && (
        <div className="card p-12 flex flex-col items-center justify-center text-center gap-3">
          <Loader2 size={36} className="animate-spin text-accent" />
          <div className="font-bold text-ink text-sm sm:text-base">Đang kết nối hệ thống điều hành tác chiến...</div>
          <div className="text-xs text-muted">Tra cứu dữ liệu từ BCH PCTT & TKCN tỉnh Cao Bằng</div>
        </div>
      )}

      {error && !isLoading && (
        <div className="card p-6 border-danger/30 bg-danger/5 flex items-start gap-3">
          <AlertCircle size={22} className="text-danger shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-danger text-sm">Không thể hoàn tất tra cứu</div>
            {error.status === 429 ? (
              // Chống dò mã phiếu / SĐT: quá nhiều lần tra cứu không ra kết quả với mã hoặc SĐT này
              <div className="text-xs text-ink-2 mt-1">
                Đã tra cứu sai quá nhiều lần với mã phiếu hoặc số điện thoại này — thử lại sau 1 giờ. Cần gấp: gọi 112 hoặc
                đường dây nóng của tỉnh.
              </div>
            ) : (
              <>
                <div className="text-xs text-ink-2 mt-1">Đã có lỗi xảy ra hoặc mạng gián đoạn. Vui lòng thử lại.</div>
                <button
                  onClick={() => refetch()}
                  className="btn-ghost text-xs px-3 py-1.5 mt-3 border border-danger/30 text-danger hover:bg-danger/10"
                >
                  Thử lại
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {!isLoading && !error && activeQuery && items.length === 0 && (
        <div className="card p-8 sm:p-12 text-center flex flex-col items-center max-w-xl mx-auto">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-panel2 text-muted mb-3">
            <Search size={30} />
          </div>
          <div className="font-bold text-ink text-base sm:text-lg">
            Không tìm thấy thông tin phù hợp
          </div>
          <p className="text-xs sm:text-sm text-muted mt-1.5 leading-relaxed max-w-md">
            Không tìm thấy phiếu <b className="text-ink font-mono">{activeQuery.code}</b> khớp với số điện thoại đã nhập. Vui lòng kiểm tra lại mã phiếu và số điện thoại bạn dùng khi gửi
            (phản ánh không để lại số điện thoại: nhập đầy đủ mã tra cứu dạng PA-1017-KXMPQR).
          </p>
          <div className="mt-5 p-3.5 rounded-xl bg-panel2 border border-line text-left text-xs space-y-1.5 w-full">
            <div className="font-semibold text-ink flex items-center gap-1.5">
              <PhoneCall size={14} className="text-danger" />
              <span>Nếu đang trong tình huống nguy hiểm khẩn cấp:</span>
            </div>
            <div className="text-muted leading-relaxed">
              Hãy gọi ngay cho đường dây nóng <b>112</b> (Tìm kiếm cứu nạn) hoặc <b>114</b> (Cứu hộ PCCC) để được điều phối lực lượng tức thời!
            </div>
          </div>
        </div>
      )}

      {!isLoading && items.length > 0 && currentItem && (
        <div className="space-y-4">
          {/* Thanh chọn phiếu (nếu tìm theo SĐT có nhiều phiếu) */}
          {items.length > 1 && (
            <div className="card p-3">
              <div className="text-xs font-semibold text-muted mb-2 flex items-center justify-between">
                <span>Tìm thấy {items.length} phiếu:</span>
                <span className="text-[11px] font-mono text-accent">Chọn phiếu để xem chi tiết</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 scroll-thin">
                {items.map((it, idx) => {
                  const isSos = it.type === 'sos';
                  const active = idx === selectedIdx;
                  return (
                    <button
                      key={it.code}
                      onClick={() => setSelectedIdx(idx)}
                      className={clsx(
                        'flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all shrink-0',
                        active
                          ? 'border-accent bg-accent/10 text-accent shadow-sm'
                          : 'border-line bg-panel hover:bg-panel2 text-ink-2'
                      )}
                    >
                      <span className={clsx('text-[10px] px-1.5 py-0.5 rounded font-mono', isSos ? 'bg-danger text-white' : 'bg-accent text-white')}>
                        {it.code}
                      </span>
                      <span className="truncate max-w-[140px]">{it.incident_label || it.category_label}</span>
                      <span className="text-[10px] text-muted">({it.status_label})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Chi tiết Phiếu được chọn */}
          <div className="card overflow-hidden border border-line shadow-sm">
            {/* Header thẻ phiếu */}
            <div className="p-4 sm:p-5 border-b border-line bg-panel2/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div
                  className={clsx(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-bold shadow-sm',
                    currentItem.type === 'sos'
                      ? 'bg-gradient-to-br from-red-600 to-rose-600 text-white'
                      : 'bg-gradient-to-br from-indigo-600 to-accent text-white'
                  )}
                >
                  {currentItem.type === 'sos' ? <PhoneCall size={20} /> : <FileText size={20} />}
                </div>

                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm sm:text-base font-extrabold text-ink bg-panel border border-line px-2 py-0.5 rounded-lg flex items-center gap-1.5">
                      {currentItem.code}
                      <button
                        type="button"
                        onClick={() => copyCode(currentItem.code)}
                        className="text-muted hover:text-accent"
                        title="Sao chép mã"
                      >
                        <Copy size={13} />
                      </button>
                    </span>

                    <span
                      className={clsx(
                        'text-xs font-bold px-2.5 py-0.5 rounded-full border',
                        currentItem.type === 'sos'
                          ? 'bg-danger/10 text-danger border-danger/30'
                          : 'bg-accent/10 text-accent border-accent/30'
                      )}
                    >
                      {currentItem.type_label}
                    </span>

                    <span className="text-xs text-muted">
                      Nội dung: <b className="text-ink">{currentItem.incident_label || currentItem.category_label}</b>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-muted">
                    {currentItem.admin_name && (
                      <span className="flex items-center gap-1">
                        <MapPin size={13} className="text-accent" />
                        <span>{currentItem.admin_name}</span>
                      </span>
                    )}
                    {currentItem.reporter_phone_masked && (
                      <span className="flex items-center gap-1">
                        <Phone size={13} />
                        <span>SĐT gửi: <b className="font-mono text-ink">{currentItem.reporter_phone_masked}</b></span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Trạng thái tổng quát */}
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <div className="text-right hidden sm:block">
                  <div className="text-[11px] text-muted">Trạng thái hiện tại:</div>
                  <div className="text-sm font-bold text-ink">{currentItem.status_label}</div>
                </div>
                <button
                  type="button"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  className="btn-ghost p-2 text-muted hover:text-accent rounded-xl"
                  title="Làm mới tiến độ"
                >
                  <RefreshCw size={16} className={clsx(isFetching && 'animate-spin text-accent')} />
                </button>
              </div>
            </div>

            {/* Nội dung thanh tiến độ (Timeline Stepper) */}
            <div className="p-4 sm:p-6 bg-panel">
              <div className="mb-4 flex items-center justify-between text-xs text-muted border-b border-line pb-2">
                <span className="font-semibold uppercase tracking-wider text-ink flex items-center gap-1.5">
                  <Clock size={14} className="text-accent" />
                  <span>Tiến độ xử lý điều hành tác chiến</span>
                </span>
                <span className="text-[11px] flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-good animate-ping" />
                  <span>Tự động đồng bộ mỗi 15s</span>
                </span>
              </div>

              {/* Stepper dọc với visual design cao cấp */}
              <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:bottom-3 before:left-3 sm:before:left-4 before:top-3 before:w-0.5 before:bg-line">
                {currentItem.timeline.map((st, idx) => {
                  const isDone = st.state === 'done';
                  const isCurrent = st.state === 'current';
                  const isRejected = st.state === 'rejected';
                  const isWaiting = st.state === 'waiting';

                  const col = STEP_COLORS[st.color] || STEP_COLORS.blue;

                  return (
                    <div key={st.step} className="relative group">
                      {/* Icon tròn đánh dấu mốc */}
                      <div
                        className={clsx(
                          'absolute -left-6 sm:-left-8 top-0.5 flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full text-xs font-bold transition-all shadow-sm',
                          isDone && col.badge,
                          isCurrent && clsx('ring-4', col.glow, col.badge),
                          isWaiting && 'bg-panel2 border border-line text-muted',
                          isRejected && 'bg-danger text-white'
                        )}
                      >
                        {isDone && <Check size={16} strokeWidth={2.5} />}
                        {isCurrent && (
                          st.name === 'dang_den' ? (
                            <Navigation size={15} className="animate-bounce" />
                          ) : (
                            <span className="h-2.5 w-2.5 rounded-full bg-white animate-ping" />
                          )
                        )}
                        {isWaiting && <span>{st.step}</span>}
                        {isRejected && <X size={16} strokeWidth={2.5} />}
                      </div>

                      {/* Thẻ nội dung mốc */}
                      <div
                        className={clsx(
                          'rounded-2xl border p-3.5 sm:p-4 transition-all',
                          isCurrent
                            ? 'border-accent/40 bg-accent/5 ring-1 ring-accent/20 shadow-sm'
                            : isDone
                            ? 'border-line bg-panel2/40'
                            : 'border-line/60 bg-panel/30 opacity-75'
                        )}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                          <div className="font-bold text-sm sm:text-base text-ink flex items-center gap-2">
                            <span>{st.title}</span>
                            {isCurrent && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent text-white uppercase tracking-wider animate-pulse">
                                Đang diễn ra
                              </span>
                            )}
                          </div>
                          {st.time && (
                            <div className="text-xs font-mono font-semibold text-muted flex items-center gap-1">
                              <Clock size={12} className="shrink-0 text-muted" />
                              <span>{st.time}</span>
                            </div>
                          )}
                        </div>

                        <div className="mt-1 text-xs sm:text-sm text-ink-2 leading-relaxed">
                          {st.detail}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Thông tin lực lượng điều động & Lời dặn an toàn */}
              <div className="mt-6 pt-5 border-t border-line grid gap-3 sm:grid-cols-2">
                {/* Hộp 1: Lực lượng và phương tiện */}
                <div className="rounded-2xl border border-line bg-panel2/60 p-4">
                  <div className="text-xs font-semibold text-muted flex items-center gap-1.5 mb-1.5">
                    <Truck size={14} className="text-accent" />
                    <span>Đơn vị phụ trách ứng cứu:</span>
                  </div>
                  <div className="text-sm font-bold text-ink">
                    {currentItem.force_name || <span className="font-normal text-muted">Chưa phân công</span>}
                  </div>
                  {currentItem.public_note && (
                    <div className="mt-2 text-xs text-ink-2 bg-panel p-2.5 rounded-xl border border-line">
                      <b>Ghi chú của cán bộ:</b> {currentItem.public_note}
                    </div>
                  )}
                </div>

                {/* Hộp 2: Lời dặn an toàn & Liên hệ khẩn cấp */}
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5 mb-1">
                      <AlertTriangle size={15} />
                      <span>Lời dặn quan trọng cho người dân:</span>
                    </div>
                    <p className="text-xs text-ink-2 leading-relaxed">
                      Giữ bình tĩnh, sạc đầy pin điện thoại và mở chuông to. Di chuyển lên tầng cao hoặc nơi khô ráo, giữ ấm cho người già và trẻ em. Tuyệt đối không tự ý lội qua dòng nước lũ chảy xiết!
                    </p>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-amber-500/20">
                    <span className="text-xs font-semibold text-ink">Cần hỗ trợ khẩn cấp:</span>
                    <a
                      href="tel:112"
                      className="btn bg-danger text-white hover:brightness-110 text-xs px-3 py-1.5 font-bold shadow-sm flex items-center gap-1"
                    >
                      <PhoneCall size={13} />
                      <span>Gọi ngay 112</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {onBackToMap && (
        <div className="flex justify-center pt-2">
          <BackButton onClick={onBackToMap}>Quay lại Bản đồ & Cảnh báo</BackButton>
        </div>
      )}
    </div>
  );
}
