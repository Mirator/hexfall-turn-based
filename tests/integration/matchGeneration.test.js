import { describe, expect, it } from "vitest";
import { createInitialGameState, DEFAULT_MIN_FACTION_DISTANCE } from "../../src/core/gameState.js";
import { distance } from "../../src/core/hexGrid.js";

describe("seeded match generation", () => {
  it("starts each faction with exactly one settler", () => {
    const gameState = createInitialGameState({ seed: 321 });
    const playerUnits = gameState.units.filter((unit) => unit.owner === "player");
    const enemyUnits = gameState.units.filter((unit) => unit.owner === "enemy");

    expect(playerUnits).toHaveLength(1);
    expect(enemyUnits).toHaveLength(1);
    expect(playerUnits[0]?.type).toBe("settler");
    expect(enemyUnits[0]?.type).toBe("settler");
  });

  it("is deterministic for the same seed", () => {
    const seed = 987654321;
    const stateA = createInitialGameState({ seed, minFactionDistance: DEFAULT_MIN_FACTION_DISTANCE });
    const stateB = createInitialGameState({ seed, minFactionDistance: DEFAULT_MIN_FACTION_DISTANCE });

    expect(stateA.map.seed).toBe(stateB.map.seed);
    expect(getTerrainSignature(stateA)).toBe(getTerrainSignature(stateB));
    expect(getSpawnSignature(stateA)).toBe(getSpawnSignature(stateB));
  });

  it("produces a different map or spawn layout for different seeds", () => {
    const stateA = createInitialGameState({ seed: 1001, minFactionDistance: DEFAULT_MIN_FACTION_DISTANCE });
    const stateB = createInitialGameState({ seed: 2002, minFactionDistance: DEFAULT_MIN_FACTION_DISTANCE });

    const sameTerrain = getTerrainSignature(stateA) === getTerrainSignature(stateB);
    const sameSpawns = getSpawnSignature(stateA) === getSpawnSignature(stateB);
    expect(sameTerrain && sameSpawns).toBe(false);
  });

  it("enforces faction separation floor", () => {
    const minFactionDistance = 7;
    const gameState = createInitialGameState({ seed: 555777, minFactionDistance });
    const playerUnits = gameState.units.filter((unit) => unit.owner === "player");
    const enemyUnits = gameState.units.filter((unit) => unit.owner === "enemy");
    const nearestDistance = getNearestFactionDistance(playerUnits, enemyUnits);

    expect(nearestDistance).toBeGreaterThanOrEqual(minFactionDistance);
    expect(gameState.map.spawnMetadata.minFactionDistance).toBe(minFactionDistance);
    expect(gameState.map.spawnMetadata.nearestFactionDistance).toBeGreaterThanOrEqual(minFactionDistance);
  });
});

function getTerrainSignature(gameState) {
  return gameState.map.tiles.map((tile) => `${tile.q},${tile.r}:${tile.terrainType}`).join("|");
}

function getSpawnSignature(gameState) {
  return gameState.units
    .map((unit) => `${unit.owner}:${unit.type}:${unit.q},${unit.r}`)
    .sort()
    .join("|");
}

function getNearestFactionDistance(playerUnits, enemyUnits) {
  let minDistance = Number.POSITIVE_INFINITY;
  for (const playerUnit of playerUnits) {
    for (const enemyUnit of enemyUnits) {
      minDistance = Math.min(minDistance, distance(playerUnit, enemyUnit));
    }
  }
  return minDistance;
}
