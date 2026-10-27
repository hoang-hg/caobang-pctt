/** Màu giao diện lấy từ biến CSS (src/index.css) để đổi Sáng/Tối tức thì. */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        panel: v('panel'),
        panel2: v('panel-2'),
        line: v('line'),
        ink: v('ink'),
        'ink-2': v('ink-2'),
        muted: v('muted'),
        accent: v('accent'),
        danger: v('danger'),
        serious: v('serious'),
        warn: v('warn'),
        good: v('good'),
        info: v('info'),
        // Menu trái, góc thương hiệu thanh trên, thanh trạng thái: xanh đêm ở cả hai nền
        nav: v('nav-bg'),
        'nav-ink': v('nav-ink'),
        'nav-muted': v('nav-muted'),
        'nav-active': v('nav-active'),
      },
      // Chữ màu nhấn / trạng thái: sắc riêng đủ tương phản 4,5 : 1 (src/index.css --*-text); bg-/border-/ring-… giữ màu gốc
      textColor: {
        accent: v('accent-text'),
        danger: v('danger-text'),
        serious: v('serious-text'),
        warn: v('warn-text'),
        good: v('good-text'),
      },
      // Bóng rất nhẹ cho nút / nhãn nổi trên thẻ (Tailwind 3 nhỏ nhất là shadow-sm) — trước đây `shadow-xs` không sinh CSS
      boxShadow: {
        xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Consolas', 'monospace'],
      },
      keyframes: {
        pulseRing: {
          '0%': { transform: 'scale(0.6)', opacity: '0.9' },
          '100%': { transform: 'scale(2.4)', opacity: '0' },
        },
        blink: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
        // Chuyển động có ý nghĩa (một lần, không lặp): mục mới trượt vào danh sách; số liệu vừa đổi hiện lên nhẹ
        enter: { from: { opacity: '0', transform: 'translateY(-6px)' }, to: { opacity: '1', transform: 'none' } },
        tick: { from: { opacity: '0.35', transform: 'translateY(3px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        pulseRing: 'pulseRing 1.6s ease-out infinite',
        blink: 'blink 1s ease-in-out infinite',
        enter: 'enter 0.35s ease-out both',
        tick: 'tick 0.45s ease-out both',
      },
    },
  },
  plugins: [
    // `tall:` = màn cao ≥ 860 px. Dùng `lg:tall:` (rộng ≥ 1024 VÀ cao ≥ 860 — laptop 1440×900, màn rời, TV): có thanh trạng thái
    // dưới cùng (StatusBar); laptop 1366×768 không — màn hình đầu của Tổng quan không đủ chỗ cho thêm 32 px.
    // - KHÔNG khai báo trong `screens` kiểu `raw`: Tailwind sẽ bỏ hết các biến thể `max-sm:` / `max-lg:` (điện thoại vỡ bố cục).
    // - Biến thể của plugin sinh TRƯỚC các mốc màn: `tall:hidden` một mình thua `md:inline-flex`; `lg:tall:` / `xl:tall:` sinh
    //   sau `lg:` / `xl:` nên thắng.
    ({ addVariant }) => addVariant('tall', '@media (min-height: 860px)'),
  ],
};
