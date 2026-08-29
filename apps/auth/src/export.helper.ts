import { Workbook } from 'exceljs';

/** A cell starting with =, +, -, @, tab or CR is a formula in Excel/Sheets, not text. */
function neutralizeFormula(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function escapeCsvValue(value: unknown): string {
  const safe = neutralizeFormula(value);
  if (safe == null) return '';
  const s = typeof safe === 'string' ? safe : String(safe);
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
    for (const row of rows) ws.addRow(row.map(neutralizeFormula));
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
