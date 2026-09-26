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
        manualChunks: {
          map: ['leaflet', 'react-leaflet', 'leaflet-draw'],
          charts: ['recharts'],
          export: ['html2canvas', 'jspdf', 'xlsx'],
        },
      },
    },
  },
});
