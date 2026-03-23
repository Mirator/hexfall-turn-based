import { getUnitAt, getUnitById, isInsideMap } from "../core/gameState.js";
import { distance } from "../core/hexGrid.js";

/**
 * @param {string} unitId
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ q: number, r: number, cost: number }[]}
 */
export function getReachable(unitId, gameState) {
  const unit = getUnitById(gameState, unitId);
  if (!unit || unit.movementRemaining <= 0) {
    return [];
  }

  const reachable = [];
  for (let q = 0; q < gameState.map.width; q += 1) {
    for (let r = 0; r < gameState.map.height; r += 1) {
      const cost = distance(unit, { q, r });
      if (cost <= 0 || cost > unit.movementRemaining) {
        continue;
      }
      if (getUnitAt(gameState, q, r)) {
        continue;
      }
      reachable.push({ q, r, cost });
    }
  }

  return reachable;
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

  if (!isInsideMap(gameState.map, destination.q, destination.r)) {
    return { ok: false, reason: "out-of-bounds" };
  }

  const cost = distance(unit, destination);
  if (cost <= 0) {
    return { ok: false, reason: "same-tile" };
  }

  if (cost > unit.movementRemaining) {
    return { ok: false, reason: "out-of-range" };
  }

  const occupant = getUnitAt(gameState, destination.q, destination.r);
  if (occupant && occupant.id !== unit.id) {
    return { ok: false, reason: "occupied" };
  }

  return { ok: true, cost };
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
  unit.movementRemaining -= check.cost ?? 0;

  return { ok: true, cost: check.cost };
}
