import { describe, expect, it } from "vitest";

import { COLORS } from "../../src/core/constants.js";
import { getOwnerUnitTint, getUnitTextureKey } from "../../src/core/visualAssets.js";

describe("visualAssets unit sprite helpers", () => {
  it("resolves type-only unit texture keys", () => {
    expect(getUnitTextureKey("warrior")).toBe("unit-warrior");
    expect(getUnitTextureKey("settler")).toBe("unit-settler");
    expect(getUnitTextureKey("spearman")).toBe("unit-spearman");
    expect(getUnitTextureKey("archer")).toBe("unit-archer");
    expect(getUnitTextureKey("unknown")).toBe("unit-warrior");
  });

  it("maps known owners to explicit faction tint colors", () => {
    expect(getOwnerUnitTint("player")).toBe(COLORS.playerUnit);
    expect(getOwnerUnitTint("enemy")).toBe(COLORS.enemyUnit);
    expect(getOwnerUnitTint("purple")).toBe(COLORS.purpleUnit);
  });

  it("uses deterministic tint fallback for unknown owners", () => {
    const first = getOwnerUnitTint("neutral-faction");
    const second = getOwnerUnitTint("neutral-faction");
    const other = getOwnerUnitTint("rogue-faction");

    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThanOrEqual(0xffffff);
    expect(other).toBeGreaterThanOrEqual(0);
    expect(other).toBeLessThanOrEqual(0xffffff);
  });
});
