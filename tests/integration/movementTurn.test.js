import { describe, expect, it } from "vitest";
import { createInitialGameState, getUnitById } from "../../src/core/gameState.js";
import { getReachable, moveUnit } from "../../src/systems/movementSystem.js";
import { beginEnemyTurn, beginPlayerTurn } from "../../src/systems/turnSystem.js";

describe("movement and turn systems", () => {
  it("returns reachable tiles using movement budget", () => {
    const gameState = createInitialGameState();
    const unit = gameState.units.find((candidate) => candidate.owner === "player");
    expect(unit).toBeTruthy();
    if (!unit) {
      return;
    }

    const reachable = getReachable(unit.id, gameState);
    expect(reachable.length).toBeGreaterThan(0);
    expect(reachable.every((hex) => hex.cost <= unit.movementRemaining)).toBe(true);
  });

  it("consumes movement points and marks unit acted on movement", () => {
    const gameState = createInitialGameState();
    const unit = gameState.units.find((candidate) => candidate.owner === "player");
    expect(unit).toBeTruthy();
    if (!unit) {
      return;
    }

    const firstReachable = getReachable(unit.id, gameState)[0];
    expect(firstReachable).toBeTruthy();
    if (!firstReachable) {
      return;
    }

    const result = moveUnit(unit.id, { q: firstReachable.q, r: firstReachable.r }, gameState);
    expect(result.ok).toBe(true);
    expect(unit.hasActed).toBe(true);
    expect(unit.movementRemaining).toBeLessThanOrEqual(unit.maxMovement);
  });

  it("beginPlayerTurn resets movement and acted flags for player units", () => {
    const gameState = createInitialGameState();
    const playerUnit = gameState.units.find((unit) => unit.owner === "player");
    expect(playerUnit).toBeTruthy();
    if (!playerUnit) {
      return;
    }

    playerUnit.hasActed = true;
    playerUnit.movementRemaining = 0;
    beginEnemyTurn(gameState);
    beginPlayerTurn(gameState);

    const refreshed = getUnitById(gameState, playerUnit.id);
    expect(refreshed).toBeTruthy();
    if (!refreshed) {
      return;
    }

    expect(refreshed.hasActed).toBe(false);
    expect(refreshed.movementRemaining).toBe(refreshed.maxMovement);
    expect(gameState.turnState.turn).toBe(2);
  });
});
