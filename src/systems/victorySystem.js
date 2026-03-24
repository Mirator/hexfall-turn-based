/**
 * @param {import("../core/types.js").GameState} gameState
 * @returns {import("../core/types.js").MatchState}
 */
export function evaluateMatchState(gameState) {
  if (gameState.match.status !== "ongoing") {
    return gameState.match;
  }

  const playerUnits = gameState.units.filter((unit) => unit.owner === "player");
  const enemyUnits = gameState.units.filter((unit) => unit.owner === "enemy");
  const playerCities = gameState.cities.filter((city) => city.owner === "player");
  const enemyCities = gameState.cities.filter((city) => city.owner === "enemy");

  if (playerUnits.length === 0 && playerCities.length === 0) {
    gameState.match.status = "lost";
    gameState.match.reason = "eliminated";
    return gameState.match;
  }

  if (enemyUnits.length === 0 && enemyCities.length === 0) {
    gameState.match.status = "won";
    gameState.match.reason = "elimination";
    return gameState.match;
  }

  if (gameState.turnState.turn >= gameState.match.holdTurnsTarget) {
    gameState.match.status = "won";
    gameState.match.reason = "hold-turns";
    return gameState.match;
  }

  return gameState.match;
}

/**
 * @param {import("../core/types.js").GameState} gameState
 * @returns {string}
 */
export function getMatchResultLabel(gameState) {
  if (gameState.match.status === "ongoing") {
    return "In Progress";
  }

  if (gameState.match.status === "lost") {
    return "Defeat";
  }

  return gameState.match.reason === "hold-turns" ? "Victory (Hold Turns)" : "Victory (Elimination)";
}
