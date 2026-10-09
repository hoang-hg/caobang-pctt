import { useStore } from '../app/store';

/**
 * CSS chỉ áp vào BẢN SAO DOM mà html2canvas chụp (onclone) — trang đang xem không đổi:
 * - html2canvas vẽ chữ thấp hơn trình duyệt → ô `truncate` (overflow: hidden), chip bo tròn và ô chọn / ô nhập cắt mất
 *   nửa dưới chữ (tiêu đề thẻ KPI, tên sông, nhãn mức báo động, tên trạm): cho tràn + giãn dòng; chip thành inline-block
 *   với đệm dưới dày hơn đệm trên để chữ nằm giữa viên thuốc;
 * - tắt hiệu ứng nhấp nháy (chụp đúng lúc mờ thì nhãn "quá hạn" gần như trắng);
 * - bỏ nút / ô thao tác (.no-print) — báo cáo giấy không cần.
 */
const SNAPSHOT_CSS = `
*, *::before, *::after { animation: none !important; transition: none !important; }
.truncate { overflow: visible !important; text-overflow: clip !important; line-height: 1.6 !important; }
.chip { display: inline-block !important; line-height: 1.25 !important; vertical-align: middle; padding-top: 1px !important; padding-bottom: 4px !important; }
select, input { line-height: 1.6 !important; min-height: 2.25rem !important; }
.no-print { display: none !important; }
`;

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

/**
 * Điện thoại / máy tính bảng dựng trang theo bề rộng màn hình (thẻ meta viewport): chụp nguyên bố cục 360 px rồi phóng ra
 * A4 thì PDF dài ~19 trang. Tạm cho trình duyệt dựng trang ở bề rộng `width` (bố cục laptop), chụp xong trả lại. Trình
 * duyệt máy tính bỏ qua thẻ này — cửa sổ đã đủ rộng thì không làm gì; trình duyệt không đổi theo thì chụp như cũ.
 */
async function atLayoutWidth(width, run) {
  const meta = document.querySelector('meta[name="viewport"]');
  if (!width || !meta || window.innerWidth >= width) return run();
  const before = meta.getAttribute('content');
  meta.setAttribute('content', `width=${width}`);
  try {
    for (let i = 0; i < 20 && window.innerWidth < width - 2; i += 1) await sleep(100);
    await sleep(800); // biểu đồ, bản đồ đo lại kích thước theo bố cục mới
    return await run();
  } finally {
    meta.setAttribute('content', before);
  }
}

/**
 * Chụp một vùng giao diện thành canvas (tự chuyển sang chế độ Sáng khi chụp để in rõ, tiết kiệm mực).
 * `layoutWidth` (px): điện thoại / máy tính bảng tạm dựng trang ở bề rộng này trước khi chụp (xem atLayoutWidth).
 */
export async function captureSnapshot(element, { layoutWidth } = {}) {
  const { default: html2canvas } = await import('html2canvas');
  const root = document.documentElement;
  const wasDark = root.classList.contains('dark');
  if (wasDark) {
    root.classList.remove('dark');
    useStore.setState({ theme: 'light' }); // biểu đồ đọc lại bảng màu sáng
    await new Promise((r) => setTimeout(r, 350));
  }
  try {
    return await atLayoutWidth(layoutWidth, () => html2canvas(element, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      onclone: (doc) => {
        const style = doc.createElement('style');
        style.textContent = SNAPSHOT_CSS;
        doc.head.appendChild(style);
      },
    }));
  } finally {
    if (wasDark) {
      root.classList.add('dark');
      useStore.setState({ theme: 'dark' });
    }
  }
}

/** Đặt ảnh chụp vào PDF theo bề rộng trang, cắt thành nhiều trang theo chiều cao; trang đầu bắt đầu ở `top` (mm). */
export function addCanvasPages(pdf, canvas, { top, margin = 8, newPage = () => pdf.addPage() }) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgW = pageW - 2 * margin;
  const availH = pageH - top - margin;
  const imgH = (canvas.height * imgW) / canvas.width;
  if (imgH <= availH) {
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin, top, imgW, imgH);
    return;
  }
  const sliceH = Math.floor((canvas.width * availH) / imgW);
  for (let y = 0, page = 0; y < canvas.height; y += sliceH, page++) {
    const part = document.createElement('canvas');
    part.width = canvas.width;
    part.height = Math.min(sliceH, canvas.height - y);
    part.getContext('2d').drawImage(canvas, 0, y, canvas.width, part.height, 0, 0, canvas.width, part.height);
    if (page > 0) newPage();
    pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', margin, page === 0 ? top : margin, imgW, (part.height * imgW) / canvas.width);
  }
}

/**
 * Chụp snapshot một vùng giao diện ra PDF A4 ngang (tự chuyển sang chế độ Sáng khi chụp để in rõ, tiết kiệm mực).
 * `layoutWidth` (px): điện thoại / máy tính bảng tạm dựng trang ở bề rộng này trước khi chụp (xem atLayoutWidth).
 */
export async function exportSnapshotPdf(element, { title, subtitle, filename, layoutWidth }) {
  const [canvas, { jsPDF }] = await Promise.all([captureSnapshot(element, { layoutWidth }), import('jspdf')]);
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  // jsPDF font mặc định không có dấu tiếng Việt → vẽ tiêu đề qua canvas để giữ nguyên dấu
  const header = document.createElement('canvas');
  header.width = 2400;
  header.height = 140;
  const ctx = header.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, header.width, header.height);
  ctx.fillStyle = '#b91c1c';
  ctx.font = 'bold 44px "Be Vietnam Pro", Arial, sans-serif';
  ctx.fillText(title, 0, 56);
  ctx.fillStyle = '#374151';
  ctx.font = '30px "Be Vietnam Pro", Arial, sans-serif';
  ctx.fillText(subtitle, 0, 110);
  const margin = 8;
  const headerH = ((pageW - 2 * margin) * header.height) / header.width;
  pdf.addImage(header.toDataURL('image/png'), 'PNG', margin, margin, pageW - 2 * margin, headerH);
  addCanvasPages(pdf, canvas, { top: margin + headerH + 2, margin });
  pdf.save(filename);
}
