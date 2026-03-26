export const PLAYER_OWNER = "player";
export const AI_OWNERS = ["enemy", "purple"];
export const ALL_OWNERS = [PLAYER_OWNER, ...AI_OWNERS];

/**
 * @param {unknown} owner
 * @returns {owner is import("./types.js").Owner}
 */
export function isOwner(owner) {
  return ALL_OWNERS.includes(/** @type {import("./types.js").Owner} */ (owner));
}

/**
 * @param {import("./types.js").Owner} owner
 * @returns {owner is import("./types.js").AiOwner}
 */
export function isAiOwner(owner) {
  return AI_OWNERS.includes(/** @type {import("./types.js").AiOwner} */ (owner));
}

/**
 * @param {import("./types.js").Owner} owner
 * @returns {import("./types.js").Owner[]}
 */
export function getHostileOwners(owner) {
  return ALL_OWNERS.filter((candidate) => candidate !== owner);
}

/**
 * @param {import("./types.js").Owner} owner
 * @returns {string}
 */
export function getOwnerLabel(owner) {
  if (owner === "player") {
    return "Player";
  }
  if (owner === "enemy") {
    return "Enemy";
  }
  return "Purple";
}

