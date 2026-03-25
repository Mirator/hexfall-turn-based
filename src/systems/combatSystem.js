import { getCityById, getTileAt, getUnitById, removeUnitById } from "../core/gameState.js";
import { distance } from "../core/hexGrid.js";
import { CITY_MAX_HEALTH } from "./citySystem.js";

const ROLE_ATTACK_BONUS = {
  spearman: { warrior: 1 },
  warrior: { archer: 1 },
  archer: { spearman: 1 },
};

const DEFENSE_TERRAIN_TYPES = new Set(["forest", "hill"]);

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
    return isTargetInAttackRange(attacker, unit);
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
    return isTargetInAttackRange(attacker, city);
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

  if (!isTargetInAttackRange(attacker, target)) {
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

  if (!isTargetInAttackRange(attacker, city)) {
    return { ok: false, reason: "out-of-range" };
  }

  return { ok: true };
}

/**
 * @param {string} attackerId
 * @param {string} targetId
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{
 *   ok: boolean,
 *   reason?: string,
 *   damage?: number,
 *   targetDefeated?: boolean,
 *   attackerDefeated?: boolean,
 *   breakdown?: {
 *     baseAttack: number,
 *     roleBonus: number,
 *     terrainAttackBonus: number,
 *     defenderArmor: number,
 *     terrainDefenseBonus: number,
 *     rawDamage: number,
 *     damage: number
 *   },
 *   counterattack?: {
 *     triggered: boolean,
 *     reason?: string,
 *     damage?: number,
 *     attackerDefeated?: boolean,
 *     breakdown?: {
 *       baseAttack: number,
 *       roleBonus: number,
 *       terrainAttackBonus: number,
 *       defenderArmor: number,
 *       terrainDefenseBonus: number,
 *       rawDamage: number,
 *       damage: number
 *     }
 *   }
 * }}
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

  const breakdown = buildUnitCombatBreakdown(attacker, target, gameState);
  const damage = breakdown.damage;
  target.health = Math.max(0, target.health - damage);

  attacker.hasActed = true;
  attacker.movementRemaining = 0;

  const targetDefeated = target.health <= 0;
  if (targetDefeated) {
    removeUnitById(gameState, target.id);
  }

  /** @type {{
   *   triggered: boolean,
   *   reason?: string,
   *   damage?: number,
   *   attackerDefeated?: boolean,
   *   breakdown?: {
   *     baseAttack: number,
   *     roleBonus: number,
   *     terrainAttackBonus: number,
   *     defenderArmor: number,
   *     terrainDefenseBonus: number,
   *     rawDamage: number,
   *     damage: number
   *   }
   * }} */
  let counterattack = { triggered: false };
  let attackerDefeated = false;

  if (!targetDefeated) {
    if (isTargetInAttackRange(target, attacker)) {
      const counterBreakdown = buildUnitCombatBreakdown(target, attacker, gameState);
      const counterDamage = counterBreakdown.damage;
      attacker.health = Math.max(0, attacker.health - counterDamage);
      attackerDefeated = attacker.health <= 0;
      if (attackerDefeated) {
        removeUnitById(gameState, attacker.id);
      }
      counterattack = {
        triggered: true,
        damage: counterDamage,
        attackerDefeated,
        breakdown: counterBreakdown,
      };
    } else {
      counterattack = {
        triggered: false,
        reason: "out-of-range",
      };
    }
  } else {
    counterattack = {
      triggered: false,
      reason: "target-defeated",
    };
  }

  return { ok: true, damage, targetDefeated, attackerDefeated, breakdown, counterattack };
}

