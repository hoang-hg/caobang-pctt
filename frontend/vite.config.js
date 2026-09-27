import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.VITE_PROXY_TARGET || 'http://localhost:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': API,
      '/health': API,
      '/ws': { target: API.replace('http', 'ws'), ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // Chỉ gom đúng gói thư viện lớn (không kéo theo thư viện phụ thuộc dùng chung như clsx — dạng object của
        // manualChunks làm vậy, khiến cổng công khai phải tải cả recharts). html2canvas / jspdf / xlsx không gom:
        // chúng được import() động khi bấm xuất file.
        manualChunks(id) {
          // Thư viện lõi dùng chung tách riêng, nếu không Rollup gộp chúng vào chunk đầu tiên phụ thuộc (VD charts)
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run|@tanstack|zustand|use-sync-external-store|clsx)[\\/]/.test(id)) return 'vendor';
          if (/[\\/]node_modules[\\/](leaflet|react-leaflet|@react-leaflet|leaflet-draw|react-leaflet-cluster|leaflet\.markercluster)[\\/]/.test(id)) return 'map';
          if (/[\\/]node_modules[\\/](recharts|recharts-scale|victory-vendor|d3-[^\\/]+|internmap|decimal\.js-light)[\\/]/.test(id)) return 'charts';
          return undefined;
        },
      },
    },
  },
});
