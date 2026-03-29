import { getAiOwners, getPlayerOwner } from "../core/factions.js";

/**
 * @param {import("../core/types.js").GameState} gameState
 * @returns {import("../core/types.js").GameState}
 */
export function beginEnemyTurn(gameState) {
  gameState.turnState.phase = "enemy";
  gameState.selectedUnitId = null;
  for (const aiOwner of getAiOwners(gameState)) {
    resetMovementForOwner(gameState, aiOwner);
  }
  return gameState;
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @returns {import("../core/types.js").GameState}
 */
export function beginPlayerTurn(gameState) {
  gameState.turnState.turn += 1;
  gameState.turnState.phase = "player";
  gameState.selectedUnitId = null;
  resetMovementForOwner(gameState, getPlayerOwner(gameState));
  return gameState;
}

/**
 * Backwards-compatible helper: immediately transitions to next player turn.
 * @param {import("../core/types.js").GameState} gameState
 * @returns {import("../core/types.js").GameState}
 */
export function endTurn(gameState) {
  return beginPlayerTurn(gameState);
}

function resetMovementForOwner(gameState, owner) {
  for (const unit of gameState.units) {
    if (unit.owner === owner) {
      unit.movementRemaining = unit.maxMovement;
      unit.hasActed = false;
    }
  }
}
