import { buildAiOwners, createFactionMetadata, getAiOwners } from "./factions.js";
import { axialKey, distance, neighbors } from "./hexGrid.js";
import { resolveMatchConfig } from "./matchConfig.js";
import { createSeededRng, mixSeed, normalizeSeed, shuffleInPlace } from "./random.js";
import { applyTerrainDefinition, generateTerrainTiles } from "./terrainData.js";
import { DEFAULT_UNLOCKED_UNITS, createUnit } from "./unitData.js";
import { createVisibilityState, recomputeVisibility } from "../systems/visibilitySystem.js";

export const DEFAULT_MATCH_SEED = 20260324;
export const DEFAULT_MIN_FACTION_DISTANCE = 7;
export const ENEMY_PERSONALITY_ORDER = ["raider", "expansionist", "guardian"];

const MATCH_LAYOUT_ATTEMPTS = 72;

/**
 * @param {{
 *   seed?: number|string,
 *   minFactionDistance?: number,
 *   mapWidth?: 16|20|24|number,
 *   mapHeight?: 16|20|24|number,
 *   aiFactionCount?: number,
 *   matchConfig?: Partial<import("./matchConfig.js").MatchConfig>,
 *   enemyPersonality?: import("./types.js").EnemyPersonality,
 *   purplePersonality?: import("./types.js").EnemyPersonality,
 *   aiPersonalities?: Partial<Record<import("./types.js").AiOwner, import("./types.js").EnemyPersonality>>
 * }} [options]
 * @returns {import("./types.js").GameState}
 */
