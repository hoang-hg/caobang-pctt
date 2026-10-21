/**
 * Hình nét đơn cho màn trống / lỗi / mất mạng (kế hoạch làm mới giao diện, mục 4) và thẻ tình huống của Hướng dẫn xử lý
 * (mục 6.5): SVG viết thẳng trong mã — không tải thêm tệp, đổi màu theo chữ (`currentColor` = màu chữ mờ; nét nhấn theo màu
 * nhấn), hợp cả nền Sáng và Tối. Chỉ minh hoạ, luôn đi kèm chữ nói rõ cần làm gì. `name`: một trong ART.
 */
const STROKE = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };
const ACCENT = { ...STROKE, className: 'text-accent' };

const ART = {
  // Chưa có phiếu: bảng kẹp giấy, dòng kẻ, dấu ✓
  phieu: (
    <>
      <rect x="40" y="12" width="40" height="56" rx="4" {...STROKE} />
      <rect x="50" y="8" width="20" height="9" rx="2" {...STROKE} />
      <path d="M48 30h24M48 38h24M48 46h14" {...STROKE} />
      <path d="M62 56l4 4 8-9" {...ACCENT} />
    </>
  ),
  // Hộp thư trống: khay, mũi tên vào
  'hop-thu': (
    <>
      <path d="M30 44l8-22h44l8 22v18a4 4 0 0 1-4 4H34a4 4 0 0 1-4-4z" {...STROKE} />
      <path d="M30 44h18l4 7h16l4-7h18" {...STROKE} />
      <path d="M60 10v18M53 21l7 7 7-7" {...ACCENT} />
    </>
  ),
  // Bản đồ: tờ bản đồ gấp, ghim vị trí
  'ban-do': (
    <>
      <path d="M26 22l20-8 28 8 20-8v44l-20 8-28-8-20 8z" {...STROKE} />
      <path d="M46 14v44M74 22v44" {...STROKE} />
      <path d="M60 50s-9-9-9-15a9 9 0 0 1 18 0c0 6-9 15-9 15z" {...ACCENT} />
      <circle cx="60" cy="35" r="3" {...ACCENT} />
    </>
  ),
  // Không tìm thấy: danh sách, kính lúp
  tim: (
    <>
      <rect x="28" y="14" width="44" height="52" rx="4" {...STROKE} />
      <path d="M36 26h28M36 34h28M36 42h16" {...STROKE} />
      <circle cx="74" cy="52" r="11" {...ACCENT} />
      <path d="M82 60l9 9" {...ACCENT} />
    </>
  ),
  // Mất mạng: đám mây, gạch chéo
  'mat-mang': (
    <>
      <path d="M40 58h42a13 13 0 0 0 1-26 18 18 0 0 0-34-5 13 13 0 0 0-9 31z" {...STROKE} />
      <path d="M34 18l52 48" {...ACCENT} />
    </>
  ),
  // Máy chủ lỗi: 2 tầng máy chủ, dấu chấm than
  loi: (
    <>
      <rect x="34" y="16" width="52" height="20" rx="3" {...STROKE} />
      <rect x="34" y="44" width="52" height="20" rx="3" {...STROKE} />
      <path d="M42 26h8M42 54h8" {...STROKE} />
      <circle cx="78" cy="26" r="1.5" fill="currentColor" stroke="none" />
      <path d="M94 30v14" {...ACCENT} />
      <circle cx="94" cy="51" r="1.2" fill="currentColor" stroke="none" className="text-accent" />
    </>
  ),
  // Không có cảnh báo: loa, vạch sóng lặng
  'canh-bao': (
    <>
      <path d="M32 34v12h10l20 12V22L42 34z" {...STROKE} />
      <path d="M72 32c4 4 4 12 0 16M80 26c8 8 8 20 0 28" {...ACCENT} />
    </>
  ),
  // Chưa có dữ liệu: khung biểu đồ, cột nét đứt
  'du-lieu': (
    <>
      <path d="M28 14v52h64" {...STROKE} />
      <path d="M40 58V44M54 58V32M68 58V38M82 58V24" {...STROKE} strokeDasharray="3 4" />
      <path d="M38 40l14-10 14 6 16-14" {...ACCENT} />
    </>
  ),
  // ── Hình cho thẻ tình huống (Hướng dẫn xử lý) ──
  // Đầu ca / đầu ngày: mặt trời mọc trên đường chân trời
  'dau-ca': (
    <>
      <path d="M20 58h80" {...STROKE} />
      <path d="M44 58a16 16 0 0 1 32 0" {...ACCENT} />
      <path d="M60 32v-8M42 40l-6-6M78 40l6-6M34 52h-8M86 52h8" {...ACCENT} />
      <path d="M34 66h52M46 72h28" {...STROKE} />
    </>
  ),
  // Tin báo cứu hộ: đèn hiệu trên đế, tia sáng
  sos: (
    <>
      <path d="M46 56V44a14 14 0 0 1 28 0v12" {...STROKE} />
      <path d="M38 56h44v9H38z" {...STROKE} />
      <path d="M60 40v8" {...ACCENT} />
      <path d="M60 20v-7M42 26l-5-5M78 26l5-5M33 40h-7M87 40h7" {...ACCENT} />
    </>
  ),
  // Chi viện: xe cứu trợ có dấu cộng, vệt chạy
  'chi-vien': (
    <>
      <path d="M26 28h42v28H26z" {...STROKE} />
      <path d="M68 36h14l10 10v10H68z" {...STROKE} />
      <circle cx="38" cy="60" r="6" {...STROKE} />
      <circle cx="80" cy="60" r="6" {...STROKE} />
      <path d="M47 34v16M39 42h16" {...ACCENT} />
      <path d="M10 36h9M12 46h9" {...STROKE} />
    </>
  ),
  // Duyệt: khiên, dấu ✓
  duyet: (
    <>
      <path d="M60 12l24 8v18c0 15-10 25-24 30-14-5-24-15-24-30V20z" {...STROKE} />
      <path d="M50 40l7 7 14-15" {...ACCENT} />
    </>
  ),
  // Kho: ba thùng hàng xếp chồng, băng dán
  kho: (
    <>
      <path d="M32 42h26v24H32zM62 42h26v24H62zM47 16h26v26H47z" {...STROKE} />
      <path d="M45 42v8M75 42v8M60 16v8" {...ACCENT} />
      <path d="M24 66h72" {...STROKE} />
    </>
  ),
  // Sơ tán: nhà ở chỗ thấp, mũi tên lên lều ở chỗ cao
  'so-tan': (
    <>
      <path d="M12 66h34l26-24h36" {...STROKE} />
      <path d="M20 66V54l11-9 11 9v12" {...STROKE} />
      <path d="M44 48c10-14 22-20 38-20" {...ACCENT} />
      <path d="M77 22l6 6-7 4" {...ACCENT} />
      <path d="M90 42l8-14 8 14z" {...STROKE} />
    </>
  ),
  // Phản ánh có ảnh: máy ảnh
  anh: (
    <>
      <path d="M30 28h60a4 4 0 0 1 4 4v30a4 4 0 0 1-4 4H30a4 4 0 0 1-4-4V32a4 4 0 0 1 4-4z" {...STROKE} />
      <path d="M48 28l4-8h16l4 8" {...STROKE} />
      <circle cx="60" cy="47" r="11" {...ACCENT} />
      <circle cx="82" cy="37" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  // Tài khoản mới: người, dấu cộng
  'tai-khoan': (
    <>
      <circle cx="52" cy="30" r="11" {...STROKE} />
      <path d="M30 66c0-13 10-22 22-22s22 9 22 22" {...STROKE} />
      <path d="M90 28v18M81 37h18" {...ACCENT} />
    </>
  ),
  // Mật khẩu, mất máy: chìa khoá
  khoa: (
    <>
      <circle cx="40" cy="40" r="14" {...ACCENT} />
      <circle cx="40" cy="40" r="4" {...STROKE} />
      <path d="M54 40h42M84 40v9M92 40v7" {...STROKE} />
    </>
  ),
};

export const ART_NAMES = Object.keys(ART);

export default function EmptyArt({ name, className = 'h-16 w-24' }) {
  const art = ART[name];
  if (!art) return null;
  return (
    <svg viewBox="0 0 120 80" className={className} aria-hidden="true" focusable="false">
      {art}
    </svg>
  );
}
