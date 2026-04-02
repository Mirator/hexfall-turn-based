import { allocateEntityId, getCityAt, getCityById, getTileAt, getUnitAt, getUnitById, isInsideMap, removeUnitById } from "../core/gameState.js";
import { distance, neighbors } from "../core/hexGrid.js";
import { createUnit, getAllUnitTypes, getUnitDefinition } from "../core/unitData.js";
import { getCityScienceBreakdown } from "./researchSystem.js";

export const CITY_MAX_HEALTH = 12;
export const CITY_QUEUE_MAX = 3;
export const UNIT_GOLD_UPKEEP = 1;
export const BUILDING_GOLD_UPKEEP = 1;
export const RUSH_BUY_MULTIPLIER = 3;

const FOUND_CITY_REASON_TEXT = {
  "unit-not-found": "Select a settler to found a city.",
  "requires-settler": "Only settlers can found a city.",
  "unit-already-acted": "This settler already acted this turn.",
  "unit-disabled": "This settler is disabled by gold deficit.",
  "city-already-present": "A city already occupies this tile.",
  "invalid-tile": "City cannot be founded on blocked terrain.",
};

const CITY_PRODUCTION_TAB_ORDER = ["units", "buildings"];

const BUILDING_DEFINITIONS = {
  granary: {
    id: "granary",
    productionCost: 9,
    goldUpkeep: 1,
    unlockedByDefault: true,
    unlockedByTech: null,
    requiredBuildings: [],
    requiresCampus: false,
    scienceOutput: 0,
    yields: {
      food: 1,
      production: 0,
      gold: 0,
      science: 0,
    },
  },
  workshop: {
    id: "workshop",
    productionCost: 10,
    goldUpkeep: 1,
    unlockedByDefault: false,
    unlockedByTech: "bronzeWorking",
    requiredBuildings: [],
    requiresCampus: false,
    scienceOutput: 0,
    yields: {
      food: 0,
      production: 1,
      gold: 0,
      science: 0,
    },
  },
  monument: {
    id: "monument",
    productionCost: 8,
    goldUpkeep: 1,
    unlockedByDefault: false,
    unlockedByTech: "masonry",
    requiredBuildings: [],
    requiresCampus: false,
    scienceOutput: 0,
    yields: {
      food: 0,
      production: 0,
      gold: 0,
      science: 0,
    },
  },
  campus: {
    id: "campus",
    productionCost: 12,
    goldUpkeep: 1,
    unlockedByDefault: false,
    unlockedByTech: "writing",
    requiredBuildings: [],
    requiresCampus: false,
    scienceOutput: 0,
    yields: {
      food: 0,
      production: 0,
      gold: 0,
      science: 0,
    },
  },
  library: {
    id: "library",
    productionCost: 11,
    goldUpkeep: 1,
    unlockedByDefault: false,
    unlockedByTech: "writing",
    requiredBuildings: ["campus"],
    requiresCampus: true,
    scienceOutput: 2,
    yields: {
      food: 0,
      production: 0,
      gold: 0,
      science: 0,
    },
  },
  university: {
    id: "university",
    productionCost: 16,
    goldUpkeep: 1,
    unlockedByDefault: false,
    unlockedByTech: "education",
    requiredBuildings: ["library"],
    requiresCampus: true,
    scienceOutput: 4,
    yields: {
      food: 0,
      production: 0,
      gold: 0,
      science: 0,
    },
  },
  researchLab: {
    id: "researchLab",
    productionCost: 18,
    goldUpkeep: 1,
    unlockedByDefault: false,
    unlockedByTech: "chemistry",
    requiredBuildings: ["university"],
    requiresCampus: true,
    scienceOutput: 5,
    yields: {
      food: 0,
      production: 0,
      gold: 0,
      science: 0,
    },
  },
};

const BUILDING_ORDER = ["granary", "workshop", "monument", "campus", "library", "university", "researchLab"];

/**
 * @typedef {{ kind: "unit"|"building", id: string }} CityQueueItem
 */

/**
 * @param {string} unitId
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ ok: boolean, reason?: string }}
 */
