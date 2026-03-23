/**
 * @typedef {Object} Hex
 * @property {number} q
 * @property {number} r
 */

/**
 * @typedef {Object} Unit
 * @property {string} id
 * @property {string} owner
 * @property {number} q
 * @property {number} r
 * @property {number} movementRemaining
 * @property {number} maxMovement
 */

/**
 * @typedef {Object} TurnState
 * @property {number} turn
 * @property {"player"} phase
 */

/**
 * @typedef {Object} GameState
 * @property {TurnState} turnState
 * @property {{ width: number, height: number }} map
 * @property {Unit[]} units
 * @property {string|null} selectedUnitId
 */

export {};
