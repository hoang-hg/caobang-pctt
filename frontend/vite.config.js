import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.VITE_PROXY_TARGET || 'http://localhost:8000';

/**
 * Xuất dist/sw.js từ src/sw.js (README 9.4): danh sách lưu sẵn = index.html + tệp tĩnh ở public/ + chunk cổng công
 * khai tải lần đầu (entry, PublicPortal và import tĩnh của chúng, kèm CSS). Phiên bản đổi khi tệp nào trong danh sách
 * hoặc mã service worker đổi → trình duyệt cài bản mới, xoá bộ nhớ cũ.
 */
function serviceWorker() {
  const template = new URL('./src/sw.js', import.meta.url);
  return {
    name: 'pctt-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = new Set(['/index.html', '/favicon.svg', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']);
      const add = (name) => {
        const item = bundle[name];
        if (!item || files.has(`/${name}`)) return;
        files.add(`/${name}`);
        if (item.type !== 'chunk') return;
        item.imports.forEach(add);
        item.viteMetadata?.importedCss?.forEach((css) => files.add(`/${css}`));
      };
      for (const item of Object.values(bundle)) {
        if (item.type === 'chunk' && (item.isEntry || /PublicPortal\.jsx$/.test(item.facadeModuleId || ''))) add(item.fileName);
      }
      const precache = [...files].sort();
      const source = fs.readFileSync(template, 'utf8');
      const version = createHash('sha256').update(source).update(precache.join('\n')).digest('hex').slice(0, 12);
      const fill = {
        "const VERSION = '__VERSION__';": `const VERSION = '${version}';`,
        'const PRECACHE = __PRECACHE__;': `const PRECACHE = ${JSON.stringify(precache)};`,
      };
      let out = source;
      for (const [from, to] of Object.entries(fill)) {
        if (!out.includes(from)) this.error(`src/sw.js thiếu dòng "${from}"`);
        out = out.replace(from, to);
      }
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: out });
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  server: {
    port: 5173,
    proxy: {
      '/api': API,
      '/health': API,
      '/ws': { target: API.replace('http', 'ws'), ws: true },
      // bản nhẹ: nginx đổi /ban-nhe → /api/v1/public/lite; máy dev làm tương tự
      '/ban-nhe': { target: API, rewrite: (p) => p.replace(/^\/ban-nhe/, '/api/v1/public/lite') },
    },
  },
  build: {
    chunkSizeWarningLimit: 1600,
    // Không nhúng font vào CSS dạng base64 (to hơn ~33%, không cache riêng được) — tải riêng từ /assets/
    assetsInlineLimit: (file) => (/\.(woff2?|ttf)$/.test(file) ? false : undefined),
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
