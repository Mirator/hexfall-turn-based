import { cloneGameState, ENEMY_PERSONALITY_ORDER, getTileAt, getUnitById } from "../core/gameState.js";
import { distance } from "../core/hexGrid.js";
import { getUnitDefinition } from "../core/unitData.js";
import { canFoundCity, foundCity, getAvailableProductionBuildings, getAvailableProductionUnits } from "./citySystem.js";
import { getAttackableCities, getAttackableTargets, resolveAttack, resolveCityAttack } from "./combatSystem.js";
import { getReachable, moveUnit } from "./movementSystem.js";
import { getSelectableTechIds, selectResearch } from "./researchSystem.js";

export const ENEMY_GOAL_ORDER = ["foundFirstCity", "expand", "defend", "assaultCity", "huntUnits", "regroup", "idle"];
const GOAL_STEP = {
  foundFirstCity: 0,
  expand: 1,
  defend: 2,
  assaultCity: 3,
  huntUnits: 4,
  regroup: 5,
  idle: 6,
};

const PERSONALITY_GOAL_BONUS = {
  raider: {
    foundFirstCity: 6,
    expand: 4,
    defend: 6,
    assaultCity: 16,
    huntUnits: 14,
    regroup: 8,
    idle: 0,
  },
  expansionist: {
    foundFirstCity: 16,
    expand: 14,
    defend: 6,
    assaultCity: 10,
    huntUnits: 8,
    regroup: 6,
    idle: 0,
  },
  guardian: {
    foundFirstCity: 10,
    expand: 8,
    defend: 16,
    assaultCity: 8,
    huntUnits: 10,
    regroup: 12,
    idle: 0,
  },
};

const PERSONALITY_ACTION_BONUS = {
  raider: {
    foundCity: 4,
    attackUnit: 18,
    attackCity: 22,
    move: 8,
    wait: 0,
  },
  expansionist: {
    foundCity: 20,
    attackUnit: 10,
    attackCity: 14,
    move: 10,
    wait: 0,
  },
  guardian: {
    foundCity: 10,
    attackUnit: 14,
    attackCity: 10,
    move: 9,
    wait: 1,
  },
};

const GOAL_ACTION_BONUS = {
  foundFirstCity: {
    foundCity: 90,
    attackUnit: 2,
    attackCity: 0,
    move: 24,
    wait: -8,
  },
  expand: {
    foundCity: 72,
    attackUnit: 4,
    attackCity: 2,
    move: 20,
    wait: -6,
  },
  defend: {
    foundCity: 4,
    attackUnit: 24,
    attackCity: 10,
    move: 12,
    wait: -4,
  },
  assaultCity: {
    foundCity: 0,
    attackUnit: 10,
    attackCity: 28,
    move: 14,
    wait: -6,
  },
  huntUnits: {
    foundCity: 0,
    attackUnit: 26,
    attackCity: 6,
    move: 12,
    wait: -6,
  },
  regroup: {
    foundCity: 2,
    attackUnit: 6,
    attackCity: 2,
    move: 16,
    wait: 2,
  },
  idle: {
    foundCity: 0,
    attackUnit: 0,
    attackCity: 0,
    move: 0,
    wait: 4,
  },
};

const RESEARCH_PRIORITY = {
  raider: ["archery", "bronzeWorking", "masonry"],
  expansionist: ["bronzeWorking", "archery", "masonry"],
  guardian: ["masonry", "archery", "bronzeWorking"],
};

const QUEUE_PRIORITY_UNITS = {
  raider: ["warrior", "spearman", "archer", "settler"],
  expansionist: ["settler", "warrior", "spearman", "archer"],
  guardian: ["spearman", "warrior", "archer", "settler"],
};

const QUEUE_PRIORITY_ITEMS = {
  raider: [
    { kind: "unit", id: "warrior" },
    { kind: "unit", id: "spearman" },
    { kind: "unit", id: "archer" },
    { kind: "building", id: "workshop" },
    { kind: "building", id: "monument" },
    { kind: "building", id: "granary" },
    { kind: "unit", id: "settler" },
  ],
  expansionist: [
    { kind: "unit", id: "settler" },
    { kind: "building", id: "granary" },
    { kind: "unit", id: "warrior" },
    { kind: "building", id: "workshop" },
    { kind: "unit", id: "spearman" },
    { kind: "unit", id: "archer" },
    { kind: "building", id: "monument" },
  ],
  guardian: [
    { kind: "building", id: "monument" },
    { kind: "unit", id: "spearman" },
    { kind: "unit", id: "warrior" },
    { kind: "building", id: "workshop" },
    { kind: "unit", id: "archer" },
    { kind: "building", id: "granary" },
    { kind: "unit", id: "settler" },
  ],
};

