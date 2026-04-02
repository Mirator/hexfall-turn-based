import { CITY_COUNT_PENALTY_PER_EXTRA_CITY, ERA_MULTIPLIERS, TECH_ORDER, TECH_TREE } from "../core/techTree.js";

const SCIENCE_SCALE = 10;
const BOOST_MULTIPLIER = 0.4;

/**
 * @param {import("../core/types.js").GameState} _gameState
 */
function ensureResearchState(gameState) {
  if (!gameState.research || typeof gameState.research !== "object") {
    gameState.research = /** @type {import("../core/types.js").ResearchState} */ ({
      currentTechId: null,
      activeTechId: null,
      progress: 0,
      progressByTech: {},
      effectiveCostByTech: {},
      boostAppliedByTech: {},
      boostProgressByTech: {},
      completedTechIds: [],
      lastSciencePerTurn: 0,
      lastBaseSciencePerTurn: 0,
      lastGlobalModifierTotal: 0,
      lastCityScienceById: {},
      boostsAppliedLastTurn: [],
    });
  }

  gameState.research.progressByTech = gameState.research.progressByTech ?? {};
  gameState.research.effectiveCostByTech = gameState.research.effectiveCostByTech ?? {};
  gameState.research.boostAppliedByTech = gameState.research.boostAppliedByTech ?? {};
  gameState.research.boostProgressByTech = gameState.research.boostProgressByTech ?? {};
  gameState.research.completedTechIds = Array.isArray(gameState.research.completedTechIds) ? gameState.research.completedTechIds : [];
  gameState.research.lastCityScienceById = gameState.research.lastCityScienceById ?? {};
  gameState.research.boostsAppliedLastTurn = Array.isArray(gameState.research.boostsAppliedLastTurn)
    ? gameState.research.boostsAppliedLastTurn
    : [];

  if (typeof gameState.research.currentTechId === "undefined") {
    gameState.research.currentTechId = gameState.research.activeTechId ?? null;
  }
  if (typeof gameState.research.activeTechId === "undefined") {
    gameState.research.activeTechId = gameState.research.currentTechId ?? null;
  }
  if (!Number.isFinite(gameState.research.progress)) {
    gameState.research.progress = 0;
  }
  if (!Number.isFinite(gameState.research.lastSciencePerTurn)) {
    gameState.research.lastSciencePerTurn = 0;
  }
  if (!Number.isFinite(gameState.research.lastBaseSciencePerTurn)) {
    gameState.research.lastBaseSciencePerTurn = 0;
  }
  if (!Number.isFinite(gameState.research.lastGlobalModifierTotal)) {
    gameState.research.lastGlobalModifierTotal = 0;
  }

  for (const techId of TECH_ORDER) {
    if (!Number.isFinite(gameState.research.progressByTech[techId])) {
      gameState.research.progressByTech[techId] = 0;
    }
    if (!Number.isFinite(gameState.research.effectiveCostByTech[techId])) {
      gameState.research.effectiveCostByTech[techId] = 0;
    }
    if (typeof gameState.research.boostAppliedByTech[techId] !== "boolean") {
      gameState.research.boostAppliedByTech[techId] = false;
    }
    if (!gameState.research.boostProgressByTech[techId]) {
      gameState.research.boostProgressByTech[techId] = { current: 0, target: 0, met: false, label: null };
    }
  }
}

function toScaled(value) {
  return Math.round(Math.max(0, value) * SCIENCE_SCALE);
}

function fromScaled(value) {
  return Math.round((value / SCIENCE_SCALE) * 10) / 10;
}

/**
 * @param {import("../core/types.js").Owner} owner
 * @param {import("../core/types.js").GameState} gameState
 * @returns {import("../core/types.js").City[]}
 */
function getOwnerCities(owner, gameState) {
  return gameState.cities.filter((city) => city.owner === owner).sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * @param {import("../core/types.js").City} city
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{
 *   cityId: string,
 *   cityName: string,
 *   populationScience: number,
 *   campusAdjacencyScience: number,
 *   buildingScience: number,
 *   totalScience: number
 * }}
 */
