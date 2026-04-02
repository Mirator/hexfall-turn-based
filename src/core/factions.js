import { clampAiFactionCount, DEFAULT_AI_FACTION_COUNT } from "./matchConfig.js";

export const PLAYER_OWNER = "player";
export const AI_OWNER_POOL = ["enemy", "purple", "amber", "teal", "crimson", "onyx"];
export const DEFAULT_AI_OWNERS = AI_OWNER_POOL.slice(0, DEFAULT_AI_FACTION_COUNT);
export const DIPLOMACY_STATUS_SELF = "self";
export const DIPLOMACY_STATUS_WAR = "war";
export const DIPLOMACY_STATUS_PEACE = "peace";

// Backwards-compatible constants for modules/tests that still import legacy values.
export const AI_OWNERS = [...DEFAULT_AI_OWNERS];
export const ALL_OWNERS = [PLAYER_OWNER, ...AI_OWNERS];

const OWNER_LABELS = {
  player: "Player",
  enemy: "Enemy",
  purple: "Purple",
  amber: "Amber",
  teal: "Teal",
  crimson: "Crimson",
  onyx: "Onyx",
};

/**
 * @typedef {{
 *   playerOwner: string,
 *   aiOwners: string[],
 *   allOwners: string[],
 *   labels: Record<string, string>
 * }} FactionMetadata
 */

/**
 * @param {number} aiFactionCount
 * @returns {string[]}
 */
export function buildAiOwners(aiFactionCount) {
  const count = clampAiFactionCount(aiFactionCount);
  return AI_OWNER_POOL.slice(0, count);
}

/**
 * @param {string[]} [aiOwners]
 * @returns {FactionMetadata}
 */
export function createFactionMetadata(aiOwners = DEFAULT_AI_OWNERS) {
  const dedupedAiOwners = [...new Set((aiOwners ?? []).filter((owner) => owner && owner !== PLAYER_OWNER))];
  const allOwners = [PLAYER_OWNER, ...dedupedAiOwners];
  const labels = Object.fromEntries(allOwners.map((owner) => [owner, OWNER_LABELS[owner] ?? titleCase(owner)]));
  return {
    playerOwner: PLAYER_OWNER,
    aiOwners: dedupedAiOwners,
    allOwners,
    labels,
  };
}

/**
 * @param {import("./types.js").GameState|undefined|null} gameState
 * @returns {FactionMetadata}
 */
export function getFactionMetadata(gameState) {
  const factions = gameState?.factions;
  if (factions && Array.isArray(factions.allOwners) && Array.isArray(factions.aiOwners)) {
    return createFactionMetadata(factions.aiOwners);
  }
  return createFactionMetadata(DEFAULT_AI_OWNERS);
}

/**
 * @param {import("./types.js").GameState|undefined|null} gameState
 * @returns {string}
 */
export function getPlayerOwner(gameState) {
  return getFactionMetadata(gameState).playerOwner;
}

/**
 * @param {import("./types.js").GameState|undefined|null} gameState
 * @returns {string[]}
 */
export function getAiOwners(gameState) {
  return getFactionMetadata(gameState).aiOwners;
}

/**
 * @param {import("./types.js").GameState|undefined|null} gameState
 * @returns {string[]}
 */
export function getAllOwners(gameState) {
  return getFactionMetadata(gameState).allOwners;
}

/**
 * @param {unknown} owner
 * @param {import("./types.js").GameState|undefined|null} [gameState]
 * @returns {owner is import("./types.js").Owner}
 */
export function isOwner(owner, gameState = null) {
  return getAllOwners(gameState).includes(/** @type {import("./types.js").Owner} */ (owner));
}

/**
 * @param {unknown} owner
 * @param {import("./types.js").GameState|undefined|null} [gameState]
 * @returns {owner is import("./types.js").AiOwner}
 */
export function isAiOwner(owner, gameState = null) {
  return getAiOwners(gameState).includes(/** @type {import("./types.js").AiOwner} */ (owner));
}

