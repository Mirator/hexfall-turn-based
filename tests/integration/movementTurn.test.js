import { describe, expect, it } from "vitest";
import { createInitialGameState, getUnitById } from "../../src/core/gameState.js";
import { distance } from "../../src/core/hexGrid.js";
import { getPathTo, getReachable, getReachableAnalysis, moveUnit } from "../../src/systems/movementSystem.js";
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

    const start = { q: unit.q, r: unit.r };
    const result = moveUnit(unit.id, { q: firstReachable.q, r: firstReachable.r }, gameState);
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.path)).toBe(true);
    expect(result.path?.[0]).toMatchObject(start);
    expect(unit.hasActed).toBe(true);
    expect(unit.movementRemaining).toBeLessThanOrEqual(unit.maxMovement);
  });

  it("returns a contiguous movement path for reachable destinations", () => {
    const gameState = createInitialGameState({ seed: 8088 });
    const unit = gameState.units.find((candidate) => candidate.owner === "player");
    expect(unit).toBeTruthy();
    if (!unit) {
      return;
    }

    const destination = getReachable(unit.id, gameState).find((hex) => hex.cost > 0);
    expect(destination).toBeTruthy();
    if (!destination) {
      return;
    }

    const pathResult = getPathTo(unit.id, { q: destination.q, r: destination.r }, gameState);
    expect(pathResult.ok).toBe(true);
    expect(pathResult.cost).toBe(destination.cost);
    expect(pathResult.path?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(pathResult.path?.[0]).toEqual({ q: unit.q, r: unit.r });
    expect(pathResult.path?.[pathResult.path.length - 1]).toEqual({ q: destination.q, r: destination.r });

    const path = pathResult.path ?? [];
    for (let i = 1; i < path.length; i += 1) {
      expect(distance(path[i - 1], path[i])).toBe(1);
    }
  });

  it("builds reusable preview paths for reachable destinations", () => {
    const gameState = createInitialGameState({ seed: 8088 });
    const unit = gameState.units.find((candidate) => candidate.owner === "player");
    expect(unit).toBeTruthy();
    if (!unit) {
      return;
    }

    const analysis = getReachableAnalysis(unit.id, gameState);
    const destination = analysis.hexes.find((hex) => hex.cost > 0);
    expect(destination).toBeTruthy();
    if (!destination) {
      return;
    }

    const destinationKey = `${destination.q},${destination.r}`;
    const previewPath = analysis.pathByHex.get(destinationKey);
    expect(previewPath).toBeTruthy();
    expect(previewPath?.[0]).toEqual({ q: unit.q, r: unit.r });
    expect(previewPath?.[previewPath.length - 1]).toEqual({ q: destination.q, r: destination.r });

    const pathResult = getPathTo(unit.id, { q: destination.q, r: destination.r }, gameState);
    expect(pathResult.ok).toBe(true);
    expect(previewPath).toEqual(pathResult.path);
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
