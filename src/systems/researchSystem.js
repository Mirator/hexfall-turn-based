import { TECH_ORDER, TECH_TREE } from "../core/techTree.js";

/**
 * @param {string} techId
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ ok: boolean, reason?: string }}
 */
export function canSelectResearch(techId, gameState) {
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
  const check = canSelectResearch(techId, gameState);
  if (!check.ok) {
    return check;
  }

  if (gameState.research.activeTechId !== techId) {
    gameState.research.activeTechId = techId;
    gameState.research.progress = 0;
  }
  return { ok: true };
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ selected: string|null }}
 */
export function cycleResearch(gameState) {
  const available = getSelectableTechIds(gameState);
  if (available.length === 0) {
    gameState.research.activeTechId = null;
    gameState.research.progress = 0;
    return { selected: null };
  }

  const currentId = gameState.research.activeTechId;
  const currentIndex = available.indexOf(currentId ?? "");
  const nextId = available[(currentIndex + 1 + available.length) % available.length];
  selectResearch(nextId, gameState);
  return { selected: nextId };
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @param {number} points
 * @returns {{ completedTechIds: string[], spentPoints: number, remainingPoints: number }}
 */
export function advanceResearch(gameState, points) {
  const completedTechIds = [];
  let remainingPoints = Math.max(0, points);
  let spentPoints = 0;

  while (remainingPoints > 0 && gameState.research.activeTechId) {
    const activeTech = TECH_TREE[gameState.research.activeTechId];
    if (!activeTech) {
      break;
    }

    const remainingCost = Math.max(0, activeTech.cost - gameState.research.progress);
    const spend = Math.min(remainingPoints, remainingCost);
    gameState.research.progress += spend;
    remainingPoints -= spend;
    spentPoints += spend;

    if (gameState.research.progress < activeTech.cost) {
      break;
    }

    gameState.research.completedTechIds.push(activeTech.id);
    completedTechIds.push(activeTech.id);
    gameState.research.progress = 0;
    gameState.research.activeTechId = null;

    if (activeTech.unlocks.units) {
      for (const unlockedUnit of activeTech.unlocks.units) {
        if (!gameState.unlocks.units.includes(unlockedUnit)) {
          gameState.unlocks.units.push(unlockedUnit);
        }
      }
    }

    const nextAvailableTech = getSelectableTechIds(gameState)[0] ?? null;
    if (nextAvailableTech) {
      gameState.research.activeTechId = nextAvailableTech;
    }
  }

  return { completedTechIds, spentPoints, remainingPoints };
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @param {import("../core/types.js").Owner} owner
 * @param {number} baseIncome
 * @returns {{ completedTechIds: string[], spentScience: number, remainingScience: number, income: number }}
 */
export function consumeScienceStock(gameState, owner, baseIncome = 1) {
  const economy = gameState.economy[owner];
  if (!economy) {
    return { completedTechIds: [], spentScience: 0, remainingScience: 0, income: 0 };
  }

  const normalizedBase = Math.max(0, baseIncome);
  economy.scienceStock += normalizedBase;
  const income = normalizedBase + economy.lastTurnIncome.science;
  const result = advanceResearch(gameState, economy.scienceStock);
  economy.scienceStock = Math.max(0, economy.scienceStock - result.spentPoints);

  return {
    completedTechIds: result.completedTechIds,
    spentScience: result.spentPoints,
    remainingScience: economy.scienceStock,
    income,
  };
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @returns {string[]}
 */
export function getSelectableTechIds(gameState) {
  return TECH_ORDER.filter((techId) => canSelectResearch(techId, gameState).ok);
}
