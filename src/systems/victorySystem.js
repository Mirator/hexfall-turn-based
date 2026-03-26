import { AI_OWNERS } from "../core/factions.js";

/**
 * @param {import("../core/types.js").GameState} gameState
 * @returns {import("../core/types.js").MatchState}
 */
export function evaluateMatchState(gameState) {
  if (gameState.match.status !== "ongoing") {
    return gameState.match;
  }

  const playerUnits = gameState.units.filter((unit) => unit.owner === "player");
  const playerCities = gameState.cities.filter((city) => city.owner === "player");
  const hostileUnits = gameState.units.filter((unit) => AI_OWNERS.includes(unit.owner));
  const hostileCities = gameState.cities.filter((city) => AI_OWNERS.includes(city.owner));

  if (playerUnits.length === 0 && playerCities.length === 0) {
    gameState.match.status = "lost";
    gameState.match.reason = "eliminated";
    return gameState.match;
  }

  if (hostileUnits.length === 0 && hostileCities.length === 0) {
    gameState.match.status = "won";
    gameState.match.reason = "elimination";
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

  return "Victory (Elimination)";
}
