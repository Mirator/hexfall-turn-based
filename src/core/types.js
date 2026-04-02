/**
 * @typedef {Object} Hex
 * @property {number} q
 * @property {number} r
 */

/**
 * @typedef {string} Owner
 */

/**
 * @typedef {string} AiOwner
 */

/**
 * @typedef {{ mapWidth: 16|20|24, mapHeight: 16|20|24, aiFactionCount: number }} MatchConfig
 */

/**
 * @typedef {Object} FactionMetadata
 * @property {Owner} playerOwner
 * @property {AiOwner[]} aiOwners
 * @property {Owner[]} allOwners
 * @property {Record<Owner, string>} labels
 */

/**
 * @typedef {Object} YieldBundle
 * @property {number} food
 * @property {number} production
 * @property {number} gold
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
 * @property {Record<Owner, Hex>} anchorsByOwner
 * @property {Record<Owner, Hex>} spawnByOwner
 * @property {{ player?: Hex, enemy?: Hex, purple?: Hex }} anchors
 * @property {{ playerSettler?: Hex, enemySettler?: Hex, purpleSettler?: Hex }} spawns
 */

/**
 * @typedef {Object} Unit
 * @property {string} id
 * @property {Owner} owner
 * @property {"warrior"|"settler"|"spearman"|"archer"} type
 * @property {number} q
 * @property {number} r
 * @property {number} health
 * @property {number} maxHealth
 * @property {number} attack
 * @property {number} armor
 * @property {number} attackRange
 * @property {number} minAttackRange
 * @property {"melee"|"ranged"} role
 * @property {number} movementRemaining
 * @property {number} maxMovement
 * @property {boolean} hasActed
 * @property {boolean} disabled
 */

/**
 * @typedef {{ kind: "unit"|"building", id: string }} CityQueueItem
 */

/**
 * @typedef {Object} City
 * @property {string} id
 * @property {Owner} owner
 * @property {number} q
 * @property {number} r
 * @property {number} population
 * @property {Hex[]} workedHexes
 * @property {YieldBundle} yieldLastTurn
 * @property {"agricultural"|"industrial"|"scholarly"|"balanced"} identity
 * @property {"agricultural"|"industrial"|"scholarly"|"balanced"} specialization
 * @property {number} growthProgress
 * @property {number} productionProgress
 * @property {number} health
 * @property {number} maxHealth
 * @property {"units"|"buildings"} productionTab
 * @property {Array<"granary"|"workshop"|"monument"|"campus"|"library"|"university"|"researchLab">} buildings
 * @property {{ built: boolean, adjacency: number, adjacencyBreakdown: { mountains: number, forests: number, nearbyCampuses: number } }} campus
 * @property {CityQueueItem[]} queue
 */

/**
 * @typedef {Object} PendingCityResolution
 * @property {string} cityId
 * @property {Owner} attackerOwner
 * @property {Owner} defenderOwner
 * @property {Array<"capture"|"raze">} choices
 */

/**
 * @typedef {Object} EmpireEconomy
 * @property {number} goldBalance
 * @property {number} goldIncomeLastTurn
 * @property {number} goldUpkeepLastTurn
 * @property {number} goldNetLastTurn
 * @property {string[]} disabledUnitIds
 * @property {{ food: number, production: number, gold: number }} outputLastTurn
 * @property {number} sciencePerTurn
 */

/**
 * @typedef {Object} TurnState
 * @property {number} turn
 * @property {"player"|"enemy"} phase
 */

/**
 * @typedef {"self"|"war"|"peace"} DiplomacyStatus
 */

/**
 * @typedef {Object} DiplomacyState
 * @property {Record<Owner, Record<Owner, DiplomacyStatus>>} byOwner
 * @property {number|null} lastChangeTurn
 */

/**
 * @typedef {Object} ResearchState
 * @property {string|null} currentTechId
 * @property {string|null} activeTechId
 * @property {number} progress
 * @property {Record<string, number>} progressByTech
 * @property {Record<string, number>} effectiveCostByTech
 * @property {Record<string, boolean>} boostAppliedByTech
 * @property {Record<string, { current: number, target: number, met: boolean, label: string|null }>} boostProgressByTech
 * @property {string[]} completedTechIds
 * @property {number} lastSciencePerTurn
 * @property {number} lastBaseSciencePerTurn
 * @property {number} lastGlobalModifierTotal
 * @property {Record<string, {
 *   cityId: string,
 *   cityName: string,
 *   populationScience: number,
 *   campusAdjacencyScience: number,
 *   buildingScience: number,
 *   totalScience: number
 * }>} lastCityScienceById
 * @property {{ id: string, amount: number }[]} boostsAppliedLastTurn
 */

/**
 * @typedef {Object} MatchState
 * @property {"ongoing"|"won"|"lost"} status
 * @property {string|null} reason
 */

/**
 * @typedef {"raider"|"expansionist"|"guardian"} AiPersonality
 */

/**
 * @typedef {AiPersonality} EnemyPersonality
 */

/**
 * @typedef {"foundFirstCity"|"expand"|"defend"|"assaultCity"|"huntUnits"|"regroup"|"idle"} EnemyGoal
 */

/**
 * @typedef {Object} EnemyActionSummary
 * @property {string} unitId
 * @property {"foundCity"|"attackUnit"|"attackCity"|"move"|"wait"} action
 * @property {string|null} targetId
 * @property {number|null} q
 * @property {number|null} r
 * @property {number} score
 * @property {number} cost
 * @property {string|null} detail
 * @property {{ from: Hex|null, to: Hex|null, target: Hex|null }|null} [presentation]
 */

/**
 * @typedef {Object} EnemyTurnSummary
 * @property {number} turn
 * @property {EnemyGoal} goal
 * @property {string|null} selectedResearch
 * @property {Array<{ cityId: string, item: string }>} queueRefills
 * @property {EnemyActionSummary[]} actions
 */

/**
 * @typedef {Object} EnemyAiState
 * @property {AiPersonality} personality
 * @property {EnemyGoal|null} lastGoal
 * @property {EnemyTurnSummary|null} lastTurnSummary
 */

/**
 * @typedef {Object} VisibilityOwnerState
 * @property {string[]} visibleHexes
 * @property {string[]} exploredHexes
 * @property {Owner[]} seenOwners
 */

/**
 * @typedef {Object} VisibilityState
 * @property {Record<Owner, VisibilityOwnerState>} byOwner
 * @property {boolean} devRevealPlayer
 */

/**
 * @typedef {Object} GameState
 * @property {MatchConfig} matchConfig
 * @property {FactionMetadata} factions
 * @property {TurnState} turnState
 * @property {{ width: number, height: number, seed: number, tiles: Tile[], spawnMetadata: SpawnMetadata }} map
 * @property {Unit[]} units
 * @property {City[]} cities
 * @property {string|null} selectedUnitId
 * @property {string|null} selectedCityId
 * @property {ResearchState} research
 * @property {{ units: string[] }} unlocks
 * @property {MatchState} match
 * @property {{ enemy?: EnemyAiState|null, purple?: EnemyAiState|null, byOwner: Record<AiOwner, EnemyAiState> }} ai
 * @property {DiplomacyState} diplomacy
 * @property {Record<Owner, EmpireEconomy> & { researchIncomeThisTurn: number }} economy
 * @property {VisibilityState} visibility
 * @property {PendingCityResolution|null} pendingCityResolution
 * @property {{ unit: number, city: number }} nextIds
 */

export {};