export function canFoundCity(unitId, gameState) {
  const unit = getUnitById(gameState, unitId);
  if (!unit) {
    return { ok: false, reason: "unit-not-found" };
  }

  if (unit.type !== "settler") {
    return { ok: false, reason: "requires-settler" };
  }

  if (unit.hasActed) {
    return { ok: false, reason: "unit-already-acted" };
  }

  if (unit.disabled) {
    return { ok: false, reason: "unit-disabled" };
  }

  if (getCityAt(gameState, unit.q, unit.r)) {
    return { ok: false, reason: "city-already-present" };
  }

  const tile = getTileAt(gameState.map, unit.q, unit.r);
  if (!tile || tile.blocksMovement) {
    return { ok: false, reason: "invalid-tile" };
  }

  return { ok: true };
}

/**
 * @param {string|undefined} reason
 * @returns {string}
 */
export function getFoundCityReasonText(reason) {
  if (!reason) {
    return "Select a settler to found a city.";
  }
  return FOUND_CITY_REASON_TEXT[reason] ?? "Cannot found a city right now.";
}

/**
 * @param {string} unitId
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ ok: boolean, reason?: string, cityId?: string }}
 */
export function foundCity(unitId, gameState) {
  const check = canFoundCity(unitId, gameState);
  if (!check.ok) {
    return check;
  }

  const settler = getUnitById(gameState, unitId);
  if (!settler) {
    return { ok: false, reason: "unit-not-found" };
  }

  const cityId = allocateEntityId(gameState, "city", settler.owner);
  gameState.cities.push({
    id: cityId,
    owner: settler.owner,
    q: settler.q,
    r: settler.r,
    population: 1,
    workedHexes: [{ q: settler.q, r: settler.r }],
    yieldLastTurn: createEmptyYield(),
    identity: "balanced",
    specialization: "balanced",
    growthProgress: 0,
    productionProgress: 0,
    health: CITY_MAX_HEALTH,
    maxHealth: CITY_MAX_HEALTH,
    productionTab: "units",
    buildings: [],
    campus: createDefaultCampusState(),
    queue: [],
  });

  assignWorkedHexes(cityId, gameState);
  const cityYield = computeCityYield(cityId, gameState);
  const city = getCityById(gameState, cityId);
  if (city) {
    city.yieldLastTurn = cityYield;
    city.identity = deriveCityIdentity(cityYield);
    city.specialization = deriveCitySpecialization(city.buildings ?? []);
  }

  removeUnitById(gameState, settler.id);
  gameState.selectedUnitId = null;
  gameState.selectedCityId = cityId;

  return { ok: true, cityId };
}

/**
 * @param {string} cityId
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ ok: boolean, reason?: string, queue?: CityQueueItem[] }}
 */
export function cycleCityQueue(cityId, gameState) {
  const city = getCityById(gameState, cityId);
  if (!city) {
    return { ok: false, reason: "city-not-found" };
  }

  ensureCityEconomyFields(city);
  const availableTypes = getAvailableProductionUnits(gameState);
  if (availableTypes.length === 0) {
    return { ok: false, reason: "no-available-production" };
  }

  const currentItem = normalizeQueueItem(city.queue[0]);
  const current = currentItem?.kind === "unit" ? currentItem.id : availableTypes[0];
  const currentIndex = availableTypes.indexOf(current);
  const nextType = availableTypes[(currentIndex + 1 + availableTypes.length) % availableTypes.length];
  city.queue = [createQueueItem("unit", nextType)];
  city.productionProgress = 0;
  return { ok: true, queue: cloneQueue(city.queue) };
}

/**
 * @param {string} cityId
 * @param {"units"|"buildings"} tab
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ ok: boolean, reason?: string, tab?: "units"|"buildings" }}
 */
export function setCityProductionTab(cityId, tab, gameState) {
  const city = getCityById(gameState, cityId);
  if (!city) {
    return { ok: false, reason: "city-not-found" };
  }

  if (!CITY_PRODUCTION_TAB_ORDER.includes(tab)) {
    return { ok: false, reason: "invalid-tab" };
  }

  ensureCityEconomyFields(city);
  city.productionTab = tab;
  return { ok: true, tab };
}

/**
 * @param {string} cityId
 * @param {"warrior"|"settler"|"spearman"|"archer"|string} unitType
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ ok: boolean, reason?: string, queue?: CityQueueItem[] }}
 */
export function enqueueCityQueue(cityId, unitType, gameState) {
  return enqueueCityQueueItem(cityId, createQueueItem("unit", unitType), gameState);
}

/**
 * @param {string} cityId
 * @param {"granary"|"workshop"|"monument"|"campus"|"library"|"university"|"researchLab"|string} buildingId
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ ok: boolean, reason?: string, queue?: CityQueueItem[] }}
 */
