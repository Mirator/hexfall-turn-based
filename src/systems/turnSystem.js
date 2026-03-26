/**
 * @param {import("../core/types.js").GameState} gameState
 * @returns {import("../core/types.js").GameState}
 */
export function beginEnemyTurn(gameState) {
  gameState.turnState.phase = "enemy";
  gameState.selectedUnitId = null;
  resetMovementForOwner(gameState, "enemy");
  resetMovementForOwner(gameState, "purple");
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
  resetMovementForOwner(gameState, "player");
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
