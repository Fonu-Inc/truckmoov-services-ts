import { Workbook } from 'exceljs';
import { escapeCsvValue } from '@shared/csv';

/** A cell starting with =, +, -, @, tab or CR is a formula in Excel/Sheets, not text. */
function neutralizeFormula(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvCell(value: unknown): string {
  return escapeCsvValue(typeof value === 'number' || value == null ? value : String(value));
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
    for (const row of rows) ws.addRow(row.map(neutralizeFormula));
    const ab = await wb.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(ab),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ext: 'xlsx',
    };
  }

  const csv = [
    headers.map(csvCell).join(','),
    ...rows.map((r) => r.map(csvCell).join(',')),
  ].join('\n');

  return { buffer: Buffer.from(csv, 'utf-8'), contentType: 'text/csv; charset=utf-8', ext: 'csv' };
}