export function enqueueCityBuilding(cityId, buildingId, gameState) {
  return enqueueCityQueueItem(cityId, createQueueItem("building", buildingId), gameState);
}

/**
 * @param {string} cityId
 * @param {CityQueueItem} queueItem
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ ok: boolean, reason?: string, queue?: CityQueueItem[] }}
 */
export function enqueueCityQueueItem(cityId, queueItem, gameState) {
  const city = getCityById(gameState, cityId);
  if (!city) {
    return { ok: false, reason: "city-not-found" };
  }

  ensureCityEconomyFields(city);

  const normalized = normalizeQueueItem(queueItem);
  if (!normalized) {
    return { ok: false, reason: "invalid-queue-item" };
  }

  if (city.queue.length >= CITY_QUEUE_MAX) {
    return { ok: false, reason: "queue-full" };
  }

  if (normalized.kind === "unit") {
    if (!getAllUnitTypes().includes(normalized.id)) {
      return { ok: false, reason: "invalid-unit-type" };
    }

    const availableTypes = getAvailableProductionUnits(gameState);
    if (!availableTypes.includes(normalized.id)) {
      return { ok: false, reason: "unit-not-unlocked" };
    }

    city.queue.push(normalized);
    return { ok: true, queue: cloneQueue(city.queue) };
  }

  const definition = BUILDING_DEFINITIONS[normalized.id];
  if (!definition) {
    return { ok: false, reason: "invalid-building-id" };
  }

  if (!isBuildingUnlocked(normalized.id, gameState)) {
    return { ok: false, reason: "building-not-unlocked" };
  }

  const requirementCheck = canBuildBuildingInCity(city, normalized.id);
  if (!requirementCheck.ok) {
    return { ok: false, reason: requirementCheck.reason };
  }

  if ((city.buildings ?? []).includes(normalized.id)) {
    return { ok: false, reason: "building-already-built" };
  }

  if (city.queue.some((item) => item.kind === "building" && item.id === normalized.id)) {
    return { ok: false, reason: "building-already-queued" };
  }

  city.queue.push(normalized);
  return { ok: true, queue: cloneQueue(city.queue) };
}

/**
 * @param {string} cityId
 * @param {number} index
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ ok: boolean, reason?: string, queue?: CityQueueItem[] }}
 */
export function removeCityQueueAt(cityId, index, gameState) {
  const city = getCityById(gameState, cityId);
  if (!city) {
    return { ok: false, reason: "city-not-found" };
  }

  ensureCityEconomyFields(city);

  if (!Number.isInteger(index) || index < 0 || index >= city.queue.length) {
    return { ok: false, reason: "queue-index-invalid" };
  }

  city.queue.splice(index, 1);
  if (index === 0) {
    city.productionProgress = 0;
  }
  if (city.queue.length === 0) {
    city.productionProgress = 0;
  }
  return { ok: true, queue: cloneQueue(city.queue) };
}

/**
 * @param {string} cityId
 * @param {number} index
 * @param {"up"|"down"} direction
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ ok: boolean, reason?: string, queue?: CityQueueItem[] }}
 */
export function moveCityQueueItem(cityId, index, direction, gameState) {
  const city = getCityById(gameState, cityId);
  if (!city) {
    return { ok: false, reason: "city-not-found" };
  }

  ensureCityEconomyFields(city);
  if (!Number.isInteger(index) || index < 0 || index >= city.queue.length) {
    return { ok: false, reason: "queue-index-invalid" };
  }

  if (direction !== "up" && direction !== "down") {
    return { ok: false, reason: "queue-move-direction-invalid" };
  }

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= city.queue.length) {
    return { ok: false, reason: "queue-move-out-of-range" };
  }

  const reordered = [...city.queue];
  const current = reordered[index];
  reordered[index] = reordered[targetIndex];
  reordered[targetIndex] = current;
  city.queue = reordered;
  if (index === 0 || targetIndex === 0) {
    city.productionProgress = 0;
  }
  return { ok: true, queue: cloneQueue(city.queue) };
}

/**
 * @param {string} cityId
 * @param {import("../core/types.js").GameState} gameState
 * @returns {import("../core/types.js").Hex[]}
 */
