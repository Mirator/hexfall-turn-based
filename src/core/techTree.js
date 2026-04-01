/**
 * @typedef {{
 *   type: "city-count"|"population-total"|"building-count"|"unit-count-owned",
 *   target: number,
 *   buildingId?: string,
 *   unitType?: string
 * }} TechBoostCondition
 */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   era: 1|2|3,
 *   baseCost: number,
 *   prerequisites: string[],
 *   boostCondition: TechBoostCondition|null,
 *   unlocks: {
 *     units?: string[],
 *     buildings?: string[],
 *   },
 *   globalScienceModifier?: number
 * }} TechDefinition
 */

/** @type {Record<string, TechDefinition>} */
export const TECH_TREE = {
  pottery: {
    id: "pottery",
    name: "Pottery",
    era: 1,
    baseCost: 20,
    prerequisites: [],
    boostCondition: { type: "city-count", target: 1 },
    unlocks: {},
  },
  mining: {
    id: "mining",
    name: "Mining",
    era: 1,
    baseCost: 24,
    prerequisites: [],
    boostCondition: { type: "population-total", target: 4 },
    unlocks: {},
  },
  writing: {
    id: "writing",
    name: "Writing",
    era: 1,
    baseCost: 34,
    prerequisites: ["pottery"],
    boostCondition: { type: "city-count", target: 2 },
    unlocks: {
      buildings: ["campus", "library"],
    },
  },
  bronzeWorking: {
    id: "bronzeWorking",
    name: "Bronze Working",
    era: 1,
    baseCost: 32,
    prerequisites: [],
    boostCondition: { type: "unit-count-owned", unitType: "warrior", target: 2 },
    unlocks: {
      units: ["spearman"],
      buildings: ["workshop"],
    },
  },
  archery: {
    id: "archery",
    name: "Archery",
    era: 1,
    baseCost: 38,
    prerequisites: ["bronzeWorking"],
    boostCondition: { type: "building-count", buildingId: "campus", target: 1 },
    unlocks: {
      units: ["archer"],
    },
  },
  masonry: {
    id: "masonry",
    name: "Masonry",
    era: 1,
    baseCost: 36,
    prerequisites: ["bronzeWorking"],
    boostCondition: { type: "building-count", buildingId: "granary", target: 1 },
    unlocks: {
      buildings: ["monument"],
    },
  },
  engineering: {
    id: "engineering",
    name: "Engineering",
    era: 2,
    baseCost: 52,
    prerequisites: ["masonry"],
    boostCondition: { type: "building-count", buildingId: "workshop", target: 1 },
    unlocks: {},
    globalScienceModifier: 0.1,
  },
  mathematics: {
    id: "mathematics",
    name: "Mathematics",
    era: 2,
    baseCost: 56,
    prerequisites: ["writing"],
    boostCondition: { type: "building-count", buildingId: "library", target: 1 },
    unlocks: {},
  },
  education: {
    id: "education",
    name: "Education",
    era: 2,
    baseCost: 66,
    prerequisites: ["writing", "mathematics"],
    boostCondition: { type: "building-count", buildingId: "library", target: 2 },
    unlocks: {
      buildings: ["university"],
    },
  },
  civilService: {
    id: "civilService",
    name: "Civil Service",
    era: 2,
    baseCost: 72,
    prerequisites: ["education"],
    boostCondition: { type: "population-total", target: 12 },
    unlocks: {},
  },
  machinery: {
    id: "machinery",
    name: "Machinery",
    era: 2,
    baseCost: 74,
    prerequisites: ["engineering", "bronzeWorking"],
    boostCondition: { type: "unit-count-owned", unitType: "spearman", target: 2 },
    unlocks: {},
  },
  astronomy: {
    id: "astronomy",
    name: "Astronomy",
    era: 3,
    baseCost: 84,
    prerequisites: ["education"],
    boostCondition: { type: "building-count", buildingId: "campus", target: 3 },
    unlocks: {},
  },
  chemistry: {
    id: "chemistry",
    name: "Chemistry",
    era: 3,
    baseCost: 98,
    prerequisites: ["education", "machinery"],
    boostCondition: { type: "building-count", buildingId: "university", target: 1 },
    unlocks: {
      buildings: ["researchLab"],
    },
  },
  scientificMethod: {
    id: "scientificMethod",
    name: "Scientific Method",
    era: 3,
    baseCost: 118,
    prerequisites: ["chemistry", "astronomy"],
    boostCondition: { type: "population-total", target: 20 },
    unlocks: {},
    globalScienceModifier: 0.15,
  },
};

export const TECH_ORDER = [
  "pottery",
  "mining",
  "writing",
  "bronzeWorking",
  "archery",
  "masonry",
  "engineering",
  "mathematics",
  "education",
  "civilService",
  "machinery",
  "astronomy",
  "chemistry",
  "scientificMethod",
];

export const ERA_MULTIPLIERS = {
  1: 1,
  2: 1.35,
  3: 1.75,
};

export const CITY_COUNT_PENALTY_PER_EXTRA_CITY = 0.03;