/**
 * @param {string} attackerId
 * @param {string} cityId
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{
 *   ok: boolean,
 *   reason?: string,
 *   damage?: number,
 *   breakdown?: {
 *     baseAttack: number,
 *     roleBonus: number,
 *     terrainAttackBonus: number,
 *     defenderArmor: number,
 *     terrainDefenseBonus: number,
 *     rawDamage: number,
 *     damage: number
 *   },
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

  const breakdown = buildCityCombatBreakdown(attacker, city, gameState);
  const damage = breakdown.damage;
  city.health = Math.max(0, city.health - damage);
  attacker.hasActed = true;
  attacker.movementRemaining = 0;

  if (city.health > 0) {
    return { ok: true, damage, breakdown, cityDefeated: false };
  }

  gameState.pendingCityResolution = {
    cityId: city.id,
    attackerOwner: attacker.owner,
    defenderOwner: city.owner,
    choices: ["capture", "raze"],
  };

  if (attacker.owner === "player") {
    return { ok: true, damage, breakdown, cityDefeated: true, pendingResolution: true };
  }

  const aiChoice = pickAiCityOutcome(attacker.owner, city, gameState);
  const outcome = resolveCityOutcome(city.id, aiChoice, gameState);
  if (!outcome.ok) {
    return { ok: false, reason: outcome.reason };
  }

  return {
    ok: true,
    damage,
    breakdown,
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

function pickAiCityOutcome(attackerOwner, targetCity, gameState) {
  const ownedCities = gameState.cities.filter((city) => city.owner === attackerOwner).length;
  if (attackerOwner !== "enemy") {
    return ownedCities === 0 ? "capture" : "raze";
  }

  const personality = gameState.ai?.enemy?.personality ?? "expansionist";
  if (personality === "expansionist") {
    return "capture";
  }
  if (personality === "raider") {
    return ownedCities === 0 ? "capture" : "raze";
  }

  const hasNearbyAlliedCity = gameState.cities.some((city) => {
    if (city.owner !== attackerOwner) {
      return false;
    }
    return city.id !== targetCity.id && distance(city, targetCity) <= 3;
  });
  if (ownedCities === 0 || hasNearbyAlliedCity) {
    return "capture";
  }
  return "raze";
}

function isTargetInAttackRange(attacker, target) {
  const distanceToTarget = distance(attacker, target);
  const minRange = getMinAttackRange(attacker);
  const maxRange = getMaxAttackRange(attacker, minRange);
  return distanceToTarget >= minRange && distanceToTarget <= maxRange;
}

function getMinAttackRange(unit) {
  return Math.max(1, unit.minAttackRange ?? 1);
}

function getMaxAttackRange(unit, minRange) {
  return Math.max(minRange, unit.attackRange ?? 1);
}

function buildUnitCombatBreakdown(attacker, defender, gameState) {
  const baseAttack = attacker.attack;
  const roleBonus = getRoleBonus(attacker, defender);
  const terrainAttackBonus = getTerrainAttackBonus(attacker, gameState);
  const defenderArmor = Math.max(0, defender.armor ?? 0);
  const terrainDefenseBonus = getTerrainDefenseBonus(defender, gameState);
  const rawDamage = baseAttack + roleBonus + terrainAttackBonus - defenderArmor - terrainDefenseBonus;
  const damage = Math.max(1, rawDamage);

  return {
    baseAttack,
    roleBonus,
    terrainAttackBonus,
    defenderArmor,
    terrainDefenseBonus,
    rawDamage,
    damage,
  };
}

function buildCityCombatBreakdown(attacker, city, gameState) {
  const baseAttack = attacker.attack;
  const roleBonus = 0;
  const terrainAttackBonus = getTerrainAttackBonus(attacker, gameState);
  const defenderArmor = 0;
  const terrainDefenseBonus = getTerrainDefenseBonus(city, gameState);
  const rawDamage = baseAttack + roleBonus + terrainAttackBonus - defenderArmor - terrainDefenseBonus;
  const damage = Math.max(1, rawDamage);

  return {
    baseAttack,
    roleBonus,
    terrainAttackBonus,
    defenderArmor,
    terrainDefenseBonus,
    rawDamage,
    damage,
  };
}

function getRoleBonus(attacker, defender) {
  return ROLE_ATTACK_BONUS[attacker.type]?.[defender.type] ?? 0;
}

function getTerrainAttackBonus(unit, gameState) {
  const attackerTerrain = getTileAt(gameState.map, unit.q, unit.r)?.terrainType;
  return attackerTerrain === "hill" ? 1 : 0;
}

function getTerrainDefenseBonus(entity, gameState) {
  const terrainType = getTileAt(gameState.map, entity.q, entity.r)?.terrainType;
  return DEFENSE_TERRAIN_TYPES.has(terrainType) ? 1 : 0;
}
