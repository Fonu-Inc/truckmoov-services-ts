import { describe, expect, it } from "vitest";
import {
  mergeStockChunk,
  parseStockCsv,
  splitIntoChunks,
  StockCsvError,
  type StockImportTotals,
} from "../../../apps/auth/src/system-device-stock-csv";

describe("parseStockCsv", () => {
  it("reads a BOM and CRLF file, keeping file line numbers", () => {
    const csv = "﻿imei,manufacturer,model,name\r\n359990000000014,Teltonika,FMB920,STOCK-1\r\n\r\n359990000000022,Queclink,GV300\r\n";
    const { rows, problems } = parseStockCsv(csv);
    expect(problems).toEqual([]);
    expect(rows).toEqual([
      { line: 2, imei: "359990000000014", manufacturer: "Teltonika", model: "FMB920", name: "STOCK-1" },
      { line: 4, imei: "359990000000022", manufacturer: "Queclink", model: "GV300" },
    ]);
  });

  it("reports malformed lines instead of forwarding them", () => {
    const { rows, problems } = parseStockCsv("imei,manufacturer,model\n,Teltonika,FMB920\n359990000000014,,FMB920\n359990000000014,Teltonika,FMB920\n");
    expect(rows).toHaveLength(1);
    expect(problems).toEqual([
      { line: 2, imei: "", reason: "imei is required" },
      { line: 3, imei: "359990000000014", reason: "manufacturer is required" },
    ]);
  });

  it("throws on a missing column or an empty file", () => {
    expect(() => parseStockCsv("imei,model\n1,2")).toThrow(StockCsvError);
    expect(() => parseStockCsv("\n  \n")).toThrow(StockCsvError);
  });
});

describe("chunking and merging", () => {
  it("maps fleet row positions back to file lines and caps the report", () => {
    expect(splitIntoChunks([1, 2, 3], 2)).toEqual([[1, 2], [3]]);

    const totals: StockImportTotals = { total: 2, created: 0, skippedExisting: 0, rejected: [], rejectedTotal: 0 };
    const rows = [
      { line: 5, imei: "a", manufacturer: "m", model: "x" },
      { line: 9, imei: "b", manufacturer: "m", model: "x" },
    ];
    mergeStockChunk(totals, rows, {
      created: 0,
      skippedExisting: 1,
      rejected: [{ line: 2, imei: "b", reason: "bad" }],
      rejectedTotal: 1,
    });
    expect(totals.rejected).toEqual([{ line: 9, imei: "b", reason: "bad" }]);
    expect(totals).toMatchObject({ skippedExisting: 1, rejectedTotal: 1 });
  });
});
