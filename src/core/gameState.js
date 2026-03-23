import { MAP_HEIGHT, MAP_WIDTH } from "./constants.js";

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
    },
    units: [
      {
        id: "player-1",
        owner: "player",
        q: 2,
        r: 2,
        movementRemaining: 2,
        maxMovement: 2,
      },
    ],
    selectedUnitId: null,
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
 * @returns {import("./types.js").GameState}
 */
export function cloneGameState(gameState) {
  return structuredClone(gameState);
}
