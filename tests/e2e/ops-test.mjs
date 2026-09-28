// Kiểm thử tự giám sát vận hành (cần stack đang chạy). CI đặt OPS_DISK_WARN_PCT=1 → giả lập ổ đĩa đầy để thử trọn
// luồng cảnh báo: worker phát hiện → email tới người vận hành (Mailpit) → /health/full trả 503.
//   node tests/e2e/ops-test.mjs [http://localhost:8000] [http://localhost:8025 (Mailpit)]
import { execFileSync } from 'node:child_process';

const ROOT = process.argv[2] || 'http://localhost:8000';
const MAILPIT = process.argv[3] || 'http://localhost:8025';
let failures = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures += 1;
};
async function full() {
  const res = await fetch(`${ROOT}/health/full`);
  return { status: res.status, data: await res.json().catch(() => null) };
}

// Vòng kiểm tra đầu tiên của worker chạy 30 giây sau khi khởi động → chờ có kết quả ổ đĩa
let r = await full();
for (let i = 0; i < 60 && !Object.keys(r.data?.checks || {}).some((k) => k.startsWith('disk:')); i += 1) {
  await sleep(2000);
  r = await full();
}
const checks = r.data?.checks || {};
check('/health/full kiểm tra ngay CSDL, Redis, nhịp worker', ['db', 'redis', 'worker'].every((k) => k in checks), JSON.stringify(checks));
check('Worker đã kiểm tra ổ đĩa và API', Object.keys(checks).some((k) => k.startsWith('disk:')) && checks.api === true);
check('CSDL, Redis, worker, API đều đạt', ['db', 'redis', 'worker', 'api'].every((k) => checks[k] === true));
const allOk = Object.values(checks).every(Boolean);
check('Mã HTTP khớp kết quả (200 = mọi kiểm tra đạt, 503 = có sự cố)',
  r.status === (allOk ? 200 : 503) && r.data?.status === (allOk ? 'ok' : 'degraded'), `${r.status} ${r.data?.status}`);
check('Không lộ chi tiết hạ tầng (chỉ tên kiểm tra + đạt / lỗi)', Object.values(checks).every((v) => typeof v === 'boolean'));

if (checks['disk:/'] === false) {
  // Báo sau 2 lần lỗi liên tiếp (cách nhau 1 phút) → chờ tới ~2,5 phút
  let mail;
  for (let i = 0; i < 30 && !mail; i += 1) {
    try {
      const list = await (await fetch(`${MAILPIT}/api/v1/messages`)).json();
      mail = list.messages.find((m) => m.Subject.includes('SỰ CỐ') && m.Subject.includes('Ổ đĩa'));
    } catch { /* Mailpit không chạy */ }
    if (!mail) await sleep(5000);
  }
  check('Ổ đĩa vượt ngưỡng → email cảnh báo sự cố tới người vận hành', !!mail, mail?.Subject);
  if (mail) {
    const body = await (await fetch(`${MAILPIT}/api/v1/message/${mail.ID}`)).json();
    check('Email nêu mức dùng, ngưỡng và cách xử lý', /đã dùng \d+%/.test(body.Text) && body.Text.includes('ngưỡng báo 1%') && body.Text.includes('dcp logs'));
    const count = (await (await fetch(`${MAILPIT}/api/v1/messages`)).json()).messages.filter((m) => m.Subject.includes('Ổ đĩa')).length;
    check('Chỉ báo 1 lần (nhắc lại sau OPS_ALERT_REPEAT_MIN, không gửi mỗi phút)', count === 1, `${count} email`);
  }
} else {
  console.log('SKIP  Email cảnh báo sự cố (ổ đĩa chưa vượt ngưỡng — chạy stack với OPS_DISK_WARN_PCT=1 để thử)');
}

// ---------------------------------------------------------------- Giữ nhật ký có thời hạn (worker dọn mỗi giờ)
// Cần Docker (stack dev: container caobang-pctt-db / caobang-pctt-worker)
const sql = (q) => execFileSync('docker', ['exec', 'caobang-pctt-db', 'psql', '-U', 'pctt', '-d', 'caobang_pctt', '-tAc', q], { encoding: 'utf8' }).trim();
let dockerOk = true;
try { sql('SELECT 1'); } catch { dockerOk = false; }
if (dockerOk) {
  const tag = `e2e-retention-${Date.now()}`;
  sql(`INSERT INTO integrations.ingest_log (time, source, message) VALUES
         (now() - interval '40 days', 'E2E', '${tag}-cu'), (now() - interval '2 days', 'E2E', '${tag}-moi')`);
  sql(`INSERT INTO operations.event_logs (time, category, message) VALUES
         (now() - interval '800 days', 'he_thong', '${tag}-cu'), (now() - interval '2 days', 'he_thong', '${tag}-moi')`);
  const out = execFileSync('docker', ['exec', 'caobang-pctt-worker', 'python', '-c',
    'import asyncio; from app.services.retention import purge_old_logs; print(asyncio.run(purge_old_logs()))'], { encoding: 'utf8' });
  const left = (t) => sql(`SELECT string_agg(message, ',' ORDER BY message) FROM ${t} WHERE message LIKE '${tag}%'`);
  check('Dọn nhật ký tiếp nhận IoT quá 30 ngày, giữ bản ghi mới', left('integrations.ingest_log') === `${tag}-moi`, out.trim());
  check('Dọn dòng sự kiện vận hành quá 730 ngày, giữ bản ghi mới', left('operations.event_logs') === `${tag}-moi`);
  sql(`DELETE FROM integrations.ingest_log WHERE message LIKE '${tag}%'`);
  sql(`DELETE FROM operations.event_logs WHERE message LIKE '${tag}%'`);
} else {
  console.log('SKIP  Giữ nhật ký có thời hạn (không gọi được docker exec)');
}

console.log(failures ? `\n${failures} kiểm tra THẤT BẠI` : '\nTất cả kiểm tra tự giám sát vận hành đạt');
// exitCode thay vì process.exit(): Node trên Windows có thể lỗi "UV_HANDLE_CLOSING" khi thoát lúc kết nối fetch đang đóng
process.exitCode = failures ? 1 : 0;
