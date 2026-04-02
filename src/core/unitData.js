const UNIT_DEFINITIONS = {
  warrior: {
    type: "warrior",
    maxHealth: 10,
    attack: 4,
    armor: 1,
    attackRange: 1,
    minAttackRange: 1,
    role: "melee",
    maxMovement: 2,
    canFoundCity: false,
    productionCost: 6,
    goldUpkeep: 1,
    unlockedByDefault: true,
  },
  settler: {
    type: "settler",
    maxHealth: 7,
    attack: 1,
    armor: 0,
    attackRange: 1,
    minAttackRange: 1,
    role: "melee",
    maxMovement: 2,
    canFoundCity: true,
    productionCost: 8,
    goldUpkeep: 1,
    unlockedByDefault: true,
  },
  spearman: {
    type: "spearman",
    maxHealth: 12,
    attack: 5,
    armor: 2,
    attackRange: 1,
    minAttackRange: 1,
    role: "melee",
    maxMovement: 2,
    canFoundCity: false,
    productionCost: 10,
    goldUpkeep: 1,
    unlockedByDefault: false,
    unlockedByTech: "bronzeWorking",
  },
  archer: {
    type: "archer",
    maxHealth: 8,
    attack: 3,
    armor: 0,
    attackRange: 2,
    minAttackRange: 2,
    role: "ranged",
    maxMovement: 2,
    canFoundCity: false,
    productionCost: 9,
    goldUpkeep: 1,
    unlockedByDefault: false,
    unlockedByTech: "archery",
  },
};

export const DEFAULT_UNLOCKED_UNITS = Object.values(UNIT_DEFINITIONS)
  .filter((unit) => unit.unlockedByDefault)
  .map((unit) => unit.type);

/**
 * @param {"warrior"|"settler"|"spearman"|"archer"} type
 * @returns {typeof UNIT_DEFINITIONS.warrior}
 */
export function getUnitDefinition(type) {
  return UNIT_DEFINITIONS[type];
}

/**
 * @param {{ id: string, owner: import("./types.js").Owner, type: "warrior"|"settler"|"spearman"|"archer", q: number, r: number }} params
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
    armor: definition.armor,
    attackRange: definition.attackRange,
    minAttackRange: definition.minAttackRange,
    role: definition.role,
    movementRemaining: definition.maxMovement,
    maxMovement: definition.maxMovement,
    hasActed: false,
    disabled: false,
  };
}

/**
 * @returns {Array<"warrior"|"settler"|"spearman"|"archer">}
 */
export function getAllUnitTypes() {
  return Object.keys(UNIT_DEFINITIONS);
}
