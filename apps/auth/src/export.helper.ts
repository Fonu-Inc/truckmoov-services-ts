import { Workbook } from 'exceljs';

function escapeCsvValue(value: unknown): string {
  if (value == null) return '';
  const s = typeof value === 'string' ? value : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function buildExport(
  format: 'csv' | 'xlsx',
  headers: string[],
  rows: unknown[][],
  sheetName: string,
): Promise<{ buffer: Buffer; contentType: string; ext: string }> {
  if (format === 'xlsx') {
    const wb = new Workbook();
    const ws = wb.addWorksheet(sheetName);
    ws.addRow(headers).font = { bold: true };
    for (const row of rows) ws.addRow(row);
    const ab = await wb.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(ab),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ext: 'xlsx',
    };
  }

  const csv = [
    headers.map(escapeCsvValue).join(','),
    ...rows.map((r) => r.map(escapeCsvValue).join(',')),
  ].join('\n');

  return { buffer: Buffer.from(csv, 'utf-8'), contentType: 'text/csv; charset=utf-8', ext: 'csv' };
}
