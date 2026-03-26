import { MAP_HEIGHT, MAP_WIDTH } from "./constants.js";
import { axialKey, distance, neighbors } from "./hexGrid.js";
import { AI_OWNERS } from "./factions.js";
import { createSeededRng, mixSeed, normalizeSeed, shuffleInPlace } from "./random.js";
import { applyTerrainDefinition, generateTerrainTiles } from "./terrainData.js";
import { DEFAULT_UNLOCKED_UNITS, createUnit } from "./unitData.js";
import { createVisibilityState, recomputeVisibility } from "../systems/visibilitySystem.js";

export const DEFAULT_MATCH_SEED = 20260324;
export const DEFAULT_MIN_FACTION_DISTANCE = 7;
export const ENEMY_PERSONALITY_ORDER = ["raider", "expansionist", "guardian"];

const MATCH_LAYOUT_ATTEMPTS = 72;
const OWNER_PERSONALITY_OFFSETS = {
  enemy: 0,
  purple: 1,
};

/**
 * @param {{
 *   seed?: number|string,
 *   minFactionDistance?: number,
 *   enemyPersonality?: import("./types.js").EnemyPersonality,
 *   purplePersonality?: import("./types.js").EnemyPersonality,
 *   aiPersonalities?: Partial<Record<import("./types.js").AiOwner, import("./types.js").EnemyPersonality>>
 * }} [options]
 * @returns {import("./types.js").GameState}
 */
