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
  const startKey = axialKey(unit);
  const frontier = [{ q: unit.q, r: unit.r, cost: 0 }];
  const bestCostByHex = new Map([[startKey, 0]]);

  while (frontier.length > 0) {
    frontier.sort((a, b) => a.cost - b.cost);
    const current = frontier.shift();
    if (!current) {
      break;
    }

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
      frontier.push({ q: neighbor.q, r: neighbor.r, cost: nextCost });
    }
  }

  return bestCostByHex;
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
 * @returns {{ ok: boolean, reason?: string, cost?: number }}
 */
export function moveUnit(unitId, destination, gameState) {
  const check = canMoveUnitTo(unitId, destination, gameState);
  if (!check.ok) {
    return check;
  }

  const unit = getUnitById(gameState, unitId);
  if (!unit) {
    return { ok: false, reason: "unit-not-found" };
  }

  unit.q = destination.q;
  unit.r = destination.r;
  unit.movementRemaining = Math.max(0, unit.movementRemaining - (check.cost ?? 0));
  unit.hasActed = true;

  return { ok: true, cost: check.cost };
}
