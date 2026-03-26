import { ALL_OWNERS, AI_OWNERS, PLAYER_OWNER, getHostileOwners, isOwner } from "../core/factions.js";
import { distance } from "../core/hexGrid.js";

export const UNIT_SIGHT_RANGE = 2;
export const CITY_SIGHT_RANGE = 3;

/**
 * @param {number} q
 * @param {number} r
 * @returns {string}
 */
export function toHexKey(q, r) {
  return `${q},${r}`;
}

/**
 * @param {import("../core/types.js").Owner} owner
 * @returns {import("../core/types.js").VisibilityOwnerState}
 */
export function createEmptyVisibilityOwnerState(owner) {
  return {
    visibleHexes: [],
    exploredHexes: [],
    seenOwners: [owner],
  };
}

/**
 * @returns {import("../core/types.js").VisibilityState}
 */
export function createVisibilityState() {
  return {
    byOwner: {
      player: createEmptyVisibilityOwnerState("player"),
      enemy: createEmptyVisibilityOwnerState("enemy"),
      purple: createEmptyVisibilityOwnerState("purple"),
    },
    devRevealPlayer: false,
  };
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @returns {import("../core/types.js").VisibilityState}
 */
export function normalizeVisibilityState(gameState) {
  if (!gameState.visibility || typeof gameState.visibility !== "object") {
    gameState.visibility = createVisibilityState();
  }
  if (!gameState.visibility.byOwner || typeof gameState.visibility.byOwner !== "object") {
    gameState.visibility.byOwner = createVisibilityState().byOwner;
  }

  for (const owner of ALL_OWNERS) {
    const bucket = gameState.visibility.byOwner[owner];
    if (!bucket || typeof bucket !== "object") {
      gameState.visibility.byOwner[owner] = createEmptyVisibilityOwnerState(owner);
      continue;
    }

    bucket.visibleHexes = normalizeHexKeyList(bucket.visibleHexes);
    bucket.exploredHexes = normalizeHexKeyList(bucket.exploredHexes);
    bucket.seenOwners = normalizeSeenOwners(bucket.seenOwners, owner);
  }

  if (typeof gameState.visibility.devRevealPlayer !== "boolean") {
    gameState.visibility.devRevealPlayer = false;
  }

  return gameState.visibility;
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @returns {import("../core/types.js").VisibilityState}
 */
export function recomputeVisibility(gameState) {
  const visibility = normalizeVisibilityState(gameState);

  for (const owner of ALL_OWNERS) {
    const visible = collectOwnerVisibleHexes(gameState, owner);
    const visibleKeys = [...visible].sort(compareHexKeys);
    const explored = new Set(visibility.byOwner[owner].exploredHexes);
    for (const key of visibleKeys) {
      explored.add(key);
    }

    const seenOwners = new Set(visibility.byOwner[owner].seenOwners);
    seenOwners.add(owner);
    for (const hostile of getHostileOwners(owner)) {
      if (ownerCanCurrentlySeeOwner(gameState, owner, hostile, visible)) {
        seenOwners.add(hostile);
      }
    }

    visibility.byOwner[owner].visibleHexes = visibleKeys;
    visibility.byOwner[owner].exploredHexes = [...explored].sort(compareHexKeys);
    visibility.byOwner[owner].seenOwners = normalizeSeenOwners([...seenOwners], owner);
  }

  return visibility;
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @param {import("../core/types.js").Owner} owner
 * @returns {Set<string>}
 */
export function getVisibleHexSet(gameState, owner) {
  const visibility = normalizeVisibilityState(gameState);
  return new Set(visibility.byOwner[owner].visibleHexes);
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @param {import("../core/types.js").Owner} owner
 * @returns {Set<string>}
 */
export function getExploredHexSet(gameState, owner) {
  const visibility = normalizeVisibilityState(gameState);
  return new Set(visibility.byOwner[owner].exploredHexes);
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @param {import("../core/types.js").Owner} owner
 * @param {number} q
 * @param {number} r
 * @returns {boolean}
 */
export function isHexVisibleToOwner(gameState, owner, q, r) {
  return getVisibleHexSet(gameState, owner).has(toHexKey(q, r));
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @param {import("../core/types.js").Owner} owner
 * @param {number} q
 * @param {number} r
 * @returns {boolean}
 */
export function isHexExploredByOwner(gameState, owner, q, r) {
  return getExploredHexSet(gameState, owner).has(toHexKey(q, r));
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @param {import("../core/types.js").Owner} observer
 * @param {import("../core/types.js").Unit} unit
 * @returns {boolean}
 */
export function canOwnerSeeUnit(gameState, observer, unit) {
  if (observer === unit.owner) {
    return true;
  }
  return isHexVisibleToOwner(gameState, observer, unit.q, unit.r);
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @param {import("../core/types.js").Owner} observer
 * @param {import("../core/types.js").City} city
 * @returns {boolean}
 */
export function canOwnerSeeCity(gameState, observer, city) {
  if (observer === city.owner) {
    return true;
  }
  return isHexVisibleToOwner(gameState, observer, city.q, city.r);
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @param {import("../core/types.js").Owner} owner
 * @returns {import("../core/types.js").Owner[]}
 */
export function getSeenOwners(gameState, owner) {
  const visibility = normalizeVisibilityState(gameState);
  return [...visibility.byOwner[owner].seenOwners];
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @param {import("../core/types.js").AiOwner} owner
 * @returns {import("../core/types.js").Owner[]}
 */
export function getSeenHostileOwners(gameState, owner) {
  const seen = new Set(getSeenOwners(gameState, owner));
  return getHostileOwners(owner).filter((candidate) => seen.has(candidate));
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @returns {boolean}
 */
export function isPlayerDevVisionEnabled(gameState) {
  return !!normalizeVisibilityState(gameState).devRevealPlayer;
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @param {boolean} enabled
 * @returns {boolean}
 */
export function setPlayerDevVision(gameState, enabled) {
  normalizeVisibilityState(gameState).devRevealPlayer = !!enabled;
  return normalizeVisibilityState(gameState).devRevealPlayer;
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @returns {boolean}
 */
export function togglePlayerDevVision(gameState) {
  const next = !isPlayerDevVisionEnabled(gameState);
  return setPlayerDevVision(gameState, next);
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @param {import("../core/types.js").Owner} owner
 * @returns {Set<string>}
 */
function collectOwnerVisibleHexes(gameState, owner) {
  const visible = new Set();
  const units = gameState.units.filter((unit) => unit.owner === owner && unit.health > 0);
  const cities = gameState.cities.filter((city) => city.owner === owner && city.health > 0);

  for (const unit of units) {
    addHexesWithinRange(visible, gameState.map, unit, UNIT_SIGHT_RANGE);
  }
  for (const city of cities) {
    addHexesWithinRange(visible, gameState.map, city, CITY_SIGHT_RANGE);
  }

  return visible;
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @param {import("../core/types.js").Owner} observer
 * @param {import("../core/types.js").Owner} targetOwner
 * @param {Set<string>} visible
 * @returns {boolean}
 */
function ownerCanCurrentlySeeOwner(gameState, observer, targetOwner, visible) {
  if (observer === targetOwner) {
    return true;
  }

  for (const unit of gameState.units) {
    if (unit.owner !== targetOwner || unit.health <= 0) {
      continue;
    }
    if (visible.has(toHexKey(unit.q, unit.r))) {
      return true;
    }
  }
  for (const city of gameState.cities) {
    if (city.owner !== targetOwner || city.health <= 0) {
      continue;
    }
    if (visible.has(toHexKey(city.q, city.r))) {
      return true;
    }
  }
  return false;
}

/**
 * @param {Set<string>} target
 * @param {{ width: number, height: number }} map
 * @param {{ q: number, r: number }} center
 * @param {number} range
 */
function addHexesWithinRange(target, map, center, range) {
  for (let q = Math.max(0, center.q - range); q <= Math.min(map.width - 1, center.q + range); q += 1) {
    for (let r = Math.max(0, center.r - range); r <= Math.min(map.height - 1, center.r + range); r += 1) {
      if (distance(center, { q, r }) <= range) {
        target.add(toHexKey(q, r));
      }
    }
  }
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function normalizeHexKeyList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const unique = new Set();
  for (const candidate of value) {
    if (typeof candidate !== "string") {
      continue;
    }
    const [q, r] = candidate.split(",").map((part) => Number.parseInt(part, 10));
    if (!Number.isFinite(q) || !Number.isFinite(r)) {
      continue;
    }
    unique.add(toHexKey(q, r));
  }
  return [...unique].sort(compareHexKeys);
}

/**
 * @param {unknown} value
 * @param {import("../core/types.js").Owner} owner
 * @returns {import("../core/types.js").Owner[]}
 */
function normalizeSeenOwners(value, owner) {
  const seen = new Set([owner]);
  if (Array.isArray(value)) {
    for (const candidate of value) {
      if (isOwner(candidate)) {
        seen.add(candidate);
      }
    }
  }
  return ALL_OWNERS.filter((candidate) => seen.has(candidate));
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareHexKeys(a, b) {
  const [qa, ra] = a.split(",").map((part) => Number.parseInt(part, 10));
  const [qb, rb] = b.split(",").map((part) => Number.parseInt(part, 10));
  return qa - qb || ra - rb;
}

export const VISIBILITY_AI_OWNERS = AI_OWNERS;
export const VISIBILITY_PLAYER_OWNER = PLAYER_OWNER;

