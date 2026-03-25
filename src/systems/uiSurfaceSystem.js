import { getAllUnitTypes, getUnitDefinition } from "../core/unitData.js";
import {
  CITY_QUEUE_MAX,
  canFoundCity,
  getAllProductionBuildings,
  getBuildingDefinition,
  getFoundCityReasonText,
  isBuildingUnlocked,
} from "./citySystem.js";
import { canSkipUnit, getSkipUnitReasonText } from "./unitActionSystem.js";

/**
 * @typedef {{ kind: "unit"|"building", id: string }} QueueItem
 */

/**
 * @param {import("../core/types.js").GameState} gameState
 * @param {import("../core/types.js").Unit|null} selectedUnit
 * @param {import("../core/types.js").City|null} selectedCity
 * @param {import("../core/types.js").Unit[]} attackableTargets
 * @param {import("../core/types.js").City[]} attackableCities
 * @param {{ restartConfirmOpen?: boolean, pendingCityResolution?: import("../core/types.js").PendingCityResolution|null }} [uiContext]
 * @returns {{
 *   uiHints: { primary: string|null, secondary: string|null, level: "info"|"warning"|null },
 *   uiActions: {
 *     canFoundCity: boolean,
 *     canSkipUnit: boolean,
 *     canCycleFocus: boolean,
 *     canSetCityFocus: boolean,
 *     canSetCityProductionTab: boolean,
 *     canQueueProduction: boolean,
 *     canQueueUnits: boolean,
 *     canQueueBuildings: boolean,
 *     canRestart: boolean,
 *     contextMenuType: "city"|"unit"|null,
 *     foundCityReason: string|null,
 *     skipUnitReason: string|null,
 *     cityQueueMax: number,
 *     cityQueueReason: string|null,
 *     cityProductionTab: "units"|"buildings",
 *     cityQueueItems: QueueItem[],
 *     cityProductionChoices: Array<{ type: string, cost: number, unlocked: boolean, affordable: boolean }>,
 *     cityBuildingChoices: Array<{ id: string, cost: number, unlocked: boolean, affordable: boolean, alreadyBuilt: boolean, alreadyQueued: boolean }>
 *   }
 * }}
 */
