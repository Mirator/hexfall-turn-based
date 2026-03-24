/**
 * @typedef {Object} Hex
 * @property {number} q
 * @property {number} r
 */

/**
 * @typedef {Object} YieldBundle
 * @property {number} food
 * @property {number} production
 * @property {number} science
 */

/**
 * @typedef {Object} Tile
 * @property {number} q
 * @property {number} r
 * @property {"plains"|"forest"|"hill"|"mountain"|"water"} terrainType
 * @property {number} moveCost
 * @property {boolean} blocksMovement
 * @property {YieldBundle} yields
 */

/**
 * @typedef {Object} SpawnMetadata
 * @property {number} attempts
 * @property {boolean} fallbackUsed
 * @property {number} minFactionDistance
 * @property {number} nearestFactionDistance
 * @property {{ player: Hex, enemy: Hex }} anchors
 * @property {{ playerSettler: Hex, enemySettler: Hex }} spawns
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
 * @property {"balanced"|"food"|"production"|"science"} focus
 * @property {Hex[]} workedHexes
 * @property {YieldBundle} yieldLastTurn
 * @property {"agricultural"|"industrial"|"scholarly"|"balanced"} identity
 * @property {number} growthProgress
 * @property {number} health
 * @property {number} maxHealth
 * @property {string[]} queue
 */

/**
 * @typedef {Object} PendingCityResolution
 * @property {string} cityId
 * @property {"player"|"enemy"} attackerOwner
 * @property {"player"|"enemy"} defenderOwner
 * @property {Array<"capture"|"raze">} choices
 */

/**
 * @typedef {Object} EmpireEconomy
 * @property {number} foodStock
 * @property {number} productionStock
 * @property {number} scienceStock
 * @property {YieldBundle} lastTurnIncome
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
 */

/**
 * @typedef {Object} GameState
 * @property {TurnState} turnState
 * @property {{ width: number, height: number, seed: number, tiles: Tile[], spawnMetadata: SpawnMetadata }} map
 * @property {Unit[]} units
 * @property {City[]} cities
 * @property {string|null} selectedUnitId
 * @property {string|null} selectedCityId
 * @property {ResearchState} research
 * @property {{ units: string[] }} unlocks
 * @property {MatchState} match
 * @property {{ player: EmpireEconomy, enemy: EmpireEconomy, researchIncomeThisTurn: number }} economy
 * @property {PendingCityResolution|null} pendingCityResolution
 * @property {{ unit: number, city: number }} nextIds
 */

export {};