export function getWorkableHexes(cityId, gameState) {
  const city = getCityById(gameState, cityId);
  if (!city) {
    return [];
  }

  const candidates = [{ q: city.q, r: city.r }, ...neighbors(city)];
  const workable = [];

  for (const hex of candidates) {
    if (!isInsideMap(gameState.map, hex.q, hex.r)) {
      continue;
    }
    const tile = getTileAt(gameState.map, hex.q, hex.r);
    if (!tile || tile.blocksMovement) {
      continue;
    }
    workable.push({ q: hex.q, r: hex.r });
  }

  return workable.sort((a, b) => a.q - b.q || a.r - b.r);
}

/**
 * @param {string} cityId
 * @param {import("../core/types.js").GameState} gameState
 * @returns {import("../core/types.js").Hex[]}
 */
export function assignWorkedHexes(cityId, gameState) {
  const city = getCityById(gameState, cityId);
  if (!city) {
    return [];
  }

  ensureCityEconomyFields(city);
  const selected = computeWorkedHexes(city, gameState);
  city.workedHexes = selected;
  return [...selected];
}

/**
 * @param {string} cityId
 * @param {import("../core/types.js").GameState} gameState
 * @returns {import("../core/types.js").YieldBundle}
 */
export function computeCityYield(cityId, gameState) {
  const city = getCityById(gameState, cityId);
  if (!city) {
    return createEmptyYield();
  }

  ensureCityEconomyFields(city);

  if (!city.workedHexes || city.workedHexes.length === 0) {
    assignWorkedHexes(cityId, gameState);
  }

  return computeCityYieldForWorkedHexes(city, city.workedHexes, gameState);
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @param {import("../core/types.js").Owner} owner
 * @returns {{ produced: string[], grew: string[], researchIncome: number, output: import("../core/types.js").YieldBundle }}
 */
export function processTurn(gameState, owner) {
  const produced = [];
  const grew = [];
  const ownerCities = gameState.cities.filter((city) => city.owner === owner).sort((a, b) => a.id.localeCompare(b.id));
  const economyBucket = gameState.economy[owner];
  const aggregatedOutput = createEmptyYield();

  if (!economyBucket) {
    return {
      produced,
      grew,
      researchIncome: 0,
      output: aggregatedOutput,
    };
  }

  for (const city of ownerCities) {
    ensureCityEconomyFields(city);
    assignWorkedHexes(city.id, gameState);
    const cityYield = computeCityYield(city.id, gameState);
    addYield(aggregatedOutput, cityYield);

    city.growthProgress += Math.max(0, cityYield.food);
    let growthThreshold = getGrowthThreshold(city.population);
    while (city.growthProgress >= growthThreshold) {
      city.growthProgress -= growthThreshold;
      city.population += 1;
      grew.push(city.id);
      growthThreshold = getGrowthThreshold(city.population);
      assignWorkedHexes(city.id, gameState);
    }

    applyCityProductionProgress(city, owner, Math.max(0, cityYield.production), gameState, produced);
    city.yieldLastTurn = computeCityYield(city.id, gameState);
    city.identity = deriveCityIdentity(city.yieldLastTurn);
    city.specialization = deriveCitySpecialization(city.buildings ?? []);
  }

  applyOwnerGoldEconomy(owner, gameState, aggregatedOutput);

  return {
    produced,
    grew,
    researchIncome: aggregatedOutput.science,
    output: aggregatedOutput,
  };
}

/**
 * @param {string} cityId
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ ok: boolean, reason?: string, goldCost?: number, remainingProduction?: number }}
 */
export function canRushBuyCityQueueFront(cityId, gameState) {
  const city = getCityById(gameState, cityId);
  if (!city) {
    return { ok: false, reason: "city-not-found" };
  }

  ensureCityEconomyFields(city);
  const queueItem = normalizeQueueItem(city.queue[0]);
  if (!queueItem) {
    return { ok: false, reason: "queue-empty" };
  }

  const productionCost = getQueueItemProductionCost(queueItem, city, gameState);
  if (!Number.isFinite(productionCost) || productionCost <= 0) {
    return { ok: false, reason: "invalid-queue-item" };
  }

  if (queueItem.kind === "unit" && !findSpawnHex(city, gameState)) {
    return { ok: false, reason: "no-spawn-hex" };
  }

  const remainingProduction = Math.max(0, productionCost - city.productionProgress);
  const goldCost = remainingProduction * RUSH_BUY_MULTIPLIER;
  const economyBucket = gameState.economy[city.owner];
  if (!economyBucket) {
    return { ok: false, reason: "economy-not-found" };
  }
  if (economyBucket.goldBalance < goldCost) {
    return { ok: false, reason: "not-enough-gold", goldCost, remainingProduction };
  }

  return { ok: true, goldCost, remainingProduction };
}

/**
 * @param {string} cityId
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ ok: boolean, reason?: string, produced?: string[], goldCost?: number, remainingProduction?: number }}
 */
export function rushBuyCityQueueFront(cityId, gameState) {
  const check = canRushBuyCityQueueFront(cityId, gameState);
  if (!check.ok) {
    return check;
  }

  const city = getCityById(gameState, cityId);
  if (!city) {
    return { ok: false, reason: "city-not-found" };
  }
  const economyBucket = gameState.economy[city.owner];
  if (!economyBucket) {
    return { ok: false, reason: "economy-not-found" };
  }

  const goldCost = check.goldCost ?? 0;
  const remainingProduction = check.remainingProduction ?? 0;
  economyBucket.goldBalance -= goldCost;
  city.productionProgress += remainingProduction;

  /** @type {string[]} */
  const produced = [];
  applyCityProductionProgress(city, city.owner, 0, gameState, produced);

  return {
    ok: true,
    produced,
    goldCost,
    remainingProduction,
  };
}

function applyCityProductionProgress(city, owner, productionIncome, gameState, produced) {
  city.productionProgress += Math.max(0, productionIncome);

  let guard = 0;
  while (city.queue.length > 0 && guard < 20) {
    guard += 1;
    const queueItem = normalizeQueueItem(city.queue[0]);
    if (!queueItem) {
      city.queue.shift();
      continue;
    }

    const productionCost = getQueueItemProductionCost(queueItem, city, gameState);
    if (!Number.isFinite(productionCost) || productionCost <= 0) {
      city.queue.shift();
      continue;
    }

    if (city.productionProgress < productionCost) {
      break;
    }

    if (queueItem.kind === "unit") {
      const spawnHex = findSpawnHex(city, gameState);
      if (!spawnHex) {
        break;
      }

      const newUnitId = allocateEntityId(gameState, "unit", owner);
      const unit = createUnit({
        id: newUnitId,
        owner,
        type: /** @type {any} */ (queueItem.id),
        q: spawnHex.q,
        r: spawnHex.r,
      });
      unit.hasActed = true;
      unit.movementRemaining = 0;
      gameState.units.push(unit);
      produced.push(unit.id);
    } else {
      const requirementCheck = canBuildBuildingInCity(city, queueItem.id);
      if (!requirementCheck.ok) {
        break;
      }
      if ((city.buildings ?? []).includes(queueItem.id)) {
        city.queue.shift();
        continue;
      }

      city.buildings.push(queueItem.id);
      if (queueItem.id === "campus") {
        city.campus = computeCampusSnapshot(city, gameState);
      }
      produced.push(`${city.id}:building:${queueItem.id}`);
    }

    city.productionProgress = Math.max(0, city.productionProgress - productionCost);
    city.queue.shift();
    if (city.queue.length === 0) {
      city.productionProgress = 0;
    }
  }
}

function getQueueItemProductionCost(queueItem, city, gameState) {
  if (queueItem.kind === "unit") {
    const definition = getUnitDefinition(/** @type {any} */ (queueItem.id));
    return definition?.productionCost ?? 0;
  }

  const buildingDefinition = BUILDING_DEFINITIONS[queueItem.id];
  if (!buildingDefinition) {
    return 0;
  }
  if (!isBuildingUnlocked(queueItem.id, gameState)) {
    return 0;
  }
  if ((city.buildings ?? []).includes(queueItem.id)) {
    return 0;
  }
  return buildingDefinition.productionCost;
}

function applyOwnerGoldEconomy(owner, gameState, aggregatedOutput) {
  const economyBucket = gameState.economy[owner];
  if (!economyBucket) {
    return;
  }

  const income = Math.max(0, aggregatedOutput.gold);
  const ownerUnits = gameState.units
    .filter((unit) => unit.owner === owner && unit.health > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
  const ownerCities = gameState.cities.filter((city) => city.owner === owner);

  const baseUnitUpkeep = ownerUnits.reduce((sum, unit) => {
    const upkeep = getUnitDefinition(unit.type)?.goldUpkeep ?? UNIT_GOLD_UPKEEP;
    return sum + upkeep;
  }, 0);
  const buildingUpkeep = ownerCities.reduce((sum, city) => {
    let cityUpkeep = 0;
    for (const buildingId of city.buildings ?? []) {
      cityUpkeep += BUILDING_DEFINITIONS[buildingId]?.goldUpkeep ?? BUILDING_GOLD_UPKEEP;
    }
    return sum + cityUpkeep;
  }, 0);

  const availableBeforeUpkeep = economyBucket.goldBalance + income;
  let payableUpkeep = baseUnitUpkeep + buildingUpkeep;

  /** @type {string[]} */
  const disabledUnitIds = [];
  for (let index = ownerUnits.length - 1; index >= 0 && availableBeforeUpkeep < payableUpkeep; index -= 1) {
    const unit = ownerUnits[index];
    const upkeep = getUnitDefinition(unit.type)?.goldUpkeep ?? UNIT_GOLD_UPKEEP;
    payableUpkeep = Math.max(buildingUpkeep, payableUpkeep - upkeep);
    disabledUnitIds.push(unit.id);
  }

  const net = income - payableUpkeep;
  economyBucket.goldIncomeLastTurn = income;
  economyBucket.goldUpkeepLastTurn = payableUpkeep;
  economyBucket.goldNetLastTurn = net;
  economyBucket.goldBalance += net;
  economyBucket.outputLastTurn = {
    food: aggregatedOutput.food,
    production: aggregatedOutput.production,
    gold: aggregatedOutput.gold,
  };
  economyBucket.sciencePerTurn = aggregatedOutput.science;
  economyBucket.disabledUnitIds = [...disabledUnitIds].sort();

  const disabledSet = new Set(economyBucket.disabledUnitIds);
  for (const unit of ownerUnits) {
    const disabled = disabledSet.has(unit.id);
    unit.disabled = disabled;
    if (disabled) {
      unit.hasActed = true;
      unit.movementRemaining = 0;
    }
  }
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @returns {string[]}
 */
export function getAvailableProductionUnits(gameState) {
  const unlocked = new Set(gameState.unlocks.units);
  return getAllUnitTypes().filter((type) => unlocked.has(type));
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @returns {Array<"granary"|"workshop"|"monument"|"campus"|"library"|"university"|"researchLab">}
 */
export function getAvailableProductionBuildings(gameState) {
  return /** @type {Array<"granary"|"workshop"|"monument"|"campus"|"library"|"university"|"researchLab">} */ (
    BUILDING_ORDER.filter((buildingId) => isBuildingUnlocked(buildingId, gameState))
  );
}

/**
 * @param {"granary"|"workshop"|"monument"|"campus"|"library"|"university"|"researchLab"} buildingId
 * @returns {{ id: string, productionCost: number, goldUpkeep: number, unlockedByDefault: boolean, unlockedByTech: string|null, yields: import("../core/types.js").YieldBundle } | null}
 */
export function getBuildingDefinition(buildingId) {
  return BUILDING_DEFINITIONS[buildingId] ?? null;
}

/**
 * @returns {Array<"granary"|"workshop"|"monument"|"campus"|"library"|"university"|"researchLab">}
 */
export function getAllProductionBuildings() {
  return /** @type {Array<"granary"|"workshop"|"monument"|"campus"|"library"|"university"|"researchLab">} */ ([...BUILDING_ORDER]);
}

/**
 * @param {"granary"|"workshop"|"monument"|"campus"|"library"|"university"|"researchLab"} buildingId
 * @param {import("../core/types.js").GameState} gameState
 * @returns {boolean}
 */
export function isBuildingUnlocked(buildingId, gameState) {
  const definition = BUILDING_DEFINITIONS[buildingId];
  if (!definition) {
    return false;
  }
  if (definition.unlockedByDefault) {
    return true;
  }
  if (!definition.unlockedByTech) {
    return true;
  }
  return gameState.research.completedTechIds.includes(definition.unlockedByTech);
}

function canBuildBuildingInCity(city, buildingId) {
  const definition = BUILDING_DEFINITIONS[buildingId];
  if (!definition) {
    return { ok: false, reason: "invalid-building-id" };
  }
  const builtSet = new Set(city.buildings ?? []);
  if (definition.requiresCampus && !builtSet.has("campus")) {
    return { ok: false, reason: "building-requires-campus" };
  }
  for (const requiredBuilding of definition.requiredBuildings ?? []) {
    if (!builtSet.has(requiredBuilding)) {
      return { ok: false, reason: "building-missing-prerequisite" };
    }
  }
  return { ok: true };
}

function createDefaultCampusState() {
  return {
    built: false,
    adjacency: 0,
    adjacencyBreakdown: {
      mountains: 0,
      forests: 0,
      nearbyCampuses: 0,
    },
  };
}

function computeCampusSnapshot(city, gameState) {
  let mountains = 0;
  let forests = 0;
  for (const hex of neighbors(city)) {
    const tile = getTileAt(gameState.map, hex.q, hex.r);
    if (!tile) {
      continue;
    }
    if (tile.terrainType === "mountain") {
      mountains += 1;
    }
    if (tile.terrainType === "forest") {
      forests += 1;
    }
  }

  const nearbyCampuses = gameState.cities.filter((candidate) => {
    if (candidate.id === city.id || candidate.owner !== city.owner) {
      return false;
    }
    if (!(candidate.campus?.built || (candidate.buildings ?? []).includes("campus"))) {
      return false;
    }
    return distance(candidate, city) <= 2;
  }).length;

  const adjacency = roundToTenths(mountains + forests * 0.5 + nearbyCampuses * 0.5);
  return {
    built: true,
    adjacency,
    adjacencyBreakdown: {
      mountains,
      forests,
      nearbyCampuses,
    },
  };
}

function findSpawnHex(city, gameState) {
  const candidateHexes = neighbors(city)
    .concat([{ q: city.q, r: city.r }])
    .sort((a, b) => a.q - b.q || a.r - b.r);

  for (const hex of candidateHexes) {
    const tile = getTileAt(gameState.map, hex.q, hex.r);
    if (!tile || tile.blocksMovement) {
      continue;
    }
    if (getCityAt(gameState, hex.q, hex.r)) {
      continue;
    }
    if (getUnitAt(gameState, hex.q, hex.r)) {
      continue;
    }
    return hex;
  }

  return null;
}

function computeWorkedHexes(city, gameState) {
  const workable = getWorkableHexes(city.id, gameState);
  if (workable.length === 0) {
    return [];
  }

  const cityHex = workable.find((hex) => hex.q === city.q && hex.r === city.r) ?? null;
  const nonCityHexes = workable.filter((hex) => !cityHex || hex.q !== cityHex.q || hex.r !== cityHex.r);
  nonCityHexes.sort((a, b) => compareHexesForWorkedPriority(a, b, gameState));

  const maxWorked = Math.max(1, city.population);
  const selected = cityHex ? [cityHex] : [];
  const required = Math.max(0, maxWorked - selected.length);
  for (let i = 0; i < required && i < nonCityHexes.length; i += 1) {
    selected.push(nonCityHexes[i]);
  }
  return selected;
}

function computeCityYieldForWorkedHexes(city, workedHexes, gameState) {
  const total = createEmptyYield();
  for (const hex of workedHexes) {
    const tile = getTileAt(gameState.map, hex.q, hex.r);
    if (!tile || tile.blocksMovement) {
      continue;
    }
    total.food += tile.yields.food;
    total.production += tile.yields.production;
    total.gold += tile.yields.gold ?? 0;
  }
  addYield(total, getCityBuildingYieldBonus(city));
  total.science = getCityScienceBreakdown(city, gameState).totalScience;
  return total;
}

function compareHexesForWorkedPriority(a, b, gameState) {
  const tileA = getTileAt(gameState.map, a.q, a.r);
  const tileB = getTileAt(gameState.map, b.q, b.r);
  const yieldsA = tileA?.yields ?? createEmptyYield();
  const yieldsB = tileB?.yields ?? createEmptyYield();
  const totalA = yieldsA.food + yieldsA.production + (yieldsA.gold ?? 0);
  const totalB = yieldsB.food + yieldsB.production + (yieldsB.gold ?? 0);
  if (totalA !== totalB) {
    return totalB - totalA;
  }
  if (yieldsA.food !== yieldsB.food) {
    return yieldsB.food - yieldsA.food;
  }
  if (yieldsA.production !== yieldsB.production) {
    return yieldsB.production - yieldsA.production;
  }
  if ((yieldsA.gold ?? 0) !== (yieldsB.gold ?? 0)) {
    return (yieldsB.gold ?? 0) - (yieldsA.gold ?? 0);
  }

  return a.q - b.q || a.r - b.r;
}

function ensureCityEconomyFields(city) {
  if (!Array.isArray(city.workedHexes)) {
    city.workedHexes = [];
  }

  if (!city.yieldLastTurn) {
    city.yieldLastTurn = createEmptyYield();
  }

  if (!Array.isArray(city.buildings)) {
    city.buildings = [];
  }

  if (!city.campus || typeof city.campus !== "object") {
    city.campus = createDefaultCampusState();
  } else {
    city.campus.built = !!city.campus.built;
    if (!Number.isFinite(city.campus.adjacency)) {
      city.campus.adjacency = 0;
    }
    if (!city.campus.adjacencyBreakdown || typeof city.campus.adjacencyBreakdown !== "object") {
      city.campus.adjacencyBreakdown = createDefaultCampusState().adjacencyBreakdown;
    }
  }

  if ((city.buildings ?? []).includes("campus")) {
    city.campus.built = true;
  }

  if (!CITY_PRODUCTION_TAB_ORDER.includes(city.productionTab)) {
    city.productionTab = "units";
  }

  city.queue = normalizeQueueArray(city.queue);
  if (city.queue.length > CITY_QUEUE_MAX) {
    city.queue = city.queue.slice(0, CITY_QUEUE_MAX);
  }

  if (!city.specialization) {
    city.specialization = deriveCitySpecialization(city.buildings);
  }

  if (!Number.isFinite(city.productionProgress)) {
    city.productionProgress = 0;
  }
  if (city.productionProgress < 0) {
    city.productionProgress = 0;
  }
  if (city.queue.length === 0) {
    city.productionProgress = 0;
  }
}

/**
 * @param {unknown} value
 * @returns {CityQueueItem[]}
 */
function normalizeQueueArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  /** @type {CityQueueItem[]} */
  const normalized = [];
  for (const item of value) {
    const queueItem = normalizeQueueItem(item);
    if (queueItem) {
      normalized.push(queueItem);
    }
  }
  return normalized;
}

/**
 * @param {unknown} value
 * @returns {CityQueueItem|null}
 */
function normalizeQueueItem(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return getAllUnitTypes().includes(value) ? createQueueItem("unit", value) : null;
  }

  if (typeof value !== "object") {
    return null;
  }

  const maybeKind = /** @type {{ kind?: unknown, id?: unknown }} */ (value).kind;
  const maybeId = /** @type {{ kind?: unknown, id?: unknown }} */ (value).id;
  if ((maybeKind !== "unit" && maybeKind !== "building") || typeof maybeId !== "string" || !maybeId) {
    return null;
  }

  return createQueueItem(maybeKind, maybeId);
}

/**
 * @param {"unit"|"building"} kind
 * @param {string} id
 * @returns {CityQueueItem}
 */
function createQueueItem(kind, id) {
  return { kind, id };
}

/**
 * @param {CityQueueItem[]} queue
 * @returns {CityQueueItem[]}
 */
function cloneQueue(queue) {
  return queue.map((item) => ({ ...item }));
}

/**
 * @param {{ buildings?: string[] }} city
 * @returns {import("../core/types.js").YieldBundle}
 */
function getCityBuildingYieldBonus(city) {
  const yields = createEmptyYield();
  for (const buildingId of city.buildings ?? []) {
    const definition = BUILDING_DEFINITIONS[buildingId];
    if (!definition) {
      continue;
    }
    yields.food += definition.yields.food;
    yields.production += definition.yields.production;
    yields.gold += definition.yields.gold ?? 0;
  }
  return yields;
}

function addYield(target, source) {
  target.food += source.food;
  target.production += source.production;
  target.gold += source.gold ?? 0;
  target.science += source.science;
}

function createEmptyYield() {
  return {
    food: 0,
    production: 0,
    gold: 0,
    science: 0,
  };
}

function roundToTenths(value) {
  return Math.round(value * 10) / 10;
}

function deriveCityIdentity(cityYield) {
  if (cityYield.food > cityYield.production && cityYield.food > cityYield.science) {
    return "agricultural";
  }
  if (cityYield.production > cityYield.food && cityYield.production > cityYield.science) {
    return "industrial";
  }
  if (cityYield.science > cityYield.food && cityYield.science > cityYield.production) {
    return "scholarly";
  }
  return "balanced";
}

function deriveCitySpecialization(buildings) {
  const set = new Set(buildings ?? []);
  if (set.has("campus") || set.has("library") || set.has("university") || set.has("researchLab") || set.has("monument")) {
    return "scholarly";
  }
  if (set.has("workshop")) {
    return "industrial";
  }
  if (set.has("granary")) {
    return "agricultural";
  }
  return "balanced";
}

function getGrowthThreshold(population) {
  return 8 + (Math.max(1, population) - 1) * 4;
}
