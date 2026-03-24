import { MAP_HEIGHT, MAP_WIDTH } from "./constants.js";
import { axialKey, distance, neighbors } from "./hexGrid.js";
import { createSeededRng, mixSeed, normalizeSeed, shuffleInPlace } from "./random.js";
import { applyTerrainDefinition, generateTerrainTiles } from "./terrainData.js";
import { DEFAULT_UNLOCKED_UNITS, createUnit } from "./unitData.js";

export const DEFAULT_MATCH_SEED = 20260324;
export const DEFAULT_MIN_FACTION_DISTANCE = 7;

const MATCH_LAYOUT_ATTEMPTS = 72;

/**
 * @param {{ seed?: number|string, minFactionDistance?: number }} [options]
 * @returns {import("./types.js").GameState}
 */
export function createInitialGameState(options = {}) {
  const normalizedSeed = normalizeSeed(options.seed ?? DEFAULT_MATCH_SEED);
  const minFactionDistance = Math.max(3, options.minFactionDistance ?? DEFAULT_MIN_FACTION_DISTANCE);
  const layout = generateMatchLayout(MAP_WIDTH, MAP_HEIGHT, normalizedSeed, minFactionDistance);

  return {
    turnState: {
      turn: 1,
      phase: "player",
    },
    map: {
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      seed: layout.seed,
      tiles: layout.tiles,
      spawnMetadata: {
        attempts: layout.attempts,
        fallbackUsed: layout.fallbackUsed,
        minFactionDistance,
        nearestFactionDistance: layout.nearestFactionDistance,
        anchors: layout.anchors,
        spawns: layout.spawns,
      },
    },
    units: [
      createUnit({
        id: "player-1",
        owner: "player",
        type: "settler",
        q: layout.spawns.playerSettler.q,
        r: layout.spawns.playerSettler.r,
      }),
      createUnit({
        id: "enemy-1",
        owner: "enemy",
        type: "settler",
        q: layout.spawns.enemySettler.q,
        r: layout.spawns.enemySettler.r,
      }),
    ],
    cities: [],
    selectedUnitId: null,
    selectedCityId: null,
    research: {
      activeTechId: null,
      progress: 0,
      completedTechIds: [],
    },
    unlocks: {
      units: [...DEFAULT_UNLOCKED_UNITS],
    },
    match: {
      status: "ongoing",
      reason: null,
    },
    economy: {
      player: createEmptyEconomyBucket(),
      enemy: createEmptyEconomyBucket(),
      researchIncomeThisTurn: 0,
    },
    pendingCityResolution: null,
    nextIds: {
      unit: 1,
      city: 1,
    },
  };
}

function createEmptyEconomyBucket() {
  return {
    foodStock: 0,
    productionStock: 0,
    scienceStock: 0,
    lastTurnIncome: {
      food: 0,
      production: 0,
      science: 0,
    },
  };
}

function generateMatchLayout(width, height, seed, minFactionDistance) {
  for (let attempt = 0; attempt < MATCH_LAYOUT_ATTEMPTS; attempt += 1) {
    const attemptSeed = mixSeed(seed, `layout-${attempt}`);
    const tiles = generateTerrainTiles(width, height, { seed: attemptSeed });
    const attemptedLayout = buildAttemptedLayout(tiles, width, height, attemptSeed, minFactionDistance);
    if (!attemptedLayout) {
      continue;
    }

    applySafeSpawnTerrain(tiles, width, height, attemptedLayout.spawns);
    const nearestFactionDistance = computeNearestFactionDistance(
      [attemptedLayout.spawns.playerSettler],
      [attemptedLayout.spawns.enemySettler]
    );

    if (nearestFactionDistance >= minFactionDistance) {
      return {
        seed: attemptSeed,
        tiles,
        spawns: attemptedLayout.spawns,
        anchors: attemptedLayout.anchors,
        attempts: attempt + 1,
        fallbackUsed: false,
        nearestFactionDistance,
      };
    }
  }

  return buildFallbackLayout(width, height, seed, minFactionDistance);
}

