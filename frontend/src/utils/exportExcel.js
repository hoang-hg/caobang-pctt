/** Xuất bảng ra Excel (.xlsx) để báo cáo cấp trên. rows: mảng object đã đặt tên cột tiếng Việt. */
export async function exportExcel(rows, { sheet = 'Du lieu', filename }) {
  await exportExcelSheets([{ name: sheet, rows }], { filename });
}

/** Nhiều trang tính trong một tệp (VD báo cáo đợt thiên tai: tổng hợp, SOS theo xã, vật tư, sơ tán, cảnh báo). Trang trống
 * vẫn có dòng tiêu đề "Không có dữ liệu" — người đọc biết là không có, không phải xuất thiếu. */
export async function exportExcelSheets(sheets, { filename }) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const { name, rows } of sheets) {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'Không có dữ liệu': '' }]);
    ws['!cols'] = Object.keys(rows[0] || {}).map((k) => ({ wch: Math.max(12, Math.min(48, k.length + 4)) }));
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}
