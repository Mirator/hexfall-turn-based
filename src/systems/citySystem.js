import { allocateEntityId, getCityAt, getCityById, getTileAt, getUnitAt, getUnitById, isInsideMap, removeUnitById } from "../core/gameState.js";
import { neighbors } from "../core/hexGrid.js";
import { createUnit, getAllUnitTypes, getUnitDefinition } from "../core/unitData.js";

export const CITY_MAX_HEALTH = 12;
export const CITY_QUEUE_MAX = 3;

const FOUND_CITY_REASON_TEXT = {
  "unit-not-found": "Select a settler to found a city.",
  "requires-settler": "Only settlers can found a city.",
  "unit-already-acted": "This settler already acted this turn.",
  "city-already-present": "A city already occupies this tile.",
  "invalid-tile": "City cannot be founded on blocked terrain.",
};

const CITY_FOCUS_ORDER = ["balanced", "food", "production", "science"];
const CITY_PRODUCTION_TAB_ORDER = ["units", "buildings"];
const FOOD_FOCUS_PRIORITY = {
  food: 0,
  balanced: 1,
  production: 2,
  science: 3,
};

const BUILDING_DEFINITIONS = {
  granary: {
    id: "granary",
    productionCost: 9,
    unlockedByDefault: true,
    unlockedByTech: null,
    yields: {
      food: 1,
      production: 0,
      science: 0,
    },
  },
  workshop: {
    id: "workshop",
    productionCost: 10,
    unlockedByDefault: false,
    unlockedByTech: "bronzeWorking",
    yields: {
      food: 0,
      production: 1,
      science: 0,
    },
  },
  monument: {
    id: "monument",
    productionCost: 8,
    unlockedByDefault: false,
    unlockedByTech: "masonry",
    yields: {
      food: 0,
      production: 0,
      science: 1,
    },
  },
};

const BUILDING_ORDER = ["granary", "workshop", "monument"];

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
    focus: "balanced",
    workedHexes: [{ q: settler.q, r: settler.r }],
    yieldLastTurn: createEmptyYield(),
    identity: "balanced",
    specialization: "balanced",
    growthProgress: 0,
    health: CITY_MAX_HEALTH,
    maxHealth: CITY_MAX_HEALTH,
    productionTab: "units",
    buildings: [],
    queue: [createQueueItem("unit", "warrior")],
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
  return { ok: true, queue: cloneQueue(city.queue) };
}

/**
 * @param {string} cityId
 * @param {"balanced"|"food"|"production"|"science"} focus
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ ok: boolean, reason?: string, focus?: string }}
 */
export function setCityFocus(cityId, focus, gameState) {
  const city = getCityById(gameState, cityId);
  if (!city) {
    return { ok: false, reason: "city-not-found" };
  }

  ensureCityEconomyFields(city);

  if (!CITY_FOCUS_ORDER.includes(focus)) {
    return { ok: false, reason: "invalid-focus" };
  }

  city.focus = focus;
  assignWorkedHexes(cityId, gameState);
  const cityYield = computeCityYield(cityId, gameState);
  city.yieldLastTurn = cityYield;
  city.identity = deriveCityIdentity(cityYield);
  city.specialization = deriveCitySpecialization(city.buildings ?? []);
  return { ok: true, focus: city.focus };
}

/**
 * @param {string} cityId
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ ok: boolean, reason?: string, focus?: string }}
 */
