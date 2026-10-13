import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SIZE, paginate } from "@shared/pagination";

const rows = Array.from({ length: 45 }, (_, index) => index + 1);

describe("paginate", () => {
  it("defaults to the first page of DEFAULT_PAGE_SIZE", () => {
    const { items, meta } = paginate(rows, {});
    expect(items).toHaveLength(DEFAULT_PAGE_SIZE);
    expect(items[0]).toBe(1);
    expect(meta).toEqual({ total: 45, page: 1, limit: DEFAULT_PAGE_SIZE, totalPages: 3 });
  });

  it("returns the requested page and a short last page", () => {
    const { items, meta } = paginate(rows, { page: 3, limit: 20 });
    expect(items).toEqual([41, 42, 43, 44, 45]);
    expect(meta.page).toBe(3);
  });

  it("returns an empty page past the end and still reports the total", () => {
    const { items, meta } = paginate(rows, { page: 9, limit: 20 });
    expect(items).toEqual([]);
    expect(meta.total).toBe(45);
  });

  it("reports one page for an empty list", () => {
    expect(paginate([], {}).meta).toEqual({ total: 0, page: 1, limit: DEFAULT_PAGE_SIZE, totalPages: 1 });
  });
});