export function getCityScienceBreakdown(city, _gameState) {
  const populationScience = Math.max(0, city.population) * 0.5;
  const campusBuilt = !!city?.campus?.built || (city.buildings ?? []).includes("campus");
  const campusAdjacencyScience = campusBuilt ? Math.max(0, city?.campus?.adjacency ?? 0) : 0;
  let buildingScience = 0;
  const buildings = new Set(city.buildings ?? []);
  if (buildings.has("library")) {
    buildingScience += 2;
  }
  if (buildings.has("university")) {
    buildingScience += 4;
  }
  if (buildings.has("researchLab")) {
    buildingScience += 5;
  }
  const totalScience = populationScience + campusAdjacencyScience + buildingScience;
  return {
    cityId: city.id,
    cityName: city.id,
    populationScience: roundToTenths(populationScience),
    campusAdjacencyScience: roundToTenths(campusAdjacencyScience),
    buildingScience: roundToTenths(buildingScience),
    totalScience: roundToTenths(totalScience),
  };
}

function roundToTenths(value) {
  return Math.round(value * 10) / 10;
}

/**
 * @param {import("../core/types.js").Owner} owner
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{
 *   owner: import("../core/types.js").Owner,
 *   baseScience: number,
 *   sciencePerTurn: number,
 *   modifierTotal: number,
 *   modifierSources: Array<{ id: string, amount: number }>,
 *   cityBreakdownById: Record<string, {
 *     cityId: string,
 *     cityName: string,
 *     populationScience: number,
 *     campusAdjacencyScience: number,
 *     buildingScience: number,
 *     totalScience: number
 *   }>
 * }}
 */
export function computeOwnerSciencePerTurn(owner, gameState) {
  const cityBreakdownById = {};
  let baseScience = 0;
  for (const city of getOwnerCities(owner, gameState)) {
    const breakdown = getCityScienceBreakdown(city, gameState);
    cityBreakdownById[city.id] = breakdown;
    baseScience += breakdown.totalScience;
  }

  const modifier = getOwnerGlobalScienceModifier(owner, gameState);
  const sciencePerTurn = roundToTenths(baseScience * (1 + modifier.total));
  return {
    owner,
    baseScience: roundToTenths(baseScience),
    sciencePerTurn,
    modifierTotal: modifier.total,
    modifierSources: modifier.sources,
    cityBreakdownById,
  };
}

/**
 * @param {import("../core/types.js").Owner} owner
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ total: number, sources: Array<{ id: string, amount: number }> }}
 */
export function getOwnerGlobalScienceModifier(owner, gameState) {
  const sources = [];
  for (const techId of gameState.research?.completedTechIds ?? []) {
    const tech = TECH_TREE[techId];
    if (!tech?.globalScienceModifier) {
      continue;
    }
    sources.push({ id: `tech:${techId}`, amount: tech.globalScienceModifier });
  }

  const ownerCities = getOwnerCities(owner, gameState);
  const monumentCount = ownerCities.filter((city) => (city.buildings ?? []).includes("monument")).length;
  const monumentModifier = Math.min(0.1, monumentCount * 0.02);
  if (monumentModifier > 0) {
    sources.push({ id: "building:monument", amount: monumentModifier });
  }

  const researchLabCount = ownerCities.filter((city) => (city.buildings ?? []).includes("researchLab")).length;
  const researchLabModifier = Math.min(0.15, researchLabCount * 0.03);
  if (researchLabModifier > 0) {
    sources.push({ id: "building:researchLab", amount: researchLabModifier });
  }

  const total = roundToTenths(sources.reduce((sum, source) => sum + source.amount, 0));
  return { total, sources };
}

/**
 * @param {string} techId
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ ok: boolean, reason?: string }}
 */
export function canSelectResearch(techId, gameState) {
  ensureResearchState(gameState);
  const tech = TECH_TREE[techId];
  if (!tech) {
    return { ok: false, reason: "tech-not-found" };
  }
  if (gameState.research.completedTechIds.includes(techId)) {
    return { ok: false, reason: "already-completed" };
  }
  for (const prerequisite of tech.prerequisites) {
    if (!gameState.research.completedTechIds.includes(prerequisite)) {
      return { ok: false, reason: "missing-prerequisite" };
    }
  }
  return { ok: true };
}

