import { allocateEntityId, getCityAt, getCityById, getTileAt, getUnitAt, getUnitById, removeUnitById } from "../core/gameState.js";
import { neighbors } from "../core/hexGrid.js";
import { createUnit, getUnitDefinition } from "../core/unitData.js";

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
    productionPerTurn: 2,
    storedProduction: 0,
    queue: ["warrior"],
  });

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
 * @param {import("../core/types.js").GameState} gameState
 * @param {"player"|"enemy"} owner
 * @returns {{ produced: string[] }}
 */
export function processTurn(gameState, owner) {
  const produced = [];
  const ownerCities = gameState.cities.filter((city) => city.owner === owner);

  for (const city of ownerCities) {
    city.storedProduction += city.productionPerTurn;
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
    if (city.storedProduction < definition.productionCost) {
      continue;
    }

    const spawnHex = findSpawnHex(city, gameState);
    if (!spawnHex) {
      continue;
    }

    city.storedProduction -= definition.productionCost;
    const newUnitId = allocateEntityId(gameState, "unit", owner);
    const unit = createUnit({
      id: newUnitId,
      owner,
      type: /** @type {"warrior"|"settler"|"spearman"} */ (currentQueueType),
      q: spawnHex.q,
      r: spawnHex.r,
    });
    // Produced units can act next turn.
    unit.hasActed = true;
    unit.movementRemaining = 0;
    gameState.units.push(unit);
    produced.push(unit.id);
  }

  return { produced };
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