export function cycleCityFocus(cityId, gameState) {
  const city = getCityById(gameState, cityId);
  if (!city) {
    return { ok: false, reason: "city-not-found" };
  }

  ensureCityEconomyFields(city);

  const currentIndex = CITY_FOCUS_ORDER.indexOf(city.focus);
  const nextFocus = CITY_FOCUS_ORDER[(currentIndex + 1 + CITY_FOCUS_ORDER.length) % CITY_FOCUS_ORDER.length];
  return setCityFocus(cityId, /** @type {"balanced"|"food"|"production"|"science"} */ (nextFocus), gameState);
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
 * @param {"granary"|"workshop"|"monument"|string} buildingId
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

  const workable = getWorkableHexes(cityId, gameState);
  if (workable.length === 0) {
    city.workedHexes = [];
    return [];
  }

  const cityHex = workable.find((hex) => hex.q === city.q && hex.r === city.r) ?? null;
  const nonCityHexes = workable.filter((hex) => !cityHex || hex.q !== cityHex.q || hex.r !== cityHex.r);
  nonCityHexes.sort((a, b) => compareHexesForFocus(a, b, city.focus, gameState));

  const maxWorked = Math.max(1, city.population);
  const selected = cityHex ? [cityHex] : [];
  const required = Math.max(0, maxWorked - selected.length);
  for (let i = 0; i < required && i < nonCityHexes.length; i += 1) {
    selected.push(nonCityHexes[i]);
  }

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

  const total = createEmptyYield();
  for (const hex of city.workedHexes) {
    const tile = getTileAt(gameState.map, hex.q, hex.r);
    if (!tile || tile.blocksMovement) {
      continue;
    }
    addYield(total, tile.yields);
  }

  addYield(total, getCityBuildingYieldBonus(city));
  return total;
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @param {"player"|"enemy"} owner
 * @returns {{ produced: string[], grew: string[], researchIncome: number }}
 */
export function processTurn(gameState, owner) {
  const produced = [];
  const grew = [];
  const ownerCities = gameState.cities.filter((city) => city.owner === owner).sort((a, b) => a.id.localeCompare(b.id));
  const economyBucket = gameState.economy[owner];
  const aggregatedIncome = createEmptyYield();

  for (const city of ownerCities) {
    ensureCityEconomyFields(city);
    assignWorkedHexes(city.id, gameState);
    const cityYield = computeCityYield(city.id, gameState);
    city.yieldLastTurn = cityYield;
    city.identity = deriveCityIdentity(cityYield);
    city.specialization = deriveCitySpecialization(city.buildings ?? []);
    addYield(aggregatedIncome, cityYield);
  }

  economyBucket.lastTurnIncome = { ...aggregatedIncome };
  economyBucket.foodStock += aggregatedIncome.food;
  economyBucket.productionStock += aggregatedIncome.production;
  economyBucket.scienceStock += aggregatedIncome.science;

  const growthOrder = [...ownerCities].sort((a, b) => {
    const focusDelta = FOOD_FOCUS_PRIORITY[a.focus] - FOOD_FOCUS_PRIORITY[b.focus];
    if (focusDelta !== 0) {
      return focusDelta;
    }
    const foodDelta = b.yieldLastTurn.food - a.yieldLastTurn.food;
    if (foodDelta !== 0) {
      return foodDelta;
    }
    return a.id.localeCompare(b.id);
  });

  for (const city of growthOrder) {
    let threshold = getGrowthThreshold(city.population);
    while (economyBucket.foodStock > 0) {
      const needed = threshold - city.growthProgress;
      const spent = Math.min(needed, economyBucket.foodStock);
      city.growthProgress += spent;
      economyBucket.foodStock -= spent;

      if (city.growthProgress < threshold) {
        break;
      }

      city.growthProgress -= threshold;
      city.population += 1;
      grew.push(city.id);
      assignWorkedHexes(city.id, gameState);
      city.yieldLastTurn = computeCityYield(city.id, gameState);
      city.identity = deriveCityIdentity(city.yieldLastTurn);
      city.specialization = deriveCitySpecialization(city.buildings ?? []);
      threshold = getGrowthThreshold(city.population);
    }
  }

  for (const city of ownerCities) {
    const currentQueueItem = normalizeQueueItem(city.queue[0]);
    if (!currentQueueItem) {
      if (city.queue.length > 0) {
        city.queue.shift();
      }
      continue;
    }

    if (currentQueueItem.kind === "unit") {
      const definition = getUnitDefinition(/** @type {any} */ (currentQueueItem.id));
      if (!definition) {
        city.queue.shift();
        continue;
      }

      if (economyBucket.productionStock < definition.productionCost) {
        continue;
      }

      const spawnHex = findSpawnHex(city, gameState);
      if (!spawnHex) {
        continue;
      }

      economyBucket.productionStock -= definition.productionCost;
      const newUnitId = allocateEntityId(gameState, "unit", owner);
      const unit = createUnit({
        id: newUnitId,
        owner,
        type: /** @type {any} */ (currentQueueItem.id),
        q: spawnHex.q,
        r: spawnHex.r,
      });
      unit.hasActed = true;
      unit.movementRemaining = 0;
      gameState.units.push(unit);
      produced.push(unit.id);
      city.queue.shift();
    } else {
      const buildingDefinition = BUILDING_DEFINITIONS[currentQueueItem.id];
      if (!buildingDefinition) {
        city.queue.shift();
        continue;
      }

      if ((city.buildings ?? []).includes(currentQueueItem.id)) {
        city.queue.shift();
        continue;
      }

      if (economyBucket.productionStock < buildingDefinition.productionCost) {
        continue;
      }

      economyBucket.productionStock -= buildingDefinition.productionCost;
      city.buildings.push(currentQueueItem.id);
      city.specialization = deriveCitySpecialization(city.buildings ?? []);
      city.queue.shift();
      city.yieldLastTurn = computeCityYield(city.id, gameState);
      city.identity = deriveCityIdentity(city.yieldLastTurn);
      produced.push(`${city.id}:building:${currentQueueItem.id}`);
    }
  }

  return {
    produced,
    grew,
    researchIncome: aggregatedIncome.science,
  };
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
 * @returns {Array<"granary"|"workshop"|"monument">}
 */
export function getAvailableProductionBuildings(gameState) {
  return /** @type {Array<"granary"|"workshop"|"monument">} */ (
    BUILDING_ORDER.filter((buildingId) => isBuildingUnlocked(buildingId, gameState))
  );
}

/**
 * @param {"granary"|"workshop"|"monument"} buildingId
 * @returns {{ id: string, productionCost: number, unlockedByDefault: boolean, unlockedByTech: string|null, yields: import("../core/types.js").YieldBundle } | null}
 */
export function getBuildingDefinition(buildingId) {
  return BUILDING_DEFINITIONS[buildingId] ?? null;
}

/**
 * @returns {Array<"granary"|"workshop"|"monument">}
 */
export function getAllProductionBuildings() {
  return /** @type {Array<"granary"|"workshop"|"monument">} */ ([...BUILDING_ORDER]);
}

/**
 * @param {"granary"|"workshop"|"monument"} buildingId
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

function compareHexesForFocus(a, b, focus, gameState) {
  const tileA = getTileAt(gameState.map, a.q, a.r);
  const tileB = getTileAt(gameState.map, b.q, b.r);
  const yieldsA = tileA?.yields ?? createEmptyYield();
  const yieldsB = tileB?.yields ?? createEmptyYield();
  const valuesA = toFocusSortValues(yieldsA, focus);
  const valuesB = toFocusSortValues(yieldsB, focus);

  for (let i = 0; i < valuesA.length; i += 1) {
    if (valuesA[i] !== valuesB[i]) {
      return valuesB[i] - valuesA[i];
    }
  }

  return a.q - b.q || a.r - b.r;
}

function toFocusSortValues(yields, focus) {
  if (focus === "food") {
    return [yields.food, yields.production, yields.science];
  }
  if (focus === "production") {
    return [yields.production, yields.food, yields.science];
  }
  if (focus === "science") {
    return [yields.science, yields.production, yields.food];
  }
  return [yields.food + yields.production + yields.science, yields.food, yields.production, yields.science];
}

function ensureCityEconomyFields(city) {
  if (!CITY_FOCUS_ORDER.includes(city.focus)) {
    city.focus = "balanced";
  }

  if (!Array.isArray(city.workedHexes)) {
    city.workedHexes = [];
  }

  if (!city.yieldLastTurn) {
    city.yieldLastTurn = createEmptyYield();
  }

  if (!Array.isArray(city.buildings)) {
    city.buildings = [];
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
    addYield(yields, definition.yields);
  }
  return yields;
}

function addYield(target, source) {
  target.food += source.food;
  target.production += source.production;
  target.science += source.science;
}

function createEmptyYield() {
  return {
    food: 0,
    production: 0,
    science: 0,
  };
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
  if (set.has("monument")) {
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
