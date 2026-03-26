import { describe, expect, it } from "vitest";
import { createInitialGameState, DEFAULT_MIN_FACTION_DISTANCE } from "../../src/core/gameState.js";
import { distance, neighbors } from "../../src/core/hexGrid.js";

describe("seeded match generation", () => {
  it("starts each faction with exactly one settler on a 16x16 map", () => {
    const gameState = createInitialGameState({ seed: 321 });
    const playerUnits = gameState.units.filter((unit) => unit.owner === "player");
    const enemyUnits = gameState.units.filter((unit) => unit.owner === "enemy");
    const purpleUnits = gameState.units.filter((unit) => unit.owner === "purple");

    expect(gameState.map.width).toBe(16);
    expect(gameState.map.height).toBe(16);
    expect(playerUnits).toHaveLength(1);
    expect(enemyUnits).toHaveLength(1);
    expect(purpleUnits).toHaveLength(1);
    expect(playerUnits[0]?.type).toBe("settler");
    expect(enemyUnits[0]?.type).toBe("settler");
    expect(purpleUnits[0]?.type).toBe("settler");
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

  it("enforces pairwise faction separation floor for all three factions", () => {
    const minFactionDistance = 7;
    const gameState = createInitialGameState({ seed: 555777, minFactionDistance });
    const nearestDistance = getNearestFactionDistance(gameState);

    expect(nearestDistance).toBeGreaterThanOrEqual(minFactionDistance);
    expect(gameState.map.spawnMetadata.minFactionDistance).toBe(minFactionDistance);
    expect(gameState.map.spawnMetadata.nearestFactionDistance).toBeGreaterThanOrEqual(minFactionDistance);
    expect(gameState.map.spawnMetadata.nearestFactionDistance).toBe(nearestDistance);
    expect(gameState.map.spawnMetadata.anchors.purple).toBeTruthy();
    expect(gameState.map.spawnMetadata.spawns.purpleSettler).toBeTruthy();
  });

  it("normalizes safe terrain around each faction spawn cluster", () => {
    const gameState = createInitialGameState({ seed: 300913 });
    const spawnHexes = [
      gameState.map.spawnMetadata.spawns.playerSettler,
      gameState.map.spawnMetadata.spawns.enemySettler,
      gameState.map.spawnMetadata.spawns.purpleSettler,
    ];

    for (const spawn of spawnHexes) {
      const cluster = [spawn, ...neighbors(spawn)];
      for (const hex of cluster) {
        if (hex.q < 0 || hex.q >= gameState.map.width || hex.r < 0 || hex.r >= gameState.map.height) {
          continue;
        }
        const tile = gameState.map.tiles.find((candidate) => candidate.q === hex.q && candidate.r === hex.r);
        expect(tile).toBeTruthy();
        expect(tile?.terrainType).toBe("plains");
        expect(tile?.blocksMovement).toBe(false);
      }
    }
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

function getNearestFactionDistance(gameState) {
  const points = [
    gameState.units.find((unit) => unit.owner === "player"),
    gameState.units.find((unit) => unit.owner === "enemy"),
    gameState.units.find((unit) => unit.owner === "purple"),
  ];
  if (points.some((point) => !point)) {
    return 0;
  }

  let minDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      minDistance = Math.min(minDistance, distance(points[i], points[j]));
    }
  }
  return minDistance;
}
