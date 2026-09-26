import { useStore } from '../app/store';

/** Chụp snapshot một vùng giao diện ra PDF A4 ngang (tự chuyển sang chế độ Sáng khi chụp để in rõ, tiết kiệm mực). */
export async function exportSnapshotPdf(element, { title, subtitle, filename }) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const root = document.documentElement;
  const wasDark = root.classList.contains('dark');
  if (wasDark) {
    root.classList.remove('dark');
    useStore.setState({ theme: 'light' }); // biểu đồ đọc lại bảng màu sáng
    await new Promise((r) => setTimeout(r, 350));
  }
  try {
    const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
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

    const top = margin + headerH + 2;
    const availH = pageH - top - margin;
    const imgW = pageW - 2 * margin;
    const imgH = (canvas.height * imgW) / canvas.width;
    if (imgH <= availH) {
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin, top, imgW, imgH);
    } else {
      // Chia trang theo chiều cao
      const sliceH = Math.floor((canvas.width * availH) / imgW);
      for (let y = 0, page = 0; y < canvas.height; y += sliceH, page++) {
        const part = document.createElement('canvas');
        part.width = canvas.width;
        part.height = Math.min(sliceH, canvas.height - y);
        part.getContext('2d').drawImage(canvas, 0, y, canvas.width, part.height, 0, 0, canvas.width, part.height);
        if (page > 0) pdf.addPage();
        pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', margin, page === 0 ? top : margin, imgW, (part.height * imgW) / canvas.width);
      }
    }
    pdf.save(filename);
  } finally {
    if (wasDark) {
      root.classList.add('dark');
      useStore.setState({ theme: 'dark' });
    }
  }
}
