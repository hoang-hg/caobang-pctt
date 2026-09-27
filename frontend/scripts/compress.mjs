// Nén sẵn tệp tĩnh sau khi build (dist/**/*.gz) để nginx phục vụ bằng gzip_static — không tốn CPU nén lại
// cho từng người tải. Chỉ dùng zlib có sẵn của Node, không cần thêm thư viện.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const EXT = /\.(js|css|html|svg|json|txt|webmanifest)$/;
let files = 0;
let before = 0;
let after = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (EXT.test(entry.name)) {
      const data = fs.readFileSync(file);
      if (data.length < 1024) continue;
      const gz = zlib.gzipSync(data, { level: 9 });
      fs.writeFileSync(`${file}.gz`, gz);
      fs.utimesSync(`${file}.gz`, fs.statSync(file).atime, fs.statSync(file).mtime);
      files += 1;
      before += data.length;
      after += gz.length;
    }
  }
}

walk(DIST);
console.log(`Nén sẵn ${files} tệp: ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB (gzip -9)`);
