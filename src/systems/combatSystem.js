import { getUnitById, removeUnitById } from "../core/gameState.js";
import { distance } from "../core/hexGrid.js";

/**
 * @param {string} attackerId
 * @param {import("../core/types.js").GameState} gameState
 * @returns {import("../core/types.js").Unit[]}
 */
export function getAttackableTargets(attackerId, gameState) {
  const attacker = getUnitById(gameState, attackerId);
  if (!attacker || attacker.hasActed || attacker.health <= 0) {
    return [];
  }

  return gameState.units.filter((unit) => {
    if (unit.id === attacker.id || unit.owner === attacker.owner || unit.health <= 0) {
      return false;
    }
    return distance(attacker, unit) <= attacker.attackRange;
  });
}

/**
 * @param {string} attackerId
 * @param {string} targetId
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ ok: boolean, reason?: string }}
 */
export function canAttack(attackerId, targetId, gameState) {
  const attacker = getUnitById(gameState, attackerId);
  if (!attacker) {
    return { ok: false, reason: "attacker-not-found" };
  }

  const target = getUnitById(gameState, targetId);
  if (!target) {
    return { ok: false, reason: "target-not-found" };
  }

  if (attacker.owner === target.owner) {
    return { ok: false, reason: "same-owner" };
  }

  if (attacker.hasActed) {
    return { ok: false, reason: "unit-already-acted" };
  }

  if (distance(attacker, target) > attacker.attackRange) {
    return { ok: false, reason: "out-of-range" };
  }

  return { ok: true };
}

/**
 * @param {string} attackerId
 * @param {string} targetId
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ ok: boolean, reason?: string, damage?: number, targetDefeated?: boolean }}
 */
export function resolveAttack(attackerId, targetId, gameState) {
  const check = canAttack(attackerId, targetId, gameState);
  if (!check.ok) {
    return check;
  }

  const attacker = getUnitById(gameState, attackerId);
  const target = getUnitById(gameState, targetId);
  if (!attacker || !target) {
    return { ok: false, reason: "units-missing" };
  }

  const damage = attacker.attack;
  target.health = Math.max(0, target.health - damage);

  attacker.hasActed = true;
  attacker.movementRemaining = 0;

  const targetDefeated = target.health <= 0;
  if (targetDefeated) {
    removeUnitById(gameState, target.id);
  }

  return { ok: true, damage, targetDefeated };
}
