import { getUnitById } from "../core/gameState.js";

const SKIP_UNIT_REASON_TEXT = {
  "unit-not-found": "Select a unit to issue commands.",
  "unit-already-acted": "This unit already acted this turn.",
  "unit-disabled": "This unit is disabled by gold deficit.",
  "unit-not-player-owned": "Only your units can be commanded.",
};

/**
 * @param {string} unitId
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ ok: boolean, reason?: string }}
 */
export function canSkipUnit(unitId, gameState) {
  const unit = getUnitById(gameState, unitId);
  if (!unit) {
    return { ok: false, reason: "unit-not-found" };
  }
  if (unit.owner !== "player") {
    return { ok: false, reason: "unit-not-player-owned" };
  }
  if (unit.disabled) {
    return { ok: false, reason: "unit-disabled" };
  }
  if (unit.hasActed || unit.movementRemaining <= 0) {
    return { ok: false, reason: "unit-already-acted" };
  }
  return { ok: true };
}

/**
 * @param {string|undefined} reason
 * @returns {string}
 */
export function getSkipUnitReasonText(reason) {
  if (!reason) {
    return "Select a unit to issue commands.";
  }
  return SKIP_UNIT_REASON_TEXT[reason] ?? "Cannot skip this unit right now.";
}

/**
 * @param {string} unitId
 * @param {import("../core/types.js").GameState} gameState
 * @returns {{ ok: boolean, reason?: string }}
 */
export function skipUnit(unitId, gameState) {
  const check = canSkipUnit(unitId, gameState);
  if (!check.ok) {
    return check;
  }

  const unit = getUnitById(gameState, unitId);
  if (!unit) {
    return { ok: false, reason: "unit-not-found" };
  }

  unit.hasActed = true;
  unit.movementRemaining = 0;
  return { ok: true };
}
