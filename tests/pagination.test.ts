import { describe, expect, it } from "vitest";
import { getPagination, getPaginationItems, PAGE_SIZE } from "../src/lib/pagination";

describe("pagination", () => {
  it("uses ten items per page and calculates the final range", () => {
    expect(PAGE_SIZE).toBe(10);
    expect(getPagination(2, 23)).toEqual({ page: 2, pageCount: 3, start: 10, end: 20 });
    expect(getPagination(3, 23)).toEqual({ page: 3, pageCount: 3, start: 20, end: 23 });
  });

  it("keeps empty and out-of-range pages within valid bounds", () => {
    expect(getPagination(5, 0)).toEqual({ page: 1, pageCount: 1, start: 0, end: 0 });
    expect(getPagination(8, 21)).toEqual({ page: 3, pageCount: 3, start: 20, end: 21 });
  });

  it("shows nearby page numbers with ellipses for long lists", () => {
    expect(getPaginationItems(6, 12)).toEqual([1, "ellipsis", 5, 6, 7, "ellipsis", 12]);
  });
});
