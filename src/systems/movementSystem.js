import { getTileAt, getUnitAt, getUnitById, isInsideMap } from "../core/gameState.js";
import { axialKey, neighbors } from "../core/hexGrid.js";

/**
 * @param {string} unitId
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ q: number, r: number, cost: number }[]}
 */
export function getReachable(unitId, gameState) {
  const unit = getUnitById(gameState, unitId);
  if (!unit || unit.movementRemaining <= 0 || unit.hasActed) {
    return [];
  }

  const costByHex = getReachableCostMap(unit, gameState);
  return [...costByHex.entries()]
    .filter(([key]) => key !== axialKey(unit))
    .map(([key, cost]) => {
      const [q, r] = key.split(",").map((value) => Number.parseInt(value, 10));
      return { q, r, cost };
    })
    .sort((a, b) => a.cost - b.cost || a.q - b.q || a.r - b.r);
}

/**
 * @param {import("../core/types.js").Unit} unit
 * @param {import("../core/types.js").GameState} gameState
 * @returns {Map<string, number>}
 */
export function getReachableCostMap(unit, gameState) {
  return computeReachability(unit, gameState).costByHex;
}

/**
 * @param {string} unitId
 * @param {{ q: number, r: number }} destination
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ ok: boolean, reason?: string, cost?: number }}
 */
export function canMoveUnitTo(unitId, destination, gameState) {
  const unit = getUnitById(gameState, unitId);
  if (!unit) {
    return { ok: false, reason: "unit-not-found" };
  }

  if (unit.hasActed) {
    return { ok: false, reason: "unit-already-acted" };
  }

  if (!isInsideMap(gameState.map, destination.q, destination.r)) {
    return { ok: false, reason: "out-of-bounds" };
  }

  if (unit.q === destination.q && unit.r === destination.r) {
    return { ok: false, reason: "same-tile" };
  }

  const tile = getTileAt(gameState.map, destination.q, destination.r);
  if (!tile || tile.blocksMovement) {
    return { ok: false, reason: "blocked-terrain" };
  }

  const occupant = getUnitAt(gameState, destination.q, destination.r);
  if (occupant && occupant.id !== unit.id) {
    return { ok: false, reason: "occupied" };
  }

  const reachableCosts = getReachableCostMap(unit, gameState);
  const destinationCost = reachableCosts.get(axialKey(destination));
  if (typeof destinationCost !== "number") {
    return { ok: false, reason: "out-of-range" };
  }

  return { ok: true, cost: destinationCost };
}

/**
 * @param {string} unitId
 * @param {{ q: number, r: number }} destination
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ ok: boolean, reason?: string, cost?: number, path?: Array<{ q: number, r: number }> }}
 */
export function getPathTo(unitId, destination, gameState) {
  const check = canMoveUnitTo(unitId, destination, gameState);
  if (!check.ok) {
    return check;
  }

  const unit = getUnitById(gameState, unitId);
  if (!unit) {
    return { ok: false, reason: "unit-not-found" };
  }

  const reachability = computeReachability(unit, gameState);
  const destinationKey = axialKey(destination);
  if (!reachability.costByHex.has(destinationKey)) {
    return { ok: false, reason: "out-of-range" };
  }

  const startKey = axialKey(unit);
  const pathKeys = [destinationKey];
  let currentKey = destinationKey;
  while (currentKey !== startKey) {
    const previous = reachability.previousByHex.get(currentKey);
    if (!previous) {
      return { ok: false, reason: "path-not-found" };
    }
    pathKeys.push(previous);
    currentKey = previous;
  }

  const path = pathKeys
    .reverse()
    .map((key) => {
      const [q, r] = key.split(",").map((value) => Number.parseInt(value, 10));
      return { q, r };
    })
    .filter((hex) => Number.isFinite(hex.q) && Number.isFinite(hex.r));

  if (path.length === 0) {
    return { ok: false, reason: "path-not-found" };
  }

  return {
    ok: true,
    cost: check.cost,
    path,
  };
}

/**
 * @param {string} unitId
 * @param {{ q: number, r: number }} destination
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ ok: boolean, reason?: string, cost?: number, path?: Array<{ q: number, r: number }> }}
 */
export function moveUnit(unitId, destination, gameState) {
  const pathCheck = getPathTo(unitId, destination, gameState);
  if (!pathCheck.ok) {
    return pathCheck;
  }

  const unit = getUnitById(gameState, unitId);
  if (!unit) {
    return { ok: false, reason: "unit-not-found" };
  }

  unit.q = destination.q;
  unit.r = destination.r;
  unit.movementRemaining = Math.max(0, unit.movementRemaining - (pathCheck.cost ?? 0));
  unit.hasActed = true;

  return { ok: true, cost: pathCheck.cost, path: pathCheck.path };
}

/**
 * @param {import("../core/types.js").Unit} unit
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ costByHex: Map<string, number>, previousByHex: Map<string, string> }}
 */
function computeReachability(unit, gameState) {
  const startKey = axialKey(unit);
  const frontier = [{ q: unit.q, r: unit.r, cost: 0 }];
  const bestCostByHex = new Map([[startKey, 0]]);
  const previousByHex = new Map();

  while (frontier.length > 0) {
    frontier.sort((a, b) => a.cost - b.cost);
    const current = frontier.shift();
    if (!current) {
      break;
    }

    const currentKey = axialKey(current);
    for (const neighbor of neighbors(current)) {
      if (!isInsideMap(gameState.map, neighbor.q, neighbor.r)) {
        continue;
      }

      const occupant = getUnitAt(gameState, neighbor.q, neighbor.r);
      if (occupant && occupant.id !== unit.id) {
        continue;
      }

      const tile = getTileAt(gameState.map, neighbor.q, neighbor.r);
      if (!tile || tile.blocksMovement) {
        continue;
      }

      const nextCost = current.cost + tile.moveCost;
      if (nextCost > unit.movementRemaining) {
        continue;
      }

      const key = axialKey(neighbor);
      const previousCost = bestCostByHex.get(key);
      if (typeof previousCost === "number" && previousCost <= nextCost) {
        continue;
      }

      bestCostByHex.set(key, nextCost);
      previousByHex.set(key, currentKey);
      frontier.push({ q: neighbor.q, r: neighbor.r, cost: nextCost });
    }
  }

  return {
    costByHex: bestCostByHex,
    previousByHex,
  };
}
