import { escapeCsvValue } from "@shared/csv";

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  return escapeCsvValue(typeof value === "number" ? value : String(value));
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(","), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(","))];
  return lines.join("\n");
}