export function createInitialGameState(options = {}) {
  const normalizedSeed = normalizeSeed(options.seed ?? DEFAULT_MATCH_SEED);
  const minFactionDistance = Math.max(3, options.minFactionDistance ?? DEFAULT_MIN_FACTION_DISTANCE);
  const layout = generateMatchLayout(MAP_WIDTH, MAP_HEIGHT, normalizedSeed, minFactionDistance);

  const enemyPersonality = resolveAiPersonality(
    options.aiPersonalities?.enemy ?? options.enemyPersonality,
    normalizedSeed,
    "enemy"
  );
  const purplePersonality = resolveAiPersonality(
    options.aiPersonalities?.purple ?? options.purplePersonality,
    normalizedSeed,
    "purple"
  );

  const enemyAiState = createAiState(enemyPersonality);
  const purpleAiState = createAiState(purplePersonality);

  /** @type {import("./types.js").GameState} */
  const gameState = {
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
      createUnit({
        id: "purple-1",
        owner: "purple",
        type: "settler",
        q: layout.spawns.purpleSettler.q,
        r: layout.spawns.purpleSettler.r,
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
    ai: {
      enemy: enemyAiState,
      purple: purpleAiState,
      byOwner: {
        enemy: enemyAiState,
        purple: purpleAiState,
      },
    },
    economy: {
      player: createEmptyEconomyBucket(),
      enemy: createEmptyEconomyBucket(),
      purple: createEmptyEconomyBucket(),
      researchIncomeThisTurn: 0,
    },
    visibility: createVisibilityState(),
    pendingCityResolution: null,
    nextIds: {
      unit: 1,
      city: 1,
    },
  };

  recomputeVisibility(gameState);
  return gameState;
}

/**
 * @param {import("./types.js").EnemyPersonality|undefined} override
 * @param {number} seed
 * @param {import("./types.js").AiOwner} owner
 * @returns {import("./types.js").EnemyPersonality}
 */
function resolveAiPersonality(override, seed, owner) {
  if (override === "raider" || override === "expansionist" || override === "guardian") {
    return override;
  }
  const offset = OWNER_PERSONALITY_OFFSETS[owner] ?? 0;
  const index = Math.abs(seed + offset) % ENEMY_PERSONALITY_ORDER.length;
  return /** @type {import("./types.js").EnemyPersonality} */ (ENEMY_PERSONALITY_ORDER[index]);
}

/**
 * @param {import("./types.js").EnemyPersonality} personality
 * @returns {import("./types.js").EnemyAiState}
 */
function createAiState(personality) {
  return {
    personality,
    lastGoal: null,
    lastTurnSummary: null,
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
    const nearestFactionDistance = computeNearestFactionDistanceFromSpawns(attemptedLayout.spawns);

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
  if (passableTiles.length < Math.floor(width * height * 0.52)) {
    return null;
  }

  const anchorCandidates = passableTiles.filter((tile) => countPassableNeighbors(tile, tileByKey, width, height) >= 3);
  if (anchorCandidates.length < 3) {
    return null;
  }

  const anchors = selectAnchorTrio(anchorCandidates, tileByKey, width, height, attemptSeed, minFactionDistance);
  if (!anchors) {
    return null;
  }

  const spawns = {
    playerSettler: { ...anchors.player },
    enemySettler: { ...anchors.enemy },
    purpleSettler: { ...anchors.purple },
  };

  const nearestFactionDistance = computeNearestFactionDistanceFromSpawns(spawns);
  if (nearestFactionDistance < minFactionDistance) {
    return null;
  }

  const occupiedKeys = new Set([
    axialKey(spawns.playerSettler),
    axialKey(spawns.enemySettler),
    axialKey(spawns.purpleSettler),
  ]);
  if (
    countFreePassableNeighbors(spawns.playerSettler, tileByKey, width, height, occupiedKeys) < 1 ||
    countFreePassableNeighbors(spawns.enemySettler, tileByKey, width, height, occupiedKeys) < 1 ||
    countFreePassableNeighbors(spawns.purpleSettler, tileByKey, width, height, occupiedKeys) < 1
  ) {
    return null;
  }

  return {
    anchors,
    spawns,
  };
}

function buildFallbackLayout(width, height, seed, minFactionDistance) {
  const fallbackSeed = mixSeed(seed, "fallback-layout");
  const tiles = generateTerrainTiles(width, height, { seed: fallbackSeed });
  const playerSettler = { q: clamp(2, 0, width - 1), r: clamp(2, 0, height - 1) };
  const enemySettler = { q: clamp(width - 3, 0, width - 1), r: clamp(2, 0, height - 1) };
  const purpleSettler = { q: clamp(Math.floor(width / 2), 0, width - 1), r: clamp(height - 3, 0, height - 1) };

  const spawns = {
    playerSettler,
    enemySettler,
    purpleSettler,
  };

  applySafeSpawnTerrain(tiles, width, height, spawns);

  return {
    seed: fallbackSeed,
    tiles,
    spawns,
    anchors: {
      player: playerSettler,
      enemy: enemySettler,
      purple: purpleSettler,
    },
    attempts: MATCH_LAYOUT_ATTEMPTS,
    fallbackUsed: true,
    nearestFactionDistance: Math.max(minFactionDistance, computeNearestFactionDistanceFromSpawns(spawns)),
  };
}

function selectAnchorTrio(candidates, tileByKey, width, height, seed, minFactionDistance) {
  const rng = createSeededRng(mixSeed(seed, "anchor-trio"));
  const shuffled = shuffleInPlace([...candidates], rng);
  let bestTrio = null;
  let bestScore = -Infinity;

  const sampleCount = Math.max(240, Math.min(1200, shuffled.length * 12));
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const player = shuffled[Math.floor(rng() * shuffled.length)];
    const enemy = shuffled[Math.floor(rng() * shuffled.length)];
    const purple = shuffled[Math.floor(rng() * shuffled.length)];
    if (!player || !enemy || !purple) {
      continue;
    }
    if (
      (player.q === enemy.q && player.r === enemy.r) ||
      (player.q === purple.q && player.r === purple.r) ||
      (enemy.q === purple.q && enemy.r === purple.r)
    ) {
      continue;
    }

    if (!isAnchorTrioSeparated(player, enemy, purple, minFactionDistance)) {
      continue;
    }

    const score = scoreAnchorTrio(player, enemy, purple, tileByKey, width, height, rng);
    if (score > bestScore) {
      bestScore = score;
      bestTrio = {
        player: { q: player.q, r: player.r },
        enemy: { q: enemy.q, r: enemy.r },
        purple: { q: purple.q, r: purple.r },
      };
    }
  }

  if (bestTrio) {
    return bestTrio;
  }

  const fallbackSlice = shuffled.slice(0, Math.min(48, shuffled.length));
  for (let i = 0; i < fallbackSlice.length; i += 1) {
    const player = fallbackSlice[i];
    for (let j = 0; j < fallbackSlice.length; j += 1) {
      if (j === i) {
        continue;
      }
      const enemy = fallbackSlice[j];
      for (let k = 0; k < fallbackSlice.length; k += 1) {
        if (k === i || k === j) {
          continue;
        }
        const purple = fallbackSlice[k];
        if (!isAnchorTrioSeparated(player, enemy, purple, minFactionDistance)) {
          continue;
        }
        return {
          player: { q: player.q, r: player.r },
          enemy: { q: enemy.q, r: enemy.r },
          purple: { q: purple.q, r: purple.r },
        };
      }
    }
  }

  return null;
}

function isAnchorTrioSeparated(player, enemy, purple, minFactionDistance) {
  return (
    distance(player, enemy) >= minFactionDistance &&
    distance(player, purple) >= minFactionDistance &&
    distance(enemy, purple) >= minFactionDistance
  );
}

function scoreAnchorTrio(player, enemy, purple, tileByKey, width, height, rng) {
  const separationScore = distance(player, enemy) + distance(player, purple) + distance(enemy, purple);
  const neighborScore =
    countPassableNeighbors(player, tileByKey, width, height) +
    countPassableNeighbors(enemy, tileByKey, width, height) +
    countPassableNeighbors(purple, tileByKey, width, height);
  return separationScore * 9 + neighborScore + rng();
}

function applySafeSpawnTerrain(tiles, width, height, spawns) {
  const tileByKey = new Map(tiles.map((tile) => [axialKey(tile), tile]));
  const safetyHexes = [
    spawns.playerSettler,
    spawns.enemySettler,
    spawns.purpleSettler,
    ...neighbors(spawns.playerSettler),
    ...neighbors(spawns.enemySettler),
    ...neighbors(spawns.purpleSettler),
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

function computeNearestFactionDistanceFromSpawns(spawns) {
  const points = [spawns.playerSettler, spawns.enemySettler, spawns.purpleSettler];
  let minDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      minDistance = Math.min(minDistance, distance(points[i], points[j]));
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
 * @param {import("./types.js").Owner} owner
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

/**
 * @param {import("./types.js").AiOwner} owner
 * @returns {import("./types.js").AiOwner}
 */
export function getNextAiOwner(owner) {
  const index = AI_OWNERS.indexOf(owner);
  if (index === -1) {
    return AI_OWNERS[0];
  }
  return AI_OWNERS[(index + 1) % AI_OWNERS.length];
}

