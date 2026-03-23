/**
 * @param {import("../core/types.js").GameState} gameState
 * @returns {import("../core/types.js").GameState}
 */
export function endTurn(gameState) {
  gameState.turnState.turn += 1;
  gameState.selectedUnitId = null;

  for (const unit of gameState.units) {
    if (unit.owner === "player") {
      unit.movementRemaining = unit.maxMovement;
    }
  }

  return gameState;
}
