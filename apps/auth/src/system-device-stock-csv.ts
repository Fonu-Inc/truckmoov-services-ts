import { normalizeCsvHeader, splitCsvLine, stripFormulaGuard } from '@shared/csv';

export type StockCsvRow = { line: number; imei: string; manufacturer: string; model: string; name?: string };
export type StockCsvProblem = { line: number; imei: string; reason: string };

export const STOCK_IMPORT_CHUNK_SIZE = 5000;
export const MAX_REPORTED_STOCK_REJECTIONS = 200;

const REQUIRED = ['imei', 'manufacturer', 'model'];

export class StockCsvError extends Error {}

/** Reads the stock CSV. Line numbers are file lines (header is 1); a malformed line is reported, never forwarded. */
export function parseStockCsv(content: string): { rows: StockCsvRow[]; problems: StockCsvProblem[] } {
  const lines = content.split(/\r?\n/);
  const first = lines.findIndex((line) => line.trim().length > 0);
  if (first === -1) throw new StockCsvError('The CSV is empty');

  const headers = splitCsvLine(lines[first]).map(normalizeCsvHeader);
  const missing = REQUIRED.filter((column) => !headers.includes(column));
  if (missing.length > 0) throw new StockCsvError(`The CSV is missing required column(s): ${missing.join(', ')}`);

  const rows: StockCsvRow[] = [];
  const problems: StockCsvProblem[] = [];
  for (let index = first + 1; index < lines.length; index += 1) {
    if (!lines[index].trim()) continue;
    const values = splitCsvLine(lines[index]);
    const record: Record<string, string> = {};
    headers.forEach((header, position) => {
      record[header] = stripFormulaGuard((values[position] ?? '').trim());
    });

    const line = index + 1;
    const imei = record.imei ?? '';
    const reason = !imei
      ? 'imei is required'
      : !record.manufacturer
        ? 'manufacturer is required'
        : !record.model
          ? 'model is required'
          : record.name && record.name.length > 120
            ? 'name must be at most 120 characters'
            : null;
    if (reason) problems.push({ line, imei, reason });
    else rows.push({ line, imei, manufacturer: record.manufacturer, model: record.model, ...(record.name ? { name: record.name } : {}) });
  }
  return { rows, problems };
}

export type StockImportTotals = {
  total: number;
  created: number;
  skippedExisting: number;
  rejected: StockCsvProblem[];
  rejectedTotal: number;
};

export function splitIntoChunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

/** Folds a chunk's fleet result in, mapping its 1-based row positions back to file lines. */
export function mergeStockChunk(
  totals: StockImportTotals,
  chunkRows: readonly StockCsvRow[],
  result: { created: number; skippedExisting: number; rejected: StockCsvProblem[]; rejectedTotal: number },
): void {
  totals.created += result.created;
  totals.skippedExisting += result.skippedExisting;
  totals.rejectedTotal += result.rejectedTotal;
  for (const entry of result.rejected) {
    if (totals.rejected.length >= MAX_REPORTED_STOCK_REJECTIONS) break;
    totals.rejected.push({ ...entry, line: chunkRows[entry.line - 1]?.line ?? entry.line });
  }
}
