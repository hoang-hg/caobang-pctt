// Dọn dữ liệu giả lập trên CSDL của stack PHÁT TRIỂN (docker-compose.yml) — xem clean-simulated-data.sql.
//   node scripts/maintenance/clean-simulated-data.mjs --yes
// Chạy qua `docker compose exec db psql` (không cần cài thư viện Node). Từ chối nếu .env không phải development.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const envFile = path.join(root, '.env');
const env = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
const read = (name, fallback) => (env.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1] ?? fallback).trim();

const appEnv = read('APP_ENV', 'development');
if (appEnv !== 'development') {
  console.error(`Từ chối: APP_ENV=${appEnv}. Script này chỉ dùng cho CSDL máy phát triển.`);
  process.exit(1);
}
if (!process.argv.includes('--yes')) {
  console.error(
    'Script XOÁ toàn bộ SOS, phản ánh, cảnh báo, số đo và mọi tài khoản ngoài danh sách tài khoản mẫu,\n' +
      'rồi MỞ KHOÁ các tài khoản còn lại. Chạy lại với --yes để xác nhận.',
  );
  process.exit(1);
}

const sql = "SET pctt.xac_nhan_don_dep = 'on';\n" + fs.readFileSync(path.join(here, 'clean-simulated-data.sql'), 'utf8');
const result = spawnSync(
  'docker',
  ['compose', 'exec', '-T', 'db', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', read('POSTGRES_USER', 'pctt'), '-d', read('POSTGRES_DB', 'caobang_pctt')],
  { cwd: root, input: sql, stdio: ['pipe', 'inherit', 'inherit'] },
);
if (result.status === 0) {
  console.log('\nXong. Khởi động lại để tiến trình nạp lại phân quyền: docker compose restart backend worker');
}
process.exit(result.status ?? 1);
