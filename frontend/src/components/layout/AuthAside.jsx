import { Map as MapIcon, Megaphone, Siren } from 'lucide-react';
import { BrandLockup } from './BrandMark';
import ProvinceArt from './ProvinceArt';

// Ba việc chính của hệ thống — biểu tượng trùng mục menu cùng việc (components/layout/nav.js)
const WORK = [
  { icon: MapIcon, text: 'Giám sát mưa, mực nước sông trên bản đồ' }, // hệ thống không theo dõi hồ chứa (docs/pham-vi-thien-tai.md)
  { icon: Siren, text: 'Nhận tin báo cứu nạn, điều đội cứu hộ' },
  { icon: Megaphone, text: 'Ban hành cảnh báo khẩn cấp tới người dân' },
];

/**
 * Cột trái các trang đăng nhập / tài khoản (máy tính ≥ 1024 px — bản vẽ khung L1 – L8): biểu trưng, tiêu đề, ba việc chính, hình
 * ranh giới tỉnh và các xã từ dữ liệu của hệ thống (không dùng ảnh chụp ô bản đồ / ảnh trên mạng). Dính đỉnh, cao đúng 1 màn
 * hình: cột phải dài (cài xác thực 2 lớp) vẫn thấy đủ cột trái. Nền xanh đêm như khối đầu trang Tổng quan; lưới chấm mờ dần +
 * quầng sáng sau hình tỉnh tạo chiều sâu (màu chuyển chỉ trong khối có data-mau-chuyen — docs/ke-hoach-lam-moi-giao-dien.md mục 1.3).
 */
export default function AuthAside() {
  return (
    <aside data-mau-chuyen="" className="hero-brand sticky top-0 isolate flex h-screen supports-[height:100dvh]:h-dvh w-[46%] shrink-0 flex-col gap-7 overflow-hidden p-10 text-slate-200">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(rgb(148_163_184/0.16)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(75%_60%_at_50%_42%,black,transparent)]" />
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[42%] -z-10 aspect-square w-[90%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(37_99_235/0.35),transparent)]" />
      <BrandLockup />
      {/* ≥ 1280 px (bản vẽ khung L1): tiêu đề, việc chính ngay dưới biểu trưng; hình tỉnh mờ phía dưới */}
      <ProvinceArt className="min-h-0 w-full flex-1 text-slate-300 drop-shadow-[0_0_14px_rgb(59_130_246/0.45)] xl:order-3 xl:opacity-60" />
      <div className="max-w-md xl:order-2">
        <h1 className="text-balance text-[26px] font-bold leading-tight text-white xl:text-3xl">Điều hành phòng chống thiên tai và tìm kiếm cứu nạn</h1>
        <p className="mt-3 text-base text-slate-300">Tỉnh Cao Bằng · 56 xã, phường · trực 24/7</p>
        <ul className="mt-6 flex flex-col gap-3 [@media(max-height:640px)]:hidden">
          {WORK.map((w) => (
            <li key={w.text} className="flex items-center gap-3 text-[15px] leading-snug text-slate-200">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] text-sky-300 ring-1 ring-inset ring-white/10" aria-hidden="true">
                <w.icon size={18} />
              </span>
              {w.text}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-slate-400 xl:order-4">Hình: ranh giới tỉnh và các xã, phường từ dữ liệu của hệ thống.</p>
    </aside>
  );
}
