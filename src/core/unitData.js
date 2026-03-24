const UNIT_DEFINITIONS = {
  warrior: {
    type: "warrior",
    maxHealth: 10,
    attack: 4,
    attackRange: 1,
    maxMovement: 2,
    canFoundCity: false,
    productionCost: 6,
    unlockedByDefault: true,
  },
  settler: {
    type: "settler",
    maxHealth: 7,
    attack: 1,
    attackRange: 1,
    maxMovement: 2,
    canFoundCity: true,
    productionCost: 8,
    unlockedByDefault: true,
  },
  spearman: {
    type: "spearman",
    maxHealth: 12,
    attack: 5,
    attackRange: 1,
    maxMovement: 2,
    canFoundCity: false,
    productionCost: 10,
    unlockedByDefault: false,
    unlockedByTech: "bronzeWorking",
  },
};

export const DEFAULT_UNLOCKED_UNITS = Object.values(UNIT_DEFINITIONS)
  .filter((unit) => unit.unlockedByDefault)
  .map((unit) => unit.type);

/**
 * @param {"warrior"|"settler"|"spearman"} type
 * @returns {typeof UNIT_DEFINITIONS.warrior}
 */
export function getUnitDefinition(type) {
  return UNIT_DEFINITIONS[type];
}

/**
 * @param {{ id: string, owner: "player"|"enemy", type: "warrior"|"settler"|"spearman", q: number, r: number }} params
 * @returns {import("./types.js").Unit}
 */
export function createUnit(params) {
  const definition = getUnitDefinition(params.type);
  return {
    id: params.id,
    owner: params.owner,
    type: params.type,
    q: params.q,
    r: params.r,
    health: definition.maxHealth,
    maxHealth: definition.maxHealth,
    attack: definition.attack,
    attackRange: definition.attackRange,
    movementRemaining: definition.maxMovement,
    maxMovement: definition.maxMovement,
    hasActed: false,
  };
}

/**
 * @returns {Array<"warrior"|"settler"|"spearman">}
 */
export function getAllUnitTypes() {
  return Object.keys(UNIT_DEFINITIONS);
}
