import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../../src/core/gameState.js";
import { getReachable, moveUnit } from "../../src/systems/movementSystem.js";
import { endTurn } from "../../src/systems/turnSystem.js";

describe("movement and turn systems", () => {
  it("returns reachable tiles within movement points", () => {
    const gameState = createInitialGameState();
    const unit = gameState.units[0];
    const reachable = getReachable(unit.id, gameState);
    expect(reachable).toHaveLength(18);
  });

  it("consumes movement points on successful movement", () => {
    const gameState = createInitialGameState();
    const unit = gameState.units[0];
    const result = moveUnit(unit.id, { q: unit.q + 1, r: unit.r }, gameState);

    expect(result.ok).toBe(true);
    expect(unit.q).toBe(3);
    expect(unit.r).toBe(2);
    expect(unit.movementRemaining).toBe(1);
  });

  it("rejects invalid movement beyond available range", () => {
    const gameState = createInitialGameState();
    const unit = gameState.units[0];
    const result = moveUnit(unit.id, { q: unit.q + 3, r: unit.r }, gameState);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("out-of-range");
    expect(unit.q).toBe(2);
    expect(unit.r).toBe(2);
    expect(unit.movementRemaining).toBe(2);
  });

  it("endTurn increments turn and restores movement points", () => {
    const gameState = createInitialGameState();
    const unit = gameState.units[0];

    moveUnit(unit.id, { q: unit.q + 1, r: unit.r }, gameState);
    gameState.selectedUnitId = unit.id;
    endTurn(gameState);

    expect(gameState.turnState.turn).toBe(2);
    expect(gameState.selectedUnitId).toBeNull();
    expect(unit.movementRemaining).toBe(unit.maxMovement);
  });
});
