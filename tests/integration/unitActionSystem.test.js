import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../../src/core/gameState.js";
import { canSkipUnit, skipUnit } from "../../src/systems/unitActionSystem.js";

describe("unitActionSystem", () => {
  it("allows skipping a ready player unit and consumes its action", () => {
    const gameState = createInitialGameState({ seed: 211 });
    const settler = gameState.units.find((unit) => unit.owner === "player" && unit.type === "settler");
    expect(settler).toBeTruthy();
    if (!settler) {
      return;
    }

    const canSkip = canSkipUnit(settler.id, gameState);
    expect(canSkip.ok).toBe(true);

    const result = skipUnit(settler.id, gameState);
    expect(result.ok).toBe(true);
    expect(settler.hasActed).toBe(true);
    expect(settler.movementRemaining).toBe(0);
  });

  it("blocks skipping enemy-owned units", () => {
    const gameState = createInitialGameState({ seed: 212 });
    const enemySettler = gameState.units.find((unit) => unit.owner === "enemy" && unit.type === "settler");
    expect(enemySettler).toBeTruthy();
    if (!enemySettler) {
      return;
    }

    const canSkip = canSkipUnit(enemySettler.id, gameState);
    expect(canSkip.ok).toBe(false);
    expect(canSkip.reason).toBe("unit-not-player-owned");
  });
});
