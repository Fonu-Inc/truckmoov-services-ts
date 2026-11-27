export type StockImportRow = { imei: string; manufacturer: string; model: string; name?: string };

export type StockImportRejection = { line: number; imei: string; reason: string };

export const MAX_STOCK_IMPORT_ROWS = 20000;
export const STOCK_IMPORT_BATCH_SIZE = 500;
export const MAX_REPORTED_REJECTIONS = 200;

export function isLuhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    let digit = Number(digits[digits.length - 1 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

export function catalogKey(manufacturer: string, model: string): string {
  return `${manufacturer.trim().toLowerCase()}|${model.trim().toLowerCase()}`;
}

/** The reason a row cannot become stock, or null when it can. `catalogKeys` come from catalogKey(). */
export function stockRowProblem(row: StockImportRow, catalogKeys: ReadonlySet<string>): string | null {
  const imei = typeof row.imei === "string" ? row.imei.trim() : "";
  if (!/^\d{15}$/.test(imei)) return "IMEI must be exactly 15 digits";
  if (!isLuhnValid(imei)) return "IMEI fails the check-digit test";
  const manufacturer = typeof row.manufacturer === "string" ? row.manufacturer.trim() : "";
  const model = typeof row.model === "string" ? row.model.trim() : "";
  if (!manufacturer) return "manufacturer is required";
  if (!model) return "model is required";
  if (!catalogKeys.has(catalogKey(manufacturer, model))) return `${manufacturer} ${model} is not in the device catalog`;
  if (row.name !== undefined && (typeof row.name !== "string" || row.name.trim().length > 120)) {
    return "name must be at most 120 characters";
  }
  return null;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}