function buildAttemptedLayout(tiles, width, height, attemptSeed, minFactionDistance) {
  const tileByKey = new Map(tiles.map((tile) => [axialKey(tile), tile]));
  const passableTiles = tiles.filter((tile) => !tile.blocksMovement);
  if (passableTiles.length < Math.floor(width * height * 0.48)) {
    return null;
  }

  const anchorCandidates = passableTiles.filter((tile) => countPassableNeighbors(tile, tileByKey, width, height) >= 3);
  if (anchorCandidates.length < 2) {
    return null;
  }

  const anchors = selectAnchorPair(anchorCandidates, tileByKey, width, height, attemptSeed, minFactionDistance);
  if (!anchors) {
    return null;
  }

  const playerSettler = { ...anchors.player };
  const enemySettler = { ...anchors.enemy };

  const nearestFactionDistance = computeNearestFactionDistance([playerSettler], [enemySettler]);
  if (nearestFactionDistance < minFactionDistance) {
    return null;
  }

  const allOccupied = new Set([axialKey(playerSettler), axialKey(enemySettler)]);
  const playerSafeNeighbors = countFreePassableNeighbors(playerSettler, tileByKey, width, height, allOccupied);
  const enemySafeNeighbors = countFreePassableNeighbors(enemySettler, tileByKey, width, height, allOccupied);
  if (playerSafeNeighbors < 1 || enemySafeNeighbors < 1) {
    return null;
  }

  return {
    anchors,
    spawns: {
      playerSettler,
      enemySettler,
    },
  };
}

function buildFallbackLayout(width, height, seed, minFactionDistance) {
  const fallbackSeed = mixSeed(seed, "fallback-layout");
  const tiles = generateTerrainTiles(width, height, { seed: fallbackSeed });
  const playerSettler = { q: clamp(2, 0, width - 1), r: clamp(2, 0, height - 1) };
  const enemySettler = { q: clamp(width - 3, 0, width - 1), r: clamp(height - 3, 0, height - 1) };
  const spawns = { playerSettler, enemySettler };

  applySafeSpawnTerrain(tiles, width, height, spawns);

  return {
    seed: fallbackSeed,
    tiles,
    spawns,
    anchors: {
      player: playerSettler,
      enemy: enemySettler,
    },
    attempts: MATCH_LAYOUT_ATTEMPTS,
    fallbackUsed: true,
    nearestFactionDistance: Math.max(minFactionDistance, computeNearestFactionDistance([playerSettler], [enemySettler])),
  };
}

function selectAnchorPair(candidates, tileByKey, width, height, seed, minFactionDistance) {
  const rng = createSeededRng(mixSeed(seed, "anchor-pair"));
  const shuffled = shuffleInPlace([...candidates], rng);
  let bestPair = null;
  let bestScore = -Infinity;

  for (const player of shuffled) {
    const playerNeighborScore = countPassableNeighbors(player, tileByKey, width, height);
    for (const enemy of shuffled) {
      if (player.q === enemy.q && player.r === enemy.r) {
        continue;
      }

      const separation = distance(player, enemy);
      if (separation < minFactionDistance) {
        continue;
      }

      const enemyNeighborScore = countPassableNeighbors(enemy, tileByKey, width, height);
      const score = separation * 10 + playerNeighborScore + enemyNeighborScore + rng();
      if (score > bestScore) {
        bestScore = score;
        bestPair = {
          player: { q: player.q, r: player.r },
          enemy: { q: enemy.q, r: enemy.r },
        };
      }
    }
  }

  return bestPair;
}

function applySafeSpawnTerrain(tiles, width, height, spawns) {
  const tileByKey = new Map(tiles.map((tile) => [axialKey(tile), tile]));
  const safetyHexes = [
    spawns.playerSettler,
    spawns.enemySettler,
    ...neighbors(spawns.playerSettler),
    ...neighbors(spawns.enemySettler),
  ];

  for (const hex of safetyHexes) {
    if (!isHexInsideBounds(hex, width, height)) {
      continue;
    }
    const tile = tileByKey.get(axialKey(hex));
    if (!tile) {
      continue;
    }
    applyTerrainDefinition(tile, "plains");
  }
}

