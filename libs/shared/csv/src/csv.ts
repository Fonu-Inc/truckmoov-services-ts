/**
 * CSV primitives shared by every import/export in the fleet service.
 *
 * These were copied per context until there were three of them. One copy means
 * the formula guard cannot be present on one export and missing on the next.
 */

export type CsvColumn = {
  header: string;
  required: boolean;
  example: string;
  note: string;
};

export type CsvRowError = { line: number; message: string };

// A value is whatever a person typed. A spreadsheet reads a leading =, +, -, @
// or control character as a formula, so it is neutralised with an apostrophe on
// the way out and stripped again on the way in, which keeps an export
// importable without changing the stored value. A number is never typed text,
// so a negative amount stays a number.
const FORMULA_LEAD = /^[=+\-@\t\r]/;

export function escapeCsvValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  const raw = value;
  const text = FORMULA_LEAD.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function stripFormulaGuard(value: string): string {
  return value.startsWith("'") && FORMULA_LEAD.test(value.slice(1)) ? value.slice(1) : value;
}

export function normalizeCsvHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, "_").replace(/^﻿/, "");
}

export function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        current += character;
      }
      continue;
    }

    if (character === '"') quoted = true;
    else if (character === ",") {
      values.push(current);
      current = "";
    } else current += character;
  }

  values.push(current);
  return values;
}

export function buildCsvTemplate(columns: readonly CsvColumn[]): string {
  const headers = columns.map((column) => column.header);
  const example = columns.map((column) => column.example);
  return `${headers.join(",")}\n${example.join(",")}\n`;
}

export function buildCsvExport(
  columns: readonly CsvColumn[],
  rows: Array<Array<string | number | null>>,
): string {
  const headers = columns.map((column) => column.header);
  return [headers.join(","), ...rows.map((row) => row.map(escapeCsvValue).join(","))].join("\n");
}

export type CsvRecordParseResult<T> = {
  rows: T[];
  errors: CsvRowError[];
};

/**
 * Reads a CSV into records keyed by normalised header.
 *
 * Bad rows are collected rather than thrown: a file of two hundred rows with
 * three broken lines should import the other hundred and ninety seven and say
 * which three failed. A missing required column is different — nothing in the
 * file can be trusted then — so that throws.
 */
export function parseCsvRecords<T>(
  content: string,
  columns: readonly CsvColumn[],
  toRow: (record: Record<string, string>) => T,
  onMissingColumns: (missing: string[]) => Error,
  onEmpty: () => Error,
): CsvRecordParseResult<T> {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) throw onEmpty();

  const headers = splitCsvLine(lines[0]).map(normalizeCsvHeader);
  const missing = columns
    .filter((column) => column.required && !headers.includes(column.header))
    .map((column) => column.header);
  if (missing.length > 0) throw onMissingColumns(missing);

  const rows: T[] = [];
  const errors: CsvRowError[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const values = splitCsvLine(lines[index]);
    const record: Record<string, string> = {};
    headers.forEach((header, position) => {
      record[header] = stripFormulaGuard((values[position] ?? "").trim());
    });

    try {
      rows.push(toRow(record));
    } catch (error) {
      errors.push({
        line: index + 1,
        message: error instanceof Error ? error.message : "Row could not be read",
      });
    }
  }

  return { rows, errors };
}
