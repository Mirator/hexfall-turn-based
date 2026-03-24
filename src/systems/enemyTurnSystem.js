import { getUnitById } from "../core/gameState.js";
import { distance } from "../core/hexGrid.js";
import { foundCity } from "./citySystem.js";
import { getAttackableCities, getAttackableTargets, resolveAttack, resolveCityAttack } from "./combatSystem.js";
import { getReachable, moveUnit } from "./movementSystem.js";

/**
 * @param {import("../core/types.js").GameState} gameState
 * @returns {import("../core/types.js").GameState}
 */
export function runEnemyTurn(gameState) {
  const enemyUnits = gameState.units.filter((unit) => unit.owner === "enemy");
  const playerPresence =
    gameState.units.some((unit) => unit.owner === "player") || gameState.cities.some((city) => city.owner === "player");
  if (enemyUnits.length === 0 || !playerPresence) {
    return gameState;
  }

  for (const enemyUnit of enemyUnits) {
    const refreshedEnemy = getUnitById(gameState, enemyUnit.id);
    if (!refreshedEnemy || refreshedEnemy.health <= 0) {
      continue;
    }

    if (refreshedEnemy.type === "settler" && gameState.cities.every((city) => city.owner !== "enemy")) {
      const founded = foundCity(refreshedEnemy.id, gameState);
      if (founded.ok) {
        continue;
      }
    }

    const immediateUnitTargets = getAttackableTargets(refreshedEnemy.id, gameState);
    if (immediateUnitTargets.length > 0) {
      const target = sortByDistanceThenId(immediateUnitTargets, refreshedEnemy)[0];
      if (target) {
        resolveAttack(refreshedEnemy.id, target.id, gameState);
        continue;
      }
    }

    const immediateCityTargets = getAttackableCities(refreshedEnemy.id, gameState);
    if (immediateCityTargets.length > 0) {
      const cityTarget = sortByDistanceThenId(immediateCityTargets, refreshedEnemy)[0];
      if (cityTarget) {
        resolveCityAttack(refreshedEnemy.id, cityTarget.id, gameState);
        continue;
      }
    }

    const closestTarget = pickClosestTarget(refreshedEnemy, gameState);
    if (!closestTarget) {
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
  const unitCandidates = gameState.units.filter((unit) => unit.owner !== enemyUnit.owner && unit.health > 0);
  const cityCandidates = gameState.cities.filter((city) => city.owner !== enemyUnit.owner && city.health > 0);
  const combined = [...unitCandidates, ...cityCandidates];
  if (combined.length === 0) {
    return null;
  }

  return combined.sort((a, b) => {
    const aDistance = distance(enemyUnit, a);
    const bDistance = distance(enemyUnit, b);
    return aDistance - bDistance || a.id.localeCompare(b.id);
  })[0];
}

function getBestMoveTowardTarget(enemyUnit, target, gameState) {
  const reachable = getReachable(enemyUnit.id, gameState);
  if (reachable.length === 0) {
    return null;
  }

  const best = reachable
    .map((hex) => ({
      ...hex,
      targetDistance: distance(hex, target),
    }))
    .sort((a, b) => a.targetDistance - b.targetDistance || a.cost - b.cost || a.q - b.q || a.r - b.r)[0];

  if (!best) {
    return null;
  }

  return { q: best.q, r: best.r };
}

function sortByDistanceThenId(candidates, origin) {
  return [...candidates].sort((a, b) => {
    const aDistance = distance(origin, a);
    const bDistance = distance(origin, b);
    return aDistance - bDistance || a.id.localeCompare(b.id);
  });
}
