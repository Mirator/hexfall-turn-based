import { getUnitById } from "../core/gameState.js";
import { distance } from "../core/hexGrid.js";
import { resolveAttack } from "./combatSystem.js";
import { getReachable, moveUnit } from "./movementSystem.js";

/**
 * @param {import("../core/types.js").GameState} gameState
 * @returns {import("../core/types.js").GameState}
 */
export function runEnemyTurn(gameState) {
  const enemyUnits = gameState.units.filter((unit) => unit.owner === "enemy");
  const playerUnits = gameState.units.filter((unit) => unit.owner === "player");
  if (enemyUnits.length === 0 || playerUnits.length === 0) {
    return gameState;
  }

  for (const enemyUnit of enemyUnits) {
    const refreshedEnemy = getUnitById(gameState, enemyUnit.id);
    if (!refreshedEnemy || refreshedEnemy.health <= 0) {
      continue;
    }

    const closestTarget = pickClosestTarget(refreshedEnemy, gameState);
    if (!closestTarget) {
      continue;
    }

    const attackResult = resolveAttack(refreshedEnemy.id, closestTarget.id, gameState);
    if (attackResult.ok) {
      continue;
    }

    const bestMove = getBestMoveTowardTarget(refreshedEnemy, closestTarget, gameState);
    if (bestMove) {
      moveUnit(refreshedEnemy.id, bestMove, gameState);
    }
  }

  return gameState;
}

function pickClosestTarget(enemyUnit, gameState) {
  const candidates = gameState.units
    .filter((unit) => unit.owner !== enemyUnit.owner && unit.health > 0)
    .sort((a, b) => {
      const aDistance = distance(enemyUnit, a);
      const bDistance = distance(enemyUnit, b);
      return aDistance - bDistance || a.id.localeCompare(b.id);
    });

  return candidates[0] ?? null;
}

function getBestMoveTowardTarget(enemyUnit, targetUnit, gameState) {
  const reachable = getReachable(enemyUnit.id, gameState);
  if (reachable.length === 0) {
    return null;
  }

  const best = reachable
    .map((hex) => ({
      ...hex,
      targetDistance: distance(hex, targetUnit),
    }))
    .sort((a, b) => {
      return a.targetDistance - b.targetDistance || a.cost - b.cost || a.q - b.q || a.r - b.r;
    })[0];

  if (!best) {
    return null;
  }

  return { q: best.q, r: best.r };
}
