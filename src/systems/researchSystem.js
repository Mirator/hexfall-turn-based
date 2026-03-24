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
 * @returns {{ completedTechIds: string[] }}
 */
export function advanceResearch(gameState, points) {
  const completedTechIds = [];
  if (!gameState.research.activeTechId || points <= 0) {
    return { completedTechIds };
  }

  const activeTech = TECH_TREE[gameState.research.activeTechId];
  if (!activeTech) {
    return { completedTechIds };
  }

  gameState.research.progress += points;
  if (gameState.research.progress < activeTech.cost) {
    return { completedTechIds };
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

  return { completedTechIds };
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @returns {string[]}
 */
export function getSelectableTechIds(gameState) {
  return TECH_ORDER.filter((techId) => canSelectResearch(techId, gameState).ok);
}
