import { describe, expect, it } from "vitest";
import { summarizeStorageCategories } from "../../../apps/fleet/src/storage-usage.service";

describe("summarizeStorageCategories", () => {
  it("returns every category, separating files whose size was never recorded", () => {
    const result = summarizeStorageCategories([
      { category: "pod", files: "3", sized: "3", bytes: "3072" },
      { category: "waybill", files: "4", sized: "1", bytes: "500" },
      { category: "compliance", files: "2", sized: "0", bytes: "0" },
    ]);

    expect(result).toEqual([
      { key: "pod", files: 3, bytes: 3072, unsizedFiles: 0 },
      { key: "waybill", files: 4, bytes: 500, unsizedFiles: 3 },
      { key: "compliance", files: 2, bytes: null, unsizedFiles: 2 },
    ]);
  });

  it("reports zero rather than unknown for an empty category", () => {
    expect(summarizeStorageCategories([])[0]).toEqual({ key: "pod", files: 0, bytes: 0, unsizedFiles: 0 });
  });
});
