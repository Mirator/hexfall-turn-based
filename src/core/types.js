/**
 * @typedef {Object} Hex
 * @property {number} q
 * @property {number} r
 */

/**
 * @typedef {Object} Tile
 * @property {number} q
 * @property {number} r
 * @property {"plains"|"forest"|"hill"|"mountain"|"water"} terrainType
 * @property {number} moveCost
 * @property {boolean} blocksMovement
 */

/**
 * @typedef {Object} Unit
 * @property {string} id
 * @property {"player"|"enemy"} owner
 * @property {"warrior"|"settler"|"spearman"} type
 * @property {number} q
 * @property {number} r
 * @property {number} health
 * @property {number} maxHealth
 * @property {number} attack
 * @property {number} attackRange
 * @property {number} movementRemaining
 * @property {number} maxMovement
 * @property {boolean} hasActed
 */

/**
 * @typedef {Object} City
 * @property {string} id
 * @property {"player"|"enemy"} owner
 * @property {number} q
 * @property {number} r
 * @property {number} population
 * @property {number} productionPerTurn
 * @property {number} storedProduction
 * @property {string[]} queue
 */

/**
 * @typedef {Object} TurnState
 * @property {number} turn
 * @property {"player"|"enemy"} phase
 */

/**
 * @typedef {Object} ResearchState
 * @property {string|null} activeTechId
 * @property {number} progress
 * @property {string[]} completedTechIds
 */

/**
 * @typedef {Object} MatchState
 * @property {"ongoing"|"won"|"lost"} status
 * @property {string|null} reason
 * @property {number} holdTurnsTarget
 */

/**
 * @typedef {Object} GameState
 * @property {TurnState} turnState
 * @property {{ width: number, height: number, tiles: Tile[] }} map
 * @property {Unit[]} units
 * @property {City[]} cities
  * @property {string|null} selectedUnitId
 * @property {string|null} selectedCityId
 * @property {ResearchState} research
 * @property {{ units: string[] }} unlocks
 * @property {MatchState} match
 * @property {{ unit: number, city: number }} nextIds
 */

export {};
