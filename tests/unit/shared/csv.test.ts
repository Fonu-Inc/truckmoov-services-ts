import { describe, expect, it } from "vitest";
import { parseCsvRecords, type CsvColumn } from "@shared/csv";

const columns: CsvColumn[] = [
  { header: "name", required: true, example: "", note: "" },
  { header: "note", required: false, example: "", note: "" },
];

describe("parseCsvRecords", () => {
  it("keeps a quoted value that spans lines in one record", () => {
    const parsed = parseCsvRecords(
      'name,note\r\nA,"line one\r\nline ""two"""\nB,plain\n',
      columns,
      (record) => record,
      () => new Error("missing"),
      () => new Error("empty"),
    );

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([
      { name: "A", note: 'line one\r\nline "two"' },
      { name: "B", note: "plain" },
    ]);
  });
});
