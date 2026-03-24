import { getCityById, getUnitById, removeUnitById } from "../core/gameState.js";
import { distance } from "../core/hexGrid.js";
import { CITY_MAX_HEALTH } from "./citySystem.js";

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
 * @param {import("../core/types.js").GameState} gameState
 * @returns {import("../core/types.js").City[]}
 */
export function getAttackableCities(attackerId, gameState) {
  const attacker = getUnitById(gameState, attackerId);
  if (!attacker || attacker.hasActed || attacker.health <= 0) {
    return [];
  }

  return gameState.cities.filter((city) => {
    if (city.owner === attacker.owner || city.health <= 0) {
      return false;
    }
    return distance(attacker, city) <= attacker.attackRange;
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
 * @param {string} cityId
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ ok: boolean, reason?: string }}
 */
export function canAttackCity(attackerId, cityId, gameState) {
  const attacker = getUnitById(gameState, attackerId);
  if (!attacker) {
    return { ok: false, reason: "attacker-not-found" };
  }

  const city = getCityById(gameState, cityId);
  if (!city) {
    return { ok: false, reason: "city-not-found" };
  }

  if (attacker.owner === city.owner) {
    return { ok: false, reason: "same-owner" };
  }

  if (attacker.hasActed) {
    return { ok: false, reason: "unit-already-acted" };
  }

  if (distance(attacker, city) > attacker.attackRange) {
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

/**
 * @param {string} attackerId
 * @param {string} cityId
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{
 *   ok: boolean,
 *   reason?: string,
 *   damage?: number,
 *   cityDefeated?: boolean,
 *   pendingResolution?: boolean,
 *   outcomeChoice?: "capture"|"raze"
 * }}
 */
export function resolveCityAttack(attackerId, cityId, gameState) {
  const check = canAttackCity(attackerId, cityId, gameState);
  if (!check.ok) {
    return check;
  }

  const attacker = getUnitById(gameState, attackerId);
  const city = getCityById(gameState, cityId);
  if (!attacker || !city) {
    return { ok: false, reason: "entities-missing" };
  }

  const damage = attacker.attack;
  city.health = Math.max(0, city.health - damage);
  attacker.hasActed = true;
  attacker.movementRemaining = 0;

  if (city.health > 0) {
    return { ok: true, damage, cityDefeated: false };
  }

  gameState.pendingCityResolution = {
    cityId: city.id,
    attackerOwner: attacker.owner,
    defenderOwner: city.owner,
    choices: ["capture", "raze"],
  };

  if (attacker.owner === "player") {
    return { ok: true, damage, cityDefeated: true, pendingResolution: true };
  }

  const aiChoice = pickAiCityOutcome(attacker.owner, gameState);
  const outcome = resolveCityOutcome(city.id, aiChoice, gameState);
  if (!outcome.ok) {
    return { ok: false, reason: outcome.reason };
  }

  return {
    ok: true,
    damage,
    cityDefeated: true,
    pendingResolution: false,
    outcomeChoice: aiChoice,
  };
}

/**
 * @param {string} cityId
 * @param {"capture"|"raze"} choice
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ ok: boolean, reason?: string, cityRemoved?: boolean, cityCaptured?: boolean }}
 */
export function resolveCityOutcome(cityId, choice, gameState) {
  if (choice !== "capture" && choice !== "raze") {
    return { ok: false, reason: "invalid-choice" };
  }

  const pending = gameState.pendingCityResolution;
  if (!pending || pending.cityId !== cityId) {
    return { ok: false, reason: "resolution-not-pending" };
  }

  if (!pending.choices.includes(choice)) {
    return { ok: false, reason: "choice-not-allowed" };
  }

  const city = getCityById(gameState, cityId);
  if (!city) {
    gameState.pendingCityResolution = null;
    return { ok: false, reason: "city-not-found" };
  }

  if (choice === "raze") {
    gameState.cities = gameState.cities.filter((candidate) => candidate.id !== cityId);
    if (gameState.selectedCityId === cityId) {
      gameState.selectedCityId = null;
    }
    gameState.pendingCityResolution = null;
    return { ok: true, cityRemoved: true, cityCaptured: false };
  }

  city.owner = pending.attackerOwner;
  city.health = city.maxHealth || CITY_MAX_HEALTH;
  if (!city.maxHealth) {
    city.maxHealth = CITY_MAX_HEALTH;
  }
  gameState.pendingCityResolution = null;
  return { ok: true, cityRemoved: false, cityCaptured: true };
}

function pickAiCityOutcome(attackerOwner, gameState) {
  const ownedCities = gameState.cities.filter((city) => city.owner === attackerOwner).length;
  return ownedCities === 0 ? "capture" : "raze";
}
