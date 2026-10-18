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
      },
      // Chữ màu trạng thái: sắc riêng cho nền sáng (src/index.css --*-text); bg-/border-/ring-warn… giữ màu gốc
      textColor: {
        danger: v('danger-text'),
        serious: v('serious-text'),
        warn: v('warn-text'),
        good: v('good-text'),
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
  plugins: [],
};
