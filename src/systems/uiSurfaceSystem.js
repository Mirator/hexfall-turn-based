import { TECH_TREE } from "../core/techTree.js";
import { getAllUnitTypes, getUnitDefinition } from "../core/unitData.js";
import {
  CITY_QUEUE_MAX,
  canFoundCity,
  getAllProductionBuildings,
  getBuildingDefinition,
  getFoundCityReasonText,
  isBuildingUnlocked,
  previewCityYieldForFocus,
} from "./citySystem.js";
import { canSkipUnit, getSkipUnitReasonText } from "./unitActionSystem.js";

const FOCUS_ORDER = ["balanced", "food", "production", "science"];
const FOCUS_DESCRIPTIONS = {
  balanced: "Balanced picks the strongest combined yields.",
  food: "Food prioritizes food-rich worked tiles.",
  production: "Production prioritizes hammer-rich worked tiles.",
  science: "Science prioritizes science-rich worked tiles.",
};

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
 *     cityProductionStock: number,
 *     cityLocalProduction: number,
 *     cityFocusChoices: Array<{ focus: "balanced"|"food"|"production"|"science", label: string, description: string, active: boolean, projectedYield: { food: number, production: number, science: number } }>,
 *     cityQueueSlots: Array<{
 *       index: number,
 *       empty: boolean,
 *       kind: "unit"|"building"|null,
 *       id: string|null,
 *       label: string,
 *       cost: number,
 *       etaTurns: number|null,
 *       statusTag: string|null,
 *       blocked: boolean,
 *       blockedReason: string|null,
 *       canMoveUp: boolean,
 *       canMoveDown: boolean,
 *       canRemove: boolean
 *     }>,
 *     cityProductionChoices: Array<{
 *       type: string,
 *       cost: number,
 *       unlocked: boolean,
 *       affordable: boolean,
 *       queueable: boolean,
 *       reasonCode: string|null,
 *       reasonText: string|null,
 *       stateTag: string|null,
 *       unlockTechId: string|null,
 *       unlockTechName: string|null,
 *       etaTurns: number
 *     }>,
 *     cityBuildingChoices: Array<{
 *       id: string,
 *       cost: number,
 *       unlocked: boolean,
 *       affordable: boolean,
 *       queueable: boolean,
 *       alreadyBuilt: boolean,
 *       alreadyQueued: boolean,
 *       reasonCode: string|null,
 *       reasonText: string|null,
 *       stateTag: string|null,
 *       unlockTechId: string|null,
 *       unlockTechName: string|null,
 *       etaTurns: number
 *     }>,
 *     disabledActionHints: Record<string, string>
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
  const isQueueFull = selectedPlayerCity ? queueItems.length >= CITY_QUEUE_MAX : false;
  const productionStock = cityEconomyBucket.productionStock ?? 0;
  const localProduction = selectedPlayerCity ? Math.max(0, selectedCity.yieldLastTurn?.production ?? 0) : 0;
  const productionRate = Math.max(1, localProduction);

  const cityProductionChoices = getAllUnitTypes().map((type) => {
    const definition = getUnitDefinition(/** @type {any} */ (type));
    const cost = definition.productionCost;
    const unlocked = unlockedUnits.has(type);
    const affordable = productionStock >= cost;
    const queueable = selectedPlayerCity && !isQueueFull && unlocked;
    const reason = getUnitQueueReason({
      selectedPlayerCity,
      isQueueFull,
      unlocked,
      unlockTechId: definition.unlockedByTech ?? null,
    });
    return {
      type,
      cost,
      unlocked,
      affordable,
      queueable,
      reasonCode: reason.code,
      reasonText: reason.text,
      stateTag: reason.tag,
      unlockTechId: definition.unlockedByTech ?? null,
      unlockTechName: definition.unlockedByTech ? getTechName(definition.unlockedByTech) : null,
      etaTurns: computeEtaTurns(cost, productionStock, productionRate),
    };
  });

  const cityBuildingChoices = getAllProductionBuildings().map((id) => {
    const definition = getBuildingDefinition(id);
    const cost = definition?.productionCost ?? 0;
    const unlocked = isBuildingUnlocked(id, gameState);
    const alreadyBuilt = builtBuildingIds.has(id);
    const alreadyQueued = queuedBuildingIds.has(id);
    const affordable = productionStock >= cost;
    const queueable = selectedPlayerCity && !isQueueFull && unlocked && !alreadyBuilt && !alreadyQueued;
    const reason = getBuildingQueueReason({
      selectedPlayerCity,
      isQueueFull,
      unlocked,
      alreadyBuilt,
      alreadyQueued,
      unlockTechId: definition?.unlockedByTech ?? null,
    });
    return {
      id,
      cost,
      unlocked,
      affordable,
      queueable,
      alreadyBuilt,
      alreadyQueued,
      reasonCode: reason.code,
      reasonText: reason.text,
      stateTag: reason.tag,
      unlockTechId: definition?.unlockedByTech ?? null,
      unlockTechName: definition?.unlockedByTech ? getTechName(definition.unlockedByTech) : null,
      etaTurns: computeEtaTurns(cost, productionStock, productionRate),
    };
  });

  const hasUnlockedUnits = cityProductionChoices.some((choice) => choice.unlocked);
  const hasUnlockedBuildings = cityBuildingChoices.some((choice) => choice.unlocked);
  const hasQueueableBuildings = cityBuildingChoices.some((choice) => choice.queueable);

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

  const cityFocusChoices = selectedPlayerCity
    ? FOCUS_ORDER.map((focus) => {
        const preview = previewCityYieldForFocus(selectedCity.id, /** @type {"balanced"|"food"|"production"|"science"} */ (focus), gameState);
        return {
          focus: /** @type {"balanced"|"food"|"production"|"science"} */ (focus),
          label: capitalizeLabel(focus),
          description: FOCUS_DESCRIPTIONS[focus],
          active: selectedCity.focus === focus,
          projectedYield: preview.ok
            ? {
                food: preview.yield?.food ?? 0,
                production: preview.yield?.production ?? 0,
                science: preview.yield?.science ?? 0,
              }
            : {
                food: selectedCity.yieldLastTurn?.food ?? 0,
                production: selectedCity.yieldLastTurn?.production ?? 0,
                science: selectedCity.yieldLastTurn?.science ?? 0,
              },
        };
      })
    : [];

  const cityQueueSlots = buildQueueSlots({
    queueItems,
    productionStock,
    productionRate,
    selectedPlayerCity,
  });

  const disabledActionHints = buildDisabledActionHints({
    foundCityReason,
    skipUnitReason,
    cityQueueReason,
    cityProductionChoices,
    cityBuildingChoices,
    cityQueueSlots,
  });

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
    uiHints.primary = "AI factions are taking their turn.";
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
      ? `Focus changes worked tile priorities (not flat bonuses).`
      : (cityQueueReason ?? "Use the bottom city panel to manage this city.");
    uiHints.level = "info";
  } else if (selectedUnit && attackableCities.length > 0) {
    uiHints.primary = "Hostile city in range: click city to assault.";
    uiHints.level = "info";
  } else if (selectedUnit && attackableTargets.length > 0) {
    uiHints.primary = "Hostile unit in range: click highlighted target to attack.";
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
      cityProductionStock: productionStock,
      cityLocalProduction: localProduction,
      cityFocusChoices,
      cityQueueSlots,
      cityProductionChoices,
      cityBuildingChoices,
      disabledActionHints,
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

function getUnitQueueReason({ selectedPlayerCity, isQueueFull, unlocked, unlockTechId }) {
  if (!selectedPlayerCity) {
    return {
      code: "city-not-selected",
      text: "Select one of your cities to manage production.",
      tag: null,
    };
  }
  if (isQueueFull) {
    return {
      code: "queue-full",
      text: `Queue is full (${CITY_QUEUE_MAX}/${CITY_QUEUE_MAX}). Remove one item first.`,
      tag: "Queue Full",
    };
  }
  if (!unlocked) {
    const techName = unlockTechId ? getTechName(unlockTechId) : "research";
    return {
      code: "locked",
      text: `Unit is locked until ${techName}.`,
      tag: "Locked",
    };
  }
  return { code: null, text: null, tag: null };
}

function getBuildingQueueReason({ selectedPlayerCity, isQueueFull, unlocked, alreadyBuilt, alreadyQueued, unlockTechId }) {
  if (!selectedPlayerCity) {
    return {
      code: "city-not-selected",
      text: "Select one of your cities to manage production.",
      tag: null,
    };
  }
  if (isQueueFull) {
    return {
      code: "queue-full",
      text: `Queue is full (${CITY_QUEUE_MAX}/${CITY_QUEUE_MAX}). Remove one item first.`,
      tag: "Queue Full",
    };
  }
  if (!unlocked) {
    const techName = unlockTechId ? getTechName(unlockTechId) : "research";
    return {
      code: "locked",
      text: `Building is locked until ${techName}.`,
      tag: "Locked",
    };
  }
  if (alreadyBuilt) {
    return {
      code: "already-built",
      text: "This building already exists in the city.",
      tag: "Built",
    };
  }
  if (alreadyQueued) {
    return {
      code: "already-queued",
      text: "This building is already queued.",
      tag: "Queued",
    };
  }
  return { code: null, text: null, tag: null };
}

function buildQueueSlots({ queueItems, productionStock, productionRate, selectedPlayerCity }) {
  const slots = [];
  let runningStock = Math.max(0, productionStock);

  for (let index = 0; index < CITY_QUEUE_MAX; index += 1) {
    const queueItem = queueItems[index] ?? null;
    if (!queueItem) {
      slots.push({
        index,
        empty: true,
        kind: null,
        id: null,
        label: `${index + 1}. Empty`,
        cost: 0,
        etaTurns: null,
        statusTag: "Empty",
        blocked: true,
        blockedReason: "Queue slot is empty.",
        canMoveUp: false,
        canMoveDown: false,
        canRemove: false,
      });
      continue;
    }

    const cost = getQueueItemCost(queueItem);
    const etaTurns = computeEtaTurns(cost, runningStock, productionRate);
    const buildableNow = runningStock >= cost;
    if (buildableNow) {
      runningStock -= cost;
    } else {
      const requiredTurns = etaTurns;
      runningStock = runningStock + requiredTurns * productionRate - cost;
    }

    const label = `${index + 1}. ${formatQueueItemLabel(queueItem)} (${cost})`;
    slots.push({
      index,
      empty: false,
      kind: queueItem.kind,
      id: queueItem.id,
      label,
      cost,
      etaTurns,
      statusTag: etaTurns === 0 ? "Ready" : `${etaTurns}t`,
      blocked: false,
      blockedReason: null,
      canMoveUp: selectedPlayerCity && index > 0,
      canMoveDown: selectedPlayerCity && index < queueItems.length - 1,
      canRemove: selectedPlayerCity,
    });
  }
  return slots;
}

function buildDisabledActionHints({
  foundCityReason,
  skipUnitReason,
  cityQueueReason,
  cityProductionChoices,
  cityBuildingChoices,
  cityQueueSlots,
}) {
  /** @type {Record<string, string>} */
  const hints = {};
  if (foundCityReason) {
    hints["unit-found-city"] = foundCityReason;
  }
  if (skipUnitReason) {
    hints["unit-skip"] = skipUnitReason;
  }

  for (const choice of cityProductionChoices) {
    const actionId = `city-enqueue-${choice.type}`;
    if (choice.reasonText) {
      hints[actionId] = choice.reasonText;
    } else if (!choice.affordable) {
      hints[actionId] = "Not enough production stock yet. You can still queue it.";
    }
  }

  for (const choice of cityBuildingChoices) {
    const actionId = `city-enqueue-building-${choice.id}`;
    if (choice.reasonText) {
      hints[actionId] = choice.reasonText;
    } else if (!choice.affordable) {
      hints[actionId] = "Not enough production stock yet. You can still queue it.";
    }
  }

  for (const slot of cityQueueSlots) {
    const moveUpAction = `city-queue-move-up-${slot.index}`;
    const moveDownAction = `city-queue-move-down-${slot.index}`;
    const removeAction = `city-queue-remove-${slot.index}`;
    if (!slot.canMoveUp) {
      hints[moveUpAction] = slot.empty ? "Queue slot is empty." : "This item is already at the top.";
    }
    if (!slot.canMoveDown) {
      hints[moveDownAction] = slot.empty ? "Queue slot is empty." : "This item is already at the bottom.";
    }
    if (!slot.canRemove) {
      hints[removeAction] = slot.empty ? "Queue slot is empty." : (cityQueueReason ?? "Cannot edit queue right now.");
    }
  }

  if (cityQueueReason) {
    hints["city-queue-general"] = cityQueueReason;
  }
  return hints;
}

function computeEtaTurns(cost, stock, productionRate) {
  return Math.max(0, Math.ceil(Math.max(0, cost - stock) / Math.max(1, productionRate)));
}

function getQueueItemCost(queueItem) {
  if (queueItem.kind === "building") {
    return getBuildingDefinition(/** @type {"granary"|"workshop"|"monument"} */ (queueItem.id))?.productionCost ?? 0;
  }
  return getUnitDefinition(/** @type {"warrior"|"settler"|"spearman"|"archer"} */ (queueItem.id))?.productionCost ?? 0;
}

function formatQueueItemLabel(queueItem) {
  return capitalizeLabel(queueItem.id);
}

function getTechName(techId) {
  return TECH_TREE[techId]?.name ?? capitalizeLabel(techId);
}

function capitalizeLabel(value) {
  if (!value) {
    return "";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}
