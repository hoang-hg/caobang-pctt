import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
// Font tự lưu trữ (đóng gói cùng giao diện, nginx phục vụ /assets/) — không phụ thuộc Google Fonts: đứt cáp quốc tế
// vẫn hiển thị ngay, và không gửi IP người dân ra dịch vụ ngoài. Chỉ bảng mã Latin + tiếng Việt (unicode-range →
// trình duyệt chỉ tải phần trang dùng tới).
import '@fontsource/be-vietnam-pro/latin-400.css';
import '@fontsource/be-vietnam-pro/vietnamese-400.css';
import '@fontsource/be-vietnam-pro/latin-500.css';
import '@fontsource/be-vietnam-pro/vietnamese-500.css';
import '@fontsource/be-vietnam-pro/latin-600.css';
import '@fontsource/be-vietnam-pro/vietnamese-600.css';
import '@fontsource/be-vietnam-pro/latin-700.css';
import '@fontsource/be-vietnam-pro/vietnamese-700.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/vietnamese-500.css';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import './index.css';
import App from './App';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 } },
});

// Service worker (src/sw.js, README 9.4): mở lại cổng công khai khi mất mạng với dữ liệu đã lưu. Chỉ bản build —
// máy dev (Vite) không đăng ký để khỏi phục vụ nhầm mã cũ.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