export function createInitialGameState(options = {}) {
  const normalizedSeed = normalizeSeed(options.seed ?? DEFAULT_MATCH_SEED);
  const minFactionDistance = Math.max(3, options.minFactionDistance ?? DEFAULT_MIN_FACTION_DISTANCE);
  const matchConfig = resolveInitialMatchConfig(options);
  const aiOwners = createFactionMetadataFromConfig(matchConfig).aiOwners;
  const factions = createFactionMetadata(aiOwners);
  const layout = generateMatchLayout(
    matchConfig.mapWidth,
    matchConfig.mapHeight,
    normalizedSeed,
    minFactionDistance,
    factions.allOwners
  );

  /** @type {Record<import("./types.js").AiOwner, import("./types.js").EnemyAiState>} */
  const aiByOwner = {};
  for (const owner of factions.aiOwners) {
    const personality = resolveAiPersonality(
      options.aiPersonalities?.[owner] ?? getLegacyPersonalityOverride(options, owner),
      normalizedSeed,
      owner
    );
    aiByOwner[owner] = createAiState(personality);
  }

  const units = factions.allOwners.map((owner) =>
    createUnit({
      id: `${owner}-1`,
      owner,
      type: "settler",
      q: layout.spawnsByOwner[owner].q,
      r: layout.spawnsByOwner[owner].r,
    })
  );

  /** @type {import("./types.js").GameState} */
  const gameState = {
    matchConfig,
    factions,
    turnState: {
      turn: 1,
      phase: "player",
    },
    map: {
      width: matchConfig.mapWidth,
      height: matchConfig.mapHeight,
      seed: layout.seed,
      tiles: layout.tiles,
      spawnMetadata: {
        attempts: layout.attempts,
        fallbackUsed: layout.fallbackUsed,
        minFactionDistance,
        nearestFactionDistance: layout.nearestFactionDistance,
        anchorsByOwner: layout.anchorsByOwner,
        spawnByOwner: layout.spawnsByOwner,
        anchors: {
          ...(layout.anchorsByOwner.player ? { player: layout.anchorsByOwner.player } : {}),
          ...(layout.anchorsByOwner.enemy ? { enemy: layout.anchorsByOwner.enemy } : {}),
          ...(layout.anchorsByOwner.purple ? { purple: layout.anchorsByOwner.purple } : {}),
        },
        spawns: {
          ...(layout.spawnsByOwner.player ? { playerSettler: layout.spawnsByOwner.player } : {}),
          ...(layout.spawnsByOwner.enemy ? { enemySettler: layout.spawnsByOwner.enemy } : {}),
          ...(layout.spawnsByOwner.purple ? { purpleSettler: layout.spawnsByOwner.purple } : {}),
        },
      },
    },
    units,
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
      enemy: aiByOwner.enemy ?? null,
      purple: aiByOwner.purple ?? null,
      byOwner: aiByOwner,
    },
    economy: {
      ...createInitialEconomy(factions.allOwners),
      researchIncomeThisTurn: 0,
    },
    visibility: createVisibilityState(factions.allOwners),
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
 * @param {Parameters<typeof createInitialGameState>[0]} options
 * @returns {import("./matchConfig.js").MatchConfig}
 */
function resolveInitialMatchConfig(options) {
  return resolveMatchConfig({
    mapWidth: options.matchConfig?.mapWidth ?? options.mapWidth,
    mapHeight: options.matchConfig?.mapHeight ?? options.mapHeight,
    aiFactionCount: options.matchConfig?.aiFactionCount ?? options.aiFactionCount,
  });
}

/**
 * @param {import("./matchConfig.js").MatchConfig} matchConfig
 * @returns {import("./factions.js").FactionMetadata}
 */
function createFactionMetadataFromConfig(matchConfig) {
  return createFactionMetadata(buildAiOwners(matchConfig.aiFactionCount));
}

/**
 * @param {Parameters<typeof createInitialGameState>[0]} options
 * @param {string} owner
 * @returns {import("./types.js").EnemyPersonality|undefined}
 */
function getLegacyPersonalityOverride(options, owner) {
  if (owner === "enemy") {
    return options.enemyPersonality;
  }
  if (owner === "purple") {
    return options.purplePersonality;
  }
  return undefined;
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
  const mixed = mixSeed(seed, `ai-personality:${owner}`);
  const index = Math.abs(mixed) % ENEMY_PERSONALITY_ORDER.length;
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

/**
 * @param {import("./types.js").Owner[]} owners
 * @returns {Record<string, ReturnType<typeof createEmptyEconomyBucket>>}
 */
function createInitialEconomy(owners) {
  /** @type {Record<string, ReturnType<typeof createEmptyEconomyBucket>>} */
  const buckets = {};
  for (const owner of owners) {
    buckets[owner] = createEmptyEconomyBucket();
  }
  return buckets;
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

function generateMatchLayout(width, height, seed, minFactionDistance, owners) {
  for (let attempt = 0; attempt < MATCH_LAYOUT_ATTEMPTS; attempt += 1) {
    const attemptSeed = mixSeed(seed, `layout-${attempt}`);
    const tiles = generateTerrainTiles(width, height, { seed: attemptSeed });
    const attemptedLayout = buildAttemptedLayout(tiles, width, height, attemptSeed, minFactionDistance, owners);
    if (!attemptedLayout) {
      continue;
    }

    applySafeSpawnTerrain(tiles, width, height, attemptedLayout.spawnsByOwner);
    const nearestFactionDistance = computeNearestFactionDistanceFromSpawns(attemptedLayout.spawnsByOwner);

    if (nearestFactionDistance >= minFactionDistance) {
      return {
        seed: attemptSeed,
        tiles,
        spawnsByOwner: attemptedLayout.spawnsByOwner,
        anchorsByOwner: attemptedLayout.anchorsByOwner,
        attempts: attempt + 1,
        fallbackUsed: false,
        nearestFactionDistance,
      };
    }
  }

  return buildFallbackLayout(width, height, seed, minFactionDistance, owners);
}

function buildAttemptedLayout(tiles, width, height, attemptSeed, minFactionDistance, owners) {
  const tileByKey = new Map(tiles.map((tile) => [axialKey(tile), tile]));
  const passableTiles = tiles.filter((tile) => !tile.blocksMovement);
  if (passableTiles.length < Math.floor(width * height * 0.52)) {
    return null;
  }

  const anchorCandidates = passableTiles.filter((tile) => countPassableNeighbors(tile, tileByKey, width, height) >= 3);
  if (anchorCandidates.length < owners.length) {
    return null;
  }

  const anchorsByOwner = selectAnchorSet(anchorCandidates, tileByKey, width, height, attemptSeed, minFactionDistance, owners);
  if (!anchorsByOwner) {
    return null;
  }

  const spawnsByOwner = mapCloneHexes(anchorsByOwner);
  const nearestFactionDistance = computeNearestFactionDistanceFromSpawns(spawnsByOwner);
  if (nearestFactionDistance < minFactionDistance) {
    return null;
  }

  const occupiedKeys = new Set(Object.values(spawnsByOwner).map((hex) => axialKey(hex)));
  for (const owner of owners) {
    const spawn = spawnsByOwner[owner];
    if (!spawn) {
      return null;
    }
    if (countFreePassableNeighbors(spawn, tileByKey, width, height, occupiedKeys) < 1) {
      return null;
    }
  }

  return {
    anchorsByOwner,
    spawnsByOwner,
  };
}

function buildFallbackLayout(width, height, seed, minFactionDistance, owners) {
  const fallbackSeed = mixSeed(seed, "fallback-layout");
  const tiles = generateTerrainTiles(width, height, { seed: fallbackSeed });
  const fallbackPositions = buildFallbackSpawns(width, height, owners.length);
  /** @type {Record<string, import("./types.js").Hex>} */
  const spawnsByOwner = {};
  for (let index = 0; index < owners.length; index += 1) {
    const owner = owners[index];
    const fallbackHex = fallbackPositions[index] ?? fallbackPositions[fallbackPositions.length - 1];
    spawnsByOwner[owner] = {
      q: clamp(fallbackHex.q, 0, width - 1),
      r: clamp(fallbackHex.r, 0, height - 1),
    };
  }

  applySafeSpawnTerrain(tiles, width, height, spawnsByOwner);

  return {
    seed: fallbackSeed,
    tiles,
    spawnsByOwner,
    anchorsByOwner: mapCloneHexes(spawnsByOwner),
    attempts: MATCH_LAYOUT_ATTEMPTS,
    fallbackUsed: true,
    nearestFactionDistance: Math.max(minFactionDistance, computeNearestFactionDistanceFromSpawns(spawnsByOwner)),
  };
}

function buildFallbackSpawns(width, height, count) {
  const centerQ = Math.floor(width / 2);
  const centerR = Math.floor(height / 2);
  const points = [
    { q: 2, r: 2 },
    { q: width - 3, r: 2 },
    { q: width - 3, r: height - 3 },
    { q: 2, r: height - 3 },
    { q: centerQ, r: 2 },
    { q: centerQ, r: height - 3 },
    { q: centerQ, r: centerR },
  ];
  return points.slice(0, Math.max(1, count));
}

function selectAnchorSet(candidates, tileByKey, width, height, seed, minFactionDistance, owners) {
  const rng = createSeededRng(mixSeed(seed, "anchor-set"));
  const shuffled = shuffleInPlace([...candidates], rng);
  let bestSelection = null;
  let bestScore = -Infinity;

  const sampleCount = Math.max(240, Math.min(1400, shuffled.length * 14));
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const start = shuffled[Math.floor(rng() * shuffled.length)];
    if (!start) {
      continue;
    }
    const selected = [start];
    while (selected.length < owners.length) {
      const next = chooseBestSeparatedAnchor(shuffled, selected, minFactionDistance, tileByKey, width, height, rng);
      if (!next) {
        break;
      }
      selected.push(next);
    }
    if (selected.length !== owners.length) {
      continue;
    }

    const score = scoreAnchorSelection(selected, tileByKey, width, height, rng);
    if (score > bestScore) {
      bestScore = score;
      /** @type {Record<string, import("./types.js").Hex>} */
      const mapped = {};
      for (let index = 0; index < owners.length; index += 1) {
        mapped[owners[index]] = { q: selected[index].q, r: selected[index].r };
      }
      bestSelection = mapped;
    }
  }

  if (bestSelection) {
    return bestSelection;
  }

  const fallbackSlice = shuffled.slice(0, Math.min(72, shuffled.length));
  return buildDeterministicFallbackSelection(fallbackSlice, owners, minFactionDistance);
}

function chooseBestSeparatedAnchor(candidates, selected, minFactionDistance, tileByKey, width, height, rng) {
  let bestCandidate = null;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    if (selected.some((existing) => existing.q === candidate.q && existing.r === candidate.r)) {
      continue;
    }
    const minDistanceToSelection = selected.reduce(
      (currentMin, existing) => Math.min(currentMin, distance(existing, candidate)),
      Number.POSITIVE_INFINITY
    );
    if (minDistanceToSelection < minFactionDistance) {
      continue;
    }
    const localScore =
      minDistanceToSelection * 10 + countPassableNeighbors(candidate, tileByKey, width, height) + rng() * 0.001;
    if (localScore > bestScore) {
      bestScore = localScore;
      bestCandidate = candidate;
    }
  }
  return bestCandidate;
}

function buildDeterministicFallbackSelection(candidates, owners, minFactionDistance) {
  if (candidates.length < owners.length) {
    return null;
  }

  /** @type {import("./types.js").Hex[]} */
  let best = [];
  let bestScore = -Infinity;
  for (let start = 0; start < candidates.length; start += 1) {
    const selected = [candidates[start]];
    for (const candidate of candidates) {
      if (selected.length >= owners.length) {
        break;
      }
      if (selected.some((existing) => existing.q === candidate.q && existing.r === candidate.r)) {
        continue;
      }
      const minDistanceToSelection = selected.reduce(
        (currentMin, existing) => Math.min(currentMin, distance(existing, candidate)),
        Number.POSITIVE_INFINITY
      );
      if (minDistanceToSelection < minFactionDistance) {
        continue;
      }
      selected.push(candidate);
    }
    if (selected.length !== owners.length) {
      continue;
    }
    const score = scoreAnchorSelection(selected, null, 0, 0, () => 0);
    if (score > bestScore) {
      bestScore = score;
      best = selected;
    }
  }

  if (best.length !== owners.length) {
    return null;
  }

  /** @type {Record<string, import("./types.js").Hex>} */
  const mapped = {};
  for (let index = 0; index < owners.length; index += 1) {
    mapped[owners[index]] = { q: best[index].q, r: best[index].r };
  }
  return mapped;
}

function scoreAnchorSelection(selected, tileByKey, width, height, rng) {
  let separationScore = 0;
  for (let i = 0; i < selected.length; i += 1) {
    for (let j = i + 1; j < selected.length; j += 1) {
      separationScore += distance(selected[i], selected[j]);
    }
  }
  const neighborScore =
    tileByKey && width > 0 && height > 0
      ? selected.reduce((sum, hex) => sum + countPassableNeighbors(hex, tileByKey, width, height), 0)
      : 0;
  return separationScore * 9 + neighborScore + rng();
}

function applySafeSpawnTerrain(tiles, width, height, spawnsByOwner) {
  const tileByKey = new Map(tiles.map((tile) => [axialKey(tile), tile]));
  const safetyHexes = [];
  for (const spawn of Object.values(spawnsByOwner)) {
    safetyHexes.push(spawn);
    safetyHexes.push(...neighbors(spawn));
  }

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

function computeNearestFactionDistanceFromSpawns(spawnsByOwner) {
  const points = Object.values(spawnsByOwner);
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

function mapCloneHexes(input) {
  return Object.fromEntries(Object.entries(input).map(([key, hex]) => [key, { q: hex.q, r: hex.r }]));
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
 * @param {import("./types.js").GameState|undefined|null} [gameState]
 * @returns {import("./types.js").AiOwner}
 */
export function getNextAiOwner(owner, gameState = null) {
  const aiOwners = getAiOwners(gameState);
  const index = aiOwners.indexOf(owner);
  if (index === -1) {
    return /** @type {import("./types.js").AiOwner} */ (aiOwners[0]);
  }
  return /** @type {import("./types.js").AiOwner} */ (aiOwners[(index + 1) % aiOwners.length]);
}