/**
 * @param {string} techId
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ ok: boolean, reason?: string }}
 */
export function selectResearch(techId, gameState) {
  ensureResearchState(gameState);
  const check = canSelectResearch(techId, gameState);
  if (!check.ok) {
    return check;
  }
  gameState.research.currentTechId = techId;
  gameState.research.activeTechId = techId;
  gameState.research.progress = fromScaled(gameState.research.progressByTech[techId] ?? 0);
  ensureEffectiveCost(techId, gameState);
  return { ok: true };
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ selected: string|null }}
 */
export function cycleResearch(gameState) {
  ensureResearchState(gameState);
  const available = getSelectableTechIds(gameState);
  if (available.length === 0) {
    gameState.research.currentTechId = null;
    gameState.research.activeTechId = null;
    gameState.research.progress = 0;
    return { selected: null };
  }

  const currentId = gameState.research.currentTechId ?? gameState.research.activeTechId;
  const currentIndex = available.indexOf(currentId ?? "");
  const nextId = available[(currentIndex + 1 + available.length) % available.length];
  selectResearch(nextId, gameState);
  return { selected: nextId };
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @returns {string[]}
 */
export function getSelectableTechIds(gameState) {
  ensureResearchState(gameState);
  return TECH_ORDER.filter((techId) => canSelectResearch(techId, gameState).ok);
}

/**
 * @param {string} techId
 * @param {import("../core/types.js").GameState} gameState
 * @returns {number}
 */
export function getEffectiveTechCost(techId, gameState) {
  ensureResearchState(gameState);
  return fromScaled(ensureEffectiveCost(techId, gameState));
}

/**
 * @param {string} techId
 * @param {import("../core/types.js").GameState} gameState
 * @returns {number}
 */
function ensureEffectiveCost(techId, gameState) {
  ensureResearchState(gameState);
  const tech = TECH_TREE[techId];
  if (!tech) {
    gameState.research.effectiveCostByTech[techId] = 0;
    return 0;
  }
  const playerOwner = gameState.factions?.playerOwner ?? "player";
  const cityCount = getOwnerCities(playerOwner, gameState).length;
  const eraMultiplier = ERA_MULTIPLIERS[tech.era] ?? 1;
  const cityPenalty = Math.max(0, cityCount - 1) * CITY_COUNT_PENALTY_PER_EXTRA_CITY;
  const effective = tech.baseCost * eraMultiplier * (1 + cityPenalty);
  const scaled = Math.max(1, toScaled(effective));
  gameState.research.effectiveCostByTech[techId] = scaled;
  return scaled;
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @param {number} points
 * @returns {{ completedTechIds: string[], spentPoints: number, remainingPoints: number }}
 */
export function advanceResearch(gameState, points) {
  ensureResearchState(gameState);
  if (!gameState.research.currentTechId && !gameState.research.activeTechId) {
    const firstSelectable = getSelectableTechIds(gameState)[0] ?? null;
    if (firstSelectable) {
      selectResearch(firstSelectable, gameState);
    }
  }
  const currentTechId = gameState.research.currentTechId ?? gameState.research.activeTechId;
  if (!currentTechId) {
    return { completedTechIds: [], spentPoints: 0, remainingPoints: Math.max(0, points) };
  }

  const scaledPoints = toScaled(points);
  gameState.research.progressByTech[currentTechId] += scaledPoints;
  const completion = resolveCompletionChain(gameState);
  const spentPoints = scaledPoints - completion.remainingScaled;
  return {
    completedTechIds: completion.completedTechIds,
    spentPoints: fromScaled(spentPoints),
    remainingPoints: fromScaled(completion.remainingScaled),
  };
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @param {import("../core/types.js").Owner} owner
 * @returns {{
 *   sciencePerTurn: number,
 *   baseSciencePerTurn: number,
 *   globalModifierTotal: number,
 *   modifierSources: Array<{ id: string, amount: number }>,
 *   cityBreakdownById: Record<string, {
 *     cityId: string,
 *     cityName: string,
 *     populationScience: number,
 *     campusAdjacencyScience: number,
 *     buildingScience: number,
 *     totalScience: number
 *   }>,
 *   boostsApplied: { id: string, amount: number }[],
 *   completedTechIds: string[],
 *   currentTechId: string|null,
 *   turnsRemaining: number|null
 * }}
 */
export function resolveResearchTurn(gameState, owner) {
  ensureResearchState(gameState);
  const economy = gameState.economy[owner];
  if (!economy) {
    return {
      sciencePerTurn: 0,
      baseSciencePerTurn: 0,
      globalModifierTotal: 0,
      modifierSources: [],
      cityBreakdownById: {},
      boostsApplied: [],
      completedTechIds: [],
      currentTechId: null,
      turnsRemaining: null,
    };
  }

  const science = computeOwnerSciencePerTurn(owner, gameState);
  gameState.research.lastSciencePerTurn = science.sciencePerTurn;
  gameState.research.lastBaseSciencePerTurn = science.baseScience;
  gameState.research.lastGlobalModifierTotal = science.modifierTotal;
  gameState.research.lastCityScienceById = science.cityBreakdownById;
  gameState.research.boostsAppliedLastTurn = [];

  economy.sciencePerTurn = science.sciencePerTurn;

  if (!gameState.research.currentTechId && !gameState.research.activeTechId) {
    const firstSelectable = getSelectableTechIds(gameState)[0] ?? null;
    if (firstSelectable) {
      selectResearch(firstSelectable, gameState);
    }
  }

  const boostsApplied = applyBoostsForOwner(gameState, owner);
  const currentTechId = gameState.research.currentTechId ?? gameState.research.activeTechId;
  const scaledScience = toScaled(science.sciencePerTurn);
  if (scaledScience > 0 && currentTechId) {
    gameState.research.progressByTech[currentTechId] += scaledScience;
  }
  const completion = resolveCompletionChain(gameState);
  const activeTechId = gameState.research.currentTechId ?? gameState.research.activeTechId;
  const turnsRemaining = getTurnsRemaining(gameState, activeTechId, science.sciencePerTurn);
  return {
    sciencePerTurn: science.sciencePerTurn,
    baseSciencePerTurn: science.baseScience,
    globalModifierTotal: science.modifierTotal,
    modifierSources: science.modifierSources,
    cityBreakdownById: science.cityBreakdownById,
    boostsApplied,
    completedTechIds: completion.completedTechIds,
    currentTechId: activeTechId,
    turnsRemaining,
  };
}

/**
 * Backward-compatibility helper: old stock-based API now delegates to direct per-turn resolution.
 * @param {import("../core/types.js").GameState} gameState
 * @param {import("../core/types.js").Owner} owner
 * @param {number} _baseIncome
 * @returns {{ completedTechIds: string[], spentScience: number, remainingScience: number, income: number }}
 */
export function consumeScienceStock(gameState, owner, _baseIncome = 0) {
  const result = resolveResearchTurn(gameState, owner);
  return {
    completedTechIds: result.completedTechIds,
    spentScience: result.sciencePerTurn,
    remainingScience: 0,
    income: result.sciencePerTurn,
  };
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @param {string|null} techId
 * @param {number} sciencePerTurn
 * @returns {number|null}
 */
function getTurnsRemaining(gameState, techId, sciencePerTurn) {
  if (!techId) {
    return null;
  }
  if (sciencePerTurn <= 0) {
    return null;
  }
  const cost = ensureEffectiveCost(techId, gameState);
  const progress = gameState.research.progressByTech[techId] ?? 0;
  const remaining = Math.max(0, cost - progress);
  const scaledScience = toScaled(sciencePerTurn);
  if (scaledScience <= 0) {
    return null;
  }
  return Math.max(0, Math.ceil(remaining / scaledScience));
}

function resolveCompletionChain(gameState) {
  ensureResearchState(gameState);
  const completedTechIds = [];
  let remainingScaled = 0;

  while (true) {
    const techId = gameState.research.currentTechId ?? gameState.research.activeTechId;
    if (!techId) {
      break;
    }
    const cost = ensureEffectiveCost(techId, gameState);
    const progress = gameState.research.progressByTech[techId] ?? 0;
    if (progress < cost) {
      break;
    }
    remainingScaled = Math.max(0, progress - cost);
    gameState.research.progressByTech[techId] = cost;
    completeTech(techId, gameState);
    completedTechIds.push(techId);

    const nextTechId = getSelectableTechIds(gameState)[0] ?? null;
    if (!nextTechId) {
      gameState.research.currentTechId = null;
      gameState.research.activeTechId = null;
      break;
    }
    gameState.research.currentTechId = nextTechId;
    gameState.research.activeTechId = nextTechId;
    gameState.research.progressByTech[nextTechId] += remainingScaled;
    remainingScaled = 0;
  }

  const activeTechId = gameState.research.currentTechId ?? gameState.research.activeTechId;
  gameState.research.progress = activeTechId ? fromScaled(gameState.research.progressByTech[activeTechId] ?? 0) : 0;
  return { completedTechIds, remainingScaled };
}

function completeTech(techId, gameState) {
  if (!gameState.research.completedTechIds.includes(techId)) {
    gameState.research.completedTechIds.push(techId);
  }
  const tech = TECH_TREE[techId];
  if (!tech?.unlocks?.units) {
    return;
  }
  for (const unitType of tech.unlocks.units) {
    if (!gameState.unlocks.units.includes(unitType)) {
      gameState.unlocks.units.push(unitType);
    }
  }
}

function applyBoostsForOwner(gameState, owner) {
  const applied = [];
  for (const techId of TECH_ORDER) {
    if (gameState.research.completedTechIds.includes(techId)) {
      continue;
    }
    const progress = evaluateBoostProgress(techId, gameState, owner);
    gameState.research.boostProgressByTech[techId] = progress;
    if (!progress.met || gameState.research.boostAppliedByTech[techId]) {
      continue;
    }
    const cost = ensureEffectiveCost(techId, gameState);
    const boostScaled = Math.max(1, Math.round(cost * BOOST_MULTIPLIER));
    gameState.research.progressByTech[techId] += boostScaled;
    gameState.research.boostAppliedByTech[techId] = true;
    const boostApplied = { id: techId, amount: fromScaled(boostScaled) };
    applied.push(boostApplied);
    gameState.research.boostsAppliedLastTurn.push(boostApplied);
  }
  return applied;
}

/**
 * @param {string} techId
 * @param {import("../core/types.js").GameState} gameState
 * @param {import("../core/types.js").Owner} owner
 * @returns {{ current: number, target: number, met: boolean, label: string|null }}
 */
function evaluateBoostProgress(techId, gameState, owner) {
  const tech = TECH_TREE[techId];
  const condition = tech?.boostCondition ?? null;
  if (!condition) {
    return { current: 0, target: 0, met: false, label: null };
  }

  const ownerCities = getOwnerCities(owner, gameState);
  const ownerUnits = gameState.units.filter((unit) => unit.owner === owner);

  if (condition.type === "city-count") {
    const current = ownerCities.length;
    return {
      current,
      target: condition.target,
      met: current >= condition.target,
      label: `Found ${condition.target} cities`,
    };
  }

  if (condition.type === "population-total") {
    const current = ownerCities.reduce((sum, city) => sum + Math.max(0, city.population), 0);
    return {
      current,
      target: condition.target,
      met: current >= condition.target,
      label: `Reach total population ${condition.target}`,
    };
  }

  if (condition.type === "building-count") {
    const buildingId = condition.buildingId ?? "";
    const current = ownerCities.filter((city) => (city.buildings ?? []).includes(buildingId)).length;
    return {
      current,
      target: condition.target,
      met: current >= condition.target,
      label: `Build ${condition.target} ${capitalizeLabel(buildingId)}${condition.target === 1 ? "" : "s"}`,
    };
  }

  if (condition.type === "unit-count-owned") {
    const unitType = condition.unitType ?? "";
    const current = ownerUnits.filter((unit) => unit.type === unitType).length;
    return {
      current,
      target: condition.target,
      met: current >= condition.target,
      label: `Own ${condition.target} ${capitalizeLabel(unitType)}${condition.target === 1 ? "" : "s"}`,
    };
  }

  return { current: 0, target: condition.target, met: false, label: null };
}

function capitalizeLabel(value) {
  if (!value) {
    return "";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}
