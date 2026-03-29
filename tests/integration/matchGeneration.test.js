import { describe, expect, it } from "vitest";
import { createInitialGameState, DEFAULT_MIN_FACTION_DISTANCE } from "../../src/core/gameState.js";
import { distance, neighbors } from "../../src/core/hexGrid.js";

describe("seeded match generation", () => {
  it("supports fixed map presets (16, 20, 24) and preserves square dimensions", () => {
    for (const mapSize of [16, 20, 24]) {
      const gameState = createInitialGameState({ seed: 321 + mapSize, mapWidth: mapSize, mapHeight: mapSize });
      expect(gameState.map.width).toBe(mapSize);
      expect(gameState.map.height).toBe(mapSize);
      expect(gameState.matchConfig.mapWidth).toBe(mapSize);
      expect(gameState.matchConfig.mapHeight).toBe(mapSize);
      expect(gameState.units.filter((unit) => unit.owner === "player" && unit.type === "settler")).toHaveLength(1);
    }
  });

  it(
    "creates exactly one settler per configured faction for AI count 1..6",
    () => {
      for (let aiFactionCount = 1; aiFactionCount <= 6; aiFactionCount += 1) {
        const gameState = createInitialGameState({ seed: 9000 + aiFactionCount, aiFactionCount, mapWidth: 24, mapHeight: 24 });
        const expectedOwners = gameState.factions.allOwners;
        expect(gameState.factions.aiOwners).toHaveLength(aiFactionCount);
        expect(gameState.units).toHaveLength(expectedOwners.length);
        for (const owner of expectedOwners) {
          const ownerSettlers = gameState.units.filter((unit) => unit.owner === owner && unit.type === "settler");
          expect(ownerSettlers).toHaveLength(1);
        }
      }
    },
    20000
  );

  it("is deterministic for the same seed", () => {
    const seed = 987654321;
    const options = {
      seed,
      mapWidth: 24,
      mapHeight: 24,
      aiFactionCount: 6,
      minFactionDistance: DEFAULT_MIN_FACTION_DISTANCE,
    };
    const stateA = createInitialGameState(options);
    const stateB = createInitialGameState(options);

    expect(stateA.map.seed).toBe(stateB.map.seed);
    expect(getTerrainSignature(stateA)).toBe(getTerrainSignature(stateB));
    expect(getSpawnSignature(stateA)).toBe(getSpawnSignature(stateB));
    expect(stateA.factions.aiOwners).toEqual(stateB.factions.aiOwners);
  });

  it("produces a different map or spawn layout for different seeds", () => {
    const stateA = createInitialGameState({ seed: 1001, minFactionDistance: DEFAULT_MIN_FACTION_DISTANCE });
    const stateB = createInitialGameState({ seed: 2002, minFactionDistance: DEFAULT_MIN_FACTION_DISTANCE });

    const sameTerrain = getTerrainSignature(stateA) === getTerrainSignature(stateB);
    const sameSpawns = getSpawnSignature(stateA) === getSpawnSignature(stateB);
    expect(sameTerrain && sameSpawns).toBe(false);
  });

  it("enforces pairwise faction separation floor for all configured factions", () => {
    const minFactionDistance = 7;
    const gameState = createInitialGameState({
      seed: 555777,
      mapWidth: 24,
      mapHeight: 24,
      aiFactionCount: 6,
      minFactionDistance,
    });
    const nearestDistance = getNearestFactionDistance(gameState);

    expect(nearestDistance).toBeGreaterThanOrEqual(minFactionDistance);
    expect(gameState.map.spawnMetadata.minFactionDistance).toBe(minFactionDistance);
    expect(gameState.map.spawnMetadata.nearestFactionDistance).toBeGreaterThanOrEqual(minFactionDistance);
    expect(gameState.map.spawnMetadata.nearestFactionDistance).toBe(nearestDistance);
    expect(gameState.map.spawnMetadata.anchorsByOwner).toBeTruthy();
    expect(gameState.map.spawnMetadata.spawnByOwner).toBeTruthy();
    for (const owner of gameState.factions.allOwners) {
      expect(gameState.map.spawnMetadata.anchorsByOwner[owner]).toBeTruthy();
      expect(gameState.map.spawnMetadata.spawnByOwner[owner]).toBeTruthy();
    }
  });

  it("normalizes safe terrain around each faction spawn cluster", () => {
    const gameState = createInitialGameState({ seed: 300913, aiFactionCount: 6, mapWidth: 24, mapHeight: 24 });
    const spawnHexes = gameState.factions.allOwners
      .map((owner) => gameState.map.spawnMetadata.spawnByOwner?.[owner] ?? null)
      .filter(Boolean);

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
  const points = gameState.factions.allOwners.map((owner) => gameState.units.find((unit) => unit.owner === owner));
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
