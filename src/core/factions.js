import { clampAiFactionCount, DEFAULT_AI_FACTION_COUNT } from "./matchConfig.js";

export const PLAYER_OWNER = "player";
export const AI_OWNER_POOL = ["enemy", "purple", "amber", "teal", "crimson", "onyx"];
export const DEFAULT_AI_OWNERS = AI_OWNER_POOL.slice(0, DEFAULT_AI_FACTION_COUNT);

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
 * @param {import("./types.js").Owner} owner
 * @param {import("./types.js").GameState|undefined|null} [gameState]
 * @returns {import("./types.js").Owner[]}
 */
export function getHostileOwners(owner, gameState = null) {
  return getAllOwners(gameState).filter((candidate) => candidate !== owner);
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
