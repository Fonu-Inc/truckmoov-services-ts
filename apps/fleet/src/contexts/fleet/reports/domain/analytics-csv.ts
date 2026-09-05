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
  lines.push(...flatten(input.summary).map(([key, value]) => `${escape(key)},${escape(value)}`));
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
  if (Array.isArray(value)) {
    if (value.length === 0) return ["(none)"];
    const headers = [...new Set(value.flatMap((row) => Object.keys(row as object)))];
    return [
      headers.map(escape).join(","),
      ...value.map((row) =>
        headers.map((header) => escape((row as Record<string, unknown>)[header])).join(","),
      ),
    ];
  }

  if (value && typeof value === "object") {
    return flatten(value as Record<string, unknown>).map(([key, entry]) => `${escape(key)},${escape(entry)}`);
  }

  return [escape(value)];
}

function flatten(source: Record<string, unknown>, prefix = ""): Array<[string, unknown]> {
  return Object.entries(source).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === "object" && !Array.isArray(value)
      ? flatten(value as Record<string, unknown>, path)
      : [[path, value] as [string, unknown]];
  });
}

// Cells carry driver names, station names and plate numbers, all typed by
// people. A spreadsheet treats a leading =, +, -, @ or control character as a
// formula, so those are neutralised with a leading apostrophe before the usual
// quoting.
const FORMULA_LEAD = /^[=+\-@\t\r]/;

function escape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = Array.isArray(value) ? value.join(" | ") : String(value);
  const text = FORMULA_LEAD.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
