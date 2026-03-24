import { describe, expect, it } from "vitest";
import { createInitialGameState, getTileAt } from "../../src/core/gameState.js";
import { getReachable } from "../../src/systems/movementSystem.js";

describe("terrain movement costs and obstacles", () => {
  it("treats mountain/water as blocked and applies movement costs", () => {
    const gameState = createInitialGameState();
    const playerUnit = gameState.units.find((unit) => unit.owner === "player" && unit.type === "warrior");
    expect(playerUnit).toBeTruthy();
    if (!playerUnit) {
      return;
    }

    const forestTile = getTileAt(gameState.map, playerUnit.q + 1, playerUnit.r);
    const waterTile = getTileAt(gameState.map, playerUnit.q, playerUnit.r + 1);
    const mountainTile = getTileAt(gameState.map, playerUnit.q + 1, playerUnit.r - 1);
    expect(forestTile && waterTile && mountainTile).toBeTruthy();
    if (!forestTile || !waterTile || !mountainTile) {
      return;
    }

    forestTile.terrainType = "forest";
    forestTile.moveCost = 2;
    forestTile.blocksMovement = false;

    waterTile.terrainType = "water";
    waterTile.moveCost = 99;
    waterTile.blocksMovement = true;

    mountainTile.terrainType = "mountain";
    mountainTile.moveCost = 99;
    mountainTile.blocksMovement = true;

    playerUnit.movementRemaining = 2;
    const reachable = getReachable(playerUnit.id, gameState);
    const byKey = new Map(reachable.map((hex) => [`${hex.q},${hex.r}`, hex]));

    expect(byKey.get(`${forestTile.q},${forestTile.r}`)?.cost).toBe(2);
    expect(byKey.has(`${waterTile.q},${waterTile.r}`)).toBe(false);
    expect(byKey.has(`${mountainTile.q},${mountainTile.r}`)).toBe(false);
  });
});
