import { allocateEntityId, getCityAt, getCityById, getTileAt, getUnitAt, getUnitById, isInsideMap, removeUnitById } from "../core/gameState.js";
import { neighbors } from "../core/hexGrid.js";
import { createUnit, getUnitDefinition } from "../core/unitData.js";

export const CITY_MAX_HEALTH = 12;

const FOUND_CITY_REASON_TEXT = {
  "unit-not-found": "Select a settler to found a city.",
  "requires-settler": "Only settlers can found a city.",
  "unit-already-acted": "This settler already acted this turn.",
  "city-already-present": "A city already occupies this tile.",
  "invalid-tile": "City cannot be founded on blocked terrain.",
};

const CITY_FOCUS_ORDER = ["balanced", "food", "production", "science"];
const FOOD_FOCUS_PRIORITY = {
  food: 0,
  balanced: 1,
  production: 2,
  science: 3,
};

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
    growthProgress: 0,
    health: CITY_MAX_HEALTH,
    maxHealth: CITY_MAX_HEALTH,
    queue: ["warrior"],
  });

  assignWorkedHexes(cityId, gameState);
  const cityYield = computeCityYield(cityId, gameState);
  const city = getCityById(gameState, cityId);
  if (city) {
    city.yieldLastTurn = cityYield;
    city.identity = deriveCityIdentity(cityYield);
  }

  removeUnitById(gameState, settler.id);
  gameState.selectedUnitId = null;
  gameState.selectedCityId = cityId;

  return { ok: true, cityId };
}

/**
 * @param {string} cityId
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ ok: boolean, reason?: string, queue?: string[] }}
 */
export function cycleCityQueue(cityId, gameState) {
  const city = getCityById(gameState, cityId);
  if (!city) {
    return { ok: false, reason: "city-not-found" };
  }

  const availableTypes = getAvailableProductionUnits(gameState);
  if (availableTypes.length === 0) {
    return { ok: false, reason: "no-available-production" };
  }

  const current = city.queue[0] ?? availableTypes[0];
  const currentIndex = availableTypes.indexOf(current);
  const nextType = availableTypes[(currentIndex + 1 + availableTypes.length) % availableTypes.length];
  city.queue = [nextType];
  return { ok: true, queue: [...city.queue] };
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

  const currentIndex = CITY_FOCUS_ORDER.indexOf(city.focus);
  const nextFocus = CITY_FOCUS_ORDER[(currentIndex + 1 + CITY_FOCUS_ORDER.length) % CITY_FOCUS_ORDER.length];
  city.focus = /** @type {"balanced"|"food"|"production"|"science"} */ (nextFocus);
  assignWorkedHexes(cityId, gameState);
  const cityYield = computeCityYield(cityId, gameState);
  city.yieldLastTurn = cityYield;
  city.identity = deriveCityIdentity(cityYield);
  return { ok: true, focus: city.focus };
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
    assignWorkedHexes(city.id, gameState);
    const cityYield = computeCityYield(city.id, gameState);
    city.yieldLastTurn = cityYield;
    city.identity = deriveCityIdentity(cityYield);
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
      threshold = getGrowthThreshold(city.population);
    }
  }

  for (const city of ownerCities) {
    if (city.queue.length === 0) {
      const defaultType = getAvailableProductionUnits(gameState)[0];
      if (defaultType) {
        city.queue = [defaultType];
      }
    }

    const currentQueueType = city.queue[0];
    if (!currentQueueType) {
      continue;
    }

    const definition = getUnitDefinition(currentQueueType);
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
      type: /** @type {"warrior"|"settler"|"spearman"} */ (currentQueueType),
      q: spawnHex.q,
      r: spawnHex.r,
    });
    unit.hasActed = true;
    unit.movementRemaining = 0;
    gameState.units.push(unit);
    produced.push(unit.id);
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
  return ["warrior", "settler", "spearman"].filter((type) => unlocked.has(type));
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

function getGrowthThreshold(population) {
  return 8 + (Math.max(1, population) - 1) * 4;
}
