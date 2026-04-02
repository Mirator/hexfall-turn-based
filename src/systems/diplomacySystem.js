import {
  DIPLOMACY_STATUS_PEACE,
  DIPLOMACY_STATUS_WAR,
  areOwnersAtWar,
  isOwner,
  setDiplomacyStatus,
} from "../core/factions.js";

/**
 * @param {import("../core/types.js").Owner} initiator
 * @param {import("../core/types.js").Owner} target
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ ok: boolean, reason?: string }}
 */
export function canDeclareWar(initiator, target, gameState) {
  if (!isOwner(initiator, gameState) || !isOwner(target, gameState)) {
    return { ok: false, reason: "owner-not-found" };
  }
  if (initiator === target) {
    return { ok: false, reason: "same-owner" };
  }
  if (areOwnersAtWar(initiator, target, gameState)) {
    return { ok: false, reason: "already-at-war" };
  }
  return { ok: true };
}

/**
 * @param {import("../core/types.js").Owner} initiator
 * @param {import("../core/types.js").Owner} target
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ ok: boolean, reason?: string, changed?: boolean }}
 */
export function declareWar(initiator, target, gameState) {
  const check = canDeclareWar(initiator, target, gameState);
  if (!check.ok) {
    return check;
  }
  const result = setDiplomacyStatus(gameState, initiator, target, DIPLOMACY_STATUS_WAR);
  if (!result.ok) {
    return { ok: false, reason: result.reason ?? "status-change-failed" };
  }
  return { ok: true, changed: !!result.changed };
}

/**
 * @param {import("../core/types.js").Owner} initiator
 * @param {import("../core/types.js").Owner} target
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ ok: boolean, reason?: string }}
 */
export function canOfferPeace(initiator, target, gameState) {
  if (!isOwner(initiator, gameState) || !isOwner(target, gameState)) {
    return { ok: false, reason: "owner-not-found" };
  }
  if (initiator === target) {
    return { ok: false, reason: "same-owner" };
  }
  if (!areOwnersAtWar(initiator, target, gameState)) {
    return { ok: false, reason: "already-at-peace" };
  }
  return { ok: true };
}

/**
 * @param {import("../core/types.js").Owner} initiator
 * @param {import("../core/types.js").Owner} target
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ ok: boolean, reason?: string, changed?: boolean }}
 */
export function offerPeace(initiator, target, gameState) {
  const check = canOfferPeace(initiator, target, gameState);
  if (!check.ok) {
    return check;
  }
  const result = setDiplomacyStatus(gameState, initiator, target, DIPLOMACY_STATUS_PEACE);
  if (!result.ok) {
    return { ok: false, reason: result.reason ?? "status-change-failed" };
  }
  return { ok: true, changed: !!result.changed };
}

/**
 * @param {string|undefined|null} reason
 * @returns {string}
 */
export function getDiplomacyActionReasonText(reason) {
  if (reason === "owner-not-found") {
    return "Diplomacy target is unavailable.";
  }
  if (reason === "same-owner") {
    return "Cannot negotiate with your own faction.";
  }
  if (reason === "already-at-war") {
    return "You are already at war.";
  }
  if (reason === "already-at-peace") {
    return "You are already at peace.";
  }
  return "Diplomacy action is unavailable right now.";
}