/**
 * @param {import("./types.js").Owner[]|undefined|null} [owners]
 * @returns {{ byOwner: Record<string, Record<string, "self"|"war"|"peace">>, lastChangeTurn: number|null }}
 */
export function createInitialDiplomacyState(owners = null) {
  const normalizedOwners = normalizeOwnerList(owners ?? getAllOwners(null));
  /** @type {Record<string, Record<string, "self"|"war"|"peace">>} */
  const byOwner = {};
  for (const owner of normalizedOwners) {
    byOwner[owner] = {};
    for (const candidate of normalizedOwners) {
      byOwner[owner][candidate] = owner === candidate ? DIPLOMACY_STATUS_SELF : DIPLOMACY_STATUS_WAR;
    }
  }

  return {
    byOwner,
    lastChangeTurn: null,
  };
}

/**
 * @param {import("./types.js").GameState|undefined|null} gameState
 * @returns {{ byOwner: Record<string, Record<string, "self"|"war"|"peace">>, lastChangeTurn: number|null }}
 */
export function normalizeDiplomacyState(gameState) {
  const owners = getAllOwners(gameState);
  const fallback = createInitialDiplomacyState(owners);
  if (!gameState || typeof gameState !== "object") {
    return fallback;
  }

  if (!gameState.diplomacy || typeof gameState.diplomacy !== "object") {
    gameState.diplomacy = fallback;
  }

  if (!gameState.diplomacy.byOwner || typeof gameState.diplomacy.byOwner !== "object") {
    gameState.diplomacy.byOwner = fallback.byOwner;
  }

  for (const owner of owners) {
    const currentRow = gameState.diplomacy.byOwner[owner];
    if (!currentRow || typeof currentRow !== "object") {
      gameState.diplomacy.byOwner[owner] = { ...fallback.byOwner[owner] };
      continue;
    }

    for (const candidate of owners) {
      const defaultStatus = owner === candidate ? DIPLOMACY_STATUS_SELF : DIPLOMACY_STATUS_WAR;
      currentRow[candidate] = normalizeDiplomacyStatus(currentRow[candidate], defaultStatus);
    }

    for (const knownCandidate of Object.keys(currentRow)) {
      if (!owners.includes(knownCandidate)) {
        delete currentRow[knownCandidate];
      }
    }
  }

  for (const owner of Object.keys(gameState.diplomacy.byOwner)) {
    if (!owners.includes(owner)) {
      delete gameState.diplomacy.byOwner[owner];
    }
  }

  for (let i = 0; i < owners.length; i += 1) {
    const owner = owners[i];
    const ownerRow = gameState.diplomacy.byOwner[owner] ?? (gameState.diplomacy.byOwner[owner] = {});
    ownerRow[owner] = DIPLOMACY_STATUS_SELF;

    for (let j = i + 1; j < owners.length; j += 1) {
      const candidate = owners[j];
      const candidateRow = gameState.diplomacy.byOwner[candidate] ?? (gameState.diplomacy.byOwner[candidate] = {});
      const resolvedStatus = resolvePairDiplomacyStatus(ownerRow[candidate], candidateRow[owner]);
      ownerRow[candidate] = resolvedStatus;
      candidateRow[owner] = resolvedStatus;
    }
  }

  const normalizedTurn = Number.isFinite(gameState.diplomacy.lastChangeTurn)
    ? Math.max(1, Math.round(gameState.diplomacy.lastChangeTurn))
    : null;
  gameState.diplomacy.lastChangeTurn = normalizedTurn;
  return gameState.diplomacy;
}

/**
 * @param {import("./types.js").Owner} owner
 * @param {import("./types.js").Owner} candidate
 * @param {import("./types.js").GameState|undefined|null} [gameState]
 * @returns {"self"|"war"|"peace"}
 */
export function getDiplomacyStatus(owner, candidate, gameState = null) {
  if (owner === candidate) {
    return DIPLOMACY_STATUS_SELF;
  }

  if (!isOwner(owner, gameState) || !isOwner(candidate, gameState)) {
    return DIPLOMACY_STATUS_WAR;
  }

  const diplomacy = normalizeDiplomacyState(gameState);
  const byOwner = diplomacy.byOwner?.[owner] ?? null;
  if (!byOwner || typeof byOwner !== "object") {
    return DIPLOMACY_STATUS_WAR;
  }
  return normalizeDiplomacyStatus(byOwner[candidate], DIPLOMACY_STATUS_WAR);
}

