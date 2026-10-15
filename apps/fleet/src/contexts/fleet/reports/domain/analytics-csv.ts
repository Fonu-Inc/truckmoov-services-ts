import { escapeCsvValue } from "@shared/csv";

export type AnalyticsCsvInput = {
  periodDays: number;
  summary: Record<string, unknown>;
  fleetStatus: unknown;
  jobPipeline: unknown;
  fuelLevels: unknown;
  driverScores: unknown;
};

/**
 * The analytics tab is six panels of different shapes, so the export is a
 * sectioned CSV rather than one table. A spreadsheet opens it; a parser reads
 * it section by section.
 */
export function buildAnalyticsCsv(input: AnalyticsCsvInput): string {
  const lines: string[] = [`Analytics export,last ${input.periodDays} day(s)`, ""];

  lines.push("Summary");
  lines.push(...renderRecord(input.summary));
  lines.push("");

  for (const [title, value] of [
    ["Fleet status", input.fleetStatus],
    ["Job pipeline", input.jobPipeline],
    ["Fuel levels", input.fuelLevels],
    ["Driver scores", input.driverScores],
  ] as const) {
    lines.push(title);
    lines.push(...renderSection(value));
    lines.push("");
  }

  return lines.join("\n");
}

function renderSection(value: unknown): string[] {
  if (Array.isArray(value)) return renderTable(value);
  if (isRecord(value)) return renderRecord(value);
  return [escape(value)];
}

function renderTable(rows: unknown[]): string[] {
  if (rows.length === 0) return ["(none)"];
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row as object)))];
  return [
    headers.map(escape).join(","),
    ...rows.map((row) =>
      headers.map((header) => escape((row as Record<string, unknown>)[header])).join(","),
    ),
  ];
}

// Scalars stay as key,value lines. A list of objects is a table of its own: a
// label row, then the keys as a header, then one row per item. Joining the
// items into one cell would write "[object Object]" for every one of them.
function renderRecord(record: Record<string, unknown>): string[] {
  return flatten(record).flatMap(([key, entry]) =>
    isRowList(entry) ? [escape(key), ...renderTable(entry)] : [`${escape(key)},${escape(entry)}`],
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRowList(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every(isRecord);
}

function flatten(source: Record<string, unknown>, prefix = ""): Array<[string, unknown]> {
  return Object.entries(source).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return isRecord(value)
      ? flatten(value, path)
      : [[path, value] as [string, unknown]];
  });
}

function escape(value: unknown): string {
  if (typeof value === "number" || value == null) return escapeCsvValue(value);
  return escapeCsvValue(Array.isArray(value) ? value.join(" | ") : typeof value === "object" ? JSON.stringify(value) : String(value));
}
