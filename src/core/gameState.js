import { MAP_HEIGHT, MAP_WIDTH } from "./constants.js";
import { generateTerrainTiles } from "./terrainData.js";
import { DEFAULT_UNLOCKED_UNITS, createUnit } from "./unitData.js";

/**
 * @returns {import("./types.js").GameState}
 */
export function createInitialGameState() {
  return {
    turnState: {
      turn: 1,
      phase: "player",
    },
    map: {
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      tiles: generateTerrainTiles(MAP_WIDTH, MAP_HEIGHT),
    },
    units: [
      createUnit({
        id: "player-1",
        owner: "player",
        type: "warrior",
        q: 2,
        r: 2,
      }),
      createUnit({
        id: "player-2",
        owner: "player",
        type: "settler",
        q: 3,
        r: 3,
      }),
      createUnit({
        id: "enemy-1",
        owner: "enemy",
        type: "warrior",
        q: 4,
        r: 2,
      }),
    ],
    cities: [],
    selectedUnitId: null,
    selectedCityId: null,
    research: {
      activeTechId: null,
      progress: 0,
      completedTechIds: [],
    },
    unlocks: {
      units: [...DEFAULT_UNLOCKED_UNITS],
    },
    match: {
      status: "ongoing",
      reason: null,
      holdTurnsTarget: 7,
    },
    nextIds: {
      unit: 3,
      city: 1,
    },
  };
}

/**
 * @param {{ width: number, height: number }} map
 * @param {number} q
 * @param {number} r
 * @returns {boolean}
 */
export function isInsideMap(map, q, r) {
  return q >= 0 && q < map.width && r >= 0 && r < map.height;
}

/**
 * @param {import("./types.js").GameState} gameState
 * @param {string|null} unitId
 * @returns {import("./types.js").Unit|null}
 */
export function getUnitById(gameState, unitId) {
  if (!unitId) {
    return null;
  }
  return gameState.units.find((unit) => unit.id === unitId) ?? null;
}

/**
 * @param {import("./types.js").GameState} gameState
 * @param {number} q
 * @param {number} r
 * @returns {import("./types.js").Unit|null}
 */
export function getUnitAt(gameState, q, r) {
  return gameState.units.find((unit) => unit.q === q && unit.r === r) ?? null;
}

/**
 * @param {import("./types.js").GameState} gameState
 * @param {string|null} cityId
 * @returns {import("./types.js").City|null}
 */
export function getCityById(gameState, cityId) {
  if (!cityId) {
    return null;
  }
  return gameState.cities.find((city) => city.id === cityId) ?? null;
}

/**
 * @param {import("./types.js").GameState} gameState
 * @param {number} q
 * @param {number} r
 * @returns {import("./types.js").City|null}
 */
export function getCityAt(gameState, q, r) {
  return gameState.cities.find((city) => city.q === q && city.r === r) ?? null;
}

/**
 * @param {{ tiles: import("./types.js").Tile[] }} map
 * @param {number} q
 * @param {number} r
 * @returns {import("./types.js").Tile|null}
 */
export function getTileAt(map, q, r) {
  return map.tiles.find((tile) => tile.q === q && tile.r === r) ?? null;
}

/**
 * @param {import("./types.js").GameState} gameState
 * @param {"unit"|"city"} kind
 * @param {"player"|"enemy"} owner
 * @returns {string}
 */
export function allocateEntityId(gameState, kind, owner) {
  if (kind === "unit") {
    gameState.nextIds.unit += 1;
    return `${owner}-${gameState.nextIds.unit}`;
  }

  gameState.nextIds.city += 1;
  return `${owner}-city-${gameState.nextIds.city}`;
}

/**
 * @param {import("./types.js").GameState} gameState
 * @param {string} unitId
 * @returns {boolean}
 */
export function removeUnitById(gameState, unitId) {
  const beforeCount = gameState.units.length;
  gameState.units = gameState.units.filter((unit) => unit.id !== unitId);
  if (gameState.selectedUnitId === unitId) {
    gameState.selectedUnitId = null;
  }
  return gameState.units.length < beforeCount;
}

/**
 * @param {import("./types.js").GameState} gameState
 * @returns {import("./types.js").GameState}
 */
export function cloneGameState(gameState) {
  return structuredClone(gameState);
}
