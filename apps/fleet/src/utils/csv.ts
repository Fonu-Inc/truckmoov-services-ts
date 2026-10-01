import { escapeCsvValue } from "@shared/csv";

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  return escapeCsvValue(typeof value === "number" ? value : String(value));
}

/** With headers given, an empty export is still a header row rather than an empty file. */
export function toCsv(rows: Record<string, unknown>[], headers: readonly string[] = Object.keys(rows[0] ?? {})): string {
  if (headers.length === 0) return "";
  const lines = [headers.join(","), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(","))];
  return lines.join("\n");
}
