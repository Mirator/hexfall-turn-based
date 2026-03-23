import { describe, expect, it } from "vitest";
import { distance, neighbors } from "../../src/core/hexGrid.js";

describe("hexGrid", () => {
  it("returns six neighbors for any hex", () => {
    const result = neighbors({ q: 4, r: 6 });
    expect(result).toHaveLength(6);
    expect(result).toContainEqual({ q: 5, r: 6 });
    expect(result).toContainEqual({ q: 4, r: 7 });
  });

  it("computes axial distance correctly", () => {
    expect(distance({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(0);
    expect(distance({ q: 0, r: 0 }, { q: 2, r: -1 })).toBe(2);
    expect(distance({ q: 3, r: 2 }, { q: 1, r: 1 })).toBe(3);
  });
});