function countPassableNeighbors(hex, tileByKey, width, height) {
  return neighbors(hex).filter((neighbor) => isHexPassable(neighbor, tileByKey, width, height)).length;
}

function countFreePassableNeighbors(hex, tileByKey, width, height, occupiedKeys) {
  return neighbors(hex).filter((neighbor) => {
    if (!isHexPassable(neighbor, tileByKey, width, height)) {
      return false;
    }
    return !occupiedKeys.has(axialKey(neighbor));
  }).length;
}

function isHexPassable(hex, tileByKey, width, height) {
  if (!isHexInsideBounds(hex, width, height)) {
    return false;
  }
  const tile = tileByKey.get(axialKey(hex));
  return !!tile && !tile.blocksMovement;
}

function isHexInsideBounds(hex, width, height) {
  return hex.q >= 0 && hex.q < width && hex.r >= 0 && hex.r < height;
}

function computeNearestFactionDistance(playerHexes, enemyHexes) {
  let minDistance = Number.POSITIVE_INFINITY;
  for (const playerHex of playerHexes) {
    for (const enemyHex of enemyHexes) {
      minDistance = Math.min(minDistance, distance(playerHex, enemyHex));
    }
  }
  if (!Number.isFinite(minDistance)) {
    return 0;
  }
  return minDistance;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * @param {{ width: number, height: number }} map
 * @param {number} q
 * @param {number} r
 * @returns {boolean}
 */
export function isInsideMap(map, q, r) {
  return q >= 0 && q < map.width && r >= 0 && r < map.height;
}

/**
 * @param {import("./types.js").GameState} gameState
 * @param {string|null} unitId
 * @returns {import("./types.js").Unit|null}
 */
export function getUnitById(gameState, unitId) {
  if (!unitId) {
    return null;
  }
  return gameState.units.find((unit) => unit.id === unitId) ?? null;
}

/**
 * @param {import("./types.js").GameState} gameState
 * @param {number} q
 * @param {number} r
 * @returns {import("./types.js").Unit|null}
 */
export function getUnitAt(gameState, q, r) {
  return gameState.units.find((unit) => unit.q === q && unit.r === r) ?? null;
}

/**
 * @param {import("./types.js").GameState} gameState
 * @param {string|null} cityId
 * @returns {import("./types.js").City|null}
 */
export function getCityById(gameState, cityId) {
  if (!cityId) {
    return null;
  }
  return gameState.cities.find((city) => city.id === cityId) ?? null;
}

/**
 * @param {import("./types.js").GameState} gameState
 * @param {number} q
 * @param {number} r
 * @returns {import("./types.js").City|null}
 */
export function getCityAt(gameState, q, r) {
  return gameState.cities.find((city) => city.q === q && city.r === r) ?? null;
}

/**
 * @param {{ tiles: import("./types.js").Tile[] }} map
 * @param {number} q
 * @param {number} r
 * @returns {import("./types.js").Tile|null}
 */
export function getTileAt(map, q, r) {
  return map.tiles.find((tile) => tile.q === q && tile.r === r) ?? null;
}

/**
 * @param {import("./types.js").GameState} gameState
 * @param {"unit"|"city"} kind
 * @param {"player"|"enemy"} owner
 * @returns {string}
 */
export function allocateEntityId(gameState, kind, owner) {
  if (kind === "unit") {
    gameState.nextIds.unit += 1;
    return `${owner}-${gameState.nextIds.unit}`;
  }

  gameState.nextIds.city += 1;
  return `${owner}-city-${gameState.nextIds.city}`;
}

/**
 * @param {import("./types.js").GameState} gameState
 * @param {string} unitId
 * @returns {boolean}
 */
export function removeUnitById(gameState, unitId) {
  const beforeCount = gameState.units.length;
  gameState.units = gameState.units.filter((unit) => unit.id !== unitId);
  if (gameState.selectedUnitId === unitId) {
    gameState.selectedUnitId = null;
  }
  return gameState.units.length < beforeCount;
}

/**
 * @param {import("./types.js").GameState} gameState
 * @returns {import("./types.js").GameState}
 */
export function cloneGameState(gameState) {
  return structuredClone(gameState);
}