/**
 * @param {import("./types.js").Owner} owner
 * @param {import("./types.js").Owner} candidate
 * @param {import("./types.js").GameState|undefined|null} [gameState]
 * @returns {boolean}
 */
export function areOwnersAtWar(owner, candidate, gameState = null) {
  if (owner === candidate) {
    return false;
  }
  return getDiplomacyStatus(owner, candidate, gameState) === DIPLOMACY_STATUS_WAR;
}

/**
 * @param {import("./types.js").GameState} gameState
 * @param {import("./types.js").Owner} owner
 * @param {import("./types.js").Owner} candidate
 * @param {"war"|"peace"} status
 * @returns {{ ok: boolean, reason?: string, status?: "war"|"peace", changed?: boolean }}
 */
export function setDiplomacyStatus(gameState, owner, candidate, status) {
  if (!gameState || typeof gameState !== "object") {
    return { ok: false, reason: "game-state-required" };
  }
  if (!isOwner(owner, gameState) || !isOwner(candidate, gameState)) {
    return { ok: false, reason: "owner-not-found" };
  }
  if (owner === candidate) {
    return { ok: false, reason: "same-owner" };
  }
  if (status !== DIPLOMACY_STATUS_WAR && status !== DIPLOMACY_STATUS_PEACE) {
    return { ok: false, reason: "invalid-status" };
  }

  const diplomacy = normalizeDiplomacyState(gameState);
  const currentStatus = getDiplomacyStatus(owner, candidate, gameState);
  if (currentStatus === status) {
    return { ok: true, status, changed: false };
  }

  diplomacy.byOwner[owner][candidate] = status;
  diplomacy.byOwner[candidate][owner] = status;
  diplomacy.lastChangeTurn = Number.isFinite(gameState.turnState?.turn) ? Math.max(1, Math.round(gameState.turnState.turn)) : null;
  return { ok: true, status, changed: true };
}

/**
 * @param {import("./types.js").Owner} owner
 * @param {import("./types.js").GameState|undefined|null} [gameState]
 * @returns {import("./types.js").Owner[]}
 */
export function getHostileOwners(owner, gameState = null) {
  return getAllOwners(gameState).filter((candidate) => candidate !== owner && areOwnersAtWar(owner, candidate, gameState));
}

/**
 * @param {import("./types.js").Owner} owner
 * @param {import("./types.js").GameState|undefined|null} [gameState]
 * @returns {string}
 */
export function getOwnerLabel(owner, gameState = null) {
  const labels = getFactionMetadata(gameState).labels;
  return labels[owner] ?? OWNER_LABELS[owner] ?? titleCase(owner);
}

/**
 * @param {string} value
 * @returns {string}
 */
function titleCase(value) {
  if (!value) {
    return "";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function normalizeOwnerList(owners) {
  if (!Array.isArray(owners)) {
    return [];
  }
  return [...new Set(owners.filter((owner) => typeof owner === "string" && owner.length > 0))];
}

function normalizeDiplomacyStatus(status, fallback) {
  if (status === DIPLOMACY_STATUS_SELF || status === DIPLOMACY_STATUS_WAR || status === DIPLOMACY_STATUS_PEACE) {
    return status;
  }
  return fallback;
}

function resolvePairDiplomacyStatus(statusA, statusB) {
  const normalizedA = normalizeDiplomacyStatus(statusA, DIPLOMACY_STATUS_WAR);
  const normalizedB = normalizeDiplomacyStatus(statusB, DIPLOMACY_STATUS_WAR);
  if (normalizedA === DIPLOMACY_STATUS_WAR || normalizedB === DIPLOMACY_STATUS_WAR) {
    return DIPLOMACY_STATUS_WAR;
  }
  return DIPLOMACY_STATUS_PEACE;
}