export function deriveUiSurface(gameState, selectedUnit, selectedCity, attackableTargets, attackableCities, uiContext = {}) {
  const isPlayerTurn = gameState.turnState.phase === "player" && gameState.match.status === "ongoing";
  const foundCityCheck = selectedUnit ? canFoundCity(selectedUnit.id, gameState) : { ok: false, reason: "unit-not-found" };
  const canFound = !!selectedUnit && foundCityCheck.ok;
  const foundCityReason = canFound ? null : getFoundCityReasonText(foundCityCheck.reason);
  const skipCheck = selectedUnit ? canSkipUnit(selectedUnit.id, gameState) : { ok: false, reason: "unit-not-found" };
  const canSkip = !!selectedUnit && skipCheck.ok;
  const skipUnitReason = canSkip ? null : getSkipUnitReasonText(skipCheck.reason);
  const selectedPlayerCity = !!selectedCity && selectedCity.owner === "player";
  const selectedPlayerUnit = !!selectedUnit && selectedUnit.owner === "player";
  const unlockedUnits = new Set(gameState.unlocks.units);
  const cityEconomyBucket = selectedCity ? gameState.economy[selectedCity.owner] : gameState.economy.player;
  const queueItems = selectedPlayerCity ? normalizeQueueItems(selectedCity.queue) : [];
  const cityProductionTab = selectedPlayerCity && selectedCity.productionTab === "buildings" ? "buildings" : "units";
  const queuedBuildingIds = new Set(queueItems.filter((item) => item.kind === "building").map((item) => item.id));
  const builtBuildingIds = new Set(selectedPlayerCity ? selectedCity.buildings ?? [] : []);

  const cityProductionChoices = getAllUnitTypes().map((type) => {
    const definition = getUnitDefinition(/** @type {any} */ (type));
    const unlocked = unlockedUnits.has(type);
    return {
      type,
      cost: definition.productionCost,
      unlocked,
      affordable: cityEconomyBucket.productionStock >= definition.productionCost,
    };
  });

  const cityBuildingChoices = getAllProductionBuildings().map((id) => {
    const definition = getBuildingDefinition(id);
    const unlocked = isBuildingUnlocked(id, gameState);
    const alreadyBuilt = builtBuildingIds.has(id);
    const alreadyQueued = queuedBuildingIds.has(id);
    return {
      id,
      cost: definition?.productionCost ?? 0,
      unlocked,
      affordable: cityEconomyBucket.productionStock >= (definition?.productionCost ?? Number.POSITIVE_INFINITY),
      alreadyBuilt,
      alreadyQueued,
    };
  });

  const hasUnlockedUnits = cityProductionChoices.some((choice) => choice.unlocked);
  const hasUnlockedBuildings = cityBuildingChoices.some((choice) => choice.unlocked);
  const hasQueueableBuildings = cityBuildingChoices.some(
    (choice) => choice.unlocked && !choice.alreadyBuilt && !choice.alreadyQueued
  );

  const isQueueFull = selectedPlayerCity ? queueItems.length >= CITY_QUEUE_MAX : false;
  let cityQueueReason = null;
  if (!selectedPlayerCity) {
    cityQueueReason = "Select one of your cities to manage production.";
  } else if (isQueueFull) {
    cityQueueReason = `Queue is full (${CITY_QUEUE_MAX}/${CITY_QUEUE_MAX}). Remove one item first.`;
  } else if (cityProductionTab === "units" && !hasUnlockedUnits) {
    cityQueueReason = "No unlocked units available for production.";
  } else if (cityProductionTab === "buildings" && !hasUnlockedBuildings) {
    cityQueueReason = "No unlocked buildings available yet.";
  } else if (cityProductionTab === "buildings" && !hasQueueableBuildings) {
    cityQueueReason = "All unlocked buildings are already built or queued.";
  }

  const canSetCityFocus = selectedPlayerCity;
  const canQueueUnits = selectedPlayerCity && !isQueueFull && hasUnlockedUnits;
  const canQueueBuildings = selectedPlayerCity && !isQueueFull && hasQueueableBuildings;
  const canQueueProduction = cityProductionTab === "units" ? canQueueUnits : canQueueBuildings;
  const contextMenuType = isPlayerTurn && selectedPlayerCity ? "city" : isPlayerTurn && selectedPlayerUnit ? "unit" : null;

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
      uiHints.secondary = "After founding, use the city panel to set focus and queue.";
      uiHints.level = "info";
    } else {
      uiHints.primary = foundCityReason;
      uiHints.level = "warning";
    }
  } else if (selectedCity) {
    uiHints.primary = `City selected: focus ${selectedCity.focus}, identity ${selectedCity.identity}.`;
    uiHints.secondary = canQueueProduction
      ? `Use the bottom city panel to manage ${cityProductionTab}.`
      : (cityQueueReason ?? "Use the bottom city panel to manage this city.");
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
      canSkipUnit: canSkip,
      canCycleFocus: canSetCityFocus,
      canSetCityFocus,
      canSetCityProductionTab: selectedPlayerCity,
      canQueueProduction,
      canQueueUnits,
      canQueueBuildings,
      canRestart: true,
      contextMenuType,
      foundCityReason,
      skipUnitReason,
      cityQueueMax: CITY_QUEUE_MAX,
      cityQueueReason,
      cityProductionTab,
      cityQueueItems: queueItems,
      cityProductionChoices,
      cityBuildingChoices,
    },
  };
}

/**
 * @param {unknown} queue
 * @returns {QueueItem[]}
 */
function normalizeQueueItems(queue) {
  if (!Array.isArray(queue)) {
    return [];
  }

  /** @type {QueueItem[]} */
  const items = [];
  for (const candidate of queue) {
    if (typeof candidate === "string") {
      items.push({ kind: "unit", id: candidate });
      continue;
    }
    if (!candidate || typeof candidate !== "object") {
      continue;
    }
    const kind = /** @type {{ kind?: unknown }} */ (candidate).kind;
    const id = /** @type {{ id?: unknown }} */ (candidate).id;
    if ((kind === "unit" || kind === "building") && typeof id === "string") {
      items.push({ kind, id });
    }
  }
  return items;
}
