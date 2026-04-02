import { TECH_TREE } from "../core/techTree.js";
import { getAllUnitTypes, getUnitDefinition } from "../core/unitData.js";
import {
  CITY_QUEUE_MAX,
  canFoundCity,
  canRushBuyCityQueueFront,
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
 *     cityProductionProgress: number,
 *     cityLocalProduction: number,
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
 *       etaTurns: number,
 *       hoverText: string
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
 *       etaTurns: number,
 *       hoverText: string
 *     }>,
 *     disabledActionHints: Record<string, string>
 *   }
 * }}
 */
export function deriveUiSurface(gameState, selectedUnit, selectedCity, attackableTargets, attackableCities, uiContext = {}) {
  const playerOwner = gameState.factions?.playerOwner ?? "player";
  const isPlayerTurn = gameState.turnState.phase === "player" && gameState.match.status === "ongoing";
  const foundCityCheck = selectedUnit ? canFoundCity(selectedUnit.id, gameState) : { ok: false, reason: "unit-not-found" };
  const canFound = !!selectedUnit && foundCityCheck.ok;
  const foundCityReason = canFound ? null : getFoundCityReasonText(foundCityCheck.reason);
  const skipCheck = selectedUnit ? canSkipUnit(selectedUnit.id, gameState) : { ok: false, reason: "unit-not-found" };
  const canSkip = !!selectedUnit && skipCheck.ok;
  const skipUnitReason = canSkip ? null : getSkipUnitReasonText(skipCheck.reason);
  const selectedPlayerCity = !!selectedCity && selectedCity.owner === playerOwner;
  const selectedPlayerUnit = !!selectedUnit && selectedUnit.owner === playerOwner;
  const unlockedUnits = new Set(gameState.unlocks.units);
  const cityEconomyBucket = selectedCity ? gameState.economy[selectedCity.owner] : gameState.economy[playerOwner];
  const queueItems = selectedPlayerCity ? normalizeQueueItems(selectedCity.queue) : [];
  const cityProductionTab = selectedPlayerCity && selectedCity.productionTab === "buildings" ? "buildings" : "units";
  const queuedBuildingIds = new Set(queueItems.filter((item) => item.kind === "building").map((item) => item.id));
  const builtBuildingIds = new Set(selectedPlayerCity ? selectedCity.buildings ?? [] : []);
  const isQueueFull = selectedPlayerCity ? queueItems.length >= CITY_QUEUE_MAX : false;
  const productionProgress = selectedPlayerCity ? Math.max(0, selectedCity.productionProgress ?? 0) : 0;
  const localProduction = selectedPlayerCity ? Math.max(0, selectedCity.yieldLastTurn?.production ?? 0) : 0;
  const localFood = selectedPlayerCity ? Math.max(0, selectedCity.yieldLastTurn?.food ?? 0) : 0;
  const growthThreshold = selectedPlayerCity ? Math.max(1, 8 + (Math.max(1, selectedCity.population) - 1) * 4) : 1;
  const growthRemaining = selectedPlayerCity ? Math.max(0, growthThreshold - Math.max(0, selectedCity.growthProgress ?? 0)) : 0;
  const goldBalance = cityEconomyBucket?.goldBalance ?? 0;
  const productionRate = Math.max(1, localProduction);
  const rushBuyCheck = selectedPlayerCity ? canRushBuyCityQueueFront(selectedCity.id, gameState) : { ok: false, reason: "city-not-selected" };
  const disabledUnitIds = new Set(cityEconomyBucket?.disabledUnitIds ?? []);
  const selectedUnitDisabled = !!selectedUnit && disabledUnitIds.has(selectedUnit.id);
  const queueFront = queueItems[0] ?? null;
  const queueFrontCost = queueFront ? getQueueItemCost(queueFront) : 0;
  const queueFrontRemaining = queueFront ? Math.max(0, queueFrontCost - productionProgress) : 0;

  const cityProductionChoices = getAllUnitTypes().map((type) => {
    const definition = getUnitDefinition(/** @type {any} */ (type));
    const cost = definition.productionCost;
    const unlocked = unlockedUnits.has(type);
    const affordable = productionProgress >= cost;
    const queueable = selectedPlayerCity && !isQueueFull && unlocked;
    const reason = getUnitQueueReason({
      selectedPlayerCity,
      isQueueFull,
      unlocked,
      unlockTechId: definition.unlockedByTech ?? null,
    });
    const etaTurns = computeEtaTurns(cost, 0, productionRate);
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
      etaTurns,
      hoverText: buildProductionChoiceHoverText({
        label: capitalizeLabel(type),
        cost,
        etaTurns,
        productionProgress,
        localProduction,
        reasonText: reason.text,
      }),
    };
  });

  const cityBuildingChoices = getAllProductionBuildings().map((id) => {
    const definition = getBuildingDefinition(id);
    const cost = definition?.productionCost ?? 0;
    const unlocked = isBuildingUnlocked(id, gameState);
    const alreadyBuilt = builtBuildingIds.has(id);
    const alreadyQueued = queuedBuildingIds.has(id);
    const missingCampus = !!definition?.requiresCampus && !builtBuildingIds.has("campus");
    const missingRequiredBuilding =
      (definition?.requiredBuildings ?? []).find((required) => !builtBuildingIds.has(required)) ?? null;
    const affordable = productionProgress >= cost;
    const queueable =
      selectedPlayerCity &&
      !isQueueFull &&
      unlocked &&
      !alreadyBuilt &&
      !alreadyQueued &&
      !missingCampus &&
      !missingRequiredBuilding;
    const reason = getBuildingQueueReason({
      selectedPlayerCity,
      isQueueFull,
      unlocked,
      alreadyBuilt,
      alreadyQueued,
      missingCampus,
      missingRequiredBuilding,
      unlockTechId: definition?.unlockedByTech ?? null,
    });
    const etaTurns = computeEtaTurns(cost, 0, productionRate);
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
      etaTurns,
      hoverText: buildProductionChoiceHoverText({
        label: capitalizeLabel(id),
        cost,
        etaTurns,
        productionProgress,
        localProduction,
        reasonText: reason.text,
      }),
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

  const canQueueUnits = selectedPlayerCity && !isQueueFull && hasUnlockedUnits;
  const canQueueBuildings = selectedPlayerCity && !isQueueFull && hasQueueableBuildings;
  const canQueueProduction = cityProductionTab === "units" ? canQueueUnits : canQueueBuildings;
  const contextMenuType = isPlayerTurn && selectedPlayerCity ? "city" : isPlayerTurn && selectedPlayerUnit ? "unit" : null;

  const cityQueueSlots = buildQueueSlots({
    queueItems,
    productionProgress,
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
    rushBuyReason: rushBuyCheck.ok ? null : getRushBuyReasonText(rushBuyCheck.reason),
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
    uiHints.primary = "Start a new game or cancel to keep playing.";
    uiHints.level = "info";
  } else if (gameState.match.status !== "ongoing") {
    uiHints.primary = "Match ended. Start a new game to play again.";
    uiHints.level = "info";
  } else if (gameState.turnState.phase === "enemy") {
    uiHints.primary = "AI factions are taking their turn.";
    uiHints.level = "info";
  } else if (selectedUnit?.type === "settler") {
    if (canFound) {
      uiHints.primary = "Found city now (Found City button or F).";
      uiHints.secondary = "After founding, use the city panel to manage production queue.";
      uiHints.level = "info";
    } else {
      uiHints.primary = foundCityReason;
      uiHints.level = "warning";
    }
  } else if (selectedCity) {
    uiHints.primary = `City selected: identity ${selectedCity.identity}.`;
    uiHints.secondary = canQueueProduction
      ? "Hover unit/building buttons to inspect production cost, estimated turns, and requirements."
      : (cityQueueReason ?? "Use the city production panel and right-side city queue to manage this city.");
    uiHints.level = "info";
  } else if (selectedUnitDisabled) {
    uiHints.primary = "Selected unit is disabled by gold deficit.";
    uiHints.secondary = "Increase gold balance to reactivate disabled units.";
    uiHints.level = "warning";
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
      cityProductionProgress: productionProgress,
      cityLocalProduction: localProduction,
      cityLocalFood: localFood,
      cityGrowthProgress: selectedPlayerCity ? Math.max(0, selectedCity.growthProgress ?? 0) : 0,
      cityGrowthThreshold: growthThreshold,
      cityGrowthRemaining: growthRemaining,
      cityQueueFrontRemainingProduction: queueFrontRemaining,
      cityGoldBalance: goldBalance,
      canRushBuyCityQueueFront: !!rushBuyCheck.ok,
      cityRushBuyCost: rushBuyCheck.ok ? rushBuyCheck.goldCost ?? 0 : 0,
      cityRushBuyRemainingProduction: rushBuyCheck.ok ? rushBuyCheck.remainingProduction ?? 0 : queueFrontRemaining,
      cityRushBuyReason: rushBuyCheck.ok ? null : getRushBuyReasonText(rushBuyCheck.reason),
      cityQueueSlots,
      cityProductionChoices,
      cityBuildingChoices,
      disabledUnitIds: [...disabledUnitIds],
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

function getBuildingQueueReason({
  selectedPlayerCity,
  isQueueFull,
  unlocked,
  alreadyBuilt,
  alreadyQueued,
  missingCampus,
  missingRequiredBuilding,
  unlockTechId,
}) {
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
  if (missingCampus) {
    return {
      code: "missing-campus",
      text: "Requires a Campus in this city first.",
      tag: "Requires Campus",
    };
  }
  if (missingRequiredBuilding) {
    return {
      code: "missing-building-prerequisite",
      text: `Requires ${capitalizeLabel(missingRequiredBuilding)} first.`,
      tag: "Prereq",
    };
  }
  return { code: null, text: null, tag: null };
}

function buildQueueSlots({ queueItems, productionProgress, productionRate, selectedPlayerCity }) {
  const slots = [];
  let runningProgress = Math.max(0, productionProgress);

  for (let index = 0; index < CITY_QUEUE_MAX; index += 1) {
    const queueItem = queueItems[index] ?? null;
    if (!queueItem) {
      slots.push({
        index,
        empty: true,
        kind: null,
        id: null,
        label: "Empty",
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
    const etaTurns = computeEtaTurns(cost, runningProgress, productionRate);
    const requiredTurns = etaTurns;
    runningProgress = Math.max(0, runningProgress + requiredTurns * productionRate - cost);

    const label = formatQueueItemLabel(queueItem);
    slots.push({
      index,
      empty: false,
      kind: queueItem.kind,
      id: queueItem.id,
      label,
      cost,
      progress: index === 0 ? productionProgress : 0,
      etaTurns,
      statusTag: etaTurns === 0 ? "Ready" : formatTurnsLabel(etaTurns),
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
  rushBuyReason,
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
    }
  }

  for (const choice of cityBuildingChoices) {
    const actionId = `city-enqueue-building-${choice.id}`;
    if (choice.reasonText) {
      hints[actionId] = choice.reasonText;
    }
  }

  if (rushBuyReason) {
    hints["city-rush-buy"] = rushBuyReason;
  }

  for (const slot of cityQueueSlots) {
    const moveUpAction = `city-queue-move-up-${slot.index}`;
    const moveDownAction = `city-queue-move-down-${slot.index}`;
    const removeAction = `city-queue-remove-${slot.index}`;
    if (!slot.canMoveUp) {
      hints[moveUpAction] = slot.empty ? "Queue slot is empty." : "This item is already in the left-most slot.";
    }
    if (!slot.canMoveDown) {
      hints[moveDownAction] = slot.empty ? "Queue slot is empty." : "This item is already in the right-most slot.";
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

function getRushBuyReasonText(reason) {
  if (!reason) {
    return null;
  }
  if (reason === "city-not-found" || reason === "city-not-selected") {
    return "Select one of your cities to rush-buy the front queue item.";
  }
  if (reason === "queue-empty") {
    return "Queue is empty. Add an item before rush-buying.";
  }
  if (reason === "not-enough-gold") {
    return "Not enough gold to rush-buy this item.";
  }
  if (reason === "no-spawn-hex") {
    return "No valid spawn hex available for this unit.";
  }
  return "Rush-buy is unavailable right now.";
}

function buildProductionChoiceHoverText({ label, cost, etaTurns, productionProgress, localProduction, reasonText }) {
  const lines = [
    `${label}`,
    `Production Cost: ${cost} | Estimated Turns: ${formatTurnsLabel(etaTurns)}`,
    `Current Production Progress: ${productionProgress} | Local Production Per Turn: +${localProduction}`,
  ];
  if (reasonText) {
    lines.push(reasonText);
  }
  return lines.join("\n");
}

function formatTurnsLabel(turns) {
  const normalized = Math.max(0, Number.isFinite(turns) ? Math.round(turns) : 0);
  return normalized === 1 ? "1 turn" : `${normalized} turns`;
}

function getQueueItemCost(queueItem) {
  if (queueItem.kind === "building") {
    return getBuildingDefinition(
      /** @type {"granary"|"workshop"|"monument"|"campus"|"library"|"university"|"researchLab"} */ (queueItem.id)
    )?.productionCost ?? 0;
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