const THREATENED_CITY_DISTANCE = 2;

/**
 * @param {import("../core/types.js").GameState} gameState
 * @returns {import("../core/types.js").EnemyAiState}
 */
export function ensureEnemyAiState(gameState) {
  if (!gameState.ai) {
    gameState.ai = {
      enemy: {
        personality: deriveEnemyPersonality(gameState.map.seed),
        lastGoal: null,
        lastTurnSummary: null,
      },
    };
    return gameState.ai.enemy;
  }

  if (!gameState.ai.enemy) {
    gameState.ai.enemy = {
      personality: deriveEnemyPersonality(gameState.map.seed),
      lastGoal: null,
      lastTurnSummary: null,
    };
    return gameState.ai.enemy;
  }

  gameState.ai.enemy.personality = normalizeEnemyPersonality(gameState.ai.enemy.personality, gameState.map.seed);
  if (!("lastGoal" in gameState.ai.enemy)) {
    gameState.ai.enemy.lastGoal = null;
  }
  if (!("lastTurnSummary" in gameState.ai.enemy)) {
    gameState.ai.enemy.lastTurnSummary = null;
  }
  return gameState.ai.enemy;
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @returns {import("../core/types.js").EnemyPersonality}
 */
export function getEnemyPersonality(gameState) {
  return ensureEnemyAiState(gameState).personality;
}

/**
 * @param {number} seed
 * @returns {import("../core/types.js").EnemyPersonality}
 */
export function deriveEnemyPersonality(seed) {
  const normalizedSeed = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) : 0;
  return /** @type {import("../core/types.js").EnemyPersonality} */ (
    ENEMY_PERSONALITY_ORDER[normalizedSeed % ENEMY_PERSONALITY_ORDER.length]
  );
}

/**
 * @param {import("../core/types.js").EnemyPersonality|string|undefined|null} personality
 * @param {number} fallbackSeed
 * @returns {import("../core/types.js").EnemyPersonality}
 */
export function normalizeEnemyPersonality(personality, fallbackSeed = 0) {
  if (personality === "raider" || personality === "expansionist" || personality === "guardian") {
    return personality;
  }
  return deriveEnemyPersonality(fallbackSeed);
}

/**
 * @param {import("../core/types.js").EnemyPersonality} personality
 * @param {string[]} selectableTechIds
 * @returns {string|null}
 */
