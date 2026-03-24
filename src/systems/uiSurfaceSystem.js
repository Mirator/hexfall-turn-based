import { canFoundCity, getFoundCityReasonText } from "./citySystem.js";

/**
 * @param {import("../core/types.js").GameState} gameState
 * @param {import("../core/types.js").Unit|null} selectedUnit
 * @param {import("../core/types.js").City|null} selectedCity
 * @param {import("../core/types.js").Unit[]} attackableTargets
 * @param {import("../core/types.js").City[]} attackableCities
 * @param {{ restartConfirmOpen?: boolean, pendingCityResolution?: import("../core/types.js").PendingCityResolution|null }} [uiContext]
 * @returns {{
 *   uiHints: { primary: string|null, secondary: string|null, level: "info"|"warning"|null },
 *   uiActions: { canFoundCity: boolean, canCycleFocus: boolean, canRestart: boolean, foundCityReason: string|null }
 * }}
 */
export function deriveUiSurface(gameState, selectedUnit, selectedCity, attackableTargets, attackableCities, uiContext = {}) {
  const foundCityCheck = selectedUnit ? canFoundCity(selectedUnit.id, gameState) : { ok: false, reason: "unit-not-found" };
  const canFound = !!selectedUnit && foundCityCheck.ok;
  const foundCityReason = canFound ? null : getFoundCityReasonText(foundCityCheck.reason);

  /** @type {{ primary: string|null, secondary: string|null, level: "info"|"warning"|null }} */
  const uiHints = {
    primary: null,
    secondary: null,
    level: null,
  };

  if (uiContext.pendingCityResolution) {
    uiHints.primary = "City defeated. Choose Capture or Raze.";
    uiHints.secondary = "Resolve city outcome to continue the turn.";
    uiHints.level = "info";
  } else if (uiContext.restartConfirmOpen) {
    uiHints.primary = "Confirm restart or cancel to keep playing.";
    uiHints.level = "info";
  } else if (gameState.match.status !== "ongoing") {
    uiHints.primary = "Match ended. Restart to play again.";
    uiHints.level = "info";
  } else if (gameState.turnState.phase === "enemy") {
    uiHints.primary = "Enemy is taking its turn.";
    uiHints.level = "info";
  } else if (selectedUnit?.type === "settler") {
    if (canFound) {
      uiHints.primary = "Found city now (Found City button or F).";
      uiHints.secondary = "After founding, use Cycle Queue on the new city.";
      uiHints.level = "info";
    } else {
      uiHints.primary = foundCityReason;
      uiHints.level = "warning";
    }
  } else if (selectedCity) {
    uiHints.primary = `City selected: focus ${selectedCity.focus}, identity ${selectedCity.identity}.`;
    uiHints.secondary = "Use Cycle Focus to shift worked tiles, or Cycle Queue for production.";
    uiHints.level = "info";
  } else if (selectedUnit && attackableCities.length > 0) {
    uiHints.primary = "Enemy city in range: click city to assault.";
    uiHints.level = "info";
  } else if (selectedUnit && attackableTargets.length > 0) {
    uiHints.primary = "Enemy in range: click highlighted red target to attack.";
    uiHints.level = "info";
  }

  return {
    uiHints,
    uiActions: {
      canFoundCity: canFound,
      canCycleFocus: !!selectedCity && selectedCity.owner === "player",
      canRestart: true,
      foundCityReason,
    },
  };
}
