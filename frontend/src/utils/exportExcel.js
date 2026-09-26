/** Xuất bảng ra Excel (.xlsx) để báo cáo cấp trên. rows: mảng object đã đặt tên cột tiếng Việt. */
export async function exportExcel(rows, { sheet = 'Du lieu', filename }) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = Object.keys(rows[0] || {}).map((k) => ({ wch: Math.max(12, Math.min(48, k.length + 4)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31));
  XLSX.writeFile(wb, filename);
}