export function pickEnemyResearchTech(personality, selectableTechIds) {
  if (!selectableTechIds || selectableTechIds.length === 0) {
    return null;
  }

  const uniqueSelectable = [...new Set(selectableTechIds)];
  const priority = RESEARCH_PRIORITY[personality] ?? RESEARCH_PRIORITY.expansionist;
  for (const techId of priority) {
    if (uniqueSelectable.includes(techId)) {
      return techId;
    }
  }

  return [...uniqueSelectable].sort((a, b) => a.localeCompare(b))[0] ?? null;
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @param {import("../core/types.js").EnemyPersonality} [personality]
 * @returns {"warrior"|"settler"|"spearman"|"archer"|null}
 */
export function pickEnemyQueueUnit(gameState, personality = getEnemyPersonality(gameState)) {
  const availableUnits = getAvailableProductionUnits(gameState);
  if (availableUnits.length === 0) {
    return null;
  }

  const priority = QUEUE_PRIORITY_UNITS[personality] ?? QUEUE_PRIORITY_UNITS.expansionist;
  for (const candidate of priority) {
    if (availableUnits.includes(candidate)) {
      return /** @type {"warrior"|"settler"|"spearman"|"archer"} */ (candidate);
    }
  }

  return (
    [...availableUnits].sort((a, b) => {
      const definitionA = getUnitDefinition(a);
      const definitionB = getUnitDefinition(b);
      const costA = definitionA?.productionCost ?? Number.POSITIVE_INFINITY;
      const costB = definitionB?.productionCost ?? Number.POSITIVE_INFINITY;
      return costA - costB || a.localeCompare(b);
    })[0] ?? null
  );
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @param {import("../core/types.js").EnemyPersonality} [personality]
 * @returns {import("../core/types.js").EnemyGoal}
 */
export function pickEnemyGoal(gameState, personality = getEnemyPersonality(gameState)) {
  const context = buildGoalContext(gameState);
  const scores = ENEMY_GOAL_ORDER.map((goal) => ({
    goal,
    score: scoreGoal(goal, personality, context),
  }));

  return (
    scores.sort((a, b) => {
      return b.score - a.score || GOAL_STEP[a.goal] - GOAL_STEP[b.goal];
    })[0]?.goal ?? "idle"
  );
}

/**
 * @param {"player"|"enemy"} attackerOwner
 * @param {import("../core/types.js").City} targetCity
 * @param {import("../core/types.js").GameState} gameState
 * @returns {"capture"|"raze"}
 */
export function pickEnemyCityOutcome(attackerOwner, targetCity, gameState) {
  if (attackerOwner !== "enemy") {
    const ownedCities = gameState.cities.filter((city) => city.owner === attackerOwner).length;
    return ownedCities === 0 ? "capture" : "raze";
  }

  const personality = getEnemyPersonality(gameState);
  const ownedCities = gameState.cities.filter((city) => city.owner === attackerOwner).length;
  if (personality === "expansionist") {
    return "capture";
  }
  if (personality === "raider") {
    return ownedCities === 0 ? "capture" : "raze";
  }

  const hasNearbyAlliedCity = gameState.cities.some((city) => {
    if (city.owner !== attackerOwner) {
      return false;
    }
    return distance(city, targetCity) <= 3;
  });

  if (hasNearbyAlliedCity || ownedCities === 0) {
    return "capture";
  }
  return "raze";
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{
 *   turn: number,
 *   personality: import("../core/types.js").EnemyPersonality,
 *   goal: import("../core/types.js").EnemyGoal,
 *   selectedResearch: string|null,
 *   queueRefills: Array<{ cityId: string, item: string }>,
 *   steps: import("../core/types.js").EnemyActionSummary[]
 * }}
 */
export function prepareEnemyTurnPlan(gameState) {
  const planningState = cloneGameState(gameState);
  const aiState = ensureEnemyAiState(planningState);
  const enemyUnits = getAliveUnits(planningState, "enemy");
  const playerPresence = hasFactionPresence(planningState, "player");
  if (!playerPresence) {
    return buildIdleTurnPlan(gameState, aiState.personality);
  }

  const prelude = resolveEnemyTurnPrelude(planningState, aiState.personality);
  const steps = enemyUnits.length > 0 ? collectEnemyTurnSteps(planningState, prelude.goal, aiState.personality) : [];
  return {
    turn: gameState.turnState.turn,
    personality: aiState.personality,
    goal: prelude.goal,
    selectedResearch: prelude.selectedResearch,
    queueRefills: prelude.queueRefills,
    steps,
  };
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @param {{
 *   selectedResearch?: string|null,
 *   queueRefills?: Array<{ cityId: string, item: string }>
 * }} plan
 * @returns {{ selectedResearch: string|null, queueRefills: Array<{ cityId: string, item: string }> }}
 */
export function executeEnemyTurnPrelude(gameState, plan) {
  let selectedResearch = null;
  if (plan.selectedResearch) {
    const selected = selectResearch(plan.selectedResearch, gameState);
    if (selected.ok) {
      selectedResearch = plan.selectedResearch;
    }
  }

  const appliedQueueRefills = [];
  for (const refill of plan.queueRefills ?? []) {
    if (applyQueueRefillFromPlan(gameState, refill)) {
      appliedQueueRefills.push({ cityId: refill.cityId, item: refill.item });
    }
  }

  return {
    selectedResearch,
    queueRefills: appliedQueueRefills,
  };
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @param {import("../core/types.js").EnemyActionSummary} step
 * @returns {{
 *   ok: boolean,
 *   reason?: string,
 *   detail?: string,
 *   actionSummary?: import("../core/types.js").EnemyActionSummary,
 *   result?: Record<string, any>
 * }}
 */
export function executeEnemyTurnStep(gameState, step) {
  if (!step || !step.action || !step.unitId) {
    return { ok: false, reason: "invalid-step" };
  }

  const beforeUnit = getUnitById(gameState, step.unitId);
  const from =
    beforeUnit && Number.isFinite(beforeUnit.q) && Number.isFinite(beforeUnit.r)
      ? { q: beforeUnit.q, r: beforeUnit.r }
      : step.presentation?.from ?? null;

  /** @type {Record<string, any>|null} */
  let result = null;
  if (step.action === "foundCity") {
    result = foundCity(step.unitId, gameState);
  } else if (step.action === "attackUnit") {
    if (!step.targetId) {
      return { ok: false, reason: "missing-target" };
    }
    result = resolveAttack(step.unitId, step.targetId, gameState);
  } else if (step.action === "attackCity") {
    if (!step.targetId) {
      return { ok: false, reason: "missing-target" };
    }
    result = resolveCityAttack(step.unitId, step.targetId, gameState);
  } else if (step.action === "move") {
    if (!Number.isFinite(step.q) || !Number.isFinite(step.r)) {
      return { ok: false, reason: "missing-destination" };
    }
    result = moveUnit(step.unitId, { q: step.q, r: step.r }, gameState);
  } else if (step.action === "wait") {
    const refreshed = getUnitById(gameState, step.unitId);
    if (!refreshed) {
      return { ok: false, reason: "unit-not-found" };
    }
    refreshed.hasActed = true;
    refreshed.movementRemaining = 0;
    result = { ok: true };
  } else {
    return { ok: false, reason: "unsupported-action" };
  }

  if (!result?.ok) {
    return { ok: false, reason: result?.reason ?? "step-failed" };
  }

  const detail = getActionResultDetail(step.action, result);
  const afterUnit = getUnitById(gameState, step.unitId);
  const to =
    afterUnit && Number.isFinite(afterUnit.q) && Number.isFinite(afterUnit.r)
      ? { q: afterUnit.q, r: afterUnit.r }
      : step.presentation?.to ?? from;
  const targetHex =
    Number.isFinite(step.q) && Number.isFinite(step.r) ? { q: Math.trunc(step.q), r: Math.trunc(step.r) } : null;

  return {
    ok: true,
    detail,
    result,
    actionSummary: {
      unitId: step.unitId,
      action: step.action,
      targetId: step.targetId ?? null,
      q: targetHex ? targetHex.q : null,
      r: targetHex ? targetHex.r : null,
      score: Number.isFinite(step.score) ? step.score : 0,
      cost: Number.isFinite(step.cost) ? step.cost : 0,
      detail,
      presentation: {
        from,
        to,
        target: targetHex,
      },
    },
  };
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @param {{
 *   goal: import("../core/types.js").EnemyGoal,
 *   selectedResearch?: string|null,
 *   queueRefills?: Array<{ cityId: string, item: string }>
 * }} plan
 * @param {import("../core/types.js").EnemyActionSummary[]} actions
 * @param {{ selectedResearch: string|null, queueRefills: Array<{ cityId: string, item: string }> }|null} [appliedPrelude]
 * @returns {import("../core/types.js").EnemyTurnSummary}
 */
export function finalizeEnemyTurnPlan(gameState, plan, actions, appliedPrelude = null) {
  const aiState = ensureEnemyAiState(gameState);
  aiState.lastGoal = plan.goal;
  aiState.lastTurnSummary = {
    turn: gameState.turnState.turn,
    goal: plan.goal,
    selectedResearch: appliedPrelude?.selectedResearch ?? plan.selectedResearch ?? null,
    queueRefills: appliedPrelude?.queueRefills ?? plan.queueRefills ?? [],
    actions: [...actions],
  };
  return aiState.lastTurnSummary;
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @returns {import("../core/types.js").GameState}
 */
export function runEnemyTurn(gameState) {
  const plan = prepareEnemyTurnPlan(gameState);
  const appliedPrelude = executeEnemyTurnPrelude(gameState, plan);
  const actions = [];
  for (const step of plan.steps) {
    const execution = executeEnemyTurnStep(gameState, step);
    if (execution.ok && execution.actionSummary) {
      actions.push(execution.actionSummary);
    }
  }
  finalizeEnemyTurnPlan(gameState, plan, actions, appliedPrelude);
  return gameState;
}

function buildIdleTurnPlan(gameState, personality) {
  return {
    turn: gameState.turnState.turn,
    personality,
    goal: "idle",
    selectedResearch: null,
    queueRefills: [],
    steps: [],
  };
}

function resolveEnemyTurnPrelude(gameState, personality) {
  const selectedResearch = maybeSelectEnemyResearch(gameState, personality);
  const queueRefills = syncEnemyQueuesForPersonality(gameState, personality);
  const goal = pickEnemyGoal(gameState, personality);
  return {
    selectedResearch,
    queueRefills,
    goal,
  };
}

function collectEnemyTurnSteps(gameState, goal, personality) {
  const enemyUnits = getAliveUnits(gameState, "enemy");
  const steps = [];
  for (const enemyUnit of orderEnemyUnits(enemyUnits, goal)) {
    const refreshedEnemy = getUnitById(gameState, enemyUnit.id);
    if (!refreshedEnemy || refreshedEnemy.health <= 0) {
      continue;
    }

    const action = pickBestActionForUnit(refreshedEnemy, goal, personality, gameState);
    if (!action) {
      continue;
    }

    const from = { q: refreshedEnemy.q, r: refreshedEnemy.r };
    const result = executeAction(action);
    if (!result.ok) {
      continue;
    }
    const detail = result.detail ?? null;

    const refreshedAfterAction = getUnitById(gameState, refreshedEnemy.id);
    const to = refreshedAfterAction ? { q: refreshedAfterAction.q, r: refreshedAfterAction.r } : { ...from };
    const target =
      Number.isFinite(action.q) && Number.isFinite(action.r) ? { q: Math.trunc(action.q), r: Math.trunc(action.r) } : null;

    steps.push({
      unitId: refreshedEnemy.id,
      action: action.type,
      targetId: action.targetId ?? null,
      q: target ? target.q : null,
      r: target ? target.r : null,
      score: action.score,
      cost: action.cost,
      detail,
      presentation: {
        from,
        to,
        target,
      },
    });
  }
  return steps;
}

function applyQueueRefillFromPlan(gameState, refill) {
  if (!refill || typeof refill.cityId !== "string" || typeof refill.item !== "string") {
    return false;
  }

  const city = gameState.cities.find((candidate) => candidate.id === refill.cityId && candidate.owner === "enemy");
  if (!city) {
    return false;
  }

  city.queue = normalizeQueueItems(city.queue);
  if (city.queue.length > 0) {
    return false;
  }

  const [kind, ...idParts] = refill.item.split(":");
  const id = idParts.join(":");
  if ((kind !== "unit" && kind !== "building") || !id) {
    return false;
  }

  city.queue = [{ kind, id }];
  city.productionTab = kind === "building" ? "buildings" : "units";
  return true;
}

function getActionResultDetail(actionType, result) {
  if (actionType === "attackUnit") {
    return result.targetDefeated ? "target-defeated" : "target-damaged";
  }

  if (actionType === "attackCity") {
    if (result.outcomeChoice) {
      return `city-${result.outcomeChoice}`;
    }
    return result.cityDefeated ? "city-defeated" : "city-damaged";
  }

  if (actionType === "foundCity") {
    return result.cityId ? `founded-${result.cityId}` : "city-founded";
  }

  if (actionType === "move") {
    return "moved";
  }

  return "waited";
}

function maybeSelectEnemyResearch(gameState, personality) {
  if (gameState.research.activeTechId) {
    return null;
  }

  const selectableTechIds = getSelectableTechIds(gameState);
  const techToSelect = pickEnemyResearchTech(personality, selectableTechIds);
  if (!techToSelect) {
    return null;
  }
  const selected = selectResearch(techToSelect, gameState);
  if (!selected.ok) {
    return null;
  }
  return techToSelect;
}

function syncEnemyQueuesForPersonality(gameState, personality) {
  const refills = [];
  const enemyCities = gameState.cities.filter((city) => city.owner === "enemy").sort((a, b) => a.id.localeCompare(b.id));

  for (const city of enemyCities) {
    city.queue = normalizeQueueItems(city.queue);
    if (city.queue.length > 0) {
      continue;
    }

    const preferredQueueItem = pickEnemyQueueItem(gameState, city, personality);
    if (!preferredQueueItem) {
      continue;
    }

    city.queue = [{ ...preferredQueueItem }];
    if (preferredQueueItem.kind === "building") {
      city.productionTab = "buildings";
    } else {
      city.productionTab = "units";
    }
    refills.push({ cityId: city.id, item: `${preferredQueueItem.kind}:${preferredQueueItem.id}` });
  }

  return refills;
}

function pickEnemyQueueItem(gameState, city, personality) {
  const availableUnits = new Set(getAvailableProductionUnits(gameState));
  const availableBuildings = new Set(getAvailableProductionBuildings(gameState));
  const builtBuildingIds = new Set(city.buildings ?? []);
  const queuedBuildingIds = new Set(
    normalizeQueueItems(city.queue)
      .filter((item) => item.kind === "building")
      .map((item) => item.id)
  );

  const priority = QUEUE_PRIORITY_ITEMS[personality] ?? QUEUE_PRIORITY_ITEMS.expansionist;
  for (const item of priority) {
    if (item.kind === "unit") {
      if (availableUnits.has(item.id)) {
        return { kind: "unit", id: item.id };
      }
      continue;
    }

    if (!availableBuildings.has(item.id)) {
      continue;
    }
    if (builtBuildingIds.has(item.id) || queuedBuildingIds.has(item.id)) {
      continue;
    }
    return { kind: "building", id: item.id };
  }

  const fallbackUnit = pickEnemyQueueUnit(gameState, personality);
  if (fallbackUnit) {
    return { kind: "unit", id: fallbackUnit };
  }

  return null;
}

function normalizeQueueItems(queue) {
  if (!Array.isArray(queue)) {
    return [];
  }

  const normalized = [];
  for (const item of queue) {
    if (typeof item === "string") {
      normalized.push({ kind: "unit", id: item });
      continue;
    }

    if (!item || typeof item !== "object") {
      continue;
    }
    const kind = item.kind;
    const id = item.id;
    if ((kind === "unit" || kind === "building") && typeof id === "string" && id) {
      normalized.push({ kind, id });
    }
  }
  return normalized;
}

function orderEnemyUnits(enemyUnits, goal) {
  return [...enemyUnits].sort((a, b) => {
    if (goal === "foundFirstCity" || goal === "expand") {
      const settlerDelta = Number(a.type !== "settler") - Number(b.type !== "settler");
      if (settlerDelta !== 0) {
        return settlerDelta;
      }
    }

    if (goal === "regroup") {
      const healthRatioA = a.health / Math.max(1, a.maxHealth);
      const healthRatioB = b.health / Math.max(1, b.maxHealth);
      if (healthRatioA !== healthRatioB) {
        return healthRatioA - healthRatioB;
      }
    }

    return a.id.localeCompare(b.id);
  });
}

function pickBestActionForUnit(unit, goal, personality, gameState) {
  const candidates = [];
  const foundCheck = canFoundCity(unit.id, gameState);

  if (foundCheck.ok) {
    candidates.push({
      type: "foundCity",
      unitId: unit.id,
      targetId: null,
      q: unit.q,
      r: unit.r,
      cost: 0,
      score: scoreFoundCityAction(unit, goal, personality, gameState),
      execute: () => foundCity(unit.id, gameState),
    });
  }

  const attackableUnitTargets = getAttackableTargets(unit.id, gameState).sort((a, b) => {
    return distance(unit, a) - distance(unit, b) || a.q - b.q || a.r - b.r || a.id.localeCompare(b.id);
  });
  for (const target of attackableUnitTargets) {
    candidates.push({
      type: "attackUnit",
      unitId: unit.id,
      targetId: target.id,
      q: target.q,
      r: target.r,
      cost: 0,
      score: scoreAttackUnitAction(unit, target, goal, personality, gameState),
      execute: () => resolveAttack(unit.id, target.id, gameState),
    });
  }

  const attackableCityTargets = getAttackableCities(unit.id, gameState).sort((a, b) => {
    return distance(unit, a) - distance(unit, b) || a.q - b.q || a.r - b.r || a.id.localeCompare(b.id);
  });
  for (const cityTarget of attackableCityTargets) {
    candidates.push({
      type: "attackCity",
      unitId: unit.id,
      targetId: cityTarget.id,
      q: cityTarget.q,
      r: cityTarget.r,
      cost: 0,
      score: scoreAttackCityAction(unit, cityTarget, goal, personality),
      execute: () => resolveCityAttack(unit.id, cityTarget.id, gameState),
    });
  }

  const moveTarget = chooseMoveTarget(unit, goal, gameState);
  const reachable = getReachable(unit.id, gameState);
  for (const hex of reachable) {
    candidates.push({
      type: "move",
      unitId: unit.id,
      targetId: null,
      q: hex.q,
      r: hex.r,
      cost: hex.cost,
      score: scoreMoveAction(unit, hex, moveTarget, goal, personality, gameState),
      execute: () => moveUnit(unit.id, { q: hex.q, r: hex.r }, gameState),
    });
  }

  candidates.push({
    type: "wait",
    unitId: unit.id,
    targetId: null,
    q: unit.q,
    r: unit.r,
    cost: Number.MAX_SAFE_INTEGER,
    score: scoreWaitAction(unit, goal, personality),
    execute: () => {
      const refreshed = getUnitById(gameState, unit.id);
      if (!refreshed) {
        return { ok: false, reason: "unit-not-found" };
      }
      refreshed.hasActed = true;
      refreshed.movementRemaining = 0;
      return { ok: true };
    },
  });

  return candidates.sort(compareActionCandidates)[0] ?? null;
}

function compareActionCandidates(a, b) {
  return (
    b.score - a.score ||
    a.cost - b.cost ||
    a.q - b.q ||
    a.r - b.r ||
    (a.targetId ?? a.unitId).localeCompare(b.targetId ?? b.unitId)
  );
}

function executeAction(action) {
  const result = action.execute();
  if (!result?.ok) {
    return { ok: false, reason: result?.reason ?? "action-failed", result };
  }
  return { ok: true, detail: getActionResultDetail(action.type, result), result };
}

function chooseMoveTarget(unit, goal, gameState) {
  if ((goal === "foundFirstCity" || goal === "expand") && unit.type === "settler") {
    return chooseSettlerExpansionTarget(unit, gameState);
  }

  if (goal === "assaultCity") {
    return pickClosestTarget(unit, getAliveCities(gameState, "player"));
  }

  if (goal === "huntUnits") {
    return pickClosestTarget(unit, getAliveUnits(gameState, "player"));
  }

  if (goal === "defend") {
    const threatenedCity = pickClosestTarget(unit, getThreatenedCities(gameState));
    if (threatenedCity) {
      return threatenedCity;
    }
    return pickClosestTarget(unit, getAliveUnits(gameState, "player"));
  }

  if (goal === "regroup") {
    return pickClosestTarget(unit, getAliveCities(gameState, "enemy"));
  }

  const hostileTargets = [...getAliveUnits(gameState, "player"), ...getAliveCities(gameState, "player")];
  return pickClosestTarget(unit, hostileTargets);
}

function chooseSettlerExpansionTarget(unit, gameState) {
  const occupiedKeys = new Set([
    ...gameState.cities.map((city) => `${city.q},${city.r}`),
    ...gameState.units.filter((candidate) => candidate.id !== unit.id).map((candidate) => `${candidate.q},${candidate.r}`),
  ]);

  return (
    [...gameState.map.tiles]
      .filter((tile) => !tile.blocksMovement)
      .filter((tile) => !occupiedKeys.has(`${tile.q},${tile.r}`))
      .sort((a, b) => {
        const scoreA = scoreSettlerTarget(a, unit);
        const scoreB = scoreSettlerTarget(b, unit);
        return scoreB - scoreA || a.q - b.q || a.r - b.r;
      })[0] ?? null
  );
}

function scoreSettlerTarget(tile, unit) {
  const terrainScore = tile.yields.food * 3 + tile.yields.production * 2 + tile.yields.science * 2;
  const proximityPenalty = distance(unit, tile);
  return terrainScore * 5 - proximityPenalty;
}

function pickClosestTarget(origin, targets) {
  if (!targets || targets.length === 0) {
    return null;
  }

  return [...targets].sort((a, b) => {
    return distance(origin, a) - distance(origin, b) || a.q - b.q || a.r - b.r || a.id.localeCompare(b.id);
  })[0];
}

function scoreFoundCityAction(unit, goal, personality, gameState) {
  const tile = getTileAt(gameState.map, unit.q, unit.r);
  const tileScore = tile ? tile.yields.food * 2 + tile.yields.production * 2 + tile.yields.science : 0;
  const enemyCityCount = getAliveCities(gameState, "enemy").length;
  const bonus = PERSONALITY_ACTION_BONUS[personality].foundCity + GOAL_ACTION_BONUS[goal].foundCity;
  return bonus + tileScore + (enemyCityCount === 0 ? 25 : 0);
}

function scoreAttackUnitAction(unit, target, goal, personality, gameState) {
  let score = PERSONALITY_ACTION_BONUS[personality].attackUnit + GOAL_ACTION_BONUS[goal].attackUnit;
  if (target.health <= unit.attack) {
    score += 16;
  }
  if (target.type === "settler") {
    score += 8;
  }
  const threatenedCities = getThreatenedCities(gameState);
  if (goal === "defend" && threatenedCities.some((city) => distance(city, target) <= THREATENED_CITY_DISTANCE)) {
    score += 10;
  }
  return score;
}

function scoreAttackCityAction(unit, cityTarget, goal, personality) {
  let score = PERSONALITY_ACTION_BONUS[personality].attackCity + GOAL_ACTION_BONUS[goal].attackCity;
  if (cityTarget.health <= unit.attack) {
    score += 20;
  } else {
    score += 6;
  }
  score += cityTarget.population;
  return score;
}

function scoreMoveAction(unit, hex, target, goal, personality, gameState) {
  const base = PERSONALITY_ACTION_BONUS[personality].move + GOAL_ACTION_BONUS[goal].move;
  if (!target) {
    return base - hex.cost;
  }

  const currentDistance = distance(unit, target);
  const nextDistance = distance(hex, target);
  const progress = currentDistance - nextDistance;
  let score = base + progress * 9 - hex.cost;
  if (progress < 0) {
    score -= 6;
  }
  if ((goal === "foundFirstCity" || goal === "expand") && unit.type === "settler") {
    const cityOnHex = gameState.cities.some((city) => city.q === hex.q && city.r === hex.r);
    if (!cityOnHex) {
      score += 8;
    }
  }
  return score;
}

function scoreWaitAction(unit, goal, personality) {
  let score = PERSONALITY_ACTION_BONUS[personality].wait + GOAL_ACTION_BONUS[goal].wait;
  if ((goal === "foundFirstCity" || goal === "expand") && unit.type === "settler") {
    score -= 20;
  }
  const healthRatio = unit.health / Math.max(1, unit.maxHealth);
  if (goal === "regroup" && healthRatio < 0.5) {
    score += 6;
  }
  return score;
}

function scoreGoal(goal, personality, context) {
  let score = PERSONALITY_GOAL_BONUS[personality][goal] ?? 0;

  if (goal === "foundFirstCity") {
    score += context.enemyCityCount === 0 && context.enemySettlerCount > 0 ? 66 : -50;
    score += context.canFoundImmediately ? 20 : 0;
    return score;
  }

  if (goal === "expand") {
    score += context.enemySettlerCount > 0 ? 24 : -14;
    score += context.enemyCityCount > 0 ? 14 : 0;
    score += context.canFoundImmediately ? 8 : 0;
    score -= context.immediateUnitAttacks * 36;
    score -= context.immediateCityAttacks * 24;
    score -= context.threatenedEnemyCities * 8;
    return score;
  }

  if (goal === "defend") {
    score += context.threatenedEnemyCities * 22 + context.playerUnitsNearEnemyCities * 6;
    return score;
  }

  if (goal === "assaultCity") {
    score += context.playerCityCount * 8 + context.immediateCityAttacks * 18;
    score += context.enemyCityCount === 0 ? -6 : 0;
    return score;
  }

  if (goal === "huntUnits") {
    score += context.playerUnitCount * 6 + context.immediateUnitAttacks * 18;
    return score;
  }

  if (goal === "regroup") {
    score += context.lowHealthEnemyUnits * 12;
    score += context.actionableEnemyUnits === 0 ? 5 : 0;
    return score;
  }

  if (goal === "idle") {
    score += context.immediateUnitAttacks + context.immediateCityAttacks > 0 ? -6 : 1;
    return score;
  }

  return score;
}

function buildGoalContext(gameState) {
  const enemyUnits = getAliveUnits(gameState, "enemy");
  const enemyCities = getAliveCities(gameState, "enemy");
  const playerUnits = getAliveUnits(gameState, "player");
  const playerCities = getAliveCities(gameState, "player");
  const enemySettlers = enemyUnits.filter((unit) => unit.type === "settler");

  let immediateUnitAttacks = 0;
  let immediateCityAttacks = 0;
  for (const enemyUnit of enemyUnits) {
    immediateUnitAttacks += getAttackableTargets(enemyUnit.id, gameState).length;
    immediateCityAttacks += getAttackableCities(enemyUnit.id, gameState).length;
  }

  const threatenedEnemyCities = getThreatenedCities(gameState).length;
  const playerUnitsNearEnemyCities = playerUnits.filter((unit) => {
    return enemyCities.some((city) => distance(unit, city) <= THREATENED_CITY_DISTANCE);
  }).length;

  return {
    enemyCityCount: enemyCities.length,
    playerCityCount: playerCities.length,
    playerUnitCount: playerUnits.length,
    enemySettlerCount: enemySettlers.length,
    canFoundImmediately: enemySettlers.some((settler) => canFoundCity(settler.id, gameState).ok),
    immediateUnitAttacks,
    immediateCityAttacks,
    threatenedEnemyCities,
    playerUnitsNearEnemyCities,
    lowHealthEnemyUnits: enemyUnits.filter((unit) => unit.health / Math.max(1, unit.maxHealth) < 0.5).length,
    actionableEnemyUnits: enemyUnits.filter((unit) => !unit.hasActed && unit.movementRemaining > 0).length,
  };
}

function getThreatenedCities(gameState) {
  const enemyCities = getAliveCities(gameState, "enemy");
  const playerUnits = getAliveUnits(gameState, "player");
  return enemyCities.filter((city) => playerUnits.some((unit) => distance(unit, city) <= THREATENED_CITY_DISTANCE));
}

function getAliveUnits(gameState, owner) {
  return gameState.units.filter((unit) => unit.owner === owner && unit.health > 0);
}

function getAliveCities(gameState, owner) {
  return gameState.cities.filter((city) => city.owner === owner && city.health > 0);
}

function hasFactionPresence(gameState, owner) {
  return gameState.units.some((unit) => unit.owner === owner && unit.health > 0) || getAliveCities(gameState, owner).length > 0;
}
