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
  const attacker = getUnitById(gameState, attackerId);
  const target = getUnitById(gameState, targetId);
  if (!attacker || !target) {
    return { ok: false, reason: "units-missing" };
  }

  const preview = previewAttack(attackerId, targetId, gameState);
  if (!preview.ok) {
    return preview;
  }

  const breakdown = preview.breakdown;
  const damage = preview.damage;
  if (!breakdown || typeof damage !== "number") {
    return { ok: false, reason: "preview-missing-breakdown" };
  }

  target.health = Math.max(0, target.health - damage);

  attacker.hasActed = true;
  attacker.movementRemaining = 0;

  const targetDefeated = !!preview.targetDefeated;
  if (targetDefeated) {
    removeUnitById(gameState, target.id);
  }

  const counterattack = preview.counterattack ?? { triggered: false };
  let attackerDefeated = false;
  if (counterattack.triggered && typeof counterattack.damage === "number") {
    attacker.health = Math.max(0, attacker.health - counterattack.damage);
    attackerDefeated = attacker.health <= 0;
    if (attackerDefeated) {
      removeUnitById(gameState, attacker.id);
    }
    counterattack.attackerDefeated = attackerDefeated;
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
  const attacker = getUnitById(gameState, attackerId);
  const city = getCityById(gameState, cityId);
  if (!attacker || !city) {
    return { ok: false, reason: "entities-missing" };
  }

  const preview = previewCityAttack(attackerId, cityId, gameState);
  if (!preview.ok) {
    return preview;
  }

  const breakdown = preview.breakdown;
  const damage = preview.damage;
  if (!breakdown || typeof damage !== "number") {
    return { ok: false, reason: "preview-missing-breakdown" };
  }

  city.health = Math.max(0, city.health - damage);
  attacker.hasActed = true;
  attacker.movementRemaining = 0;

  if (!preview.cityDefeated) {
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
 * @param {string} attackerId
 * @param {string} targetId
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{
 *   ok: boolean,
 *   reason?: string,
 *   damage?: number,
 *   targetDefeated?: boolean,
 *   attackerDefeated?: boolean,
 *   targetRemainingHealth?: number,
 *   attackerRemainingHealth?: number,
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
 *     attackerRemainingHealth?: number,
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
export function previewAttack(attackerId, targetId, gameState) {
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
  const targetRemainingHealth = Math.max(0, target.health - damage);
  const targetDefeated = targetRemainingHealth <= 0;
  const counterattack = buildCounterattackPreview(attacker, target, targetDefeated, gameState);
  const attackerRemainingHealth = counterattack.triggered
    ? Math.max(0, attacker.health - (counterattack.damage ?? 0))
    : attacker.health;
  const attackerDefeated = attackerRemainingHealth <= 0;

  if (counterattack.triggered) {
    counterattack.attackerDefeated = attackerDefeated;
    counterattack.attackerRemainingHealth = attackerRemainingHealth;
  }

  return {
    ok: true,
    damage,
    targetDefeated,
    attackerDefeated,
    targetRemainingHealth,
    attackerRemainingHealth,
    breakdown,
    counterattack,
  };
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
 *   cityRemainingHealth?: number,
 *   attackerRemainingHealth?: number,
 *   breakdown?: {
 *     baseAttack: number,
 *     roleBonus: number,
 *     terrainAttackBonus: number,
 *     defenderArmor: number,
 *     terrainDefenseBonus: number,
 *     rawDamage: number,
 *     damage: number
 *   }
 * }}
 */
export function previewCityAttack(attackerId, cityId, gameState) {
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
  const cityRemainingHealth = Math.max(0, city.health - damage);

  return {
    ok: true,
    damage,
    cityDefeated: cityRemainingHealth <= 0,
    cityRemainingHealth,
    attackerRemainingHealth: attacker.health,
    breakdown,
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

function buildCounterattackPreview(attacker, target, targetDefeated, gameState) {
  if (targetDefeated) {
    return {
      triggered: false,
      reason: "target-defeated",
    };
  }

  if (!isTargetInAttackRange(target, attacker)) {
    return {
      triggered: false,
      reason: "out-of-range",
    };
  }

  const breakdown = buildUnitCombatBreakdown(target, attacker, gameState);
  return {
    triggered: true,
    damage: breakdown.damage,
    breakdown,
  };
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
